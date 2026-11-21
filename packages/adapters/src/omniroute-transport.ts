import { sanitizeToolJsonSchemaDraft2020 } from "@rakazo/contracts";
import {
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  inferFreeProviderFromModel,
  RakazoFreePolicyEngine,
} from "./free-policy-engine.js";
import type {
  InferenceTransport,
  InferenceTransportChunk,
  InferenceTransportRequest,
} from "./inference-transport.js";
import { modelStreamTimeoutMs } from "./pi-runtime.js";

export interface OmniRouteTransportOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  timeoutMs?: number;
}

export class OmniRouteInferenceTransport implements InferenceTransport {
  public readonly id = "omniroute";
  public readonly isFree = true;

  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;
  private policyEngine: RakazoFreePolicyEngine;

  constructor(options: OmniRouteTransportOptions = {}) {
    const rawUrl =
      options.baseUrl ||
      process.env.OMNIROUTE_BASE_URL ||
      "http://localhost:8080/v1";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey =
      options.apiKey ?? (process.env.OMNIROUTE_API_KEY || "");
    this.defaultModel = options.defaultModel || "combo/rakazo-fast";
    this.defaultTimeoutMs = options.timeoutMs ?? modelStreamTimeoutMs(30000);
    this.policyEngine = new RakazoFreePolicyEngine();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  public async *stream(request: InferenceTransportRequest): AsyncIterable<InferenceTransportChunk> {
    const targetModel = request.model || this.defaultModel;
    this.policyEngine.vetoPaidFallback(targetModel);

    const timeoutMs = this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (request.signal) {
      if (request.signal.aborted) {
        controller.abort();
      } else {
        request.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(request.headers ?? {}),
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      if (request.sessionId) {
        headers["x-session-id"] = request.sessionId;
      }

      const formattedTools = (request.tools || []).map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description || "",
          parameters: sanitizeToolJsonSchemaDraft2020(
            (t as any).parameters ?? t.inputSchema ?? { type: "object", properties: {} },
          ),
        },
      }));

