import {
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  RakazoFreePolicyEngine,
} from "./free-policy-engine.js";
import type {
  InferenceTransport,
  InferenceTransportChunk,
  InferenceTransportRequest,
} from "./inference-transport.js";

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
    const rawUrl = options.baseUrl || process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:8080/v1";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? (process.env.OMNIROUTE_API_KEY || "");
    this.defaultModel = options.defaultModel || "combo/rakazo-fast";
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
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
          parameters: (t as any).parameters ?? t.inputSchema ?? { type: "object", properties: {} },
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
        response.headers.get("x-omniroute-response-cost") ?? response.headers.get("x-omniroute-cost");
      if (costHeader !== null && costHeader !== undefined) {
        const cost = Number.parseFloat(costHeader);
        if (Number.isNaN(cost) || cost > 0.000001 || cost < 0) {
          throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        }
      }

      const providerHeader = response.headers.get("x-omniroute-provider");
      if (providerHeader) {
        if (
          providerHeader === "unapproved_commercial_proxy" ||
          providerHeader === "unknown_vendor" ||
          providerHeader === "tos_violating_mirror"
        ) {
          throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        }
      }

      if (!response.body) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            return;
          }

          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (
                parsed?.pricing &&
                (parsed.pricing.prompt > 0 ||
                  parsed.pricing.completion > 0 ||
                  parsed.pricing.total_cost > 0)
              ) {
                throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
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

                yield {
                  type: "usage",
                  usage: {
                    inputTokens: promptTokens,
                    outputTokens: completionTokens,
                    cachedTokens,
                    totalTokens,
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
