import { describe, expect, it, vi } from "vitest";
import type { AgentRunRequest, AdapterContext } from "@rakazo/adapter-kit";
import {
  RakazoFreePolicyEngine,
  resolveDeterministicTag,
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  TAG_PRIORITY_WEIGHTS,
  VALID_TAGS,
} from "./free-policy-engine.js";
import {
  SubagentExecutor,
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_TOKEN_BUDGET_CEILING,
  DELEGATION_NAMES_SET,
  type BotContext,
  type SubagentSpawnRequest,
} from "./subagent-inheritance.js";
import {
  CanonicalAgentRuntime,
} from "./pi-runtime.js";
import {
  OmniRouteInferenceTransport,
} from "./omniroute-transport.js";
import {
  createToolCallTracker,
  evaluateToolCallGuard,
  computeToolCallSignature,
  MAX_TOOL_ITERATIONS_PER_TURN,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
} from "./loop-guards.js";
import { compactToolResult } from "./tool-compacting.js";
import type { InferenceTransport, InferenceTransportChunk, InferenceTransportRequest } from "./inference-transport.js";
import type { InferenceUsageTag } from "@rakazo/contracts";

function createMockContext(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    runId: "test-run",
    operationId: "op-1",
    traceId: "tr-1",
    workspaceId: "ws-1",
    userId: "usr-1",
    botId: "bot-1",
    signal: new AbortController().signal,
    ...overrides,
  };
}

function createMockRequest(overrides: Partial<AgentRunRequest> = {}): AgentRunRequest {
  return {
    botId: "bot-1",
    threadId: "th-1",
    runId: "test-run",
    instructions: "System instructions",
    prompt: "User prompt",
    history: [],
    tools: [],
    model: { provider: "omniroute", id: "combo/rakazo-fast" },
    ...overrides,
  };
}

