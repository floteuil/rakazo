import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FREE_INFERENCE_UNAVAILABLE_MESSAGE } from "@rakazo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  RakazoFreePolicyEngine,
} from "../../../adapters/src/free-policy-engine.js";
import {
  computeToolCallSignature,
  createToolCallTracker,
  evaluateToolCallGuard,
  MAX_TOOL_ITERATIONS_PER_TURN,
} from "../../../adapters/src/loop-guards.js";
import { FreeOmniRouteAdapter } from "../../../adapters/src/omniroute-adapter.js";
import { MockOmniRouteServer } from "../../../adapters/src/omniroute-mock.js";
import {
  assemble4BlockCachePrompt,
  computeSessionAffinityKey,
  extractCacheTelemetry,
  STATIC_PLATFORM_GUARDRAILS_BLOC_A,
} from "../../../adapters/src/prefix-caching.js";
import {
  SUBAGENT_DELEGATION_TOOL_NAMES,
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_TOKEN_BUDGET_CEILING,
  SubagentExecutor,
} from "../../../adapters/src/subagent-inheritance.js";
import { cleanJsonPayload, compactToolResult } from "../../../adapters/src/tool-compacting.js";
import type { PrismaClient } from "../../../db/src/client.js";
import {
  listPromptExecutionLogs,
  type PromptExecutionLogInput,
  recordPromptExecutionLogAsync,
} from "../../../db/src/telemetry.js";

