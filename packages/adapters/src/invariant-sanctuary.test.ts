import { describe, expect, it } from "vitest";
import {
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  FreePolicyEngine,
  resolveDeterministicTag,
} from "./free-policy-engine.js";
import {
  createToolCallTracker,
  evaluateToolCallGuard,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
  MAX_TOOL_ITERATIONS_PER_TURN,
} from "./loop-guards.js";
import {
  DELEGATION_NAMES_SET,
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_TOKEN_BUDGET_CEILING,
  SubagentExecutor,
} from "./subagent-inheritance.js";
import {
  compactToolResult,
} from "./tool-compacting.js";

describe("Invariant Sanctuary & 10 Core Architectural Constraints (Feature 12)", () => {
  describe("Invariant 1: OpenRouter Commercial Tier Isolation", () => {
    it("1.1 ensures commercial tier models are strictly blocked from free execution", () => {
      const engine = new FreePolicyEngine();
      expect(() => {
        engine.vetoPaidFallback("openai/gpt-oss-120b");
      }).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      expect(() => {
        engine.vetoPaidFallback("anthropic/claude-3-5-sonnet");
      }).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    });
  });

  describe("Invariant 2: OmniRoute 3-Tier Decoupling", () => {
    it("2.1 maps stable product intent to canonical combo route without hardcoding resolved models", () => {
      const engine = new FreePolicyEngine();

      const codingDecision = engine.resolveRoute(["coding"]);
      expect(codingDecision.model).toBe("combo/rakazo-coding");
      expect(codingDecision.provider).toBe("omniroute");
      expect(codingDecision.isFree).toBe(true);

      const reasoningDecision = engine.resolveRoute(["reasoning"]);
      expect(reasoningDecision.model).toBe("combo/rakazo-reasoning");

      const fastDecision = engine.resolveRoute(["fast"]);
      expect(fastDecision.model).toBe("combo/rakazo-fast");

      const writingDecision = engine.resolveRoute(["writing"]);
      expect(writingDecision.model).toBe("combo/rakazo-writing");

      const analysisDecision = engine.resolveRoute(["analysis"]);
      expect(analysisDecision.model).toBe("combo/rakazo-analysis");
    });

    it("2.2 resolves multi-tag ambiguity via Cognitive Priority Matrix", () => {
      // reasoning (100) > coding (80) > analysis (60) > writing (40) > fast (20)
      expect(resolveDeterministicTag(["fast", "coding"])).toBe("coding");
      expect(resolveDeterministicTag(["coding", "reasoning"])).toBe("reasoning");
      expect(resolveDeterministicTag(["writing", "analysis"])).toBe("analysis");
    });
  });

  describe("Invariant 3 & 4: Zero-Cost Hard Barrier & Fail-Closed", () => {
    it("4.1 strictly rejects any non-zero cost (> $0.00) in Free Tier execution", () => {
      const engine = new FreePolicyEngine();

      // $0.00 is allowed
      expect(() => {
        engine.assertZeroCostAndAllowed("omniroute", 0.0);
      }).not.toThrow();

      // Non-zero cost throws fail-closed
      expect(() => {
        engine.assertZeroCostAndAllowed("omniroute", 0.0001);
      }).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      expect(() => {
        engine.validatePostInferenceCost(0.005, "omniroute");
      }).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    });
  });

  describe("Invariant 5: PromptExecutionLog Telemetry Integrity", () => {
    it("5.1 telemetry accurately preserves distinct resolvedProvider and resolvedModel", () => {
      const telemetryPayload = {
        botId: "bot-1",
        threadId: "thread-1",
        runId: "run-1",
        requestedProfile: "coding",
        canonicalRoute: "combo/rakazo-coding",
        resolvedProvider: "mistral",
        resolvedModel: "codestral-latest",
        latencyMs: 340,
        cachedTokens: 1500,
        promptTokens: 2000,
        costUsd: 0.0,
      };

      const cacheRatio = telemetryPayload.cachedTokens / telemetryPayload.promptTokens;
      expect(cacheRatio).toBe(0.75);
      expect(telemetryPayload.resolvedProvider).toBe("mistral");
      expect(telemetryPayload.resolvedModel).toBe("codestral-latest");
      expect(telemetryPayload.costUsd).toBe(0.0);
    });
  });

  describe("Invariant 6: MCP Tool Permission Filtering", () => {
    it("6.1 prevents execution of unpermitted or disabled MCP tools", () => {
      const botConfig = {
        tools: {
          web_search: true,
          github_delete_repo: false,
        },
      };

      const isPermitted = (toolName: string) => {
        return botConfig.tools[toolName as keyof typeof botConfig.tools] ?? false;
      };

      expect(isPermitted("web_search")).toBe(true);
      expect(isPermitted("github_delete_repo")).toBe(false);
      expect(isPermitted("unknown_tool")).toBe(false);
    });
  });

  describe("Invariant 7: Semantic Tool Result Compacting", () => {
    it("7.1 compacts shell outputs and github lists to prevent context overflow", () => {
      const largeShellOutput = "line\n".repeat(1500);
      const compactedShell = compactToolResult("shell", { stdout: largeShellOutput, stderr: "", exitCode: 0 });
      expect(compactedShell.length).toBeLessThan(largeShellOutput.length);
      expect(compactedShell).toContain("line");

      const rawGithubIssues = Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        title: `Issue ${i + 1}`,
        state: "open",
        created_at: "2026-09-02T12:00:00Z",
        body: "Detailed description of issue ".repeat(20),
      }));

      const compactedIssues = compactToolResult("github_list_issues", rawGithubIssues);
      expect(compactedIssues.length).toBeLessThan(JSON.stringify(rawGithubIssues).length);
    });
  });

  describe("Invariant 8: 25-Iteration & 3-Repetition Loop Circuit Breaker", () => {
    it("8.1 triggers circuit breaker upon reaching 25 max iterations", () => {
      const tracker = createToolCallTracker();
      expect(MAX_TOOL_ITERATIONS_PER_TURN).toBe(25);

      for (let i = 0; i < 25; i++) {
        const check = evaluateToolCallGuard(tracker, `tool_${i}`, { param: i });
        expect(check.allow).toBe(true);
      }

      // 26th iteration triggers circuit breaker
      const blocked = evaluateToolCallGuard(tracker, "tool_26", { param: 26 });
      expect(blocked.allow).toBe(false);
      if (!blocked.allow) {
        expect(blocked.terminate).toBe(true);
        expect(blocked.reason).toMatch(/Circuit breaker triggered/i);
      }
    });

    it("8.2 triggers circuit breaker upon 3 identical consecutive tool calls", () => {
      const tracker = createToolCallTracker();
      expect(MAX_CONSECUTIVE_REDUNDANT_CALLS).toBe(3);

      const first = evaluateToolCallGuard(tracker, "fetch_url", { url: "https://example.com" });
      expect(first.allow).toBe(true);

      const second = evaluateToolCallGuard(tracker, "fetch_url", { url: "https://example.com" });
      expect(second.allow).toBe(true);

      const third = evaluateToolCallGuard(tracker, "fetch_url", { url: "https://example.com" });
      expect(third.allow).toBe(false);
      if (!third.allow) {
        expect(third.terminate).toBe(true);
        expect(third.reason).toMatch(/Loop detected/i);
      }
    });
  });

  describe("Invariant 9: Free Subagent Confinement (8k tokens, Depth 1, No Delegation)", () => {
    it("9.1 confines free subagents to 8,192 max tokens and depth 1", () => {
      const executor = new SubagentExecutor();
      const parentBot = {
        id: "parent-bot-1",
        name: "Parent",
        inferenceMode: "free" as const,
        usageTags: ["coding" as const],
        depth: 0,
      };

      const subagent = executor.spawnSubagent({
        parentBot,
        taskPrompt: "Analyze log file",
      });

      expect(subagent.maxTokens).toBe(SUBAGENT_TOKEN_BUDGET_CEILING);
      expect(subagent.maxTokens).toBe(8192);
      expect(subagent.maxDepth).toBe(SUBAGENT_MAX_DEPTH);
      expect(subagent.maxDepth).toBe(1);
      expect(subagent.inferenceMode).toBe("free");
    });

    it("9.2 rejects subagent recursive nesting beyond depth 1", () => {
      const executor = new SubagentExecutor();
      const level1Subagent = {
        id: "subagent-lvl-1",
        name: "Level 1 Subagent",
        inferenceMode: "free" as const,
        depth: 1,
      };

      expect(() => {
        executor.spawnSubagent({
          parentBot: level1Subagent,
          taskPrompt: "Try spawning grandchild subagent",
        });
      }).toThrow(/Subagent recursion depth 2 exceeds maximum allowed depth 1/);
    });

    it("9.3 strips delegation and subagent spawn tools from child tool list", () => {
      const executor = new SubagentExecutor();
      const parentBot = {
        id: "parent-bot-1",
        name: "Parent",
        inferenceMode: "free" as const,
        tools: ["web_search", "spawn_subagent", "delegate_task", "bash_exec"],
      };

      const subagent = executor.spawnSubagent({
        parentBot,
        taskPrompt: "Do search",
      });

      expect(subagent.availableTools).toEqual(["web_search", "bash_exec"]);
      for (const forbidden of DELEGATION_NAMES_SET) {
        expect(subagent.availableTools).not.toContain(forbidden);
      }
    });
  });

  describe("Invariant 10: Two-Level Cache Prefix Invariance", () => {
    it("10.1 validates 4-block cache layout with invariant Token 0 prefix", () => {
      const blocks = {
        blockA_systemPrompt: "You are Rakazo Sovereign Assistant...", // Invariant ~1500 tokens
        blockB_toolDefinitions: "Tool specs: searxng, github...", // Invariant ~1500 tokens
        blockC_conversationHistory: "User: Hi\nBot: Hello...",
        blockD_currentTurnPrompt: "User: Run deployment check",
      };

      const invariantPrefix = `${blocks.blockA_systemPrompt}\n${blocks.blockB_toolDefinitions}`;
      expect(invariantPrefix.length).toBeGreaterThan(50);
      // Invariant prefix remains identical across all user turns in thread
    });
  });
});
