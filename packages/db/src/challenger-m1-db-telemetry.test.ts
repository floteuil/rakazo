import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import {
  listPromptExecutionLogs,
  recordPromptExecutionLogAsync,
  type PromptExecutionLogInput,
} from "./telemetry.js";
import { createRepos } from "./repos.js";
import { appendEvent, followThreadEvents } from "./events.js";
import { IsolationError } from "./scope.js";

/* ========================================================================== */
/* SECTION 1: DATABASE TELEMETRY & CLAMPING MATRIX                            */
/* ========================================================================== */
describe("Pillar 1: Database Telemetry & Metric Clamping Matrix", () => {
  it("1.1 Clamps negative and boundary numeric values for tokens and duration", () => {
    let capturedData: any = null;
    const mockPrisma = {
      promptExecutionLog: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          capturedData = data;
          return { id: "log-clamp-1", ...data };
        }),
      },
    } as unknown as PrismaClient;

    const input: PromptExecutionLogInput = {
      botId: "bot-clamp-test",
      executionId: "exec-clamp-test",
      provider: "openrouter",
      model: "meta-llama/llama-3.3-70b-instruct",
      levelUsed: "level2_llm",
      promptTokens: -500,
      completionTokens: -100,
      cachedTokens: -50,
      cacheHitRatio: -0.75,
      durationMs: -999,
      costEstimatedUsd: 0.00045,
    };

    recordPromptExecutionLogAsync(mockPrisma, input);

    expect(capturedData).toBeDefined();
    expect(capturedData.promptTokens).toBe(0);
    expect(capturedData.completionTokens).toBe(0);
    expect(capturedData.cachedTokens).toBe(0);
    expect(capturedData.cacheHitRatio).toBe(0);
    expect(capturedData.durationMs).toBe(0);
    expect(capturedData.costEstimatedUsd).toBe(0.00045);
  });

  it("1.2 Clamps cacheHitRatio overflow strictly to 1.0", () => {
    let capturedData: any = null;
    const mockPrisma = {
      promptExecutionLog: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          capturedData = data;
          return { id: "log-clamp-2", ...data };
        }),
      },
    } as unknown as PrismaClient;

    recordPromptExecutionLogAsync(mockPrisma, {
      levelUsed: "level2_llm",
      promptTokens: 1000,
      cachedTokens: 1500,
      cacheHitRatio: 1.5,
    });

    expect(capturedData.cacheHitRatio).toBe(1);
    expect(capturedData.promptTokens).toBe(1000);
    expect(capturedData.cachedTokens).toBe(1500);
  });

  it("1.3 Handles Free Intelligence Gateway fields and dual inference logic", () => {
    let capturedData: any = null;
    const mockPrisma = {
      promptExecutionLog: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          capturedData = data;
          return { id: "log-free-1", ...data };
        }),
      },
    } as unknown as PrismaClient;

    // Case A: inferenceMode='free' implies isFree=true
    recordPromptExecutionLogAsync(mockPrisma, {
      levelUsed: "level2_llm",
      inferenceMode: "free",
      requestedCategory: "coding",
      resolvedProvider: "omniroute",
      resolvedModel: "qwen/qwen-2.5-coder-32b-instruct:free",
    });

    expect(capturedData.inferenceMode).toBe("free");
    expect(capturedData.isFree).toBe(true);
    expect(capturedData.requestedCategory).toBe("coding");
    expect(capturedData.resolvedProvider).toBe("omniroute");
    expect(capturedData.resolvedModel).toBe("qwen/qwen-2.5-coder-32b-instruct:free");

    // Case B: isFree=true implies inferenceMode='free' if not set
    recordPromptExecutionLogAsync(mockPrisma, {
      levelUsed: "level2_llm",
      isFree: true,
    });

    expect(capturedData.inferenceMode).toBe("free");
    expect(capturedData.isFree).toBe(true);

    // Case C: standard non-free mode
    recordPromptExecutionLogAsync(mockPrisma, {
      levelUsed: "level1_deterministic",
      inferenceMode: "standard",
      isFree: false,
    });

    expect(capturedData.inferenceMode).toBe("standard");
    expect(capturedData.isFree).toBe(false);
  });

  it("1.4 Dispatches non-blocking synchronous void return", () => {
    const createPromise = new Promise((resolve) => setTimeout(resolve, 50));
    const mockPrisma = {
      promptExecutionLog: {
        create: vi.fn().mockReturnValue(createPromise),
      },
    } as unknown as PrismaClient;

    const start = performance.now();
    const result = recordPromptExecutionLogAsync(mockPrisma, {
      levelUsed: "level1_deterministic",
    });
    const elapsed = performance.now() - start;

    expect(result).toBeUndefined();
    expect(elapsed).toBeLessThan(20);
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(1);
  });
});