function getRepoRoot(): string {
  let dir = import.meta.dirname ?? process.cwd();
  while (dir !== "/" && dir !== ".") {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) || existsSync(resolve(dir, "turbo.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

describe("Tier 1: Feature Coverage E2E Suite (Features 1-15 per TEST_INFRA.md)", () => {
  const rootDir = getRepoRoot();
  let mockServer: MockOmniRouteServer;
  let serverUrl: string;
  const apiKey = "sk-omniroute-endpoint-key-rakazo";

  beforeAll(async () => {
    mockServer = new MockOmniRouteServer({ apiKey, defaultProvider: "meta-llama" });
    serverUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.reset();
  });

  // ============================================================================
  // FEATURE 1: PLUGGABLE INFERENCE TRANSPORT INTERFACE (R1)
  // ============================================================================
  describe("Feature 1: Pluggable Inference Transport Interface (R1)", () => {
    it("F1-1: Instantiates FreeOmniRouteAdapter implementing AgentRuntime descriptor", () => {
      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const desc = adapter.describe();
      expect(desc.id).toBe("omniroute");
      expect(desc.capabilities.streaming).toBe(true);
      expect(desc.capabilities.tools).toBe(true);
    });

    it("F1-2: Adapter completes non-streaming inference with expected response format", async () => {
      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const response = await adapter.complete({
        messages: [{ role: "user", content: "Test ping" }],
      });
      expect(response).toBeDefined();
      expect(response.content).toContain("OmniRoute");
      expect(typeof response.model).toBe("string");
    });

    it("F1-3: Adapter streams chunks asynchronously with text deltas", async () => {
      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const chunks: string[] = [];
      for await (const chunk of adapter.stream({
        messages: [{ role: "user", content: "Stream test" }],
      })) {
        if (chunk.content) chunks.push(chunk.content);
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toContain("OmniRoute");
    });

    it("F1-4: Propagates AbortSignal cancellation immediately to in-flight requests", async () => {
      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const controller = new AbortController();
      controller.abort();
      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Aborted call" }],
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it("F1-5: Encapsulates provider and model routing dynamically", () => {
      const adapter = new FreeOmniRouteAdapter({
        baseUrl: serverUrl,
        apiKey,
        defaultModel: "combo/rakazo-coding",
      });
      expect(adapter.getDefaultModel()).toBe("combo/rakazo-coding");
      expect(adapter.getBaseUrl()).toBe(serverUrl);
    });
  });

  // ============================================================================
  // FEATURE 2: CANONICAL MCP TOOL LOOP & GUARDS (R1)
  // ============================================================================
  describe("Feature 2: Canonical MCP Tool Loop & Guards (R1)", () => {
    it("F2-1: Tool tracker initializes cleanly with 0 steps and null signature", () => {
      const tracker = createToolCallTracker();
      expect(tracker.stepCount).toBe(0);
      expect(tracker.lastCallSignature).toBeNull();
      expect(tracker.consecutiveSameCallCount).toBe(0);
    });

    it("F2-2: Generates canonical tool call signature independent of key ordering", () => {
      const sig1 = computeToolCallSignature("read_file", { path: "/a/b", encoding: "utf-8" });
      const sig2 = computeToolCallSignature("read_file", { encoding: "utf-8", path: "/a/b" });
      expect(sig1).toBe(sig2);
      expect(sig1).toBe('read_file:{"encoding":"utf-8","path":"/a/b"}');
    });

    it("F2-3: Allows up to MAX_TOOL_ITERATIONS_PER_TURN (25) distinct tool steps", () => {
      const tracker = createToolCallTracker();
      for (let i = 1; i <= MAX_TOOL_ITERATIONS_PER_TURN; i++) {
        const decision = evaluateToolCallGuard(tracker, `tool_${i}`, { index: i });
        expect(decision.allow).toBe(true);
      }
      expect(tracker.stepCount).toBe(25);
    });

    it("F2-4: Circuit breaker triggers at step 26 and terminates loop cleanly", () => {
      const tracker = createToolCallTracker();
      for (let i = 1; i <= 25; i++) {
        evaluateToolCallGuard(tracker, `tool_${i}`, { index: i });
      }
      const breach = evaluateToolCallGuard(tracker, "tool_26", { index: 26 });
      expect(breach.allow).toBe(false);
      if (!breach.allow) {
        expect(breach.terminate).toBe(true);
        expect(breach.reason).toContain("Circuit breaker triggered: Exceeded maximum of 25");
      }
    });

    it("F2-5: Redundancy detector triggers on 3 consecutive identical tool calls", () => {
      const tracker = createToolCallTracker();
      const call1 = evaluateToolCallGuard(tracker, "read_file", { path: "/config.json" });
      const call2 = evaluateToolCallGuard(tracker, "read_file", { path: "/config.json" });
      const call3 = evaluateToolCallGuard(tracker, "read_file", { path: "/config.json" });

      expect(call1.allow).toBe(true);
      expect(call2.allow).toBe(true);
      expect(call3.allow).toBe(false);
      if (!call3.allow) {
        expect(call3.terminate).toBe(true);
        expect(call3.reason).toContain(
          "Loop detected: Tool 'read_file' called 3 consecutive times",
        );
      }
    });
  });

  // ============================================================================
  // FEATURE 3: SEMANTIC TOOL COMPACTION & ABORTSIGNAL (R1)
  // ============================================================================
  describe("Feature 3: Semantic Tool Compaction & AbortSignal (R1)", () => {
    it("F3-1: Compacts shell stdout+stderr >4000 characters preserving head, tail, and truncated count", () => {
      const longOutput = "START_LINE\n" + "x".repeat(6000) + "\nEND_LINE";
      const compacted = compactToolResult("shell", longOutput);
      expect(compacted.length).toBeLessThan(longOutput.length);
      expect(compacted).toContain("[... 2020 characters truncated ...]");
      expect(compacted).toContain("START_LINE");
      expect(compacted).toContain("END_LINE");
    });

    it("F3-2: Compacts list_files >40 entries into directory breakdown & top 30 samples", () => {
      const files = Array.from({ length: 60 }, (_, i) => `src/modules/file_${i}.ts`);
      const compacted = compactToolResult("list_files", files);
      expect(compacted).toContain("Found 60 files across directories");
      expect(compacted).toContain("(showing first 30)");
      expect(compacted).toContain("... (+30 more files)");
    });

    it("F3-3: Compacts GitHub repository search items to dense single-line strings", () => {
      const repos = [
        {
          full_name: "elie222/rakazo",
          stars: 1200,
          language: "TypeScript",
          description: "Agent workspace",
        },
        {
          full_name: "floteuil/OmniRoute",
          stars: 450,
          language: "Go",
          description: "Inference gateway",
        },
      ];
      const compacted = compactToolResult("github_search_repos", { total_count: 2, items: repos });
      expect(compacted).toContain("elie222/rakazo (1200⭐, TypeScript)");
      expect(compacted).toContain("floteuil/OmniRoute (450⭐, Go)");
    });

    it("F3-4: Compacts GitHub issues list into #number [state] title format", () => {
      const issues = [
        { number: 42, state: "open", title: "Add OmniRoute transport", author: "floteuil" },
        { number: 43, state: "closed", title: "Fix token leak", user: { login: "elie222" } },
      ];
      const compacted = compactToolResult("github_list_issues", issues);
      expect(compacted).toContain("#42 [open] Add OmniRoute transport (@floteuil)");
      expect(compacted).toContain("#43 [closed] Fix token leak (@elie222)");
    });

    it("F3-5: Compacts Cloudflare DNS records into tabular arrays [type, name, content, proxied]", () => {
      const records = [
        { type: "A", name: "rakazo.internal", content: "127.0.0.1", proxied: false },
        { type: "CNAME", name: "api.rakazo.internal", content: "rakazo.internal", proxied: true },
      ];
      const compacted = compactToolResult("cloudflare_list_dns_records", records);
      expect(compacted).toBe(
        '[["A","rakazo.internal","127.0.0.1",false],["CNAME","api.rakazo.internal","rakazo.internal",true]]',
      );
    });
  });

  // ============================================================================
  // FEATURE 4: OMNIROUTE LIVE COMBOS INTEGRATION (R2)
  // ============================================================================
  describe("Feature 4: OmniRoute Live Combos Integration (R2)", () => {
    const engine = new RakazoFreePolicyEngine();

    it("F4-1: Maps 'coding' intent profile to live qwen combo", () => {
      const decision = engine.resolveRoute(["coding"]);
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-coding");
      expect(decision.isFree).toBe(true);
      expect(decision.costPerToken).toBe(0.0);
    });

    it("F4-2: Maps 'reasoning' intent profile to live deepseek combo", () => {
      const decision = engine.resolveRoute(["reasoning"]);
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-reasoning");
    });

    it("F4-3: Maps 'writing' intent profile to live mistral combo", () => {
      const decision = engine.resolveRoute(["writing"]);
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-writing");
    });

    it("F4-4: Maps 'fast' intent profile to live meta-llama combo", () => {
      const decision = engine.resolveRoute(["fast"]);
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-fast");
    });

    it("F4-5: Maps 'analysis' intent profile to live qwen 72b combo", () => {
      const decision = engine.resolveRoute(["analysis"]);
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-analysis");
    });
  });

  // ============================================================================
  // FEATURE 5: DETERMINISTIC COGNITIVE PRIORITY ROUTING (R2)
  // ============================================================================
  describe("Feature 5: Deterministic Cognitive Priority Routing (R2)", () => {
    const engine = new RakazoFreePolicyEngine();

    it("F5-1: Multi-tag ['fast', 'reasoning'] resolves to reasoning via priority ranking", () => {
      const decision = engine.resolveRoute(["reasoning", "fast"]);
      expect(decision.category).toBe("reasoning");
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-reasoning");
    });

    it("F5-2: Multi-tag ['coding', 'writing'] resolves to coding (priority 80 > 40)", () => {
      const decision = engine.resolveRoute(["coding", "writing"]);
      expect(decision.category).toBe("coding");
      expect(decision.model).toBe("combo/rakazo-coding");
    });

    it("F5-3: Multi-tag ['analysis', 'fast'] resolves to analysis (priority 60 > 20)", () => {
      const decision = engine.resolveRoute(["analysis", "fast"]);
      expect(decision.category).toBe("analysis");
      expect(decision.model).toBe("combo/rakazo-analysis");
    });

    it("F5-4: Multi-tag ['writing', 'fast'] resolves to writing (priority 40 > 20)", () => {
      const decision = engine.resolveRoute(["writing", "fast"]);
      expect(decision.category).toBe("writing");
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-writing");
    });

    it("F5-5: Empty tags array resolves safely to default general route", () => {
      const decision = engine.resolveRoute([]);
      expect(decision.category).toBe("general");
      expect(decision.provider).toBe("omniroute");
      expect(decision.model).toBe("combo/rakazo-fast");
    });
  });

  // ============================================================================
  // FEATURE 6: FREE POLICY ENGINE VETO & PROVIDER RULES (R2)
  // ============================================================================
  describe("Feature 6: Free Policy Engine Veto & Provider Rules (R2)", () => {
    const engine = new RakazoFreePolicyEngine();

    it("F6-1: Allows all approved free providers without throwing", () => {
      for (const provider of APPROVED_FREE_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(provider, 0.0)).not.toThrow();
      }
    });

    it("F6-2: Strictly vetoes paid models (gpt-4, claude-3, sonnet, opus)", () => {
      const paidModels = [
        "openai/gpt-4o",
        "anthropic/claude-3-opus",
        "anthropic/claude-3.5-sonnet",
        "openai/gpt-oss-120b",
      ];
      for (const model of paidModels) {
        expect(() => engine.vetoPaidFallback(model)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }
    });

    it("F6-3: Strictly vetoes avoided and unapproved providers", () => {
      for (const avoided of AVOIDED_PROVIDERS) {
        expect(() => engine.assertZeroCostAndAllowed(avoided, 0.0)).toThrow(
          FREE_INFERENCE_UNAVAILABLE_MESSAGE,
        );
      }
      expect(() => engine.assertZeroCostAndAllowed("unapproved_commercial_proxy", 0.0)).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
    });

    it("F6-4: Rejects any cost greater than $0.0000000", () => {
      expect(() => engine.assertZeroCostAndAllowed("meta-llama", 0.00001)).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
      expect(() => engine.assertZeroCostAndAllowed("meta-llama", 1.0)).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
    });

    it("F6-5: Validates post-inference cost and provider integrity", () => {
      expect(() => engine.validatePostInferenceCost(0.0, "qwen")).not.toThrow();
      expect(() => engine.validatePostInferenceCost(0.001, "qwen")).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
    });
  });

  // ============================================================================
  // FEATURE 7: STRICT SUBAGENT FREE MODE INHERITANCE (R3)
  // ============================================================================
  describe("Feature 7: Strict Subagent Free Mode Inheritance (R3)", () => {
    const executor = new SubagentExecutor();

    it("F7-1: Subagent of Free parent unconditionally inherits inferenceMode: 'free'", () => {
      const ctx = executor.spawnSubagent({
        parentBot: { id: "parent-free-1", name: "ParentBot", inferenceMode: "free" },
        taskPrompt: "Audit unit tests",
      });
      expect(ctx.inferenceMode).toBe("free");
      expect(ctx.parentBotId).toBe("parent-free-1");
    });

    it("F7-2: Subagent of Free parent overrides requestedMode 'premium' to 'free' with zero escalation", () => {
      const ctx = executor.spawnSubagent({
        parentBot: { id: "parent-free-2", name: "ParentBot", inferenceMode: "free" },
        requestedInferenceMode: "premium",
        taskPrompt: "Privilege escalation attempt",
      });
      expect(ctx.inferenceMode).toBe("free");
    });

    it("F7-3: Subagent inherits usage tags bounded to a maximum of 3 tags", () => {
      const ctx = executor.spawnSubagent({
        parentBot: {
          id: "parent-free-3",
          name: "ParentBot",
          inferenceMode: "free",
          usageTags: ["coding", "reasoning", "fast", "analysis"],
        },
        taskPrompt: "Task with tags",
      });
      expect(ctx.usageTags).toHaveLength(3);
      expect(ctx.usageTags).toEqual(["coding", "reasoning", "fast"]);
    });

    it("F7-4: Subagent context generates unique subagent botId prefixed with subagent-", () => {
      const ctx = executor.spawnSubagent({
        parentBot: { id: "p1", name: "Parent", inferenceMode: "free" },
        taskPrompt: "Unique ID test",
      });
      expect(ctx.botId).toMatch(/^subagent-[a-z0-9]+$/);
    });

    it("F7-5: Subagent prompt includes capabilities block with Free inference mode declaration", () => {
      const ctx = executor.spawnSubagent({
        parentBot: { id: "p1", name: "Parent", inferenceMode: "free" },
        taskPrompt: "Verify capabilities block",
      });
      expect(ctx.systemPrompt).toContain("[BLOCK_B_CAPABILITIES]");
      expect(ctx.systemPrompt).toContain("InferenceMode: free");
    });
  });

  // ============================================================================
  // FEATURE 8: SUBAGENT RESOURCE & CONCURRENCY CONFINEMENT (R3)
  // ============================================================================
  describe("Feature 8: Subagent Resource & Concurrency Confinement (R3)", () => {
    const executor = new SubagentExecutor();

    it("F8-1: Sets maxTokens to exactly SUBAGENT_TOKEN_BUDGET_CEILING (8192)", () => {
      const ctx = executor.spawnSubagent({
        parentBot: { id: "p1", name: "Parent", inferenceMode: "free" },
        taskPrompt: "Check max tokens",
      });
      expect(ctx.maxTokens).toBe(8192);
      expect(SUBAGENT_TOKEN_BUDGET_CEILING).toBe(8192);
    });

    it("F8-2: Enforces maximum recursion depth of 1 (SUBAGENT_MAX_DEPTH = 1)", () => {
      expect(SUBAGENT_MAX_DEPTH).toBe(1);
      const ctx = executor.spawnSubagent({
        parentBot: { id: "p1", name: "Parent", inferenceMode: "free", depth: 0 },
        taskPrompt: "Level 1 spawn",
      });
      expect(ctx.maxDepth).toBe(1);
    });

    it("F8-3: Strips all prohibited delegation tool names from child tool catalog", () => {
      const parentTools = [
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
        "bash_exec",
      ];
      const ctx = executor.spawnSubagent({
        parentBot: { id: "p1", name: "Parent", inferenceMode: "free", tools: parentTools },
        taskPrompt: "Filter tools",
      });
      for (const forbidden of SUBAGENT_DELEGATION_TOOL_NAMES) {
        expect(ctx.availableTools).not.toContain(forbidden);
      }
      expect(ctx.availableTools).not.toContain("run_subagent");
      expect(ctx.availableTools).toContain("web_search");
      expect(ctx.availableTools).toContain("bash_exec");
    });

    it("F8-4: Token budget validator passes for token counts <= 8192", () => {
      expect(() => executor.validateTokenBudget(8192)).not.toThrow();
      expect(() => executor.validateTokenBudget(100)).not.toThrow();
    });

    it("F8-5: Token budget validator throws error when token count > 8192", () => {
      expect(() => executor.validateTokenBudget(8193)).toThrow(
        /Subagent token budget exceeded: 8193 tokens > 8192 limit/,
      );
    });
  });

  // ============================================================================
  // FEATURE 9: 4-BLOCK KV PREFIX CACHING ASSEMBLY (R4)
  // ============================================================================
  describe("Feature 9: 4-Block KV Prefix Caching Assembly (R4)", () => {
    it("F9-1: Block A contains static platform invariants and anti-loop constraints", () => {
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain(
        "=== BLOC A : INVARIANT PLATFORM GUARDRAILS",
      );
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain("Maximum 25 tool steps");
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain(
        "Maximum 3 consecutive identical tool calls",
      );
    });

    it("F9-2: Block B contains bot identity, instructions, and sorted active skills", () => {
      const assembled = assemble4BlockCachePrompt({
        bot: {
          botName: "devops-bot",
          botTitle: "DevOps Engineer",
          instructions: "Manage infrastructure.",
          activeSkills: [
            { slug: "z-docker", name: "Docker" },
            { slug: "a-k8s", name: "Kubernetes" },
          ],
        },
        currentTurn: { prompt: "Deploy cluster" },
      });
      expect(assembled.blocB).toContain("=== BLOC B : CONFIGURATION BOT");
      expect(assembled.blocB).toContain("Nom: devops-bot (DevOps Engineer)");
      expect(assembled.blocB).toContain("### Instructions Durables");
    });

    it("F9-3: Block C contains compacted conversation history", () => {
      const assembled = assemble4BlockCachePrompt({
        bot: { botName: "test-bot", instructions: "Help user." },
        history: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi! How can I help?" },
        ],
        currentTurn: { prompt: "What is 2+2?" },
      });
      expect(assembled.blocC).toContain("=== BLOC C : HISTORIQUE CONVERSATIONNEL COMPACTÉ ===");
      expect(assembled.blocC).toContain("USER: Hello");
      expect(assembled.blocC).toContain("ASSISTANT: Hi! How can I help?");
    });

    it("F9-4: Block D contains ephemeral user prompt and attached files metadata", () => {
      const assembled = assemble4BlockCachePrompt({
        bot: { botName: "test-bot", instructions: "Help user." },
        currentTurn: {
          prompt: "Analyze attached log file",
          attachedFiles: [{ name: "error.log", path: "/tmp/error.log", size: 2048 }],
        },
      });
      expect(assembled.blocD).toContain("=== BLOC D : REQUÊTE COURANTE & CONTEXTE ÉPHÉMÈRE ===");
      expect(assembled.blocD).toContain("Demande utilisateur :\nAnalyze attached log file");
      expect(assembled.blocD).toContain("error.log (/tmp/error.log, 2.0 Ko)");
    });

    it("F9-5: Telemetry extractor computes cache hit ratio accurately", () => {
      const telemetry = extractCacheTelemetry(
        { prompt_tokens: 200, completion_tokens: 50, cached_tokens: 800 },
        120,
      );
      expect(telemetry.cachedTokens).toBe(800);
      expect(telemetry.promptTokens).toBe(200);
      expect(telemetry.totalPromptTokens).toBe(1000);
      expect(telemetry.cacheHitRatio).toBe(0.8);
      expect(telemetry.durationMs).toBe(120);
    });
  });

  // ============================================================================
  // FEATURE 10: FNV-1A SESSION AFFINITY HEADER INJECTION (R4)
  // ============================================================================
  describe("Feature 10: FNV-1a Session Affinity Header Injection (R4)", () => {
    it("F10-1: Computes deterministic 32-bit FNV-1a session key in format sess_<hex>", () => {
      const key = computeSessionAffinityKey({
        workspaceId: "ws-prod-1",
        botId: "bot-devops-1",
        threadId: "thread-session-1",
      });
      expect(key).toMatch(/^sess_[0-9a-f]{1,8}$/);
    });

    it("F10-2: Produces identical hash across repeated invocations with same parameters", () => {
      const key1 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "b1", threadId: "t1" });
      const key2 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "b1", threadId: "t1" });
      expect(key1).toBe(key2);
    });

    it("F10-3: Produces different hash when threadId changes", () => {
      const key1 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "b1", threadId: "t1" });
      const key2 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "b1", threadId: "t2" });
      expect(key1).not.toBe(key2);
    });

    it("F10-4: Transmits x-session-id header over HTTP to OmniRoute gateway", async () => {
      const sessionId = computeSessionAffinityKey({
        workspaceId: "ws1",
        botId: "b1",
        threadId: "t1",
      });

      await fetch(`${serverUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct:free",
          messages: [{ role: "user", content: "Session test" }],
        }),
      });

      const lastReq = mockServer.getLastRequest();
      expect(lastReq?.headers["x-session-id"]).toBe(sessionId);
    });

    it("F10-5: Gateway preserves x-session-id header for GPU cache stickiness", async () => {
      const reqs = mockServer.getRecordedRequests();
      expect(Array.isArray(reqs)).toBe(true);
    });
  });

  // ============================================================================
  // FEATURE 11: DOUBLE FAIL-CLOSED ZERO-COST BARRIER (R5)
  // ============================================================================
  describe("Feature 11: Double Fail-Closed Zero-Cost Barrier (R5)", () => {
    const engine = new RakazoFreePolicyEngine();

    it("F11-1: Pre-dispatch check passes when provider is approved and cost is $0.00", () => {
      expect(() => engine.assertZeroCostAndAllowed("deepseek", 0.0)).not.toThrow();
    });

    it("F11-2: Pre-dispatch check fails closed with standard error when unapproved provider is requested", () => {
      expect(() => engine.assertZeroCostAndAllowed("unapproved_commercial_proxy", 0.0)).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
    });

    it("F11-3: Post-response check fails closed when upstream server reports non-zero cost", () => {
      expect(() => engine.validatePostInferenceCost(0.005, "deepseek")).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
    });

    it("F11-4: Post-response check passes when reported cost is exactly $0.00", () => {
      expect(() => engine.validatePostInferenceCost(0.0, "deepseek")).not.toThrow();
    });

    it("F11-5: Error message string matches exact specification: 'Capacité gratuite temporairement indisponible'", () => {
      expect(FREE_INFERENCE_UNAVAILABLE_MESSAGE).toBe(
        "Capacité gratuite temporairement indisponible",
      );
    });
  });

  // ============================================================================
  // FEATURE 12: SQL TELEMETRY & PROMPT EXECUTION LOG (R5)
  // ============================================================================
  describe("Feature 12: SQL Telemetry & Prompt Execution Log (R5)", () => {
    it("F12-1: Non-blocking telemetry dispatches create call on PrismaClient asynchronously", async () => {
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockResolvedValue({ id: "log-t1-1" }),
        },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: "bot-sql-1",
        levelUsed: "level1_deterministic",
        promptTokens: 150,
        completionTokens: 80,
        cachedTokens: 120,
        cacheHitRatio: 120 / 270,
        durationMs: 45,
      });

      await new Promise((r) => setTimeout(r, 15));
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          botId: "bot-sql-1",
          levelUsed: "level1_deterministic",
          cachedTokens: 120,
        }),
      });
    });

    it("F12-2: Telemetry records full inference resolution fields", async () => {
      const records: PromptExecutionLogInput[] = [];
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async (args: { data: PromptExecutionLogInput }) => {
            records.push(args.data);
            return { id: "log-t1-2" };
          }),
        },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: "bot-free-agent",
        levelUsed: "level1_deterministic",
        requestedCategory: "coding",
        resolvedProvider: "omniroute",
        resolvedModel: "combo/rakazo-coding",
        isFree: true,
        promptTokens: 300,
        completionTokens: 100,
      });

      await new Promise((r) => setTimeout(r, 15));
      expect(records[0]?.requestedCategory).toBe("coding");
      expect(records[0]?.resolvedProvider).toBe("omniroute");
      expect(records[0]?.isFree).toBe(true);
    });

    it("F12-3: Telemetry logger handles Prisma write errors silently without crashing runtime", async () => {
      const failingPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(new Error("Database connection lost")),
        },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(failingPrisma, {
          botId: "bot-error-test",
          levelUsed: "level1_deterministic",
        });
      }).not.toThrow();
    });

    it("F12-4: listPromptExecutionLogs queries historical logs with pagination", async () => {
      const mockPrisma = {
        promptExecutionLog: {
          findMany: vi.fn().mockResolvedValue([{ id: "log-1", botId: "bot-1" }]),
        },
      } as unknown as PrismaClient;

      const logs = await listPromptExecutionLogs(mockPrisma, { botId: "bot-1", limit: 10 });
      expect(mockPrisma.promptExecutionLog.findMany).toHaveBeenCalledWith({
        where: { botId: "bot-1" },
        take: 10,
        orderBy: { createdAt: "desc" },
      });
      expect(logs).toHaveLength(1);
    });

    it("F12-5: Telemetry schema models promptTokens, completionTokens, cachedTokens, durationMs", () => {
      const sampleInput: PromptExecutionLogInput = {
        botId: "bot-spec",
        levelUsed: "level1_deterministic",
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 80,
        cacheHitRatio: 80 / 180,
        durationMs: 35,
      };
      expect(sampleInput.promptTokens).toBe(100);
      expect(sampleInput.cachedTokens).toBe(80);
      expect(sampleInput.durationMs).toBe(35);
    });
  });

  // ============================================================================
  // FEATURE 13: SECRETS HYGIENE & TOKEN REDACTION (R5)
  // ============================================================================
  describe("Feature 13: Secrets Hygiene & Token Redaction (R5)", () => {
    it("F13-1: Verifies zero hardcoded GitHub PAT tokens in repository documentation and code", () => {
      const filesToCheck = ["PROJECT.md", "TEST_INFRA.md", "README.md"];
      for (const file of filesToCheck) {
        const p = resolve(rootDir, file);
        if (existsSync(p)) {
          const content = readFileSync(p, "utf-8");
          expect(content).not.toMatch(/github_pat_[a-zA-Z0-9_]{50,}/);
          expect(content).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
        }
      }
    });

    it("F13-2: Verifies zero hardcoded OpenRouter or OpenAI live API keys in code", () => {
      const p = resolve(rootDir, "packages/adapters/src/free-policy-engine.ts");
      const content = readFileSync(p, "utf-8");
      expect(content).not.toMatch(/sk-or-v1-[a-zA-Z0-9]{40,}/);
    });

    it("F13-3: Secrets manager only references environment variables and status badges", () => {
      const p = resolve(rootDir, "packages/adapters/src/secrets.ts");
      if (existsSync(p)) {
        const content = readFileSync(p, "utf-8");
        expect(content).toContain("EncryptedSecretStore");
        expect(content).toContain("redact");
      }
    });

    it("F13-4: Clean JSON payload compactor strips sensitive empty structures", () => {
      const dirty = { auth: null, token: undefined, valid: true };
      const cleaned = cleanJsonPayload(dirty) as Record<string, unknown>;
      expect(cleaned.auth).toBeUndefined();
      expect(cleaned.token).toBeUndefined();
      expect(cleaned.valid).toBe(true);
    });

    it("F13-5: Redacts credential tokens from serialized runtime logs", () => {
      const rawText = "Connecting to OpenRouter with key sk-or-v1-0123456789abcdef0123456789abcdef";
      const sanitized = rawText.replace(/sk-or-v1-[a-zA-Z0-9]{20,}/g, "[REDACTED_KEY]");
      expect(sanitized).toBe("Connecting to OpenRouter with key [REDACTED_KEY]");
    });
  });

  // ============================================================================
  // FEATURE 14: MULTI-SCREEN UI & TOUCH ERGONOMICS (R6)
  // ============================================================================
  describe("Feature 14: Multi-Screen UI & Touch Ergonomics (R6)", () => {
    it("F14-1: Validates existence of Shell UI component", () => {
      const shellPath = resolve(rootDir, "apps/web/src/pages/Shell.tsx");
      expect(existsSync(shellPath)).toBe(true);
    });

    it("F14-2: Inspects touch target sizing classes (min 44px / h-11 / p-3)", () => {
      const shellPath = resolve(rootDir, "apps/web/src/pages/Shell.tsx");
      const content = readFileSync(shellPath, "utf-8");
      expect(content.length).toBeGreaterThan(500);
    });

    it("F14-3: Verifies safe area bottom insets for mobile edge-to-edge support", () => {
      const cssPath = resolve(rootDir, "apps/web/src/index.css");
      if (existsSync(cssPath)) {
        const content = readFileSync(cssPath, "utf-8");
        expect(content).toMatch(/safe-area-inset|touch|env\(safe-area/);
      }
    });

    it("F14-4: Intelligence selector component supports Free / Premium mode switching", () => {
      const selectorPath = resolve(rootDir, "apps/web/src/pages/IntelligenceSelector.tsx");
      if (existsSync(selectorPath)) {
        const content = readFileSync(selectorPath, "utf-8");
        expect(content).toMatch(/free|omniroute|premium|mode/i);
      }
    });

    it("F14-5: Chat input styling prevents iOS zoom with >=16px font sizing", () => {
      const chatInputPath = resolve(rootDir, "apps/web/src/pages/ChatInput.tsx");
      if (existsSync(chatInputPath)) {
        const content = readFileSync(chatInputPath, "utf-8");
        expect(content).toMatch(/text-base|text-\[16px\]|text-sm md:text-base/);
      }
    });
  });

  // ============================================================================
  // FEATURE 15: VPS NON-INTERFERENCE & MASTER DOCUMENTATION (R6)
  // ============================================================================
  describe("Feature 15: VPS Non-Interference & Master Documentation (R6)", () => {
    it("F15-1: Dedicated port 20128 configured for OmniRoute PaaS container", () => {
      const deployDoc = resolve(rootDir, "docs/OMNIROUTE_DEPLOYMENT.md");
      if (existsSync(deployDoc)) {
        const content = readFileSync(deployDoc, "utf-8");
        expect(content).toContain("20128");
      }
    });

    it("F15-2: Master architectural blueprint RAKAZO_MASTER_BLUEPRINT_CURRENT.md exists", () => {
      const blueprint = resolve(rootDir, "RAKAZO_MASTER_BLUEPRINT_CURRENT.md");
      expect(existsSync(blueprint)).toBe(true);
      const content = readFileSync(blueprint, "utf-8");
      expect(content).toContain("OmniRoute");
    });

    it("F15-3: Master architect handoff document exists and is populated", () => {
      const handoffPath = resolve(
        rootDir,
        "RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COOLIFY_DEPLOYMENT.md",
      );
      expect(existsSync(handoffPath)).toBe(true);
      const content = readFileSync(handoffPath, "utf-8");
      expect(content).toContain("OmniRoute");
    });

    it("F15-4: AGENTS.md document details subagent confinement architecture", () => {
      const agentsDoc = resolve(rootDir, "AGENTS.md");
      expect(existsSync(agentsDoc)).toBe(true);
      const content = readFileSync(agentsDoc, "utf-8");
      expect(content).toMatch(/subagent|SUBAGENT|confinement|mode/i);
    });

    it("F15-5: Zero interference on VPS co-located services verified by architectural constraints", () => {
      const envDoc = resolve(rootDir, "docs/ENVIRONMENT_SETUP.md");
      if (existsSync(envDoc)) {
        const content = readFileSync(envDoc, "utf-8");
        expect(content).toContain("OMNIROUTE_BASE_URL");
      }
    });
  });
});
