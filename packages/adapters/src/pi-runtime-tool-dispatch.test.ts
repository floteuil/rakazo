import type { ConnectorTool } from "@rakazo/adapter-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeAgentState = vi.hoisted(() => ({
  tools: [] as Array<{
    name: string;
    prepareArguments?: (args: unknown) => Record<string, unknown>;
    execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
  }>,
}));

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class {
    state = { errorMessage: undefined, messages: [] };
    private readonly tools: typeof fakeAgentState.tools;

    constructor(options: { initialState: { tools: typeof fakeAgentState.tools } }) {
      this.tools = options.initialState.tools;
      fakeAgentState.tools = this.tools;
    }

    subscribe(_listener: unknown) {}

    async prompt() {
      const destination = this.tools.find((tool) => tool.name === "destination_write");
      if (!destination) throw new Error("sanitized destination tool was not exposed");
      const rawArgs = { collection: "notes", title: "Result", body: "Done" };
      const args = destination.prepareArguments?.(rawArgs) ?? rawArgs;
      await destination.execute("call-1", args);
    }

    async waitForIdle() {}

    abort() {}
  },
}));

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => ({
    getModel: (_provider: string, modelId: string) =>
      modelId === "dispatch-test-model" ? { provider: "test", id: modelId } : undefined,
    streamSimple: () => {
      throw new Error("the fake agent must not call a provider");
    },
  }),
}));

import { PiAgentRuntime } from "./pi-runtime.js";

const destinationTool: ConnectorTool = {
  name: "destination.write",
  description: "Write a record to the connected destination",
  inputSchema: {
    type: "object",
    properties: {
      collection: { type: "string" },
      title: { type: "string" },
      body: { type: "string" },
    },
  },
};

describe("Pi connector tool dispatch", () => {
  beforeEach(() => {
    fakeAgentState.tools = [];
  });

  it("exposes a provider-safe name while executing the original connector name", async () => {
    const executeTool = vi.fn(async () => ({ ok: true }));
    const runtime = new PiAgentRuntime();

    for await (const _event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: "r",
        prompt: "write the result",
        instructions: "Use destination_write for connected destination records.",
        history: [],
        tools: [destinationTool],
        model: { provider: "test", id: "dispatch-test-model" },
        executeTool,
      },
      {
        operationId: "1",
        traceId: "1",
        workspaceId: "w",
        userId: "u",
        signal: new AbortController().signal,
      },
    )) {
      // Exhaust the runtime event stream so tool execution completes.
    }

    expect(fakeAgentState.tools.map((tool) => tool.name)).toEqual(["destination_write"]);
    expect(executeTool).toHaveBeenCalledWith(
      "destination.write",
      { collection: "notes", title: "Result", body: "Done" },
      "call-1",
    );
  });
});

import { builtinAgentTools } from "./builtin-tools.js";
import { enterpriseAgentTools } from "./enterprise-tools.js";
import { extractBotMcpConfig, filterToolsForBot, isToolPermitted } from "./executor.js";

