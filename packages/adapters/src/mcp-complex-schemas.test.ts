import type { ConnectorTool } from "@rakazo/adapter-kit";
import { Type } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakeAgentState = vi.hoisted(() => ({
  tools: [] as Array<{
    name: string;
    description: string;
    parameters?: unknown;
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

    async prompt() {}

    async waitForIdle() {}

    abort() {}
  },
}));

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => ({
    getModel: (_provider: string, modelId: string) =>
      modelId === "schema-test-model" ? { provider: "test", id: modelId } : undefined,
    streamSimple: () => {
      throw new Error("Fake agent must not call provider");
    },
  }),
}));

import { PiAgentRuntime } from "./pi-runtime.js";

function createRuntime() {
  return new PiAgentRuntime();
}

async function initializeRuntimeWithTools(tools: ConnectorTool[]) {
  const runtime = createRuntime();
  const events = runtime.run(
    {
      botId: "bot-test",
      threadId: "thread-test",
      runId: "run-test",
      prompt: "Execute schema test",
      instructions: "Testing MCP schemas",
      history: [],
      tools,
      model: { provider: "test", id: "schema-test-model" },
    },
    {
      operationId: "op-1",
      traceId: "tr-1",
      workspaceId: "ws-1",
      userId: "usr-1",
      signal: new AbortController().signal,
    },
  );

  // Advance iterator once to trigger Agent constructor and tool registration
  const iterator = events[Symbol.asyncIterator]();
  await iterator.next();
  return fakeAgentState.tools;
}

