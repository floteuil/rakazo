import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  RakazoFreePolicyEngine,
} from "../../packages/adapters/src/free-policy-engine.js";
import { FreeOmniRouteAdapter } from "../../packages/adapters/src/omniroute-adapter.js";

class AdversarialMockServer {
  private server: http.Server | null = null;
  public port = 0;
  public responseHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void = () => {};

  public async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.responseHandler(req, res);
      });
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
      this.server.on("error", reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

describe("Challenger 1 Adversarial Stress & Vulnerability Exploration Harness", () => {
  let mockServer: AdversarialMockServer;
  let serverUrl: string;
  const apiKey = "sk-omniroute-test-key";

  beforeAll(async () => {
    mockServer = new AdversarialMockServer();
    serverUrl = await mockServer.start();
  });

  afterAll(async () => {
    await mockServer.stop();
  });

  // ============================================================================
  // SECTION 1: COST LEAKAGE & NUMERIC BOUNDARIES IN HEADERS & PAYLOADS
  // ============================================================================
  describe("1. Cost Leakage & Numeric Boundary Attacks", () => {
    it("rejects negative cost header (e.g. -0.005) fail-closed", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "-0.005",
          "x-omniroute-provider": "meta-llama",
        });
        res.end(JSON.stringify({ choices: [{ message: { content: "Negative cost attack" } }] }));
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("rejects non-numeric / NaN cost header fail-closed", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "NaN",
          "x-omniroute-provider": "meta-llama",
        });
        res.end(JSON.stringify({ choices: [{ message: { content: "NaN attack" } }] }));
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("rejects sub-cent positive cost header (e.g. 0.000002) fail-closed", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "0.000002",
          "x-omniroute-provider": "meta-llama",
        });
        res.end(JSON.stringify({ choices: [{ message: { content: "Micro cost attack" } }] }));
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("rejects non-zero pricing object inside non-streaming response body", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "meta-llama",
        });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: "Hidden cost attack" } }],
            pricing: { prompt: 0.001, completion: 0.002, total_cost: 0.003 },
          }),
        );
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("rejects non-zero pricing object in streaming SSE chunk mid-stream", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "meta-llama",
        });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Part 1 " } }] })}\n\n`);
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "Part 2 " } }], pricing: { total_cost: 0.05 } })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const consume = async () => {
        const chunks: string[] = [];
        for await (const chunk of adapter.stream({
          messages: [{ role: "user", content: "stream" }],
        })) {
          if (chunk.content) chunks.push(chunk.content);
        }
        return chunks;
      };

      await expect(consume()).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });
  });

  // ============================================================================
  // SECTION 2: PROVIDER SPOOFING & UNAPPROVED PROVIDER ISOLATION
  // ============================================================================
  describe("2. Provider Spoofing & Header Tampering", () => {
    it("rejects avoided provider in x-omniroute-provider header", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "unapproved_commercial_proxy",
        });
        res.end(JSON.stringify({ choices: [{ message: { content: "Proxy response" } }] }));
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("rejects unknown unapproved third-party provider in header", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "rogue_ai_cluster_99",
        });
        res.end(JSON.stringify({ choices: [{ message: { content: "Rogue response" } }] }));
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "hi" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("accepts all approved providers (meta-llama, mistralai, qwen, deepseek, google)", async () => {
      for (const provider of APPROVED_FREE_PROVIDERS) {
        mockServer.responseHandler = (_req, res) => {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "x-omniroute-cost": "0.000000",
            "x-omniroute-provider": provider,
          });
          res.end(
            JSON.stringify({ choices: [{ message: { content: `Response from ${provider}` } }] }),
          );
        };

        const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
        const res = await adapter.complete({ messages: [{ role: "user", content: "hi" }] });
        expect(res.content).toBe(`Response from ${provider}`);
      }
    });
  });

  // ============================================================================
  // SECTION 3: HTTP STATUS CODE CHAOS & PROTOCOL ANOMALIES
  // ============================================================================
  describe("3. HTTP Status Codes & Malformed Payloads", () => {
    const errorCodes = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504];

    for (const code of errorCodes) {
      it(`fails closed on HTTP ${code} with standard user-facing error`, async () => {
        mockServer.responseHandler = (_req, res) => {
          res.writeHead(code, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: `HTTP Error ${code}`, code } }));
        };

        const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
        await expect(
          adapter.complete({ messages: [{ role: "user", content: "error test" }] }),
        ).rejects.toThrow("Capacité gratuite temporairement indisponible");
      });
    }

    it("handles HTML error pages (e.g. Cloudflare / Traefik 502 Bad Gateway) without JSON parse crash", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(502, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>502 Bad Gateway</h1><p>Traefik Reverse Proxy Error</p></body></html>",
        );
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "html test" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("handles empty HTTP body (0 bytes) gracefully", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "meta-llama",
        });
        res.end("");
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      await expect(
        adapter.complete({ messages: [{ role: "user", content: "empty body" }] }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });
  });

  // ============================================================================
  // SECTION 4: HIGH CONCURRENCY & ABORT/TIMEOUT STRESS HARNESS
  // ============================================================================
  describe("4. Concurrency & Abort Controller Stress", () => {
    it("executes 100 concurrent complete() requests without race conditions or memory corruption", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "meta-llama",
        });
        res.end(
          JSON.stringify({
            id: "chatcmpl-concurrent",
            choices: [{ message: { content: "Concurrent response OK" } }],
          }),
        );
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const promises = Array.from({ length: 100 }, (_, i) =>
        adapter.complete({ messages: [{ role: "user", content: `Query #${i}` }] }),
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      for (const r of results) {
        expect(r.content).toBe("Concurrent response OK");
      }
    });

    it("handles client abort signal during streaming without unhandled promise rejections", async () => {
      mockServer.responseHandler = (_req, res) => {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "x-omniroute-cost": "0.000000",
          "x-omniroute-provider": "meta-llama",
        });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Token 1 " } }] })}\n\n`);
        setTimeout(() => {
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { content: "Token 2 " } }] })}\n\n`,
          );
          res.write("data: [DONE]\n\n");
          res.end();
        }, 50);
      };

      const adapter = new FreeOmniRouteAdapter({ baseUrl: serverUrl, apiKey });
      const controller = new AbortController();

      const consume = async () => {
        for await (const _chunk of adapter.stream({
          messages: [{ role: "user", content: "stream" }],
          signal: controller.signal,
        })) {
          controller.abort();
        }
      };

      await expect(consume()).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });
  });

  // ============================================================================
  // SECTION 5: POLICY ENGINE POLICY VETO BARRIER RIGOROUS CHALLENGE
  // ============================================================================
  describe("5. Policy Engine Veto Barrier Invariance", () => {
    const policy = new RakazoFreePolicyEngine();

    it("strictly forbids every known commercial model from being resolved or falling back", () => {
      const paidModels = [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "openai/gpt-oss-120b",
        "anthropic/claude-3-5-sonnet",
        "anthropic/claude-3-opus",
        "google/gemini-pro-1.5",
        "cohere/command-r-plus",
        "meta-llama/llama-3.1-405b",
      ];

      for (const model of paidModels) {
        expect(() => policy.vetoPaidFallback(model)).toThrow(
          "Capacité gratuite temporairement indisponible",
        );
      }
    });

    it("permits verified free model identifiers containing :free", () => {
      const freeModels = [
        "meta-llama/llama-3.3-70b-instruct:free",
        "qwen/qwen-2.5-coder-32b-instruct:free",
        "deepseek/deepseek-r1:free",
        "mistralai/mistral-small-24b-instruct:free",
        "google/gemini-2.0-flash-exp:free",
      ];

      for (const model of freeModels) {
        expect(() => policy.vetoPaidFallback(model)).not.toThrow();
      }
    });

    it("rejects non-array or invalid tags in resolveRoute", () => {
      expect(() => policy.resolveRoute("coding" as any)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => policy.resolveRoute(null as any)).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
      expect(() => policy.resolveRoute(["unsupported_tag" as any])).toThrow(
        "Capacité gratuite temporairement indisponible",
      );
    });
  });
});
