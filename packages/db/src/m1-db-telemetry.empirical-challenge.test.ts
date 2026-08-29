import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  type PromptExecutionLogInput,
  listPromptExecutionLogs,
  recordPromptExecutionLogAsync,
} from "./telemetry.js";

describe("Milestone M1 Empirical Challenge — Database Telemetry & Schema Invariants", () => {
  // ==========================================================================
  // 1. RECORD PROMPT EXECUTION LOG ASYNC — ADVERSARIAL & BOUNDARY TESTING
  // ==========================================================================
  describe("1. recordPromptExecutionLogAsync Boundary & Clamping", () => {
    it("handles extreme negative numbers by clamping to zero", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-extreme-neg" });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(prisma, {
        levelUsed: "level2_llm",
        promptTokens: -999999,
        completionTokens: -50000,
        cachedTokens: -12345,
        cacheHitRatio: -100.5,
        durationMs: -888888,
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          cacheHitRatio: 0,
          durationMs: 0,
        }),
      });
    });

    it("clamps cacheHitRatio to upper bound 1.0 when given values > 1.0", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-ratio-high" });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(prisma, {
        levelUsed: "level2_llm",
        cacheHitRatio: 5.75,
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cacheHitRatio: 1,
        }),
      });
    });

    it("accurately passes fractional cacheHitRatio in valid [0, 1] range", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-ratio-normal" });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(prisma, {
        levelUsed: "level2_llm",
        cacheHitRatio: 0.4285,
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cacheHitRatio: 0.4285,
        }),
      });
    });

    it("infers isFree=true and preserves inferenceMode='free' when mode is free", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-free-inf" });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(prisma, {
        levelUsed: "level2_llm",
        inferenceMode: "free",
        requestedCategory: "coding",
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inferenceMode: "free",
          requestedCategory: "coding",
          isFree: true,
        }),
      });
    });

    it("infers inferenceMode='free' and preserves isFree=true when isFree is true without explicit mode", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-free-flag" });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(prisma, {
        levelUsed: "level2_llm",
        isFree: true,
        requestedCategory: "fast",
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inferenceMode: "free",
          requestedCategory: "fast",
          isFree: true,
        }),
      });
    });

    it("preserves explicit premium mode with isFree=false", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-prem" });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(prisma, {
        levelUsed: "level2_llm",
        inferenceMode: "premium",
      });

      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inferenceMode: "premium",
          isFree: false,
        }),
      });
    });

    it("gracefully catches and absorbs database rejection without unhandled exception", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const create = vi.fn().mockRejectedValue(new Error("Simulated Database Connection Timeout"));
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      // Must not throw synchronously or cause unhandled promise rejection
      expect(() => {
        recordPromptExecutionLogAsync(prisma, {
          levelUsed: "level2_llm",
          botId: "bot-fail-1",
        });
      }).not.toThrow();

      // Yield event loop tick for async promise catch
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(create).toHaveBeenCalledTimes(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Telemetry:PromptExecutionLog] Non-fatal persistence error:"),
        expect.stringContaining("Simulated Database Connection Timeout"),
      );

      consoleSpy.mockRestore();
    });
  });

  // ==========================================================================
  // 2. LIST PROMPT EXECUTION LOGS — QUERY & FILTER VALIDATION
  // ==========================================================================
  describe("2. listPromptExecutionLogs Query Filtering", () => {
    it("builds query with default limit (50) and empty where when no filter is provided", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { promptExecutionLog: { findMany } } as unknown as PrismaClient;

      await listPromptExecutionLogs(prisma);

      expect(findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("filters precisely by inferenceMode: 'free'", async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: "free-1", inferenceMode: "free" }]);
      const prisma = { promptExecutionLog: { findMany } } as unknown as PrismaClient;

      const logs = await listPromptExecutionLogs(prisma, { inferenceMode: "free" });

      expect(findMany).toHaveBeenCalledWith({
        where: { inferenceMode: "free" },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      expect(logs).toHaveLength(1);
    });

    it("filters precisely by isFree: true", async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: "free-2", isFree: true }]);
      const prisma = { promptExecutionLog: { findMany } } as unknown as PrismaClient;

      await listPromptExecutionLogs(prisma, { isFree: true });

      expect(findMany).toHaveBeenCalledWith({
        where: { isFree: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("filters precisely by isFree: false", async () => {
      const findMany = vi.fn().mockResolvedValue([{ id: "paid-1", isFree: false }]);
      const prisma = { promptExecutionLog: { findMany } } as unknown as PrismaClient;

      await listPromptExecutionLogs(prisma, { isFree: false });

      expect(findMany).toHaveBeenCalledWith({
        where: { isFree: false },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("combines botId, model, inferenceMode, isFree, and custom limit", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { promptExecutionLog: { findMany } } as unknown as PrismaClient;

      await listPromptExecutionLogs(prisma, {
        botId: "bot-999",
        model: "qwen/qwen-2.5-coder-32b-instruct:free",
        inferenceMode: "free",
        isFree: true,
        limit: 15,
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          botId: "bot-999",
          model: "qwen/qwen-2.5-coder-32b-instruct:free",
          inferenceMode: "free",
          isFree: true,
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
    });
  });

  // ==========================================================================
  // 3. HIGH-CONCURRENCY TELEMETRY RECORDING STRESS HARNESS
  // ==========================================================================
  describe("3. Concurrency & Telemetry Load Stress Harness", () => {
    it("handles 1,000 rapid concurrent telemetry dispatches without drop or desync", async () => {
      const records: any[] = [];
      const create = vi.fn().mockImplementation(async ({ data }) => {
        records.push(data);
        return { id: `log-${records.length}` };
      });
      const prisma = { promptExecutionLog: { create } } as unknown as PrismaClient;

      const categories = ["coding", "writing", "reasoning", "fast", "analysis", null];
      const modes = ["free", "premium", null];

      for (let i = 0; i < 1000; i++) {
        const mode = modes[i % modes.length];
        const category = categories[i % categories.length];
        const isFree = mode === "free" ? true : (mode === "premium" ? false : undefined);

        recordPromptExecutionLogAsync(prisma, {
          botId: `bot-${i % 20}`,
          executionId: `exec-${i}`,
          provider: "omniroute",
          model: "meta-llama/llama-3.3-70b-instruct:free",
          levelUsed: "level2_llm",
          promptTokens: (i * 17) % 5000,
          completionTokens: (i * 7) % 2000,
          cachedTokens: (i * 5) % 1000,
          cacheHitRatio: (i % 100) / 100,
          durationMs: (i * 31) % 4000,
          inferenceMode: mode,
          requestedCategory: category,
          resolvedProvider: "openrouter",
          resolvedModel: "meta-llama/llama-3.3-70b-instruct:free",
          isFree,
        });
      }

      // Wait for all microtasks to resolve
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(create).toHaveBeenCalledTimes(1000);
      expect(records).toHaveLength(1000);

      // Validate every single inserted record adheres to clamping invariants
      for (const rec of records) {
        expect(rec.promptTokens).toBeGreaterThanOrEqual(0);
        expect(rec.completionTokens).toBeGreaterThanOrEqual(0);
        expect(rec.cachedTokens).toBeGreaterThanOrEqual(0);
        expect(rec.cacheHitRatio).toBeGreaterThanOrEqual(0);
        expect(rec.cacheHitRatio).toBeLessThanOrEqual(1);
        expect(rec.durationMs).toBeGreaterThanOrEqual(0);
        if (rec.inferenceMode === "free") {
          expect(rec.isFree).toBe(true);
        }
      }
    });
  });
});
