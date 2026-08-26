import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  listPromptExecutionLogs,
  recordPromptExecutionLogAsync,
  type PromptExecutionLogInput,
} from "./telemetry.js";

describe("Prompt Execution Telemetry", () => {
  describe("recordPromptExecutionLogAsync", () => {
    it("returns synchronously with void and calls prisma.promptExecutionLog.create with mapped fields", async () => {
      const create = vi.fn().mockResolvedValue({ id: "log-1" });
      const prisma = {
        promptExecutionLog: { create },
      } as unknown as PrismaClient;

      const input: PromptExecutionLogInput = {
        botId: "bot-123",
        executionId: "exec-456",
        provider: "openrouter",
        model: "openai/gpt-oss-120b",
        levelUsed: "level2_llm",
        promptTokens: 1500,
        completionTokens: 350,
        cachedTokens: 1200,
        cacheHitRatio: 0.8,
        durationMs: 420,
        costEstimatedUsd: 0.0012,
      };

      const result = recordPromptExecutionLogAsync(prisma, input);

      // Verify non-blocking synchronous void return
      expect(result).toBeUndefined();
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: {
          botId: "bot-123",
          executionId: "exec-456",
          provider: "openrouter",
          model: "openai/gpt-oss-120b",
          levelUsed: "level2_llm",
          promptTokens: 1500,
          completionTokens: 350,
          cachedTokens: 1200,
          cacheHitRatio: 0.8,
          durationMs: 420,
          costEstimatedUsd: 0.0012,
        },
      });
    });

    it("applies defaults, clamping, and null fallbacks for missing/negative values", () => {
      const create = vi.fn().mockResolvedValue({ id: "log-2" });
      const prisma = {
        promptExecutionLog: { create },
      } as unknown as PrismaClient;

      const input: PromptExecutionLogInput = {
        levelUsed: "level1_deterministic",
        promptTokens: -50,
        completionTokens: -10,
        cachedTokens: -5,
        cacheHitRatio: 1.5, // should clamp to 1
        durationMs: -100,
      };

      recordPromptExecutionLogAsync(prisma, input);

      expect(create).toHaveBeenCalledWith({
        data: {
          botId: null,
          executionId: null,
          provider: null,
          model: null,
          levelUsed: "level1_deterministic",
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          cacheHitRatio: 1,
          durationMs: 0,
          costEstimatedUsd: null,
        },
      });
    });

    it("handles database rejection gracefully without throwing or crashing", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const dbError = new Error("Connection pool timeout");
      const create = vi.fn().mockRejectedValue(dbError);
      const prisma = {
        promptExecutionLog: { create },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(prisma, {
          levelUsed: "level1_deterministic",
        });
      }).not.toThrow();

      // Allow microtask queue to flush the promise rejection
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(create).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        "Connection pool timeout",
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe("listPromptExecutionLogs", () => {
    it("queries prompt execution logs with ordering and filtering", async () => {
      const mockLogs = [
        { id: "log-1", botId: "bot-1", model: "gpt-oss-120b", createdAt: new Date() },
        { id: "log-2", botId: "bot-1", model: "gpt-oss-120b", createdAt: new Date() },
      ];
      const findMany = vi.fn().mockResolvedValue(mockLogs);
      const prisma = {
        promptExecutionLog: { findMany },
      } as unknown as PrismaClient;

      const results = await listPromptExecutionLogs(prisma, {
        botId: "bot-1",
        model: "gpt-oss-120b",
        limit: 10,
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          botId: "bot-1",
          model: "gpt-oss-120b",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      expect(results).toHaveLength(2);
    });

    it("defaults to limit 50 when no filter is passed", async () => {
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = {
        promptExecutionLog: { findMany },
      } as unknown as PrismaClient;

      await listPromptExecutionLogs(prisma);

      expect(findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });
  });
});