describe("MCP Complex Schema & TypeBox Enum Normalization (Feature 1)", () => {
  beforeEach(() => {
    fakeAgentState.tools = [];
  });

  describe("Tier 1: Feature Coverage (≥5 Tests)", () => {
    it("1.1 compiles standard primitive properties (string, number, boolean) into valid TypeBox parameters", async () => {
      const tool: ConnectorTool = {
        name: "searxng_search",
        description: "Search web using SearXNG",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", description: "Result count" },
            safe_search: { type: "boolean", description: "Safe filter" },
          },
          required: ["query"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      expect(registered).toHaveLength(1);
      const registeredTool = registered[0]!;
      expect(registeredTool.name).toBe("searxng_search");
      expect(registeredTool.parameters).toBeDefined();

      const params = registeredTool.parameters as any;
      expect(params.type).toBe("object");
      expect(params.properties.query).toBeDefined();
      expect(params.properties.limit).toBeDefined();
      expect(params.properties.safe_search).toBeDefined();
    });

    it("1.2 resolves string enums into TypeBox Literal Unions", async () => {
      const tool: ConnectorTool = {
        name: "notion_query",
        description: "Query Notion database with sort direction",
        inputSchema: {
          type: "object",
          properties: {
            database_id: { type: "string" },
            direction: {
              type: "string",
              enum: ["ascending", "descending"],
            },
          },
          required: ["database_id", "direction"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const registeredTool = registered[0]!;
      const params = registeredTool.parameters as any;
      expect(params.properties.direction).toBeDefined();
      expect(params.properties.direction.anyOf || params.properties.direction.enum).toBeDefined();
    });

    it("1.3 handles integer types and number enums correctly", async () => {
      const tool: ConnectorTool = {
        name: "github_list_issues",
        description: "List repository issues with pagination",
        inputSchema: {
          type: "object",
          properties: {
            page: { type: "integer" },
            per_page: { type: "number", enum: [10, 25, 50, 100] },
          },
          required: ["page"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const registeredTool = registered[0]!;
      const params = registeredTool.parameters as any;
      expect(params.properties.page.type).toBe("number");
      expect(params.properties.per_page).toBeDefined();
    });

    it("1.4 handles nested array schemas with typed item definitions", async () => {
      const tool: ConnectorTool = {
        name: "postiz_schedule_post",
        description: "Schedule social media post across channels",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string" },
            channels: {
              type: "array",
              items: { type: "string", enum: ["twitter", "linkedin", "bluesky"] },
            },
            tags: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["content", "channels"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const registeredTool = registered[0]!;
      const params = registeredTool.parameters as any;
      expect(params.properties.channels.type).toBe("array");
      expect(params.properties.tags.type).toBe("array");
    });

    it("1.5 distinguishes required vs optional fields without throwing validation errors", async () => {
      const tool: ConnectorTool = {
        name: "cloudflare_dns_record",
        description: "Create DNS record in Cloudflare",
        inputSchema: {
          type: "object",
          properties: {
            zone_id: { type: "string" },
            name: { type: "string" },
            content: { type: "string" },
            ttl: { type: "number" },
            proxied: { type: "boolean" },
          },
          required: ["zone_id", "name", "content"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const registeredTool = registered[0]!;
      const params = registeredTool.parameters as any;
      expect(params.properties.zone_id).toBeDefined();
      expect(params.properties.ttl).toBeDefined();
    });
  });

  describe("Tier 2: Boundary & Corner Cases (≥5 Tests)", () => {
    it("2.1 gracefully compiles empty schema object `{}` without properties", async () => {
      const tool: ConnectorTool = {
        name: "system_ping",
        description: "Ping system status",
        inputSchema: {},
      };

      const registered = await initializeRuntimeWithTools([tool]);
      expect(registered).toHaveLength(1);
      const params = registered[0]!.parameters as any;
      expect(params.type).toBe("object");
      expect(Object.keys(params.properties)).toHaveLength(0);
    });

    it("2.2 handles single-value enum gracefully (`enum: ['unique']`)", async () => {
      const tool: ConnectorTool = {
        name: "n8n_trigger",
        description: "Trigger n8n webhook",
        inputSchema: {
          type: "object",
          properties: {
            version: { type: "string", enum: ["v1"] },
          },
          required: ["version"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const params = registered[0]!.parameters as any;
      expect(params.properties.version).toBeDefined();
    });

    it("2.3 handles empty enum array (`enum: []`) without crashing", async () => {
      const tool: ConnectorTool = {
        name: "custom_mcp_tool",
        description: "Tool with empty enum",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", enum: [] },
          },
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const params = registered[0]!.parameters as any;
      expect(params.properties.status.type).toBe("string");
    });

    it("2.4 falls back to string schema for unrecognized custom types", async () => {
      const tool: ConnectorTool = {
        name: "exotic_tool",
        description: "Tool with custom unmapped JSON Schema type",
        inputSchema: {
          type: "object",
          properties: {
            customField: { type: "custom-binary-blob" as any },
          },
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const params = registered[0]!.parameters as any;
      expect(params.properties.customField.type).toBe("string");
    });

    it("2.5 handles nested object schema with sub-properties", async () => {
      const tool: ConnectorTool = {
        name: "nested_config_tool",
        description: "Tool with nested object configuration",
        inputSchema: {
          type: "object",
          properties: {
            meta: {
              type: "object",
              properties: {
                author: { type: "string" },
                priority: { type: "number" },
              },
              required: ["author"],
            },
          },
          required: ["meta"],
        },
      };

      const registered = await initializeRuntimeWithTools([tool]);
      const params = registered[0]!.parameters as any;
      expect(params.properties.meta.type).toBe("object");
      expect(params.properties.meta.properties.author).toBeDefined();
    });
  });

  describe("Tier 3: Combinatorial & Complex Schemas", () => {
    it("3.1 compiles multiple concurrent MCP tools with conflicting schema definitions", async () => {
      const tools: ConnectorTool[] = [
        {
          name: "tool_alpha",
          description: "Alpha tool",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" }, mode: { type: "string", enum: ["fast", "deep"] } },
            required: ["id"],
          },
        },
        {
          name: "tool_beta",
          description: "Beta tool",
          inputSchema: {
            type: "object",
            properties: { count: { type: "number" }, enabled: { type: "boolean" } },
          },
        },
        {
          name: "tool_gamma",
          description: "Gamma tool with arrays of objects",
          inputSchema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      ];

      const registered = await initializeRuntimeWithTools(tools);
      expect(registered).toHaveLength(3);
      expect(registered.map((t) => t.name)).toEqual(["tool_alpha", "tool_beta", "tool_gamma"]);
    });
  });

  describe("Tier 4: Real-World MCP Connector Scenarios", () => {
    it("4.1 compiles real-world GitHub Issue & Pull Request MCP tool schemas", async () => {
      const githubCreateIssue: ConnectorTool = {
        name: "github_create_issue",
        description: "Create issue in repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Repository owner" },
            repo: { type: "string", description: "Repository name" },
            title: { type: "string", description: "Issue title" },
            body: { type: "string", description: "Markdown body" },
            labels: { type: "array", items: { type: "string" } },
            assignees: { type: "array", items: { type: "string" } },
          },
          required: ["owner", "repo", "title"],
        },
      };

      const registered = await initializeRuntimeWithTools([githubCreateIssue]);
      expect(registered[0]!.name).toBe("github_create_issue");
      const params = registered[0]!.parameters as any;
      expect(params.properties.owner).toBeDefined();
      expect(params.properties.repo).toBeDefined();
      expect(params.properties.title).toBeDefined();
      expect(params.properties.labels.type).toBe("array");
    });

    it("4.2 compiles real-world WordPress/Novamira MCP tool schemas", async () => {
      const wpPublishPost: ConnectorTool = {
        name: "wordpress_publish_post",
        description: "Publish blog article to WordPress instance",
        inputSchema: {
          type: "object",
          properties: {
            site_id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            status: { type: "string", enum: ["publish", "draft", "pending", "private"] },
            categories: { type: "array", items: { type: "number" } },
          },
          required: ["site_id", "title", "content", "status"],
        },
      };

      const registered = await initializeRuntimeWithTools([wpPublishPost]);
      expect(registered[0]!.name).toBe("wordpress_publish_post");
      const params = registered[0]!.parameters as any;
      expect(params.properties.status).toBeDefined();
      expect(params.properties.categories.type).toBe("array");
    });
  });
});
