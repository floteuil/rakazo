import type {
  AdapterContext,
  AdapterDescriptor,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeCapabilities,
  AgentRuntimeEvent,
} from "@rakazo/adapter-kit";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  RakazoFreePolicyEngine,
} from "./free-policy-engine.js";
import { OmniRouteInferenceTransport } from "./omniroute-transport.js";
import { CanonicalAgentRuntime } from "./pi-runtime.js";
import { computeSessionAffinityKey } from "./prefix-caching.js";

export interface OmniRouteChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface OmniRouteChatOptions {
  model?: string;
  messages: OmniRouteChatMessage[];
  tools?: any[];
  stream?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  sessionId?: string;
  workspaceId?: string;
  botId?: string;
  threadId?: string;
}

export interface OmniRouteStreamChunk {
  content?: string;
  toolCalls?: any[];
  done?: boolean;
  raw?: any;
}

export interface OmniRouteResponse {
  id: string;
  content: string;
  toolCalls: any[];
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface FreeOmniRouteAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  timeoutMs?: number;
}

const runningRuntimes = new Map<string, AbortController>();

export class FreeOmniRouteAdapter implements AgentRuntime {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;
  private policyEngine: RakazoFreePolicyEngine;
  private approvedProviders = new Set<string>(APPROVED_FREE_PROVIDERS);
  private avoidedProviders = new Set<string>(AVOIDED_PROVIDERS);
  private canonicalRuntime: CanonicalAgentRuntime;

  constructor(options: FreeOmniRouteAdapterOptions = {}) {
    const rawUrl = options.baseUrl || process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:8080/v1";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? (process.env.OMNIROUTE_API_KEY || "");
    this.defaultModel = options.defaultModel || "combo/rakazo-fast";
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
    this.policyEngine = new RakazoFreePolicyEngine();
    this.canonicalRuntime = new CanonicalAgentRuntime({
      transport: new OmniRouteInferenceTransport({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        defaultModel: this.defaultModel,
        timeoutMs: this.defaultTimeoutMs,
      }),
    });
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  public describe(): AdapterDescriptor<AgentRuntimeCapabilities> {
    return {
      id: "omniroute",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { streaming: true, compaction: true, tools: true, scripted: false },
    };
  }

  public async abort(runId: string): Promise<void> {
    await this.canonicalRuntime.abort(runId);
    runningRuntimes.get(runId)?.abort();
  }

  public async complete(options: OmniRouteChatOptions): Promise<OmniRouteResponse> {
    const targetModel = options.model || this.defaultModel;
    this.policyEngine.vetoPaidFallback(targetModel);

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      let sessionId = options.sessionId;
      if (!sessionId && options.workspaceId && options.botId && options.threadId) {
        sessionId = computeSessionAffinityKey({
          workspaceId: options.workspaceId,
          botId: options.botId,
          threadId: options.threadId,
        });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      if (sessionId) {
        headers["x-session-id"] = sessionId;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: targetModel,
          messages: options.messages,
          tools: options.tools,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      const costHeader = response.headers.get("x-omniroute-cost");
      if (costHeader !== null && costHeader !== undefined) {
        const cost = Number.parseFloat(costHeader);
        if (Number.isNaN(cost) || cost > 0.000001 || cost < 0) {
          throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        }
      }

      const providerHeader = response.headers.get("x-omniroute-provider");
      if (providerHeader) {
        if (
          this.avoidedProviders.has(providerHeader) ||
          !this.approvedProviders.has(providerHeader)
        ) {
          throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        }
      }

      const data = (await response.json()) as any;
      if (
        data?.pricing &&
        (data.pricing.prompt > 0 || data.pricing.completion > 0 || data.pricing.total_cost > 0)
      ) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      const choice = data?.choices?.[0];
      return {
        id: data?.id || "chatcmpl-unknown",
        content: choice?.message?.content || "",
        toolCalls: choice?.message?.tool_calls || [],
        model: data?.model || targetModel,
        usage: data?.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw new Error(`Request aborted or timed out: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
      }
      if (err?.message?.includes(FREE_INFERENCE_UNAVAILABLE_MESSAGE)) {
        throw err;
      }
      throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async *stream(
    options: OmniRouteChatOptions,
  ): AsyncGenerator<OmniRouteStreamChunk, void, unknown> {
    const targetModel = options.model || this.defaultModel;
    this.policyEngine.vetoPaidFallback(targetModel);

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      let sessionId = options.sessionId;
      if (!sessionId && options.workspaceId && options.botId && options.threadId) {
        sessionId = computeSessionAffinityKey({
          workspaceId: options.workspaceId,
          botId: options.botId,
          threadId: options.threadId,
        });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      if (sessionId) {
        headers["x-session-id"] = sessionId;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: targetModel,
          messages: options.messages,
          tools: options.tools,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      const costHeader = response.headers.get("x-omniroute-cost");
      if (costHeader !== null && costHeader !== undefined) {
        const cost = Number.parseFloat(costHeader);
        if (Number.isNaN(cost) || cost > 0.000001 || cost < 0) {
          throw new Error(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
        }
      }

      const providerHeader = response.headers.get("x-omniroute-provider");
      if (providerHeader) {
        if (
          this.avoidedProviders.has(providerHeader) ||
          !this.approvedProviders.has(providerHeader)
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
        if (controller.signal.aborted || options.signal?.aborted) {
          throw new Error(`Request aborted: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (controller.signal.aborted || options.signal?.aborted) {
            throw new Error(`Request aborted: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
          }
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed === "data: [DONE]") {
            yield { done: true };
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
                yield {
                  content: delta.content,
                  toolCalls: delta.tool_calls,
                  raw: parsed,
                };
                if (controller.signal.aborted || options.signal?.aborted) {
                  throw new Error(`Request aborted: ${FREE_INFERENCE_UNAVAILABLE_MESSAGE}`);
                }
              }
            } catch (err: any) {
              if (err?.message?.includes(FREE_INFERENCE_UNAVAILABLE_MESSAGE)) {
                throw err;
              }
              // Skip malformed/corrupted chunks without crashing
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

  public async *run(
    request: AgentRunRequest,
    context: AdapterContext,
  ): AsyncIterable<AgentRuntimeEvent> {
    const runtime = new CanonicalAgentRuntime({
      transport: new OmniRouteInferenceTransport({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        defaultModel: request.model?.id || this.defaultModel,
        timeoutMs: this.defaultTimeoutMs,
      }),
    });
    yield* runtime.run(request, context);
  }
}
