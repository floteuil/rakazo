import type { AgentRunRequest, ConnectorTool } from "@rakazo/adapter-kit";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InferenceTransport,
  InferenceTransportChunk,
  InferenceTransportRequest,
} from "./inference-transport.js";
import { MockOmniRouteServer } from "./omniroute-mock.js";
import { OmniRouteInferenceTransport } from "./omniroute-transport.js";
import { PiAiInferenceTransport } from "./pi-ai-transport.js";
import { CanonicalAgentRuntime, PiAgentRuntime } from "./pi-runtime.js";

describe("R1 & R2: InferenceTransport & Canonical MCP Tool Loop Test Suite", () => {
  let mockServer: MockOmniRouteServer;
  let serverUrl: string;
  const apiKey = "sk-omniroute-m1-test";

  beforeAll(async () => {
    mockServer = new MockOmniRouteServer({ apiKey });
    serverUrl = await mockServer.start();
    process.env.OMNIROUTE_BASE_URL = serverUrl;
  });

  afterAll(async () => {
    delete process.env.OMNIROUTE_BASE_URL;
    await mockServer.stop();
  });

  beforeEach(() => {
    mockServer.reset();
  });

  // ============================================================================
  // 1. OMNIROUTE INFERENCE TRANSPORT TESTS
  // ============================================================================
  describe("OmniRouteInferenceTransport", () => {
    it("initializes as a free transport with proper ID and model", () => {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: serverUrl,
        apiKey,
      });

      expect(transport.id).toBe("omniroute");
      expect(transport.isFree).toBe(true);
      expect(transport.getDefaultModel()).toBe("combo/rakazo-fast");
    });

    it("streams text chunks and injects x-session-id header", async () => {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: serverUrl,
        apiKey,
      });

      mockServer.setCustomResponse("Hello from OmniRoute transport");

      const chunks: InferenceTransportChunk[] = [];
      for await (const chunk of transport.stream({
        model: "combo/rakazo-fast",
        messages: [{ role: "user", content: "Hi" }],
        sessionId: "sess_deadbeef1234",
      })) {
        chunks.push(chunk);
      }

      const text = chunks
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");

      expect(text).toContain("Hello from OmniRoute transport");

      const lastReq = mockServer.getLastRequest();
      expect(lastReq?.headers["x-session-id"]).toBe("sess_deadbeef1234");
      expect(lastReq?.headers.authorization).toBe(`Bearer ${apiKey}`);
    });

    it("streams tool calls correctly", async () => {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: serverUrl,
        apiKey,
      });

      mockServer.setScenario("tool_call");

      const toolChunks: InferenceTransportChunk[] = [];
      for await (const chunk of transport.stream({
        model: "combo/rakazo-coding",
        messages: [{ role: "user", content: "Search for info" }],
        tools: [
          {
            name: "searxng_scraperr__web_search",
            description: "search",
            inputSchema: { type: "object" },
          },
        ],
      })) {
        if (chunk.type === "tool_call") {
          toolChunks.push(chunk);
        }
      }

      expect(toolChunks.length).toBeGreaterThan(0);
      expect(toolChunks[0]?.toolCall?.name).toBe("searxng_scraperr__web_search");
    });

    it("fails closed when cost leakage occurs in response header", async () => {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: serverUrl,
        apiKey,
      });

      mockServer.setScenario("cost_leakage");

      const consume = async () => {
        for await (const _chunk of transport.stream({
          model: "combo/rakazo-fast",
          messages: [{ role: "user", content: "Test cost" }],
        })) {
          // iterate
        }
      };

      await expect(consume()).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });

    it("fails closed when paid model is requested on free transport", async () => {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: serverUrl,
        apiKey,
      });

      const consume = async () => {
        for await (const _chunk of transport.stream({
          model: "openai/gpt-4o",
          messages: [{ role: "user", content: "Test paid veto" }],
        })) {
          // iterate
        }
      };

      await expect(consume()).rejects.toThrow("Capacité gratuite temporairement indisponible");
    });
  });

  // ============================================================================
  // 2. CANONICAL AGENT RUNTIME & UNIFIED MCP TOOL LOOP
  // ============================================================================
  describe("CanonicalAgentRuntime & Multi-Step MCP Tool Loop", () => {
    class ScriptedTransport implements InferenceTransport {
      public readonly id = "scripted-test";
      public readonly isFree = true;
      public iterations: InferenceTransportRequest[] = [];
      private responses: Array<InferenceTransportChunk[]>;
      private callCount = 0;

      constructor(responses: Array<InferenceTransportChunk[]>) {
        this.responses = responses;
      }

      async *stream(request: InferenceTransportRequest): AsyncIterable<InferenceTransportChunk> {
        this.iterations.push(request);
        const current = this.responses[this.callCount++] || [
          { type: "text", text: "Default final answer." },
        ];
        for (const chunk of current) {
          yield chunk;
        }
      }
    }

    it("executes multi-step tool call and feeds back compacted result to model", async () => {
      // Step 1: Model calls web_search
      // Step 2: Model receives tool result and produces final answer
      const scriptedTransport = new ScriptedTransport([
        [
          {
            type: "tool_call",
            toolCall: {
              id: "call_search_1",
              name: "web_search",
              arguments: JSON.stringify({ query: "vitest documentation" }),
            },
          },
        ],
        [
          {
            type: "text",
            text: "Based on Vitest documentation, it is blazing fast.",
          },
        ],
      ]);

      const runtime = new CanonicalAgentRuntime({ transport: scriptedTransport });
      const executedTools: Array<{ name: string; args: any }> = [];

      const executeTool = vi.fn(async (name: string, args: Record<string, unknown>) => {
        executedTools.push({ name, args });
        return { results: ["Vitest is a Vite-native testing framework"] };
      });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-test",
          threadId: "thread-test",
          runId: "run-test-1",
          prompt: "How fast is Vitest?",
          instructions: "You are a test assistant.",
          history: [],
          tools: [
            {
              name: "web_search",
              description: "Search the web",
              inputSchema: { type: "object", properties: { query: { type: "string" } } },
            },
          ],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-1",
          traceId: "tr-1",
          workspaceId: "ws-1",
          userId: "user-1",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      // Verify tool execution
      expect(executeTool).toHaveBeenCalledTimes(1);
      expect(executedTools[0]?.name).toBe("web_search");
      expect(executedTools[0]?.args).toEqual({ query: "vitest documentation" });

      // Verify model was called twice (iteration 0: tool call, iteration 1: synthesis)
      expect(scriptedTransport.iterations).toHaveLength(2);
      const secondRequestMessages = scriptedTransport.iterations[1]?.messages;
      expect(secondRequestMessages).toBeDefined();

      // Verify that the tool output was fed back into the context for iteration 2
      const toolResultMessage = secondRequestMessages?.find((m) => m.role === "tool");
      expect(toolResultMessage).toBeDefined();
      expect(toolResultMessage?.tool_call_id).toBe("call_search_1");
      expect(toolResultMessage?.content).toContain("Vitest");

      // Verify events emitted
      const textEvents = events
        .filter((e) => e.type === "text")
        .map((e) => e.text)
        .join("");
      expect(textEvents).toContain("Based on Vitest documentation");
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
    });

    it("enforces loop guard termination on consecutive redundant tool calls", async () => {
      // Scripted transport emits the exact same tool call repeatedly
      const redundantCall = [
        {
          type: "tool_call" as const,
          toolCall: {
            id: "call_redundant",
            name: "read_file",
            arguments: JSON.stringify({ path: "/etc/passwd" }),
          },
        },
      ];

      const scriptedTransport = new ScriptedTransport([
        redundantCall,
        redundantCall,
        redundantCall,
        redundantCall,
        redundantCall,
      ]);

      const runtime = new CanonicalAgentRuntime({ transport: scriptedTransport });
      const executeTool = vi.fn(async () => ({ content: "root:x:0:0..." }));

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-test",
          threadId: "thread-test",
          runId: "run-test-2",
          prompt: "Read the file",
          instructions: "Assistant",
          history: [],
          tools: [{ name: "read_file", description: "read", inputSchema: { type: "object" } }],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-2",
          traceId: "tr-2",
          workspaceId: "ws-2",
          userId: "user-2",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      // Must be terminated by loop guard
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent.text).toMatch(/Loop detected|Stopping redundant execution|Circuit breaker/i);
    });

    it("terminates cleanly upon request_takeover tool call", async () => {
      const scriptedTransport = new ScriptedTransport([
        [
          {
            type: "tool_call",
            toolCall: {
              id: "call_takeover",
              name: "request_takeover",
              arguments: JSON.stringify({ reason: "Please solve CAPTCHA" }),
            },
          },
        ],
      ]);

      const runtime = new CanonicalAgentRuntime({ transport: scriptedTransport });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-test",
          threadId: "thread-test",
          runId: "run-test-3",
          prompt: "Solve captcha",
          instructions: "Assistant",
          history: [],
          tools: [
            { name: "request_takeover", description: "takeover", inputSchema: { type: "object" } },
          ],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
        },
        {
          operationId: "op-3",
          traceId: "tr-3",
          workspaceId: "ws-3",
          userId: "user-3",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      const takeoverEvent = events.find((e) => e.type === "takeover");
      expect(takeoverEvent).toBeDefined();
      expect(takeoverEvent.reason).toBe("Please solve CAPTCHA");
    });
  });

  // ============================================================================
  // 3. PI AGENT RUNTIME PLUGGABILITY TEST
  // ============================================================================
  describe("PiAgentRuntime Pluggability", () => {
    it("PiAgentRuntime automatically routes omniroute provider through CanonicalAgentRuntime", async () => {
      const runtime = new PiAgentRuntime();
      mockServer.setCustomResponse("OmniRoute processed via PiAgentRuntime pluggable transport");

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-test",
          threadId: "thread-test",
          runId: "run-test-pi-omni",
          prompt: "Hello OmniRoute via PiAgentRuntime",
          instructions: "Assistant",
          history: [],
          tools: [],
          model: {
            provider: "omniroute",
            id: "combo/rakazo-fast",
            apiKey,
          },
        },
        {
          operationId: "op-pi",
          traceId: "tr-pi",
          workspaceId: "ws-pi",
          userId: "user-pi",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      const text = events
        .filter((e) => e.type === "text")
        .map((e) => e.text)
        .join("");

      expect(text).toContain("OmniRoute processed via PiAgentRuntime");
    });
  });
});
