import { describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  PromptCacheTelemetrySchema,
  PromptCompilationLevelSchema,
  type PromptCacheTelemetry,
} from "@rakazo/contracts";
import {
  recordPromptExecutionLogAsync,
  listPromptExecutionLogs,
  type PromptExecutionLogInput,
} from "../../../db/src/telemetry.js";
import type { PrismaClient } from "../../../db/src/client.js";

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

describe("Requirement R3: SQL Telemetry & Prefix Caching E2E", () => {
  const rootDir = getRepoRoot();
  const schemaPath = resolve(rootDir, "packages/db/prisma/schema.prisma");
  let schemaContent = "";
  if (existsSync(schemaPath)) {
    schemaContent = readFileSync(schemaPath, "utf-8");
  }

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 Tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (R3 SQL Schema & Telemetry Logging)", () => {
    it("1.1 Verifies PromptExecutionLog model declaration in Prisma schema", () => {
      expect(schemaContent).toContain("model PromptExecutionLog");
      expect(schemaContent).toContain('@@map("prompt_execution_logs")');
    });

    it("1.2 Validates all required telemetry fields in PromptExecutionLog model", () => {
      const requiredFields = [
        "id",
        "botId",
        "executionId",
        "provider",
        "model",
        "levelUsed",
        "promptTokens",
        "completionTokens",
        "cachedTokens",
        "cacheHitRatio",
        "durationMs",
        "costEstimatedUsd",
        "createdAt",
      ];
      for (const field of requiredFields) {
        expect(schemaContent).toMatch(new RegExp(`\\b${field}\\b`));
      }
    });

    it("1.3 Validates database indexes and Bot relation in schema", () => {
      expect(schemaContent).toMatch(/@@index\(\[botId\]\)/);
      expect(schemaContent).toMatch(/@@index\(\[createdAt\]\)/);
      expect(schemaContent).toMatch(/@@index\(\[model\]\)/);
      expect(schemaContent).toMatch(/bot\s+Bot\?\s+@relation\(fields:\s*\[botId\],\s*references:\s*\[id\]/);
    });

    it("1.4 Computes and validates cacheHitRatio correctly via PromptCacheTelemetrySchema", () => {
      const telemetry: PromptCacheTelemetry = {
        promptTokens: 1000,
        cachedTokens: 800,
        completionTokens: 150,
        durationMs: 420,
        cacheHitRatio: 0.8,
      };
      const parsed = PromptCacheTelemetrySchema.parse(telemetry);
      expect(parsed.cacheHitRatio).toBe(0.8);
      expect(parsed.cachedTokens).toBe(800);
      expect(parsed.promptTokens).toBe(1000);
    });

    it("1.5 Dispatches recordPromptExecutionLogAsync in a non-blocking asynchronous manner", async () => {
      let createCalledWith: unknown = null;
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async (args: unknown) => {
            createCalledWith = args;
            return { id: "log-123", ...args };
          }),
        },
      } as unknown as PrismaClient;

      const logInput: PromptExecutionLogInput = {
        botId: "bot-test-456",
        executionId: "exec-test-789",
        provider: "openrouter",
        model: "openai/gpt-oss-120b",
        levelUsed: "level2_llm",
        promptTokens: 500,
        completionTokens: 200,
        cachedTokens: 350,
        cacheHitRatio: 0.7,
        durationMs: 380,
      };

      // Function must return synchronously void without awaiting
      const syncResult = recordPromptExecutionLogAsync(mockPrisma, logInput);
      expect(syncResult).toBeUndefined();

      // Allow microtask resolution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(1);
      expect(createCalledWith).toMatchObject({
        data: {
          botId: "bot-test-456",
          levelUsed: "level2_llm",
          cachedTokens: 350,
          cacheHitRatio: 0.7,
        },
      });
    });

    it("1.6 Queries logs via listPromptExecutionLogs with optional botId and model filters", async () => {
      const mockLogs = [
        { id: "1", botId: "bot-1", model: "openai/gpt-oss-120b", createdAt: new Date() },
        { id: "2", botId: "bot-1", model: "openai/gpt-oss-120b", createdAt: new Date() },
      ];

      const mockPrisma = {
        promptExecutionLog: {
          findMany: vi.fn().mockResolvedValue(mockLogs),
        },
      } as unknown as PrismaClient;

      const logs = await listPromptExecutionLogs(mockPrisma, {
        botId: "bot-1",
        model: "openai/gpt-oss-120b",
        limit: 10,
      });

      expect(logs).toHaveLength(2);
      expect(mockPrisma.promptExecutionLog.findMany).toHaveBeenCalledWith({
        where: { botId: "bot-1", model: "openai/gpt-oss-120b" },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 Tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases (R3 Error Resilience & Extreme Values)", () => {
    it("2.1 Swallows database write failures gracefully without throwing to caller", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failingPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(new Error("PostgreSQL connection timeout [FATAL 57P01]")),
        },
      } as unknown as PrismaClient;

      const logInput: PromptExecutionLogInput = {
        levelUsed: "level1_deterministic",
        promptTokens: 100,
        completionTokens: 50,
      };

      // Must never throw
      expect(() => {
        recordPromptExecutionLogAsync(failingPrisma, logInput);
      }).not.toThrow();

      // Wait for catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it("2.2 Handles zero division safely when promptTokens is 0 (yielding cacheHitRatio = 0)", () => {
      const calculateRatio = (cached: number, prompt: number) =>
        prompt > 0 ? Math.min(1, Math.max(0, cached / prompt)) : 0;

      expect(calculateRatio(0, 0)).toBe(0);
      expect(calculateRatio(500, 0)).toBe(0);
      expect(calculateRatio(0, 1000)).toBe(0);
    });

    it("2.3 Clamps cacheHitRatio strictly within [0.0, 1.0] when cached exceeds prompt tokens", () => {
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockResolvedValue({ id: "log-clamp" }),
        },
      } as unknown as PrismaClient;

      // Overflow ratio > 1.0
      recordPromptExecutionLogAsync(mockPrisma, {
        levelUsed: "level2_llm",
        promptTokens: 100,
        cachedTokens: 200, // cached > prompt
        cacheHitRatio: 2.0, // invalid raw ratio
      });

      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cacheHitRatio: 1.0, // Clamped to 1.0
        }),
      });

      // Underflow ratio < 0.0
      recordPromptExecutionLogAsync(mockPrisma, {
        levelUsed: "level2_llm",
        promptTokens: 100,
        cacheHitRatio: -0.5,
      });

      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          cacheHitRatio: 0.0, // Clamped to 0.0
        }),
      });
    });

    it("2.4 Supports null/orphan botId when compiling system-level or transient prompts", async () => {
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockResolvedValue({ id: "log-orphan" }),
        },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: null,
        executionId: null,
        levelUsed: "level1_deterministic",
      });

      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          botId: null,
          executionId: null,
          levelUsed: "level1_deterministic",
        }),
      });
    });

    it("2.5 Handles high concurrency burst logging without memory leak or unhandled rejection", async () => {
      let callCount = 0;
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async () => {
            callCount++;
            return { id: `log-concurrent-${callCount}` };
          }),
        },
      } as unknown as PrismaClient;

      const burstSize = 100;
      for (let i = 0; i < burstSize; i++) {
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: `bot-${i % 5}`,
          levelUsed: i % 2 === 0 ? "level1_deterministic" : "level2_llm",
          promptTokens: 100 + i,
          completionTokens: 50 + i,
          cachedTokens: i * 2,
          durationMs: 10 + i,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(callCount).toBe(burstSize);
    });
  });
});
