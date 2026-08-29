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

  constructor(options: FreeOmniRouteAdapterOptions = {}) {
    const rawUrl = options.baseUrl || process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:8080/v1";
    this.baseUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey ?? (process.env.OMNIROUTE_API_KEY || "");
    this.defaultModel = options.defaultModel || "meta-llama/llama-3.3-70b-instruct:free";
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
    this.policyEngine = new RakazoFreePolicyEngine();
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
      capabilities: { streaming: true, compaction: false, tools: true, scripted: false },
    };
  }

  public async abort(runId: string): Promise<void> {
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
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
        if (this.avoidedProviders.has(providerHeader) || !this.approvedProviders.has(providerHeader)) {
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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
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
        if (this.avoidedProviders.has(providerHeader) || !this.approvedProviders.has(providerHeader)) {
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
    const controller = new AbortController();
    runningRuntimes.set(request.runId, controller);
    const signal = context.signal ?? controller.signal;

    try {
      if (signal.aborted) {
        yield { type: "done", text: "aborted" };
        return;
      }

      const messages: OmniRouteChatMessage[] = [];
      if (request.instructions && request.instructions.trim().length > 0) {
        messages.push({ role: "system", content: request.instructions });
      }
      if (request.history && request.history.length > 0) {
        for (const msg of request.history) {
          messages.push({
            role: msg.role === "system" ? "system" : msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          });
        }
      }
      if (request.prompt && request.prompt.trim().length > 0) {
        messages.push({ role: "user", content: request.prompt });
      }

      const formattedTools = (request.tools || []).map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description || "",
          parameters: (t as any).parameters ?? t.inputSchema ?? { type: "object", properties: {} },
        },
      }));

      const modelId = request.model?.id || this.defaultModel;
      this.policyEngine.vetoPaidFallback(modelId);

      let accumulatedContent = "";
      const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      yield { type: "progress", text: "En cours d'inférence gratuite..." };

      for await (const chunk of this.stream({
        model: modelId,
        messages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
        signal,
      })) {
        if (chunk.content) {
          accumulatedContent += chunk.content;
          yield { type: "text", text: chunk.content };
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          for (const tc of chunk.toolCalls) {
            const index = tc.index ?? 0;
            if (!pendingToolCalls[index]) {
              pendingToolCalls[index] = {
                id: tc.id || `${request.runId}:tool_${index}`,
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              };
            } else {
              if (tc.id) pendingToolCalls[index].id = tc.id;
              if (tc.function?.name) pendingToolCalls[index].name += tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[index].arguments += tc.function.arguments;
            }
          }
        }
      }

      for (const tc of pendingToolCalls) {
        if (!tc || !tc.name) continue;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments || "{}");
        } catch {
          parsedArgs = {};
        }

        yield {
          type: "tool",
          name: tc.name,
          args: parsedArgs,
          executionId: tc.id,
        };

        if (request.executeTool) {
          try {
            await request.executeTool(tc.name, parsedArgs, tc.id);
          } catch {
            // Silently continue or capture
          }
        }
      }

      yield {
        type: "usage",
        inputTokens: Math.ceil((request.instructions.length + request.prompt.length) / 4),
        outputTokens: Math.ceil(accumulatedContent.length / 4),
        provider: "omniroute",
        model: modelId,
      };

      yield { type: "done", text: accumulatedContent };
    } finally {
      controller.abort();
      runningRuntimes.delete(request.runId);
    }
  }
}
