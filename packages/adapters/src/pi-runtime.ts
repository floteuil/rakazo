import { Agent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { type Api, type Model, type Models, Type } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type {
  AdapterContext,
  AgentRunRequest,
  AgentRuntime,
  AgentRuntimeEvent,
  AgentToolExecutionResult,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import { builtinAgentTools, DELEGATION_TOOL_NAMES } from "./builtin-tools.js";
import { sanitizeToolError } from "./enterprise-tools.js";
import {
  createToolCallTracker,
  evaluateToolCallGuard,
  type ToolCallTracker,
} from "./loop-guards.js";
import { PiRuntimeCredentialStore, toOAuthCredential } from "./pi-credentials.js";
import { compactToolResult } from "./tool-compacting.js";

const running = new Map<string, AbortController>();
const catalogModels = builtinModels();
const MAX_PARALLEL_SUBAGENTS = 4;
// Pi forwards these names to OpenAI Responses, whose function-name contract is
// ^[a-zA-Z0-9_-]+$ with a maximum length of 64 characters.
const AGENT_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_AGENT_TOOL_NAME_LENGTH = 64;
const FALLBACK_AGENT_TOOL_NAME = "connector_tool";

export class PiAgentRuntime implements AgentRuntime {
  describe() {
    return {
      id: "pi",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { streaming: true, compaction: true, tools: true, scripted: false },
    };
  }

  async abort(runId: string): Promise<void> {
    running.get(runId)?.abort();
  }

  async *run(request: AgentRunRequest, context: AdapterContext): AsyncIterable<AgentRuntimeEvent> {
    const controller = new AbortController();
    running.set(request.runId, controller);
    const signal = context.signal ?? controller.signal;
    const queue = createQueue();

    const work = (async () => {
      try {
        const provider =
          request.model.provider === "scripted" ? "openrouter" : request.model.provider;
        const modelId =
          request.model.id === "scripted"
            ? (process.env.PI_DEFAULT_MODEL ?? "deepseek/deepseek-v4-flash-0731")
            : request.model.id;
        const models = modelsForRequest(request, provider);
        const model = models.getModel(provider, modelId) ?? models.getModel("openrouter", modelId);
        if (!model) {
          queue.push({ type: "text", text: `Unknown model ${provider}/${modelId}` });
          queue.push({ type: "done" });
          return;
        }

        const apiKey = request.model.oauth
          ? undefined
          : (request.model.apiKey ?? process.env.OPENROUTER_API_KEY);
        const toolDefs = Array.isArray(request.tools) ? request.tools : builtinAgentTools;
        const nestedAgents = new Set<Agent>();
        const host: ToolHost = {
          queue,
          request,
          models,
          model,
          apiKey,
          nestedAgents,
          subagentGate: createGate(MAX_PARALLEL_SUBAGENTS),
          signal,
          depth: 0,
          tracker: createToolCallTracker(),
        };
        const tools = toAgentTools(toolDefs, host);
        const history = toHistory(request.history, request.prompt);

        const agent = new Agent({
          streamFn: (m, ctx, options) =>
            models.streamSimple(m, ctx, {
              ...options,
              maxTokens: Math.max(options?.maxTokens ?? 0, 16384),
              reasoning: options?.reasoning ?? "low",
              onPayload: (payload: unknown) => {
                if (
                  payload &&
                  typeof payload === "object" &&
                  "reasoning" in payload &&
                  (payload as { reasoning?: { effort?: unknown } }).reasoning?.effort === "none"
                ) {
                  delete (payload as { reasoning?: unknown }).reasoning;
                }
                return payload;
              },
            }),
          getApiKey: async () => apiKey,
          transformContext: async (messages) => pruneComputerScreenshotContext(messages),
          initialState: {
            systemPrompt:
              request.instructions ||
              (toolDefs.some((tool) => tool.name === "computer_observe")
                ? "You are a Rakazo bot with a real computer. Use computer_observe and computer_act to operate its visible desktop, including browsers and installed applications. Use shell and the file tools for precise terminal and filesystem work. The user may interact with the same desktop while you run, so re-observe when the screen may have changed. Be concise."
                : "You are a Rakazo bot with a persistent sandbox filesystem and shell. Be concise."),
            model,
            thinkingLevel: "low",
            tools,
            messages: history,
          },
        });

        if (signal.aborted) {
          queue.push({ type: "done", text: "stopped" });
          return;
        }
        const onAbort = () => {
          agent.abort();
          for (const nested of nestedAgents) nested.abort();
        };
        signal.addEventListener("abort", onAbort);

        let streamed = "";
        agent.subscribe((event) => {
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) {
            const delta = event.assistantMessageEvent.delta;
            if (delta) {
              streamed += delta;
              queue.push({ type: "text", text: delta });
            }
          }
          if (event.type === "message_end" && event.message.role === "assistant") {
            const text = assistantText(event.message);
            if (text && !streamed) {
              streamed = text;
              queue.push({ type: "text", text });
            }
            if ("usage" in event.message && event.message.usage) {
              queue.push({
                type: "usage",
                inputTokens: event.message.usage.input ?? 0,
                outputTokens: event.message.usage.output ?? 0,
                provider: model.provider,
                model: model.id,
              });
            }
          }
        });

        queue.push({ type: "progress", text: "working…" });
        const images = request.currentTurnImages?.map((image) => ({
          type: "image" as const,
          data: Buffer.from(image.data).toString("base64"),
          mimeType: image.mimeType,
        }));
        await agent.prompt(request.prompt, images?.length ? images : undefined);
        await agent.waitForIdle();
        signal.removeEventListener("abort", onAbort);

        const error = agent.state.errorMessage;
        if (error) {
          queue.push({ type: "text", text: `I hit a problem: ${sanitizeToolError(error)}` });
          queue.push({ type: "done", text: sanitizeToolError(error) });
          return;
        }
        if (!streamed) {
          const fallback = assistantText(agent.state.messages.at(-1)) || "I finished the work.";
          queue.push({ type: "text", text: fallback });
          streamed = fallback;
        }
        queue.push({ type: "done", text: streamed });
      } catch (error) {
        const message = sanitizeToolError(error instanceof Error ? error.message : String(error));
        queue.push({ type: "text", text: `I hit a problem: ${message}` });
        queue.push({ type: "done", text: message });
      } finally {
        queue.close();
      }
    })();

    try {
      yield* queue.iterate();
      await work;
    } finally {
      running.delete(request.runId);
    }
  }
}

function modelsForRequest(request: AgentRunRequest, provider: string): Models {
  const oauth = request.model.oauth;
  if (!oauth) return catalogModels;

  const persist = oauth.persist;
  return builtinModels({
    credentials: new PiRuntimeCredentialStore(
      provider,
      toOAuthCredential(oauth.credential),
      persist ? (next) => persist(next) : undefined,
    ),
  });
}

function toAgentTools(toolDefs: readonly ConnectorTool[], host: ToolHost): AgentTool[] {
  const names = normalizeAgentToolNames(toolDefs);
  return toolDefs.map((tool, index) => toAgentTool(tool, host, names[index]!));
}

/**
 * Normalize connector names only at the boundary where they are exposed to Pi.
 * Connector execution continues to use the original name captured by toAgentTool.
 */
export function normalizeAgentToolName(name: string): string {
  if (isProviderSafeAgentToolName(name)) return name;
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || FALLBACK_AGENT_TOOL_NAME).slice(0, MAX_AGENT_TOOL_NAME_LENGTH);
}

