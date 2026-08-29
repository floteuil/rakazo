import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  FreeOmniRouteAdapter,
  type OmniRouteChatMessage,
} from "./omniroute-adapter.js";
import { MockOmniRouteServer } from "./omniroute-mock.js";

async function getAdapter(baseUrl: string, apiKey: string) {
  return new FreeOmniRouteAdapter({ baseUrl, apiKey });
}

describe("FreeOmniRouteAdapter E2E & Unit Test Suite (Tiers 1, 2, 4)", () => {
  let mockServer: MockOmniRouteServer;
  let serverUrl: string;
  const apiKey = "sk-omniroute-test-key";

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
  // TIER 1: FEATURE COVERAGE (Adapter Core, SSE Streaming, Auth, Tools)
  // ============================================================================
  describe("Tier 1 - Core Adapter Feature Coverage", () => {
    it("initializes with baseUrl and apiKey properly", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      expect(adapter.getBaseUrl()).toBe(serverUrl);
      expect(adapter.getDefaultModel()).toContain("meta-llama");
    });

    it("performs non-streaming complete() call and receives message content", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setCustomResponse("Bonjour, je suis un modèle gratuit.");

      const res = await adapter.complete({
        messages: [{ role: "user", content: "Dis bonjour" }],
      });

      expect(res.content).toBe("Bonjour, je suis un modèle gratuit.");
      expect(res.toolCalls).toEqual([]);
      expect(mockServer.getRecordedRequests()).toHaveLength(1);

      const lastReq = mockServer.getLastRequest();
      expect(lastReq?.headers.authorization).toBe(`Bearer ${apiKey}`);
      expect(lastReq?.body.stream).toBe(false);
    });

    it("streams response chunks incrementally via async generator", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setCustomResponse("OmniRoute streaming intelligence test");

      const chunks: string[] = [];
      for await (const chunk of adapter.stream({
        messages: [{ role: "user", content: "Test streaming" }],
      })) {
        if (chunk.content) {
          chunks.push(chunk.content);
        }
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join("")).toContain("OmniRoute streaming intelligence test");
    });

    it("handles tool calling in streaming responses", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setScenario("tool_call");

      const toolCallsAccumulated: any[] = [];
      for await (const chunk of adapter.stream({
        messages: [{ role: "user", content: "Recherche les dernières actualités" }],
        tools: [{ type: "function", function: { name: "searxng_scraperr__web_search" } }],
      })) {
        if (chunk.toolCalls) {
          toolCallsAccumulated.push(...chunk.toolCalls);
        }
      }

      expect(toolCallsAccumulated.length).toBeGreaterThan(0);
      expect(toolCallsAccumulated[0].function.name).toBe("searxng_scraperr__web_search");
    });

    it("passes system prompt and conversation history correctly to mock gateway", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      const messages: OmniRouteChatMessage[] = [
        { role: "system", content: "You are a coding assistant." },
        { role: "user", content: "Write a hello world function." },
      ];

      await adapter.complete({ messages });

      const lastReq = mockServer.getLastRequest();
      expect(lastReq?.body.messages).toHaveLength(2);
      expect(lastReq?.body.messages[0].content).toBe("You are a coding assistant.");
      expect(lastReq?.body.messages[1].content).toBe("Write a hello world function.");
    });
  });

  // ============================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Timeouts, AbortSignal, Errors, Fail-Closed)
  // ============================================================================
  describe("Tier 2 - Boundary Cases & Fail-Closed Errors", () => {
    it("fails closed with 401 when API key is invalid or rejected", async () => {
      mockServer.setScenario("auth_error");
      const adapter = await getAdapter(serverUrl, "invalid-key");

      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("fails closed on HTTP 429 rate limit without leaking paid fallback", async () => {
      mockServer.setScenario("rate_limit");
      const adapter = await getAdapter(serverUrl, apiKey);

      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Rate limit test" }],
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("fails closed on HTTP 503 server error", async () => {
      mockServer.setScenario("server_error");
      const adapter = await getAdapter(serverUrl, apiKey);

      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Server down test" }],
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("handles pre-aborted AbortSignal immediately", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      const controller = new AbortController();
      controller.abort();

      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Abort me" }],
          signal: controller.signal,
        }),
      ).rejects.toThrow();
    });

    it("handles AbortSignal triggered during streaming", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setCustomResponse("Long sentence with many tokens to cancel mid stream");
      mockServer.setDelay(20);

      const controller = new AbortController();

      const consumeStream = async () => {
        let count = 0;
        for await (const _chunk of adapter.stream({
          messages: [{ role: "user", content: "Stream cancel" }],
          signal: controller.signal,
        })) {
          count++;
          if (count >= 1) {
            controller.abort();
          }
        }
      };

      await expect(consumeStream()).rejects.toThrow();
    });

    it("enforces timeout and rejects when server stalls", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setScenario("timeout_simulation");

      await expect(
        adapter.complete({
          messages: [{ role: "user", content: "Stall test" }],
          timeoutMs: 100,
        }),
      ).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("rejects immediately if positive cost is injected in streaming chunk", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setScenario("cost_leakage");

      const streamTest = async () => {
        for await (const _chunk of adapter.stream({
          messages: [{ role: "user", content: "Cost leakage test" }],
        })) {
          // should throw
        }
      };

      await expect(streamTest()).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });
  });

  // ============================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ============================================================================
  describe("Tier 4 - Real-World Application Scenarios", () => {
    it("Scenario 1: Coding Bot writes a TypeScript utility function", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      const codeResponse =
        "```typescript\nexport function add(a: number, b: number): number {\n  return a + b;\n}\n```";
      mockServer.setCustomResponse(codeResponse);

      const result = await adapter.complete({
        model: "qwen/qwen-2.5-coder-32b-instruct:free",
        messages: [
          { role: "system", content: "You are an expert TypeScript developer." },
          { role: "user", content: "Write a function to add two numbers." },
        ],
      });

      expect(result.content).toContain("export function add");
      expect(result.content).toContain("```typescript");
    });

    it("Scenario 2: Analysis Bot orchestrates multi-step tool call and synthesis", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setScenario("tool_call");

      const res = await adapter.complete({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [{ role: "user", content: "Analyze AI security vulnerabilities." }],
      });

      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls[0].function.name).toBe("searxng_scraperr__web_search");
    });

    it("Scenario 3: Multi-turn conversation retains context across queries", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setCustomResponse("Le résultat précédent était 42.");

      const history: OmniRouteChatMessage[] = [
        { role: "user", content: "Quel est le sens de la vie ?" },
        { role: "assistant", content: "C'est 42." },
        { role: "user", content: "Rappelle-moi le nombre." },
      ];

      const res = await adapter.complete({ messages: history });
      expect(res.content).toContain("42");

      const req = mockServer.getLastRequest();
      expect(req?.body.messages).toHaveLength(3);
    });

    it("Scenario 4: Fast triage bot responds with low latency", async () => {
      const adapter = await getAdapter(serverUrl, apiKey);
      mockServer.setCustomResponse("ACK: Tâche indexée.");

      const startTime = Date.now();
      const res = await adapter.complete({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        messages: [{ role: "user", content: "PING" }],
      });
      const duration = Date.now() - startTime;

      expect(res.content).toBe("ACK: Tâche indexée.");
      expect(duration).toBeLessThan(1000);
    });
  });
});
