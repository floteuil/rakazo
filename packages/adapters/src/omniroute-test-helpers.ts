// ============================================================================
// SHARED TYPES FOR OMNIROUTE E2E AND TEST SUITES
// ============================================================================

export type InferenceMode = "premium" | "free";
export type InferenceUsageTag = "coding" | "writing" | "reasoning" | "fast" | "analysis";

export interface BotInferenceConfig {
  mode: InferenceMode;
  tags: InferenceUsageTag[];
}

export interface PromptExecutionLogInput {
  runId: string;
  workerId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  inferenceMode?: InferenceMode;
  requestedCategory?: string | null;
  resolvedProvider?: string | null;
  resolvedModel?: string | null;
  isFree?: boolean;
}

// ============================================================================
// 1. ADAPTER TYPES & REFERENCE IMPLEMENTATION
// ============================================================================
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

export class ReferenceFreeOmniRouteAdapter {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    defaultModel?: string;
    timeoutMs?: number;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel || "meta-llama/llama-3.3-70b-instruct:free";
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  public async complete(options: OmniRouteChatOptions): Promise<OmniRouteResponse> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: options.messages,
          tools: options.tools,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const costHeader = response.headers.get("x-omniroute-cost");
      if (costHeader && Number.parseFloat(costHeader) > 0.000001) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];
      return {
        id: data.id || "chatcmpl-unknown",
        content: choice?.message?.content || "",
        toolCalls: choice?.message?.tool_calls || [],
        model: data.model || this.defaultModel,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(
          "Request aborted or timed out: Capacité gratuite temporairement indisponible",
        );
      }
      if (err.message.includes("Capacité gratuite temporairement indisponible")) {
        throw err;
      }
      throw new Error("Capacité gratuite temporairement indisponible");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async *stream(
    options: OmniRouteChatOptions,
  ): AsyncGenerator<OmniRouteStreamChunk, void, unknown> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: options.messages,
          tools: options.tools,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const costHeader = response.headers.get("x-omniroute-cost");
      if (costHeader && Number.parseFloat(costHeader) > 0.000001) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      if (!response.body) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (controller.signal.aborted || options.signal?.aborted) {
          throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (controller.signal.aborted || options.signal?.aborted) {
            throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
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
              if (parsed.pricing && (parsed.pricing.prompt > 0 || parsed.pricing.completion > 0)) {
                throw new Error("Capacité gratuite temporairement indisponible");
              }
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                yield {
                  content: delta.content,
                  toolCalls: delta.tool_calls,
                  raw: parsed,
                };
                if (controller.signal.aborted || options.signal?.aborted) {
                  throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
                }
              }
            } catch (err: any) {
              if (err.message.includes("Capacité gratuite temporairement indisponible")) {
                throw err;
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
      }
      if (err.message.includes("Capacité gratuite temporairement indisponible")) {
        throw err;
      }
      throw new Error("Capacité gratuite temporairement indisponible");
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// 2. FREE POLICY ENGINE & BARRIER
// ============================================================================
export interface FreeRouteDecision {
  provider: string;
  model: string;
  isFree: true;
  costPerToken: number;
  category: InferenceUsageTag | "general";
}

export const APPROVED_FREE_PROVIDERS = [
  "meta-llama",
  "mistralai",
  "qwen",
  "deepseek",
  "google",
] as const;

export const AVOIDED_PROVIDERS = [
  "unapproved_commercial_proxy",
  "unknown_vendor",
  "tos_violating_mirror",
] as const;

export class ReferenceRakazoFreePolicyEngine {
  private approvedProviders = new Set<string>(APPROVED_FREE_PROVIDERS);
  private avoidedProviders = new Set<string>(AVOIDED_PROVIDERS);

  private tagToModelMap: Record<InferenceUsageTag, { provider: string; model: string }> = {
    coding: {
      provider: "qwen",
      model: "qwen/qwen-2.5-coder-32b-instruct:free",
    },
    reasoning: {
      provider: "deepseek",
      model: "deepseek/deepseek-r1:free",
    },
    writing: {
      provider: "mistralai",
      model: "mistralai/mistral-small-24b-instruct:free",
    },
    fast: {
      provider: "meta-llama",
      model: "meta-llama/llama-3.2-3b-instruct:free",
    },
    analysis: {
      provider: "qwen",
      model: "qwen/qwen-2.5-72b-instruct:free",
    },
  };

  private defaultRoute: { provider: string; model: string } = {
    provider: "meta-llama",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  };

  public resolveRoute(tags: InferenceUsageTag[] = []): FreeRouteDecision {
    if (!Array.isArray(tags)) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    if (tags.length === 0) {
      this.assertZeroCostAndAllowed(this.defaultRoute.provider, 0.0);
      return {
        provider: this.defaultRoute.provider,
        model: this.defaultRoute.model,
        isFree: true,
        costPerToken: 0.0,
        category: "general",
      };
    }

    const primaryTag = tags[0]!;
    const target = this.tagToModelMap[primaryTag];

    if (!target) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    this.assertZeroCostAndAllowed(target.provider, 0.0);

    return {
      provider: target.provider,
      model: target.model,
      isFree: true,
      costPerToken: 0.0,
      category: primaryTag,
    };
  }

  public assertZeroCostAndAllowed(provider: string, cost: number): void {
    if (cost !== 0.0 || cost > 0.00000001 || cost < 0) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    if (this.avoidedProviders.has(provider)) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    if (!this.approvedProviders.has(provider)) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }
  }

  public validatePostInferenceCost(reportedCost: number, provider: string): void {
    this.assertZeroCostAndAllowed(provider, reportedCost);
  }

  public vetoPaidFallback(intendedModel: string): void {
    if (!intendedModel.includes(":free") && !intendedModel.includes("free")) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }
  }
}

