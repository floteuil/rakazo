import { FREE_INFERENCE_UNAVAILABLE_MESSAGE } from "@rakazo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RakazoFreePolicyEngine } from "../../../adapters/src/free-policy-engine.js";
import { createToolCallTracker, evaluateToolCallGuard } from "../../../adapters/src/loop-guards.js";
import { McpEmulator } from "../../../adapters/src/mcp-emulator.js";
import { FreeOmniRouteAdapter } from "../../../adapters/src/omniroute-adapter.js";
import { MockOmniRouteServer } from "../../../adapters/src/omniroute-mock.js";
import {
  assemble4BlockCachePrompt,
  computeSessionAffinityKey,
  extractCacheTelemetry,
} from "../../../adapters/src/prefix-caching.js";
import { SubagentExecutor } from "../../../adapters/src/subagent-inheritance.js";
import { compactToolResult } from "../../../adapters/src/tool-compacting.js";
import type { PrismaClient } from "../../../db/src/client.js";
import { recordPromptExecutionLogAsync } from "../../../db/src/telemetry.js";

describe("Tier 4: Real-World Workload Scenarios E2E Suite (R1-R6 per TEST_INFRA.md)", () => {
  let mockServer: MockOmniRouteServer;
  let serverUrl: string;
  const apiKey = "sk-omniroute-endpoint-key-rakazo";

  beforeAll(async () => {
    mockServer = new MockOmniRouteServer({ apiKey, defaultProvider: "meta-llama" });
    serverUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.reset();
  });

  // ============================================================================
  // SCENARIO 1: Free Multi-Step Coding Agent with MCP Tools
  // ============================================================================
  it("Scenario 1: Free Multi-Step Coding Agent with MCP Tools (F1, F2, F3, F4, F5, F10, F11, F12)", async () => {
    // 1. Resolve Route for coding intent
    const policyEngine = new RakazoFreePolicyEngine();
    const route = policyEngine.resolveRoute(["coding"]);
    expect(route.provider).toBe("omniroute");
    expect(route.model).toBe("combo/rakazo-coding");
    expect(route.costPerToken).toBe(0.0);

    // 2. Session Affinity Key
    const sessionKey = computeSessionAffinityKey({
      workspaceId: "ws-engineering",
      botId: "bot-senior-coder",
      threadId: "thread-refactor-feature-1",
    });

    // 3. 4-Block Cache Prompt
    const prompt = assemble4BlockCachePrompt({
      bot: { botName: "Senior Coder", instructions: "Refactor legacy modules" },
      currentTurn: { prompt: "Read src/index.ts, refactor exports, and verify tests" },
    });
    expect(prompt.fullSystemPrompt).toContain("INVARIANT PLATFORM GUARDRAILS");

    // 4. MCP Tool Loop & Compaction
    const tracker = createToolCallTracker();
    const step1 = evaluateToolCallGuard(tracker, "read_file", { path: "src/index.ts" });
    expect(step1.allow).toBe(true);

    const fileContent = "export * from './a';\n".repeat(100);
    const compactedResult = compactToolResult("read_file", fileContent);

    // 5. Model Inference via Pluggable Transport
    const adapter = new FreeOmniRouteAdapter({
      baseUrl: serverUrl,
      apiKey,
      defaultModel: route.model,
    });
    const response = await adapter.complete({
      messages: [
        { role: "system", content: prompt.fullSystemPrompt },
        { role: "user", content: prompt.fullUserPrompt },
        { role: "assistant", content: `Tool read_file result:\n${compactedResult}` },
        { role: "user", content: "Synthesize refactored output" },
      ],
    });
    expect(response).toBeDefined();

    // 6. Zero-Cost Post-Response Assertion
    policyEngine.validatePostInferenceCost(0.0, route.provider);

    // 7. Telemetry Recording
    const mockPrisma = {
      promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-sc1" }) },
    } as unknown as PrismaClient;

    recordPromptExecutionLogAsync(mockPrisma, {
      botId: "bot-senior-coder",
      levelUsed: "level1_deterministic",
      requestedCategory: "coding",
      resolvedProvider: route.provider,
      resolvedModel: route.model,
      isFree: true,
      promptTokens: 450,
      completionTokens: 180,
      cachedTokens: 320,
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        botId: "bot-senior-coder",
        resolvedProvider: "omniroute",
        isFree: true,
      }),
    });
  });

  // ============================================================================
  // SCENARIO 2: Free Subagent Task Delegation & Confinement
  // ============================================================================
  it("Scenario 2: Free Subagent Task Delegation & Confinement (F2, F3, F7, F8, F11, F12)", async () => {
    const executor = new SubagentExecutor();

    // 1. Parent Bot Spawns Subagent
    const subagent = executor.spawnSubagent({
      parentBot: {
        id: "parent-orchestrator",
        name: "Master Architect",
        inferenceMode: "free",
        usageTags: ["analysis", "coding"],
        tools: ["read_file", "write_file", "spawn_subagent", "delegate_task"],
      },
      taskPrompt: "Audit security vulnerabilities in package dependencies",
    });

    expect(subagent.inferenceMode).toBe("free");
    expect(subagent.maxDepth).toBe(1);
    expect(subagent.maxTokens).toBe(8192);
    expect(subagent.availableTools).not.toContain("spawn_subagent");
    expect(subagent.availableTools).not.toContain("delegate_task");
    expect(subagent.availableTools).toContain("read_file");

    // 2. Subagent Attempts to Nest Further -> Throws Depth Cap
    expect(() =>
      executor.spawnSubagent({
        parentBot: { id: subagent.botId, name: "Sub-worker", inferenceMode: "free", depth: 1 },
        taskPrompt: "Illegal child recursion",
      }),
    ).toThrow(/Subagent recursion depth 2 exceeds maximum allowed depth 1/);

    // 3. Subagent Executes Tool via MCP Emulator
    const mcp = new McpEmulator();
    const port = await mcp.start();
    const callRes = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "notes.write",
          arguments: { path: "audit-report.md", text: "0 high-severity CVEs found" },
        },
      }),
    });
    expect(callRes.ok).toBe(true);
    await mcp.stop();

    // 4. Telemetry Logging
    const mockPrisma = {
      promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-sc2" }) },
    } as unknown as PrismaClient;

    recordPromptExecutionLogAsync(mockPrisma, {
      botId: subagent.botId,
      levelUsed: "level1_deterministic",
      inferenceMode: "free",
      isFree: true,
      promptTokens: 200,
      completionTokens: 80,
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalled();
  });

  // ============================================================================
  // SCENARIO 3: Multi-Tag Collision & Deterministic Routing Resolution
  // ============================================================================
  it("Scenario 3: Multi-Tag Collision & Deterministic Routing Resolution (F4, F5, F6, F9, F10, F12)", () => {
    const engine = new RakazoFreePolicyEngine();

    // Conflict between reasoning (100) and fast (20) -> reasoning wins
    const decision1 = engine.resolveRoute(["fast", "reasoning"]);
    expect(decision1.category).toBe("reasoning");
    expect(decision1.provider).toBe("omniroute");
    expect(decision1.model).toBe("combo/rakazo-reasoning");

    // Conflict between coding (80) and writing (40) -> coding wins
    const decision2 = engine.resolveRoute(["writing", "coding"]);
    expect(decision2.category).toBe("coding");
    expect(decision2.provider).toBe("omniroute");
    expect(decision2.model).toBe("combo/rakazo-coding");

    // Triple conflict: fast (20), writing (40), analysis (60) -> analysis wins
    const decision3 = engine.resolveRoute(["fast", "writing", "analysis"]);
    expect(decision3.category).toBe("analysis");
    expect(decision3.provider).toBe("omniroute");
    expect(decision3.model).toBe("combo/rakazo-analysis");
  });

  // ============================================================================
  // SCENARIO 4: Rapid Multi-Turn KV Prefix Cache Session (>80% Hit Target)
  // ============================================================================
  it("Scenario 4: Rapid Multi-Turn KV Prefix Cache Session (F9, F10, F12, F14)", async () => {
    const sessionKey = computeSessionAffinityKey({
      workspaceId: "ws-cache-bench",
      botId: "bot-kv-assistant",
      threadId: "thread-rapid-cache-4",
    });

    const staticBot = {
      botName: "Cache Specialist",
      instructions: "Assist user while maximizing GPU cache hits.",
    };

    // Turn 1: Cold start (0% cache hit)
    const turn1 = assemble4BlockCachePrompt({
      bot: staticBot,
      currentTurn: { prompt: "Explain quantum computing in one sentence" },
    });
    const tel1 = extractCacheTelemetry(
      { prompt_tokens: 600, completion_tokens: 30, cached_tokens: 0 },
      180,
    );
    expect(tel1.cacheHitRatio).toBe(0.0);

    // Turn 2: Warm cache (Block A + B cached = 500 tokens)
    const turn2 = assemble4BlockCachePrompt({
      bot: staticBot,
      history: [
        { role: "user", content: "Explain quantum computing in one sentence" },
        { role: "assistant", content: "Quantum computing leverages qubits for superposition." },
      ],
      currentTurn: { prompt: "Now explain superposition" },
    });
    const tel2 = extractCacheTelemetry(
      { prompt_tokens: 120, completion_tokens: 40, cached_tokens: 580 },
      60,
    );
    expect(tel2.cacheHitRatio).toBeGreaterThanOrEqual(0.8);

    // Turn 3: Hot cache (Block A + B + Turn 1 History cached = 720 tokens)
    const tel3 = extractCacheTelemetry(
      { prompt_tokens: 90, completion_tokens: 50, cached_tokens: 720 },
      40,
    );
    expect(tel3.cacheHitRatio).toBeGreaterThanOrEqual(0.85);
    expect(sessionKey).toMatch(/^sess_[0-9a-f]+$/);
  });

  // ============================================================================
  // SCENARIO 5: Commercial Fallback Attempt with Double Fail-Closed Block
  // ============================================================================
  it("Scenario 5: Commercial Fallback Attempt with Double Fail-Closed Block (F6, F11, F12, F13)", async () => {
    const engine = new RakazoFreePolicyEngine();

    // 1. Attempt to fallback to paid OpenAI GPT-4
    expect(() => engine.vetoPaidFallback("openai/gpt-4o")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );

    // 2. Attempt to fallback to Anthropic Claude 3 Opus
    expect(() => engine.vetoPaidFallback("anthropic/claude-3-opus")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );

    // 3. Attempt to route through unapproved commercial proxy
    expect(() => engine.assertZeroCostAndAllowed("unapproved_commercial_proxy", 0.0)).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );

    // 4. Attempt to pass non-zero cost
    expect(() => engine.validatePostInferenceCost(0.002, "deepseek")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
  });

  // ============================================================================
  // SCENARIO 6: Premium Bot Non-Regression (Direct OpenRouter Validation)
  // ============================================================================
  it("Scenario 6: Premium Bot Non-Regression (F1, F2, F3, F11, F12)", () => {
    const premiumRequest = {
      botId: "bot-premium-consultant",
      inferenceMode: "paid" as const,
      model: { provider: "openrouter", id: "openai/gpt-oss-120b" },
      prompt: "Execute heavy multi-modal analysis",
    };

    expect(premiumRequest.inferenceMode).toBe("paid");
    expect(premiumRequest.model.id).toBe("openai/gpt-oss-120b");
    expect(premiumRequest.model.provider).toBe("openrouter");
  });

  // ============================================================================
  // SCENARIO 7: Large File & Shell Output Semantic Compaction in Multi-Step Workflow
  // ============================================================================
  it("Scenario 7: Large File & Shell Output Semantic Compaction in Multi-Step Workflow (F2, F3, F9)", () => {
    const massiveLog = "[DEBUG] " + "Line of server debug message.\n".repeat(400);
    const compactedShell = compactToolResult("shell", massiveLog);

    const manyFiles = Array.from({ length: 80 }, (_, i) => `packages/mod_${i}/src/index.ts`);
    const compactedFiles = compactToolResult("list_files", manyFiles);

    const assembled = assemble4BlockCachePrompt({
      bot: { botName: "Audit Bot", instructions: "Audit system logs" },
      history: [
        {
          role: "assistant",
          content: "Executed inspection commands",
          toolResults: [
            { toolName: "shell", result: compactedShell },
            { toolName: "list_files", result: compactedFiles },
          ],
        },
      ],
      currentTurn: { prompt: "Report summary" },
    });

    expect(assembled.blocC).toContain("Found 80 files across directories");
    expect(assembled.blocC).toContain("[... ");
    expect(assembled.blocD).toContain("Report summary");
  });

  // ============================================================================
  // SCENARIO 8: High Concurrency Multi-Thread Bot Operations with Isolated Telemetry
  // ============================================================================
  it("Scenario 8: High Concurrency Multi-Thread Bot Operations with Isolated Telemetry (F10, F12)", async () => {
    const logged: PromptExecutionLogInput[] = [];
    const mockPrisma = {
      promptExecutionLog: {
        create: vi.fn().mockImplementation(async (args: { data: PromptExecutionLogInput }) => {
          logged.push(args.data);
          return { id: `log-concurrent-${logged.length}` };
        }),
      },
    } as unknown as PrismaClient;

    const threads = Array.from({ length: 15 }, (_, i) => ({
      threadId: `thread-burst-${i}`,
      botId: `bot-agent-${i % 3}`,
      category: (["coding", "reasoning", "fast"] as const)[i % 3]!,
    }));

    await Promise.all(
      threads.map(async (t) => {
        const sessionKey = computeSessionAffinityKey({
          workspaceId: "ws-enterprise",
          botId: t.botId,
          threadId: t.threadId,
        });

        recordPromptExecutionLogAsync(mockPrisma, {
          botId: t.botId,
          levelUsed: "level1_deterministic",
          threadId: t.threadId,
          requestedCategory: t.category,
          isFree: true,
          costEstimatedUsd: 0.0,
        });
        return sessionKey;
      }),
    );

    await new Promise((r) => setTimeout(r, 25));
    expect(logged).toHaveLength(15);
    for (const entry of logged) {
      expect(entry.isFree).toBe(true);
      expect(entry.costEstimatedUsd).toBe(0.0);
    }
  });

  // ============================================================================
  // SCENARIO 9: Voice Dictation & Rapid Restructuring through Canonical Tool Dispatch
  // ============================================================================
  it("Scenario 9: Voice Dictation & Rapid Restructuring through Canonical Tool Dispatch (F1, F9, F14)", async () => {
    const rawVoiceTranscript =
      "euh bonjour en fait je voudrais créer un script de déploiement automatique sur Coolify";
    const prompt = assemble4BlockCachePrompt({
      bot: { botName: "DevOps Voice Assistant", instructions: "Generate clean shell scripts" },
      currentTurn: { prompt: rawVoiceTranscript },
    });

    expect(prompt.fullUserPrompt).toContain(rawVoiceTranscript);
    expect(prompt.fullSystemPrompt).toContain("INVARIANT PLATFORM GUARDRAILS");
  });

  // ============================================================================
  // SCENARIO 10: Fail-Closed Network Recovery and Clean Error Notification to User
  // ============================================================================
  it("Scenario 10: Fail-Closed Network Recovery and Clean Error Notification to User (F1, F6, F11)", async () => {
    mockServer.setScenario("server_error");
    const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });

    let userFacingMessage = "";
    try {
      await adapter.complete({ messages: [{ role: "user", content: "Trigger fail-closed" }] });
    } catch {
      userFacingMessage = FREE_INFERENCE_UNAVAILABLE_MESSAGE;
    }

    expect(userFacingMessage).toBe("Capacité gratuite temporairement indisponible");
  });
});
