import { isForbiddenMcpConnector, SOVEREIGN_MCP_CONNECTORS } from "@rakazo/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNonHdsWindmillEndpoint,
  executeEnterpriseTool,
  executeWindmillRgpdTool,
} from "./enterprise-tools.js";
import {
  clearRecordedIncidents,
  listRecordedIncidents,
  recordDiagnosticIncident,
  runDeepSelfDiagnostics,
} from "./flight-recorder.js";

describe("Windmill RGPD MCP Connectors (AutoLite & Proxy) & Strict HDS Isolation", () => {
  beforeEach(() => {
    clearRecordedIncidents();
    vi.restoreAllMocks();
  });

  it("completely removes n8n MCP and strictly forbids HDS Windmill MCP servers", () => {
    const ids = SOVEREIGN_MCP_CONNECTORS.map((c) => c.id);
    expect(ids).not.toContain("n8n");
    expect(ids).toContain("windmill_autolite");
    expect(ids).toContain("windmill_proxy");

    // HDS servers must be blocked at the contract level
    expect(isForbiddenMcpConnector("windmill-backend-hds")).toBe(true);
    expect(isForbiddenMcpConnector("windmill-proxy-hds")).toBe(true);
    expect(isForbiddenMcpConnector("windmill_backend_hds")).toBe(true);
    expect(isForbiddenMcpConnector("windmill_proxy_hds")).toBe(true);
    expect(isForbiddenMcpConnector("windmill_autolite")).toBe(false);
    expect(isForbiddenMcpConnector("windmill_proxy")).toBe(false);

    // Runtime HDS endpoint veto must reject private HDS WireGuard subnet and HDS hostnames
    expect(() => assertNonHdsWindmillEndpoint("http://10.0.20.10:8000")).toThrow(/SECURITY_VETO/);
    expect(() => assertNonHdsWindmillEndpoint("http://10.0.20.10:8003")).toThrow(/SECURITY_VETO/);
    expect(() => assertNonHdsWindmillEndpoint("https://windmill-hds.example.com")).toThrow(
      /SECURITY_VETO/,
    );
    expect(() =>
      assertNonHdsWindmillEndpoint("https://autolite.windmill.example.com"),
    ).not.toThrow();
  });

  it("executes Windmill AutoLite & Proxy RGPD tools against Windmill REST v1 endpoints", async () => {
    vi.stubEnv("WINDMILL_AUTOLITE_URL", "https://autolite-rgpd.example.com");
    vi.stubEnv("WINDMILL_AUTOLITE_TOKEN", "wmill_secret_autolite_token");
    vi.stubEnv("WINDMILL_AUTOLITE_WORKSPACE", "main");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/api/users/whoami")) {
        return new Response(JSON.stringify({ username: "ops", email: "ops@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/w/main/jobs/run_wait_result/p/f/sync/leads")) {
        return new Response(JSON.stringify({ synced: 12 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    const who = await executeEnterpriseTool("windmill_autolite_whoami", {});
    expect(who).toEqual({
      ok: true,
      instance: "autolite",
      workspace: "main",
      user: { username: "ops", email: "ops@example.com" },
    });

    const runRes = await executeWindmillRgpdTool("autolite", "run_script", {
      path: "f/sync/leads",
      args: { limit: 12 },
      wait: true,
    });
    expect(runRes).toEqual({
      ok: true,
      instance: "autolite",
      path: "f/sync/leads",
      waited: true,
      result: { synced: 12 },
    });

    fetchSpy.mockRestore();
  });
});

describe("Rakazo Flight Recorder & 10-Probe AI Forensic Self-Diagnostics", () => {
  beforeEach(() => {
    clearRecordedIncidents();
  });

  it("records, scrubs secrets, deduplicates signatures, and pinpoints exact suspected files", () => {
    const fakeSecretKey = ["sk", "mock", "abcdefghijklmnopqrstuvwx"].join("-");
    const fakeErr = new Error(
      `Failed with Bearer secret_token_123456 and ${fakeSecretKey}`,
    );
    fakeErr.stack = [
      "Error: Failed",
      "    at OmniRouteInferenceTransport.stream (/app/packages/adapters/src/omniroute-transport.ts:112:15)",
      "    at executeRun (/app/packages/adapters/src/executor.ts:1710:9)",
    ].join("\n");

    const inc1 = recordDiagnosticIncident({
      severity: "error",
      layer: "inference_gateway",
      code: "OMNIROUTE_STREAM_FAILURE",
      title: "Erreur flux OmniRoute avec wmill_super_secret_token",
      message: fakeErr.message,
      error: fakeErr,
      context: { botId: "bot-alpha", runId: "run-999", model: "combo/rakazo-fast" },
    });

    // Record identical error a second time to verify deduplication
    const inc2 = recordDiagnosticIncident({
      severity: "error",
      layer: "inference_gateway",
      code: "OMNIROUTE_STREAM_FAILURE",
      title: "Erreur flux OmniRoute avec wmill_super_secret_token",
      message: fakeErr.message,
      error: fakeErr,
      context: { botId: "bot-alpha", runId: "run-1000", model: "combo/rakazo-fast" },
    });

    expect(inc2.occurrences).toBe(2);
    expect(listRecordedIncidents()).toHaveLength(1);

    // Zero secrets leaked in title, message, or stack
    const serialized = JSON.stringify(inc2);
    expect(serialized).not.toContain("secret_token_123456");
    expect(serialized).not.toContain(fakeSecretKey);
    expect(serialized).not.toContain("wmill_super_secret_token");

    // Exact source file extracted from stack frame
    expect(inc2.suspectedFile).toBe("packages/adapters/src/omniroute-transport.ts:112");
  });

  it("executes deep self-diagnostics and generates an AI-ready Forensic Markdown dossier", async () => {
    recordDiagnosticIncident({
      severity: "warn",
      layer: "web_client",
      code: "CLIENT_WINDOW_ERROR",
      title: "TypeError: Cannot read properties of null",
      message: "Cannot read properties of null (reading 'scrollIntoView')",
      context: { route: "/app/bot-1" },
    });

    const report = await runDeepSelfDiagnostics({
      gitSha: "testsha123",
      skipExternalNetworkProbes: true,
    });

    expect(report.zeroLlmCost).toBe(true);
    expect(report.probes.length).toBeGreaterThanOrEqual(6);
    expect(report.recentIncidents).toHaveLength(1);
    expect(report.aiForensicMarkdownFr).toContain(
      "# RAPPORT FORENSIQUE D'AUTO-DIAGNOSTIC RAKAZO (PRÊT POUR IA)",
    );
    expect(report.aiForensicMarkdownFr).toContain("CLIENT_WINDOW_ERROR");
    expect(report.aiForensicMarkdownFr).toContain("apps/web/src/pages/Shell.tsx");
    expect(report.aiForensicMarkdownFr).toContain("3538 skills indexées");
  });
});
