import type { AgentRunRequest, AgentToolExecutionResult, ConnectorTool } from "@rakazo/adapter-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compactToolResult } from "./tool-compacting.js";

const capturedToolsState = vi.hoisted(() => ({
  tools: [] as Array<{
    name: string;
    label?: string;
    prepareArguments?: (args: unknown) => Record<string, unknown>;
    execute: (toolCallId: string, params: Record<string, unknown>) => Promise<any>;
  }>,
}));

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class {
    state = { errorMessage: undefined, messages: [] };
    private readonly tools: typeof capturedToolsState.tools;

    constructor(options: { initialState: { tools: typeof capturedToolsState.tools } }) {
      this.tools = options.initialState.tools;
      capturedToolsState.tools = this.tools;
    }

    subscribe(_listener: unknown) {}
    async prompt() {}
    async waitForIdle() {}
    abort() {}
  },
}));

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => ({
    getModel: (_provider: string, modelId: string) =>
      modelId === "challenger-model" ? { provider: "test", id: modelId } : undefined,
    streamSimple: () => {
      throw new Error("fake stream simple should not be called");
    },
  }),
}));

import { PiAgentRuntime } from "./pi-runtime.js";

function makeTool(name: string): ConnectorTool {
  return {
    name,
    description: `Tool for ${name}`,
    inputSchema: { type: "object", properties: {} },
  };
}

