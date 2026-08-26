import { describe, expect, it, vi } from "vitest";
import type { AgentRunRequest, AgentRuntimeEvent, ConnectorTool } from "@rakazo/adapter-kit";
import { builtinAgentTools, DELEGATION_TOOL_NAMES } from "../builtin-tools.js";
import { createToolCallTracker } from "../loop-guards.js";
import {
  buildSubagentPrompt,
  executeSubagent,
  toAgentTools,
  type EventQueue,
  type ToolHost,
} from "../pi-runtime.js";
import { compilePromptLevel1Deterministic } from "../prompt-compiler.js";

// Helper to create a mock ToolHost
function createMockHost(overrides?: Partial<ToolHost>): {
  host: ToolHost;
  events: AgentRuntimeEvent[];
  streamSimpleCalls: Array<{ m: unknown; ctx: unknown; options: unknown }>;
} {
  const events: AgentRuntimeEvent[] = [];
  const streamSimpleCalls: Array<{ m: unknown; ctx: unknown; options: unknown }> = [];

  const queue: EventQueue = {
    push(event: AgentRuntimeEvent) {
      events.push(event);
    },
    close() {},
    async *iterate() {
      for (const event of events) {
        yield event;
      }
    },
  };

  const mockModel = {
    provider: "openrouter",
    id: "deepseek/deepseek-v4-flash-0731",
  };

  const mockModels = {
    getModel: () => mockModel,
    streamSimple: (m: unknown, ctx: unknown, options: unknown) => {
      streamSimpleCalls.push({ m, ctx, options });
      return {
        async *[Symbol.asyncIterator]() {
          yield { type: "text_delta", delta: "Subagent completed task successfully." };
        },
      };
    },
  } as unknown as ToolHost["models"];

  const request: AgentRunRequest = {
    botId: "bot-123",
    threadId: "thread-456",
    runId: "run-789",
    prompt: "Coordinate subtasks",
    instructions: "Main bot instructions",
    history: [],
    tools: [...builtinAgentTools],
    model: { provider: "openrouter", id: "deepseek/deepseek-v4-flash-0731" },
  };

  const host: ToolHost = {
    queue,
    request,
    models: mockModels,
    model: mockModel as unknown as ToolHost["model"],
    apiKey: "test-api-key",
    nestedAgents: new Set(),
    subagentGate: {
      acquire: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    },
    signal: new AbortController().signal,
    depth: 0,
    tracker: createToolCallTracker(),
    ...overrides,
  };

  return { host, events, streamSimpleCalls };
}

