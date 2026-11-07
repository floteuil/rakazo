import {
  buildSkillMarkdown,
  formatYamlBlockScalar,
  getAllSovereignTools,
  parseSkillMarkdown,
  SOVEREIGN_MCP_CONNECTORS,
} from "@rakazo/contracts";
import {
  isAgedStuckWork,
  STUCK_WORK_EXPIRE_AFTER_MS,
  STUCK_WORK_NOTIFY_AFTER_MS,
  stuckWorkAction,
} from "@rakazo/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import { enterpriseAgentTools, executeEnterpriseTool } from "./enterprise-tools.js";
import {
  isSilentRoutineOutput,
  runIdentityInstruction,
  SILENT_ROUTINE_DIRECTIVE_FR,
  SILENT_ROUTINE_TOKEN,
} from "./executor.js";
import {
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  RakazoFreePolicyEngine,
} from "./free-policy-engine.js";
import {
  computeToolCallSignature,
  createToolCallTracker,
  evaluateToolCallGuard,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
  MAX_TOOL_ITERATIONS_PER_TURN,
} from "./loop-guards.js";
import { listPiCatalog } from "./pi-models.js";
import {
  CanonicalAgentRuntime,
  MODEL_CONNECT_TIMEOUT_MS,
  MODEL_STREAM_IDLE_TIMEOUT_MS,
  MODEL_STREAM_TIMEOUT_MS,
  modelConnectTimeoutMs,
  modelStreamIdleTimeoutMs,
  modelStreamIdleWatchdog,
  modelStreamTimeoutMs,
} from "./pi-runtime.js";
import {
  assemble4BlockCachePrompt,
  computeSessionAffinityKey,
  extractCacheTelemetry,
  resolvePromptCacheStrategy,
} from "./prefix-caching.js";
import {
  ANTI_PROMPT_INJECTION_RULE_FR,
  CONTRACTUAL_AUTONOMY_RULE_FR,
  CONTRACTUAL_ESCALATION_RULE_FR,
  compilePromptLevel1Deterministic,
  createPromptCompilerService,
  extractThoughtTrace,
  SHOW_THE_TAPE_RULE_FR,
} from "./prompt-compiler.js";
import {
  SUBAGENT_MAX_DEPTH,
  SUBAGENT_TOKEN_BUDGET_CEILING,
  SubagentExecutor,
} from "./subagent-inheritance.js";
import {
  compactToolResult,
  MAX_GENERIC_RESULT_CHARS,
  MAX_SHELL_OUTPUT_CHARS,
} from "./tool-compacting.js";

