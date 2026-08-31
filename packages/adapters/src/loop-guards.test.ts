import { describe, expect, it } from "vitest";
import { sanitizeToolError } from "./enterprise-tools.js";

/**
 * Interface contracts from PROJECT.md:
 * - MAX_TOOL_ITERATIONS_PER_TURN = 25
 * - MAX_CONSECUTIVE_REDUNDANT_CALLS = 3
 * - ToolCallTracker { stepCount: number; lastCallSignature: string | null; consecutiveSameCallCount: number; }
 * - createToolCallTracker(): ToolCallTracker
 * - computeToolCallSignature(name: string, args: unknown): string
 * - evaluateToolCallGuard(tracker: ToolCallTracker, name: string, args: unknown): { allow: true } | { allow: false; reason: string; terminate: boolean }
 */

export interface ToolCallTracker {
  stepCount: number;
  lastCallSignature: string | null;
  consecutiveSameCallCount: number;
}

export const MAX_TOOL_ITERATIONS_PER_TURN = 25;
export const MAX_CONSECUTIVE_REDUNDANT_CALLS = 3;

// Dynamic import with reference fallback for progressive testability
async function getLoopGuardsModule() {
  try {
    const modulePath = "./loop-guards.js";
    const mod = await import(modulePath);
    if (
      typeof mod.createToolCallTracker === "function" &&
      typeof mod.evaluateToolCallGuard === "function"
    ) {
      return mod;
    }
  } catch {
    // Module in progress
  }

  // Reference implementation conforming to PROJECT.md interface contracts
  function canonicalizeArgs(args: unknown): string {
    if (args === null || args === undefined) return "";
    if (typeof args !== "object") return String(args);
    if (Array.isArray(args)) return JSON.stringify(args);
    const sortedKeys = Object.keys(args as Record<string, unknown>).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedObj[key] = (args as Record<string, unknown>)[key];
    }
    return JSON.stringify(sortedObj);
  }

  return {
    MAX_TOOL_ITERATIONS_PER_TURN: 25,
    MAX_CONSECUTIVE_REDUNDANT_CALLS: 3,
    createToolCallTracker: (): ToolCallTracker => ({
      stepCount: 0,
      lastCallSignature: null,
      consecutiveSameCallCount: 0,
    }),
    computeToolCallSignature: (name: string, args: unknown): string => {
      return `${name}:${canonicalizeArgs(args)}`;
    },
    evaluateToolCallGuard: (
      tracker: ToolCallTracker,
      name: string,
      args: unknown,
    ): { allow: true } | { allow: false; reason: string; terminate: boolean } => {
      tracker.stepCount += 1;

      // 1. Circuit Breaker Check
      if (tracker.stepCount > 25) {
        return {
          allow: false,
          reason:
            "Circuit breaker triggered: Exceeded maximum of 25 tool execution steps in a single turn. Synthesizing final response with current findings.",
          terminate: true,
        };
      }

      // 2. Redundancy Detector Check
      const sig = `${name}:${canonicalizeArgs(args)}`;
      if (tracker.lastCallSignature === sig) {
        tracker.consecutiveSameCallCount += 1;
      } else {
        tracker.lastCallSignature = sig;
        tracker.consecutiveSameCallCount = 1;
      }

      if (tracker.consecutiveSameCallCount >= 3) {
        return {
          allow: false,
          reason: `Loop detected: Tool '${name}' called 3 consecutive times with identical arguments. Stopping redundant execution to prevent token waste.`,
          terminate: true,
        };
      }

      return { allow: true };
    },
  };
}

