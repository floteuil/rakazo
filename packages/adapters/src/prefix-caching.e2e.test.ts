import { describe, expect, it } from "vitest";
import {
  createToolCallTracker,
  evaluateToolCallGuard,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
  MAX_TOOL_ITERATIONS_PER_TURN,
  type ToolCallTracker,
} from "./loop-guards.js";
import {
  compactToolResult,
  MAX_GENERIC_RESULT_CHARS,
  MAX_SHELL_OUTPUT_CHARS,
} from "./tool-compacting.js";
import { formatSkillsPrompt, type SkillItemLike } from "./executor.js";
import { sanitizeToolError } from "./enterprise-tools.js";

import {
  assemble4BlockCachePrompt,
  computeSessionAffinityKey,
  extractCacheTelemetry,
  STATIC_PLATFORM_GUARDRAILS_BLOC_A,
  type Assembled4BlockPrompt,
  type BotPromptConfig,
  type ConversationTurn,
  type EphemeralUserTurn,
} from "./prefix-caching.js";

// ============================================================================
// 4-TIER E2E TEST SUITE FOR PREFIX CACHING & RUNTIME OPTIMIZATION
// ============================================================================

describe("Context Optimization & Prefix Caching (Master 4-Tier E2E)", () => {
  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature for F4, F5, F6)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    describe("Feature 4: 4-Block Cache-Friendly System Prompt Assembly", () => {
      it("1.4.1 assembles system prompt in strict order A -> B -> C -> D to maximize KV prefix caching", () => {
        const assembled = assemble4BlockCachePrompt({
          bot: {
            botName: "devops-engineer",
            botTitle: "Ingénieur DevOps",
            instructions: "Automatiser les builds CI/CD.",
          },
          history: [{ role: "user", content: "Bonjour, quel est le statut ?" }],
          currentTurn: { prompt: "Déploie le conteneur." },
        });

        const full = assembled.combinedContext;
        const indexA = full.indexOf("BLOC A");
        const indexB = full.indexOf("BLOC B");
        const indexC = full.indexOf("BLOC C");
        const indexD = full.indexOf("BLOC D");

        expect(indexA).toBeGreaterThan(-1);
        expect(indexB).toBeGreaterThan(indexA);
        expect(indexC).toBeGreaterThan(indexB);
        expect(indexD).toBeGreaterThan(indexC);
      });

      it("1.4.2 guarantees Bloc A is byte-identical across multiple bot instances for universal cache reuse", () => {
        const prompt1 = assemble4BlockCachePrompt({
          bot: { botName: "bot-alpha", instructions: "Tâche 1." },
          currentTurn: { prompt: "Go" },
        });
        const prompt2 = assemble4BlockCachePrompt({
          bot: { botName: "bot-beta", instructions: "Tâche 2." },
          currentTurn: { prompt: "Go" },
        });

        expect(prompt1.blocA).toBe(prompt2.blocA);
        expect(prompt1.blocA).toBe(STATIC_PLATFORM_GUARDRAILS_BLOC_A);
      });

      it("1.4.3 preserves Bloc B across multiple turns of the same bot while history in Bloc C updates", () => {
        const botConfig = {
          botName: "sales-assistant",
          instructions: "Qualifier les leads.",
        };

        const turn1 = assemble4BlockCachePrompt({
          bot: botConfig,
          history: [],
          currentTurn: { prompt: "Tour 1" },
        });

        const turn2 = assemble4BlockCachePrompt({
          bot: botConfig,
          history: [
            { role: "user", content: "Tour 1" },
            { role: "assistant", content: "Réponse 1" },
          ],
          currentTurn: { prompt: "Tour 2" },
        });

        expect(turn1.blocB).toBe(turn2.blocB);
        expect(turn1.blocA).toBe(turn2.blocA);
        expect(turn1.blocC).not.toBe(turn2.blocC);
      });

      it("1.4.4 incorporates formatted active skills into Bloc B dynamically", () => {
        const skills: SkillItemLike[] = [
          {
            name: "Kubernetes Operator",
            slug: "k8s-op",
            description: "Gestion des clusters K8s",
            content: "Règles d'opération kubectl et helm.",
            enabled: true,
          },
        ];

        const assembled = assemble4BlockCachePrompt({
          bot: {
            botName: "k8s-bot",
            instructions: "Gérer l'infra.",
            activeSkills: skills,
          },
          currentTurn: { prompt: "Statut des pods ?" },
        });

        expect(assembled.blocB).toContain("Kubernetes Operator");
        expect(assembled.blocB).toContain("Règles d'opération kubectl et helm.");
      });

      it("1.4.5 separates system prompt and user turn with clean boundary markers", () => {
        const assembled = assemble4BlockCachePrompt({
          bot: { botName: "bot-test", instructions: "Test." },
          currentTurn: { prompt: "Hello" },
        });

        expect(assembled.fullSystemPrompt).toContain("BLOC A");
        expect(assembled.fullSystemPrompt).toContain("BLOC B");
        expect(assembled.fullSystemPrompt).toContain("BLOC C");
        expect(assembled.fullUserPrompt).toContain("BLOC D");
      });
    });

    describe("Feature 5: Token & Cache Telemetry Extraction & Sticky Routing", () => {
      it("1.5.1 extracts cached_tokens, prompt_tokens, completion_tokens and computes cacheHitRatio", () => {
        const usagePayload = {
          prompt_tokens: 200,
          completion_tokens: 150,
          total_tokens: 350,
          prompt_tokens_details: {
            cached_tokens: 1800,
          },
        };

        const telemetry = extractCacheTelemetry(usagePayload, 450);
        expect(telemetry.cachedTokens).toBe(1800);
        expect(telemetry.promptTokens).toBe(200);
        expect(telemetry.completionTokens).toBe(150);
        expect(telemetry.totalPromptTokens).toBe(2000);
        expect(telemetry.cacheHitRatio).toBe(0.9);
        expect(telemetry.durationMs).toBe(450);
      });

      it("1.5.2 generates deterministic session affinity keys for sticky routing without cross-tenant collision", () => {
        const key1 = computeSessionAffinityKey({
          workspaceId: "ws-paris-01",
          botId: "bot-101",
          threadId: "thread-abc",
        });
        const key2 = computeSessionAffinityKey({
          workspaceId: "ws-paris-01",
          botId: "bot-101",
          threadId: "thread-abc",
        });
        const keyOtherTenant = computeSessionAffinityKey({
          workspaceId: "ws-london-02",
          botId: "bot-101",
          threadId: "thread-abc",
        });

        expect(key1).toBe(key2);
        expect(key1).not.toBe(keyOtherTenant);
        expect(key1).toMatch(/^sess_[a-f0-9]+$/);
      });

      it("1.5.3 supports legacy cached_tokens property in usage object", () => {
        const legacyUsage = {
          prompt_tokens: 100,
          completion_tokens: 50,
          cached_tokens: 900,
        };
        const telemetry = extractCacheTelemetry(legacyUsage, 200);
        expect(telemetry.cachedTokens).toBe(900);
        expect(telemetry.cacheHitRatio).toBe(0.9);
      });

      it("1.5.4 clamps cacheHitRatio strictly within [0.0, 1.0]", () => {
        const extreme = extractCacheTelemetry({ prompt_tokens: 10, cached_tokens: 0 }, 100);
        expect(extreme.cacheHitRatio).toBe(0.0);
      });

      it("1.5.5 isolates session affinity keys between different threads of the same bot", () => {
        const t1 = computeSessionAffinityKey({ workspaceId: "ws-1", botId: "bot-1", threadId: "t-1" });
        const t2 = computeSessionAffinityKey({ workspaceId: "ws-1", botId: "bot-1", threadId: "t-2" });
        expect(t1).not.toBe(t2);
      });
    });

    describe("Feature 6: Loop Guards & Tool Compacting Preservation", () => {
      it("1.6.1 preserves evaluateToolCallGuard circuit breaker after MAX_TOOL_ITERATIONS_PER_TURN (25)", () => {
        const tracker: ToolCallTracker = createToolCallTracker();

        for (let i = 1; i <= 25; i++) {
          const res = evaluateToolCallGuard(tracker, "read_file", { path: `/file_${i}.ts` });
          expect(res.allow).toBe(true);
        }

        const overLimit = evaluateToolCallGuard(tracker, "read_file", { path: "/file_26.ts" });
        expect(overLimit.allow).toBe(false);
        if (!overLimit.allow) {
          expect(overLimit.terminate).toBe(true);
          expect(overLimit.reason).toContain("Circuit breaker triggered");
        }
      });

      it("1.6.2 preserves loop detector after 3 consecutive identical tool calls", () => {
        const tracker = createToolCallTracker();

        expect(evaluateToolCallGuard(tracker, "web_search", { query: "Rakazo architecture" }).allow).toBe(true);
        expect(evaluateToolCallGuard(tracker, "web_search", { query: "Rakazo architecture" }).allow).toBe(true);
        const call3 = evaluateToolCallGuard(tracker, "web_search", { query: "Rakazo architecture" });
        expect(call3.allow).toBe(false);
        if (!call3.allow) {
          expect(call3.terminate).toBe(true);
          expect(call3.reason).toContain("Loop detected");
        }
      });

      it("1.6.3 compacts large shell outputs (>4000 chars) into head/tail with truncation marker", () => {
        const hugeShellOutput = "LINE_START\n" + "A".repeat(10_000) + "\nLINE_END";
        const compacted = compactToolResult("shell", { output: hugeShellOutput });

        expect(compacted.length).toBeLessThan(4500);
        expect(compacted).toContain("[... ");
        expect(compacted).toContain("characters truncated ...]");
        expect(compacted).toContain("LINE_START");
        expect(compacted).toContain("LINE_END");
      });

      it("1.6.4 compacts GitHub repository searches into concise star and language summaries", () => {
        const repos = [
          { full_name: "elie222/rakazo", stars: 1200, language: "TypeScript", description: "AI Agent platform" },
        ];
        const compacted = compactToolResult("github_search_repos", repos);
        expect(compacted).toContain("elie222/rakazo (1200⭐, TypeScript)");
      });

      it("1.6.5 compacts Cloudflare DNS records into tabular arrays", () => {
        const records = [{ type: "A", name: "app.rakazo.com", content: "1.2.3.4", proxied: true }];
        const compacted = compactToolResult("cloudflare_list_dns_records", records);
        expect(compacted).toContain("[\"A\",\"app.rakazo.com\",\"1.2.3.4\",true]");
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    describe("F4 Boundaries: Prompt Layout Extremes", () => {
      it("2.4.1 handles conversation turn with attached files description cleanly in Bloc D", () => {
        const assembled = assemble4BlockCachePrompt({
          bot: { botName: "bot", instructions: "Instr" },
          currentTurn: {
            prompt: "Analyse ce fichier.",
            attachedFiles: [{ name: "report.pdf", path: "/data/report.pdf", size: 20480 }],
          },
        });
        expect(assembled.blocD).toContain("report.pdf");
        expect(assembled.blocD).toContain("20.0 Ko");
      });

      it("2.4.2 handles 50 turns history with massive tool calls under memory limits", () => {
        const history: ConversationTurn[] = Array.from({ length: 50 }, (_, i) => ({
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Turn ${i}`,
          toolResults: [{ toolName: "read_file", result: { content: "Code..." } }],
        }));

        const assembled = assemble4BlockCachePrompt({
          bot: { botName: "history-bot", instructions: "Instructions" },
          history,
          currentTurn: { prompt: "Turn 51" },
        });

        expect(assembled.blocC).toContain("Turn 49");
        expect(assembled.blocC).toContain("[Tool: read_file]");
      });

      it("2.4.3 handles empty bot instructions gracefully with fallback formatting", () => {
        const assembled = assemble4BlockCachePrompt({
          bot: { botName: "empty-bot", instructions: "" },
          currentTurn: { prompt: "Go" },
        });
        expect(assembled.blocB).toContain("Nom: empty-bot");
      });

      it("2.4.4 handles disabled skills without polluting Bloc B", () => {
        const skills: SkillItemLike[] = [
          { name: "Disabled Skill", slug: "dis", content: "None", enabled: false },
        ];
        const assembled = assemble4BlockCachePrompt({
          bot: { botName: "test-bot", instructions: "Instr", activeSkills: skills },
          currentTurn: { prompt: "Go" },
        });
        expect(assembled.blocB).not.toContain("Disabled Skill");
      });

      it("2.4.5 preserves exact character casing and symbols across all 4 blocs", () => {
        const assembled = assemble4BlockCachePrompt({
          bot: { botName: "Case_Bot_#1", instructions: "Special: € & @ %" },
          currentTurn: { prompt: "Query: ∑(x)" },
        });
        expect(assembled.combinedContext).toContain("Special: € & @ %");
        expect(assembled.combinedContext).toContain("Query: ∑(x)");
      });
    });

    describe("F5 Boundaries: Telemetry Zeroes & Extremes", () => {
      it("2.5.1 handles cold conversation turn with 0 cached tokens without NaN in ratio", () => {
        const coldUsage = {
          prompt_tokens: 450,
          completion_tokens: 120,
          total_tokens: 570,
          cached_tokens: 0,
        };

        const telemetry = extractCacheTelemetry(coldUsage, 300);
        expect(telemetry.cachedTokens).toBe(0);
        expect(telemetry.cacheHitRatio).toBe(0);
        expect(Number.isNaN(telemetry.cacheHitRatio)).toBe(false);
      });

      it("2.5.2 handles extreme hot cache with 99% hit ratio accurately", () => {
        const hotUsage = {
          prompt_tokens: 20,
          completion_tokens: 100,
          prompt_tokens_details: { cached_tokens: 1980 },
        };

        const telemetry = extractCacheTelemetry(hotUsage, 180);
        expect(telemetry.cacheHitRatio).toBe(1980 / 2000);
        expect(telemetry.cacheHitRatio).toBe(0.99);
      });

      it("2.5.3 handles usage with undefined prompt_tokens gracefully", () => {
        const emptyUsage = {};
        const telemetry = extractCacheTelemetry(emptyUsage, 50);
        expect(telemetry.cachedTokens).toBe(0);
        expect(telemetry.promptTokens).toBe(0);
        expect(telemetry.cacheHitRatio).toBe(0);
      });

      it("2.5.4 handles very long duration (1 hour) in durationMs", () => {
        const telemetry = extractCacheTelemetry({ prompt_tokens: 10 }, 3_600_000);
        expect(telemetry.durationMs).toBe(3_600_000);
      });

      it("2.5.5 handles session affinity key with non-ASCII workspace and bot IDs", () => {
        const key = computeSessionAffinityKey({
          workspaceId: "espace-français-éàç",
          botId: "bot-sécurité-2026",
          threadId: "fil-d'échange",
        });
        expect(key).toMatch(/^sess_[a-f0-9]+$/);
      });
    });

    describe("F6 Boundaries: Compaction Robustness & Circuit Breakers", () => {
      it("2.6.1 compacts 10,000 files in list_files under 1000ms without memory bloat", () => {
        const startTime = Date.now();
        const files = Array.from({ length: 10_000 }, (_, i) => ({
          path: `/src/module_${i % 10}/file_${i}.ts`,
        }));

        const compacted = compactToolResult("list_files", files);
        const elapsed = Date.now() - startTime;

        expect(elapsed).toBeLessThan(1000);
        expect(compacted).toContain("Found 10000 files");
        expect(compacted).toContain("... (+9970 more files)");
      });

      it("2.6.2 handles deeply nested circular tool results without throwing in compactToolResult", () => {
        const circular: Record<string, unknown> = { name: "test" };
        circular.self = circular;

        expect(() => compactToolResult("custom_tool", circular)).not.toThrow();
        const res = compactToolResult("custom_tool", circular);
        expect(res).toBeDefined();
      });

      it("2.6.3 preserves loop tracker state when alternating between different tool calls", () => {
        const tracker = createToolCallTracker();

        for (let i = 0; i < 10; i++) {
          expect(evaluateToolCallGuard(tracker, "tool_a", { id: 1 }).allow).toBe(true);
          expect(evaluateToolCallGuard(tracker, "tool_b", { id: 2 }).allow).toBe(true);
        }
        expect(tracker.consecutiveSameCallCount).toBe(1);
      });

      it("2.6.4 sanitizes credentials and Bearer tokens in error strings", () => {
        const rawError = "Request failed with Authorization: Bearer sk-secret-token-12345 and ghp_MYGITHUBTOKEN";
        const sanitized = sanitizeToolError(rawError);
        expect(sanitized).not.toContain("sk-secret-token-12345");
        expect(sanitized).not.toContain("ghp_MYGITHUBTOKEN");
        expect(sanitized).toContain("Bearer [redacted]");
        expect(sanitized).toContain("ghp_[redacted]");
      });

      it("2.6.5 handles tool with null or undefined result in compactToolResult", () => {
        expect(compactToolResult("shell", null)).toBe("ok");
        expect(compactToolResult("shell", undefined)).toBe("ok");
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 4-Block system prompt assembly + Tool compacting of 100 GitHub issues + Telemetry calculation", () => {
      const mockIssues = Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        title: `Bug in parser #${i + 1}`,
        state: "open",
        user: { login: `dev_${i}` },
      }));

      const assembled = assemble4BlockCachePrompt({
        bot: {
          botName: "github-manager",
          instructions: "Gérer les issues GitHub.",
        },
        history: [
          {
            role: "assistant",
            content: "J'ai inspecté les tickets.",
            toolResults: [{ toolName: "github_list_issues", result: mockIssues }],
          },
        ],
        currentTurn: { prompt: "Résume les 5 plus critiques." },
      });

      expect(assembled.blocC).toContain("[Tool: github_list_issues]");
      expect(assembled.blocC).toContain("#1 [open] Bug in parser #1 (@dev_0)");
      expect(assembled.fullSystemPrompt.startsWith(STATIC_PLATFORM_GUARDRAILS_BLOC_A)).toBe(true);
    });

    it("3.2 Loop guards + Compacting in multi-turn conversation with repeated tool errors", () => {
      const tracker = createToolCallTracker();

      const callResult1 = evaluateToolCallGuard(tracker, "read_file", { path: "/nonexistent.txt" });
      expect(callResult1.allow).toBe(true);

      const compactedError = compactToolResult("read_file", { error: "File not found: /nonexistent.txt" });
      expect(compactedError).toContain("File not found");

      const callResult2 = evaluateToolCallGuard(tracker, "read_file", { path: "/nonexistent.txt" });
      expect(callResult2.allow).toBe(true);

      const callResult3 = evaluateToolCallGuard(tracker, "read_file", { path: "/nonexistent.txt" });
      expect(callResult3.allow).toBe(false);
    });

    it("3.3 Sticky routing with subagent execution in child turn", () => {
      const parentAffinity = computeSessionAffinityKey({
        workspaceId: "ws-enterprise-01",
        botId: "parent-bot",
        threadId: "thread-xyz",
      });

      const childAffinity = computeSessionAffinityKey({
        workspaceId: "ws-enterprise-01",
        botId: "parent-bot",
        threadId: "thread-xyz:subagent-1",
      });

      expect(parentAffinity).toBeDefined();
      expect(childAffinity).toBeDefined();
      expect(parentAffinity).not.toBe(childAffinity);
    });

    it("3.4 4-Block prompt assembly with multi-skill injection and sticky routing telemetry", () => {
      const skills: SkillItemLike[] = [
        { name: "Skill A", slug: "skill-a", content: "Instructions A", enabled: true },
        { name: "Skill B", slug: "skill-b", content: "Instructions B", enabled: true },
      ];

      const prompt = assemble4BlockCachePrompt({
        bot: { botName: "multi-bot", instructions: "Main", activeSkills: skills },
        currentTurn: { prompt: "Execute" },
      });

      const affinity = computeSessionAffinityKey({ workspaceId: "ws", botId: "bot", threadId: "th" });
      const telemetry = extractCacheTelemetry({ prompt_tokens: 300, cached_tokens: 1500 }, 250);

      expect(prompt.blocB).toContain("Skill A");
      expect(prompt.blocB).toContain("Skill B");
      expect(affinity).toBeDefined();
      expect(telemetry.cacheHitRatio).toBeCloseTo(1500 / 1800, 3);
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 Real-World: High-Turn Coding Assistant with 12 Iterative Tool Calls & 85%+ Prefix Cache Hit Rate", () => {
      const tracker = createToolCallTracker();
      let cumulativeCachedTokens = 0;
      let cumulativePromptTokens = 0;

      for (let turn = 1; turn <= 12; turn++) {
        const guard = evaluateToolCallGuard(tracker, "read_file", { path: `/src/components/View_${turn}.tsx` });
        expect(guard.allow).toBe(true);

        const baseStaticTokens = 1500;
        const historyTokens = (turn - 1) * 200;
        const cached = baseStaticTokens + historyTokens;
        const fresh = 180;

        const usage = {
          prompt_tokens: fresh,
          completion_tokens: 120,
          prompt_tokens_details: { cached_tokens: cached },
        };

        const telemetry = extractCacheTelemetry(usage, 350);
        cumulativeCachedTokens += telemetry.cachedTokens;
        cumulativePromptTokens += telemetry.promptTokens;

        if (turn >= 3) {
          expect(telemetry.cacheHitRatio).toBeGreaterThan(0.85);
        }
      }

      expect(tracker.stepCount).toBe(12);
      expect(cumulativeCachedTokens).toBeGreaterThan(20_000);
    });

    it("4.2 Real-World: Multi-Tenant Conversation with Distinct Bot Personas & Independent KV Prefixes", () => {
      const tenantA = {
        workspaceId: "workspace-floteuil",
        botId: "bot-comptabilite",
        threadId: "thread-bilan-2026",
      };
      const tenantB = {
        workspaceId: "workspace-groupe-b",
        botId: "bot-recrutement",
        threadId: "thread-candidats",
      };

      const affinityA = computeSessionAffinityKey(tenantA);
      const affinityB = computeSessionAffinityKey(tenantB);

      const promptA = assemble4BlockCachePrompt({
        bot: {
          botName: "Comptabilité Bot",
          instructions: "Gérer la TVA et les bilans comptables.",
        },
        currentTurn: { prompt: "Exporter le grand livre." },
      });

      const promptB = assemble4BlockCachePrompt({
        bot: {
          botName: "Recrutement Bot",
          instructions: "Trier les CVs et planifier les entretiens.",
        },
        currentTurn: { prompt: "Afficher les candidats qualifiés." },
      });

      expect(affinityA).not.toBe(affinityB);
      expect(promptA.blocA).toBe(promptB.blocA);
      expect(promptA.blocB).toContain("Comptabilité Bot");
      expect(promptB.blocB).toContain("Recrutement Bot");
    });
  });
});
