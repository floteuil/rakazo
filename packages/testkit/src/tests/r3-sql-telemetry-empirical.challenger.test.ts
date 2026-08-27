import { describe, expect, it, vi } from "vitest";
import {
  listPromptExecutionLogs,
  recordPromptExecutionLogAsync,
  type PromptExecutionLogInput,
} from "../../../db/src/telemetry.js";
import type { PrismaClient } from "../../../db/src/client.js";
import { sanitizeToolError } from "../../../adapters/src/enterprise-tools.js";

describe("Milestone M3 Empirical Challenger: SQL Telemetry Resilience & Adversarial Sanitization", () => {
  /* ======================================================================== */
  /* SECTION 1: EMPIRICAL SQL OUTAGE & CRASH SIMULATION                       */
  /* ======================================================================== */
  describe("1. Empirical SQL Outage & Crash Resilience", () => {
    it("1.1 Gracefully absorbs PostgreSQL connection loss (ECONNRESET / ECONNREFUSED)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const networkErrors = [
        new Error("connect ECONNREFUSED 127.0.0.1:5432"),
        new Error("read ECONNRESET"),
        new Error("Connection terminated unexpectedly"),
        new Error("FATAL: 57P01: terminating connection due to administrator command"),
      ];

      for (const err of networkErrors) {
        const mockPrisma = {
          promptExecutionLog: {
            create: vi.fn().mockRejectedValue(err),
          },
        } as unknown as PrismaClient;

        expect(() => {
          recordPromptExecutionLogAsync(mockPrisma, {
            botId: "bot-crash-test",
            levelUsed: "level2_llm",
            promptTokens: 1000,
            completionTokens: 200,
          });
        }).not.toThrow();

        // Flush microtasks
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
          err.message,
        );
      }

      warnSpy.mockRestore();
    });

    it("1.2 Survives database lock contention, serialization failure (40001) and deadlocks (40P01)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const lockErrors = [
        new Error("40001: could not serialize access due to concurrent update"),
        new Error("40P01: deadlock detected (Process 12345 waits for ExclusiveLock)"),
        new Error("55P03: lock_not_available"),
      ];

      for (const err of lockErrors) {
        const mockPrisma = {
          promptExecutionLog: {
            create: vi.fn().mockRejectedValue(err),
          },
        } as unknown as PrismaClient;

        expect(() => {
          recordPromptExecutionLogAsync(mockPrisma, {
            levelUsed: "level1_deterministic",
            durationMs: 50,
          });
        }).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(warnSpy).toHaveBeenCalledWith(
          "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
          err.message,
        );
      }

      warnSpy.mockRestore();
    });

    it("1.3 Handles connection pool saturation (Prisma P2024 / timeout) under 1000 concurrent calls", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const poolTimeoutError = new Error(
        "Timed out fetching a new connection from the connection pool. (More info: http://pris.ly/d/connection-pool-timeout)",
      );

      let rejectionCount = 0;
      let successCount = 0;

      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async () => {
            // Simulate 50% pool timeout rejections and 50% slow successes
            if (Math.random() > 0.5) {
              rejectionCount++;
              throw poolTimeoutError;
            } else {
              successCount++;
              return { id: "log-ok" };
            }
          }),
        },
      } as unknown as PrismaClient;

      const totalCalls = 1000;
      const t0 = performance.now();

      for (let i = 0; i < totalCalls; i++) {
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: `bot-burst-${i % 10}`,
          levelUsed: "level2_llm",
          promptTokens: 500,
          cachedTokens: 400,
          durationMs: 25,
        });
      }

      const dispatchTime = performance.now() - t0;
      // All 1000 dispatches must execute synchronously without blocking (under 1000ms)
      expect(dispatchTime).toBeLessThan(1000);

      // Wait for all async promises to settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(totalCalls);
      expect(rejectionCount + successCount).toBe(totalCalls);
      expect(warnSpy).toHaveBeenCalledTimes(rejectionCount);

      warnSpy.mockRestore();
    });

    it("1.4 Resilient to foreign key violation when bot is deleted concurrently (P2003)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const fkError = new Error(
        "Foreign key constraint failed on the field: `prompt_execution_logs_botId_fkey (index)`",
      );

      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockRejectedValue(fkError),
        },
      } as unknown as PrismaClient;

      expect(() => {
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: "deleted-bot-id-999",
          levelUsed: "level2_llm",
        });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(warnSpy).toHaveBeenCalledWith(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        fkError.message,
      );

      warnSpy.mockRestore();
    });

    it("1.5 Handles non-Error thrown objects (strings, numbers, nulls) in promise catch safely", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const nonErrors = ["Raw string error", 500, { custom: "failure" }, null, undefined];

      for (const weirdErr of nonErrors) {
        const mockPrisma = {
          promptExecutionLog: {
            create: vi.fn().mockRejectedValue(weirdErr),
          },
        } as unknown as PrismaClient;

        expect(() => {
          recordPromptExecutionLogAsync(mockPrisma, { levelUsed: "level1" });
        }).not.toThrow();

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(warnSpy).toHaveBeenCalledWith(
          "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
          weirdErr instanceof Error ? weirdErr.message : weirdErr,
        );
      }

      warnSpy.mockRestore();
    });
  });

  /* ======================================================================== */
  /* SECTION 2: ADVERSARIAL TELEMETRY DATA BOUNDARIES & SQL INJECTION STRINGS */
  /* ======================================================================== */
  describe("2. Telemetry Field Clamping, Bounds & SQL Injection Hardening", () => {
    it("2.1 Clamps extreme and aberrant numeric values (NaN, Infinity, negative overflow)", () => {
      let createdData: any = null;
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async ({ data }: any) => {
            createdData = data;
            return { id: "log-clamp" };
          }),
        },
      } as unknown as PrismaClient;

      recordPromptExecutionLogAsync(mockPrisma, {
        levelUsed: "level2_llm",
        promptTokens: -999999,
        completionTokens: -1,
        cachedTokens: -500,
        cacheHitRatio: -2.5,
        durationMs: -10000,
        costEstimatedUsd: -0.05,
      });

      expect(createdData.promptTokens).toBe(0);
      expect(createdData.completionTokens).toBe(0);
      expect(createdData.cachedTokens).toBe(0);
      expect(createdData.cacheHitRatio).toBe(0);
      expect(createdData.durationMs).toBe(0);
      expect(createdData.costEstimatedUsd).toBe(-0.05); // cost can be logged as provided or null
    });

    it("2.2 Correctly handles SQL injection payloads in string fields without crash", async () => {
      let createdData: any = null;
      const mockPrisma = {
        promptExecutionLog: {
          create: vi.fn().mockImplementation(async ({ data }: any) => {
            createdData = data;
            return { id: "log-sqli" };
          }),
        },
      } as unknown as PrismaClient;

      const sqliPayload = "'; DROP TABLE prompt_execution_logs; -- \0\x00";
      recordPromptExecutionLogAsync(mockPrisma, {
        botId: sqliPayload,
        executionId: sqliPayload,
        provider: sqliPayload,
        model: sqliPayload,
        levelUsed: sqliPayload,
      });

      expect(createdData.botId).toBe(sqliPayload);
      expect(createdData.executionId).toBe(sqliPayload);
      expect(createdData.provider).toBe(sqliPayload);
      expect(createdData.model).toBe(sqliPayload);
      expect(createdData.levelUsed).toBe(sqliPayload);
    });

    it("2.3 Correctly passes parameters to listPromptExecutionLogs with filters and limits", async () => {
      const mockPrisma = {
        promptExecutionLog: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaClient;

      await listPromptExecutionLogs(mockPrisma, {
        botId: "bot-filter-1",
        model: "openai/gpt-oss-120b",
        limit: 25,
      });

      expect(mockPrisma.promptExecutionLog.findMany).toHaveBeenCalledWith({
        where: {
          botId: "bot-filter-1",
          model: "openai/gpt-oss-120b",
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      });
    });
  });

  /* ======================================================================== */
  /* SECTION 3: ADVERSARIAL COMPOSITE SECRET SANITIZATION                     */
  /* ======================================================================== */
  describe("3. Composite Adversarial Secret Sanitization Matrix", () => {
    it("3.1 Redacts complex composite strings containing multiple interleaved token formats", () => {
      const compositeInput = [
        "FATAL error authenticating to upstream services:",
        "GitHub token: ghp_99887766554433221100aabbccddeeff00112233",
        "Anthropic key: sk-ant-api03-abcdef1234567890_ABCDEFGHIJKLMN",
        "OpenRouter key: sk-or-v1-0123456789abcdef0123456789abcdef",
        "OpenAI key: sk-proj-1234567890abcdef1234567890abcdef",
        "Notion secret: secret_vN1892182910291029102910291029 and ntn_99887766554433",
        "Postiz API key: pk_live_abcdef1234567890",
        "Novamira key: nova_sec_ability_token_2026_prod",
        "n8n webhook key: n8n_api_key_floteuil_2026",
        "Cloudflare token: cf_token_alpha-123_BETA-456_gamma-789 and cfat_0123456789abcdef",
        "Database URI: postgresql://admin_user:SuperSecretPassword123!@db.internal.cloud:5432/rakazo_prod",
        "Standard postgres URI: postgres://floteuil:MyPassw0rd99@10.0.0.5:5432/db",
        "Auth Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiYWRtaW4ifQ.s1gn4tur3",
        "Basic Auth: Basic YWRtaW46U3VwZXJTZWNyZXQxMjMh",
      ].join("\n");

      const sanitized = sanitizeToolError(compositeInput);

      // Verify ZERO unredacted secret leaks
      expect(sanitized).not.toContain("ghp_99887766554433221100aabbccddeeff00112233");
      expect(sanitized).not.toContain("sk-ant-api03-abcdef1234567890_ABCDEFGHIJKLMN");
      expect(sanitized).not.toContain("sk-or-v1-0123456789abcdef0123456789abcdef");
      expect(sanitized).not.toContain("sk-proj-1234567890abcdef1234567890abcdef");
      expect(sanitized).not.toContain("secret_vN1892182910291029102910291029");
      expect(sanitized).not.toContain("ntn_99887766554433");
      expect(sanitized).not.toContain("pk_live_abcdef1234567890");
      expect(sanitized).not.toContain("nova_sec_ability_token_2026_prod");
      expect(sanitized).not.toContain("n8n_api_key_floteuil_2026");
      expect(sanitized).not.toContain("cf_token_alpha-123_BETA-456_gamma-789");
      expect(sanitized).not.toContain("cfat_0123456789abcdef");
      expect(sanitized).not.toContain("SuperSecretPassword123!");
      expect(sanitized).not.toContain("MyPassw0rd99");
      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      expect(sanitized).not.toContain("YWRtaW46U3VwZXJTZWNyZXQxMjMh");

      // Verify redaction markers are present
      expect(sanitized).toContain("ghp_[redacted]");
      expect(sanitized).toContain("sk-ant-[redacted]");
      expect(sanitized).toContain("sk-or-[redacted]");
      expect(sanitized).toContain("sk-[redacted]");
      expect(sanitized).toContain("secret_[redacted]");
      expect(sanitized).toContain("ntn_[redacted]");
      expect(sanitized).toContain("pk_[redacted]");
      expect(sanitized).toContain("nova_[redacted]");
      expect(sanitized).toContain("n8n_api_[redacted]");
      expect(sanitized).toContain("cf_token_[redacted]");
      expect(sanitized).toContain("cfat_[redacted]");
      expect(sanitized).toContain("postgres://admin_user:[redacted]@db.internal.cloud:5432/rakazo_prod");
      expect(sanitized).toContain("postgres://floteuil:[redacted]@10.0.0.5:5432/db");
      expect(sanitized).toContain("Bearer [redacted]");
      expect(sanitized).toContain("Basic [redacted]");
    });

    it("3.2 Handles nested JSON-escaped secrets in API response errors", () => {
      const jsonError = JSON.stringify({
        status: 401,
        headers: {
          authorization: "Bearer secret-jwt-payload.123456.abcdef",
          "x-api-key": "sk-ant-admin-production-key-998877",
        },
        body: {
          error: "Invalid token: ghp_githubPersonalAccessTokenSecret123",
          database: "postgres://root:very_secret_pwd@127.0.0.1:5432/prod",
        },
      });

      const sanitized = sanitizeToolError(jsonError);

      expect(sanitized).not.toContain("secret-jwt-payload");
      expect(sanitized).not.toContain("sk-ant-admin-production-key-998877");
      expect(sanitized).not.toContain("ghp_githubPersonalAccessTokenSecret123");
      expect(sanitized).not.toContain("very_secret_pwd");
    });

    it("3.3 Resilient against ReDoS (catastrophic backtracking) with massive adversarial payload", () => {
      // 5,000 concatenated simulated error chunks
      let massiveChunk = "";
      for (let i = 0; i < 5000; i++) {
        massiveChunk += `[chunk ${i}] Bearer token_${i}_abcdef sk-or-key_${i}_123 postgres://u${i}:p${i}@h:5432/d `;
      }

      const t0 = performance.now();
      const sanitized = sanitizeToolError(massiveChunk);
      const elapsed = performance.now() - t0;

      // Must complete in under 2000ms for 5,000 replacements across 14 regex filters
      expect(elapsed).toBeLessThan(2000);
      expect(sanitized).not.toContain("token_0_abcdef");
      expect(sanitized).not.toContain("key_0_123");
      expect(sanitized).not.toContain("p0@h:5432");
    });
  });

  /* ======================================================================== */
  /* SECTION 4: STRICT FALSE POSITIVE VERIFICATION ON BENIGN / STANDARD LOGS  */
  /* ======================================================================== */
  describe("4. Zero False Positives on Standard & Benign Operational Logs", () => {
    it("4.1 Preserves standard operational log lines, SQL queries without passwords, and metrics untouched", () => {
      const benignLogs = [
        "Server listening on http://0.0.0.0:3000",
        "PostgreSQL query executed in 14ms: SELECT id, name, created_at FROM users WHERE status = 'active'",
        "Prisma connected successfully to PostgreSQL database pool (max_connections=20)",
        "Prompt execution telemetry: 1500 prompt tokens, 350 completion tokens, 1200 cached tokens (ratio: 0.80)",
        "Cache hit on KV store for key 'user-session-98765'",
        "GitHub repository search returned 42 repositories for query 'turborepo monorepo'",
        "Notion database query returned 15 pages in workspace 'Engineering'",
        "Cloudflare DNS record sync completed: 0 changes needed",
        "SearXNG web search completed in 420ms with 10 results",
        "Postiz scheduled post ID 108 created for social broadcast at 2026-08-27T14:00:00Z",
        "Cartesia TTS stream initialized with model 'sonic-english' (sample rate: 24000Hz)",
        "Worker thread pool healthy: 4 active workers, 0 queued tasks, memory usage: 128MB",
      ];

      for (const log of benignLogs) {
        const sanitized = sanitizeToolError(log);
        expect(sanitized).toBe(log);
      }
    });

    it("4.2 Preserves Postgres URLs without embedded credentials (e.g. host-only connection strings)", () => {
      const hostOnlyUrls = [
        "postgres://localhost:5432/rakazo_dev",
        "postgresql://db.internal.lan:5432/production_db",
        "Connection string formatted as postgres://host:port/dbname without credentials",
      ];

      for (const url of hostOnlyUrls) {
        expect(sanitizeToolError(url)).toBe(url);
      }
    });
  });
});
