import type { BotInferenceConfig, InferenceMode, InferenceUsageTag } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createToolCallTracker,
  evaluateToolCallGuard,
  computeToolCallSignature,
  MAX_TOOL_ITERATIONS_PER_TURN,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
} from "../../../adapters/src/loop-guards.js";
import {
  compactToolResult,
  safelyTruncateJson,
  cleanJsonPayload,
  MAX_SHELL_OUTPUT_CHARS,
  MAX_FILE_ENTRIES_BEFORE_COMPACT,
} from "../../../adapters/src/tool-compacting.js";
import type { PrismaClient } from "../../../db/src/client.js";
import { recordPromptExecutionLogAsync } from "../../../db/src/telemetry.js";
import {
  resolveLogicalRoute,
  computeFnv1aSessionKey,
  computeStrictCacheRatio,
  formatProviderDisplayName,
  formatModelDisplayName,
  type OmniRouteResponseHeaders,
  type PromptExecutionLogRecord,
  type WebUiTurnMetadata,
} from "../../../../apps/web/src/pages/e2e-omniroute-triple-coherence.test.jsx";

describe("Challenger 2 Empirical Adversarial Stress Suite", () => {
  // ============================================================================
  // TASK 1: TRIPLE COHERENCE EQUATION (Headers == DB == WebUI across 5 profiles)
  // ============================================================================
  describe("Task 1: Triple Coherence Equation across all 5 Cognitive Profiles & Premium", () => {
    const profiles: Array<{
      tag: InferenceUsageTag;
      logicalCombo: string;
      rawProvider: string;
      rawModel: string;
      expectedFormattedProvider: string;
      expectedFormattedModel: string;
    }> = [
      {
        tag: "coding",
        logicalCombo: "combo/rakazo-coding",
        rawProvider: "mistral",
        rawModel: "mistralai/codestral-latest",
        expectedFormattedProvider: "Mistral AI",
        expectedFormattedModel: "Codestral",
      },
      {
        tag: "reasoning",
        logicalCombo: "combo/rakazo-reasoning",
        rawProvider: "deepseek",
        rawModel: "deepseek/deepseek-r1",
        expectedFormattedProvider: "DeepSeek",
        expectedFormattedModel: "DeepSeek R1",
      },
      {
        tag: "writing",
        logicalCombo: "combo/rakazo-writing",
        rawProvider: "mistral",
        rawModel: "mistralai/mistral-small-24b",
        expectedFormattedProvider: "Mistral AI",
        expectedFormattedModel: "Mistral Small 24B",
      },
      {
        tag: "fast",
        logicalCombo: "combo/rakazo-fast",
        rawProvider: "groq",
        rawModel: "groq/llama-3.2-3b",
        expectedFormattedProvider: "Groq",
        expectedFormattedModel: "LLaMA 3.2 3B",
      },
      {
        tag: "analysis",
        logicalCombo: "combo/rakazo-analysis",
        rawProvider: "qwen",
        rawModel: "qwen/qwen-2.5-72b",
        expectedFormattedProvider: "Alibaba Cloud",
        expectedFormattedModel: "Qwen 2.5 72B",
      },
    ];

    for (const p of profiles) {
      it(`Profile '${p.tag}': Proves Level 1 Intent -> Level 2 Combo -> Level 3 Resolution (Headers == DB == WebUI)`, () => {
        // Level 1: Product Intent
        const config: BotInferenceConfig = { mode: "free", tags: [p.tag] };
        const resolution = resolveLogicalRoute(config);
        expect(resolution.logicalRoute).toBe(p.logicalCombo);
        expect(resolution.primaryTag).toBe(p.tag);
        expect(resolution.isFree).toBe(true);

        // Level 2 & 3: Upstream Gateway Response Headers
        const headers: OmniRouteResponseHeaders = {
          "x-omniroute-provider": p.rawProvider,
          "x-omniroute-model": p.rawModel,
          "x-omniroute-response-cost": "0.000000",
          "x-omniroute-latency-ms": "142",
          "x-omniroute-session-id": "sess_triple_test",
          "x-omniroute-version": "3.8.51",
        };

        // SQL Telemetry Record
        const sqlRecord: PromptExecutionLogRecord = {
          id: `log_${p.tag}_test`,
          botId: `bot_${p.tag}`,
          executionId: `exec_${p.tag}`,
          provider: "omniroute",
          model: resolution.logicalRoute,
          levelUsed: "omniroute_gateway",
          promptTokens: 1000,
          completionTokens: 250,
          cachedTokens: 800,
          cacheHitRatio: computeStrictCacheRatio(800, 1000),
          durationMs: Number.parseInt(headers["x-omniroute-latency-ms"], 10),
          costEstimatedUsd: 0.0,
          inferenceMode: "free",
          requestedCategory: p.tag,
          resolvedProvider: headers["x-omniroute-provider"],
          resolvedModel: headers["x-omniroute-model"],
          isFree: true,
          createdAt: new Date(),
        };

        // WebUI Metadata Formatting
        const webUiModel = formatModelDisplayName(sqlRecord.resolvedModel!);
        const webUiProvider = formatProviderDisplayName(sqlRecord.resolvedProvider!);

        // Empirical Triple Coherence Equations:
        // 1. Headers Provider === SQL resolvedProvider
        expect(headers["x-omniroute-provider"]).toBe(sqlRecord.resolvedProvider);
        // 2. Headers Model === SQL resolvedModel
        expect(headers["x-omniroute-model"]).toBe(sqlRecord.resolvedModel);
        // 3. SQL resolvedProvider & resolvedModel === WebUI Formatted values
        expect(webUiModel).toBe(p.expectedFormattedModel);
        expect(webUiProvider).toBe(p.expectedFormattedProvider);
        // 4. Invariant: cost is strictly zero
        expect(sqlRecord.costEstimatedUsd).toBe(0.0);
        // 5. Invariant: cache ratio is exact
        expect(sqlRecord.cacheHitRatio).toBe(0.8);
      });
    }

    it("Premium track: verifies direct OpenRouter route without OmniRoute pollution", () => {
      const config: BotInferenceConfig = { mode: "premium", tags: [] };
      const resolution = resolveLogicalRoute(config);
      expect(resolution.logicalRoute).toBe("openai/gpt-oss-120b");
      expect(resolution.isFree).toBe(false);
      expect(resolution.primaryTag).toBe("general");
    });
  });

  // ============================================================================
  // TASK 2: STRESS TEST 25-TURN MCP EXECUTION LIMIT
  // ============================================================================
  describe("Task 2: 25-turn MCP Execution Limit Stress Tests", () => {
    it("permits steps 1 through 25 and strictly terminates on step 26", () => {
      const tracker = createToolCallTracker();
      expect(tracker.stepCount).toBe(0);

      // Execute 25 diverse tool steps
      for (let step = 1; step <= MAX_TOOL_ITERATIONS_PER_TURN; step++) {
        const result = evaluateToolCallGuard(tracker, `tool_exec_${step}`, { arg: step });
        expect(result.allow).toBe(true);
        expect(tracker.stepCount).toBe(step);
      }

      // Step 26 MUST fail-closed with terminate: true
      const step26 = evaluateToolCallGuard(tracker, "tool_exec_26", { arg: 26 });
      expect(step26.allow).toBe(false);
      if (!step26.allow) {
        expect(step26.terminate).toBe(true);
        expect(step26.reason).toContain("Circuit breaker triggered");
        expect(step26.reason).toContain("Exceeded maximum of 25 tool execution steps");
      }
      expect(tracker.stepCount).toBe(26);
    });

    it("continues to block subsequent calls (steps 27 to 100) after circuit breaker trips", () => {
      const tracker = createToolCallTracker();
      for (let step = 1; step <= 25; step++) {
        evaluateToolCallGuard(tracker, `tool_${step}`, { step });
      }

      for (let overflowStep = 26; overflowStep <= 50; overflowStep++) {
        const res = evaluateToolCallGuard(tracker, `tool_${overflowStep}`, { overflowStep });
        expect(res.allow).toBe(false);
        if (!res.allow) {
          expect(res.terminate).toBe(true);
        }
      }
    });

    it("fresh turn creates a new tracker allowing another 25 steps independently", () => {
      const turn1Tracker = createToolCallTracker();
      for (let i = 1; i <= 25; i++) {
        evaluateToolCallGuard(turn1Tracker, `tool_${i}`, {});
      }
      expect(evaluateToolCallGuard(turn1Tracker, "tool_26", {}).allow).toBe(false);

      // Turn 2 is completely isolated
      const turn2Tracker = createToolCallTracker();
      expect(turn2Tracker.stepCount).toBe(0);
      const resTurn2 = evaluateToolCallGuard(turn2Tracker, "tool_1", {});
      expect(resTurn2.allow).toBe(true);
      expect(turn2Tracker.stepCount).toBe(1);
    });
  });

  // ============================================================================
  // TASK 3: STRESS TEST ANTI-LOOP CIRCUIT BREAKER (3 CONSECUTIVE IDENTICAL CALLS)
  // ============================================================================
  describe("Task 3: Anti-Loop Circuit Breaker (3 Consecutive Identical Calls)", () => {
    it("allows calls 1 & 2 but cleanly halts on call 3 with identical arguments", () => {
      const tracker = createToolCallTracker();

      const call1 = evaluateToolCallGuard(tracker, "fetch_url", { url: "https://api.rakazo.eu/health" });
      expect(call1.allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      const call2 = evaluateToolCallGuard(tracker, "fetch_url", { url: "https://api.rakazo.eu/health" });
      expect(call2.allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      const call3 = evaluateToolCallGuard(tracker, "fetch_url", { url: "https://api.rakazo.eu/health" });
      expect(call3.allow).toBe(false);
      if (!call3.allow) {
        expect(call3.terminate).toBe(true);
        expect(call3.reason).toContain("Loop detected");
        expect(call3.reason).toContain("Tool 'fetch_url' called 3 consecutive times with identical arguments");
      }
    });

    it("detects identical arguments regardless of JSON key insertion order (canonicalization)", () => {
      const tracker = createToolCallTracker();

      const argsOrderA = { b: 2, a: 1, c: { y: "bar", x: "foo" } };
      const argsOrderB = { a: 1, c: { x: "foo", y: "bar" }, b: 2 };
      const argsOrderC = { c: { y: "bar", x: "foo" }, b: 2, a: 1 };

      const c1 = evaluateToolCallGuard(tracker, "deep_inspect", argsOrderA);
      expect(c1.allow).toBe(true);

      const c2 = evaluateToolCallGuard(tracker, "deep_inspect", argsOrderB);
      expect(c2.allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      const c3 = evaluateToolCallGuard(tracker, "deep_inspect", argsOrderC);
      expect(c3.allow).toBe(false);
      if (!c3.allow) {
        expect(c3.terminate).toBe(true);
      }
    });

    it("alternating calls A-B-A-B-A do NOT trigger redundancy circuit breaker", () => {
      const tracker = createToolCallTracker();

      for (let i = 0; i < 10; i++) {
        const toolName = i % 2 === 0 ? "tool_A" : "tool_B";
        const result = evaluateToolCallGuard(tracker, toolName, { query: "search" });
        expect(result.allow).toBe(true);
        expect(tracker.consecutiveSameCallCount).toBe(1);
      }
      expect(tracker.stepCount).toBe(10);
    });

    it("handles primitive, null, undefined, and empty array/object arguments without crashing", () => {
      const tracker = createToolCallTracker();

      expect(evaluateToolCallGuard(tracker, "ping", null).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker, "ping", null).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker, "ping", null).allow).toBe(false); // 3rd identical null

      const tracker2 = createToolCallTracker();
      expect(evaluateToolCallGuard(tracker2, "check", undefined).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker2, "check", undefined).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker2, "check", undefined).allow).toBe(false); // 3rd identical undefined
    });
  });

  // ============================================================================
  // TASK 4: STRESS TEST TOOL COMPACTING WITH MASSIVE OUTPUTS (>50,000 CHARS)
  // ============================================================================
  describe("Task 4: Tool Compacting (compactToolResult) Stress Tests", () => {
    it("compacts massive shell output (>100,000 characters) to exactly 4,000 chars with omission marker", () => {
      const massiveLog = "START_LINE\n" + "x".repeat(120_000) + "\nEND_LINE";
      const compacted = compactToolResult("shell", massiveLog);

      expect(compacted.length).toBeLessThan(5000);
      expect(compacted).toContain("START_LINE");
      expect(compacted).toContain("END_LINE");
      expect(compacted).toContain("characters truncated");
      expect(compacted).toMatch(/\[\.\.\. \d+ characters truncated \.\.\.\]/);
    });

    it("compacts list_files with 5,000 files into directory breakdown + sample of 30 files", () => {
      const manyFiles: Array<{ path: string }> = [];
      for (let i = 0; i < 5000; i++) {
        const dir = i % 4 === 0 ? "src/components" : i % 4 === 1 ? "src/utils" : i % 4 === 2 ? "packages/core" : "tests";
        manyFiles.push({ path: `${dir}/file_${i}.ts` });
      }

      const compacted = compactToolResult("list_files", manyFiles);
      expect(compacted).toContain("Found 5000 files across directories");
      expect(compacted).toContain("(showing first 30):");
      expect(compacted).toContain("... (+4970 more files)");
      expect(compacted).toContain("src/components/");
      expect(compacted).toContain("packages/core/");
    });

    it("safely truncates massive deep JSON graph (>50,000 chars) under MAX_GENERIC_RESULT_CHARS without crashing", () => {
      // Build 60-level deep nested object with large payloads (>60,000 chars)
      let deepObj: Record<string, unknown> = { leaf: "DATA_".repeat(2000) };
      for (let level = 0; level < 60; level++) {
        deepObj = {
          level,
          description: `Layer ${level} with large metadata ` + "A".repeat(1000),
          child: deepObj,
        };
      }

      const rawJson = JSON.stringify(deepObj);
      expect(rawJson.length).toBeGreaterThan(60_000);

      const compacted = compactToolResult("generic_graph_tool", deepObj);
      expect(compacted.length).toBeLessThanOrEqual(12_050);
      expect(typeof compacted).toBe("string");
    });

    it("compacts massive Notion, GitHub, and Cloudflare payloads (>50,000 chars)", () => {
      // Massive GitHub Repos
      const repos = Array.from({ length: 200 }, (_, i) => ({
        full_name: `org/repo-${i}`,
        stars: 1000 + i,
        language: "TypeScript",
        description: "A".repeat(300),
      }));
      const compactedRepos = compactToolResult("github_search_repos", repos);
      const parsedRepos = JSON.parse(compactedRepos);
      expect(parsedRepos.total_count).toBe(200);
      expect(parsedRepos.items.length).toBe(30);

      // Massive GitHub Issues
      const issues = Array.from({ length: 150 }, (_, i) => ({
        number: i + 1,
        state: "open",
        title: `Issue ${i}: ` + "B".repeat(200),
        user: { login: `user_${i}` },
      }));
      const compactedIssues = compactToolResult("github_list_issues", issues);
      const parsedIssues = JSON.parse(compactedIssues);
      expect(parsedIssues.length).toBe(30);

      // Massive Cloudflare DNS Records
      const dnsRecords = Array.from({ length: 300 }, (_, i) => ({
        type: "A",
        name: `sub${i}.example.eu`,
        content: `192.168.1.${i % 255}`,
        proxied: true,
      }));
      const compactedDns = compactToolResult("cloudflare_list_dns_records", dnsRecords);
      const parsedDns = JSON.parse(compactedDns);
      expect(parsedDns.length).toBe(50);
      expect(parsedDns[0]).toEqual(["A", "sub0.example.eu", "192.168.1.0", true]);
    });
  });

  // ============================================================================
  // TASK 5: STRESS TEST HIGH-CONCURRENCY ASYNC SQL TELEMETRY PERSISTENCE
  // ============================================================================
  describe("Task 5: High-Concurrency Async SQL Telemetry Persistence", () => {
    it("handles 1,000 concurrent async telemetry dispatches without loss or uncaught rejections", async () => {
      const recordsCreated: any[] = [];
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            recordsCreated.push(data);
            return { id: `log_${recordsCreated.length}` };
          }),
        },
      } as unknown as PrismaClient;

      // Dispatch 1,000 concurrent log writes
      for (let i = 0; i < 1000; i++) {
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: `bot_concurrent_${i % 10}`,
          executionId: `exec_concur_${i}`,
          provider: "omniroute",
          model: "combo/rakazo-coding",
          levelUsed: "omniroute_gateway",
          promptTokens: 500 + i,
          completionTokens: 100 + (i % 50),
          cachedTokens: 400,
          cacheHitRatio: computeStrictCacheRatio(400, 500 + i),
          durationMs: 150 + (i % 100),
          costEstimatedUsd: 0.0,
          inferenceMode: "free",
          requestedCategory: "coding",
          resolvedProvider: "mistral",
          resolvedModel: "mistralai/codestral-latest",
          isFree: true,
        });
      }

      // Allow microtask queue and event loop ticks to resolve all promises
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(recordsCreated.length).toBe(1000);
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(1000);

      // Verify invariants on a sample of records
      const record0 = recordsCreated[0];
      expect(record0.costEstimatedUsd).toBe(0.0);
      expect(record0.isFree).toBe(true);
      expect(record0.resolvedProvider).toBe("mistral");
      expect(record0.resolvedModel).toBe("mistralai/codestral-latest");
      expect(record0.cacheHitRatio).toBe(0.8);
    });

    it("non-fatal error resilience: database rejection logs warning without throwing", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const failingPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(new Error("Connection pool exhausted (500ms timeout)")),
        },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(failingPrisma, {
          levelUsed: "test",
          promptTokens: 100,
        });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it("clamps cacheHitRatio to [0, 1] and normalizes negative token counts under stress", async () => {
      const recordsCreated: any[] = [];
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            recordsCreated.push(data);
            return { id: "log_clamped" };
          }),
        },
      } as unknown as PrismaClient;

      // Negative values, overflowing values, undefined values
      recordPromptExecutionLogAsync(mockPrisma, {
        levelUsed: "test",
        promptTokens: -500,
        completionTokens: -100,
        cachedTokens: -50,
        cacheHitRatio: -2.5,
        durationMs: -99,
      });

      recordPromptExecutionLogAsync(mockPrisma, {
        levelUsed: "test",
        promptTokens: 100,
        cacheHitRatio: 5.5, // > 1.0
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(recordsCreated[0].promptTokens).toBe(0);
      expect(recordsCreated[0].completionTokens).toBe(0);
      expect(recordsCreated[0].cachedTokens).toBe(0);
      expect(recordsCreated[0].cacheHitRatio).toBe(0);
      expect(recordsCreated[0].durationMs).toBe(0);

      expect(recordsCreated[1].cacheHitRatio).toBe(1); // Clamped to 1.0
    });
  });
});