describe("Empirical Challenger M1: PiRuntime & Tool Compacting Integration", () => {
  beforeEach(() => {
    capturedToolsState.tools = [];
  });

  async function setupRuntimeWithTools(
    tools: ConnectorTool[],
    executeTool?: (
      name: string,
      args: Record<string, unknown>,
      executionId: string,
    ) => Promise<unknown>,
  ) {
    const runtime = new PiAgentRuntime();
    const request: AgentRunRequest = {
      botId: "bot-challenger",
      threadId: "thread-challenger",
      runId: "run-challenger",
      prompt: "execute test",
      instructions: "test instructions",
      history: [],
      tools,
      model: { provider: "test", id: "challenger-model" },
      executeTool,
    };

    const iterator = runtime.run(request, {
      operationId: "op-1",
      traceId: "tr-1",
      workspaceId: "ws-1",
      userId: "usr-1",
      signal: new AbortController().signal,
    });

    for await (const _event of iterator) {
      // Consume events to initialize agent and tools
    }

    return capturedToolsState.tools;
  }

  // ==========================================================================
  // 1. AgentToolResult Wrapping & details preservation
  // ==========================================================================
  describe("1. AgentToolResult Wrapping Contract", () => {
    it("wraps raw result into { content: [{ type: 'text', text: compacted }], details: rawResult }", async () => {
      const rawObject = {
        status: "success",
        deepData: { nested: [1, 2, 3], key: "value" },
        count: 42,
      };

      const executeTool = vi.fn(async () => rawObject);
      const tools = await setupRuntimeWithTools([makeTool("custom_tool")], executeTool);
      const customTool = tools.find((t) => t.name === "custom_tool");
      expect(customTool).toBeDefined();

      const toolResult = await customTool!.execute("call-100", { query: "test" });

      expect(executeTool).toHaveBeenCalledWith("custom_tool", { query: "test" }, "call-100");
      expect(toolResult).toHaveProperty("content");
      expect(toolResult).toHaveProperty("details");
      expect(toolResult.details).toBe(rawObject); // Strict reference preservation
      expect(toolResult.content).toEqual([
        {
          type: "text",
          text: compactToolResult("custom_tool", rawObject),
        },
      ]);
    });

    it("preserves unmodified details even when compacted text is truncated or summarized", async () => {
      const largeFileArray = Array.from({ length: 80 }, (_, i) => `dir_${i % 5}/file_${i}.ts`);
      const executeTool = vi.fn(async () => largeFileArray);

      const tools = await setupRuntimeWithTools([makeTool("list_files")], executeTool);
      const listFilesTool = tools.find((t) => t.name === "list_files");
      expect(listFilesTool).toBeDefined();

      const toolResult = await listFilesTool!.execute("call-101", { path: "/workspace" });

      // Raw details are the full 80 files array
      expect(toolResult.details).toBe(largeFileArray);
      expect((toolResult.details as string[]).length).toBe(80);

      // Content text is the compacted summary string
      expect(toolResult.content[0].type).toBe("text");
      expect(toolResult.content[0].text).toContain("Found 80 files across directories");
      expect(toolResult.content[0].text).toContain("... (+50 more files)");
    });

    it("passes through AgentToolExecutionResult unchanged when kind === 'agent_tool_result'", async () => {
      const imageResult: AgentToolExecutionResult = {
        kind: "agent_tool_result",
        content: [
          { type: "text", text: "Screen captured" },
          { type: "image", data: "base64data", mimeType: "image/png" },
        ],
        details: { frameId: "frame-001" },
      };

      const executeTool = vi.fn(async () => imageResult);
      const tools = await setupRuntimeWithTools([makeTool("computer_observe")], executeTool);
      const observeTool = tools.find((t) => t.name === "computer_observe");
      expect(observeTool).toBeDefined();

      const toolResult = await observeTool!.execute("call-102", {});

      expect(toolResult).toBe(imageResult);
      expect(toolResult.content).toHaveLength(2);
      expect(toolResult.content[1]).toEqual({
        type: "image",
        data: "base64data",
        mimeType: "image/png",
      });
    });

    it("handles missing executeTool executor gracefully with descriptive error", async () => {
      const tools = await setupRuntimeWithTools([makeTool("some_tool")], undefined);
      const someTool = tools.find((t) => t.name === "some_tool");
      expect(someTool).toBeDefined();

      const toolResult = await someTool!.execute("call-103", {});
      expect(toolResult).toEqual({
        content: [{ type: "text", text: "some_tool is unavailable without an executor." }],
        details: { error: "no executor" },
      });
    });

    it("handles request_takeover tool directly in runtime with terminate flag", async () => {
      const tools = await setupRuntimeWithTools([makeTool("request_takeover")], vi.fn());
      const takeoverTool = tools.find((t) => t.name === "request_takeover");
      expect(takeoverTool).toBeDefined();

      const toolResult = await takeoverTool!.execute("call-104", { reason: "User action needed" });
      expect(toolResult).toEqual({
        content: [{ type: "text", text: "Takeover requested." }],
        details: { reason: "User action needed" },
        terminate: true,
      });
    });
  });

  // ==========================================================================
  // 2. Semantic Compactor Integration Across All Tools
  // ==========================================================================
  describe("2. Semantic Compactor Tool-by-Tool Empirical Verification", () => {
    it("compacts shell execution: preserves head and tail with truncation marker for >4000 chars", async () => {
      const longOutput =
        "LOG_START\n" + "A".repeat(3000) + "\nMIDDLE_DATA\n" + "Z".repeat(3000) + "\nLOG_END";
      const executeTool = vi.fn(async () => longOutput);

      const tools = await setupRuntimeWithTools([makeTool("shell")], executeTool);
      const shellTool = tools.find((t) => t.name === "shell");

      const result = await shellTool!.execute("call-201", { command: "build" });
      expect(result.details).toBe(longOutput);
      expect(result.content[0].text).toContain("LOG_START");
      expect(result.content[0].text).toContain("LOG_END");
      expect(result.content[0].text).toContain("characters truncated");
      expect(result.content[0].text.length).toBeLessThan(longOutput.length);
    });

    it("compacts github_search_repos: converts repositories into dense format with total_count", async () => {
      const ghRepos = {
        total_count: 2,
        items: [
          {
            full_name: "rakazo/core",
            stars: 100,
            language: "TypeScript",
            description: "Core engine",
          },
          {
            full_name: "rakazo/ui",
            stargazers_count: 50,
            language: "React",
            description: "Frontend UI",
          },
        ],
      };
      const executeTool = vi.fn(async () => ghRepos);

      const tools = await setupRuntimeWithTools([makeTool("github_search_repos")], executeTool);
      const ghTool = tools.find((t) => t.name === "github_search_repos");

      const result = await ghTool!.execute("call-202", { q: "rakazo" });
      expect(result.details).toBe(ghRepos);

      const parsedCompact = JSON.parse(result.content[0].text);
      expect(parsedCompact.total_count).toBe(2);
      expect(parsedCompact.items).toEqual([
        "rakazo/core (100⭐, TypeScript) - Core engine",
        "rakazo/ui (50⭐, React) - Frontend UI",
      ]);
    });

    it("compacts github_list_issues: converts issues to #number [state] title (@author)", async () => {
      const ghIssues = [
        { number: 42, state: "open", title: "Add compaction tests", author: "critic-agent" },
        { number: 43, state: "closed", title: "Fix memory leak", user: { login: "worker-agent" } },
      ];
      const executeTool = vi.fn(async () => ghIssues);

      const tools = await setupRuntimeWithTools([makeTool("github_list_issues")], executeTool);
      const issuesTool = tools.find((t) => t.name === "github_list_issues");

      const result = await issuesTool!.execute("call-203", { owner: "rakazo", repo: "core" });
      expect(result.details).toBe(ghIssues);

      const parsedCompact = JSON.parse(result.content[0].text);
      expect(parsedCompact).toEqual([
        "#42 [open] Add compaction tests (@critic-agent)",
        "#43 [closed] Fix memory leak (@worker-agent)",
      ]);
    });

    it("compacts notion_query_database: flattens nested properties tree", async () => {
      const notionDb = {
        results: [
          {
            id: "page-123",
            object: "page",
            url: "https://notion.so/123",
            properties: {
              Name: { type: "title", title: [{ plain_text: "Task 1" }] },
              Priority: { type: "number", number: 1 },
              Tags: {
                type: "multi_select",
                multi_select: [{ name: "frontend" }, { name: "urgent" }],
              },
              Done: { type: "checkbox", checkbox: true },
            },
          },
        ],
      };
      const executeTool = vi.fn(async () => notionDb);

      const tools = await setupRuntimeWithTools([makeTool("notion_query_database")], executeTool);
      const notionTool = tools.find((t) => t.name === "notion_query_database");

      const result = await notionTool!.execute("call-204", { database_id: "db-123" });
      expect(result.details).toBe(notionDb);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed[0].id).toBe("page-123");
      expect(parsed[0].title).toBe("Task 1");
      expect(parsed[0].properties).toEqual({
        Name: "Task 1",
        Priority: 1,
        Tags: ["frontend", "urgent"],
        Done: true,
      });
    });

    it("compacts cloudflare_list_dns_records: converts to tabular array [type, name, content, proxied]", async () => {
      const dnsResult = {
        records: [
          {
            type: "A",
            name: "rakazo.com",
            content: "1.2.3.4",
            proxied: true,
            extraMeta: "ignored",
          },
          { type: "CNAME", name: "app.rakazo.com", content: "rakazo.com", proxied: false },
        ],
      };
      const executeTool = vi.fn(async () => dnsResult);

      const tools = await setupRuntimeWithTools(
        [makeTool("cloudflare_list_dns_records")],
        executeTool,
      );
      const dnsTool = tools.find((t) => t.name === "cloudflare_list_dns_records");

      const result = await dnsTool!.execute("call-205", { zone_id: "zone-123" });
      expect(result.details).toBe(dnsResult);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual([
        ["A", "rakazo.com", "1.2.3.4", true],
        ["CNAME", "app.rakazo.com", "rakazo.com", false],
      ]);
    });

    it("cleans nulls and undefined in generic tool fallback", async () => {
      const messyPayload = {
        status: "ok",
        empty1: null,
        empty2: undefined,
        emptyObj: {},
        nested: {
          subNull: null,
          valid: 123,
        },
        arr: [1, null, 2, undefined, 3],
      };
      const executeTool = vi.fn(async () => messyPayload);

      const tools = await setupRuntimeWithTools([makeTool("custom_api")], executeTool);
      const apiTool = tools.find((t) => t.name === "custom_api");

      const result = await apiTool!.execute("call-206", {});
      expect(result.details).toBe(messyPayload);

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({
        status: "ok",
        nested: { valid: 123 },
        arr: [1, 2, 3],
      });
    });
  });
});