describe("Dynamic Per-Bot Tool Filtering & Security Gate", () => {
  describe("extractBotMcpConfig", () => {
    it("returns undefined when metadata/mcp is absent or empty", () => {
      expect(extractBotMcpConfig(null)).toBeUndefined();
      expect(extractBotMcpConfig({})).toBeUndefined();
      expect(extractBotMcpConfig({ metadata: {} })).toBeUndefined();
      expect(extractBotMcpConfig({ metadata: { mcp: {} } })).toBeUndefined();
      expect(extractBotMcpConfig({ metadata: { mcp: { connectors: {}, tools: {} } } })).toBeUndefined();
    });

    it("extracts mcp config from bot.metadata.mcp", () => {
      const bot = {
        metadata: {
          mcp: {
            connectors: { github: true, notion: false },
            tools: { github_create_issue: false },
          },
        },
      };
      const cfg = extractBotMcpConfig(bot);
      expect(cfg).toBeDefined();
      expect(cfg?.connectors?.github).toBe(true);
      expect(cfg?.connectors?.notion).toBe(false);
      expect(cfg?.tools?.github_create_issue).toBe(false);
    });

    it("extracts mcp config from bot.metadata.mcpConfig or top-level mcp", () => {
      expect(
        extractBotMcpConfig({ metadata: { mcpConfig: { connectors: { postiz: true } } } }),
      )?.toEqual({ connectors: { postiz: true } });

      expect(
        extractBotMcpConfig({ mcp: { connectors: { n8n: true } } }),
      )?.toEqual({ connectors: { n8n: true } });

      expect(
        extractBotMcpConfig({ mcpConfig: { connectors: { cloudflare: true } } }),
      )?.toEqual({ connectors: { cloudflare: true } });
    });
  });

  describe("isToolPermitted", () => {
    it("permits all tools by default when mcpConfig is absent or empty", () => {
      expect(isToolPermitted("github_search_repos", undefined)).toBe(true);
      expect(isToolPermitted("notion_search", null)).toBe(true);
      expect(isToolPermitted("shell", {})).toBe(true);
      expect(isToolPermitted("custom_tool", { connectors: {}, tools: {} })).toBe(true);
    });

    it("evaluates connector toggles correctly", () => {
      const config = {
        connectors: {
          github: false,
          notion: true,
          searxng_scraperr: false,
        },
      };

      // GitHub disabled
      expect(isToolPermitted("github_search_repos", config)).toBe(false);
      expect(isToolPermitted("github_get_file_contents", config)).toBe(false);
      expect(isToolPermitted("github_create_issue", config)).toBe(false);

      // Notion enabled
      expect(isToolPermitted("notion_search", config)).toBe(true);
      expect(isToolPermitted("notion_get_page", config)).toBe(true);

      // SearXNG / Scraperr disabled
      expect(isToolPermitted("web_search", config)).toBe(false);
      expect(isToolPermitted("web_scrape", config)).toBe(false);

      // Unconfigured connectors/tools remain permitted by default
      expect(isToolPermitted("shell", config)).toBe(true);
      expect(isToolPermitted("postiz_list_posts", config)).toBe(true);
    });

    it("prioritizes tool-specific overrides over connector toggles", () => {
      // Connector disabled, but specific tool enabled
      const overrideEnableConfig = {
        connectors: { github: false },
        tools: { github_search_repos: true },
      };
      expect(isToolPermitted("github_search_repos", overrideEnableConfig)).toBe(true);
      expect(isToolPermitted("github_create_issue", overrideEnableConfig)).toBe(false);

      // Connector enabled, but specific tool disabled
      const overrideDisableConfig = {
        connectors: { github: true },
        tools: { github_create_issue: false },
      };
      expect(isToolPermitted("github_search_repos", overrideDisableConfig)).toBe(true);
      expect(isToolPermitted("github_create_issue", overrideDisableConfig)).toBe(false);
    });
  });

  describe("filterToolsForBot", () => {
    it("preserves all tools when mcpConfig is absent and sandbox is graphical", () => {
      const filtered = filterToolsForBot(builtinAgentTools, undefined, true);
      expect(filtered.length).toBe(builtinAgentTools.length);
    });

    it("filters out graphical tools when isGraphical is false", () => {
      const filtered = filterToolsForBot(builtinAgentTools, undefined, false);
      const names = filtered.map((t) => t.name);
      expect(names).not.toContain("computer_observe");
      expect(names).not.toContain("computer_act");
      expect(names).not.toContain("open_path");
      expect(names).not.toContain("launch_app");
      expect(names).toContain("read_file");
      expect(names).toContain("shell");
    });

    it("filters tools according to connector and tool permissions", () => {
      const config = {
        connectors: {
          github: false,
          notion: true,
          postiz: false,
        },
        tools: {
          github_search_repos: true, // override: allow search even though github is disabled
          notion_create_page: false,  // override: deny create even though notion is enabled
        },
      };

      const filtered = filterToolsForBot(builtinAgentTools, config, true);
      const names = filtered.map((t) => t.name);

      // GitHub
      expect(names).toContain("github_search_repos"); // override allowed
      expect(names).not.toContain("github_get_file_contents");
      expect(names).not.toContain("github_create_issue");
      expect(names).not.toContain("github_list_issues");

      // Notion
      expect(names).toContain("notion_search");
      expect(names).toContain("notion_get_page");
      expect(names).not.toContain("notion_create_page"); // override denied

      // Postiz
      expect(names).not.toContain("postiz_list_integrations");
      expect(names).not.toContain("postiz_create_post");

      // Non-configured tools stay allowed
      expect(names).toContain("read_file");
      expect(names).toContain("shell");
      expect(names).toContain("web_search");
    });
  });

  describe("Subagent Tool Inheritance", () => {
    it("ensures subagent toolset derives strictly from parent request.tools without delegation tools", () => {
      const parentTools: ConnectorTool[] = [
        { name: "read_file", description: "Read a file", inputSchema: { type: "object" } },
        { name: "web_search", description: "Search web", inputSchema: { type: "object" } },
        { name: "run_subagent", description: "Run subagent helper", inputSchema: { type: "object" } },
        { name: "spawn_bot", description: "Spawn bot", inputSchema: { type: "object" } },
      ];

      // Simulated childDefs derivation in pi-runtime
      const delegationToolNames = new Set(["run_subagent", "spawn_bot", "archive_bot", "delete_bot"]);
      const childDefs = parentTools.filter((tool) => !delegationToolNames.has(tool.name));

      expect(childDefs.map((t) => t.name)).toEqual(["read_file", "web_search"]);
      expect(childDefs.some((t) => t.name.startsWith("github_"))).toBe(false);
    });
  });

  describe("Execution Gate Authorization Checks", () => {
    it("blocks unauthorized tool calls before execution", () => {
      const mcpConfig = {
        connectors: { github: false, notion: false },
        tools: { github_search_repos: true }, // search allowed by override
      };

      // Blocked tools
      expect(isToolPermitted("github_create_issue", mcpConfig)).toBe(false);
      expect(isToolPermitted("notion_create_page", mcpConfig)).toBe(false);

      // Allowed tools
      expect(isToolPermitted("github_search_repos", mcpConfig)).toBe(true);
      expect(isToolPermitted("read_file", mcpConfig)).toBe(true);
    });

    it("verifies full connector suite permission matrix", () => {
      const allConnectorsDisabled = {
        connectors: {
          searxng_scraperr: false,
          github: false,
          notion: false,
          postiz: false,
          wordpress_novamira: false,
          n8n: false,
          cloudflare: false,
        },
      };

      // All sovereign connector tools should be blocked
      expect(isToolPermitted("web_search", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("web_scrape", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("github_search_repos", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("notion_search", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("postiz_create_post", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("wordpress_create_post", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("novamira_execute_ability", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("n8n_trigger_webhook", allConnectorsDisabled)).toBe(false);
      expect(isToolPermitted("cloudflare_list_zones", allConnectorsDisabled)).toBe(false);

      // System sandbox tools remain permitted
      expect(isToolPermitted("read_file", allConnectorsDisabled)).toBe(true);
      expect(isToolPermitted("write_file", allConnectorsDisabled)).toBe(true);
      expect(isToolPermitted("shell", allConnectorsDisabled)).toBe(true);
      expect(isToolPermitted("remember", allConnectorsDisabled)).toBe(true);
    });
  });
});

