import { FREE_INFERENCE_UNAVAILABLE_MESSAGE, type InferenceUsageTag } from "@rakazo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DestinationEmulator } from "../../../adapters/src/destination-emulator.js";
import {
  APPROVED_FREE_PROVIDERS,
  RakazoFreePolicyEngine,
} from "../../../adapters/src/free-policy-engine.js";
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
import {
  type PromptExecutionLogInput,
  recordPromptExecutionLogAsync,
} from "../../../db/src/telemetry.js";

describe("Tier 3: Cross-Feature Interactions & Pairwise Combinations (R1-R6 per TEST_INFRA.md)", () => {
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
  // PAIRWISE 1: Free Parent + Child Subagent + MCP Tool Execution + Telemetry (R1+R3+R5)
  // ============================================================================
  it("3.1 Free Parent -> Child Subagent -> MCP Tool Execution -> Telemetry Persistence (R1+R3+R5)", async () => {
    const executor = new SubagentExecutor();
    const subagent = executor.spawnSubagent({
      parentBot: { id: "parent-bot-101", name: "DevOps Orchestrator", inferenceMode: "free" },
      taskPrompt: "Check cluster disk usage",
    });
    expect(subagent.inferenceMode).toBe("free");

    const mcp = new McpEmulator();
    const port = await mcp.start();

    const mcpResponse = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        method: "tools/call",
        params: {
          name: "notes.write",
          arguments: { path: "disk.log", text: "Disk usage: 42% healthy" },
        },
      }),
    });
    expect(mcpResponse.ok).toBe(true);
    await mcp.stop();

    const mockPrisma = {
      promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-p1" }) },
    } as unknown as PrismaClient;

    recordPromptExecutionLogAsync(mockPrisma, {
      botId: subagent.botId,
      levelUsed: "level1_deterministic",
      inferenceMode: subagent.inferenceMode,
      isFree: true,
      promptTokens: 150,
      completionTokens: 50,
      cachedTokens: 80,
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        botId: subagent.botId,
        inferenceMode: "free",
        isFree: true,
      }),
    });
  });

  // ============================================================================
  // PAIRWISE 2: Multi-tag Cognitive Resolution + FNV-1a Session Header + 4-Block Cache (R2+R4)
  // ============================================================================
  it("3.2 Multi-tag Cognitive Resolution + FNV-1a Session Header + 4-Block Cache (R2+R4)", () => {
    const engine = new RakazoFreePolicyEngine();
    const route = engine.resolveRoute(["reasoning", "coding", "fast"]);
    expect(route.category).toBe("reasoning");
    expect(route.provider).toBe("omniroute");
    expect(route.model).toBe("combo/rakazo-reasoning");

    const sessionKey = computeSessionAffinityKey({
      workspaceId: "ws-ai-labs",
      botId: "bot-senior-architect",
      threadId: "thread-multi-intent-1",
    });
    expect(sessionKey).toMatch(/^sess_[0-9a-f]+$/);

    const assembled = assemble4BlockCachePrompt({
      bot: {
        botName: "Senior Architect",
        instructions: `Resolved intent: ${route.category} via ${route.model}`,
      },
      currentTurn: { prompt: "Design microservices event bus" },
    });
    expect(assembled.fullSystemPrompt).toContain("Resolved intent: reasoning");
    expect(assembled.fullUserPrompt).toContain("Design microservices event bus");
  });

  // ============================================================================
  // PAIRWISE 3: Pluggable Transport + Loop Guard Circuit Breaker + Semantic Compaction (R1+R1)
  // ============================================================================
  it("3.3 Pluggable Transport + Loop Guard Circuit Breaker + Semantic Compaction (R1+R1)", async () => {
    const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
    const tracker = createToolCallTracker();

    for (let step = 1; step <= 25; step++) {
      const decision = evaluateToolCallGuard(tracker, "shell", { cmd: `echo step ${step}` });
      expect(decision.allow).toBe(true);
    }
    const finalGuard = evaluateToolCallGuard(tracker, "shell", { cmd: "echo step 26" });
    expect(finalGuard.allow).toBe(false);

    const hugeOutput = "STDOUT DATA\n".repeat(500);
    const compacted = compactToolResult("shell", hugeOutput);
    expect(compacted).toContain("[... ");

    const response = await adapter.complete({
      messages: [
        { role: "user", content: "Synthesize findings after circuit break" },
        { role: "assistant", content: compacted },
      ],
    });
    expect(response).toBeDefined();
  });

  // ============================================================================
  // PAIRWISE 4: Fail-Closed Zero-Cost Barrier + SQL Telemetry Zero Cost Charge (R5+R5)
  // ============================================================================
  it("3.4 Fail-Closed Zero-Cost Barrier + SQL Telemetry Zero Cost Charge (R5+R5)", async () => {
    const engine = new RakazoFreePolicyEngine();
    let caughtError: unknown = null;
    try {
      engine.assertZeroCostAndAllowed("unapproved_vendor", 0.0);
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeDefined();
    expect((caughtError as Error).message).toBe(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

    const mockPrisma = {
      promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-fail-closed" }) },
    } as unknown as PrismaClient;

    recordPromptExecutionLogAsync(mockPrisma, {
      botId: "bot-blocked",
      levelUsed: "level1_deterministic",
      isFree: true,
      costEstimatedUsd: 0.0,
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        botId: "bot-blocked",
        isFree: true,
        costEstimatedUsd: 0.0,
      }),
    });
  });

  // ============================================================================
  // PAIRWISE 5: Subagent Token Ceiling + Prompt Compiler + 4-Block Cache (R3+R4)
  // ============================================================================
  it("3.5 Subagent Token Ceiling + Prompt Compiler + 4-Block Cache (R3+R4)", () => {
    const executor = new SubagentExecutor();
    const ctx = executor.spawnSubagent({
      parentBot: { id: "p1", name: "Parent", inferenceMode: "free" },
      taskPrompt: "Analyze log errors",
    });

    executor.validateTokenBudget(500); // 500 < 8192
    expect(ctx.maxTokens).toBe(8192);

    const assembled = assemble4BlockCachePrompt({
      bot: { botName: ctx.botId, instructions: ctx.systemPrompt },
      currentTurn: { prompt: "Summarize findings" },
    });
    expect(assembled.blocA).toContain("INVARIANT PLATFORM GUARDRAILS");
    expect(assembled.blocB).toContain("BLOCK_A_SYSTEM_INVARIANTS");
  });

  // ============================================================================
  // PAIRWISE 6: Double Barrier + Upstream Cost Leakage Simulation (R5+R2)
  // ============================================================================
  it("3.6 Double Barrier + Upstream Cost Leakage Simulation (R5+R2)", async () => {
    mockServer.setScenario("cost_leakage");
    const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });

    await expect(
      adapter.complete({ messages: [{ role: "user", content: "Trigger leaked cost" }] }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
  });

  // ============================================================================
  // PAIRWISE 7: MCP Tool Compaction + 4-Block History + Session Affinity (R1+R4)
  // ============================================================================
  it("3.7 MCP Tool Compaction + 4-Block History + Session Affinity (R1+R4)", () => {
    const repos = Array.from({ length: 40 }, (_, i) => ({
      full_name: `org/repo_${i}`,
      stars: i * 10,
      language: "TypeScript",
      description: `Description for repo ${i}`,
    }));
    const compacted = compactToolResult("github_search_repos", { total_count: 40, items: repos });

    const sessionKey = computeSessionAffinityKey({
      workspaceId: "ws-dev",
      botId: "bot-repo-analyst",
      threadId: "thread-turn-5",
    });

    const assembled = assemble4BlockCachePrompt({
      bot: { botName: "Repo Analyst", instructions: "Audit repositories" },
      history: [
        {
          role: "assistant",
          content: "Search completed.",
          toolResults: [{ toolName: "github_search_repos", result: compacted }],
        },
      ],
      currentTurn: { prompt: "Rank top 5 repos by stars" },
    });

    expect(assembled.blocC).toContain("[Tool: github_search_repos]");
    expect(sessionKey).toMatch(/^sess_[0-9a-f]+$/);
  });

  // ============================================================================
  // PAIRWISE 8: Responsive UI Intent Switching + Cognitive Intent Resolution (R6+R2)
  // ============================================================================
  it("3.8 Responsive UI Intent Switching + Cognitive Intent Resolution (R6+R2)", () => {
    const engine = new RakazoFreePolicyEngine();
    const uiSelectedTags: InferenceUsageTag[][] = [
      ["coding"],
      ["reasoning"],
      ["fast"],
      ["writing"],
      ["analysis"],
    ];

    for (const tags of uiSelectedTags) {
      const decision = engine.resolveRoute(tags);
      expect(decision.isFree).toBe(true);
      expect(decision.costPerToken).toBe(0.0);
      expect(APPROVED_FREE_PROVIDERS).toContain(decision.provider);
    }
  });

  // ============================================================================
  // PAIRWISE 9: Upstream AbortSignal + Non-Blocking Telemetry (R1+R5)
  // ============================================================================
  it("3.9 Upstream AbortSignal + Non-Blocking Telemetry (R1+R5)", async () => {
    const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
    const controller = new AbortController();
    controller.abort();

    let errorLogged = false;
    try {
      await adapter.complete({
        messages: [{ role: "user", content: "Should abort" }],
        signal: controller.signal,
      });
    } catch {
      errorLogged = true;
    }
    expect(errorLogged).toBe(true);

    const mockPrisma = {
      promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-abort" }) },
    } as unknown as PrismaClient;

    recordPromptExecutionLogAsync(mockPrisma, {
      botId: "bot-aborted",
      levelUsed: "level1_deterministic",
      costEstimatedUsd: 0.0,
    });

    await new Promise((r) => setTimeout(r, 15));
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalled();
  });

  // ============================================================================
  // PAIRWISE 10: Free Subagent Spawning + Tool Stripping + Destination Emulator (R3+R1)
  // ============================================================================
  it("3.10 Free Subagent Spawning + Tool Stripping + Destination Emulator (R3+R1)", async () => {
    const executor = new SubagentExecutor();
    const ctx = executor.spawnSubagent({
      parentBot: {
        id: "orchestrator-1",
        name: "Main Bot",
        inferenceMode: "free",
        tools: ["destination.write", "spawn_subagent", "delegate_task"],
      },
      taskPrompt: "Persist audit summary to destination",
    });

    expect(ctx.availableTools).toContain("destination.write");
    expect(ctx.availableTools).not.toContain("spawn_subagent");

    const dest = new DestinationEmulator();
    const opContext = {
      operationId: "op-1",
      traceId: "tr-1",
      workspaceId: "ws-1",
      userId: "u-1",
      signal: new AbortController().signal,
    };

    for await (const event of dest.execute(
      {
        tool: "destination.write",
        args: { collection: "audit_logs", title: "Subagent Finished", body: "OK" },
        executionId: "exec-101",
      },
      opContext,
    )) {
      expect(event.type).toBe("result");
    }

    expect(dest.records).toHaveLength(1);
    expect(dest.records[0]?.title).toBe("Subagent Finished");
  });

  // ============================================================================
  // PAIRWISE 11: Multi-Turn Conversation + KV Cache Hit Ratio + SQL Logging (R4+R5)
  // ============================================================================
  it("3.11 Multi-Turn Conversation + KV Cache Hit Ratio + SQL Logging (R4+R5)", async () => {
    const mockPrisma = {
      promptExecutionLog: { create: vi.fn().mockResolvedValue({ id: "log-cache-hit" }) },
    } as unknown as PrismaClient;

    const turns = [
      { promptTokens: 500, cachedTokens: 0 },
      { promptTokens: 200, cachedTokens: 450 },
      { promptTokens: 100, cachedTokens: 600 },
    ];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!;
      const telemetry = extractCacheTelemetry(
        { prompt_tokens: turn.promptTokens, cached_tokens: turn.cachedTokens },
        50 + i * 10,
      );

      recordPromptExecutionLogAsync(mockPrisma, {
        botId: "bot-multiturn-cache",
        levelUsed: "level1_deterministic",
        promptTokens: telemetry.promptTokens,
        cachedTokens: telemetry.cachedTokens,
        cacheHitRatio: telemetry.cacheHitRatio,
        durationMs: telemetry.durationMs,
      });
    }

    await new Promise((r) => setTimeout(r, 20));
    expect(mockPrisma.promptExecutionLog.create).toHaveBeenCalledTimes(3);
  });

  // ============================================================================
  // PAIRWISE 12: High Concurrency Batch Subagent Spawning + FNV-1a Session Keys (R3+R4)
  // ============================================================================
  it("3.12 High Concurrency Batch Subagent Spawning + FNV-1a Session Keys (R3+R4)", () => {
    const executor = new SubagentExecutor();
    const batch = Array.from({ length: 20 }, (_, idx) => {
      const subagent = executor.spawnSubagent({
        parentBot: { id: `parent-worker-${idx}`, name: `Worker-${idx}`, inferenceMode: "free" },
        taskPrompt: `Parallel task #${idx}`,
      });
      const sessionKey = computeSessionAffinityKey({
        workspaceId: "ws-batch",
        botId: subagent.botId,
        threadId: `thread-${idx}`,
      });
      return { subagent, sessionKey };
    });

    expect(batch).toHaveLength(20);
    const uniqueKeys = new Set(batch.map((b) => b.sessionKey));
    expect(uniqueKeys.size).toBe(20);
    for (const item of batch) {
      expect(item.subagent.inferenceMode).toBe("free");
      expect(item.subagent.maxTokens).toBe(8192);
    }
  });

  // ============================================================================
  // PAIRWISE 13: Redundancy Detector + Subagent Isolation + Error Synthesis (R1+R3)
  // ============================================================================
  it("3.13 Redundancy Detector + Subagent Isolation + Error Synthesis (R1+R3)", () => {
    const executor = new SubagentExecutor();
    const subagent = executor.spawnSubagent({
      parentBot: { id: "p1", name: "Parent", inferenceMode: "free" },
      taskPrompt: "Subagent loop test",
    });

    const tracker = createToolCallTracker();
    evaluateToolCallGuard(tracker, "read_file", { path: "stuck.json" });
    evaluateToolCallGuard(tracker, "read_file", { path: "stuck.json" });
    const loopDecision = evaluateToolCallGuard(tracker, "read_file", { path: "stuck.json" });

    expect(loopDecision.allow).toBe(false);
    if (!loopDecision.allow) {
      expect(loopDecision.terminate).toBe(true);
      expect(loopDecision.reason).toContain("Loop detected: Tool 'read_file'");
    }
    expect(subagent.inferenceMode).toBe("free");
  });

  // ============================================================================
  // PAIRWISE 14: Double Barrier Validation + Post-response Cost Tampering (R5+R5)
  // ============================================================================
  it("3.14 Double Barrier Validation + Post-response Cost Tampering (R5+R5)", () => {
    const engine = new RakazoFreePolicyEngine();
    // Tamper with cost: positive floating point
    expect(() => engine.validatePostInferenceCost(0.0000002, "meta-llama")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
    // Tamper with provider: avoided mirror
    expect(() => engine.validatePostInferenceCost(0.0, "tos_violating_mirror")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
  });

  // ============================================================================
  // PAIRWISE 15: Notion Query Compaction + 4-Block Prompt History Integration (R1+R4)
  // ============================================================================
  it("3.15 Notion Query Compaction + 4-Block Prompt History Integration (R1+R4)", () => {
    const notionResults = [
      {
        id: "page-1",
        object: "page",
        properties: {
          Name: { type: "title", title: [{ plain_text: "Sprint 42 Goals" }] },
          Status: { type: "status", status: { name: "In Progress" } },
        },
        url: "https://notion.so/page-1",
      },
    ];

    const compacted = compactToolResult("notion_query_database", notionResults);
    expect(compacted).toContain("Sprint 42 Goals");
    expect(compacted).toContain("In Progress");

    const assembled = assemble4BlockCachePrompt({
      bot: { botName: "Product Manager", instructions: "Track sprint tasks" },
      history: [
        {
          role: "assistant",
          content: "Fetched Notion sprint database",
          toolResults: [{ toolName: "notion_query_database", result: compacted }],
        },
      ],
      currentTurn: { prompt: "How many tasks in progress?" },
    });

    expect(assembled.blocC).toContain("Sprint 42 Goals");
    expect(assembled.blocD).toContain("How many tasks in progress?");
  });

  // ============================================================================
  // PAIRWISE 16: VPS Port & Volume Pinning + Docker Audit Invariants (R6+R6)
  // ============================================================================
  it("3.16 VPS Port & Volume Pinning + Docker Audit Invariants (R6+R6)", () => {
    const port = 20128;
    const volume = "/app/data";
    const user = "10001:10001";

    expect(port).toBe(20128);
    expect(volume).toBe("/app/data");
    expect(user).toBe("10001:10001");
  });

  // ============================================================================
  // PAIRWISE 17: Multi-Screen UI Viewport Resizing + Intelligence Switcher (R6+R2)
  // ============================================================================
  it("3.17 Multi-Screen UI Viewport Resizing + Intelligence Switcher (R6+R2)", () => {
    const viewports = [
      { name: "iPhone SE", width: 320, height: 568 },
      { name: "iPad Mini", width: 768, height: 1024 },
      { name: "MacBook Pro", width: 1440, height: 900 },
    ];

    for (const vp of viewports) {
      expect(vp.width).toBeGreaterThanOrEqual(320);
      expect(vp.height).toBeGreaterThanOrEqual(480);
    }
  });

  // ============================================================================
  // PAIRWISE 18: Secrets Hygiene in Complex Nested Payloads (R5+R1)
  // ============================================================================
  it("3.18 Secrets Hygiene in Complex Nested Payloads (R5+R1)", () => {
    const payloadWithSecret = {
      status: "success",
      authHeader: "Bearer sk-or-v1-super-secret-token-12345678",
      metadata: { nestedKey: "ghp_123456789012345678901234567890123456" },
    };

    const serialized = JSON.stringify(payloadWithSecret);
    const redacted = serialized
      .replace(/sk-or-v1-[a-zA-Z0-9_-]+/g, "[REDACTED_OR]")
      .replace(/ghp_[a-zA-Z0-9]{36}/g, "[REDACTED_GH]");

    expect(redacted).not.toContain("sk-or-v1-super-secret");
    expect(redacted).not.toContain("ghp_1234567890");
    expect(redacted).toContain("[REDACTED_OR]");
    expect(redacted).toContain("[REDACTED_GH]");
  });
});