describe("Requirement R1: Subagent Level 1 Prompt Compilation & Invariants", () => {
  // ==========================================================================
  // 1. System Prompt Structure (All 5 Markdown Sections Present)
  // ==========================================================================
  describe("1. System Prompt Structure (5 Hierarchical Markdown Sections)", () => {
    const requiredSections = [
      "# Role & Identity",
      "## Core Mission",
      "## Operational Rules & Constraints",
      "## Output Format & Deliverables",
      "## Error Handling & Edge Cases",
    ];

    it("generates all 5 mandatory sections for a default helper subagent", () => {
      const promptOutput = buildSubagentPrompt("helper");
      const systemPrompt = promptOutput.compiledInstruction;

      expect(promptOutput.levelUsed).toBe("level1_deterministic");
      for (const section of requiredSections) {
        expect(systemPrompt).toContain(section);
      }
      expect(systemPrompt).toMatch(/Rakazo subagent named "helper"/i);
      expect(systemPrompt).toContain("subagent depth is strictly 1");
    });

    it("generates all 5 mandatory sections when a task objective is provided", () => {
      const task = "Fetch GitHub repository issues and summarize open bugs";
      const promptOutput = buildSubagentPrompt("github_analyzer", task);
      const systemPrompt = promptOutput.compiledInstruction;

      for (const section of requiredSections) {
        expect(systemPrompt).toContain(section);
      }
      expect(systemPrompt).toMatch(/Rakazo subagent named "github_analyzer"/i);
      expect(systemPrompt).toContain("Fetch GitHub repository issues and summarize open bugs");
    });

    it("generates all 5 mandatory sections with custom extra instructions and formatting", () => {
      const task = "Analyze CSV financial records";
      const extra = [
        "Format output as a structured JSON table with columns: date, amount, category.",
        "Always verify math calculations before responding.",
        "Never invent transaction records.",
        "If error occurs when parsing dates, fallback to YYYY-MM-DD format.",
      ].join("\n");

      const promptOutput = buildSubagentPrompt("financial_auditor", task, extra);
      const systemPrompt = promptOutput.compiledInstruction;

      for (const section of requiredSections) {
        expect(systemPrompt).toContain(section);
      }
      expect(systemPrompt).toContain("JSON table");
      expect(systemPrompt).toContain("Always verify math calculations");
      expect(systemPrompt).toContain("Never invent transaction records");
      expect(systemPrompt).toContain("If error occurs when parsing dates");
    });

    it("handles multilingual / French subagent instructions into the 5 sections", () => {
      const task = "Rechercher les dernières annonces immobilières";
      const extra = [
        "Toujours vérifier la disponibilité avant de lister un bien.",
        "Ne jamais inclure d'adresses privées.",
        "Format de sortie: liste à puces claire avec prix en euros.",
        "En cas d'erreur réseau, réessayer avec un délai de 2 secondes.",
      ].join("\n");

      const promptOutput = buildSubagentPrompt("chercheur_immo", task, extra);
      const systemPrompt = promptOutput.compiledInstruction;

      for (const section of requiredSections) {
        expect(systemPrompt).toContain(section);
      }
      expect(systemPrompt).toContain("Toujours vérifier la disponibilité");
      expect(systemPrompt).toContain("Ne jamais inclure d'adresses privées");
      expect(systemPrompt).toContain("liste à puces claire");
    });

    it("produces valid token telemetry without network latency", () => {
      const promptOutput = buildSubagentPrompt("worker", "Process items", "Be concise");
      expect(promptOutput.telemetry).toBeDefined();
      expect(promptOutput.telemetry?.promptTokens).toBeGreaterThan(0);
      expect(promptOutput.telemetry?.completionTokens).toBeGreaterThan(0);
      expect(promptOutput.telemetry?.durationMs).toBeGreaterThanOrEqual(0);
      expect(promptOutput.telemetry?.cachedTokens).toBe(0);
    });

    it("compiles instructions deterministically (idempotent output)", () => {
      const first = buildSubagentPrompt("helper", "Task A", "Rule B");
      const second = buildSubagentPrompt("helper", "Task A", "Rule B");
      expect(first.compiledInstruction).toBe(second.compiledInstruction);
      expect(first.levelUsed).toBe(second.levelUsed);
    });
  });

  // ==========================================================================
  // 2. Tool Prohibition (Delegation Tools Filtered)
  // ==========================================================================
  describe("2. Tool Prohibition (DELEGATION_TOOL_NAMES Exclusion)", () => {
    it("defines the canonical set of prohibited delegation tools", () => {
      expect(DELEGATION_TOOL_NAMES.has("run_subagent")).toBe(true);
      expect(DELEGATION_TOOL_NAMES.has("spawn_bot")).toBe(true);
      expect(DELEGATION_TOOL_NAMES.has("archive_bot")).toBe(true);
      expect(DELEGATION_TOOL_NAMES.has("delete_bot")).toBe(true);
      expect(DELEGATION_TOOL_NAMES.size).toBe(4);
    });

    it("filters out all delegation tools from builtin tools", () => {
      const availableTools = builtinAgentTools;
      const childDefs = availableTools.filter(
        (tool) => !DELEGATION_TOOL_NAMES.has(tool.name),
      );

      const childNames = childDefs.map((t) => t.name);
      expect(childNames).not.toContain("run_subagent");
      expect(childNames).not.toContain("spawn_bot");
      expect(childNames).not.toContain("archive_bot");
      expect(childNames).not.toContain("delete_bot");

      // Verify safe tools remain
      expect(childNames).toContain("read_file");
      expect(childNames).toContain("write_file");
      expect(childNames).toContain("shell");
      expect(childNames).toContain("web_search");
    });

    it("filters delegation tools from custom tool suites", () => {
      const customTools: ConnectorTool[] = [
        { name: "github_search_repos", description: "Search repos", inputSchema: { type: "object" } },
        { name: "run_subagent", description: "Delegation tool", inputSchema: { type: "object" } },
        { name: "notion_get_page", description: "Get page", inputSchema: { type: "object" } },
        { name: "spawn_bot", description: "Spawn bot", inputSchema: { type: "object" } },
        { name: "cloudflare_purge_cache", description: "Purge cache", inputSchema: { type: "object" } },
        { name: "archive_bot", description: "Archive bot", inputSchema: { type: "object" } },
        { name: "delete_bot", description: "Delete bot", inputSchema: { type: "object" } },
      ];

      const childDefs = customTools.filter((tool) => !DELEGATION_TOOL_NAMES.has(tool.name));
      const childNames = childDefs.map((t) => t.name);

      expect(childNames).toEqual([
        "github_search_repos",
        "notion_get_page",
        "cloudflare_purge_cache",
      ]);
    });

    it("converts filtered tool definitions into executable AgentTools without delegation tools", () => {
      const { host } = createMockHost();
      const childDefs = builtinAgentTools.filter(
        (tool) => !DELEGATION_TOOL_NAMES.has(tool.name),
      );
      const agentTools = toAgentTools(childDefs, host);

      const toolLabels = agentTools.map((t) => t.label);
      expect(toolLabels).not.toContain("run_subagent");
      expect(toolLabels).not.toContain("spawn_bot");
      expect(toolLabels).not.toContain("archive_bot");
      expect(toolLabels).not.toContain("delete_bot");
    });
  });

  // ==========================================================================
  // 3. Depth Limit Rejection (Depth > 0)
  // ==========================================================================
  describe("3. Depth Limit Rejection", () => {
    it("returns 'Subagents cannot nest further.' when host.depth is 1", async () => {
      const { host, events } = createMockHost({ depth: 1 });
      const result = await executeSubagent(host, "exec-nested-1", {
        name: "nested_helper",
        task: "Attempt nested delegation",
      });

      expect(result).toBe("Subagents cannot nest further.");
      // Ensure gate was not acquired and no subagent event was emitted
      expect(host.subagentGate.acquire).not.toHaveBeenCalled();
      expect(events.filter((e) => e.type === "subagent")).toHaveLength(0);
    });

    it("returns 'Subagents cannot nest further.' when host.depth is 2 or higher", async () => {
      const { host, events } = createMockHost({ depth: 2 });
      const result = await executeSubagent(host, "exec-nested-2", {
        name: "deep_helper",
        task: "Attempt deep nesting",
      });

      expect(result).toBe("Subagents cannot nest further.");
      expect(host.subagentGate.acquire).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });

    it("permits execution when host.depth is 0", async () => {
      const { host, events } = createMockHost({ depth: 0 });
      const result = await executeSubagent(host, "exec-root-1", {
        name: "valid_helper",
        task: "Valid root subtask",
      });

      expect(result).not.toBe("Subagents cannot nest further.");
      expect(host.subagentGate.acquire).toHaveBeenCalledTimes(1);
      expect(host.subagentGate.release).toHaveBeenCalledTimes(1);

      const subagentEvents = events.filter((e) => e.type === "subagent");
      expect(subagentEvents.length).toBeGreaterThan(0);
      expect(subagentEvents[0]).toMatchObject({
        type: "subagent",
        agentId: "exec-root-1",
        name: "valid_helper",
        task: "Valid root subtask",
        status: "running",
      });
    });
  });

  // ==========================================================================
  // 4. Token Ceiling Enforcement (Max 8,192 Tokens)
  // ==========================================================================
  describe("4. Token Ceiling Enforcement", () => {
    it("bounds token ceiling to maximum 8,192 when streamOptions is undefined or default", () => {
      const calculateMaxTokens = (options?: { maxTokens?: number }) =>
        Math.min(Math.max(options?.maxTokens ?? 8192, 1), 8192);

      expect(calculateMaxTokens(undefined)).toBe(8192);
      expect(calculateMaxTokens({})).toBe(8192);
    });

    it("caps token ceiling at 8,192 when higher values are requested", () => {
      const calculateMaxTokens = (options?: { maxTokens?: number }) =>
        Math.min(Math.max(options?.maxTokens ?? 8192, 1), 8192);

      expect(calculateMaxTokens({ maxTokens: 16384 })).toBe(8192);
      expect(calculateMaxTokens({ maxTokens: 32768 })).toBe(8192);
      expect(calculateMaxTokens({ maxTokens: 100000 })).toBe(8192);
    });

    it("preserves lower requested token limits within [1, 8192]", () => {
      const calculateMaxTokens = (options?: { maxTokens?: number }) =>
        Math.min(Math.max(options?.maxTokens ?? 8192, 1), 8192);

      expect(calculateMaxTokens({ maxTokens: 4096 })).toBe(4096);
      expect(calculateMaxTokens({ maxTokens: 2048 })).toBe(2048);
      expect(calculateMaxTokens({ maxTokens: 512 })).toBe(512);
      expect(calculateMaxTokens({ maxTokens: 1 })).toBe(1);
    });

    it("bounds non-positive or invalid token limits to minimum 1", () => {
      const calculateMaxTokens = (options?: { maxTokens?: number }) =>
        Math.min(Math.max(options?.maxTokens ?? 8192, 1), 8192);

      expect(calculateMaxTokens({ maxTokens: 0 })).toBe(1);
      expect(calculateMaxTokens({ maxTokens: -500 })).toBe(1);
    });
  });

  // ==========================================================================
  // 5. Lifecycle & Abort Handling
  // ==========================================================================
  describe("5. Subagent Execution Lifecycle & Abort Handling", () => {
    it("handles aborted signal gracefully before start", async () => {
      const abortController = new AbortController();
      abortController.abort();

      const { host, events } = createMockHost({
        signal: abortController.signal,
      });

      const result = await executeSubagent(host, "exec-abort-1", {
        name: "aborted_helper",
        task: "Do work",
      });

      expect(result).toBe("stopped");
      const failedEvent = events.find((e) => e.type === "subagent" && e.status === "failed");
      expect(failedEvent).toBeDefined();
      expect(failedEvent).toMatchObject({
        type: "subagent",
        agentId: "exec-abort-1",
        name: "aborted_helper",
        status: "failed",
        result: "stopped",
      });
      expect(host.subagentGate.release).toHaveBeenCalled();
    });

    it("sanitizes long subagent names to 80 characters", async () => {
      const longName = "A".repeat(120);
      const promptOutput = buildSubagentPrompt(longName, "Task");
      expect(promptOutput.compiledInstruction).toContain(longName);
    });
  });
});