/* ========================================================================== */
/* SECTION 2: NON-BLOCKING PERSISTENCE UNDER SIMULATED FAILURES               */
/* ========================================================================== */
describe("Pillar 2: Non-Blocking Persistence Under Simulated Failures", () => {
  it("2.1 Survives fatal network outages (ECONNREFUSED, ECONNRESET, ETIMEDOUT)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const networkOutages = [
      new Error("connect ECONNREFUSED 127.0.0.1:5432"),
      new Error("read ECONNRESET"),
      new Error("ETIMEDOUT: Connection timed out"),
      new Error("EPIPE: Broken pipe"),
      new Error("FATAL: 57P01: terminating connection due to administrator command"),
      new Error("08006: connection_failure"),
      new Error("08001: unable to establish connection"),
    ];

    for (const outage of networkOutages) {
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(outage),
        },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: "bot-outage",
          levelUsed: "level2_llm",
        });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 5));

      expect(warnSpy).toHaveBeenCalledWith(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        outage.message,
      );
    }

    warnSpy.mockRestore();
  });

  it("2.2 Survives database lock contention, serialization errors and deadlocks", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const dbContentionErrors = [
      new Error("40001: could not serialize access due to concurrent update"),
      new Error("40P01: deadlock detected (Process 101 waits for ShareLock)"),
      new Error("55P03: lock_not_available"),
    ];

    for (const contentionErr of dbContentionErrors) {
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(contentionErr),
        },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(mockPrisma, {
          levelUsed: "level1_deterministic",
        });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 5));

      expect(warnSpy).toHaveBeenCalledWith(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        contentionErr.message,
      );
    }

    warnSpy.mockRestore();
  });

  it("2.3 Absorbs Prisma P2024 connection pool timeout under massive concurrent burst (2,000 calls)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const poolTimeoutError = new Error(
      "Timed out fetching a new connection from the connection pool. (More info: http://pris.ly/d/connection-pool-timeout)",
    );

    let failCount = 0;
    let okCount = 0;

    const mockPrisma = {
      promptExecutionLog: {
        create: vi.fn().mockImplementation(async () => {
          if (Math.random() > 0.4) {
            failCount++;
            throw poolTimeoutError;
          } else {
            okCount++;
            return { id: "log-ok" };
          }
        }),
      },
    } as unknown as PrismaClient;

    const totalBurst = 2000;
    const t0 = performance.now();

    for (let i = 0; i < totalBurst; i++) {
      recordPromptExecutionLogAsync(mockPrisma, {
        botId: `burst-bot-${i % 20}`,
        levelUsed: "level2_llm",
        promptTokens: 250,
        cachedTokens: 180,
      });
    }

    const elapsedDispatch = performance.now() - t0;
    // Must dispatch all 2000 asynchronously in under 500ms
    expect(elapsedDispatch).toBeLessThan(500);

    // Let all promises settle
    await new Promise((r) => setTimeout(r, 100));

    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(totalBurst);
    expect(failCount + okCount).toBe(totalBurst);
    expect(warnSpy).toHaveBeenCalledTimes(failCount);

    warnSpy.mockRestore();
  });

  it("2.4 Resilient to non-Error thrown objects (string, number, object, null, undefined)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const weirdRejections = [
      "Database unavailable",
      503,
      { code: "ERR_SOCKET_TIMEOUT", detail: "Gateway reset" },
      null,
      undefined,
    ];

    for (const weird of weirdRejections) {
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(weird),
        },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(mockPrisma, {
          levelUsed: "level1_deterministic",
        });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 5));

      expect(warnSpy).toHaveBeenCalledWith(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        weird instanceof Error ? weird.message : weird,
      );
    }

    warnSpy.mockRestore();
  });

  it("2.5 Realtime publisher failures do not prevent event creation or crash caller", async () => {
    const failingRealtime = {
      describe: () => ({ id: "test", contractVersion: "1", adapterVersion: "1", capabilities: { push: true, distributed: false } }),
      publish: vi.fn().mockRejectedValue(new Error("Realtime redis pubsub cluster down")),
      subscribe: vi.fn(),
      close: vi.fn(),
    };

    const mockEvent = {
      id: "ev-1",
      workspaceId: "ws-1",
      threadId: "th-1",
      botId: "bot-1",
      seq: 0,
      type: "thread.message.created",
      payload: {},
      runId: null,
      createdAt: new Date(),
    };

    const tx = {
      thread: { update: vi.fn().mockResolvedValue({ nextEventSeq: 1 }) },
      run: { findUnique: vi.fn().mockResolvedValue({ status: "running" }) },
      event: { create: vi.fn().mockResolvedValue(mockEvent) },
    };

    const mockPrisma = {
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    } as unknown as PrismaClient;

    const result = await appendEvent(
      mockPrisma,
      {
        workspaceId: "ws-1",
        threadId: "th-1",
        botId: "bot-1",
        type: "thread.message.created",
        payload: {},
      },
      failingRealtime as any,
    );

    expect(result.id).toBe("ev-1");
    expect(failingRealtime.publish).toHaveBeenCalled();
  });
});