/**
 * Return one valid, unique model-facing name per connector tool.
 * Existing valid names are reserved first so sanitizing a connector cannot
 * rename or shadow a builtin tool with the same valid name.
 */
export function normalizeAgentToolNames(tools: readonly ConnectorTool[]): string[] {
  const reservedValidNames = new Set(
    tools.filter((tool) => isProviderSafeAgentToolName(tool.name)).map((tool) => tool.name),
  );
  const usedNames = new Set<string>();

  return tools.map((tool) => {
    const base = normalizeAgentToolName(tool.name);
    const originalIsValid = isProviderSafeAgentToolName(tool.name);
    let candidate = base;

    if (usedNames.has(candidate) || (!originalIsValid && reservedValidNames.has(candidate))) {
      candidate = withToolNameSuffix(base, stableToolNameHash(tool.name));
    }

    let suffix = 2;
    while (usedNames.has(candidate) || (!originalIsValid && reservedValidNames.has(candidate))) {
      candidate = withToolNameSuffix(base, `${stableToolNameHash(tool.name)}_${suffix}`);
      suffix += 1;
    }

    usedNames.add(candidate);
    return candidate;
  });
}

function isProviderSafeAgentToolName(name: string): boolean {
  return AGENT_TOOL_NAME_PATTERN.test(name) && name.length <= MAX_AGENT_TOOL_NAME_LENGTH;
}

function withToolNameSuffix(base: string, suffix: string): string {
  const suffixWithSeparator = `_${suffix}`;
  const prefixLength = Math.max(1, MAX_AGENT_TOOL_NAME_LENGTH - suffixWithSeparator.length);
  return `${base.slice(0, prefixLength)}${suffixWithSeparator}`;
}

function stableToolNameHash(name: string): string {
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function toHistory(history: AgentRunRequest["history"], prompt: string) {
  const last = history.at(-1);
  const prior = last?.role === "user" && last.content === prompt ? history.slice(0, -1) : history;
  return prior
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) =>
      m.role === "assistant"
        ? { role: "user" as const, content: `Assistant: ${m.content}`, timestamp: Date.now() }
        : { role: "user" as const, content: m.content, timestamp: Date.now() },
    );
}

