import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunRequest, ConnectorTool } from "@rakazo/adapter-kit";
import {
  type InferenceTransport,
  type InferenceTransportChunk,
  type InferenceTransportRequest,
} from "./inference-transport.js";
import {
  computeToolCallSignature,
  createToolCallTracker,
  evaluateToolCallGuard,
  MAX_CONSECUTIVE_REDUNDANT_CALLS,
  MAX_TOOL_ITERATIONS_PER_TURN,
} from "./loop-guards.js";
import { MockOmniRouteServer } from "./omniroute-mock.js";
import { OmniRouteInferenceTransport } from "./omniroute-transport.js";
import { CanonicalAgentRuntime, PiAgentRuntime } from "./pi-runtime.js";
import {
  FREE_INFERENCE_UNAVAILABLE_MESSAGE,
  RakazoFreePolicyEngine,
  resolveDeterministicTag,
  TAG_PRIORITY_WEIGHTS,
} from "./free-policy-engine.js";

/**
 * Scripted Mock Transport for deterministic multi-turn simulation
 */
class ScriptedMockTransport implements InferenceTransport {
  public readonly id = "scripted-mock-transport";
  public readonly isFree = true;
  public requests: InferenceTransportRequest[] = [];
  private stepGenerator: (
    req: InferenceTransportRequest,
    index: number,
  ) => AsyncIterable<InferenceTransportChunk> | InferenceTransportChunk[];
  private callCount = 0;

  constructor(
    stepGenerator: (
      req: InferenceTransportRequest,
      index: number,
    ) => AsyncIterable<InferenceTransportChunk> | InferenceTransportChunk[],
  ) {
    this.stepGenerator = stepGenerator;
  }

  public getCallCount(): number {
    return this.callCount;
  }

  async *stream(
    request: InferenceTransportRequest,
  ): AsyncIterable<InferenceTransportChunk> {
    const currentIndex = this.callCount++;
    this.requests.push(request);
    const result = this.stepGenerator(request, currentIndex);

    if (Symbol.asyncIterator in Object(result)) {
      for await (const chunk of result as AsyncIterable<InferenceTransportChunk>) {
        if (request.signal?.aborted) {
          return;
        }
        yield chunk;
      }
    } else {
      for (const chunk of result as InferenceTransportChunk[]) {
        if (request.signal?.aborted) {
          return;
        }
        yield chunk;
      }
    }
  }
}

