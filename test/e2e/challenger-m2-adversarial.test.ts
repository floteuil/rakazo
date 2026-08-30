import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APPROVED_FREE_PROVIDERS,
  AVOIDED_PROVIDERS,
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  RakazoFreePolicyEngine,
} from "../../packages/adapters/src/free-policy-engine.js";
import { FreeOmniRouteAdapter } from "../../packages/adapters/src/omniroute-adapter.js";

describe("Challenger 2 Empirical Verification: M2 Zero-Provider, Fail-Closed & Premium Non-Regression", () => {
  let server: Server;
  let serverPort: number;
  let baseUrl: string;
  let currentScenario:
    | "zero_provider_401"
    | "positive_cost_header"
    | "negative_cost_header"
    | "nan_cost_header"
    | "unapproved_provider"
    | "avoided_provider"
    | "server_error_503"
    | "corrupted_sse"
    | "valid_free_zero_cost" = "zero_provider_401";

  beforeAll(async () => {
    server = createServer((req, res) => {
      // Secret check: ensure authorization header is received but not echoed
      const _auth = req.headers.authorization;
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "healthy", service: "omniroute", version: "3.8.51" }));
        return;
      }

      if (req.url === "/v1/chat/completions" || req.url === "/chat/completions") {
        let bodyStr = "";
        req.on("data", (chunk) => (bodyStr += chunk));
        req.on("end", () => {
          let _body: any = {};
          try {
            _body = JSON.parse(bodyStr);
          } catch {}

          if (currentScenario === "zero_provider_401") {
            // OmniRoute unconfigured state (PENDING PROVIDER CREDENTIALS)
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: {
                  message: "No active provider credentials configured in OmniRoute.",
                  type: "unauthorized",
                  code: "PENDING_PROVIDER_CREDENTIALS",
                },
              }),
            );
            return;
          }

          if (currentScenario === "positive_cost_header") {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "x-omniroute-cost": "0.005",
              "x-omniroute-provider": "meta-llama",
            });
            res.end(
              JSON.stringify({
                id: "chatcmpl-leak",
                choices: [{ message: { content: "Paid content leaked" } }],
                pricing: { total_cost: 0.005 },
              }),
            );
            return;
          }

          if (currentScenario === "negative_cost_header") {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "x-omniroute-cost": "-1.0",
              "x-omniroute-provider": "meta-llama",
            });
            res.end(
              JSON.stringify({
                id: "chatcmpl-neg",
                choices: [{ message: { content: "Neg cost" } }],
              }),
            );
            return;
          }

          if (currentScenario === "nan_cost_header") {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "x-omniroute-cost": "not-a-number",
              "x-omniroute-provider": "meta-llama",
            });
            res.end(
              JSON.stringify({
                id: "chatcmpl-nan",
                choices: [{ message: { content: "NaN cost" } }],
              }),
            );
            return;
          }

          if (currentScenario === "unapproved_provider") {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "x-omniroute-cost": "0.0",
              "x-omniroute-provider": "rogue_proxy_vendor",
            });
            res.end(
              JSON.stringify({
                id: "chatcmpl-rogue",
                choices: [{ message: { content: "Rogue provider" } }],
              }),
            );
            return;
          }

          if (currentScenario === "avoided_provider") {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "x-omniroute-cost": "0.0",
              "x-omniroute-provider": "tos_violating_mirror",
            });
            res.end(
              JSON.stringify({
                id: "chatcmpl-tos",
                choices: [{ message: { content: "TOS violation" } }],
              }),
            );
            return;
          }

          if (currentScenario === "server_error_503") {
            res.writeHead(503, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Service Unavailable" } }));
            return;
          }

          if (currentScenario === "corrupted_sse") {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "x-omniroute-cost": "0.0",
              "x-omniroute-provider": "meta-llama",
            });
            res.write("data: {malformed_json\n\n");
            res.write('data: {"choices":[{"delta":{"content":"valid"}}]}\n\n');
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }

          if (currentScenario === "valid_free_zero_cost") {
            res.writeHead(200, {
              "Content-Type": "application/json",
              "x-omniroute-cost": "0.0",
              "x-omniroute-provider": "meta-llama",
            });
            res.end(
              JSON.stringify({
                id: "chatcmpl-free-ok",
                model: "meta-llama/llama-3.3-70b-instruct:free",
                choices: [{ message: { role: "assistant", content: "Zero-cost free response." } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              }),
            );
            return;
          }

          res.writeHead(404);
          res.end();
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          serverPort = addr.port;
          baseUrl = `http://127.0.0.1:${serverPort}/v1`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ==========================================================================
  // 1. EMPIRICAL TEST: Zero-Provider State Invariant
  // ==========================================================================
  it("Challenge 1: Zero-provider unconfigured OmniRoute (HTTP 401) triggers clean fail-closed error", async () => {
    currentScenario = "zero_provider_401";
    const adapter = new FreeOmniRouteAdapter({ baseUrl, apiKey: "sk-rakazo-test" });

    // complete() must throw EXACT French fail-closed message
    await expect(
      adapter.complete({
        messages: [{ role: "user", content: "Hello Free Agent" }],
      }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

    // stream() must also throw EXACT French fail-closed message
    const streamCall = async () => {
      for await (const _chunk of adapter.stream({
        messages: [{ role: "user", content: "Stream test" }],
      })) {
        // Should not reach here
      }
    };
    await expect(streamCall()).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
  });

  // ==========================================================================
  // 2. EMPIRICAL TEST: Cost Leakage & Financial Invariant Stress-Testing
  // ==========================================================================
  it("Challenge 2: Injected positive, negative, and NaN cost headers trigger fail-closed veto", async () => {
    const adapter = new FreeOmniRouteAdapter({ baseUrl, apiKey: "sk-rakazo-test" });

    // Positive cost
    currentScenario = "positive_cost_header";
    await expect(
      adapter.complete({ messages: [{ role: "user", content: "test" }] }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

    // Negative cost
    currentScenario = "negative_cost_header";
    await expect(
      adapter.complete({ messages: [{ role: "user", content: "test" }] }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

    // NaN cost
    currentScenario = "nan_cost_header";
    await expect(
      adapter.complete({ messages: [{ role: "user", content: "test" }] }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
  });

  // ==========================================================================
  // 3. EMPIRICAL TEST: Provider Whitelist & Avoided Mirror Barriers
  // ==========================================================================
  it("Challenge 3: Unapproved or avoided upstream providers are blocked fail-closed", async () => {
    const adapter = new FreeOmniRouteAdapter({ baseUrl, apiKey: "sk-rakazo-test" });

    currentScenario = "unapproved_provider";
    await expect(
      adapter.complete({ messages: [{ role: "user", content: "test" }] }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);

    currentScenario = "avoided_provider";
    await expect(
      adapter.complete({ messages: [{ role: "user", content: "test" }] }),
    ).rejects.toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
  });

  // ==========================================================================
  // 4. EMPIRICAL TEST: Strict Paid Fallback Veto (Policy Engine)
  // ==========================================================================
  it("Challenge 4: FreePolicyEngine vetoes all commercial and paid model requests", () => {
    const policy = new RakazoFreePolicyEngine();

    // Direct paid models
    expect(() => policy.vetoPaidFallback("openai/gpt-oss-120b")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
    expect(() => policy.vetoPaidFallback("openai/gpt-4o")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
    expect(() => policy.vetoPaidFallback("anthropic/claude-3.5-sonnet")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
    expect(() => policy.vetoPaidFallback("anthropic/claude-3-opus")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );

    // Mixed/tricky case variants
    expect(() => policy.vetoPaidFallback("GPT-4-turbo")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );
    expect(() => policy.vetoPaidFallback("Claude-3-Sonnet-20240229")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );

    // Non-free generic models
    expect(() => policy.vetoPaidFallback("meta-llama/llama-3.3-70b-instruct")).toThrow(
      FREE_INFERENCE_UNAVAILABLE_MESSAGE,
    );

    // Valid free model should succeed
    expect(() => policy.vetoPaidFallback("meta-llama/llama-3.3-70b-instruct:free")).not.toThrow();
    expect(() => policy.vetoPaidFallback("qwen/qwen-2.5-coder-32b-instruct:free")).not.toThrow();
  });

  // ==========================================================================
  // 5. EMPIRICAL TEST: Tag Routing & Invariant Cost Assertion
  // ==========================================================================
  it("Challenge 5: Usage tag routing resolves approved zero-cost free models for all tags", () => {
    const policy = new RakazoFreePolicyEngine();
    const tags = ["coding", "writing", "reasoning", "fast", "analysis"] as const;

    for (const tag of tags) {
      const decision = policy.resolveRoute([tag]);
      expect(decision.isFree).toBe(true);
      expect(decision.costPerToken).toBe(0.0);
      expect(decision.model).toMatch(/combo\/rakazo-|:free/);
      expect(APPROVED_FREE_PROVIDERS).toContain(decision.provider as any);
      expect(AVOIDED_PROVIDERS).not.toContain(decision.provider as any);
    }

    // Default route
    const defaultDecision = policy.resolveRoute([]);
    expect(defaultDecision.isFree).toBe(true);
    expect(defaultDecision.costPerToken).toBe(0.0);
    expect(defaultDecision.model).toMatch(/combo\/rakazo-fast|meta-llama\/llama-3.3-70b-instruct:free/);
  });

  // ==========================================================================
  // 6. EMPIRICAL TEST: Corrupted SSE Stream Fault Tolerance
  // ==========================================================================
  it("Challenge 6: Corrupted SSE chunk is ignored without terminating valid stream tokens", async () => {
    currentScenario = "corrupted_sse";
    const adapter = new FreeOmniRouteAdapter({ baseUrl, apiKey: "sk-rakazo-test" });

    const chunks: string[] = [];
    for await (const chunk of adapter.stream({
      messages: [{ role: "user", content: "test corrupted stream" }],
    })) {
      if (chunk.content) chunks.push(chunk.content);
    }

    expect(chunks).toContain("valid");
  });

  // ==========================================================================
  // 7. EMPIRICAL TEST: Happy Path Free Inference (Zero Cost $0.0000)
  // ==========================================================================
  it("Challenge 7: Legitimate free inference with 0 cost completes successfully", async () => {
    currentScenario = "valid_free_zero_cost";
    const adapter = new FreeOmniRouteAdapter({ baseUrl, apiKey: "sk-rakazo-test" });

    const result = await adapter.complete({
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.content).toBe("Zero-cost free response.");
    expect(result.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(result.usage?.totalTokens).toBe(15);
  });

  // ==========================================================================
  // 8. EMPIRICAL TEST: Total Network Outage / Unreachable Host
  // ==========================================================================
  it("Challenge 8: Network timeout / connection refusal fails closed cleanly without secret leak", async () => {
    const deadAdapter = new FreeOmniRouteAdapter({
      baseUrl: "http://127.0.0.1:59998/v1",
      apiKey: "sk-secret-key-that-must-not-leak",
      timeoutMs: 300,
    });

    try {
      await deadAdapter.complete({
        messages: [{ role: "user", content: "Dead server test" }],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toBe(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(err.message).not.toContain("sk-secret-key-that-must-not-leak");
      expect(err.message).not.toContain("59998");
    }
  });
});
