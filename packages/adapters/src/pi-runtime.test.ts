import type { ConnectorTool } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import {
  jsonField,
  jsonSchemaParameters,
  normalizeAgentToolName,
  normalizeAgentToolNames,
  PiAgentRuntime,
} from "./pi-runtime.js";

function tool(name: string): ConnectorTool {
  return { name, description: name, inputSchema: { type: "object" } };
}

describe("Pi agent runtime", () => {
  it("reports an unknown model without calling a provider", async () => {
    const runtime = new PiAgentRuntime();
    const events: string[] = [];
    for await (const event of runtime.run(
      {
        botId: "b",
        threadId: "t",
        runId: "r",
        prompt: "hi",
        instructions: "test",
        history: [],
        tools: [],
        model: { provider: "openrouter", id: "not-a-real-model-xyz" },
      },
      {
        operationId: "1",
        traceId: "1",
        workspaceId: "w",
        userId: "u",
        signal: new AbortController().signal,
      },
    )) {
      if (event.type === "text") events.push(event.text);
    }
    expect(events.join(" ")).toMatch(/Unknown model/i);
  });
});

describe("Pi model-facing connector tool names", () => {
  it("leaves builtin-compatible names unchanged", () => {
    expect(normalizeAgentToolName("write_file")).toBe("write_file");
    expect(normalizeAgentToolName("read_skill")).toBe("read_skill");
    expect(
      normalizeAgentToolNames([tool("write_file"), tool("shell"), tool("read_skill")]),
    ).toEqual(["write_file", "shell", "read_skill"]);
  });

  it("normalizes punctuation, whitespace, and Unicode to the provider-safe pattern", () => {
    const names = normalizeAgentToolNames([
      tool("destination.write"),
      tool("Google Calendar / criar evento"),
      tool("🦊"),
    ]);

    expect(names[0]).toBe("destination_write");
    expect(names[1]).toBe("Google_Calendar_criar_evento");
    expect(names[2]).toBe("connector_tool");
    expect(names.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
  });

  it("limits long names to the provider's 64-character maximum", () => {
    const name = normalizeAgentToolName(`very-long-${"x".repeat(100)}`);

    expect(name).toHaveLength(64);
    expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it("keeps normalized names unique and deterministic without shadowing valid names", () => {
    const tools = [tool("foo.bar"), tool("foo bar"), tool("foo_bar"), tool("🦊"), tool("🦊")];

    const first = normalizeAgentToolNames(tools);
    const second = normalizeAgentToolNames(tools);

    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(tools.length);
    expect(first[2]).toBe("foo_bar");
    expect(first.every((name) => /^[a-zA-Z0-9_-]+$/.test(name))).toBe(true);
  });
});

describe("MCP Complex Schema & TypeBox Enum Normalization (Feature 1)", () => {
  it("handles null and undefined schema gracefully by returning an empty object schema", () => {
    expect(jsonSchemaParameters(undefined)).toMatchObject({ type: "object", properties: {} });
    expect(jsonSchemaParameters(null)).toMatchObject({ type: "object", properties: {} });
    expect(jsonSchemaParameters("not-an-object")).toMatchObject({ type: "object", properties: {} });
  });

  it("handles empty enums and single-value enums without invalid union construction", () => {
    // Single string literal enum
    const singleStr = jsonField({ enum: ["fast"] });
    expect(singleStr).toMatchObject({ const: "fast" });

    // Single null literal enum
    const singleNull = jsonField({ enum: [null] });
    expect(singleNull).toMatchObject({ type: "null" });

    // Multi-value enum including null
    const multiEnum = jsonField({ enum: ["coding", "reasoning", null] });
    expect(multiEnum).toMatchObject({
      anyOf: [{ const: "coding" }, { const: "reasoning" }, { type: "null" }],
    });
  });

  it("handles anyOf and oneOf schema definitions safely", () => {
    const singleAnyOf = jsonField({ anyOf: [{ type: "string" }] });
    expect(singleAnyOf).toMatchObject({ type: "string" });

    const multiAnyOf = jsonField({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
    expect(multiAnyOf).toMatchObject({
      anyOf: [{ type: "string" }, { type: "number" }],
    });

    const multiOneOf = jsonField({
      oneOf: [{ type: "boolean" }, { type: "null" }],
    });
    expect(multiOneOf).toMatchObject({
      anyOf: [{ type: "boolean" }, { type: "null" }],
    });
  });

  it("handles type array (nullable fields) such as ['string', 'null']", () => {
    const nullableString = jsonField({ type: ["string", "null"] });
    expect(nullableString).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
    });

    const singleTypeArray = jsonField({ type: ["integer"] });
    expect(singleTypeArray).toMatchObject({ type: "number" });
  });

  it("handles dynamic dictionary objects without properties as Record<string, unknown>", () => {
    const dynamicObj = jsonField({ type: "object" });
    expect(dynamicObj).toBeDefined();
    expect(dynamicObj.type).toBe("object");

    const schemaWithDynamic = jsonSchemaParameters({
      type: "object",
      properties: {
        metadata: { type: "object" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["tags"],
    });

    const props = schemaWithDynamic.properties as Record<string, unknown>;
    expect(props.metadata).toBeDefined();
    expect(props.tags).toBeDefined();
  });

  it("compiles a complex third-party MCP tool schema containing mixed unions, enums, and nested structures", () => {
    const complexMcpSchema = {
      type: "object",
      properties: {
        action: { enum: ["query", "mutate", "delete"] },
        fallback: { enum: [null] },
        target: { anyOf: [{ type: "string" }, { type: "number" }] },
        config: {
          type: "object",
          properties: {
            timeoutMs: { type: "integer" },
            retry: { type: "boolean" },
            format: { type: ["string", "null"] },
          },
          required: ["timeoutMs"],
        },
      },
      required: ["action", "target"],
    };

    const compiled = jsonSchemaParameters(complexMcpSchema);
    expect(compiled).toBeDefined();
    expect(compiled.type).toBe("object");
    const compiledProps = compiled.properties as Record<string, unknown>;
    expect(compiledProps.action).toMatchObject({
      anyOf: [{ const: "query" }, { const: "mutate" }, { const: "delete" }],
    });
    expect(compiledProps.target).toMatchObject({
      anyOf: [{ type: "string" }, { type: "number" }],
    });
    expect(compiledProps.fallback).toMatchObject({
      type: "null",
    });
    expect(compiledProps.config).toBeDefined();
  });
});