/* ========================================================================== */
/* SECTION 3: LIST QUERIES & MULTI-FILTER COMBINATORICS                       */
/* ========================================================================== */
describe("Pillar 3: List Queries & Multi-Filter Combinatorics", () => {
  describe("3.1 listPromptExecutionLogs 16-Permutation Matrix", () => {
    const filterPermutations: Array<{
      desc: string;
      filter?: { botId?: string; model?: string; inferenceMode?: string; isFree?: boolean; limit?: number };
      expectedWhere: Record<string, unknown>;
      expectedTake: number;
    }> = [
      {
        desc: "Empty filter",
        filter: undefined,
        expectedWhere: {},
        expectedTake: 50,
      },
      {
        desc: "Filter by botId only",
        filter: { botId: "bot-10" },
        expectedWhere: { botId: "bot-10" },
        expectedTake: 50,
      },
      {
        desc: "Filter by model only",
        filter: { model: "openai/gpt-oss-120b" },
        expectedWhere: { model: "openai/gpt-oss-120b" },
        expectedTake: 50,
      },
      {
        desc: "Filter by inferenceMode only",
        filter: { inferenceMode: "free" },
        expectedWhere: { inferenceMode: "free" },
        expectedTake: 50,
      },
      {
        desc: "Filter by isFree=true only",
        filter: { isFree: true },
        expectedWhere: { isFree: true },
        expectedTake: 50,
      },
      {
        desc: "Filter by isFree=false only",
        filter: { isFree: false },
        expectedWhere: { isFree: false },
        expectedTake: 50,
      },
      {
        desc: "Filter by botId + model",
        filter: { botId: "bot-10", model: "openai/gpt-oss-120b" },
        expectedWhere: { botId: "bot-10", model: "openai/gpt-oss-120b" },
        expectedTake: 50,
      },
      {
        desc: "Filter by botId + inferenceMode",
        filter: { botId: "bot-10", inferenceMode: "free" },
        expectedWhere: { botId: "bot-10", inferenceMode: "free" },
        expectedTake: 50,
      },
      {
        desc: "Filter by botId + isFree",
        filter: { botId: "bot-10", isFree: true },
        expectedWhere: { botId: "bot-10", isFree: true },
        expectedTake: 50,
      },
      {
        desc: "Filter by model + inferenceMode",
        filter: { model: "meta-llama/llama-3.3-70b-instruct", inferenceMode: "standard" },
        expectedWhere: { model: "meta-llama/llama-3.3-70b-instruct", inferenceMode: "standard" },
        expectedTake: 50,
      },
      {
        desc: "Filter by model + isFree",
        filter: { model: "qwen/qwen-2.5-coder-32b-instruct:free", isFree: true },
        expectedWhere: { model: "qwen/qwen-2.5-coder-32b-instruct:free", isFree: true },
        expectedTake: 50,
      },
      {
        desc: "Filter by inferenceMode + isFree",
        filter: { inferenceMode: "free", isFree: true },
        expectedWhere: { inferenceMode: "free", isFree: true },
        expectedTake: 50,
      },
      {
        desc: "Filter by botId + model + inferenceMode",
        filter: { botId: "bot-20", model: "openai/gpt-oss-120b", inferenceMode: "free" },
        expectedWhere: { botId: "bot-20", model: "openai/gpt-oss-120b", inferenceMode: "free" },
        expectedTake: 50,
      },
      {
        desc: "Filter by botId + model + isFree",
        filter: { botId: "bot-20", model: "openai/gpt-oss-120b", isFree: true },
        expectedWhere: { botId: "bot-20", model: "openai/gpt-oss-120b", isFree: true },
        expectedTake: 50,
      },
      {
        desc: "Filter by botId + inferenceMode + isFree",
        filter: { botId: "bot-20", inferenceMode: "free", isFree: true },
        expectedWhere: { botId: "bot-20", inferenceMode: "free", isFree: true },
        expectedTake: 50,
      },
      {
        desc: "Filter by all 4 fields + custom limit",
        filter: {
          botId: "bot-99",
          model: "qwen/qwen-2.5-coder-32b-instruct:free",
          inferenceMode: "free",
          isFree: true,
          limit: 100,
        },
        expectedWhere: {
          botId: "bot-99",
          model: "qwen/qwen-2.5-coder-32b-instruct:free",
          inferenceMode: "free",
          isFree: true,
        },
        expectedTake: 100,
      },
    ];

    for (const testCase of filterPermutations) {
      it(`Permutation: ${testCase.desc}`, async () => {
        const findMany = vi.fn().mockResolvedValue([]);
        const mockPrisma = {
          promptExecutionLog: { findMany },
        } as unknown as PrismaClient;

        await listPromptExecutionLogs(mockPrisma, testCase.filter);

        expect(findMany).toHaveBeenCalledWith({
          where: testCase.expectedWhere,
          orderBy: { createdAt: "desc" },
          take: testCase.expectedTake,
        });
      });
    }
  });

  describe("3.2 repos.listBots Combinations & Actor Scope", () => {
    const actor: Actor = {
      userId: "user-alpha",
      workspaceId: "ws-alpha",
      email: "alpha@example.com",
      isDeploymentOwner: true,
    };

    const makeBot = (overrides: Record<string, any> = {}) => ({
      id: "bot-test",
      workspaceId: "ws-alpha",
      userId: "user-alpha",
      name: "Test Bot",
      title: "Title",
      description: "Desc",
      instructions: "Inst",
      color: "#000",
      notifyOnFinish: true,
      pinned: false,
      archivedAt: null,
      parentBotId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      thread: { id: "thread-test", unread: false, messages: [{ blocks: [{ kind: "text", text: "Hello!" }] }] },
      runs: [{ status: "running" }],
      computer: { scope: "team" },
      ...overrides,
    });

    it("Correctly queries active bots by default (archivedAt: null)", async () => {
      const findMany = vi.fn().mockResolvedValue([makeBot()]);
      const mockPrisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(mockPrisma);

      const bots = await repos.listBots(actor);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: "ws-alpha",
            userId: "user-alpha",
            archivedAt: null,
          },
          orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
        }),
      );
      expect(bots[0]?.status).toBe("running");
      expect(bots[0]?.preview).toBe("Hello!");
      expect(bots[0]?.computerMode).toBe("team");
    });

    it("Correctly queries archived bots when archived: true", async () => {
      const archivedBot = makeBot({ archivedAt: new Date() });
      const findMany = vi.fn().mockResolvedValue([archivedBot]);
      const mockPrisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(mockPrisma);

      await repos.listBots(actor, { archived: true });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: "ws-alpha",
            userId: "user-alpha",
            archivedAt: { not: null },
          },
        }),
      );
    });

    it("Correctly handles bots with no messages or empty preview", async () => {
      const emptyBot = makeBot({
        thread: { id: "thread-empty", unread: true, messages: [] },
        runs: [],
      });
      const findMany = vi.fn().mockResolvedValue([emptyBot]);
      const mockPrisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(mockPrisma);

      const bots = await repos.listBots(actor);
      expect(bots[0]?.preview).toBe("");
      expect(bots[0]?.status).toBe("idle");
      expect(bots[0]?.unread).toBe(true);
    });

    it("Throws IsolationError if bot is missing its thread relation", async () => {
      const brokenBot = makeBot({ thread: null });
      const findMany = vi.fn().mockResolvedValue([brokenBot]);
      const mockPrisma = { bot: { findMany } } as unknown as PrismaClient;
      const repos = createRepos(mockPrisma);

      await expect(repos.listBots(actor)).rejects.toThrow(IsolationError);
    });
  });
});

