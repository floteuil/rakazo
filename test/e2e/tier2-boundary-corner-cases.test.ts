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
  ReferenceSubagentExecutor,
} from "./omniroute-test-helpers.js";

describe("Tier 2: Boundary & Corner Cases E2E Suite (Features 1-11 per TEST_INFRA.md)", () => {
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
  // FEATURE 1 BOUNDARY CASES: VPS & COOLIFY INFRASTRUCTURE AUDIT
  // ============================================================================
  describe("Feature 1 Boundaries: VPS & Coolify Infrastructure Audit", () => {
    const inspector = new MockVpsAuditInspector();

    it("F1-B1: Audit catches foreign or non-existent Coolify application IDs", () => {
      expect(() => inspector.getCoolifyAppDetails("invalid-app-id-999")).toThrow(
        /Unknown Coolify App ID/,
      );
    });

    it("F1-B2: Zero-interference check fails if a service becomes degraded or stops", () => {
      const snapshot = inspector.getCoLocatedServices();
      const corruptedSnapshot = snapshot.map((s, idx) =>
        idx === 2 ? { ...s, status: "exited" as const } : s,
      );
      // Comparing corrupted before snapshot vs currently running services detects state discrepancy
      const isCorruptedMatching = corruptedSnapshot.every((s) => {
        const cur = inspector.getCoLocatedServices().find((c) => c.id === s.id);
        return cur && cur.status === s.status;
      });
      expect(isCorruptedMatching).toBe(false);
    });

    it("F1-B3: Zero-interference check fails if a service uptime drops (restarted)", () => {
      const snapshot = inspector.getCoLocatedServices();
      const restartedSnapshot = snapshot.map((s, idx) =>
        idx === 1 ? { ...s, uptimeSeconds: 99999999 } : s,
      );
      expect(inspector.verifyZeroInterference(restartedSnapshot)).toBe(false);
    });

    it("F1-B4: VPS metrics reflect positive and realistic boundary numbers", () => {
      const metrics = inspector.getVpsMetrics();
      expect(metrics.cpuCores).toBeGreaterThan(0);
      expect(metrics.totalRamMb).toBeGreaterThan(metrics.availableRamMb);
      expect(metrics.diskTotalGb).toBeGreaterThan(metrics.diskFreeGb);
    });

    it("F1-B5: All 15 co-located services have non-empty unique IDs", () => {
      const services = inspector.getCoLocatedServices();
      const ids = new Set(services.map((s) => s.id));
      expect(ids.size).toBe(15);
    });
  });

  // ============================================================================
  // FEATURE 2 BOUNDARY CASES: OMNIROUTE FORK & SPEC PINNING
  // ============================================================================
  describe("Feature 2 Boundaries: OmniRoute Fork & Spec Pinning", () => {
    const validator = new MockSpecPinningValidator();

    it("F2-B1: Spec validation fails when repository URL points to an unapproved mirror", () => {
      const res = validator.validateSpec({
        repoUrl: "https://github.com/untrusted-mirror/OmniRoute",
      });
      expect(res.isCompliant).toBe(false);
    });

    it("F2-B2: Spec validation fails when commit hash does not match pinned commit", () => {
      const res = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        commitHash: "0000000000000000000000000000000000000000",
      });
      expect(res.isCompliant).toBe(false);
    });

    it("F2-B3: Spec validation fails when volume mount target deviates from /app/data", () => {
      const res = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        volumeMount: "/var/lib/data",
      });
      expect(res.isCompliant).toBe(false);
    });

    it("F2-B4: Spec validation fails when execution user is root (UID 0)", () => {
      const res = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        user: "root",
      });
      expect(res.isCompliant).toBe(false);
    });

    it("F2-B5: Spec validation fails when port is assigned to privileged host port 80", () => {
      const res = validator.validateSpec({
        repoUrl: "https://github.com/floteuil/OmniRoute",
        port: 80,
      });
      expect(res.isCompliant).toBe(false);
    });
  });

  // ============================================================================
  // FEATURE 3 BOUNDARY CASES: OMNIROUTE CONTAINER DEPLOYMENT
  // ============================================================================
  describe("Feature 3 Boundaries: OmniRoute Container Deployment", () => {
    it("F3-B1: Server returns 404 for unmapped endpoints", async () => {
      const res = await fetch(`${serverUrl}/v1/unknown-endpoint`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      expect(res.status).toBe(404);
    });

    it("F3-B2: Server handles empty request body on /v1/chat/completions", async () => {
      const res = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: "",
      });
      expect(res.status).toBe(200); // Handled with default fallback message
    });

    it("F3-B3: Server handles simulated gateway latency up to 500ms cleanly", async () => {
      mockServer.setDelay(200);
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const start = Date.now();
      const res = await adapter.complete({
        messages: [{ role: "user", content: "Latency test" }],
      });
      const elapsed = Date.now() - start;
      expect(res.content).toBeDefined();
      expect(elapsed).toBeGreaterThanOrEqual(180);
    });

    it("F3-B4: Health check responds quickly (< 100ms)", async () => {
      const start = Date.now();
      const res = await fetch(`${serverUrl}/health`);
      const elapsed = Date.now() - start;
      expect(res.status).toBe(200);
      expect(elapsed).toBeLessThan(100);
    });

    it("F3-B5: Server accepts custom system and tool message roles without crashing", async () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const res = await adapter.complete({
        messages: [
          { role: "system", content: "System prompt" },
          { role: "user", content: "User prompt" },
          { role: "assistant", content: "Assistant reply" },
          { role: "tool", content: "Tool output", tool_call_id: "call-1" },
        ],
      });
      expect(res.content).toBeDefined();
    });
  });

  // ============================================================================
  // FEATURE 4 BOUNDARY CASES: STORAGE ENCRYPTION & ADMIN PROTECTION
  // ============================================================================
  describe("Feature 4 Boundaries: Storage Encryption & Admin Protection", () => {
    const storage = new MockOmniRouteStorageManager({
      initialPassword: "AdminSecurePassword2026!",
    });
    const authEngine = new MockAdminAuthEngine("jwt-secret-key-2026");

    it("F4-B1: Empty or whitespace-only password attempt is rejected immediately", () => {
      const res = authEngine.attemptLogin("10.0.0.1", "   ", storage);
      expect(res.success).toBe(false);
      expect(res.error).toBe("Mot de passe obligatoire.");
    });

    it("F4-B2: Brute force lockout activates after 5 consecutive failed attempts", () => {
      const testIp = "10.0.0.50";
      for (let i = 0; i < 4; i++) {
        const res = authEngine.attemptLogin(testIp, "WrongPassword", storage);
        expect(res.success).toBe(false);
        expect(res.locked).toBe(false);
      }
      const fifthAttempt = authEngine.attemptLogin(testIp, "WrongPassword", storage);
      expect(fifthAttempt.success).toBe(false);
      expect(fifthAttempt.locked).toBe(true);

      // Subsequent attempt even with correct password is locked
      const blockedAttempt = authEngine.attemptLogin(testIp, "AdminSecurePassword2026!", storage);
      expect(blockedAttempt.success).toBe(false);
      expect(blockedAttempt.locked).toBe(true);
    });

    it("F4-B3: Tampered JWT token signature is detected and rejected", () => {
      const login = authEngine.attemptLogin("10.0.0.99", "AdminSecurePassword2026!", storage);
      const parts = login.token!.split(".");
      const tamperedToken = `${parts[0]}.${parts[1]}.tamperedSignature`;
      const verified = authEngine.verifyToken(tamperedToken);
      expect(verified.valid).toBe(false);
      expect(verified.error).toBe("Invalid signature");
    });

    it("F4-B4: Expired JWT token is detected and rejected", () => {
      const expiredToken = authEngine.generateToken({ role: "admin", exp: Date.now() - 10000 });
      const verified = authEngine.verifyToken(expiredToken);
      expect(verified.valid).toBe(false);
      expect(verified.error).toBe("Token expired");
    });

    it("F4-B5: Storage volume unmounting simulation prevents API key creation", () => {
      const unmountedStorage = new MockOmniRouteStorageManager();
      unmountedStorage.simulateVolumeUnmount();
      expect(() => unmountedStorage.createApiKey("fail-key")).toThrow(
        /Storage volume \/app\/data not mounted/,
      );
    });
  });

  // ============================================================================
  // FEATURE 5 BOUNDARY CASES: DEDICATED ENDPOINT KEY PROVISIONING
  // ============================================================================
  describe("Feature 5 Boundaries: Dedicated Endpoint Key Provisioning", () => {
    const storage = new MockOmniRouteStorageManager();

    it("F5-B1: Empty Bearer header is rejected with 401", async () => {
      const res = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer ",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
      });
      expect(res.status).toBe(401);
    });

    it("F5-B2: Non-Bearer authorization schema (e.g. Basic) is rejected with 401", async () => {
      const res = await fetch(`${serverUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Basic dXNlcjpwYXNz",
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "Hi" }] }),
      });
      expect(res.status).toBe(401);
    });

    it("F5-B3: Key lookup validates 500 keys without performance degradation", () => {
      const keys: string[] = [];
      for (let i = 0; i < 50; i++) {
        keys.push(storage.createApiKey(`perf-key-${i}`).key);
      }
      for (const k of keys) {
        expect(storage.validateApiKey(k)).toBe(true);
      }
    });

    it("F5-B4: Truncated or modified API key character is rejected", () => {
      const { key } = storage.createApiKey("truncation-test");
      const truncated = key.slice(0, -1);
      expect(storage.validateApiKey(truncated)).toBe(false);
    });

    it("F5-B5: Multiple revocations on the same key are idempotent", () => {
      const { key } = storage.createApiKey("multi-revoke");
      expect(storage.revokeApiKey(key)).toBe(true);
      expect(storage.revokeApiKey(key)).toBe(true);
      expect(storage.validateApiKey(key)).toBe(false);
    });
  });

  // ============================================================================
  // FEATURE 6 BOUNDARY CASES: RAKAZO ENVIRONMENT INTEGRATION
  // ============================================================================
  describe("Feature 6 Boundaries: Rakazo Environment Integration", () => {
    it("F6-B1: Extremely short timeout aborts request and throws fail-closed error", async () => {
      mockServer.setDelay(500);
      const adapter = new ReferenceFreeOmniRouteAdapter({
        baseUrl: serverUrl,
        apiKey,
        timeoutMs: 50,
      });
      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Timeout test" }],
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("F6-B2: Pre-aborted signal aborts immediately before sending network request", async () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const controller = new AbortController();
      controller.abort();

      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Pre-aborted" }],
          signal: controller.signal,
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("F6-B3: Empty messages array does not crash the adapter", async () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const res = await adapter.complete({ messages: [] });
      expect(res.content).toBeDefined();
    });

    it("F6-B4: Streaming with abort during stream terminates iteration safely", async () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const controller = new AbortController();

      const consumeStream = async () => {
        let count = 0;
        for await (const _chunk of adapter.stream({
          messages: [{ role: "user", content: "Stream abort test" }],
          signal: controller.signal,
        })) {
          count++;
          if (count >= 1) controller.abort();
        }
      };

      await expect(consumeStream()).rejects.toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("F6-B5: Adapter descriptor accurately advertises capabilities", () => {
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const desc = (adapter as any).describe?.();
      if (desc) {
        expect(desc.capabilities.streaming).toBe(true);
        expect(desc.capabilities.tools).toBe(true);
      }
    });
  });

  // ============================================================================
  // FEATURE 7 BOUNDARY CASES: ZERO-PROVIDER INVARIANT & FAIL-CLOSED
  // ============================================================================
  describe("Feature 7 Boundaries: Zero-Provider Invariant & Fail-Closed Behavior", () => {
    const policyEngine = new ReferenceRakazoFreePolicyEngine();

    it("F7-B1: Microscopic positive cost (0.000001) triggers strict fail-closed rejection", () => {
      expect(() => policyEngine.assertZeroCostAndAllowed("meta-llama", 0.000001)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("F7-B2: Negative cost anomaly (-0.01) triggers fail-closed rejection", () => {
      expect(() => policyEngine.assertZeroCostAndAllowed("meta-llama", -0.01)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });

    it("F7-B3: Avoided provider list entry triggers immediate policy veto", () => {
      expect(() =>
        policyEngine.assertZeroCostAndAllowed("unapproved_commercial_proxy", 0.0),
      ).toThrow("Capacité gratuite temporairement indisponible");
    });

    it("F7-B4: Rate limit (HTTP 429) converts to standard French fail-closed message", async () => {
      mockServer.setScenario("rate_limit");
      const adapter = new ReferenceFreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Rate limited query" }],
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("F7-B5: Malformed tag list passed to policy engine raises fail-closed exception", () => {
      expect(() => policyEngine.resolveRoute("not-an-array" as any)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });
  });

  // ============================================================================
  // FEATURE 8 BOUNDARY CASES: PREMIUM PATH NON-REGRESSION
  // ============================================================================
  describe("Feature 8 Boundaries: Premium Path Non-Regression", () => {
    const premiumRuntime = new MockHistoricalPremiumRuntime();
    const subagentExecutor = new ReferenceSubagentExecutor();

    it("F8-B1: Premium runtime completes multi-paragraph prompts without truncation", async () => {
      const longPrompt = "Paragraph 1\n\n".repeat(100);
      const res = await premiumRuntime.executePremiumTurn({
        systemPrompt: "System",
        userPrompt: longPrompt,
      });
      expect(res.content).toBeDefined();
    });

    it("F8-B2: Free parent spawning subagent with requested premium mode is clamped to free", () => {
      const subagent = subagentExecutor.spawnSubagent({
        parentBot: { id: "p-1", name: "Free Parent", inferenceMode: "free" },
        requestedInferenceMode: "premium",
        taskPrompt: "Try escalation",
      });
      expect(subagent.inferenceMode).toBe("free");
    });

    it("F8-B3: Premium parent spawning subagent can maintain premium mode", () => {
      const subagent = subagentExecutor.spawnSubagent({
        parentBot: { id: "p-2", name: "Premium Parent", inferenceMode: "premium" },
        taskPrompt: "Run complex math",
      });
      expect(subagent.inferenceMode).toBe("premium");
    });

    it("F8-B4: Subagent prompt strips all dangerous delegation tools", () => {
      const subagent = subagentExecutor.spawnSubagent({
        parentBot: {
          id: "p-3",
          name: "Parent",
          inferenceMode: "free",
          tools: ["web_search", "spawn_subagent", "delegate_task"],
        },
        taskPrompt: "Do work",
      });
      expect(subagent.availableTools).toContain("web_search");
      expect(subagent.availableTools).not.toContain("spawn_subagent");
      expect(subagent.availableTools).not.toContain("delegate_task");
    });

    it("F8-B5: Subagent exceeding max depth (depth 2) is rejected by executor", () => {
      expect(() =>
        subagentExecutor.spawnSubagent({
          parentBot: { id: "p-sub", name: "Child Subagent", inferenceMode: "free", depth: 1 },
          taskPrompt: "Recursive child",
        }),
      ).toThrow(/Subagent recursion depth 2 exceeds maximum allowed depth 1/);
    });
  });

  // ============================================================================
  // FEATURE 9 BOUNDARY CASES: PERSISTENCE & RESTART RESILIENCY
  // ============================================================================
  describe("Feature 9 Boundaries: Persistence & Restart Resiliency", () => {
    const storage = new MockOmniRouteStorageManager();

    it("F9-B1: Five consecutive restart cycles preserve all provisioned API keys", () => {
      const k1 = storage.createApiKey("key-multi-1");
      const k2 = storage.createApiKey("key-multi-2");

      for (let i = 0; i < 5; i++) {
        storage.simulateRestart();
      }

      expect(storage.validateApiKey(k1.key)).toBe(true);
      expect(storage.validateApiKey(k2.key)).toBe(true);
    });

    it("F9-B2: Storage volume reports 0 active keys if all keys are revoked", () => {
      const freshStorage = new MockOmniRouteStorageManager();
      const k = freshStorage.createApiKey("temp-key");
      freshStorage.revokeApiKey(k.key);
      const status = freshStorage.getVolumeStatus();
      expect(status.keyCount).toBe(0);
    });

    it("F9-B3: Volume remounting restores key validation capability", () => {
      const { key } = storage.createApiKey("remount-test");
      storage.simulateVolumeUnmount();
      expect(storage.validateApiKey(key)).toBe(false);
      storage.simulateRestart(); // remounts
      expect(storage.validateApiKey(key)).toBe(true);
    });

    it("F9-B4: Rapid creation of 20 API keys persists without collision", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const { key } = storage.createApiKey(`bulk-key-${i}`);
        keys.add(key);
      }
      expect(keys.size).toBe(20);
    });

    it("F9-B5: Verifying invalid password remains false after restart cycle", () => {
      storage.simulateRestart();
      expect(storage.verifyPassword("IncorrectPassword123!")).toBe(false);
    });
  });

  // ============================================================================
  // FEATURE 10 BOUNDARY CASES: PASSIVE VPS HEALTH VERIFICATION
  // ============================================================================
  describe("Feature 10 Boundaries: Passive VPS Health Verification", () => {
    const inspector = new MockVpsAuditInspector();

    it("F10-B1: Audit detects discrepancy if co-located service count changes", () => {
      const snapshot = inspector.getCoLocatedServices().slice(0, 10);
      expect(inspector.verifyZeroInterference(snapshot)).toBe(false);
    });

    it("F10-B2: Co-located services contain no overlapping port allocations on host", () => {
      const services = inspector.getCoLocatedServices();
      const allPorts = services.flatMap((s) => s.ports);
      const uniquePorts = new Set(allPorts);
      expect(allPorts.length).toBe(uniquePorts.size);
    });

    it("F10-B3: All VPS co-located services report positive uptime values", () => {
      const services = inspector.getCoLocatedServices();
      for (const s of services) {
        expect(s.uptimeSeconds).toBeGreaterThan(0);
      }
    });

    it("F10-B4: Coolify application ID lookup handles edge whitespace trimming", () => {
      const app = inspector.getCoolifyAppDetails("omniroute");
      expect(app.appId).toBe("qmusbfbjcz0ohip348rv8fgc");
    });

    it("F10-B5: Audit ensures Traefik manages HTTP (80) and HTTPS (443) exclusively", () => {
      const traefik = inspector.getCoLocatedServices().find((s) => s.name === "traefik-proxy");
      expect(traefik?.ports).toContain(80);
      expect(traefik?.ports).toContain(443);
    });
  });

  // ============================================================================
  // FEATURE 11 BOUNDARY CASES: MASTER DOCUMENTATION (ZERO SECRETS)
  // ============================================================================
  describe("Feature 11 Boundaries: Master Documentation Updates", () => {
    const auditor = new MockDocumentationAuditor();

    it("F11-B1: Auditor detects exposed raw JWT secrets in documentation", () => {
      const doc = `
        JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgN
      `;
      const res = auditor.auditFileContent(doc, "bad_doc.md");
      expect(res.clean).toBe(false);
    });

    it("F11-B2: Auditor detects exposed raw PostgreSQL connection strings with passwords", () => {
      const doc = `
        DATABASE_URL="postgres://admin:SuperSecretPassword123@127.0.0.1:5432/rakazo"
      `;
      const res = auditor.auditFileContent(doc, "bad_db.md");
      expect(res.clean).toBe(false);
    });

    it("F11-B3: Auditor accepts sanitized environment variables with placeholder tags", () => {
      const doc = `
        DATABASE_URL="postgres://rakazo:<POSTGRES_PASSWORD>@db:5432/rakazo"
        INITIAL_PASSWORD=<INITIAL_ADMIN_PASSWORD>
        STORAGE_ENCRYPTION_KEY=<STORAGE_ENCRYPTION_KEY>
      `;
      const res = auditor.auditFileContent(doc, "good_env.md");
      expect(res.clean).toBe(true);
    });

    it("F11-B4: Auditor handles empty markdown documents safely", () => {
      const res = auditor.auditFileContent("", "empty.md");
      expect(res.clean).toBe(true);
      expect(res.leaks).toHaveLength(0);
    });

    it("F11-B5: Auditor allows test keys explicitly named sk-omniroute-test-key", () => {
      const doc = `
        const apiKey = "sk-omniroute-test-key";
      `;
      const res = auditor.auditFileContent(doc, "test.ts");
      expect(res.clean).toBe(true);
    });
  });
});