describe("Master Sovereign Sanctuary, Anti-Runaway & v0.8.0+ Certification Suite", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // ==========================================================================
  // 1. ANTI-EMBALLEMENT (ANTI-RUNAWAY TOKEN & LOOP GUARDRAILS)
  // ==========================================================================
  describe("1. Anti-Emballement & Token Protection System (7 Layers)", () => {
    it("Layer 1: Enforces hard circuit breaker at MAX_TOOL_ITERATIONS_PER_TURN (25 steps)", () => {
      expect(MAX_TOOL_ITERATIONS_PER_TURN).toBe(25);
      const tracker = createToolCallTracker();
      for (let i = 1; i <= MAX_TOOL_ITERATIONS_PER_TURN; i++) {
        const res = evaluateToolCallGuard(tracker, `tool_${i}`, { step: i });
        expect(res.allow).toBe(true);
      }
      const overflow = evaluateToolCallGuard(tracker, "tool_26", { step: 26 });
      expect(overflow.allow).toBe(false);
      if (!overflow.allow) {
        expect(overflow.terminate).toBe(true);
        expect(overflow.reason).toContain("Circuit breaker triggered");
      }
    });

    it("Layer 2: Detects and terminates consecutive redundant tool calls regardless of key order", () => {
      expect(MAX_CONSECUTIVE_REDUNDANT_CALLS).toBe(3);
      const sigA = computeToolCallSignature("web_search", { b: 2, a: 1 });
      const sigB = computeToolCallSignature("web_search", { a: 1, b: 2 });
      expect(sigA).toBe(sigB);

      const tracker = createToolCallTracker();
      expect(evaluateToolCallGuard(tracker, "web_search", { a: 1, b: 2 }).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker, "web_search", { b: 2, a: 1 }).allow).toBe(true);
      const third = evaluateToolCallGuard(tracker, "web_search", { a: 1, b: 2 });
      expect(third.allow).toBe(false);
      if (!third.allow) {
        expect(third.terminate).toBe(true);
        expect(third.reason).toContain("Loop detected");
      }
    });

    it("Layer 3: Semantic Tool Compactor bounds shell and generic JSON payloads to prevent context bloat", () => {
      const hugeShell = "A".repeat(10_000);
      const compactedShell = compactToolResult("shell", { stdout: hugeShell });
      expect(compactedShell.length).toBeLessThan(MAX_SHELL_OUTPUT_CHARS + 100);
      expect(compactedShell).toContain("characters truncated");

      const hugeGeneric = { data: "X".repeat(25_000) };
      const compactedGeneric = compactToolResult("custom_mcp_tool", hugeGeneric);
      expect(compactedGeneric.length).toBeLessThanOrEqual(MAX_GENERIC_RESULT_CHARS);
    });

    it("Layer 4: Subagent Inheritance caps depth at 1, strips delegation tools, and caps token budget at 8192", () => {
      expect(SUBAGENT_MAX_DEPTH).toBe(1);
      expect(SUBAGENT_TOKEN_BUDGET_CEILING).toBe(8192);

      const executor = new SubagentExecutor();
      const parentBot = {
        id: "bot-parent",
        name: "Parent Bot",
        inferenceMode: "free" as const,
        usageTags: ["coding" as const],
        tools: ["web_search", "run_subagent", "spawn_bot", "archive_bot"],
        depth: 0,
      };

      const subCtx = executor.spawnSubagent({
        parentBot,
        taskPrompt: "Check code",
      });
      expect(subCtx.maxDepth).toBe(1);
      expect(subCtx.maxTokens).toBeLessThanOrEqual(8192);
      expect(subCtx.availableTools).toContain("web_search");
      expect(subCtx.availableTools).not.toContain("run_subagent");
      expect(subCtx.availableTools).not.toContain("spawn_bot");
      expect(subCtx.availableTools).not.toContain("archive_bot");

      expect(() =>
        executor.spawnSubagent({
          parentBot: { ...parentBot, depth: 1 },
          taskPrompt: "Recursive",
        }),
      ).toThrow(/depth/i);
    });

    it("Layer 5: 4-Block Prefix Caching & FNV-1a Sticky Session Affinity maximize KV cache hits", () => {
      const key1 = computeSessionAffinityKey({
        workspaceId: "ws-1",
        botId: "bot-1",
        threadId: "th-1",
      });
      const key2 = computeSessionAffinityKey({
        workspaceId: "ws-1",
        botId: "bot-1",
        threadId: "th-1",
      });
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^sess_[0-9a-f]+$/);

      const assembled = assemble4BlockCachePrompt({
        bot: { botName: "Agent Alpha", instructions: "Réponds avec précision." },
        history: [{ role: "user", content: "Bonjour" }],
        currentTurn: { prompt: "Analyse les résultats." },
      });
      expect(assembled.blocA).toContain("Maximum 25 tool steps");
      expect(assembled.fullSystemPrompt.startsWith(assembled.blocA)).toBe(true);

      const telemetry = extractCacheTelemetry(
        {
          prompt_tokens: 200,
          completion_tokens: 100,
          prompt_tokens_details: { cached_tokens: 800 },
        },
        450,
      );
      expect(telemetry.cachedTokens).toBe(800);
      expect(telemetry.cacheHitRatio).toBeCloseTo(0.8, 2);
    });

    it("Layer 6: Stuck Work Detector notifies at 4h and expires abandoned runs at 24h", () => {
      expect(STUCK_WORK_NOTIFY_AFTER_MS).toBe(4 * 60 * 60 * 1000);
      expect(STUCK_WORK_EXPIRE_AFTER_MS).toBe(24 * 60 * 60 * 1000);
      expect(stuckWorkAction({ ageMs: 1_000, alreadyNotified: false })).toBe("none");
      expect(stuckWorkAction({ ageMs: STUCK_WORK_NOTIFY_AFTER_MS, alreadyNotified: false })).toBe(
        "notify",
      );
      expect(stuckWorkAction({ ageMs: STUCK_WORK_NOTIFY_AFTER_MS, alreadyNotified: true })).toBe(
        "none",
      );
      expect(stuckWorkAction({ ageMs: STUCK_WORK_EXPIRE_AFTER_MS, alreadyNotified: true })).toBe(
        "expire",
      );
      expect(
        isAgedStuckWork("queued", new Date(Date.now() - STUCK_WORK_NOTIFY_AFTER_MS - 1000)),
      ).toBe(true);
    });

    it("Layer 7: RakazoFreePolicyEngine enforces fail-closed zero-cost policy and vetoes paid fallbacks", () => {
      const engine = new RakazoFreePolicyEngine();
      const codingRoute = engine.resolveRoute(["coding"]);
      expect(codingRoute.provider).toBe("omniroute");
      expect(codingRoute.model).toBe("combo/rakazo-coding");

      const reasoningRoute = engine.resolveRoute(["coding", "reasoning"]);
      expect(reasoningRoute.provider).toBe("omniroute");
      expect(reasoningRoute.model).toBe("combo/rakazo-reasoning");

      expect(() => engine.vetoPaidFallback("openai/gpt-4o")).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
      expect(() => engine.assertZeroCostAndAllowed("openrouter", 0.002)).toThrow(
        FREE_INFERENCE_UNAVAILABLE_MESSAGE,
      );
    });
  });

  // ==========================================================================
  // 2. SOVEREIGN SANCTUARY: 18 MCP CONNECTORS, 87 TOOLS, ZERO STRIPE, POSTIZ
  // ==========================================================================
  describe("2. Sovereign MCP Catalog & Postiz JSON-RPC 2.0 Sanctuary", () => {
    it("maintains exactly 18 sovereign MCP connectors and 87 catalog tools (73 enterprise + 14 catalog system tools) with zero Stripe presence", () => {
      expect(SOVEREIGN_MCP_CONNECTORS).toHaveLength(18);
      const allTools = getAllSovereignTools();
      expect(allTools).toHaveLength(87);
      expect(enterpriseAgentTools).toHaveLength(73);
      expect(builtinAgentTools).toHaveLength(90);

      const stripePresent = SOVEREIGN_MCP_CONNECTORS.some(
        (c) => c.id.toLowerCase().includes("stripe") || c.name.toLowerCase().includes("stripe"),
      );
      expect(stripePresent).toBe(false);
    });

    it("routes Postiz tools through native JSON-RPC 2.0 MCP (/api/mcp/:apiKey) and public v1 API", async () => {
      vi.stubEnv("POSTIZ_API_URL", "https://postiz.workspacegroupefloteuil.eu");
      vi.stubEnv("POSTIZ_API_KEY", "test-postiz-mcp-key");

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/mcp/test-postiz-mcp-key")) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: {
                structuredContent: {
                  output: [
                    {
                      id: "ch-1",
                      name: "Groupe Floteuil",
                      identifier: "linkedin",
                      platform: "linkedin",
                    },
                  ],
                },
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", "mcp-session-id": "sess-1" },
            },
          );
        }
        return new Response(JSON.stringify({ posts: [] }), { status: 200 });
      });

      const res = (await executeEnterpriseTool("postiz_list_integrations", {})) as {
        integrations?: Array<{ id: string; name: string }>;
      };
      expect(Array.isArray(res.integrations)).toBe(true);
      expect(res.integrations).toHaveLength(1);
      expect(res.integrations?.[0]?.name).toBe("Groupe Floteuil");
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://postiz.workspacegroupefloteuil.eu/api/mcp/test-postiz-mcp-key",
        expect.objectContaining({ method: "POST" }),
      );
      fetchSpy.mockRestore();
    });

    it("sanitizes OpenRouter gpt-oss-120b reasoning payloads and compiles deterministic prompts", () => {
      const rawContent =
        "<thought>Internal chain of thought that must be stripped</thought>\n### Rôle\nExpert DevOps.";
      const sanitized = extractThoughtTrace(rawContent);
      expect(sanitized.cleanContent).toContain("### Rôle");
      expect(sanitized.cleanContent).not.toContain("Internal chain of thought");
      expect(sanitized.thoughtTrace).toContain("Internal chain of thought");

      const compiled = compilePromptLevel1Deterministic({
        rawInstruction: "Tu es un expert SEO pour HubToWork.",
      });
      expect(compiled.compiledInstruction).toContain("# Role & Identity");
    });
  });

  // ==========================================================================
  // 3. UPSTREAM v0.8.0+ SURGICALLY PORTED ENHANCEMENTS
  // ==========================================================================
  describe("3. Upstream v0.8.0+ Surgically Ported Enhancements", () => {
    it("3.1 (4d5b1a5b9) preserves multiline keep-chomp (|+) skill metadata when saving and round-tripping", () => {
      for (const trailing of [2, 3]) {
        const notes = `First step\n\n  Nested step\nLast step${"\n".repeat(trailing)}`;
        const block = formatYamlBlockScalar("notes", notes);
        expect(block).toContain("notes: |+");

        const md = buildSkillMarkdown({
          name: "Release notes",
          description: "Prepare weekly release notes",
          metadata: { notes },
          content: "Write the weekly notes.",
        });
        const parsed = parseSkillMarkdown(md);
        expect(parsed.name).toBe("Release notes");
        expect(parsed.description).toBe("Prepare weekly release notes");
        expect(parsed.metadata.notes).toBe(notes);
      }
    });

    it("3.2 (aa3866888) honors declared prompt cache retention in context selection", () => {
      expect(
        resolvePromptCacheStrategy({
          hasHistoryRetrievalTools: true,
          cacheCapabilities: { scope: "connection", retentionMs: 300_000 },
        }),
      ).toBe("cache-aware");

      expect(
        resolvePromptCacheStrategy({
          contextStrategy: "retrieval",
          hasHistoryRetrievalTools: true,
          cacheCapabilities: { scope: "connection", retentionMs: 300_000 },
        }),
      ).toBe("retrieval");

      for (const invalid of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(
          resolvePromptCacheStrategy({
            hasHistoryRetrievalTools: true,
            cacheCapabilities: { scope: "connection", retentionMs: invalid },
          }),
        ).toBe("retrieval");
      }

      expect(
        resolvePromptCacheStrategy({
          hasHistoryRetrievalTools: true,
          cacheCapabilities: {
            scope: "connection",
            retentionMs: 300_000,
            retentionMode: "none",
          },
        }),
      ).toBe("retrieval");

      expect(
        resolvePromptCacheStrategy({
          hasHistoryRetrievalTools: false,
          cacheCapabilities: { scope: "connection", retentionMs: 300_000 },
        }),
      ).toBe("standalone");
    });

    it("3.3 (515ac02fa) supports extended model timeouts and disabled stream idle watchdog while preserving cancellation", async () => {
      expect(modelStreamTimeoutMs()).toBe(MODEL_STREAM_TIMEOUT_MS);
      expect(modelConnectTimeoutMs()).toBe(MODEL_CONNECT_TIMEOUT_MS);
      expect(modelStreamIdleTimeoutMs()).toBe(MODEL_STREAM_IDLE_TIMEOUT_MS);

      vi.stubEnv("MODEL_STREAM_TIMEOUT_MS", "13800000");
      expect(modelStreamTimeoutMs()).toBe(13_800_000);

      vi.stubEnv("MODEL_CONNECT_TIMEOUT_MS", "13800000");
      expect(modelConnectTimeoutMs()).toBe(MODEL_CONNECT_TIMEOUT_MS);

      vi.useFakeTimers();
      vi.stubEnv("MODEL_STREAM_IDLE_TIMEOUT_MS", "0");
      expect(modelStreamIdleTimeoutMs()).toBe(0);

      const upstream = new AbortController();
      const watchdog = modelStreamIdleWatchdog(upstream.signal);
      watchdog.ping();

      await vi.advanceTimersByTimeAsync(13_800_000);
      expect(watchdog.signal.aborted).toBe(false);

      const cancelReason = new Error("User clicked Stop");
      upstream.abort(cancelReason);
      expect(watchdog.signal.aborted).toBe(true);
      expect(watchdog.signal.reason).toBe(cancelReason);
      watchdog.dispose();
    });

    it("3.4 (81640fa3e) keeps a bot's public description and private instructions distinct", () => {
      const bot = {
        name: "Ada",
        title: "Inbox lead",
        description: "Reads and sorts mail.",
        instructions: "Never send mail without asking.",
      };
      const prompt = runIdentityInstruction(bot, "user");
      expect(prompt).toContain("Ada: Inbox lead\nReads and sorts mail.");
      expect(prompt).toContain(
        "Teammates see only the profile above. These instructions are private to you:",
      );
      expect(prompt.endsWith("Never send mail without asking.")).toBe(true);

      // Avoid repeating when an older bot saved the same text in both fields
      expect(
        runIdentityInstruction({ ...bot, instructions: "Reads and sorts mail." }, "user"),
      ).toBe("Reads and sorts mail.");

      // Verify spawn_bot tool schema includes both description and instructions
      const spawnTool = builtinAgentTools.find((t) => t.name === "spawn_bot");
      expect(spawnTool).toBeDefined();
      const props = (spawnTool?.inputSchema as { properties?: Record<string, unknown> })
        ?.properties;
      expect(props).toHaveProperty("description");
      expect(props).toHaveProperty("instructions");
    });

    it("3.5 (7d9cef3c6) marks vision vs text-only models in the Pi model catalog", () => {
      const catalog = listPiCatalog();
      expect(catalog.some((entry) => entry.images === true)).toBe(true);
      expect(catalog.some((entry) => entry.images === false)).toBe(true);
    });

    it("3.6 (v0.8.0 Fast Stop) aborts an active CanonicalAgentRuntime run immediately on signal abort", async () => {
      const controller = new AbortController();
      const runtime = new CanonicalAgentRuntime({
        transport: {
          id: "slow-test",
          isFree: true,
          async *stream(req) {
            await new Promise<void>((resolve) => {
              req.signal?.addEventListener("abort", () => resolve(), { once: true });
            });
            yield { type: "text", text: "late" };
          },
        },
      });

      const events: Array<{ type: string; text?: string }> = [];
      const start = Date.now();
      setTimeout(() => controller.abort(), 20);

      for await (const ev of runtime.run(
        {
          botId: "b1",
          threadId: "t1",
          runId: "r-stop",
          prompt: "Long task",
          instructions: "",
          history: [],
          tools: [],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
        },
        {
          operationId: "op-stop",
          traceId: "tr-stop",
          workspaceId: "ws-1",
          userId: "u-1",
          signal: controller.signal,
        },
      )) {
        events.push(ev as { type: string; text?: string });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(500);
      expect(events.at(-1)).toEqual({ type: "done", text: "stopped" });
    });
  });

  // ==========================================================================
  // 4. P2 & P4: CONTRAT OPÉRATIONNEL D'AGENT & GARDE-FOU ROUTINE SILENCIEUSE
  // ==========================================================================
  describe("4. Contrat Opérationnel d'Agent (P2) & Routine Silencieuse NO_SIGNAL (P4)", () => {
    it("4.1 (P2) injects French contractual autonomy matrix (< 1 min undo vs PARK FOR ME), Show-the-tape proof obligation, and anti-prompt-injection boundary in Level 1 and Level 2", async () => {
      const level1 = compilePromptLevel1Deterministic({
        rawInstruction:
          "Tu es l'agent éditorial de Groupe Floteuil. Rédige les brouillons LinkedIn et prépare le calendrier.",
        botName: "Agent Éditorial",
      });

      expect(level1.compiledInstruction).toContain("# Role & Identity");
      expect(level1.compiledInstruction).toContain("## Operational Rules & Constraints");
      expect(level1.compiledInstruction).toContain(CONTRACTUAL_AUTONOMY_RULE_FR);
      expect(level1.compiledInstruction).toContain("ACT ALONE < 1 min vs PARK FOR ME");
      expect(level1.compiledInstruction).toContain(ANTI_PROMPT_INJECTION_RULE_FR);
      expect(level1.compiledInstruction).toContain(SHOW_THE_TAPE_RULE_FR);
      expect(level1.compiledInstruction).toContain(CONTRACTUAL_ESCALATION_RULE_FR);

      let capturedSystemPrompt = "";
      const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
        const parsed = JSON.parse(String(init?.body ?? "{}"));
        capturedSystemPrompt = parsed.messages?.[0]?.content ?? "";
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "# Role & Identity\nAgent Éditorial\n\n## Core Mission\n- Rédiger\n\n## Operational Rules & Constraints\n- ACT ALONE < 1 min vs PARK FOR ME\n\n## Output Format & Deliverables\n- Show the tape\n\n## Error Handling & Edge Cases\n- PARK FOR ME",
                },
              },
            ],
            usage: { prompt_tokens: 180, completion_tokens: 90 },
          }),
          { status: 200 },
        );
      });

      const compiler = createPromptCompilerService({
        apiKey: "sk-or-test-key",
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const level2 = await compiler.compileLevel2({
        rawInstruction:
          "Tu es un agent d'analyse SEO pour Novamira. Vérifie les positions et propose des optimisations de contenu.",
        botName: "SEO Novamira",
      });

      expect(level2.levelUsed).toBe("level2_llm");
      expect(capturedSystemPrompt).toContain(CONTRACTUAL_AUTONOMY_RULE_FR);
      expect(capturedSystemPrompt).toContain(SHOW_THE_TAPE_RULE_FR);
      expect(capturedSystemPrompt).toContain(ANTI_PROMPT_INJECTION_RULE_FR);
    });

    it("4.2 (P4) injects French NO_SIGNAL silent routine directive on routine trigger and detects silent outputs", () => {
      const bot = {
        name: "Sentinelle",
        title: "Veille Infrastructure",
        description: "Surveille les alertes serveurs.",
        instructions: "Vérifie l'état des conteneurs.",
      };

      const userPrompt = runIdentityInstruction(bot, "user");
      expect(userPrompt).not.toContain(SILENT_ROUTINE_TOKEN);

      const routinePrompt = runIdentityInstruction(bot, "routine");
      expect(routinePrompt).toContain(SILENT_ROUTINE_DIRECTIVE_FR);
      expect(routinePrompt).toContain("NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui.");

      expect(isSilentRoutineOutput("NO_SIGNAL")).toBe(true);
      expect(
        isSilentRoutineOutput("NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui."),
      ).toBe(true);
      expect(isSilentRoutineOutput("  NO_SIGNAL: RAS  ")).toBe(true);
      expect(isSilentRoutineOutput("Alerte critique détectée sur le conteneur web.")).toBe(false);
      expect(isSilentRoutineOutput("")).toBe(false);
    });
  });
});