// ============================================================================
// 3. SUBAGENT INHERITANCE & GUARDRAILS
// ============================================================================
export interface BotContext {
  id: string;
  name: string;
  inferenceMode: InferenceMode;
  usageTags?: InferenceUsageTag[];
  tools?: string[];
  depth?: number;
}

export interface SubagentSpawnRequest {
  parentBot: BotContext;
  requestedInferenceMode?: InferenceMode;
  requestedUsageTags?: InferenceUsageTag[];
  taskPrompt: string;
  depth?: number;
}

export interface SubagentExecutionContext {
  botId: string;
  parentBotId: string;
  inferenceMode: InferenceMode;
  usageTags: InferenceUsageTag[];
  maxTokens: number;
  maxDepth: number;
  availableTools: string[];
  systemPrompt: string;
}

export const SUBAGENT_TOKEN_BUDGET_CEILING = 8192;
export const SUBAGENT_MAX_DEPTH = 1;
export const DELEGATION_TOOL_NAMES = [
  "spawn_subagent",
  "delegate_task",
  "child_bot_spawn",
  "create_child_agent",
] as const;

export class ReferenceSubagentExecutor {
  public spawnSubagent(request: SubagentSpawnRequest): SubagentExecutionContext {
    const parentDepth = request.parentBot.depth ?? 0;
    const newDepth = parentDepth + 1;

    if (newDepth > SUBAGENT_MAX_DEPTH) {
      throw new Error(
        `Subagent recursion depth ${newDepth} exceeds maximum allowed depth ${SUBAGENT_MAX_DEPTH}`,
      );
    }

    let resolvedMode: InferenceMode = request.parentBot.inferenceMode;
    if (request.parentBot.inferenceMode === "free") {
      resolvedMode = "free";
    } else if (request.requestedInferenceMode) {
      resolvedMode = request.requestedInferenceMode;
    }

    const resolvedTags = request.requestedUsageTags ?? request.parentBot.usageTags ?? [];

    const parentTools = request.parentBot.tools ?? [
      "web_search",
      "web_scrape",
      "spawn_subagent",
      "delegate_task",
      "bash_exec",
    ];

    const sanitizedTools = parentTools.filter(
      (tool) => !DELEGATION_TOOL_NAMES.includes(tool as any),
    );

    const systemPrompt = this.build4BlockSubagentPrompt({
      taskPrompt: request.taskPrompt,
      inferenceMode: resolvedMode,
      tools: sanitizedTools,
    });

    return {
      botId: `subagent-${Math.random().toString(36).substring(2, 9)}`,
      parentBotId: request.parentBot.id,
      inferenceMode: resolvedMode,
      usageTags: resolvedTags,
      maxTokens: SUBAGENT_TOKEN_BUDGET_CEILING,
      maxDepth: SUBAGENT_MAX_DEPTH,
      availableTools: sanitizedTools,
      systemPrompt,
    };
  }

  public build4BlockSubagentPrompt(params: {
    taskPrompt: string;
    inferenceMode: InferenceMode;
    tools: string[];
  }): string {
    const blockA =
      "[BLOCK_A_SYSTEM_INVARIANTS]\nYou are an isolated subagent. Follow safety and budget constraints.";
    const blockB = `[BLOCK_B_CAPABILITIES]\nInferenceMode: ${params.inferenceMode}\nTools: ${params.tools.join(", ")}`;
    const blockC = "[BLOCK_C_CONTEXT]\nSubagent execution scope: isolated task.";
    const blockD = `[BLOCK_D_TASK]\n${params.taskPrompt}`;

    return `${blockA}\n\n${blockB}\n\n${blockC}\n\n${blockD}`;
  }

  public validateTokenBudget(promptTokenCount: number): void {
    if (promptTokenCount > SUBAGENT_TOKEN_BUDGET_CEILING) {
      throw new Error(
        `Subagent token budget exceeded: ${promptTokenCount} tokens > ${SUBAGENT_TOKEN_BUDGET_CEILING} limit.`,
      );
    }
  }
}
