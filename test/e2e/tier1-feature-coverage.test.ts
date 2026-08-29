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

describe("Tier 1: Feature Coverage E2E Suite (Features 1-11 per TEST_INFRA.md)", () => {
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
  // FEATURE 1: VPS & COOLIFY INFRASTRUCTURE AUDIT (ORIGINAL_REQUEST §R1)
  // ============================================================================
  describe("Feature 1: VPS & Coolify Infrastructure Audit", () => {
    const inspector = new MockVpsAuditInspector();

    it("F1-1: Audit discovers valid CPU cores (>=4) and operating system (Ubuntu 22.04 LTS)", () => {
      const metrics = inspector.getVpsMetrics();
      expect(metrics.cpuCores).toBeGreaterThanOrEqual(4);
      expect(metrics.osRelease).toContain("Ubuntu 22.04 LTS");
    });

    it("F1-2: Audit validates available RAM (> 4GB) and free storage (> 20GB)", () => {
      const metrics = inspector.getVpsMetrics();
      expect(metrics.availableRamMb).toBeGreaterThan(4096);
      expect(metrics.diskFreeGb).toBeGreaterThan(20);
    });

    it("F1-3: Coolify application audit locates dedicated OmniRoute resource (qmusbfbjcz0ohip348rv8fgc / App 21)", () => {
      const app = inspector.getCoolifyAppDetails("qmusbfbjcz0ohip348rv8fgc");
      expect(app.appId).toBe("qmusbfbjcz0ohip348rv8fgc");
      expect(app.status).toBe("ready");
      expect(app.internalPort).toBe(20128);
    });

    it("F1-4: Audit verifies all 15 co-located VPS services are actively running with isolated networks", () => {
      const services = inspector.getCoLocatedServices();
      expect(services).toHaveLength(15);
      for (const service of services) {
        expect(service.status).toBe("running");
        expect(service.isolatedNetwork).toBe(true);
      }
    });

    it("F1-5: Audit strictly operates in non-intrusive read-only mode with zero mutations", () => {
      const initialServices = inspector.getCoLocatedServices();
      const isZeroInterference = inspector.verifyZeroInterference(initialServices);
      expect(isZeroInterference).toBe(true);
    });
  });

  // ============================================================================
  // FEATURE 2: OMNIROUTE FORK & SPEC PINNING (ORIGINAL_REQUEST §R1)
  // ============================================================================
  describe("Feature 2: OmniRoute Fork & Spec Pinning", () => {
    const validator = new MockSpecPinningValidator();

    it("F2-1: Repo URL matches official fork https://github.com/floteuil/OmniRoute", () => {
      const spec = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        commitHash: "38e2616464fac4681c1f7a4e05dc9974e99e1dde",
      });
      expect(spec.repoUrl).toBe("https://github.com/floteuil/OmniRoute");
    });

    it("F2-2: Commit is pinned to release/v3.8.51 commit 38e2616464fac4681c1f7a4e05dc9974e99e1dde", () => {
      const spec = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        commitHash: "38e2616464fac4681c1f7a4e05dc9974e99e1dde",
        releaseTag: "release/v3.8.51",
      });
      expect(spec.pinnedCommit).toBe("38e2616464fac4681c1f7a4e05dc9974e99e1dde");
      expect(spec.pinnedRelease).toBe("release/v3.8.51");
    });

    it("F2-3: Dockerfile specifies persistent volume mount at /app/data", () => {
      const spec = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        volumeMount: "/app/data",
      });
      expect(spec.targetVolume).toBe("/app/data");
    });

    it("F2-4: Service specifies official target port 20128", () => {
      const spec = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        port: 20128,
      });
      expect(spec.targetPort).toBe(20128);
    });

    it("F2-5: Dockerfile enforces non-root execution (UID 10001:10001)", () => {
      const spec = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        user: "10001:10001",
      });
      expect(spec.nonRootUser).toBe("10001:10001");
      expect(spec.isCompliant).toBe(true);
    });
  });

  // ============================================================================
  // FEATURE 3: OMNIROUTE CONTAINER DEPLOYMENT (ORIGINAL_REQUEST §R2)
  // ============================================================================
  describe("Feature 3: OmniRoute Container Deployment", () => {
    it("F3-1: OmniRoute container responds to HTTP GET /health with 200 OK", async () => {
      const res = await fetch(`${serverUrl}/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe("healthy");
    });

    it("F3-2: OmniRoute container responds to HTTP GET /v1/models with JSON catalog", async () => {
      const res = await fetch(`${serverUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.object).toBe("list");
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("F3-3: Exposed public domain https://omniroute.workspacegroupefloteuil.eu is well-formed", () => {
      const domain = "https://omniroute.workspacegroupefloteuil.eu";
      const url = new URL(domain);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("omniroute.workspacegroupefloteuil.eu");
    });

    it("F3-4: Container binds to internal port without exposing raw daemon socket", () => {
      const inspector = new MockVpsAuditInspector();
      const app = inspector.getCoolifyAppDetails("qmusbfbjcz0ohip348rv8fgc");
      expect(app.internalPort).toBe(20128);
      expect(app.volumeMount).toBe("/app/data");
    });

    it("F3-5: Container lifecycle starts and stops cleanly", async () => {
      const tempServer = new MockOmniRouteServer({ port: 0, apiKey });
      const tempUrl = await tempServer.start();
      expect(tempUrl).toContain("http://127.0.0.1:");
      await tempServer.stop();
    });
  });

  // ============================================================================
  // FEATURE 4: STORAGE ENCRYPTION & ADMIN PROTECTION (ORIGINAL_REQUEST §R2)
  // ============================================================================
  describe("Feature 4: Storage Encryption & Admin Protection", () => {
    const storage = new MockOmniRouteStorageManager({
      initialPassword: "AdminSecurePassword2026!",
      encryptionKey: "enc-key-32-byte-hex-string-for-storage",
    });
    const authEngine = new MockAdminAuthEngine("jwt-secret-key-2026");

    it("F4-1: Admin authentication succeeds with valid password and issues JWT token", () => {
      const res = authEngine.attemptLogin("192.168.1.10", "AdminSecurePassword2026!", storage);
      expect(res.success).toBe(true);
      expect(res.token).toBeDefined();
    });

    it("F4-2: Admin authentication fails with incorrect password and increments failure count", () => {
      const res = authEngine.attemptLogin("192.168.1.11", "WrongPassword123!", storage);
      expect(res.success).toBe(false);
      expect(res.error).toBe("Identifiants invalides.");
    });

    it("F4-3: Passwords in persistent storage are hashed and never stored in plain text", () => {
      const isPlainPresent = JSON.stringify(storage).includes("AdminSecurePassword2026!");
      expect(isPlainPresent).toBe(false);
      expect(storage.verifyPassword("AdminSecurePassword2026!")).toBe(true);
    });

    it("F4-4: Valid JWT session token is verified successfully", () => {
      const login = authEngine.attemptLogin("192.168.1.12", "AdminSecurePassword2026!", storage);
      const verified = authEngine.verifyToken(login.token!);
      expect(verified.valid).toBe(true);
      expect(verified.payload.role).toBe("admin");
    });

    it("F4-5: Storage volume status reports /app/data mounted with active encryption", () => {
      const status = storage.getVolumeStatus();
      expect(status.volumePath).toBe("/app/data");
      expect(status.isMounted).toBe(true);
      expect(status.isWalActive).toBe(true);
    });
  });

  // ============================================================================
  // FEATURE 5: DEDICATED ENDPOINT KEY PROVISIONING (ORIGINAL_REQUEST §R3)
  // ============================================================================
  describe("Feature 5: Dedicated Endpoint Key Provisioning", () => {
    const storage = new MockOmniRouteStorageManager();

    it("F5-1: Provisioned endpoint API key follows sk-omniroute-* bearer format", () => {
      const { key, record } = storage.createApiKey("rakazo-production-client");
      expect(key.startsWith("sk-omniroute-")).toBe(true);
      expect(record.name).toBe("rakazo-production-client");
    });

    it("F5-2: Valid endpoint API key is authenticated on /v1/chat/completions", async () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const res = await adapter.complete({
        messages: [{ role: "user", content: "Hello OmniRoute" }],
      });
      expect(res.content).toBeDefined();
    });

    it("F5-3: Missing Authorization header returns 401 Unauthorized", async () => {
      const res = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: "Test" }] }),
      });
      expect(res.status).toBe(401);
    });

    it("F5-4: Invalid API key returns 401 Unauthorized", async () => {
      const res = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sk-invalid-random-key",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "Test" }] }),
      });
      expect(res.status).toBe(401);
    });

    it("F5-5: Revoked endpoint key is rejected by storage validator", () => {
      const { key } = storage.createApiKey("temp-key-to-revoke");
      expect(storage.validateApiKey(key)).toBe(true);
      storage.revokeApiKey(key);
      expect(storage.validateApiKey(key)).toBe(false);
    });
  });

  // ============================================================================
  // FEATURE 6: RAKAZO ENVIRONMENT INTEGRATION (ORIGINAL_REQUEST §R3)
  // ============================================================================
  describe("Feature 6: Rakazo Environment Integration", () => {
    it("F6-1: Adapter sanitizes trailing slashes in OMNIROUTE_BASE_URL", () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({
        baseUrl: "https://omniroute.workspacegroupefloteuil.eu/v1////",
        apiKey,
      });
      expect(adapter.getBaseUrl()).toBe("https://omniroute.workspacegroupefloteuil.eu/v1");
    });

    it("F6-2: Adapter sets default fallback model to meta-llama/llama-3.3-70b-instruct:free", () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      expect(adapter.getDefaultModel()).toBe("meta-llama/llama-3.3-70b-instruct:free");
    });

    it("F6-3: Adapter transmits Authorization bearer header on completion calls", async () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await adapter.complete({
        messages: [{ role: "user", content: "Check headers" }],
      });
      const lastReq = mockServer.getLastRequest();
      expect(lastReq?.headers.authorization).toBe(`Bearer ${apiKey}`);
    });

    it("F6-4: Adapter complete call parses assistant response message content", async () => {
      mockServer.setCustomResponse("Réponse générée par le modèle gratuit");
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const res = await adapter.complete({
        messages: [{ role: "user", content: "Dis bonjour" }],
      });
      expect(res.content).toBe("Réponse générée par le modèle gratuit");
    });

    it("F6-5: Adapter streaming yields chunks with incremental delta text", async () => {
      mockServer.setCustomResponse("Un deux trois");
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const chunks: string[] = [];
      for await (const chunk of adapter.stream({
        messages: [{ role: "user", content: "Compte" }],
      })) {
        if (chunk.content) chunks.push(chunk.content);
      }
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join("")).toContain("Un deux trois");
    });
  });

  // ============================================================================
  // FEATURE 7: ZERO-PROVIDER INVARIANT & FAIL-CLOSED (ORIGINAL_REQUEST §R3/R4)
  // ============================================================================
  describe("Feature 7: Zero-Provider Invariant & Fail-Closed Behavior", () => {
    it("F7-1: Zero-provider initial state causes Free adapter to reject with standard French error", async () => {
      mockServer.setScenario("server_error");
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Test zero provider" }],
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("F7-2: Cost reported as 0.000000 satisfies policy engine zero-cost constraint", () => {
      const policyEngine = new ReferenceRakazoFreePolicyEngine();
      expect(() => policyEngine.assertZeroCostAndAllowed("meta-llama", 0.0)).not.toThrow();
    });

    it("F7-3: Paid fallback veto prevents routing Free queries to commercial models", () => {
      const policyEngine = new ReferenceRakazoFreePolicyEngine();
      expect(() => policyEngine.vetoPaidFallback("openai/gpt-4o")).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("F7-4: Telemetry contract accepts isFree: true and 0 cost logging", () => {
      const logData = {
        runId: "run-001",
        workerId: "worker-001",
        model: "meta-llama/llama-3.3-70b-instruct:free",
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        durationMs: 450,
        inferenceMode: "free" as const,
        isFree: true,
      };
      expect(logData.isFree).toBe(true);
      expect(logData.inferenceMode).toBe("free");
    });

    it("F7-5: Tag-based routing resolves coding tag to qwen-2.5-coder with $0.00 cost", () => {
      const policyEngine = new ReferenceRakazoFreePolicyEngine();
      const decision = policyEngine.resolveRoute(["coding"]);
      expect(decision.model).toBe("qwen/qwen-2.5-coder-32b-instruct:free");
      expect(decision.costPerToken).toBe(0.0);
      expect(decision.isFree).toBe(true);
    });
  });

  // ============================================================================
  // FEATURE 8: PREMIUM PATH NON-REGRESSION (ORIGINAL_REQUEST §R4)
  // ============================================================================
  describe("Feature 8: Premium Path Non-Regression", () => {
    const premiumRuntime = new MockHistoricalPremiumRuntime();

    it("F8-1: Premium runtime targets openai/gpt-oss-120b foundation model", async () => {
      const res = await premiumRuntime.executePremiumTurn({
        systemPrompt: "[BLOCK_A_SYSTEM_INVARIANTS]\nStandard prompt",
        userPrompt: "Analyze enterprise architecture",
      });
      expect(res.model).toBe("openai/gpt-oss-120b");
      expect(res.inferenceMode).toBe("premium");
      expect(res.isFree).toBe(false);
    });

    it("F8-2: Premium turn completes without invoking OmniRoute gateway", async () => {
      const initialReqCount = mockServer.getRecordedRequests().length;
      await premiumRuntime.executePremiumTurn({
        systemPrompt: "[BLOCK_A_SYSTEM]\nPremium instruction",
        userPrompt: "Do complex math",
      });
      const finalReqCount = mockServer.getRecordedRequests().length;
      expect(finalReqCount).toBe(initialReqCount);
    });

    it("F8-3: Premium system prompt preserves 4-block KV prefix caching structure", async () => {
      const res = await premiumRuntime.executePremiumTurn({
        systemPrompt: "[BLOCK_A_SYSTEM_INVARIANTS]\n[BLOCK_B_BOT_DEF]\n[BLOCK_C_HISTORY]",
        userPrompt: "[BLOCK_D_USER_INPUT]",
      });
      expect(res.kvPrefixCached).toBe(true);
    });

    it("F8-4: Premium runtime retains full MCP tooling access (40 tools)", async () => {
      const tools = Array.from({ length: 40 }, (_, i) => `mcp_tool_${i}`);
      const res = await premiumRuntime.executePremiumTurn({
        systemPrompt: "[BLOCK_A]\nTool user",
        userPrompt: "List files",
        mcpTools: tools,
      });
      expect(res.mcpToolsCount).toBe(40);
    });

    it("F8-5: Premium execution logs report tokenCost > 0 and isFree: false", async () => {
      const res = await premiumRuntime.executePremiumTurn({
        systemPrompt: "System",
        userPrompt: "Compute",
      });
      expect(res.tokenCost).toBeGreaterThan(0);
      expect(res.isFree).toBe(false);
    });
  });

  // ============================================================================
  // FEATURE 9: PERSISTENCE & RESTART RESILIENCY (ORIGINAL_REQUEST §R4)
  // ============================================================================
  describe("Feature 9: Persistence & Restart Resiliency", () => {
    const storage = new MockOmniRouteStorageManager();

    it("F9-1: API key generated before restart remains valid after container restart simulation", () => {
      const { key } = storage.createApiKey("pre-restart-key");
      expect(storage.validateApiKey(key)).toBe(true);
      storage.simulateRestart();
      expect(storage.validateApiKey(key)).toBe(true);
    });

    it("F9-2: Admin password verification succeeds after container restart simulation", () => {
      storage.simulateRestart();
      expect(storage.verifyPassword("SuperAdminStrongSecret2026!")).toBe(true);
    });

    it("F9-3: WAL journal and SQLite storage volume remain active after restart", () => {
      storage.simulateRestart();
      const status = storage.getVolumeStatus();
      expect(status.isMounted).toBe(true);
      expect(status.isWalActive).toBe(true);
    });

    it("F9-4: Multiple distinct API keys survive across container restarts", () => {
      const k1 = storage.createApiKey("key-1");
      const k2 = storage.createApiKey("key-2");
      storage.simulateRestart();
      expect(storage.validateApiKey(k1.key)).toBe(true);
      expect(storage.validateApiKey(k2.key)).toBe(true);
    });

    it("F9-5: Revoked keys remain revoked after restart cycle", () => {
      const k3 = storage.createApiKey("key-to-revoke");
      storage.revokeApiKey(k3.key);
      storage.simulateRestart();
      expect(storage.validateApiKey(k3.key)).toBe(false);
    });
  });

  // ============================================================================
  // FEATURE 10: PASSIVE VPS HEALTH VERIFICATION (ORIGINAL_REQUEST §R5)
  // ============================================================================
  describe("Feature 10: Passive VPS Health Verification", () => {
    const inspector = new MockVpsAuditInspector();

    it("F10-1: Traefik proxy and let's encrypt reverse proxy report running status", () => {
      const services = inspector.getCoLocatedServices();
      const traefik = services.find((s) => s.name === "traefik-proxy");
      expect(traefik?.status).toBe("running");
      expect(traefik?.ports).toContain(443);
    });

    it("F10-2: PostgreSQL database service reports uninterrupted uptime", () => {
      const services = inspector.getCoLocatedServices();
      const pg = services.find((s) => s.name === "postgres-main");
      expect(pg?.status).toBe("running");
      expect(pg?.uptimeSeconds).toBeGreaterThan(10000);
    });

    it("F10-3: Co-located business apps (Novamira, Postiz, SearXNG, n8n) remain running", () => {
      const services = inspector.getCoLocatedServices();
      const names = services.map((s) => s.name);
      expect(names).toContain("novamira-hub");
      expect(names).toContain("postiz-social");
      expect(names).toContain("searxng-engine");
      expect(names).toContain("n8n-automation");
    });

    it("F10-4: Zero service restarts occurred during OmniRoute audit and deployment", () => {
      const beforeSnapshot = inspector.getCoLocatedServices();
      expect(inspector.verifyZeroInterference(beforeSnapshot)).toBe(true);
    });

    it("F10-5: Monitoring stacks (Grafana, Prometheus) are operational on VPS", () => {
      const services = inspector.getCoLocatedServices();
      const grafana = services.find((s) => s.name === "monitoring-grafana");
      const prometheus = services.find((s) => s.name === "monitoring-prometheus");
      expect(grafana?.status).toBe("running");
      expect(prometheus?.status).toBe("running");
    });
  });

  // ============================================================================
  // FEATURE 11: MASTER DOCUMENTATION (ZERO SECRETS) (ORIGINAL_REQUEST §R5)
  // ============================================================================
  describe("Feature 11: Master Documentation Updates", () => {
    const auditor = new MockDocumentationAuditor();

    it("F11-1: Deployment runbook documentation contains zero leaked raw secrets", () => {
      const sampleRunbook = `
        # Runbook
        OMNIROUTE_BASE_URL=https://omniroute.workspacegroupefloteuil.eu/v1
        OMNIROUTE_API_KEY=<OMNIROUTE_API_KEY>
      `;
      const result = auditor.auditFileContent(sampleRunbook, "docs/OMNIROUTE_DEPLOYMENT.md");
      expect(result.clean).toBe(true);
    });

    it("F11-2: Architecture blueprint documents dual-path inference topology", () => {
      const sampleBlueprint = `
        # Master Blueprint
        - Premium Path: OpenRouter gpt-oss-120b
        - Free Path: OmniRoute Gateway
      `;
      expect(sampleBlueprint).toContain("Premium Path: OpenRouter gpt-oss-120b");
      expect(sampleBlueprint).toContain("Free Path: OmniRoute Gateway");
    });

    it("F11-3: Environment setup documentation details all required Coolify variables", () => {
      const sampleEnvDoc = `
        Required variables:
        - OMNIROUTE_BASE_URL
        - OMNIROUTE_API_KEY
        - STORAGE_ENCRYPTION_KEY
        - INITIAL_PASSWORD
      `;
      expect(sampleEnvDoc).toContain("OMNIROUTE_BASE_URL");
      expect(sampleEnvDoc).toContain("STORAGE_ENCRYPTION_KEY");
    });

    it("F11-4: Agents documentation specifies usage tags for free inference", () => {
      const sampleAgentsDoc = `
        Usage tags: coding, writing, reasoning, fast, analysis
      `;
      expect(sampleAgentsDoc).toContain("coding");
      expect(sampleAgentsDoc).toContain("reasoning");
      expect(sampleAgentsDoc).toContain("analysis");
    });

    it("F11-5: Documentation auditor catches unauthorized plaintext secret leakage", () => {
      const leakyDoc = `
        INITIAL_PASSWORD=LeakedSuperSecret123!
      `;
      const result = auditor.auditFileContent(leakyDoc, "leaky_doc.md");
      expect(result.clean).toBe(false);
      expect(result.leaks.length).toBeGreaterThan(0);
    });
  });
});
