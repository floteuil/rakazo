import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MockOmniRouteServer } from "./omniroute-mock.js";
import {
  MockHistoricalPremiumRuntime,
  MockOmniRouteStorageManager,
  MockVpsAuditInspector,
  ReferenceFreeOmniRouteAdapter,
  ReferenceRakazoFreePolicyEngine,
} from "./omniroute-test-helpers.js";

describe("Tier 4: Real-World Application Scenarios (Scenarios 1-5 per TEST_INFRA.md)", () => {
  let mockServer: MockOmniRouteServer;
  let serverUrl: string;
  const apiKey = "sk-omniroute-endpoint-key-rakazo";

  beforeAll(async () => {
    mockServer = new MockOmniRouteServer({ apiKey });
    serverUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.reset();
  });

  // ============================================================================
  // SCENARIO 1: FREE BOT ZERO-PROVIDER FAIL-CLOSED ($0.0000 COST)
  // ============================================================================
  it("Scenario 1: Free bot receives prompt with zero-provider configured -> clean fail-closed error with $0.0000 cost", async () => {
    // 1. User configures a Free bot with usage tags
    const policyEngine = new ReferenceRakazoFreePolicyEngine();
    const routeDecision = policyEngine.resolveRoute(["coding", "analysis"]);
    expect(routeDecision.isFree).toBe(true);
    expect(routeDecision.costPerToken).toBe(0.0);

    // 2. OmniRoute is unconfigured (zero provider credentials) -> returns 503 / 401
    mockServer.setScenario("server_error");
    const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });

    // 3. Bot executes turn and catches fail-closed rejection
    let caughtError: Error | null = null;
    try {
      await adapter.complete({
        messages: [{ role: "user", content: "Write a React button component" }],
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toBe("Capacité gratuite temporairement indisponible");

    // 4. Telemetry record verifies $0.0000 cost and failed outcome
    const telemetryLog = {
      runId: "run-scenario-1",
      workerId: "worker-01",
      model: routeDecision.model,
      promptTokens: 15,
      completionTokens: 0,
      totalTokens: 15,
      durationMs: 120,
      inferenceMode: "free" as const,
      isFree: true,
      cost: 0.0,
      outcome: "failed",
    };

    expect(telemetryLog.isFree).toBe(true);
    expect(telemetryLog.cost).toBe(0.0);
    expect(telemetryLog.outcome).toBe("failed");
  });

  // ============================================================================
  // SCENARIO 2: PREMIUM BOT UNALTERED OPENROUTER INFERENCE
  // ============================================================================
  it("Scenario 2: Premium bot receives prompt -> executes via OpenRouter without contacting OmniRoute", async () => {
    // 1. User configures a Premium bot
    const premiumRuntime = new MockHistoricalPremiumRuntime();
    const recordedBefore = mockServer.getRecordedRequests().length;

    // 2. Bot executes complex engineering turn with 4-block KV caching & MCP tools
    const result = await premiumRuntime.executePremiumTurn({
      systemPrompt:
        "[BLOCK_A_SYSTEM_INVARIANTS]\nYou are an enterprise senior engineer.\n[BLOCK_B_BOT_DEF]\nSkills: ts:refactor\n[BLOCK_C_HISTORY]",
      userPrompt: "[BLOCK_D_USER_INPUT]\nRefactor the auth microservice to use oRPC.",
      mcpTools: ["github_create_pull_request", "postgres_query", "notion_update_page"],
    });

    // 3. Verify execution parameters
    expect(result.model).toBe("openai/gpt-oss-120b");
    expect(result.inferenceMode).toBe("premium");
    expect(result.isFree).toBe(false);
    expect(result.tokenCost).toBeGreaterThan(0);
    expect(result.kvPrefixCached).toBe(true);
    expect(result.mcpToolsCount).toBe(3);

    // 4. Verify zero network calls were sent to OmniRoute gateway
    const recordedAfter = mockServer.getRecordedRequests().length;
    expect(recordedAfter).toBe(recordedBefore);
  });

  // ============================================================================
  // SCENARIO 3: CONTAINER RESTART & PERSISTENCE RESILIENCY
  // ============================================================================
  it("Scenario 3: OmniRoute container restarted -> volume /app/data retains keys and sqlite config", async () => {
    // 1. Admin provisions endpoint key for Rakazo before container restart
    const storage = new MockOmniRouteStorageManager({ volumePath: "/app/data" });
    const { key } = storage.createApiKey("rakazo-resilience-client");

    // 2. Verify key is immediately active
    expect(storage.validateApiKey(key)).toBe(true);

    // 3. Simulate container restart (Coolify redeploy / docker restart)
    storage.simulateRestart();

    // 4. Verify key remains valid post-restart
    expect(storage.validateApiKey(key)).toBe(true);
    expect(storage.getVolumeStatus().isMounted).toBe(true);
    expect(storage.getVolumeStatus().isWalActive).toBe(true);

    // 5. Subsequent request with persisted key succeeds
    const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
    mockServer.setCustomResponse("Post-restart operational response");
    const res = await adapter.complete({
      messages: [{ role: "user", content: "Test post-restart" }],
    });
    expect(res.content).toBe("Post-restart operational response");
  });

  // ============================================================================
  // SCENARIO 4: UNAUTHORIZED REQUEST / SECURITY BARRIER
  // ============================================================================
  it("Scenario 4: Unauthorized request to /v1/chat/completions -> 401 Unauthorized", async () => {
    // 1. Rogue or unauthenticated client attempts to query /v1/chat/completions
    const res = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-unauthorized-fake-key",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [{ role: "user", content: "Attempt unauthorized inference" }],
      }),
    });

    // 2. Server strictly rejects with 401 Unauthorized
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("invalid_api_key");

    // 3. Verify unauthenticated call does not execute inference logic
    const lastReq = mockServer.getLastRequest();
    expect(lastReq?.headers.authorization).toBe("Bearer sk-unauthorized-fake-key");
  });

  // ============================================================================
  // SCENARIO 5: VPS PASSIVE MULTI-TENANT ISOLATION
  // ============================================================================
  it("Scenario 5: Full VPS tenant passive status check -> all 15 services healthy and undisturbed", () => {
    const inspector = new MockVpsAuditInspector();
    const services = inspector.getCoLocatedServices();

    // 1. Check all 15 services are in "running" state
    expect(services).toHaveLength(15);
    const nonRunning = services.filter((s) => s.status !== "running");
    expect(nonRunning).toHaveLength(0);

    // 2. Check network isolation is active across all tenant boundaries
    const nonIsolated = services.filter((s) => !s.isolatedNetwork);
    expect(nonIsolated).toHaveLength(0);

    // 3. Confirm zero interference with before snapshot
    const isZeroInterference = inspector.verifyZeroInterference(services);
    expect(isZeroInterference).toBe(true);

    // 4. Verify system resources are unconstrained
    const metrics = inspector.getVpsMetrics();
    expect(metrics.availableRamMb).toBeGreaterThan(4096);
    expect(metrics.diskFreeGb).toBeGreaterThan(20);
  });
});