describe("Empirical Challenger M1: Hardened Stress Suite", () => {
  // ============================================================================
  // DIMENSION 1: MULTI-STEP TOOL LOOPS (5 SEQUENTIAL CALLS & CONTEXT FEEDBACK)
  // ============================================================================
  describe("Dimension 1: Multi-Step Sequential MCP Tool Loops", () => {
    it("executes 5 sequential tool calls feeding back intermediate outputs into context", async () => {
      const executedSteps: Array<{ name: string; args: any; callId: string }> =
        [];

      // Mock transport that drives 5 consecutive distinct steps and then completes
      const transport = new ScriptedMockTransport((req, stepIndex) => {
        if (stepIndex < 5) {
          const stepNum = stepIndex + 1;
          return [
            {
              type: "text",
              text: `Thinking about step ${stepNum}...`,
            },
            {
              type: "tool_call",
              toolCall: {
                id: `call_step_${stepNum}`,
                name: `workflow_step_${stepNum}`,
                arguments: JSON.stringify({
                  stage: stepNum,
                  inputPayload: `data_for_step_${stepNum}`,
                }),
              },
            },
          ];
        }
        // Step index 5 (after 5 tool iterations): Final synthesis
        return [
          {
            type: "text",
            text: "Final synthesis: Successfully completed all 5 pipeline stages.",
          },
          {
            type: "usage",
            usage: {
              inputTokens: 1200,
              outputTokens: 350,
              cachedTokens: 800,
              totalTokens: 1550,
            },
          },
        ];
      });

      const runtime = new CanonicalAgentRuntime({ transport });

      const executeTool = vi.fn(
        async (name: string, args: Record<string, unknown>, id: string) => {
          executedSteps.push({ name, args, callId: id });
          return {
            status: "ok",
            stage: args.stage,
            output: `result_from_${name}`,
          };
        },
      );

      const tools: ConnectorTool[] = [1, 2, 3, 4, 5].map((i) => ({
        name: `workflow_step_${i}`,
        description: `Executes stage ${i}`,
        inputSchema: {
          type: "object",
          properties: {
            stage: { type: "number" },
            inputPayload: { type: "string" },
          },
        },
      }));

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-pipeline",
          threadId: "thread-pipeline-5step",
          runId: "run-pipeline-1",
          prompt: "Execute 5-stage data processing pipeline",
          instructions: "Follow sequential pipeline.",
          history: [],
          tools,
          model: { provider: "omniroute", id: "combo/rakazo-coding" },
          executeTool,
        },
        {
          operationId: "op-pipe-1",
          traceId: "tr-pipe-1",
          workspaceId: "ws-pipe",
          userId: "user-pipe",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      // 1. Verify all 5 tools executed in order
      expect(executedSteps).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(executedSteps[i]?.name).toBe(`workflow_step_${i + 1}`);
        expect(executedSteps[i]?.args).toEqual({
          stage: i + 1,
          inputPayload: `data_for_step_${i + 1}`,
        });
        expect(executedSteps[i]?.callId).toBe(`call_step_${i + 1}`);
      }

      // 2. Verify transport was invoked 6 times (5 tool turns + 1 final turn)
      expect(transport.getCallCount()).toBe(6);

      // 3. Verify context feedback: On iteration 5, messages contains all previous tool calls and results
      const finalRequest = transport.requests[5];
      expect(finalRequest).toBeDefined();
      const messages = finalRequest!.messages;

      // Filter tool result messages
      const toolResults = messages.filter((m) => m.role === "tool");
      expect(toolResults).toHaveLength(5);
      toolResults.forEach((tr, idx) => {
        expect(tr.tool_call_id).toBe(`call_step_${idx + 1}`);
        expect(tr.name).toBe(`workflow_step_${idx + 1}`);
        expect(tr.content).toContain(`result_from_workflow_step_${idx + 1}`);
      });

      // Filter assistant messages containing tool_calls
      const assistantToolCalls = messages.filter(
        (m) => m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0,
      );
      expect(assistantToolCalls).toHaveLength(5);

      // 4. Verify runtime event stream
      const toolEvents = events.filter((e) => e.type === "tool");
      expect(toolEvents).toHaveLength(5);
      expect(toolEvents.map((e) => e.name)).toEqual([
        "workflow_step_1",
        "workflow_step_2",
        "workflow_step_3",
        "workflow_step_4",
        "workflow_step_5",
      ]);

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent.text).toContain("Successfully completed all 5 pipeline stages");
    });

    it("handles multiple parallel tool calls emitted in a single turn", async () => {
      const executed: string[] = [];

      const transport = new ScriptedMockTransport((req, stepIndex) => {
        if (stepIndex === 0) {
          return [
            {
              type: "tool_call",
              toolCall: {
                id: "call_batch_a",
                index: 0,
                name: "fetch_alpha",
                arguments: JSON.stringify({ key: "alpha" }),
              },
            },
            {
              type: "tool_call",
              toolCall: {
                id: "call_batch_b",
                index: 1,
                name: "fetch_beta",
                arguments: JSON.stringify({ key: "beta" }),
              },
            },
          ];
        }
        return [
          {
            type: "text",
            text: "Aggregated alpha and beta successfully.",
          },
        ];
      });

      const runtime = new CanonicalAgentRuntime({ transport });
      const executeTool = vi.fn(async (name: string) => {
        executed.push(name);
        return { data: `data_${name}` };
      });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-batch",
          threadId: "thread-batch",
          runId: "run-batch-1",
          prompt: "Batch fetch",
          instructions: "Assistant",
          history: [],
          tools: [
            { name: "fetch_alpha", description: "a", inputSchema: { type: "object" } },
            { name: "fetch_beta", description: "b", inputSchema: { type: "object" } },
          ],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-batch",
          traceId: "tr-batch",
          workspaceId: "ws-batch",
          userId: "user-batch",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      expect(executed).toEqual(["fetch_alpha", "fetch_beta"]);
      expect(transport.getCallCount()).toBe(2);

      const secondReq = transport.requests[1]!;
      const toolResults = secondReq.messages.filter((m) => m.role === "tool");
      expect(toolResults).toHaveLength(2);
      expect(toolResults[0]?.tool_call_id).toBe("call_batch_a");
      expect(toolResults[1]?.tool_call_id).toBe("call_batch_b");
    });

    it("sanitizes secrets in tool execution errors and feeds back sanitized error to model", async () => {
      const transport = new ScriptedMockTransport((req, stepIndex) => {
        if (stepIndex === 0) {
          return [
            {
              type: "tool_call",
              toolCall: {
                id: "call_err_1",
                name: "failing_secret_tool",
                arguments: JSON.stringify({ action: "sync" }),
              },
            },
          ];
        }
        return [
          {
            type: "text",
            text: "Model handled the error gracefully.",
          },
        ];
      });

      const runtime = new CanonicalAgentRuntime({ transport });
      const executeTool = vi.fn(async () => {
        throw new Error("GitHub error with ghp_SecretPAT1234567890 on postgres://user:pass123@db:5432/app");
      });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-err",
          threadId: "thread-err",
          runId: "run-err-1",
          prompt: "Sync data",
          instructions: "Assistant",
          history: [],
          tools: [{ name: "failing_secret_tool", description: "err", inputSchema: { type: "object" } }],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-err",
          traceId: "tr-err",
          workspaceId: "ws-err",
          userId: "user-err",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      const secondReq = transport.requests[1]!;
      const toolErrorMsg = secondReq.messages.find((m) => m.role === "tool");
      expect(toolErrorMsg).toBeDefined();
      expect(toolErrorMsg?.content).toContain("ghp_[redacted]");
      expect(toolErrorMsg?.content).toContain("postgres://user:[redacted]@db:5432/app");
      expect(toolErrorMsg?.content).not.toContain("ghp_SecretPAT1234567890");
      expect(toolErrorMsg?.content).not.toContain("pass123");
    });
  });

  // ============================================================================
  // DIMENSION 2: CIRCUIT BREAKER TRIP AT ITERATION > 25
  // ============================================================================
  describe("Dimension 2: Circuit Breaker Trip at Iteration > 25", () => {
    it("terminates a runaway agent loop when reaching 25 tool iterations without infinite hanging", async () => {
      let executedCount = 0;

      // Transport that always requests a new tool call with unique args (avoiding redundancy detector)
      const transport = new ScriptedMockTransport((req, stepIndex) => {
        return [
          {
            type: "tool_call",
            toolCall: {
              id: `call_infinite_${stepIndex}`,
              name: "read_sector",
              arguments: JSON.stringify({ sectorId: stepIndex }),
            },
          },
        ];
      });

      const runtime = new CanonicalAgentRuntime({ transport });
      const executeTool = vi.fn(async () => {
        executedCount++;
        return { status: "sector_read" };
      });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-runaway",
          threadId: "thread-runaway",
          runId: "run-runaway-1",
          prompt: "Infinite sector scan",
          instructions: "Assistant",
          history: [],
          tools: [{ name: "read_sector", description: "scan", inputSchema: { type: "object" } }],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-runaway",
          traceId: "tr-runaway",
          workspaceId: "ws-runaway",
          userId: "user-runaway",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      // Loop must stop when iteration counter reaches MAX_TOOL_ITERATIONS_PER_TURN (25)
      expect(executedCount).toBeLessThanOrEqual(25);
      expect(transport.getCallCount()).toBeLessThanOrEqual(26);

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent.text).toMatch(/iteration limit reached|Circuit breaker triggered/i);
    });

    it("verifies evaluateToolCallGuard contract boundary: step 25 passes, step 26 terminates", () => {
      const tracker = createToolCallTracker();

      for (let i = 1; i <= 25; i++) {
        const guard = evaluateToolCallGuard(tracker, "read_node", { id: i });
        expect(guard.allow).toBe(true);
        expect(tracker.stepCount).toBe(i);
      }

      const overLimitGuard = evaluateToolCallGuard(tracker, "read_node", { id: 26 });
      expect(overLimitGuard.allow).toBe(false);
      if (!overLimitGuard.allow) {
        expect(overLimitGuard.terminate).toBe(true);
        expect(overLimitGuard.reason).toContain("Circuit breaker");
        expect(overLimitGuard.reason).toContain("25");
      }
    });

    it("trips circuit breaker even when parallel tool calls are executed in fewer iterations", () => {
      const tracker = createToolCallTracker();

      // 13 turns of 2 parallel calls = 26 total tool execution steps
      for (let turn = 1; turn <= 12; turn++) {
        const g1 = evaluateToolCallGuard(tracker, `tool_t${turn}_1`, { idx: 1 });
        const g2 = evaluateToolCallGuard(tracker, `tool_t${turn}_2`, { idx: 2 });
        expect(g1.allow).toBe(true);
        expect(g2.allow).toBe(true);
      }
      expect(tracker.stepCount).toBe(24);

      // Turn 13: Step 25 allowed
      const g25 = evaluateToolCallGuard(tracker, "tool_t13_1", { idx: 1 });
      expect(g25.allow).toBe(true);
      expect(tracker.stepCount).toBe(25);

      // Step 26 blocked by circuit breaker
      const g26 = evaluateToolCallGuard(tracker, "tool_t13_2", { idx: 2 });
      expect(g26.allow).toBe(false);
      if (!g26.allow) {
        expect(g26.terminate).toBe(true);
        expect(g26.reason).toContain("25");
      }
    });
  });

  // ============================================================================
  // DIMENSION 3: REDUNDANCY DETECTOR TRIP ON 3 CONSECUTIVE IDENTICAL CALLS
  // ============================================================================
  describe("Dimension 3: Redundancy Detector on 3 Consecutive Identical Calls", () => {
    it("trips immediately on 3rd consecutive identical tool call and halts runtime", async () => {
      let toolExecutionCount = 0;

      // Transport repeatedly emits identical tool call
      const transport = new ScriptedMockTransport(() => [
        {
          type: "tool_call",
          toolCall: {
            id: "call_stuck",
            name: "ping_service",
            arguments: JSON.stringify({ host: "10.0.0.1", port: 8080 }),
          },
        },
      ]);

      const runtime = new CanonicalAgentRuntime({ transport });
      const executeTool = vi.fn(async () => {
        toolExecutionCount++;
        return { ping: "failed_timeout" };
      });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-stuck",
          threadId: "thread-stuck",
          runId: "run-stuck-1",
          prompt: "Ping service",
          instructions: "Assistant",
          history: [],
          tools: [{ name: "ping_service", description: "ping", inputSchema: { type: "object" } }],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-stuck",
          traceId: "tr-stuck",
          workspaceId: "ws-stuck",
          userId: "user-stuck",
          signal: new AbortController().signal,
        },
      )) {
        events.push(event);
      }

      // Calls 1 & 2 execute the tool. Call 3 is intercepted by guard before execution!
      expect(toolExecutionCount).toBe(2);
      expect(executeTool).toHaveBeenCalledTimes(2);

      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toBeDefined();
      expect(doneEvent.text).toContain("Loop detected");
      expect(doneEvent.text).toContain("3 consecutive times with identical arguments");
    });

    it("detects identical calls despite deeply nested key permutations via canonical JSON hashing", () => {
      const tracker = createToolCallTracker();

      const obj1 = {
        filter: { status: "active", tags: ["a", "b"], meta: { z: 1, a: 2 } },
        query: "SELECT *",
        limit: 50,
      };

      const obj2 = {
        limit: 50,
        query: "SELECT *",
        filter: { meta: { a: 2, z: 1 }, tags: ["a", "b"], status: "active" },
      };

      const obj3 = {
        query: "SELECT *",
        filter: { tags: ["a", "b"], status: "active", meta: { z: 1, a: 2 } },
        limit: 50,
      };

      const sig1 = computeToolCallSignature("database_query", obj1);
      const sig2 = computeToolCallSignature("database_query", obj2);
      const sig3 = computeToolCallSignature("database_query", obj3);

      expect(sig1).toBe(sig2);
      expect(sig2).toBe(sig3);

      // Evaluate 3 consecutive calls with permutated keys
      expect(evaluateToolCallGuard(tracker, "database_query", obj1).allow).toBe(true);
      expect(evaluateToolCallGuard(tracker, "database_query", obj2).allow).toBe(true);

      const thirdGuard = evaluateToolCallGuard(tracker, "database_query", obj3);
      expect(thirdGuard.allow).toBe(false);
      if (!thirdGuard.allow) {
        expect(thirdGuard.terminate).toBe(true);
        expect(thirdGuard.reason).toContain("Loop detected");
      }
    });

    it("resets redundancy streak when a different tool call intervenes", () => {
      const tracker = createToolCallTracker();

      // Tool A (1)
      expect(evaluateToolCallGuard(tracker, "tool_A", { id: 1 }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Tool A (2)
      expect(evaluateToolCallGuard(tracker, "tool_A", { id: 1 }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      // Tool B intervenes (resets streak to 1)
      expect(evaluateToolCallGuard(tracker, "tool_B", { id: 1 }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Tool A again (fresh streak 1)
      expect(evaluateToolCallGuard(tracker, "tool_A", { id: 1 }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(1);

      // Tool A (2)
      expect(evaluateToolCallGuard(tracker, "tool_A", { id: 1 }).allow).toBe(true);
      expect(tracker.consecutiveSameCallCount).toBe(2);

      // Tool A (3) -> Trips!
      const trip = evaluateToolCallGuard(tracker, "tool_A", { id: 1 });
      expect(trip.allow).toBe(false);
    });
  });

  // ============================================================================
  // DIMENSION 4: ABORTSIGNAL IMMEDIATE CANCELLATION DURING STREAMING
  // ============================================================================
  describe("Dimension 4: AbortSignal Immediate Cancellation During Streaming", () => {
    it("halts immediately without calling transport when signal is pre-aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      const transport = new ScriptedMockTransport(() => [
        { type: "text", text: "Should never be reached" },
      ]);

      const runtime = new CanonicalAgentRuntime({ transport });
      const events: any[] = [];

      for await (const event of runtime.run(
        {
          botId: "bot-abort",
          threadId: "thread-abort",
          runId: "run-abort-pre",
          prompt: "Pre-aborted test",
          instructions: "Assistant",
          history: [],
          tools: [],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
        },
        {
          operationId: "op-abort",
          traceId: "tr-abort",
          workspaceId: "ws-abort",
          userId: "user-abort",
          signal: controller.signal,
        },
      )) {
        events.push(event);
      }

      expect(transport.getCallCount()).toBe(0);
      expect(events).toEqual([{ type: "done", text: "stopped" }]);
    });

    it("stops streaming immediately when signal is aborted mid-stream during chunk generation", async () => {
      const controller = new AbortController();

      // Async generator that streams chunks with simulated delay
      async function* streamingChunks(signal: AbortSignal): AsyncIterable<InferenceTransportChunk> {
        yield { type: "text", text: "Chunk 1..." };
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (signal.aborted) return;
        yield { type: "text", text: "Chunk 2..." };
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (signal.aborted) return;
        yield { type: "text", text: "Chunk 3..." };
      }

      const transport = new ScriptedMockTransport((req) => streamingChunks(req.signal!));
      const runtime = new CanonicalAgentRuntime({ transport });

      const events: any[] = [];
      const runPromise = (async () => {
        for await (const event of runtime.run(
          {
            botId: "bot-abort-mid",
            threadId: "thread-abort-mid",
            runId: "run-abort-mid-1",
            prompt: "Mid-stream abort test",
            instructions: "Assistant",
            history: [],
            tools: [],
            model: { provider: "omniroute", id: "combo/rakazo-fast" },
          },
          {
            operationId: "op-abort-mid",
            traceId: "tr-abort-mid",
            workspaceId: "ws-abort-mid",
            userId: "user-abort-mid",
            signal: controller.signal,
          },
        )) {
          events.push(event);
          if (event.type === "text" && event.text?.includes("Chunk 1")) {
            // Trigger abort immediately after receiving first chunk
            controller.abort();
          }
        }
      })();

      await runPromise;

      const lastEvent = events[events.length - 1];
      expect(lastEvent).toEqual({ type: "done", text: "stopped" });
      const textEvents = events.filter((e) => e.type === "text").map((e) => e.text).join("");
      expect(textEvents).not.toContain("Chunk 3");
    });

    it("aborts long-running tool execution promptly on cancellation signal", async () => {
      const controller = new AbortController();

      const transport = new ScriptedMockTransport(() => [
        {
          type: "tool_call",
          toolCall: {
            id: "call_slow",
            name: "slow_computation",
            arguments: JSON.stringify({ durationMs: 200 }),
          },
        },
      ]);

      const runtime = new CanonicalAgentRuntime({ transport });

      const executeTool = vi.fn(async () => {
        // Abort during tool execution
        controller.abort();
        return { result: "done_slow" };
      });

      const events: any[] = [];
      for await (const event of runtime.run(
        {
          botId: "bot-slow",
          threadId: "thread-slow",
          runId: "run-slow-1",
          prompt: "Run slow tool",
          instructions: "Assistant",
          history: [],
          tools: [{ name: "slow_computation", description: "slow", inputSchema: { type: "object" } }],
          model: { provider: "omniroute", id: "combo/rakazo-fast" },
          executeTool,
        },
        {
          operationId: "op-slow",
          traceId: "tr-slow",
          workspaceId: "ws-slow",
          userId: "user-slow",
          signal: controller.signal,
        },
      )) {
        events.push(event);
      }

      // Next turn is prevented by abort signal
      expect(transport.getCallCount()).toBe(1);
      const doneEvent = events.find((e) => e.type === "done");
      expect(doneEvent).toEqual({ type: "done", text: "stopped" });
    });

    it("propagates AbortSignal into OmniRouteInferenceTransport and stops reader cleanly", async () => {
      const mockServer = new MockOmniRouteServer({ apiKey: "sk-test" });
      const url = await mockServer.start();

      try {
        const transport = new OmniRouteInferenceTransport({
          baseUrl: url,
          apiKey: "sk-test",
        });

        const controller = new AbortController();
        controller.abort();

        const consume = async () => {
          for await (const _chunk of transport.stream({
            model: "combo/rakazo-fast",
            messages: [{ role: "user", content: "Test" }],
            signal: controller.signal,
          })) {
            // should not yield
          }
        };

        await expect(consume()).rejects.toThrow(/Request aborted/i);
      } finally {
        await mockServer.stop();
      }
    });
  });

  // ============================================================================
  // DIMENSION 5: DETERMINISTIC COGNITIVE PRIORITY ROUTING & ZERO-COST BARRIER
  // ============================================================================
  describe("Dimension 5: Deterministic Cognitive Priority Routing & Zero-Cost Policy", () => {
    const engine = new RakazoFreePolicyEngine();

    it("resolves multi-tag routing deterministically regardless of input tag permutation", () => {
      // reasoning (100) > coding (80) > analysis (60) > writing (40) > fast (20)
      const p1 = engine.resolveRoute(["fast", "coding"]);
      const p2 = engine.resolveRoute(["coding", "fast"]);
      expect(p1.model).toBe("combo/rakazo-coding");
      expect(p2.model).toBe("combo/rakazo-coding");

      const p3 = engine.resolveRoute(["writing", "reasoning", "fast"]);
      const p4 = engine.resolveRoute(["fast", "writing", "reasoning"]);
      expect(p3.model).toBe("combo/rakazo-reasoning");
      expect(p4.model).toBe("combo/rakazo-reasoning");

      const p5 = engine.resolveRoute(["analysis", "writing"]);
      const p6 = engine.resolveRoute(["writing", "analysis"]);
      expect(p5.model).toBe("combo/rakazo-analysis");
      expect(p6.model).toBe("combo/rakazo-analysis");

      const p7 = engine.resolveRoute([]);
      expect(p7.model).toBe("combo/rakazo-fast");
      expect(p7.category).toBe("general");
    });

    it("strictly vetoes commercial paid model fallbacks on free engine", () => {
      const paidModels = [
        "openai/gpt-4o",
        "openai/gpt-4-turbo",
        "anthropic/claude-3-5-sonnet",
        "anthropic/claude-3-opus",
        "openai/gpt-oss-120b",
      ];

      for (const paid of paidModels) {
        expect(() => engine.vetoPaidFallback(paid)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      }

      // Live combos & explicit free models must pass
      expect(() => engine.vetoPaidFallback("combo/rakazo-coding")).not.toThrow();
      expect(() => engine.vetoPaidFallback("combo/rakazo-reasoning")).not.toThrow();
      expect(() => engine.vetoPaidFallback("meta-llama/llama-3.3-70b-instruct:free")).not.toThrow();
    });

    it("fails closed on non-zero or negative or invalid cost assertions", () => {
      expect(() => engine.assertZeroCostAndAllowed("omniroute", 0.0001)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("omniroute", -1.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("omniroute", Number.NaN)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("unapproved_commercial_proxy", 0.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
      expect(() => engine.assertZeroCostAndAllowed("unknown_vendor", 0.0)).toThrow(FREE_INFERENCE_UNAVAILABLE_MESSAGE);
    });
  });
});
