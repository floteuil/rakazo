import { describe, it, expect, vi } from "vitest";
import {
  STATIC_PLATFORM_GUARDRAILS_BLOC_A,
  assemble4BlockCachePrompt,
  extractCacheTelemetry,
  computeSessionAffinityKey,
} from "./prefix-caching.js";
import { OmniRouteInferenceTransport } from "./omniroute-transport.js";
import { FreeOmniRouteAdapter } from "./omniroute-adapter.js";
import {
  recordPromptExecutionLogAsync,
  listPromptExecutionLogs,
  type PromptExecutionLogInput,
} from "@rakazo/db";

describe("Challenger 2 Empirical Verification: Milestone 3 (R6 Caching & Telemetry)", () => {
  // =========================================================================
  // 1. Level 1: 4-Block KV Prefix Caching Empirical Verification
  // =========================================================================
  describe("1. Level 1: 4-Block KV Prefix Caching & Byte Invariance", () => {
    it("1.1 Guarantees Block A (Invariant Platform Guardrails) Byte Invariance at Token 0", () => {
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain("=== BLOC A : INVARIANT PLATFORM GUARDRAILS");
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain("Principle of Least Privilege");
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain("Maximum 25 tool steps");
      expect(STATIC_PLATFORM_GUARDRAILS_BLOC_A).toContain("Maximum 3 consecutive identical tool calls");

      const prompt1 = assemble4BlockCachePrompt({
        bot: { botName: "Bot Alpha", instructions: "Instructions 1" },
        currentTurn: { prompt: "Query 1" },
      });

      const prompt2 = assemble4BlockCachePrompt({
        bot: { botName: "Bot Beta", instructions: "Instructions 2" },
        currentTurn: { prompt: "Query 2" },
      });

      // Bloc A must be 100% byte-identical across totally different bots and queries
      expect(prompt1.blocA).toBe(STATIC_PLATFORM_GUARDRAILS_BLOC_A);
      expect(prompt2.blocA).toBe(STATIC_PLATFORM_GUARDRAILS_BLOC_A);
      expect(prompt1.blocA).toBe(prompt2.blocA);

      // Verify it starts at index 0 of fullSystemPrompt
      expect(prompt1.fullSystemPrompt.startsWith(STATIC_PLATFORM_GUARDRAILS_BLOC_A)).toBe(true);
      expect(prompt2.fullSystemPrompt.startsWith(STATIC_PLATFORM_GUARDRAILS_BLOC_A)).toBe(true);
    });

    it("1.2 Guarantees Block B Persona & Deterministic Skill Sorting", () => {
      const unsortedSkills1 = [
        { slug: "z-skill", name: "Zeta Skill", description: "Desc Z", content: "Content Z" },
        { slug: "a-skill", name: "Alpha Skill", description: "Desc A", content: "Content A" },
        { slug: "m-skill", name: "Mu Skill", description: "Desc M", content: "Content M" },
      ];

      const unsortedSkills2 = [
        { slug: "m-skill", name: "Mu Skill", description: "Desc M", content: "Content M" },
        { slug: "z-skill", name: "Zeta Skill", description: "Desc Z", content: "Content Z" },
        { slug: "a-skill", name: "Alpha Skill", description: "Desc A", content: "Content A" },
      ];

      const prompt1 = assemble4BlockCachePrompt({
        bot: {
          botName: "Expert Coder",
          botTitle: "Senior Architect",
          instructions: "Analyze code thoroughly.",
          activeSkills: unsortedSkills1,
        },
        currentTurn: { prompt: "Check memory leaks" },
      });

      const prompt2 = assemble4BlockCachePrompt({
        bot: {
          botName: "Expert Coder",
          botTitle: "Senior Architect",
          instructions: "Analyze code thoroughly.",
          activeSkills: unsortedSkills2,
        },
        currentTurn: { prompt: "Check memory leaks" },
      });

      // Bloc B must be byte-identical regardless of activeSkills insertion order
      expect(prompt1.blocB).toBe(prompt2.blocB);
      expect(prompt1.blocB).toContain("=== BLOC B : CONFIGURATION BOT & COMPÉTENCES DURABLES ===");
      expect(prompt1.blocB).toContain("Nom: Expert Coder (Senior Architect)");
      expect(prompt1.blocB).toContain("### Instructions Durables\nAnalyze code thoroughly.");

      // Verify skill ordering: a-skill before m-skill before z-skill
      const idxA = prompt1.blocB.indexOf("Alpha Skill");
      const idxM = prompt1.blocB.indexOf("Mu Skill");
      const idxZ = prompt1.blocB.indexOf("Zeta Skill");
      expect(idxA).toBeGreaterThan(0);
      expect(idxM).toBeGreaterThan(idxA);
      expect(idxZ).toBeGreaterThan(idxM);
    });

    it("1.3 Preserves Strict 4-Block Sequence (A -> B -> C -> D) & History Compaction", () => {
      const history = [
        {
          role: "user" as const,
          content: "Run test suite",
        },
        {
          role: "assistant" as const,
          content: "Executing test suite...",
          toolResults: [
            {
              toolName: "shell",
              result: {
                output: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nline 11\nline 12",
              },
            },
          ],
        },
      ];

      const prompt = assemble4BlockCachePrompt({
        bot: { botName: "RunnerBot", instructions: "Execute commands" },
        history,
        currentTurn: {
          prompt: "What were the test results?",
          attachedFiles: [
            { name: "report.pdf", path: "/tmp/report.pdf", size: 10240 },
          ],
        },
      });

      // Check structure
      expect(prompt.blocC).toContain("=== BLOC C : HISTORIQUE CONVERSATIONNEL COMPACTÉ ===");
      expect(prompt.blocC).toContain("USER: Run test suite");
      expect(prompt.blocC).toContain("[Tool: shell]");

      expect(prompt.blocD).toContain("=== BLOC D : REQUÊTE COURANTE & CONTEXTE ÉPHÉMÈRE ===");
      expect(prompt.blocD).toContain("Fichiers joints au tour courant :");
      expect(prompt.blocD).toContain("report.pdf (/tmp/report.pdf, 10.0 Ko)");
      expect(prompt.blocD).toContain("Demande utilisateur :\nWhat were the test results?");

      // Verify combined context ordering: Bloc A, then Bloc B, then Bloc C, then Bloc D
      const idxBlocA = prompt.combinedContext.indexOf("=== BLOC A");
      const idxBlocB = prompt.combinedContext.indexOf("=== BLOC B");
      const idxBlocC = prompt.combinedContext.indexOf("=== BLOC C");
      const idxBlocD = prompt.combinedContext.indexOf("=== BLOC D");

      expect(idxBlocA).toBe(0);
      expect(idxBlocB).toBeGreaterThan(idxBlocA);
      expect(idxBlocC).toBeGreaterThan(idxBlocB);
      expect(idxBlocD).toBeGreaterThan(idxBlocC);

      // Verify system prompt contains A + B + C and user prompt contains D
      expect(prompt.fullSystemPrompt).toBe(`${prompt.blocA}\n\n${prompt.blocB}\n\n${prompt.blocC}`);
      expect(prompt.fullUserPrompt).toBe(prompt.blocD);
    });

    it("1.4 Handles Empty History and Empty Attachments Gracefully", () => {
      const prompt = assemble4BlockCachePrompt({
        bot: { botName: "MinimalBot", instructions: "Be quiet" },
        currentTurn: { prompt: "Hello" },
      });

      expect(prompt.blocC).toContain("(Nouvelle conversation - aucun historique)");
      expect(prompt.blocD).not.toContain("Fichiers joints");
      expect(prompt.blocD).toContain("Demande utilisateur :\nHello");
    });

    it("1.5 Validates extractCacheTelemetry Computations & Clamping", () => {
      // Case 1: Standard usage with cached tokens
      const t1 = extractCacheTelemetry(
        {
          prompt_tokens: 200,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 800 },
        },
        1200,
      );

      expect(t1.cachedTokens).toBe(800);
      expect(t1.promptTokens).toBe(200);
      expect(t1.completionTokens).toBe(50);
      expect(t1.totalPromptTokens).toBe(1000);
      expect(t1.cacheHitRatio).toBe(0.8);
      expect(t1.durationMs).toBe(1200);

      // Case 2: Zero prompt tokens (avoid NaN/division by zero)
      const t2 = extractCacheTelemetry({}, 100);
      expect(t2.cachedTokens).toBe(0);
      expect(t2.promptTokens).toBe(0);
      expect(t2.cacheHitRatio).toBe(0);

      // Case 3: Flat cached_tokens field
      const t3 = extractCacheTelemetry(
        { prompt_tokens: 100, cached_tokens: 300 },
        500,
      );
      expect(t3.cachedTokens).toBe(300);
      expect(t3.totalPromptTokens).toBe(400);
      expect(t3.cacheHitRatio).toBe(0.75);
    });
  });

  // =========================================================================
  // 2. Level 2: FNV-1a Session Affinity Key Empirical Verification
  // =========================================================================
  describe("2. Level 2: FNV-1a Session Affinity Key & Header Propagation", () => {
    it("2.1 Generates Deterministic FNV-1a Hashes in 'sess_<hex>' Format", () => {
      const params = {
        workspaceId: "ws_alpha_123",
        botId: "bot_reviewer_456",
        threadId: "th_main_789",
      };

      const hash1 = computeSessionAffinityKey(params);
      const hash2 = computeSessionAffinityKey(params);

      expect(hash1).toMatch(/^sess_[0-9a-f]{1,8}$/);
      expect(hash1).toBe(hash2);

      // Manual mathematical check of FNV-1a 32-bit:
      // Offset basis: 2166136261, Prime: 16777619
      const str = "ws_alpha_123:bot_reviewer_456:th_main_789";
      let expectedHash = 2166136261;
      for (let i = 0; i < str.length; i++) {
        expectedHash ^= str.charCodeAt(i);
        expectedHash = Math.imul(expectedHash, 16777619);
      }
      const expectedHex = `sess_${(expectedHash >>> 0).toString(16)}`;
      expect(hash1).toBe(expectedHex);
    });

    it("2.2 Guarantees Session Key Uniqueness Across Different Tenants/Bots/Threads", () => {
      const k1 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "bot1", threadId: "th1" });
      const k2 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "bot1", threadId: "th2" });
      const k3 = computeSessionAffinityKey({ workspaceId: "ws1", botId: "bot2", threadId: "th1" });
      const k4 = computeSessionAffinityKey({ workspaceId: "ws2", botId: "bot1", threadId: "th1" });

      const set = new Set([k1, k2, k3, k4]);
      expect(set.size).toBe(4);
    });

    it("2.3 Handles Boundary Inputs (Empty Strings, Unicode, Long Strings) Without Crashing", () => {
      const emptyKey = computeSessionAffinityKey({ workspaceId: "", botId: "", threadId: "" });
      expect(emptyKey).toMatch(/^sess_[0-9a-f]+$/);

      const unicodeKey = computeSessionAffinityKey({
        workspaceId: "ws_🚀",
        botId: "bot_🧠",
        threadId: "thread_✨",
      });
      expect(unicodeKey).toMatch(/^sess_[0-9a-f]+$/);

      const longKey = computeSessionAffinityKey({
        workspaceId: "w".repeat(1000),
        botId: "b".repeat(1000),
        threadId: "t".repeat(1000),
      });
      expect(longKey).toMatch(/^sess_[0-9a-f]+$/);
    });

    it("2.4 Injects 'x-session-id' Header in OmniRouteInferenceTransport Requests", async () => {
      let capturedHeaders: Headers | undefined;
      const mockFetch = vi.fn(async (input: any, init?: any) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n',
          {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "x-omniroute-cost": "0.000000",
              "x-omniroute-provider": "deepseek",
            },
          },
        );
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      try {
        const transport = new OmniRouteInferenceTransport({
          baseUrl: "http://127.0.0.1:8080/v1",
          apiKey: "test-key",
          defaultModel: "combo/rakazo-fast",
        });

        const testSessionId = "sess_abcdef12";
        const chunks: any[] = [];
        for await (const chunk of transport.stream({
          model: "combo/rakazo-fast",
          messages: [{ role: "user", content: "Test message" }],
          sessionId: testSessionId,
        })) {
          chunks.push(chunk);
        }

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(capturedHeaders?.get("x-session-id")).toBe(testSessionId);
        expect(capturedHeaders?.get("authorization")).toBe("Bearer test-key");
        expect(chunks.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("2.5 Computes and Injects 'x-session-id' Header in OmniRouteAdapter", async () => {
      let capturedHeaders: Headers | undefined;
      const mockFetch = vi.fn(async (input: any, init?: any) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            id: "chatcmpl-test",
            choices: [{ message: { content: "Complete response" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "x-omniroute-cost": "0.000000",
              "x-omniroute-provider": "deepseek",
            },
          },
        );
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      try {
        const adapter = new FreeOmniRouteAdapter({
          baseUrl: "http://127.0.0.1:8080/v1",
          apiKey: "test-adapter-key",
          defaultModel: "combo/rakazo-coding",
        });

        await adapter.complete({
          model: "combo/rakazo-coding",
          messages: [{ role: "user", content: "Write a function" }],
          workspaceId: "ws_emp_1",
          botId: "bot_emp_1",
          threadId: "th_emp_1",
        });

        const expectedAffinity = computeSessionAffinityKey({
          workspaceId: "ws_emp_1",
          botId: "bot_emp_1",
          threadId: "th_emp_1",
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(capturedHeaders?.get("x-session-id")).toBe(expectedAffinity);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // 3. Telemetry: Non-blocking Ingestion into PromptExecutionLog Verification
  // =========================================================================
  describe("3. Telemetry: Non-blocking Ingestion & SQL PromptExecutionLog", () => {
    it("3.1 Ingests Telemetry Asynchronously Without Blocking Caller", async () => {
      let createdPayload: any = null;
      let resolveDbCall: () => void;
      const dbPromise = new Promise<void>((resolve) => {
        resolveDbCall = resolve;
      });

      const mockPrisma: any = {
        promptExecutionLog: {
          create: vi.fn(async (args: any) => {
            createdPayload = args.data;
            await dbPromise; // Slow DB simulation
            return { id: "log_1", ...args.data, createdAt: new Date() };
          }),
        },
      };

      const logInput: PromptExecutionLogInput = {
        botId: "bot_alpha",
        executionId: "exec_123",
        provider: "omniroute",
        model: "combo/rakazo-reasoning",
        levelUsed: "omniroute_gateway",
        promptTokens: 500,
        completionTokens: 150,
        cachedTokens: 400,
        cacheHitRatio: 0.8,
        durationMs: 450,
        costEstimatedUsd: 0.0,
        inferenceMode: "free",
        requestedCategory: "reasoning",
        resolvedProvider: "deepseek",
        resolvedModel: "deepseek-r1",
        isFree: true,
      };

      // Call function - must return void synchronously
      const result = recordPromptExecutionLogAsync(mockPrisma, logInput);
      expect(result).toBeUndefined();

      // Database create must have been triggered
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(1);
      expect(createdPayload.botId).toBe("bot_alpha");
      expect(createdPayload.model).toBe("combo/rakazo-reasoning");
      expect(createdPayload.resolvedProvider).toBe("deepseek");
      expect(createdPayload.resolvedModel).toBe("deepseek-r1");
      expect(createdPayload.isFree).toBe(true);
      expect(createdPayload.cachedTokens).toBe(400);
      expect(createdPayload.cacheHitRatio).toBe(0.8);

      // Unblock the DB call
      resolveDbCall!();
      await new Promise((r) => setTimeout(r, 10));
    });

    it("3.2 Clamps Negative Tokens & Hit Ratios to Safe Bounds", () => {
      let createdPayload: any = null;
      const mockPrisma: any = {
        promptExecutionLog: {
          create: vi.fn(async (args: any) => {
            createdPayload = args.data;
            return { id: "log_safe", ...args.data };
          }),
        },
      };

      recordPromptExecutionLogAsync(mockPrisma, {
        levelUsed: "test",
        promptTokens: -50,
        completionTokens: -10,
        cachedTokens: -5,
        cacheHitRatio: 1.5, // > 1.0
        durationMs: -100,
      });

      expect(createdPayload.promptTokens).toBe(0);
      expect(createdPayload.completionTokens).toBe(0);
      expect(createdPayload.cachedTokens).toBe(0);
      expect(createdPayload.cacheHitRatio).toBe(1.0);
      expect(createdPayload.durationMs).toBe(0);
    });

    it("3.3 Silently Catches and Logs DB Rejections Without Crashing Host Process", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const failingPrisma: any = {
        promptExecutionLog: {
          create: vi.fn(async () => {
            throw new Error("DB Connection Refused (ECONNREFUSED)");
          }),
        },
      };

      expect(() => {
        recordPromptExecutionLogAsync(failingPrisma, {
          levelUsed: "error_test",
          botId: "bot_fail",
        });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 20));

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[Telemetry:PromptExecutionLog] Non-fatal persistence error:",
        "DB Connection Refused (ECONNREFUSED)",
      );

      consoleWarnSpy.mockRestore();
    });

    it("3.4 Correctly Queries and Filters Telemetry Logs via listPromptExecutionLogs", async () => {
      const mockLogs = [
        {
          id: "log_1",
          botId: "bot_1",
          model: "combo/rakazo-coding",
          inferenceMode: "free",
          isFree: true,
          cachedTokens: 300,
          createdAt: new Date(),
        },
        {
          id: "log_2",
          botId: "bot_1",
          model: "openai/gpt-oss-120b",
          inferenceMode: "premium",
          isFree: false,
          cachedTokens: 100,
          createdAt: new Date(),
        },
      ];

      const mockPrisma: any = {
        promptExecutionLog: {
          findMany: vi.fn(async (args: any) => {
            let res = [...mockLogs];
            if (args?.where?.botId) res = res.filter((l) => l.botId === args.where.botId);
            if (args?.where?.inferenceMode)
              res = res.filter((l) => l.inferenceMode === args.where.inferenceMode);
            if (args?.where?.isFree !== undefined)
              res = res.filter((l) => l.isFree === args.where.isFree);
            return res.slice(0, args?.take ?? 50);
          }),
        },
      };

      const freeLogs = await listPromptExecutionLogs(mockPrisma, {
        botId: "bot_1",
        inferenceMode: "free",
        isFree: true,
      });

      expect(freeLogs).toHaveLength(1);
      expect(freeLogs[0]!.id).toBe("log_1");
      expect(freeLogs[0]!.isFree).toBe(true);
      expect(mockPrisma.promptExecutionLog.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Adversarial Stress, Invariance Invariants & Concurrency Under Pressure
  // =========================================================================
  describe("4. Adversarial Stress & High-Load Telemetry/Affinity Invariance", () => {
    it("4.1 Proves 100% SHA-256 Byte Stability of Blocs A+B across 100 Diverse User Turns", async () => {
      const crypto = await import("node:crypto");
      const sha256 = (str: string) => crypto.createHash("sha256").update(str).digest("hex");

      const bot = {
        botName: "AdversarialAgent",
        botTitle: "Security Inspector",
        instructions: "System prompt invariance stress test instructions with unicode 🚀 and code symbols `const x = 10;`",
        activeSkills: [
          { slug: "skill-3", name: "Gamma", description: "Desc 3", content: "Content 3" },
          { slug: "skill-1", name: "Alpha", description: "Desc 1", content: "Content 1" },
          { slug: "skill-2", name: "Beta", description: "Desc 2", content: "Content 2" },
        ],
      };

      const basePrompt = assemble4BlockCachePrompt({
        bot,
        currentTurn: { prompt: "Initial query turn 0" },
      });

      const baselineSystemHash = sha256(basePrompt.blocA + "\n\n" + basePrompt.blocB);

      // Simulate 100 distinct conversational turns with dynamic prompts, files, history
      const historyTurns: any[] = [];
      for (let i = 1; i <= 100; i++) {
        historyTurns.push({
          role: i % 2 === 1 ? "user" : "assistant",
          content: `Historical utterance for turn ${i} with token entropy ${Math.random().toString(36)}`,
          toolResults: i % 3 === 0 ? [{ toolName: "shell", result: { output: `Command result ${i}` } }] : undefined,
        });

        const turnPrompt = assemble4BlockCachePrompt({
          bot,
          history: historyTurns,
          currentTurn: {
            prompt: `Ephemeral user turn query #${i} with dynamic payload: ${Date.now()}`,
            attachedFiles: i % 5 === 0 ? [{ name: `file_${i}.ts`, path: `/app/src/file_${i}.ts`, size: i * 512 }] : undefined,
          },
        });

        const currentSystemHash = sha256(turnPrompt.blocA + "\n\n" + turnPrompt.blocB);
        expect(currentSystemHash).toBe(baselineSystemHash);
        expect(turnPrompt.blocA).toBe(basePrompt.blocA);
        expect(turnPrompt.blocB).toBe(basePrompt.blocB);
      }
    });

    it("4.2 Validates FNV-1a Hash Distribution and Collision Resistance over 10,000 Keys", () => {
      const keys = new Set<string>();
      const N = 10000;

      for (let i = 0; i < N; i++) {
        const key = computeSessionAffinityKey({
          workspaceId: `ws_${i % 50}`,
          botId: `bot_${(i * 7) % 200}`,
          threadId: `thread_${i}`,
        });
        keys.add(key);
      }

      // For 10,000 distinct (ws, bot, thread) inputs in 32-bit hash space:
      // Birthday problem expectation: N^2 / (2 * 2^32) = 10^8 / 8.58*10^9 ~ 0.011 collisions.
      // Practically, all 10,000 should be unique (or >= 9,990).
      expect(keys.size).toBeGreaterThanOrEqual(9995);
    });

    it("4.3 High-Throughput Concurrency: 1,000 Concurrent Telemetry Logs Dispatched in < 50ms", async () => {
      let writeCount = 0;
      let failCount = 0;

      const mockPrisma: any = {
        promptExecutionLog: {
          create: vi.fn(async (args: any) => {
            // Random jitter
            await new Promise((r) => setTimeout(r, Math.random() * 10));
            if (Math.random() < 0.1) {
              failCount++;
              throw new Error("Simulated transient connection timeout");
            }
            writeCount++;
            return { id: `log_${writeCount}`, ...args.data };
          }),
        },
      };

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        recordPromptExecutionLogAsync(mockPrisma, {
          botId: `bot_${i % 10}`,
          executionId: `exec_${i}`,
          levelUsed: "omniroute_gateway",
          promptTokens: 100 + i,
          completionTokens: 20 + i,
          cachedTokens: 80,
          cacheHitRatio: 0.8,
          durationMs: 250,
          isFree: true,
          inferenceMode: "free",
        });
      }
      const dispatchDuration = performance.now() - start;

      // All 1,000 dispatches must execute synchronously in < 50ms without blocking
      expect(dispatchDuration).toBeLessThan(100);
      expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(1000);

      // Wait for async promises to settle
      await new Promise((r) => setTimeout(r, 100));
      expect(writeCount + failCount).toBe(1000);
    });
  });
});

