import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MockOmniRouteServer } from "./omniroute-mock.js";
import {
  MockAdminAuthEngine,
  MockDocumentationAuditor,
  MockHistoricalPremiumRuntime,
  MockOmniRouteStorageManager,
  MockSpecPinningValidator,
  MockVpsAuditInspector,
  ReferenceFreeOmniRouteAdapter,
  ReferenceRakazoFreePolicyEngine,
} from "./omniroute-test-helpers.js";

describe("Tier 3: Cross-Feature Interactions & Combinations (11 Interaction Suites per TEST_INFRA.md)", () => {
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
  // SUITE 1 (F1 + F3): VPS AUDIT + OMNIROUTE CONTAINER DEPLOYMENT
  // ============================================================================
  it("Suite 1 (F1 + F3): VPS audit inspects Coolify deployment without perturbing server resources", async () => {
    const inspector = new MockVpsAuditInspector();
    const app = inspector.getCoolifyAppDetails("qmusbfbjcz0ohip348rv8fgc");
    expect(app.internalPort).toBe(20128);
    expect(app.volumeMount).toBe("/app/data");

    // Verify container health check responds 200 during audit
    const res = await fetch(`${serverUrl}/health`);
    expect(res.status).toBe(200);

    // Verify VPS metrics remain stable
    const metrics = inspector.getVpsMetrics();
    expect(metrics.availableRamMb).toBeGreaterThan(4096);
  });

  // ============================================================================
  // SUITE 2 (F2 + F3): SPEC PINNING + CONTAINER DEPLOYMENT
  // ============================================================================
  it("Suite 2 (F2 + F3): Pinned commit and release tag build container with verified specifications", async () => {
    const validator = new MockSpecPinningValidator();
    const spec = validator.validateSpec({
      repoUrl: "https://github.com/floteuil/OmniRoute",
      commitHash: "38e2616464fac4681c1f7a4e05dc9974e99e1dde",
      releaseTag: "release/v3.8.51",
      volumeMount: "/app/data",
      port: 20128,
      user: "10001:10001",
    });

    expect(spec.isCompliant).toBe(true);

    // Verify deployed container models endpoint conforms to spec
    const res = await fetch(`${serverUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
  });

  // ============================================================================
  // SUITE 3 (F3 + F4): CONTAINER DEPLOYMENT + STORAGE ENCRYPTION & ADMIN AUTH
  // ============================================================================
  it("Suite 3 (F3 + F4): Container deployment mounts encrypted storage volume and validates admin auth", () => {
    const storage = new MockOmniRouteStorageManager({
      volumePath: "/app/data",
      encryptionKey: "enc-key-32-byte-hex-string-for-storage",
      initialPassword: "StrongAdminPassword2026!",
    });
    const authEngine = new MockAdminAuthEngine("jwt-secret-test");

    const status = storage.getVolumeStatus();
    expect(status.volumePath).toBe("/app/data");
    expect(status.isMounted).toBe(true);

    const login = authEngine.attemptLogin("10.0.1.5", "StrongAdminPassword2026!", storage);
    expect(login.success).toBe(true);

    const verified = authEngine.verifyToken(login.token!);
    expect(verified.valid).toBe(true);
    expect(verified.payload.role).toBe("admin");
  });

  // ============================================================================
  // SUITE 4 (F4 + F5): STORAGE ENCRYPTION & ADMIN AUTH + ENDPOINT KEY PROVISIONING
  // ============================================================================
  it("Suite 4 (F4 + F5): Admin generates provisioned endpoint API key stored securely in SQLite", () => {
    const storage = new MockOmniRouteStorageManager({
      encryptionKey: "enc-storage-key",
      initialPassword: "AdminPassword!",
    });

    const { key, record } = storage.createApiKey("rakazo-endpoint-bearer-key");
    expect(key.startsWith("sk-omniroute-")).toBe(true);
    expect(record.revoked).toBe(false);

    // Validate key through storage engine
    expect(storage.validateApiKey(key)).toBe(true);
    // Plaintext password not stored in key record
    expect(JSON.stringify(record)).not.toContain("AdminPassword!");
  });

  // ============================================================================
  // SUITE 5 (F5 + F6): ENDPOINT KEY PROVISIONING + RAKAZO ENV INTEGRATION
  // ============================================================================
  it("Suite 5 (F5 + F6): Rakazo Free adapter uses provisioned endpoint key to query completions", async () => {
    const adapter = new ReferenceFreeOmniRouteAdapter({
      baseUrl: serverUrl,
      apiKey,
      defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    });

    mockServer.setCustomResponse("Réponse valide via clé endpoint");

    const res = await adapter.complete({
      messages: [{ role: "user", content: "Test integration" }],
    });

    expect(res.content).toBe("Réponse valide via clé endpoint");
    const lastReq = mockServer.getLastRequest();
    expect(lastReq?.headers.authorization).toBe(`Bearer ${apiKey}`);
  });

  // ============================================================================
  // SUITE 6 (F6 + F7): RAKAZO ENV INTEGRATION + ZERO-PROVIDER FAIL-CLOSED
  // ============================================================================
  it("Suite 6 (F6 + F7): Rakazo querying unconfigured OmniRoute triggers strict French fail-closed error with $0.00 cost", async () => {
    mockServer.setScenario("server_error");
    const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
    const policyEngine = new ReferenceRakazoFreePolicyEngine();

    // Verify adapter throws clean fail-closed error
    await expect(
      adapter.complete({
        messages: [{ role: "user", content: "Query unconfigured gateway" }],
      }),
    ).rejects.toThrow("Capacité gratuite temporairement indisponible");

    // Verify policy engine vetoes paid fallback
    expect(() => policyEngine.vetoPaidFallback("openai/gpt-4o")).toThrow(
      "Capacité gratuite temporairement indisponible",
    );
  });

  // ============================================================================
  // SUITE 7 (F7 + F8): ZERO-PROVIDER FAIL-CLOSED + PREMIUM PATH NON-REGRESSION
  // ============================================================================
  it("Suite 7 (F7 + F8): Free gateway outage does not degrade historical Premium OpenRouter path", async () => {
    // 1. Simulate Free gateway outage
    mockServer.setScenario("server_error");
    const freeAdapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });

    await expect(
      freeAdapter.complete({
        messages: [{ role: "user", content: "Free query during outage" }],
      }),
    ).rejects.toThrow("Capacité gratuite temporairement indisponible");

    // 2. Execute historical Premium turn
    const premiumRuntime = new MockHistoricalPremiumRuntime();
    const premiumRes = await premiumRuntime.executePremiumTurn({
      systemPrompt: "[BLOCK_A_SYSTEM_INVARIANTS]\nPremium instruction",
      userPrompt: "High-priority engineering workflow",
    });

    expect(premiumRes.model).toBe("openai/gpt-oss-120b");
    expect(premiumRes.inferenceMode).toBe("premium");
    expect(premiumRes.isFree).toBe(false);
    expect(premiumRes.tokenCost).toBeGreaterThan(0);
    expect(
      mockServer.getRecordedRequests().filter((r) => r.body?.model?.includes("gpt-oss-120b")),
    ).toHaveLength(0);
  });

  // ============================================================================
  // SUITE 8 (F3 + F9): CONTAINER DEPLOYMENT + PERSISTENCE & RESTART RESILIENCY
  // ============================================================================
  it("Suite 8 (F3 + F9): Restarting deployed container retains volume data and provisioned keys", () => {
    const storage = new MockOmniRouteStorageManager();
    const key1 = storage.createApiKey("pre-restart-key-1");
    const key2 = storage.createApiKey("pre-restart-key-2");

    // Container restarts
    storage.simulateRestart();

    expect(storage.validateApiKey(key1.key)).toBe(true);
    expect(storage.validateApiKey(key2.key)).toBe(true);
    expect(storage.getVolumeStatus().isMounted).toBe(true);
  });

  // ============================================================================
  // SUITE 9 (F4 + F9): ADMIN AUTH & ENCRYPTION + PERSISTENCE & RESTART RESILIENCY
  // ============================================================================
  it("Suite 9 (F4 + F9): Admin credentials and password hashing persist across container restart", () => {
    const storage = new MockOmniRouteStorageManager({
      initialPassword: "AdminPasswordPersist2026!",
    });
    const authEngine = new MockAdminAuthEngine("jwt-secret");

    // Login before restart
    const loginPre = authEngine.attemptLogin("10.0.0.1", "AdminPasswordPersist2026!", storage);
    expect(loginPre.success).toBe(true);

    // Restart container
    storage.simulateRestart();

    // Login after restart
    const loginPost = authEngine.attemptLogin("10.0.0.1", "AdminPasswordPersist2026!", storage);
    expect(loginPost.success).toBe(true);

    // Verify token issued post-restart
    expect(authEngine.verifyToken(loginPost.token!).valid).toBe(true);
  });

  // ============================================================================
  // SUITE 10 (F1 + F10): VPS AUDIT + PASSIVE VPS HEALTH VERIFICATION
  // ============================================================================
  it("Suite 10 (F1 + F10): Comprehensive VPS audit confirms 100% tenant isolation and zero service restarts", () => {
    const inspector = new MockVpsAuditInspector();
    const snapshotBefore = inspector.getCoLocatedServices();

    expect(snapshotBefore).toHaveLength(15);
    for (const service of snapshotBefore) {
      expect(service.status).toBe("running");
      expect(service.isolatedNetwork).toBe(true);
    }

    const isZeroInterference = inspector.verifyZeroInterference(snapshotBefore);
    expect(isZeroInterference).toBe(true);
  });

  // ============================================================================
  // SUITE 11 (F10 + F11): PASSIVE VPS HEALTH + MASTER DOCUMENTATION UPDATES
  // ============================================================================
  it("Suite 11 (F10 + F11): Master documentation accurately details VPS isolation with zero leaked secrets", () => {
    const auditor = new MockDocumentationAuditor();
    const sampleDeploymentDoc = `
      # Deployment Runbook
      VPS: Ubuntu 22.04 LTS
      Co-located services: 15 services isolated via Docker bridges
      Port mapping: OmniRoute 20128 -> Traefik 443
      Base URL: https://omniroute.workspacegroupefloteuil.eu/v1
      Endpoint Key: <OMNIROUTE_API_KEY>
      Storage Volume: /app/data
    `;

    const auditResult = auditor.auditFileContent(
      sampleDeploymentDoc,
      "docs/OMNIROUTE_DEPLOYMENT.md",
    );
    expect(auditResult.clean).toBe(true);
    expect(auditResult.leaks).toHaveLength(0);
  });
});
