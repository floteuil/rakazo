import type { InferenceMode, InferenceUsageTag } from "@rakazo/contracts";

export type { InferenceMode, InferenceUsageTag };

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
export const SUBAGENT_DELEGATION_TOOL_NAMES = [
  "spawn_subagent",
  "delegate_task",
  "child_bot_spawn",
  "create_child_agent",
  "run_subagent",
  "spawn_bot",
  "archive_bot",
  "delete_bot",
] as const;

export const DELEGATION_NAMES_SET = new Set([
  "spawn_subagent",
  "delegate_task",
  "child_bot_spawn",
  "create_child_agent",
  "run_subagent",
  "spawn_bot",
  "archive_bot",
  "delete_bot",
]);

export class SubagentExecutor {
  /**
   * Spawns an isolated subagent execution context inheriting the parent's inference mode,
   * enforcing a strict max depth of 1, an 8,192 token ceiling, and stripping delegation tools.
   */
  public spawnSubagent(request: SubagentSpawnRequest): SubagentExecutionContext {
    const parentDepth = request.parentBot.depth ?? 0;
    const newDepth = parentDepth + 1;

    if (newDepth > SUBAGENT_MAX_DEPTH) {
      throw new Error(
        `Subagent recursion depth ${newDepth} exceeds maximum allowed depth ${SUBAGENT_MAX_DEPTH}`,
      );
    }

    // Privilege escalation veto: if parent is "free", subagent is strictly forced to "free"
    let resolvedMode: InferenceMode = request.parentBot.inferenceMode;
    if (request.parentBot.inferenceMode === "free") {
      resolvedMode = "free";
    } else if (request.requestedInferenceMode) {
      resolvedMode = request.requestedInferenceMode;
    }

    const resolvedTags = (request.requestedUsageTags ?? request.parentBot.usageTags ?? []).slice(
      0,
      3,
    );

    const parentTools = request.parentBot.tools ?? [
      "web_search",
      "web_scrape",
      "spawn_subagent",
      "delegate_task",
      "bash_exec",
    ];

    const sanitizedTools = parentTools.filter((tool) => !DELEGATION_NAMES_SET.has(tool));

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

  /**
   * Assembles a byte-stable 4-block cache prompt for subagents.
   */
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

  /**
   * Enforces the 8,192 token ceiling on subagent prompts and context.
   */
  public validateTokenBudget(promptTokenCount: number): void {
    if (promptTokenCount > SUBAGENT_TOKEN_BUDGET_CEILING) {
      throw new Error(
        `Subagent token budget exceeded: ${promptTokenCount} tokens > ${SUBAGENT_TOKEN_BUDGET_CEILING} limit.`,
      );
    }
  }
}