describe("Empirical Challenger Suite - Milestone 3 (R3, R4, R5 Verification)", () => {

  // =========================================================================
  // REQUIREMENT 3 (R3): Live combo/rakazo-* routing & Cognitive Priority Matrix
  // =========================================================================
  describe("R3: Live combo/rakazo-* Routing & Deterministic Cognitive Priority", () => {
    const engine = new RakazoFreePolicyEngine();

    it("R3.1: All 5 primary intent profiles resolve to their expected combo/rakazo-* routes with $0 cost", () => {
      const intentMap: Record<InferenceUsageTag, string> = {
        coding: "combo/rakazo-coding",
        reasoning: "combo/rakazo-reasoning",
        writing: "combo/rakazo-writing",
        fast: "combo/rakazo-fast",
        analysis: "combo/rakazo-analysis",
      };

      for (const [tag, expectedModel] of Object.entries(intentMap) as [InferenceUsageTag, string][]) {
        const decision = engine.resolveRoute([tag]);
        expect(decision.model).toBe(expectedModel);
        expect(decision.provider).toBe("omniroute");
        expect(decision.isFree).toBe(true);
        expect(decision.costPerToken).toBe(0.0);
        expect(decision.category).toBe(tag);
      }
    });

    it("R3.2: Empty or undefined tags resolve to default combo/rakazo-fast (general category)", () => {
      const decision = engine.resolveRoute([]);
      expect(decision.model).toBe("combo/rakazo-fast");
      expect(decision.provider).toBe("omniroute");
      expect(decision.isFree).toBe(true);
      expect(decision.costPerToken).toBe(0.0);
      expect(decision.category).toBe("general");
    });

    it("R3.3: Strict Deterministic Cognitive Priority Matrix: reasoning (100) > coding (80) > analysis (60) > writing (40) > fast (20)", () => {
      // Test priority pairwise comparisons
      expect(resolveDeterministicTag(["fast", "writing"])).toBe("writing");
      expect(resolveDeterministicTag(["writing", "fast"])).toBe("writing");

      expect(resolveDeterministicTag(["writing", "analysis"])).toBe("analysis");
      expect(resolveDeterministicTag(["analysis", "writing"])).toBe("analysis");

      expect(resolveDeterministicTag(["analysis", "coding"])).toBe("coding");
      expect(resolveDeterministicTag(["coding", "analysis"])).toBe("coding");

      expect(resolveDeterministicTag(["coding", "reasoning"])).toBe("reasoning");
      expect(resolveDeterministicTag(["reasoning", "coding"])).toBe("reasoning");

      // Transitive combinations
      expect(resolveDeterministicTag(["fast", "analysis"])).toBe("analysis");
      expect(resolveDeterministicTag(["fast", "coding"])).toBe("coding");
      expect(resolveDeterministicTag(["fast", "reasoning"])).toBe("reasoning");
      expect(resolveDeterministicTag(["writing", "reasoning"])).toBe("reasoning");
      expect(resolveDeterministicTag(["analysis", "reasoning"])).toBe("reasoning");

      // Full permutations of all 5 tags in various shuffled orders
      const permutations: InferenceUsageTag[][] = [
        ["fast", "writing", "analysis", "coding", "reasoning"],
        ["reasoning", "coding", "analysis", "writing", "fast"],
        ["writing", "fast", "reasoning", "coding", "analysis"],
        ["coding", "analysis", "fast", "reasoning", "writing"],
        ["analysis", "writing", "reasoning", "fast", "coding"],
      ];

      for (const p of permutations) {
        expect(resolveDeterministicTag(p)).toBe("reasoning");
        const decision = engine.resolveRoute(p);
        expect(decision.model).toBe("combo/rakazo-reasoning");
        expect(decision.category).toBe("reasoning");
      }

      // 4-tag permutations without reasoning -> must resolve to coding
      const withoutReasoning: InferenceUsageTag[][] = [
        ["fast", "writing", "analysis", "coding"],
        ["coding", "analysis", "writing", "fast"],
        ["analysis", "coding", "fast", "writing"],
      ];
      for (const p of withoutReasoning) {
        expect(resolveDeterministicTag(p)).toBe("coding");
        const decision = engine.resolveRoute(p);
        expect(decision.model).toBe("combo/rakazo-coding");
        expect(decision.category).toBe("coding");
      }
    });

    it("R3.4: Fail-closed on invalid tags or non-array inputs", () => {
      expect(() => engine.resolveRoute(["invalid-tag" as any])).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.resolveRoute(["gpt-4" as any])).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.resolveRoute(null as any)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.resolveRoute("coding" as any)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    });
  });

  // =========================================================================
  // REQUIREMENT 4 (R4): Shared Canonical Turn Loop, Tool Execution, Compaction & Circuit Breakers
  // =========================================================================
  describe("R4: Shared Canonical Agentic Turn Loop & Loop Guards", () => {

    it("R4.1: CanonicalAgentRuntime correctly streams text and usage events from transport", async () => {
      const mockTransport: InferenceTransport = {
        id: "mock",
        isFree: true,
        stream: async function* () {
          yield { type: "text", text: "Hello " };
          yield { type: "text", text: "World!" };
          yield {
            type: "usage",
            usage: { inputTokens: 100, outputTokens: 25, cachedTokens: 50, totalTokens: 125 },
          };
        },
      };

      const runtime = new CanonicalAgentRuntime({ transport: mockTransport });
      const request = createMockRequest({
        runId: "test-run-1",
        model: { provider: "omniroute", id: "combo/rakazo-fast" },
        prompt: "Say hello",
      });
      const context = createMockContext({ runId: "test-run-1" });

      const events: any[] = [];
      for await (const event of runtime.run(request, context)) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: "progress", text: "En cours d'inférence gratuite…" },
        { type: "text", text: "Hello " },
        { type: "text", text: "World!" },
        {
          type: "usage",
          inputTokens: 100,
          outputTokens: 25,
          cachedTokens: 50,
          cacheHitRatio: 50 / 150, // cachedTokens / (cachedTokens + inputTokens)
          provider: "omniroute",
          model: "combo/rakazo-fast",
        },
        { type: "done", text: "Hello World!" },
      ]);
    });

    it("R4.2: CanonicalAgentRuntime executes full tool call loop with executeTool callback", async () => {
      let callStep = 0;
      const mockTransport: InferenceTransport = {
        id: "mock",
        isFree: false,
        stream: async function* (req: InferenceTransportRequest) {
          if (callStep === 0) {
            callStep++;
            yield {
              type: "tool_call",
              toolCall: {
                id: "call_1",
                name: "web_search",
                arguments: JSON.stringify({ query: "vitest documentation" }),
              },
            };
          } else {
            // Second turn receives the tool result in messages
            const lastMsg = req.messages[req.messages.length - 1];
            expect(lastMsg?.role).toBe("tool");
            expect(lastMsg?.content).toBe("Search results for vitest documentation");
            yield { type: "text", text: "Found the documentation." };
          }
        },
      };

      const runtime = new CanonicalAgentRuntime({ transport: mockTransport });
      const mockExecute = vi.fn().mockResolvedValue("Search results for vitest documentation");
      const request = createMockRequest({
        runId: "test-run-tool",
        model: { provider: "openrouter", id: "meta-llama/llama-3" },
        prompt: "Search docs",
        executeTool: mockExecute,
      });
      const context = createMockContext({ runId: "test-run-tool" });

      const events: any[] = [];
      for await (const event of runtime.run(request, context)) {
        events.push(event);
      }

      expect(mockExecute).toHaveBeenCalledWith(
        "web_search",
        { query: "vitest documentation" },
        "call_1",
      );

      const toolEvent = events.find((e) => e.type === "tool");
      expect(toolEvent).toEqual({
        type: "tool",
        name: "web_search",
        args: { query: "vitest documentation" },
        executionId: "call_1",
      });

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.text).toBe("Found the documentation.");
    });

    it("R4.3: Anti-Loop Circuit Breaker enforces MAX_TOOL_ITERATIONS_PER_TURN = 25", async () => {
      let iterations = 0;
      const mockTransport: InferenceTransport = {
        id: "mock",
        isFree: true,
        stream: async function* () {
          iterations++;
          // Always return a unique tool call so redundant guard doesn't trip first
          yield {
            type: "tool_call",
            toolCall: {
              id: `call_${iterations}`,
              name: "web_search",
              arguments: JSON.stringify({ query: `query_${iterations}` }),
            },
          };
        },
      };

      const runtime = new CanonicalAgentRuntime({ transport: mockTransport });
      const mockExecute = vi.fn().mockResolvedValue("result");
      const request = createMockRequest({
        runId: "circuit-breaker-run",
        model: { provider: "omniroute", id: "combo/rakazo-fast" },
        prompt: "Infinite tool run",
        executeTool: mockExecute,
      });
      const context = createMockContext({ runId: "circuit-breaker-run" });

      const events: any[] = [];
      for await (const event of runtime.run(request, context)) {
        events.push(event);
      }

      // Exactly 25 stream requests attempted, tool executions <= 25
      expect(iterations).toBe(25);
      expect(mockExecute.mock.calls.length).toBeLessThanOrEqual(25);

      const lastEvents = events.slice(-2);
      expect(lastEvents[0]).toEqual({
        type: "text",
        text: "Tool iteration limit reached (25 steps). Stopping turn.",
      });
      expect(lastEvents[1]).toEqual({
        type: "done",
        text: "Tool iteration limit reached (25 steps). Stopping turn.",
      });
    });

    it("R4.4: Redundancy Detector halts immediately on 3 consecutive identical tool calls", async () => {
      let turns = 0;
      const mockTransport: InferenceTransport = {
        id: "mock",
        isFree: true,
        stream: async function* () {
          turns++;
          // Return exact same tool and arguments every turn
          yield {
            type: "tool_call",
            toolCall: {
              id: `call_${turns}`,
              name: "read_file",
              arguments: JSON.stringify({ path: "notes.txt" }),
            },
          };
        },
      };

      const runtime = new CanonicalAgentRuntime({ transport: mockTransport });
      const mockExecute = vi.fn().mockResolvedValue("content of notes");
      const request = createMockRequest({
        runId: "redundancy-run",
        model: { provider: "omniroute", id: "combo/rakazo-fast" },
        prompt: "Read file repeatedly",
        executeTool: mockExecute,
      });
      const context = createMockContext({ runId: "redundancy-run" });

      const events: any[] = [];
      for await (const event of runtime.run(request, context)) {
        events.push(event);
      }

      // Should execute tool twice, and on the 3rd attempt, guard rejects and terminates
      expect(mockExecute).toHaveBeenCalledTimes(2);

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent?.text).toContain("Loop detected: Tool 'read_file' called 3 consecutive times with identical arguments");
    });

    it("R4.5: Argument canonicalization handles key order permutations in redundancy detection", () => {
      const tracker = createToolCallTracker();
      // Call 1: { a: 1, b: 2 }
      const g1 = evaluateToolCallGuard(tracker, "test_tool", { a: 1, b: 2 });
      expect(g1.allow).toBe(true);

      // Call 2: { b: 2, a: 1 } (permuted keys)
      const g2 = evaluateToolCallGuard(tracker, "test_tool", { b: 2, a: 1 });
      expect(g2.allow).toBe(true);

      // Call 3: { a: 1, b: 2 } (3rd identical call)
      const g3 = evaluateToolCallGuard(tracker, "test_tool", { a: 1, b: 2 });
      expect(g3.allow).toBe(false);
      if (!g3.allow) {
        expect(g3.terminate).toBe(true);
        expect(g3.reason).toContain("3 consecutive times with identical arguments");
      }
    });

    it("R4.6: compactToolResult produces token-efficient summaries across all tool types", () => {
      // 1. Shell output > 4000 chars -> truncates middle
      const hugeShellOutput = "START_" + "X".repeat(5000) + "_END";
      const compactedShell = compactToolResult("shell", hugeShellOutput);
      expect(compactedShell.length).toBeLessThan(hugeShellOutput.length);
      expect(compactedShell).toContain("characters truncated");
      expect(compactedShell.startsWith("START_")).toBe(true);
      expect(compactedShell.endsWith("_END")).toBe(true);

      // 2. list_files > 40 files -> directory breakdown + first 30
      const files = Array.from({ length: 60 }, (_, i) => ({ path: `src/module_${i}/index.ts` }));
      const compactedFiles = compactToolResult("list_files", { files });
      expect(compactedFiles).toContain("Found 60 files across directories");
      expect(compactedFiles).toContain("showing first 30");
      expect(compactedFiles).toContain("... (+30 more files)");

      // 3. github_search_repos -> compacts items
      const repos = [
        { full_name: "rakazo/repo1", stargazers_count: 42, language: "TypeScript", description: "First repo" },
        { full_name: "rakazo/repo2", stargazers_count: 100, language: "Rust", description: "Second repo" },
      ];
      const compactedRepos = compactToolResult("github_search_repos", { items: repos, total_count: 2 });
      expect(compactedRepos).toContain("rakazo/repo1 (42⭐, TypeScript) - First repo");
      expect(compactedRepos).toContain("rakazo/repo2 (100⭐, Rust) - Second repo");

      // 4. github_list_issues -> compacts issues
      const issues = [
        { number: 101, state: "open", title: "Bug in loop guard", user: { login: "alice" } },
      ];
      const compactedIssues = compactToolResult("github_list_issues", { issues });
      expect(compactedIssues).toContain("#101 [open] Bug in loop guard (@alice)");
    });
  });

  // =========================================================================
  // REQUIREMENT 5 (R5): Strict Subagent Free Mode Inheritance & Double Fail-Closed Zero-Cost Barrier
  // =========================================================================
  describe("R5: Subagent Free Mode Inheritance & Double Fail-Closed Zero-Cost Barrier", () => {
    const executor = new SubagentExecutor();
    const policyEngine = new RakazoFreePolicyEngine();

    it("R5.1: Subagent strictly inherits parent 'free' mode and forbids privilege escalation", () => {
      const freeParent: BotContext = {
        id: "parent-bot-free",
        name: "FreeParent",
        inferenceMode: "free",
        usageTags: ["coding"],
        depth: 0,
      };

      // Attempt 1: Subagent requests paid mode
      const spawn1 = executor.spawnSubagent({
        parentBot: freeParent,
        requestedInferenceMode: "paid" as any,
        taskPrompt: "Execute helper task",
      });
      expect(spawn1.inferenceMode).toBe("free");

      // Attempt 2: Subagent requests custom mode
      const spawn2 = executor.spawnSubagent({
        parentBot: freeParent,
        requestedInferenceMode: "custom" as any,
        taskPrompt: "Execute another task",
      });
      expect(spawn2.inferenceMode).toBe("free");
    });

    it("R5.2: Subagent recursion depth is strictly capped at maxDepth = 1", () => {
      const depth0Parent: BotContext = {
        id: "root-bot",
        name: "Root",
        inferenceMode: "free",
        depth: 0,
      };

      // Depth 0 -> Depth 1: SUCCESS
      const child = executor.spawnSubagent({
        parentBot: depth0Parent,
        taskPrompt: "Child task",
      });
      expect(child.maxDepth).toBe(1);

      // Depth 1 -> Depth 2: STRICT ERROR
      const depth1Bot: BotContext = {
        id: child.botId,
        name: "ChildBot",
        inferenceMode: "free",
        depth: 1,
      };

      expect(() => {
        executor.spawnSubagent({
          parentBot: depth1Bot,
          taskPrompt: "Illegal grandchild spawn",
        });
      }).toThrow(/exceeds maximum allowed depth 1/i);
    });

    it("R5.3: Subagent context strips all delegation tools and enforces 8,192 token ceiling", () => {
      const parentWithTools: BotContext = {
        id: "parent-tools",
        name: "ParentTools",
        inferenceMode: "free",
        depth: 0,
        tools: [
          "web_search",
          "web_scrape",
          "spawn_subagent",
          "delegate_task",
          "child_bot_spawn",
          "create_child_agent",
          "run_subagent",
          "spawn_bot",
          "archive_bot",
          "delete_bot",
          "shell",
          "write_file",
        ],
      };

      const child = executor.spawnSubagent({
        parentBot: parentWithTools,
        taskPrompt: "Subagent task",
      });

      expect(child.maxTokens).toBe(SUBAGENT_TOKEN_BUDGET_CEILING);
      expect(child.maxTokens).toBe(8192);

      // Verify none of the delegation tools exist in child.availableTools
      for (const delTool of DELEGATION_NAMES_SET) {
        expect(child.availableTools).not.toContain(delTool);
      }

      // Safe tools are retained
      expect(child.availableTools).toContain("web_search");
      expect(child.availableTools).toContain("web_scrape");
      expect(child.availableTools).toContain("shell");
      expect(child.availableTools).toContain("write_file");

      // Validate token budget check
      expect(() => executor.validateTokenBudget(8000)).not.toThrow();
      expect(() => executor.validateTokenBudget(8192)).not.toThrow();
      expect(() => executor.validateTokenBudget(8193)).toThrow(/token budget exceeded/i);
    });

    it("R5.4: Double Fail-Closed Barrier 1 (Pre-dispatch Veto): Blocks all commercial/paid models", () => {
      // Forbidden paid models throw immediately
      const forbiddenModels = [
        "gpt-4",
        "gpt-4o",
        "gpt-4-turbo",
        "openai/gpt-4o-mini",
        "claude-3-opus",
        "claude-3-sonnet",
        "anthropic/claude-3.5-sonnet",
        "gpt-oss-120b",
        "openai/gpt-oss-120b",
        "meta-llama/llama-3-70b-instruct", // without :free
      ];

      for (const model of forbiddenModels) {
        expect(() => policyEngine.vetoPaidFallback(model)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      // Approved free models and combos succeed
      const allowedModels = [
        "combo/rakazo-coding",
        "combo/rakazo-reasoning",
        "combo/rakazo-writing",
        "combo/rakazo-fast",
        "combo/rakazo-analysis",
        "combo-custom",
        "meta-llama/llama-3-70b-instruct:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "google/gemini-flash:free",
      ];

      for (const model of allowedModels) {
        expect(() => policyEngine.vetoPaidFallback(model)).not.toThrow();
      }
    });

    it("R5.5: Double Fail-Closed Barrier 2 (Post-response Cost & Provider Verification)", () => {
      // 1. Non-zero cost throws fail-closed
      expect(() => policyEngine.assertZeroCostAndAllowed("omniroute", 0.0001)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => policyEngine.assertZeroCostAndAllowed("omniroute", 1.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => policyEngine.assertZeroCostAndAllowed("omniroute", -0.01)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => policyEngine.assertZeroCostAndAllowed("omniroute", NaN)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      // 2. Unapproved or avoided providers throw fail-closed
      for (const avoided of AVOIDED_PROVIDERS) {
        expect(() => policyEngine.assertZeroCostAndAllowed(avoided, 0.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }
      expect(() => policyEngine.assertZeroCostAndAllowed("random_unapproved_vendor", 0.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      // 3. Approved providers with $0.00 cost pass
      for (const approved of APPROVED_FREE_PROVIDERS) {
        expect(() => policyEngine.assertZeroCostAndAllowed(approved, 0.0)).not.toThrow();
      }
    });

    it("R5.6: OmniRouteTransport strictly validates x-omniroute-cost header and SSE pricing", async () => {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: "http://mock-omniroute:8080/v1",
      });

      // Test with mocked fetch returning non-zero cost header
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({
            "x-omniroute-cost": "0.0042", // Non-zero cost reported!
          }),
          body: {
            getReader: () => ({
              read: vi.fn().mockResolvedValue({ done: true }),
            }),
          },
        } as any);

        const chunks: InferenceTransportChunk[] = [];
        await expect(async () => {
          for await (const chunk of transport.stream({
            model: "combo/rakazo-fast",
            messages: [{ role: "user", content: "hi" }],
          })) {
            chunks.push(chunk);
          }
        }).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

      } finally {
        globalThis.fetch = originalFetch;
      }
    });

  });

});