function toAgentTool(tool: ConnectorTool, host: ToolHost, exposedName: string): AgentTool {
  return {
    name: exposedName,
    label: tool.name,
    description: tool.description,
    parameters: parametersFor(tool),
    prepareArguments: (args: unknown) => {
      const raw = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      if (tool.name === "destination.write") {
        return {
          collection: String(raw.collection ?? "notes"),
          title: String(raw.title ?? "Rakazo result"),
          body: String(raw.body ?? ""),
        };
      }
      if (tool.name === "remember") {
        return { content: String(raw.content ?? ""), path: String(raw.path ?? "MEMORY.md") };
      }
      if (tool.name === "request_takeover") {
        return { reason: String(raw.reason ?? "I need you on the screen.") };
      }
      if (tool.name === "write_file") {
        return { path: String(raw.path ?? "notes/result.txt"), content: String(raw.content ?? "") };
      }
      if (tool.name === "computer_act") {
        return {
          actions: Array.isArray(raw.actions) ? raw.actions : [],
          observe: raw.observe === undefined ? true : Boolean(raw.observe),
          settle_ms: Number(raw.settle_ms ?? 350),
        };
      }
      if (tool.name === "list_files") return { path: String(raw.path ?? "") };
      if (tool.name === "read_file" || tool.name === "open_path") {
        return { path: String(raw.path ?? "") };
      }
      if (tool.name === "launch_app") {
        return {
          application: String(raw.application ?? ""),
          uri: raw.uri ? String(raw.uri) : "",
        };
      }
      if (tool.name === "shell") {
        return {
          command: String(raw.command ?? ""),
          cwd: raw.cwd ? String(raw.cwd) : "/home/rakazo",
        };
      }
      if (tool.name === "run_subagent") {
        return {
          name: String(raw.name ?? "helper"),
          task: String(raw.task ?? ""),
          instructions: raw.instructions ? String(raw.instructions) : "",
        };
      }
      if (tool.name === "spawn_bot") {
        return {
          name: String(raw.name ?? ""),
          title: raw.title ? String(raw.title) : "",
          instructions: raw.instructions ? String(raw.instructions) : "",
          prompt: raw.prompt ? String(raw.prompt) : "",
        };
      }
      if (tool.name === "archive_bot" || tool.name === "delete_bot") {
        return {
          confirm_name: String(raw.confirm_name ?? raw.confirmName ?? ""),
          bot_id: raw.bot_id ? String(raw.bot_id) : raw.botId ? String(raw.botId) : "",
        };
      }
      if (tool.name === "web_search") {
        return {
          query: String(raw.query ?? raw.q ?? ""),
          categories: raw.categories ? String(raw.categories) : undefined,
          language: raw.language ? String(raw.language) : undefined,
          time_range: raw.time_range
            ? String(raw.time_range)
            : raw.timeRange
              ? String(raw.timeRange)
              : undefined,
          max_results:
            raw.max_results !== undefined
              ? Number(raw.max_results)
              : raw.maxResults !== undefined
                ? Number(raw.maxResults)
                : undefined,
        };
      }
      if (tool.name === "web_scrape") {
        return {
          url: String(raw.url ?? ""),
          selector: raw.selector ? String(raw.selector) : undefined,
          maxLength:
            raw.maxLength !== undefined
              ? Number(raw.maxLength)
              : raw.max_length !== undefined
                ? Number(raw.max_length)
                : undefined,
        };
      }
      if (tool.name === "read_skill") {
        return {
          name: String(raw.name ?? raw.skill ?? raw.target ?? "").trim(),
        };
      }
      // GitHub
      if (tool.name === "github_search_repos") {
        return {
          q: String(raw.q ?? raw.query ?? ""),
          sort: raw.sort ? String(raw.sort) : undefined,
          order: raw.order ? String(raw.order) : undefined,
          per_page:
            raw.per_page !== undefined
              ? Number(raw.per_page)
              : raw.perPage !== undefined
                ? Number(raw.perPage)
                : undefined,
          page: raw.page ? Number(raw.page) : undefined,
        };
      }
      if (tool.name === "github_get_file_contents") {
        return {
          owner: String(raw.owner ?? ""),
          repo: String(raw.repo ?? ""),
          path: String(raw.path ?? ""),
          ref: raw.ref ? String(raw.ref) : undefined,
        };
      }
      if (tool.name === "github_list_issues") {
        return {
          owner: String(raw.owner ?? ""),
          repo: String(raw.repo ?? ""),
          state: raw.state ? String(raw.state) : undefined,
          labels: raw.labels ? String(raw.labels) : undefined,
          per_page:
            raw.per_page !== undefined
              ? Number(raw.per_page)
              : raw.perPage !== undefined
                ? Number(raw.perPage)
                : undefined,
          page: raw.page ? Number(raw.page) : undefined,
          sort: raw.sort ? String(raw.sort) : undefined,
          direction: raw.direction ? String(raw.direction) : undefined,
        };
      }
      if (tool.name === "github_create_issue") {
        return {
          owner: String(raw.owner ?? ""),
          repo: String(raw.repo ?? ""),
          title: String(raw.title ?? ""),
          body: raw.body ? String(raw.body) : undefined,
          labels: Array.isArray(raw.labels) ? raw.labels.map(String) : undefined,
          assignees: Array.isArray(raw.assignees) ? raw.assignees.map(String) : undefined,
        };
      }
      if (tool.name === "github_get_pull_request") {
        return {
          owner: String(raw.owner ?? ""),
          repo: String(raw.repo ?? ""),
          pull_number: Number(raw.pull_number ?? raw.pullNumber ?? 0),
        };
      }
      if (tool.name === "github_create_issue_comment") {
        return {
          owner: String(raw.owner ?? ""),
          repo: String(raw.repo ?? ""),
          issue_number: Number(raw.issue_number ?? raw.issueNumber ?? 0),
          body: String(raw.body ?? ""),
        };
      }
      // Notion
      if (tool.name === "notion_search") {
        return {
          query: raw.query ? String(raw.query) : undefined,
          filter: raw.filter,
          sort: raw.sort,
          page_size:
            raw.page_size !== undefined
              ? Number(raw.page_size)
              : raw.pageSize !== undefined
                ? Number(raw.pageSize)
                : undefined,
        };
      }
      if (tool.name === "notion_get_page") {
        return { page_id: String(raw.page_id ?? raw.pageId ?? "") };
      }
      if (tool.name === "notion_query_database") {
        return {
          database_id: String(raw.database_id ?? raw.databaseId ?? ""),
          filter: raw.filter,
          sorts: raw.sorts,
          page_size:
            raw.page_size !== undefined
              ? Number(raw.page_size)
              : raw.pageSize !== undefined
                ? Number(raw.pageSize)
                : undefined,
        };
      }
      if (tool.name === "notion_create_page") {
        return {
          parent: raw.parent ?? {},
          properties: raw.properties ?? {},
          children: raw.children,
        };
      }
      if (tool.name === "notion_update_page") {
        return {
          page_id: String(raw.page_id ?? raw.pageId ?? ""),
          properties: raw.properties,
          archived: raw.archived !== undefined ? Boolean(raw.archived) : undefined,
          icon: raw.icon,
          cover: raw.cover,
        };
      }
      // Postiz
      if (tool.name === "postiz_list_integrations") {
        return {};
      }
      if (tool.name === "postiz_create_post") {
        return {
          content: String(raw.content ?? ""),
          integrationIds: Array.isArray(raw.integrationIds)
            ? raw.integrationIds.map(String)
            : Array.isArray(raw.integration_ids)
              ? raw.integration_ids.map(String)
              : undefined,
          scheduledAt: raw.scheduledAt
            ? String(raw.scheduledAt)
            : raw.scheduled_at
              ? String(raw.scheduled_at)
              : undefined,
          tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
          media: Array.isArray(raw.media) ? raw.media.map(String) : undefined,
        };
      }
      if (tool.name === "postiz_list_posts") {
        return {
          status: raw.status ? String(raw.status) : undefined,
          limit: raw.limit !== undefined ? Number(raw.limit) : undefined,
          page: raw.page ? Number(raw.page) : undefined,
        };
      }
      // WordPress / Novamira
      if (tool.name === "wordpress_list_posts") {
        return {
          status: raw.status ? String(raw.status) : undefined,
          search: raw.search ? String(raw.search) : undefined,
          per_page:
            raw.per_page !== undefined
              ? Number(raw.per_page)
              : raw.perPage !== undefined
                ? Number(raw.perPage)
                : undefined,
          page: raw.page ? Number(raw.page) : undefined,
          categories: Array.isArray(raw.categories) ? raw.categories.map(Number) : undefined,
          tags: Array.isArray(raw.tags) ? raw.tags.map(Number) : undefined,
        };
      }
      if (tool.name === "wordpress_get_post") {
        return { id: Number(raw.id ?? 0) };
      }
      if (tool.name === "wordpress_create_post") {
        return {
          title: String(raw.title ?? ""),
          content: String(raw.content ?? ""),
          status: raw.status ? String(raw.status) : undefined,
          categories: Array.isArray(raw.categories) ? raw.categories.map(Number) : undefined,
          tags: Array.isArray(raw.tags) ? raw.tags.map(Number) : undefined,
          slug: raw.slug ? String(raw.slug) : undefined,
          excerpt: raw.excerpt ? String(raw.excerpt) : undefined,
        };
      }
      if (tool.name === "wordpress_update_post") {
        return {
          id: Number(raw.id ?? 0),
          title: raw.title ? String(raw.title) : undefined,
          content: raw.content ? String(raw.content) : undefined,
          status: raw.status ? String(raw.status) : undefined,
          categories: Array.isArray(raw.categories) ? raw.categories.map(Number) : undefined,
          tags: Array.isArray(raw.tags) ? raw.tags.map(Number) : undefined,
          slug: raw.slug ? String(raw.slug) : undefined,
          excerpt: raw.excerpt ? String(raw.excerpt) : undefined,
        };
      }
      if (tool.name === "novamira_execute_ability") {
        return {
          site: String(raw.site ?? ""),
          ability: String(raw.ability ?? ""),
          params: raw.params,
        };
      }
      // n8n
      if (tool.name === "n8n_trigger_webhook") {
        return {
          webhookPath: raw.webhookPath
            ? String(raw.webhookPath)
            : raw.webhook_path
              ? String(raw.webhook_path)
              : undefined,
          url: raw.url ? String(raw.url) : undefined,
          data: raw.data,
          method: raw.method ? String(raw.method) : undefined,
        };
      }
      if (tool.name === "n8n_list_workflows") {
        return {
          active: raw.active !== undefined ? Boolean(raw.active) : undefined,
          limit: raw.limit !== undefined ? Number(raw.limit) : undefined,
        };
      }
      if (tool.name === "n8n_get_execution") {
        return {
          executionId: String(raw.executionId ?? raw.execution_id ?? ""),
          includeData: raw.includeData !== undefined ? Boolean(raw.includeData) : undefined,
        };
      }
      // Cloudflare
      if (tool.name === "cloudflare_list_zones") {
        return {
          name: raw.name ? String(raw.name) : undefined,
          status: raw.status ? String(raw.status) : undefined,
          page: raw.page ? Number(raw.page) : undefined,
          per_page:
            raw.per_page !== undefined
              ? Number(raw.per_page)
              : raw.perPage !== undefined
                ? Number(raw.perPage)
                : undefined,
        };
      }
      if (tool.name === "cloudflare_list_dns_records") {
        return {
          zone_id: String(raw.zone_id ?? raw.zoneId ?? ""),
          name: raw.name ? String(raw.name) : undefined,
          type: raw.type ? String(raw.type) : undefined,
          page: raw.page ? Number(raw.page) : undefined,
          per_page:
            raw.per_page !== undefined
              ? Number(raw.per_page)
              : raw.perPage !== undefined
                ? Number(raw.perPage)
                : undefined,
        };
      }
      if (tool.name === "cloudflare_create_dns_record") {
        return {
          zone_id: String(raw.zone_id ?? raw.zoneId ?? ""),
          type: String(raw.type ?? ""),
          name: String(raw.name ?? ""),
          content: String(raw.content ?? ""),
          ttl: raw.ttl ? Number(raw.ttl) : undefined,
          proxied: raw.proxied !== undefined ? Boolean(raw.proxied) : undefined,
          priority: raw.priority ? Number(raw.priority) : undefined,
          comment: raw.comment ? String(raw.comment) : undefined,
        };
      }
      if (tool.name === "cloudflare_purge_cache") {
        return {
          zone_id: String(raw.zone_id ?? raw.zoneId ?? ""),
          purge_everything:
            raw.purge_everything !== undefined
              ? Boolean(raw.purge_everything)
              : raw.purgeEverything !== undefined
                ? Boolean(raw.purgeEverything)
                : undefined,
          files: Array.isArray(raw.files) ? raw.files.map(String) : undefined,
          tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
          hosts: Array.isArray(raw.hosts) ? raw.hosts.map(String) : undefined,
        };
      }
      return raw as never;
    },
    execute: async (toolCallId, params) => {
      const guard = evaluateToolCallGuard(host.tracker, tool.name, params);
      if (!guard.allow) {
        return {
          content: [{ type: "text", text: guard.reason }],
          details: { error: guard.reason },
          terminate: guard.terminate,
        };
      }
      const args = (params ?? {}) as Record<string, unknown>;
      const executionId = toolCallId || `${host.request.runId}:${tool.name}`;
      host.queue.push({ type: "tool", name: tool.name, args, executionId });
      if (tool.name === "request_takeover") {
        host.queue.push({
          type: "takeover",
          reason: String(args.reason ?? "I need you on the screen."),
        });
        return {
          content: [{ type: "text", text: "Takeover requested." }],
          details: args,
          terminate: true,
        };
      }
      if (tool.name === "run_subagent") {
        const result = await executeSubagent(host, executionId, args);
        return {
          content: [{ type: "text", text: result }],
          details: { result },
        };
      }
      if (host.request.executeTool) {
        const result = await host.request.executeTool(tool.name, args, executionId);
        if (isAgentToolExecutionResult(result)) return result;
        return {
          content: [{ type: "text", text: compactToolResult(tool.name, result) }],
          details: result,
        };
      }
      return {
        content: [{ type: "text", text: `${tool.name} is unavailable without an executor.` }],
        details: { error: "no executor" },
      };
    },
  };
}