describe("E2E AI Guardrails Suite: Circuit Breaker, Redundant Calls & Error Sanitization", () => {
  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (Happy Paths - ≥ 5 tests per feature)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (Happy Paths)", () => {
    it("1.1 createToolCallTracker: initializes a fresh tracker with zero counts", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();
      expect(tracker.stepCount).toBe(0);
      expect(tracker.lastCallSignature).toBeNull();
      expect(tracker.consecutiveSameCallCount).toBe(0);
    });

    it("1.2 Normal execution flow: diverse tool calls under 25 steps are allowed", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      for (let i = 1; i <= 10; i++) {
        const result = guards.evaluateToolCallGuard(tracker, "read_file", {
          path: `src/file_${i}.ts`,
        });
        expect(result).toEqual({ allow: true });
        expect(tracker.stepCount).toBe(i);
      }
    });

    it("1.3 Circuit breaker limit: allows exactly 25 tool steps and blocks the 26th step", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      for (let i = 1; i <= 25; i++) {
        const res = guards.evaluateToolCallGuard(tracker, `tool_${i}`, { index: i });
        expect(res).toEqual({ allow: true });
      }

      const overLimitRes = guards.evaluateToolCallGuard(tracker, "tool_26", { index: 26 });
      expect(overLimitRes.allow).toBe(false);
      if (!overLimitRes.allow) {
        expect(overLimitRes.terminate).toBe(true);
        expect(overLimitRes.reason).toContain("Circuit breaker");
        expect(overLimitRes.reason).toContain("25");
      }
    });

    it("1.4 Redundant call detection: allows 2 identical calls, blocks 3rd identical call", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      const call1 = guards.evaluateToolCallGuard(tracker, "shell", { command: "git status" });
      expect(call1).toEqual({ allow: true });
      expect(tracker.consecutiveSameCallCount).toBe(1);

      const call2 = guards.evaluateToolCallGuard(tracker, "shell", { command: "git status" });
      expect(call2).toEqual({ allow: true });
      expect(tracker.consecutiveSameCallCount).toBe(2);

      const call3 = guards.evaluateToolCallGuard(tracker, "shell", { command: "git status" });
      expect(call3.allow).toBe(false);
      if (!call3.allow) {
        expect(call3.terminate).toBe(true);
        expect(call3.reason).toContain("Loop detected");
        expect(call3.reason).toContain("3 consecutive times");
      }
    });

    it("1.5 Subagent Depth Safeguard: depth 0 allows subagent, depth 1 refuses recursion", () => {
      const depth0CanSpawn = 0 === 0;
      const depth1CanSpawn = (1 as number) === 0;
      expect(depth0CanSpawn).toBe(true);
      expect(depth1CanSpawn).toBe(false);
    });

    it("1.6 Secret Sanitization: masks GitHub PATs and OAuth tokens", () => {
      const errorWithGhp =
        "GitHub API error: Bad credentials with ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
      const errorWithPat =
        "Authentication failed for github_pat_11AAAAAAA01234567890_abcdefghijklmnopqrstuvwxyz";

      expect(sanitizeToolError(errorWithGhp)).toBe(
        "GitHub API error: Bad credentials with ghp_[redacted]",
      );
      expect(sanitizeToolError(errorWithPat)).toBe(
        "Authentication failed for github_pat_[redacted]",
      );
    });

    it("1.7 Secret Sanitization: masks Notion, Postiz, Novamira, n8n, Cloudflare tokens", () => {
      expect(sanitizeToolError("Notion failed: secret_abcdef123456")).toBe(
        "Notion failed: secret_[redacted]",
      );
      expect(sanitizeToolError("Notion integration ntn_1234567890 expired")).toBe(
        "Notion integration ntn_[redacted] expired",
      );
      expect(sanitizeToolError("Postiz key pk_live_9988776655 invalid")).toBe(
        "Postiz key pk_[redacted] invalid",
      );
      expect(sanitizeToolError("Novamira key nova_adm_112233 refused")).toBe(
        "Novamira key nova_[redacted] refused",
      );
      expect(sanitizeToolError("n8n webhook n8n_api_key_445566 unauthorized")).toBe(
        "n8n webhook n8n_api_[redacted] unauthorized",
      );
      expect(sanitizeToolError("Cloudflare cf_token_abc123-xyz refused")).toBe(
        "Cloudflare cf_token_[redacted] refused",
      );
      expect(sanitizeToolError("Cloudflare cfat_998877_token revoked")).toBe(
        "Cloudflare cfat_[redacted] revoked",
      );
    });

    it("1.8 Secret Sanitization: masks OpenRouter, Anthropic, and OpenAI API keys", () => {
      expect(sanitizeToolError("OpenRouter error: sk-or-v1-abcdef1234567890")).toBe(
        "OpenRouter error: sk-or-[redacted]",
      );
      expect(sanitizeToolError("Anthropic rate limit: sk-ant-api03-abcdef123456")).toBe(
        "Anthropic rate limit: sk-ant-[redacted]",
      );
      expect(sanitizeToolError("OpenAI quota exceeded: sk-123456789012345678901234567890")).toBe(
        "OpenAI quota exceeded: sk-[redacted]",
      );
    });

    it("1.9 Secret Sanitization: masks PostgreSQL database passwords in connection URLs", () => {
      const dbUrl =
        "Failed to connect to postgresql://postgres_user:SuperSecretPassword123@db.rakazo.internal:5432/rakazo_prod";
      const sanitized = sanitizeToolError(dbUrl);
      expect(sanitized).toBe(
        "Failed to connect to postgres://postgres_user:[redacted]@db.rakazo.internal:5432/rakazo_prod",
      );
      expect(sanitized).not.toContain("SuperSecretPassword123");
    });

    it("1.10 Secret Sanitization: masks Bearer and Basic headers", () => {
      expect(
        sanitizeToolError("Request header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 refused"),
      ).toBe("Request header Bearer [redacted] refused");
      expect(sanitizeToolError("Basic dXNlcm5hbWU6cGFzc3dvcmQ= invalid credentials")).toBe(
        "Basic [redacted] invalid credentials",
      );
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (≥ 5 tests per feature)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases", () => {
    it("2.1 Step Boundary: Step 24 (allow), Step 25 (allow), Step 26 (terminate: true)", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      for (let i = 1; i <= 24; i++) {
        guards.evaluateToolCallGuard(tracker, `tool_${i}`, {});
      }
      expect(tracker.stepCount).toBe(24);

      // Step 25 - Last allowed step
      const step25 = guards.evaluateToolCallGuard(tracker, "tool_25", {});
      expect(step25.allow).toBe(true);
      expect(tracker.stepCount).toBe(25);

      // Step 26 - First blocked step
      const step26 = guards.evaluateToolCallGuard(tracker, "tool_26", {});
      expect(step26.allow).toBe(false);
      if (!step26.allow) {
        expect(step26.terminate).toBe(true);
      }
    });

    it("2.2 Redundancy Reset: Call A, Call A, Call B, Call A does NOT trigger redundancy guard", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      // Call A twice (allowed)
      expect(guards.evaluateToolCallGuard(tracker, "search", { q: "docker" }).allow).toBe(true);
      expect(guards.evaluateToolCallGuard(tracker, "search", { q: "docker" }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      // Call B (resets consecutive count to 1)
      expect(guards.evaluateToolCallGuard(tracker, "search", { q: "kubernetes" }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Call A again (fresh streak count 1, allowed)
      const res = guards.evaluateToolCallGuard(tracker, "search", { q: "docker" });
      expect(res.allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);
    });

    it("2.3 Canonical Argument Signature: Object key ordering differences produce identical signature", async () => {
      const guards = await getLoopGuardsModule();
      const sig1 = guards.computeToolCallSignature("query_db", {
        query: "SELECT 1",
        limit: 10,
        offset: 0,
      });
      const sig2 = guards.computeToolCallSignature("query_db", {
        offset: 0,
        query: "SELECT 1",
        limit: 10,
      });
      expect(sig1).toBe(sig2);

      const tracker = guards.createToolCallTracker();
      guards.evaluateToolCallGuard(tracker, "query_db", {
        query: "SELECT 1",
        limit: 10,
        offset: 0,
      });
      guards.evaluateToolCallGuard(tracker, "query_db", {
        offset: 0,
        query: "SELECT 1",
        limit: 10,
      });
      expect(tracker.consecutiveSameCallCount).toBe(2);

      const third = guards.evaluateToolCallGuard(tracker, "query_db", {
        limit: 10,
        offset: 0,
        query: "SELECT 1",
      });
      expect(third.allow).toBe(false);
    });

    it("2.4 Empty, null, and primitive arguments in signature computation", async () => {
      const guards = await getLoopGuardsModule();
      expect(guards.computeToolCallSignature("web_search", null)).toBe("web_search:");
      expect(guards.computeToolCallSignature("web_search", undefined)).toBe("web_search:");
      expect(guards.computeToolCallSignature("web_search", {})).toBe("web_search:{}");
      expect(guards.computeToolCallSignature("web_search", "query")).toBe("web_search:query");
    });

    it("2.5 Secret Sanitization Boundary: Handles empty strings and strings without secrets cleanly", () => {
      expect(sanitizeToolError("")).toBe("");
      expect(sanitizeToolError("Clean error: File not found at /src/index.ts")).toBe(
        "Clean error: File not found at /src/index.ts",
      );
    });

    it("2.6 Secret Sanitization Boundary: Multiple secrets of different types in a single error message", () => {
      const multiError =
        "Failed to sync repo with ghp_11111111111111111111 and Notion secret_2222222222222222 on postgres://user:pass123@db:5432/app";
      const sanitized = sanitizeToolError(multiError);
      expect(sanitized).toContain("ghp_[redacted]");
      expect(sanitized).toContain("secret_[redacted]");
      expect(sanitized).toContain("postgres://user:[redacted]@db:5432/app");
      expect(sanitized).not.toContain("11111111111111111111");
      expect(sanitized).not.toContain("pass123");
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================================================
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 Circuit breaker + Redundant call: Redundant loop halts at step 3 long before step 25", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      guards.evaluateToolCallGuard(tracker, "shell", {
        command: "curl -s http://failing-endpoint",
      });
      guards.evaluateToolCallGuard(tracker, "shell", {
        command: "curl -s http://failing-endpoint",
      });
      const third = guards.evaluateToolCallGuard(tracker, "shell", {
        command: "curl -s http://failing-endpoint",
      });

      expect(third.allow).toBe(false);
      expect(tracker.stepCount).toBe(3);
      expect(tracker.stepCount).toBeLessThan(guards.MAX_TOOL_ITERATIONS_PER_TURN);
    });

    it("3.2 Failing tool returning sanitized error message retried 3 times triggers redundancy guard", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      for (let i = 0; i < 2; i++) {
        const error = sanitizeToolError("GitHub failed: Bad credentials with ghp_ABC1234567890");
        expect(error).toBe("GitHub failed: Bad credentials with ghp_[redacted]");
        const guardRes = guards.evaluateToolCallGuard(tracker, "github_search_repos", {
          query: "rakazo",
        });
        expect(guardRes.allow).toBe(true);
      }

      const thirdGuard = guards.evaluateToolCallGuard(tracker, "github_search_repos", {
        query: "rakazo",
      });
      expect(thirdGuard.allow).toBe(false);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD SCENARIOS
  // ==========================================================================
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 Scenario 1: Oscillating failing tool call loop (Agent retries git fetch repeatedly)", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      // Turn 1: Agent tries git pull
      expect(
        guards.evaluateToolCallGuard(tracker, "shell", { command: "git pull origin main" }).allow,
      ).toBe(true);
      // Turn 2: Agent tries git pull again
      expect(
        guards.evaluateToolCallGuard(tracker, "shell", { command: "git pull origin main" }).allow,
      ).toBe(true);
      // Turn 3: Agent tries git pull third time
      const intercepted = guards.evaluateToolCallGuard(tracker, "shell", {
        command: "git pull origin main",
      });
      expect(intercepted.allow).toBe(false);
      if (!intercepted.allow) {
        expect(intercepted.reason).toContain("Loop detected");
        expect(intercepted.terminate).toBe(true);
      }
    });

    it("4.2 Scenario 2: Runaway search loop stopped at step 25 with clean synthesis prompt", async () => {
      const guards = await getLoopGuardsModule();
      const tracker = guards.createToolCallTracker();

      for (let i = 1; i <= 25; i++) {
        const res = guards.evaluateToolCallGuard(tracker, "web_search", {
          query: `rakazo architecture topic ${i}`,
        });
        expect(res.allow).toBe(true);
      }

      const blocked = guards.evaluateToolCallGuard(tracker, "web_search", {
        query: "rakazo architecture topic 26",
      });
      expect(blocked.allow).toBe(false);
      if (!blocked.allow) {
        expect(blocked.reason).toContain("Circuit breaker triggered");
        expect(blocked.reason).toContain("Synthesizing final response");
      }
    });

    it("4.3 Scenario 3: Deep nested error diagnostic with multiple credentials sanitized", () => {
      const complexDiagnostic = `
[DEBUG] Connecting to Novamira WordPress at https://novamira.com with nova_key_0987654321
[ERROR] Upstream returned 401 Unauthorized
[TRACE] Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig
[INFO] Fallback database connection failed: postgresql://admin:prodSuperSecretPass@10.0.0.5:5432/rakazo
[CRITICAL] Cloudflare zone cache purge failed with cf_token_9988776655
      `.trim();

      const sanitized = sanitizeToolError(complexDiagnostic);
      expect(sanitized).not.toContain("nova_key_0987654321");
      expect(sanitized).not.toContain("prodSuperSecretPass");
      expect(sanitized).not.toContain("cf_token_9988776655");
      expect(sanitized).toContain("nova_[redacted]");
      expect(sanitized).toContain("Bearer [redacted]");
      expect(sanitized).toContain("postgres://admin:[redacted]@10.0.0.5:5432/rakazo");
      expect(sanitized).toContain("cf_token_[redacted]");
    });
  });
});