/* ========================================================================== */
/* SECTION 4: PRISMA MIGRATION SQL SYNTAX & CONSTRAINTS AUDIT                 */
/* ========================================================================== */
describe("Pillar 4: Migration SQL Syntax & Relational Integrity Audit", () => {
  const rootDir = resolve(__dirname, "../../../");
  const migrationsDir = resolve(rootDir, "packages/db/prisma/migrations");

  it("4.1 Discovers and loads all 22 migration SQL files", () => {
    const entries = readdirSync(migrationsDir);
    const sqlFiles: string[] = [];

    for (const entry of entries) {
      const fullPath = join(migrationsDir, entry);
      if (statSync(fullPath).isDirectory()) {
        const sqlPath = join(fullPath, "migration.sql");
        try {
          if (statSync(sqlPath).isFile()) {
            sqlFiles.push(sqlPath);
          }
        } catch {
          // ignore non-migration subdirs
        }
      }
    }

    expect(sqlFiles.length).toBeGreaterThanOrEqual(22);
  });

  it("4.2 Validates PostgreSQL syntax, balanced quotes/parentheses and semicolon termination in all migrations", () => {
    const entries = readdirSync(migrationsDir);

    for (const entry of entries) {
      const fullPath = join(migrationsDir, entry);
      if (!statSync(fullPath).isDirectory()) continue;
      const sqlPath = join(fullPath, "migration.sql");
      let content = "";
      try {
        content = readFileSync(sqlPath, "utf-8");
      } catch {
        continue;
      }

      // Check non-empty content
      expect(content.trim().length).toBeGreaterThan(0);

      // Check balanced quotes (double quotes for identifiers, single quotes for literals)
      const doubleQuotes = (content.match(/"/g) || []).length;
      expect(doubleQuotes % 2).toBe(0);

      // Check balanced parentheses
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      expect(openParens).toBe(closeParens);

      // Verify all non-comment executable SQL statements end with semicolon
      const statements = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("--"))
        .join(" ")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        // Valid PostgreSQL DDL commands
        const isValidDDL =
          statement.startsWith("CREATE TABLE") ||
          statement.startsWith("CREATE SCHEMA") ||
          statement.startsWith("CREATE EXTENSION") ||
          statement.startsWith("CREATE INDEX") ||
          statement.startsWith("CREATE UNIQUE INDEX") ||
          statement.startsWith("ALTER TABLE") ||
          statement.startsWith("DROP TABLE") ||
          statement.startsWith("DROP INDEX") ||
          statement.startsWith("INSERT INTO") ||
          statement.startsWith("UPDATE") ||
          statement.startsWith("DELETE FROM") ||
          statement.startsWith("CREATE TYPE") ||
          statement.startsWith("ALTER TYPE") ||
          statement.startsWith("COMMENT ON");

        if (!isValidDDL) {
          console.error(`Unknown SQL statement in ${entry}:`, statement);
        }
        expect(isValidDDL).toBe(true);
      }
    }
  });

  it("4.3 Validates PromptExecutionLog table schema in migration 0014 and 0015", () => {
    const m0014Path = join(migrationsDir, "0014_prompt_execution_logs/migration.sql");
    const m0014 = readFileSync(m0014Path, "utf-8");

    expect(m0014).toContain('CREATE TABLE "prompt_execution_logs"');
    expect(m0014).toContain('"promptTokens" INTEGER NOT NULL DEFAULT 0');
    expect(m0014).toContain('"completionTokens" INTEGER NOT NULL DEFAULT 0');
    expect(m0014).toContain('"cachedTokens" INTEGER NOT NULL DEFAULT 0');
    expect(m0014).toContain('"cacheHitRatio" DOUBLE PRECISION NOT NULL DEFAULT 0');
    expect(m0014).toContain('"durationMs" INTEGER NOT NULL DEFAULT 0');
    expect(m0014).toContain('CONSTRAINT "prompt_execution_logs_pkey" PRIMARY KEY ("id")');
    expect(m0014).toContain('REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE');

    const m0015Path = join(migrationsDir, "0015_free_intelligence_gateway/migration.sql");
    const m0015 = readFileSync(m0015Path, "utf-8");

    expect(m0015).toContain('ALTER TABLE "prompt_execution_logs" ADD COLUMN "inferenceMode" TEXT');
    expect(m0015).toContain('ALTER TABLE "prompt_execution_logs" ADD COLUMN "requestedCategory" TEXT');
    expect(m0015).toContain('ALTER TABLE "prompt_execution_logs" ADD COLUMN "resolvedProvider" TEXT');
    expect(m0015).toContain('ALTER TABLE "prompt_execution_logs" ADD COLUMN "resolvedModel" TEXT');
    expect(m0015).toContain('ALTER TABLE "prompt_execution_logs" ADD COLUMN "isFree" BOOLEAN DEFAULT false');
    expect(m0015).toContain('CREATE INDEX "prompt_execution_logs_inferenceMode_idx" ON "prompt_execution_logs"("inferenceMode")');
    expect(m0015).toContain('CREATE INDEX "prompt_execution_logs_isFree_idx" ON "prompt_execution_logs"("isFree")');
  });

  it("4.4 Validates ON DELETE CASCADE integrity across all relational models", () => {
    const schemaPath = resolve(rootDir, "packages/db/prisma/schema.prisma");
    const schema = readFileSync(schemaPath, "utf-8");

    // Key relations requiring CASCADE deletion
    const cascadeRelations = [
      /user\s+User\s+@relation\(fields:\s*\[userId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
      /workspace\s+Organization\s+@relation\(fields:\s*\[workspaceId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
      /bot\s+Bot\s+@relation\(fields:\s*\[botId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
      /thread\s+Thread\s+@relation\(fields:\s*\[threadId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
      /run\s+Run\s+@relation\(fields:\s*\[runId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/,
    ];

    for (const rel of cascadeRelations) {
      expect(schema).toMatch(rel);
    }
  });
});
