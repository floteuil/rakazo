import { describe, expect, it } from "vitest";
import type { SkillItemLike } from "./executor.js";
import {
  computeToolCallSignature,
  createToolCallTracker,
  evaluateToolCallGuard,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
  MAX_TOOL_ITERATIONS_PER_TURN,
} from "./loop-guards.js";
import {
  assemble4BlockCachePrompt,
  computeSessionAffinityKey,
  extractCacheTelemetry,
} from "./prefix-caching.js";
import { compactToolResult } from "./tool-compacting.js";

describe("CHALLENGER 1 — Empirical Stress Test & Adversarial Suite", () => {
  // =========================================================================
  // 1. BOUNDARY CONDITIONS ON CACHE HIT RATIO FORMULA
  // =========================================================================
  describe("1. Cache Hit Ratio Formula Boundary Stress Testing", () => {
    it("1.1 Handles zero tokens and empty payloads without division-by-zero or NaN", () => {
      const cases = [
        {},
        { prompt_tokens: 0, cached_tokens: 0 },
        { prompt_tokens: 0, completion_tokens: 0 },
        { prompt_tokens_details: { cached_tokens: 0 } },
        { prompt_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
        { prompt_tokens: undefined, cached_tokens: undefined },
      ];

      for (const c of cases) {
        const result = extractCacheTelemetry(c as any, 100);
        expect(Number.isNaN(result.cacheHitRatio)).toBe(false);
        expect(Number.isFinite(result.cacheHitRatio)).toBe(true);
        expect(result.cacheHitRatio).toBe(0.0);
        expect(result.totalPromptTokens).toBe(0);
        expect(result.cachedTokens).toBe(0);
        expect(result.promptTokens).toBe(0);
      }
    });

    it("1.2 Handles huge / extreme token counts without floating point NaN / Infinity", () => {
      const hugeTokens = [
        { prompt_tokens: 1_000_000_000, cached_tokens: 800_000_000 },
        { prompt_tokens: Number.MAX_SAFE_INTEGER / 2, cached_tokens: Number.MAX_SAFE_INTEGER / 2 },
        { prompt_tokens: 1e15, cached_tokens: 5e14 },
      ];

      for (const c of hugeTokens) {
        const result = extractCacheTelemetry(c, 500);
        expect(Number.isNaN(result.cacheHitRatio)).toBe(false);
        expect(Number.isFinite(result.cacheHitRatio)).toBe(true);
        expect(result.cacheHitRatio).toBeGreaterThanOrEqual(0.0);
        expect(result.cacheHitRatio).toBeLessThanOrEqual(1.0);
      }

      // 50% ratio on equal large numbers
      const halfResult = extractCacheTelemetry(
        {
          prompt_tokens: 50_000_000,
          cached_tokens: 50_000_000,
        },
        500,
      );
      expect(halfResult.cacheHitRatio).toBe(0.5);
    });

    it("1.3 Handles negative values gracefully by bounding between [0.0, 1.0]", () => {
      const negativeCases = [
        { prompt_tokens: -100, cached_tokens: -50 },
        { prompt_tokens: 100, cached_tokens: -10 },
        { prompt_tokens: -50, cached_tokens: 100 },
        { prompt_tokens: -1000, cached_tokens: 0 },
      ];

      for (const c of negativeCases) {
        const result = extractCacheTelemetry(c, 10);
        expect(Number.isNaN(result.cacheHitRatio)).toBe(false);
        expect(result.cacheHitRatio).toBeGreaterThanOrEqual(0.0);
        expect(result.cacheHitRatio).toBeLessThanOrEqual(1.0);
      }
    });

    it("1.4 Handles decimal / floating point token counts properly", () => {
      const result = extractCacheTelemetry(
        {
          prompt_tokens: 25.5,
          cached_tokens: 74.5,
        },
        250,
      );
      expect(result.totalPromptTokens).toBe(100);
      expect(result.cacheHitRatio).toBeCloseTo(0.745, 3);
    });

    it("1.5 Validates hierarchy: prompt_tokens_details.cached_tokens takes precedence over cached_tokens", () => {
      const result = extractCacheTelemetry(
        {
          prompt_tokens: 200,
          cached_tokens: 100, // flat fallback
          prompt_tokens_details: { cached_tokens: 800 }, // primary
        },
        300,
      );

      expect(result.cachedTokens).toBe(800);
      expect(result.totalPromptTokens).toBe(1000);
      expect(result.cacheHitRatio).toBe(0.8);
    });

    it("1.6 Validates ratio clamping when cached_tokens exceeds total prompt tokens", () => {
      // Synthetic edge case where totalPromptTokens calculation might be skewed by negative prompt_tokens
      const result = extractCacheTelemetry(
        {
          prompt_tokens: -50,
          cached_tokens: 100,
        },
        100,
      );
      // totalPromptTokens = 100 + (-50) = 50. cachedTokens / totalPromptTokens = 100 / 50 = 2.0 -> clamped to 1.0
      expect(result.cacheHitRatio).toBe(1.0);
    });
  });

  // =========================================================================
  // 2. FNV-1A SESSION AFFINITY KEY GENERATION STRESS TESTING
  // =========================================================================
  describe("2. FNV-1a Session Affinity Key Generation Stress Testing", () => {
    it("2.1 Generates valid hexadecimal hash matching /^sess_[0-9a-f]{1,8}$/ for all inputs", () => {
      const testInputs = [
        { workspaceId: "ws1", botId: "bot1", threadId: "th1" },
        { workspaceId: "", botId: "", threadId: "" },
        { workspaceId: "a", botId: "b", threadId: "c" },
        { workspaceId: " ", botId: " ", threadId: " " },
        { workspaceId: "\0\n\r\t", botId: "\"'\\", threadId: "<>/?;:" },
      ];

      for (const input of testInputs) {
        const key = computeSessionAffinityKey(input);
        expect(key).toMatch(/^sess_[0-9a-f]{1,8}$/);
      }
    });

    it("2.2 Is 100% deterministic across 10,000 iterations with complex state", () => {
      const input = {
        workspaceId: "ws_prod_cluster_eu_west_1_enterprise_998877",
        botId: "bot_super_agent_autonomous_v3_release",
        threadId: "th_user_conversation_2026_08_31_17_44_00_xyz",
      };

      const baseKey = computeSessionAffinityKey(input);
      for (let i = 0; i < 10_000; i++) {
        expect(computeSessionAffinityKey(input)).toBe(baseKey);
      }
    });

    it("2.3 Stress tests with Unicode, accents, non-Latin scripts, and Emojis", () => {
      const unicodeCases = [
        // French
        { workspaceId: "ws_café_crème", botId: "bot_déjà_vu", threadId: "th_où_sont_les_œufs" },
        // Russian / Cyrillic
        { workspaceId: "ws_пространство", botId: "bot_агент", threadId: "th_разговор_123" },
        // Chinese / Japanese / Korean
        { workspaceId: "ws_工作区_东京", botId: "bot_智能机器人_99", threadId: "th_对话_日本語" },
        // Arabic (RTL)
        { workspaceId: "ws_مساحة_العمل", botId: "bot_روبوت", threadId: "th_جلسة_محادثة" },
        // Emojis & surrogate pairs
        { workspaceId: "ws_🚀🔥🤖", botId: "bot_✨🎉💎", threadId: "th_🎯⚡️🍀" },
        // Astral plane surrogate pairs (Unicode U+20000+)
        { workspaceId: "ws_\uD840\uDC00", botId: "bot_\uD840\uDC01", threadId: "th_\uD840\uDC02" },
        // Zero-width characters
        { workspaceId: "ws_\u200B\u200C\u200D", botId: "bot_\uFEFF", threadId: "th_\u0000" },
      ];

      for (const input of unicodeCases) {
        const key = computeSessionAffinityKey(input);
        expect(key).toMatch(/^sess_[0-9a-f]{1,8}$/);
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThanOrEqual(6); // 'sess_' + at least 1 hex digit
      }
    });

    it("2.4 Stress tests with extreme input lengths (100,000 characters)", () => {
      const longStringA = "A".repeat(33_333);
      const longStringB = "B".repeat(33_333);
      const longStringC = "C".repeat(33_334);

      const key = computeSessionAffinityKey({
        workspaceId: longStringA,
        botId: longStringB,
        threadId: longStringC,
      });

      expect(key).toMatch(/^sess_[0-9a-f]{1,8}$/);
    });

    it("2.5 Evaluates collision resistance and avalanche effect on 5,000 distinct permutations", () => {
      const generatedKeys = new Set<string>();
      const count = 5000;

      for (let i = 0; i < count; i++) {
        const key = computeSessionAffinityKey({
          workspaceId: `ws_${i}`,
          botId: `bot_${(i * 3) % 100}`,
          threadId: `th_${i}_${Date.now()}`,
        });
        generatedKeys.add(key);
      }

      // On 5000 distinct items with 32-bit hash, birthday paradox predicts < 3 collisions
      expect(generatedKeys.size).toBeGreaterThanOrEqual(4990);
    });

    it("2.6 Documents delimiter behavior when inputs contain colon characters", () => {
      // Note: Because input is joined by ':', {ws: 'a:b', bot: 'c', th: 'd'} produces 'a:b:c:d'
      const k1 = computeSessionAffinityKey({ workspaceId: "a:b", botId: "c", threadId: "d" });
      const k2 = computeSessionAffinityKey({ workspaceId: "a", botId: "b:c", threadId: "d" });
      expect(k1).toBe(k2); // Expected due to template literal concatenation format
    });
  });

  // =========================================================================
  // 3. AGENTIC LOOP GUARDS & CIRCUIT BREAKER STRESS TESTING
  // =========================================================================
  describe("3. Agentic Loop Guards & Circuit Breakers Stress Testing", () => {
    it("3.1 Enforces MAX_TOOL_ITERATIONS_PER_TURN = 25 ceiling strictly", () => {
      const tracker = createToolCallTracker();

      for (let step = 1; step <= 25; step++) {
        // Varying tool names to avoid triggering redundancy check
        const guard = evaluateToolCallGuard(tracker, `tool_${step}`, { step });
        expect(guard.allow).toBe(true);
        expect(tracker.stepCount).toBe(step);
      }

      // Step 26 must trigger circuit breaker
      const guard26 = evaluateToolCallGuard(tracker, "tool_26", { step: 26 });
      expect(guard26.allow).toBe(false);
      if (!guard26.allow) {
        expect(guard26.terminate).toBe(true);
        expect(guard26.reason).toContain("Circuit breaker triggered");
        expect(guard26.reason).toContain("25 tool execution steps");
      }
      expect(tracker.stepCount).toBe(26);

      // Step 27 continues to be blocked
      const guard27 = evaluateToolCallGuard(tracker, "tool_27", { step: 27 });
      expect(guard27.allow).toBe(false);
    });

    it("3.2 Enforces MAX_CONSECUTIVE_REDUNDANT_CALLS = 3 redundancy circuit breaker", () => {
      const tracker = createToolCallTracker();

      // Call 1: allowed
      const g1 = evaluateToolCallGuard(tracker, "web_search", { query: "Rakazo AI" });
      expect(g1.allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Call 2: allowed
      const g2 = evaluateToolCallGuard(tracker, "web_search", { query: "Rakazo AI" });
      expect(g2.allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      // Call 3: BLOCKED & TERMINATED
      const g3 = evaluateToolCallGuard(tracker, "web_search", { query: "Rakazo AI" });
      expect(g3.allow).toBe(false);
      if (!g3.allow) {
        expect(g3.terminate).toBe(true);
        expect(g3.reason).toContain("Loop detected");
        expect(g3.reason).toContain("web_search");
        expect(g3.reason).toContain("3 consecutive times");
      }
      expect(tracker.consecutiveSameCallCount).toBe(3);
    });

    it("3.3 Resets redundancy counter when tool or arguments change", () => {
      const tracker = createToolCallTracker();

      // 2 consecutive calls to web_search with query A
      expect(evaluateToolCallGuard(tracker, "web_search", { query: "A" }).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker, "web_search", { query: "A" }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      // Interleaved call to web_search with query B (resets counter)
      expect(evaluateToolCallGuard(tracker, "web_search", { query: "B" }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Call to query A again (starts at 1)
      expect(evaluateToolCallGuard(tracker, "web_search", { query: "A" }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Second call to query A (now at 2)
      expect(evaluateToolCallGuard(tracker, "web_search", { query: "A" }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      // Third call to query A (trips breaker)
      const tripped = evaluateToolCallGuard(tracker, "web_search", { query: "A" });
      expect(tripped.allow).toBe(false);
    });

    it("3.4 Canonicalizes object key order and nested structures in arguments", () => {
      const args1 = { z: 1, a: "test", m: [3, 2, 1], nested: { b: 2, a: 1 } };
      const args2 = { a: "test", nested: { a: 1, b: 2 }, m: [3, 2, 1], z: 1 };

      const sig1 = computeToolCallSignature("execute_code", args1);
      const sig2 = computeToolCallSignature("execute_code", args2);

      expect(sig1).toBe(sig2);

      // Test with tracker: alternating key ordering counts as redundant identical calls
      const tracker = createToolCallTracker();
      expect(evaluateToolCallGuard(tracker, "execute_code", args1).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker, "execute_code", args2).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      const g3 = evaluateToolCallGuard(tracker, "execute_code", args1);
      expect(g3.allow).toBe(false);
    });

    it("3.5 Handles non-serializable objects and circular references safely", () => {
      const circularObj: any = { name: "loop" };
      circularObj.self = circularObj;

      const sig = computeToolCallSignature("circular_tool", circularObj);
      expect(sig).toBe("circular_tool:unknown");

      const tracker = createToolCallTracker();
      expect(evaluateToolCallGuard(tracker, "circular_tool", circularObj).allow).toBe(true);
    });

    it("3.6 Handles null, undefined, primitives, and empty arguments in signatures", () => {
      expect(computeToolCallSignature("tool_null", null)).toBe("tool_null:");
      expect(computeToolCallSignature("tool_undef", undefined)).toBe("tool_undef:");
      expect(computeToolCallSignature("tool_num", 42)).toBe("tool_num:42");
      expect(computeToolCallSignature("tool_str", "hello")).toBe("tool_str:hello");
      expect(computeToolCallSignature("tool_bool", false)).toBe("tool_bool:false");
      expect(computeToolCallSignature("tool_obj", {})).toBe("tool_obj:{}");
    });
  });

  // =========================================================================
  // 4. COMBINED ADVERSARIAL STRESS SCENARIOS
  // =========================================================================
  describe("4. Combined Adversarial & Boundary Integration Scenarios", () => {
    it("4.1 Simulates rapid alternating tool cycles without tripping breaker prematurely", () => {
      const tracker = createToolCallTracker();
      // Alternating 2 tools 12 times each (24 steps total)
      for (let i = 0; i < 12; i++) {
        expect(evaluateToolCallGuard(tracker, "read_file", { path: `/tmp/file_${i}` }).allow).toBe(
          true,
        );
        expect(
          evaluateToolCallGuard(tracker, "write_file", { path: `/tmp/file_${i}`, data: "x" }).allow,
        ).toBe(true);
      }
      expect(tracker.stepCount).toBe(24);

      // 25th step allowed
      expect(evaluateToolCallGuard(tracker, "read_file", { path: "/tmp/file_done" }).allow).toBe(
        true,
      );
      expect(tracker.stepCount).toBe(25);

      // 26th step blocked by max iterations
      const blocked = evaluateToolCallGuard(tracker, "read_file", { path: "/tmp/file_done" });
      expect(blocked.allow).toBe(false);
      if (!blocked.allow) {
        expect(blocked.reason).toContain("Circuit breaker triggered");
      }
    });

    it("4.2 Validates 4-Block prompt assembly with extreme skill counts and history loads", () => {
      const skills: SkillItemLike[] = Array.from({ length: 50 }, (_, i) => ({
        id: `skill_${i}`,
        slug: `slug_${(50 - i).toString().padStart(3, "0")}`,
        name: `Skill Name ${i}`,
        description: `Description for skill ${i}`,
        content: `Skill content for skill ${i}`,
      }));

      const history = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message turn ${i}`,
        toolResults: [
          { toolName: "bash", result: { stdout: "output line 1\noutput line 2\n".repeat(50) } },
        ],
      }));

      const prompt = assemble4BlockCachePrompt({
        bot: {
          botName: "StressBot",
          botTitle: "Senior Stress Tester",
          instructions: "Analyze complex logs",
          activeSkills: skills,
        },
        history,
        currentTurn: {
          prompt: "Final evaluation query",
          attachedFiles: [{ name: "data.csv", path: "/tmp/data.csv", size: 1024 * 1024 * 5 }],
        },
      });

      expect(prompt.blocA).toContain("BLOC A");
      expect(prompt.blocB).toContain("BLOC B");
      expect(prompt.blocC).toContain("BLOC C");
      expect(prompt.blocD).toContain("BLOC D");
      expect(prompt.blocD).toContain("5120.0 Ko");
      expect(prompt.fullSystemPrompt.length).toBeGreaterThan(1000);
      expect(prompt.combinedContext).toContain(prompt.fullSystemPrompt);
      expect(prompt.combinedContext).toContain(prompt.fullUserPrompt);
    });
  });
});