async function executeSubagent(host: ToolHost, executionId: string, args: Record<string, unknown>) {
  if (host.depth > 0) return "Subagents cannot nest further.";
  await host.subagentGate.acquire();
  const agentId = executionId;
  const name =
    String(args.name ?? "helper")
      .trim()
      .slice(0, 80) || "helper";
  const task = String(args.task ?? "").trim();
  const extra = args.instructions ? String(args.instructions).trim() : "";
  host.queue.push({
    type: "subagent",
    agentId,
    name,
    task,
    status: "running",
    progress: "starting…",
  });

  const availableTools = Array.isArray(host.request.tools)
    ? host.request.tools
    : builtinAgentTools;
  const childDefs = availableTools.filter(
    (tool) => !DELEGATION_TOOL_NAMES.has(tool.name),
  );
  const nestedHost: ToolHost = {
    ...host,
    depth: 1,
    tracker: createToolCallTracker(),
    request: {
      ...host.request,
      tools: childDefs,
    },
  };
  const nested = new Agent({
    streamFn: (m, ctx, options) =>
      host.models.streamSimple(m, ctx, {
        ...options,
        maxTokens: Math.max(options?.maxTokens ?? 0, 8192),
        reasoning: options?.reasoning ?? "low",
        onPayload: (payload: unknown) => {
          if (
            payload &&
            typeof payload === "object" &&
            "reasoning" in payload &&
            (payload as { reasoning?: { effort?: unknown } }).reasoning?.effort === "none"
          ) {
            delete (payload as { reasoning?: unknown }).reasoning;
          }
          return payload;
        },
      }),
    getApiKey: async () => host.apiKey,
    transformContext: async (messages) => pruneComputerScreenshotContext(messages),
    initialState: {
      systemPrompt: [
        `You are a Rakazo subagent named "${name}".`,
        "You run inside the parent bot's turn — you are not a separate bot chat.",
        "Complete the delegated task and return a concise, fully synthesized result.",
        "Execute only the specific objective assigned: do not perform unrelated actions, exploratory browsing, or speculative tool calls.",
        "Invoke only the strictly necessary tools required for this specific subtask.",
        "Do not attempt to spawn bots or further subagents (subagent depth is strictly 1).",
        extra,
      ]
        .filter(Boolean)
        .join(" "),
      model: host.model,
      thinkingLevel: "low",
      tools: toAgentTools(childDefs, nestedHost),
      messages: [],
    },
  });
  host.nestedAgents.add(nested);

  let streamed = "";
  let lastPush = 0;
  nested.subscribe((event) => {
    if (event.type === "tool_execution_start") {
      const toolName = "toolName" in event && event.toolName ? String(event.toolName) : "a tool";
      host.queue.push({
        type: "subagent",
        agentId,
        name,
        task,
        status: "running",
        progress: `using ${toolName}…`,
      });
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      const delta = event.assistantMessageEvent.delta;
      if (delta) {
        streamed += delta;
        const now = Date.now();
        if (now - lastPush >= 80) {
          lastPush = now;
          host.queue.push({
            type: "subagent",
            agentId,
            name,
            task,
            status: "running",
            progress: streamed.slice(-800),
          });
        }
      }
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      const text = assistantText(event.message);
      if (text && !streamed) streamed = text;
      if ("usage" in event.message && event.message.usage) {
        host.queue.push({
          type: "usage",
          inputTokens: event.message.usage.input ?? 0,
          outputTokens: event.message.usage.output ?? 0,
          provider: host.model.provider,
          model: host.model.id,
        });
      }
    }
  });

  try {
    if (host.signal.aborted) {
      host.queue.push({
        type: "subagent",
        agentId,
        name,
        task,
        status: "failed",
        result: "stopped",
      });
      return "stopped";
    }
    const onAbort = () => nested.abort();
    host.signal.addEventListener("abort", onAbort);
    await nested.prompt(task || "Complete the delegated task.");
    await nested.waitForIdle();
    host.signal.removeEventListener("abort", onAbort);
    const error = nested.state.errorMessage;
    if (error) {
      const message = sanitizeToolError(error);
      host.queue.push({ type: "subagent", agentId, name, task, status: "failed", result: message });
      return `Subagent failed: ${message}`;
    }
    const result = streamed || assistantText(nested.state.messages.at(-1)) || "done.";
    const clipped = result.length > 12_000 ? `${result.slice(0, 12_000)}…` : result;
    host.queue.push({
      type: "subagent",
      agentId,
      name,
      task,
      status: "completed",
      result: clipped,
    });
    return clipped;
  } catch (error) {
    const message = sanitizeToolError(error instanceof Error ? error.message : String(error));
    host.queue.push({ type: "subagent", agentId, name, task, status: "failed", result: message });
    return `Subagent failed: ${message}`;
  } finally {
    host.nestedAgents.delete(nested);
    host.subagentGate.release();
  }
}