      const bodyPayload = {
        model: targetModel,
        messages: request.messages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      const costHeader =
        response.headers.get("x-omniroute-response-cost") ??
        response.headers.get("x-omniroute-cost");
      if (costHeader !== null && costHeader !== undefined) {
        const cost = Number.parseFloat(costHeader);
        if (Number.isNaN(cost) || !Number.isFinite(cost) || cost !== 0) {
          throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        }
      }

      const providerHeader = response.headers.get("x-omniroute-provider")?.trim() || undefined;
      const modelHeader = response.headers.get("x-omniroute-model")?.trim() || undefined;
      if (providerHeader) {
        this.policyEngine.assertZeroCostAndAllowed(
          providerHeader,
          costHeader !== null && costHeader !== undefined ? Number.parseFloat(costHeader) : 0.0,
        );
      }

      if (!response.body) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let emittedUsage = false;
      let lastChunkModel: string | undefined;

      while (true) {
        if (controller.signal.aborted || request.signal?.aborted) {
          throw new Error(`Request aborted: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (controller.signal.aborted || request.signal?.aborted) {
            throw new Error(`Request aborted: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
          }
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed === "data: [DONE]") {
            if (!emittedUsage && (providerHeader || modelHeader || lastChunkModel)) {
              const resolvedModel = modelHeader ?? lastChunkModel;
              const resolvedProvider =
                providerHeader ?? inferFreeProviderFromModel(resolvedModel) ?? "omniroute";
              emittedUsage = true;
              yield {
                type: "usage",
                usage: {
                  inputTokens: 0,
                  outputTokens: 0,
                  cachedTokens: 0,
                  totalTokens: 0,
                  resolvedProvider,
                  resolvedModel,
                },
              };
            }
            return;
          }

          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed?.id === "chatcmpl-keepalive" || parsed?.model === "keepalive") {
                continue;
              }
              if (typeof parsed?.model === "string" && parsed.model.trim()) {
                lastChunkModel = parsed.model.trim();
              }

              const chunkCost =
                parsed?.pricing?.total_cost ??
                parsed?.pricing?.cost ??
                parsed?.pricing?.prompt ??
                parsed?.pricing?.completion ??
                parsed?.usage?.cost ??
                parsed?.cost;
              if (chunkCost !== undefined && chunkCost !== null) {
                const numericCost = Number(chunkCost);
                if (Number.isNaN(numericCost) || !Number.isFinite(numericCost) || numericCost > 0) {
                  throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
                }
              }

              const delta = parsed?.choices?.[0]?.delta;
              if (delta) {
                if (delta.content) {
                  yield {
                    type: "text",
                    text: delta.content,
                  };
                }

                if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    yield {
                      type: "tool_call",
                      toolCall: {
                        id: tc.id,
                        index: tc.index,
                        name: tc.function?.name,
                        arguments: tc.function?.arguments,
                      },
                    };
                  }
                }
              }

              if (parsed?.usage) {
                const promptTokens = parsed.usage.prompt_tokens ?? 0;
                const completionTokens = parsed.usage.completion_tokens ?? 0;
                const cachedTokens =
                  parsed.usage.prompt_tokens_details?.cached_tokens ??
                  parsed.usage.cached_tokens ??
                  0;
                const totalTokens = parsed.usage.total_tokens ?? promptTokens + completionTokens;
                const resolvedModel = modelHeader ?? lastChunkModel;
                const resolvedProvider =
                  providerHeader ?? inferFreeProviderFromModel(resolvedModel) ?? "omniroute";
                emittedUsage = true;

                yield {
                  type: "usage",
                  usage: {
                    inputTokens: promptTokens,
                    outputTokens: completionTokens,
                    cachedTokens,
                    totalTokens,
                    resolvedProvider,
                    resolvedModel,
                  },
                };
              }
            } catch (err: any) {
              if (err?.message?.includes(FREE_INFERENCE_UNAVAILABLE_MESSAGE)) {
                throw err;
              }
              // Skip malformed SSE chunks
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error(`Request aborted: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
      }
      if (err?.message?.includes(FREE_INFERENCE_UNAVAILABLE_MESSAGE)) {
        throw err;
      }
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export interface OmniRouteHealthProbeResult {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  rakazoCombos: string[];
  totalModels: number;
}

interface CachedOmniRouteProbe {
  key: string;
  expiresAt: number;
  value: OmniRouteHealthProbeResult;
}

let cachedOmniRouteProbe: CachedOmniRouteProbe | null = null;

/**
 * Performs a zero-token, non-secret-exposing live readiness check against OmniRoute `/models`
 * with a 30-second in-memory cache so UI refreshes never overload the gateway.
 */
export async function probeOmniRouteHealth(options?: {
  baseUrl?: string;
  apiKey?: string;
  forceRefresh?: boolean;
  timeoutMs?: number;
}): Promise<OmniRouteHealthProbeResult> {
  const envUrl = options?.baseUrl ?? process.env.OMNIROUTE_BASE_URL ?? "";
  const configured = Boolean(envUrl.trim());
  if (!configured) {
    return {
      configured: false,
      ok: false,
      latencyMs: null,
      rakazoCombos: [],
      totalModels: 0,
    };
  }

  const baseUrl = envUrl.trim().replace(/\/+$/, "");
  const apiKey = (options?.apiKey ?? process.env.OMNIROUTE_API_KEY ?? "").trim();
  const cacheKey = `${baseUrl}:${apiKey.length}`;
  const now = Date.now();

  if (!options?.forceRefresh && cachedOmniRouteProbe && cachedOmniRouteProbe.key === cacheKey) {
    if (now < cachedOmniRouteProbe.expiresAt) {
      return cachedOmniRouteProbe.value;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 4000);
  const startedAt = performance.now();

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
    if (!response.ok) {
      const failed: OmniRouteHealthProbeResult = {
        configured: true,
        ok: false,
        latencyMs,
        rakazoCombos: [],
        totalModels: 0,
      };
      cachedOmniRouteProbe = { key: cacheKey, expiresAt: now + 10_000, value: failed };
      return failed;
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; owned_by?: string }>;
    };
    const models = Array.isArray(payload?.data) ? payload.data : [];
    const rakazoCombos = Array.from(
      new Set(
        models
          .map((m) => {
            const rawId = typeof m?.id === "string" ? m.id.trim() : "";
            if (rawId.startsWith("combo/rakazo-")) return rawId;
            if (rawId.startsWith("rakazo-")) return `combo/${rawId}`;
            return "";
          })
          .filter(Boolean),
      ),
    ).sort();

    const result: OmniRouteHealthProbeResult = {
      configured: true,
      ok: true,
      latencyMs,
      rakazoCombos,
      totalModels: models.length,
    };
    cachedOmniRouteProbe = { key: cacheKey, expiresAt: now + 30_000, value: result };
    return result;
  } catch {
    const failed: OmniRouteHealthProbeResult = {
      configured: true,
      ok: false,
      latencyMs: null,
      rakazoCombos: [],
      totalModels: 0,
    };
    cachedOmniRouteProbe = { key: cacheKey, expiresAt: now + 10_000, value: failed };
    return failed;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Computes a strictly boolean per-connector configuration map without exposing
 * any secret values, URLs, or credentials.
 */
export function getConnectorReadinessMap(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, boolean> {
  const has = (key: string) => Boolean(env[key]?.trim());
  return {
    searxng_scraperr: has("SEARXNG_URL") || has("SCRAPERR_URL"),
    github: has("GITHUB_TOKEN"),
    notion: has("NOTION_API_KEY"),
    postiz: has("POSTIZ_API_KEY"),
    wordpress_novamira:
      (has("WORDPRESS_URL") && has("WORDPRESS_APP_PASSWORD")) || has("NOVAMIRA_API_KEY"),
    windmill_autolite: has("WINDMILL_AUTOLITE_URL") && has("WINDMILL_AUTOLITE_TOKEN"),
    windmill_proxy: has("WINDMILL_PROXY_URL") && has("WINDMILL_PROXY_TOKEN"),
    cloudflare: has("CLOUDFLARE_API_TOKEN"),
    twenty_crm: has("TWENTY_API_URL") && has("TWENTY_API_KEY"),
    affine: has("AFFINE_BASE_URL"),
    context7: true, // Context7 works out-of-the-box with public endpoint + optional API key
    open_design: has("OPEN_DESIGN_DAEMON_URL"),
    image_optimizer: true, // In-process Sharp/Canvas media compressor
    qdrant: has("QDRANT_URL"),
    coolify: has("COOLIFY_API_URL") && has("COOLIFY_API_TOKEN"),
    flowise: has("FLOWISE_API_ENDPOINT"),
    pocketbase: has("POCKETBASE_URL"),
    ubersuggest: true, // Strictly hors-projet consultation engine
    system_platform: true, // Sandbox in-process runtime
  };
}