function parametersFor(tool: ConnectorTool) {
  if (tool.name === "write_file") {
    return Type.Object({ path: Type.String(), content: Type.String() });
  }
  if (tool.name === "destination.write") {
    return Type.Object({
      collection: Type.String(),
      title: Type.String(),
      body: Type.String(),
    });
  }
  if (tool.name === "request_takeover") {
    return Type.Object({ reason: Type.String() });
  }
  if (tool.name === "remember") {
    return Type.Object({ content: Type.String(), path: Type.String() });
  }
  if (tool.name === "shell") {
    return Type.Object({
      command: Type.String(),
      cwd: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "run_subagent") {
    return Type.Object({
      name: Type.String(),
      task: Type.String(),
      instructions: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "spawn_bot") {
    return Type.Object({
      name: Type.String(),
      title: Type.Optional(Type.String()),
      instructions: Type.Optional(Type.String()),
      prompt: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "archive_bot" || tool.name === "delete_bot") {
    return Type.Object({
      confirm_name: Type.String(),
      bot_id: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "web_search") {
    return Type.Object({
      query: Type.String(),
      categories: Type.Optional(Type.String()),
      language: Type.Optional(Type.String()),
      time_range: Type.Optional(Type.String()),
      max_results: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "web_scrape") {
    return Type.Object({
      url: Type.String(),
      selector: Type.Optional(Type.String()),
      maxLength: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "read_skill") {
    return Type.Object({
      name: Type.String(),
    });
  }
  // GitHub
  if (tool.name === "github_search_repos") {
    return Type.Object({
      q: Type.String(),
      sort: Type.Optional(Type.String()),
      order: Type.Optional(Type.String()),
      per_page: Type.Optional(Type.Number()),
      page: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "github_get_file_contents") {
    return Type.Object({
      owner: Type.String(),
      repo: Type.String(),
      path: Type.String(),
      ref: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "github_list_issues") {
    return Type.Object({
      owner: Type.String(),
      repo: Type.String(),
      state: Type.Optional(Type.String()),
      labels: Type.Optional(Type.String()),
      per_page: Type.Optional(Type.Number()),
      page: Type.Optional(Type.Number()),
      sort: Type.Optional(Type.String()),
      direction: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "github_create_issue") {
    return Type.Object({
      owner: Type.String(),
      repo: Type.String(),
      title: Type.String(),
      body: Type.Optional(Type.String()),
      labels: Type.Optional(Type.Array(Type.String())),
      assignees: Type.Optional(Type.Array(Type.String())),
    });
  }
  if (tool.name === "github_get_pull_request") {
    return Type.Object({
      owner: Type.String(),
      repo: Type.String(),
      pull_number: Type.Number(),
    });
  }
  if (tool.name === "github_create_issue_comment") {
    return Type.Object({
      owner: Type.String(),
      repo: Type.String(),
      issue_number: Type.Number(),
      body: Type.String(),
    });
  }
  // Notion
  if (tool.name === "notion_search") {
    return Type.Object({
      query: Type.Optional(Type.String()),
      filter: Type.Optional(
        Type.Object({
          property: Type.Optional(Type.String()),
          value: Type.Optional(Type.String()),
        }),
      ),
      page_size: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "notion_get_page") {
    return Type.Object({ page_id: Type.String() });
  }
  if (tool.name === "notion_query_database") {
    return Type.Object({
      database_id: Type.String(),
      filter: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      sorts: Type.Optional(Type.Array(Type.Record(Type.String(), Type.Unknown()))),
      page_size: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "notion_create_page") {
    return Type.Object({
      parent: Type.Object({
        database_id: Type.Optional(Type.String()),
        page_id: Type.Optional(Type.String()),
      }),
      properties: Type.Record(Type.String(), Type.Unknown()),
      children: Type.Optional(Type.Array(Type.Record(Type.String(), Type.Unknown()))),
    });
  }
  if (tool.name === "notion_update_page") {
    return Type.Object({
      page_id: Type.String(),
      properties: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      archived: Type.Optional(Type.Boolean()),
    });
  }
  // Postiz
  if (tool.name === "postiz_list_integrations") {
    return Type.Object({});
  }
  if (tool.name === "postiz_create_post") {
    return Type.Object({
      content: Type.String(),
      integrationIds: Type.Optional(Type.Array(Type.String())),
      scheduledAt: Type.Optional(Type.String()),
      tags: Type.Optional(Type.Array(Type.String())),
      media: Type.Optional(Type.Array(Type.String())),
    });
  }
  if (tool.name === "postiz_list_posts") {
    return Type.Object({
      status: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number()),
      page: Type.Optional(Type.Number()),
    });
  }
  // WordPress / Novamira
  if (tool.name === "wordpress_list_posts") {
    return Type.Object({
      status: Type.Optional(Type.String()),
      search: Type.Optional(Type.String()),
      per_page: Type.Optional(Type.Number()),
      page: Type.Optional(Type.Number()),
      categories: Type.Optional(Type.Array(Type.Number())),
      tags: Type.Optional(Type.Array(Type.Number())),
    });
  }
  if (tool.name === "wordpress_get_post") {
    return Type.Object({ id: Type.Number() });
  }
  if (tool.name === "wordpress_create_post") {
    return Type.Object({
      title: Type.String(),
      content: Type.String(),
      status: Type.Optional(Type.String()),
      categories: Type.Optional(Type.Array(Type.Number())),
      tags: Type.Optional(Type.Array(Type.Number())),
      slug: Type.Optional(Type.String()),
      excerpt: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "wordpress_update_post") {
    return Type.Object({
      id: Type.Number(),
      title: Type.Optional(Type.String()),
      content: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      categories: Type.Optional(Type.Array(Type.Number())),
      tags: Type.Optional(Type.Array(Type.Number())),
      slug: Type.Optional(Type.String()),
      excerpt: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "novamira_execute_ability") {
    return Type.Object({
      site: Type.String(),
      ability: Type.String(),
      params: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    });
  }
  // n8n
  if (tool.name === "n8n_trigger_webhook") {
    return Type.Object({
      webhookPath: Type.Optional(Type.String()),
      url: Type.Optional(Type.String()),
      data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      method: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "n8n_list_workflows") {
    return Type.Object({
      active: Type.Optional(Type.Boolean()),
      limit: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "n8n_get_execution") {
    return Type.Object({
      executionId: Type.String(),
      includeData: Type.Optional(Type.Boolean()),
    });
  }
  // Cloudflare
  if (tool.name === "cloudflare_list_zones") {
    return Type.Object({
      name: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
      page: Type.Optional(Type.Number()),
      per_page: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "cloudflare_list_dns_records") {
    return Type.Object({
      zone_id: Type.String(),
      name: Type.Optional(Type.String()),
      type: Type.Optional(Type.String()),
      page: Type.Optional(Type.Number()),
      per_page: Type.Optional(Type.Number()),
    });
  }
  if (tool.name === "cloudflare_create_dns_record") {
    return Type.Object({
      zone_id: Type.String(),
      type: Type.String(),
      name: Type.String(),
      content: Type.String(),
      ttl: Type.Optional(Type.Number()),
      proxied: Type.Optional(Type.Boolean()),
      priority: Type.Optional(Type.Number()),
      comment: Type.Optional(Type.String()),
    });
  }
  if (tool.name === "cloudflare_purge_cache") {
    return Type.Object({
      zone_id: Type.String(),
      purge_everything: Type.Optional(Type.Boolean()),
      files: Type.Optional(Type.Array(Type.String())),
      tags: Type.Optional(Type.Array(Type.String())),
      hosts: Type.Optional(Type.Array(Type.String())),
    });
  }
  return jsonSchemaParameters(tool.inputSchema);
}

/** Keep recent visual state without repeatedly resending every earlier full screenshot. */
export function pruneComputerScreenshotContext(
  messages: AgentMessage[],
  screenshotsToKeep = 2,
): AgentMessage[] {
  let remaining = Math.max(0, screenshotsToKeep);
  let transformed: AgentMessage[] | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isComputerScreenshotMessage(message)) continue;
    if (remaining > 0) {
      remaining -= 1;
      continue;
    }
    transformed ??= [...messages];
    transformed[index] = {
      ...message,
      content: message.content.filter((part) => part.type !== "image"),
    };
  }
  return transformed ?? messages;
}

function isComputerScreenshotMessage(
  message: AgentMessage | undefined,
): message is Extract<AgentMessage, { role: "toolResult" }> {
  if (message?.role !== "toolResult" || !message.content.some((part) => part.type === "image")) {
    return false;
  }
  const details = message.details;
  return Boolean(
    details &&
      typeof details === "object" &&
      "frameId" in details &&
      typeof (details as { frameId?: unknown }).frameId === "string",
  );
}

function isAgentToolExecutionResult(result: unknown): result is AgentToolExecutionResult {
  if (
    !result ||
    typeof result !== "object" ||
    (result as { kind?: unknown }).kind !== "agent_tool_result" ||
    !("content" in result)
  ) {
    return false;
  }
  const content = (result as { content?: unknown }).content;
  return (
    Array.isArray(content) &&
    content.every(
      (item) =>
        item &&
        typeof item === "object" &&
        ((item as { type?: unknown }).type === "text" ||
          (item as { type?: unknown }).type === "image"),
    )
  );
}

function jsonSchemaParameters(schema: Record<string, unknown>) {
  const properties = (schema.properties ?? {}) as Record<string, unknown>;
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const fields: Record<string, ReturnType<typeof Type.Optional>> = {};
  for (const [key, spec] of Object.entries(properties)) {
    const field = jsonField(spec);
    fields[key] = (required.has(key) ? field : Type.Optional(field)) as unknown as ReturnType<
      typeof Type.Optional
    >;
  }
  return Type.Object(fields);
}

function jsonField(spec: unknown): ReturnType<typeof Type.String> {
  const definition = spec && typeof spec === "object" ? (spec as Record<string, unknown>) : {};
  if (Array.isArray(definition.enum) && definition.enum.length > 0) {
    return Type.Union(definition.enum.map((value) => Type.Literal(value))) as never;
  }
  const type = "type" in definition ? String(definition.type) : "string";
  if (type === "number" || type === "integer") return Type.Number() as never;
  if (type === "boolean") return Type.Boolean() as never;
  if (type === "array") return Type.Array(jsonField(definition.items)) as never;
  if (type === "object") return jsonSchemaParameters(definition) as never;
  return Type.String();
}


function assistantText(message: unknown): string {
  if (!message || typeof message !== "object" || !("content" in message)) return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part
        ? String(part.text)
        : "",
    )
    .join("");
}

interface EventQueue {
  push(event: AgentRuntimeEvent): void;
  close(): void;
  iterate(): AsyncIterable<AgentRuntimeEvent>;
}

interface ToolHost {
  queue: EventQueue;
  request: AgentRunRequest;
  models: Models;
  model: Model<Api>;
  apiKey: string | undefined;
  nestedAgents: Set<Agent>;
  subagentGate: { acquire(): Promise<void>; release(): void };
  signal: AbortSignal;
  depth: number;
  tracker: ToolCallTracker;
}

function createGate(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return {
    async acquire() {
      if (active >= max) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      }
      active += 1;
    },
    release() {
      active = Math.max(0, active - 1);
      waiters.shift()?.();
    },
  };
}

function createQueue(): EventQueue {
  const items: AgentRuntimeEvent[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  return {
    push(event) {
      items.push(event);
      wake?.();
    },
    close() {
      closed = true;
      wake?.();
    },
    async *iterate() {
      while (!closed || items.length) {
        if (items.length) {
          yield items.shift()!;
          continue;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    },
  };
}
