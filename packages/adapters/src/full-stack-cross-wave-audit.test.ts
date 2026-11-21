import type { AdapterContext, MemorySnapshot, MemoryStore } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { collectDeploymentSecretValues } from "./enterprise-tools.js";
import { isReadOnlyAgentToolCall } from "./executor.js";
import { inferFreeProviderFromModel, RakazoFreePolicyEngine } from "./free-policy-engine.js";
import {
  appendBoundedMemoryArchive,
  isInternalRuntimeMemoryPath,
  loadAgentMemoryContext,
} from "./memory-context.js";
import {
  getConnectorReadinessMap,
  OmniRouteInferenceTransport,
  probeOmniRouteHealth,
} from "./omniroute-transport.js";
import { PiAiInferenceTransport } from "./pi-ai-transport.js";
import {
  CanonicalAgentRuntime,
  delimitUntrustedAgentMessages,
  globalColdCacheTracker,
  pruneColdCacheAgentMessages,
} from "./pi-runtime.js";

function createTestMemoryStore(): MemoryStore & { rawDocs: Map<string, string> } {
  const rawDocs = new Map<string, string>();
  const meta = new Map<string, { id: string; path: string; revision: number; updatedAt: string }>();
  return {
    rawDocs,
    describe: () => ({
      id: "test-mem",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { search: true, revisions: true, markdownPortable: true },
    }),
    async read(req): Promise<MemorySnapshot> {
      const prefix = `${req.scope}:${req.botId ?? ""}:`;
      const documents: MemorySnapshot["documents"] = [];
      for (const [key, content] of rawDocs.entries()) {
        if (!key.startsWith(prefix)) continue;
        const m = meta.get(key)!;
        if (req.path && m.path !== req.path) continue;
        documents.push({ ...m, content });
      }
      return { documents };
    },
    async search() {
      return [];
    },
    async commit(req) {
      const key = `${req.scope}:${req.botId ?? ""}:${req.path}`;
      const prev = meta.get(key);
      const revision = (prev?.revision ?? 0) + 1;
      rawDocs.set(key, req.content);
      meta.set(key, {
        id: prev?.id ?? `doc_${meta.size + 1}`,
        path: req.path,
        revision,
        updatedAt: new Date().toISOString(),
      });
      return { id: meta.get(key)!.id, path: req.path, revision, content: req.content };
    },
    async *exportMarkdown() {},
    async importMarkdown() {
      return { id: "imp", path: "MEMORY.md", revision: 1, content: "" };
    },
  };
}

const dummyCtx: AdapterContext = {
  operationId: "op-audit",
  traceId: "tr-audit",
  workspaceId: "ws-audit",
  userId: "user-audit",
  botId: "bot-audit",
  signal: new AbortController().signal,
};

describe("Full-Stack Cross-Wave Integration Certification (OpenMausBot + OpenBot + Hermes + OmniRoute + Nod)", () => {
  it("1. isolates internal JSON stores (learned-skills & routine watches) out of <durable_memory>", async () => {
    expect(isInternalRuntimeMemoryPath("memory/learned-skills.json")).toBe(true);
    expect(isInternalRuntimeMemoryPath("routines/observations/crm-watch.json")).toBe(true);
    expect(isInternalRuntimeMemoryPath("memory/archive.md")).toBe(true);
    expect(isInternalRuntimeMemoryPath(".rakazo/outputs/abc.txt")).toBe(true);
    expect(isInternalRuntimeMemoryPath("MEMORY.md")).toBe(false);

    const store = createTestMemoryStore();
    await store.commit(
      { scope: "bot", botId: "bot-audit", path: "MEMORY.md", content: "Client préfère un rapport hebdomadaire le vendredi." },
      dummyCtx,
    );
    await store.commit(
      {
        scope: "bot",
        botId: "bot-audit",
        path: "memory/learned-skills.json",
        content: JSON.stringify({ version: 1, skills: [{ slug: "secret-proc", body: "VERY_LONG_SKILL_BODY_SHOULD_NOT_LEAK" }] }),
      },
      dummyCtx,
    );
    await store.commit(
      {
        scope: "bot",
        botId: "bot-audit",
        path: "routines/observations/n8n.json",
        content: JSON.stringify({ baselineValue: "INTERNAL_WATCH_JSON_DO_NOT_LEAK" }),
      },
      dummyCtx,
    );

    const promptBlock = await loadAgentMemoryContext(store, "bot-audit", dummyCtx, "google/gemini-3.1-pro");
    expect(promptBlock).toContain("Client préfère un rapport hebdomadaire le vendredi.");
    expect(promptBlock).not.toContain("VERY_LONG_SKILL_BODY_SHOULD_NOT_LEAK");
    expect(promptBlock).not.toContain("INTERNAL_WATCH_JSON_DO_NOT_LEAK");
  });

  it("2. appends multiple memory evictions into memory/archive.md without overwriting earlier entries", async () => {
    const store = createTestMemoryStore();
    await appendBoundedMemoryArchive(
      store,
      { scope: "bot", botId: "bot-audit", evictedLines: ["Fait ancien #1", "Fait ancien #2"] },
      dummyCtx,
    );
    await appendBoundedMemoryArchive(
      store,
      { scope: "bot", botId: "bot-audit", evictedLines: ["Fait ancien #3"] },
      dummyCtx,
    );

    const archiveContent = store.rawDocs.get("bot:bot-audit:memory/archive.md") ?? "";
    expect(archiveContent).toContain("Fait ancien #1");
    expect(archiveContent).toContain("Fait ancien #2");
    expect(archiveContent).toContain("Fait ancien #3");
  });

  it("3. propagates live Tier-3 OmniRoute resolvedProvider/resolvedModel headers & normalizes tool names end-to-end", async () => {
    let sentToolsPayload: any[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const parsedBody = JSON.parse(String(init?.body ?? "{}"));
      sentToolsPayload = parsedBody.tools ?? [];

      const isSecondCall = parsedBody.messages?.some((m: any) => m.role === "tool");
      const sseLines = isSecondCall
        ? [
            'data: {"model":"mistralai/codestral-latest","choices":[{"delta":{"content":" Terminé."}}],"usage":{"prompt_tokens":120,"completion_tokens":30,"cached_tokens":80}}\n\n',
            "data: [DONE]\n\n",
          ]
        : [
            'data: {"model":"mistralai/codestral-latest","choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc_dot","function":{"name":"composio_gmail_send_draft","arguments":"{\\"subject\\":\\"Bonjour\\"}"}}]}}]}\n\n',
            "data: [DONE]\n\n",
          ];

      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          for (const chunk of sseLines) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "x-omniroute-provider": "mistralai",
          "x-omniroute-model": "mistralai/codestral-latest",
          "x-omniroute-response-cost": "0",
        },
      });
    });

    try {
      const executedTools: Array<{ name: string; args: any }> = [];
      const runtime = new CanonicalAgentRuntime({
        transport: new OmniRouteInferenceTransport({
          baseUrl: "http://omniroute.local/v1",
          apiKey: "test-key",
        }),
      });

      const events: any[] = [];
      for await (const ev of runtime.run(
        {
          botId: "bot-omni",
          threadId: "thread-omni",
          runId: "run-omni",
          prompt: "Prépare le brouillon",
          instructions: "Assistant souverain",
          history: [],
          tools: [
            {
              // Intentional dots/colons to verify OpenAI-safe tool name normalization & reverse mapping
              name: "composio.gmail:send.draft",
              description: "Create Gmail draft",
              inputSchema: { type: "object", properties: { subject: { type: "string" } } },
            },
          ],
          model: { provider: "omniroute", id: "combo/rakazo-writing" },
          executeTool: async (name, args) => {
            executedTools.push({ name, args });
            return { draftId: "d_1", createdAt: "2026-07-15T10:00:00Z" };
          },
        },
        dummyCtx,
      )) {
        events.push(ev);
      }

      // Sent tool name to OmniRoute must strictly match ^[a-zA-Z0-9_-]{1,64}$
      expect(sentToolsPayload[0].function.name).toBe("composio_gmail_send_draft");
      // Executor must receive the original un-normalized tool name!
      expect(executedTools).toEqual([{ name: "composio.gmail:send.draft", args: { subject: "Bonjour" } }]);

      const usageEv = events.find((e) => e.type === "usage" && e.inputTokens === 120);
      expect(usageEv).toBeTruthy();
      expect(usageEv.resolvedProvider).toBe("mistralai");
      expect(usageEv.resolvedModel).toBe("mistralai/codestral-latest");
      expect(usageEv.cacheHitRatio).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("4. emits each toolCall exactly once in PiAiInferenceTransport without duplicate name concatenation", async () => {
    const fakeModels: any = {
      getModel: () => ({ id: "openai/gpt-oss-120b", provider: "openrouter", api: "openai-completions" }),
      streamSimple: async () => {
        async function* gen() {
          yield { type: "toolcall_start", index: 0, id: "call_abc", name: "web_search", arguments: "{}" };
          yield { type: "toolcall_delta", index: 0, id: "call_abc", name: "web_search", arguments: '{"query":"rakazo"}' };
          yield { type: "text_delta", delta: "Recherche en cours..." };
        }
        const iterable: any = gen();
        iterable.result = async () => ({
          role: "assistant",
          content: [
            { type: "text", text: "Recherche en cours..." },
            { type: "toolCall", id: "call_abc", name: "web_search", arguments: { query: "rakazo" } },
          ],
          usage: { input: 50, output: 15, cacheRead: 25, totalTokens: 65 },
        });
        return iterable;
      },
    };

    const transport = new PiAiInferenceTransport({ apiKey: "test-key", models: fakeModels });
    const chunks: any[] = [];
    for await (const ch of transport.stream({
      model: "openai/gpt-oss-120b",
      provider: "openrouter",
      messages: [{ role: "user", content: "Cherche rakazo" }],
      tools: [],
    })) {
      chunks.push(ch);
    }

    const toolChunks = chunks.filter((c) => c.type === "tool_call");
    expect(toolChunks).toHaveLength(1);
    expect(toolChunks[0].toolCall.name).toBe("web_search");
    expect(JSON.parse(toolChunks[0].toolCall.arguments)).toEqual({ query: "rakazo" });
  });

  it("5. coordinates Cold-Cache 5-min pruning + Untrusted Envelope inside PiAgentRuntime transformContext", () => {
    const sessionKey = "audit-pi-cold-cache";
    const bigJson = `{"records":"${"X".repeat(2_800)}","ts":"2026-01-20T12:00:00Z"}`;
    const baseTurn: any[] = [
      { role: "user", content: [{ type: "text", text: "Premier tour" }] },
      {
        role: "toolResult",
        toolCallId: "tc_1",
        toolName: "twenty_list_people",
        isError: false,
        content: [{ type: "text", text: bigJson }],
        details: { count: 50 },
      },
      { role: "assistant", content: [{ type: "text", text: "Voici la liste." }] },
      // Keep >= 6 trailing messages so safeCutoff protects recent turns while pruning older ones
      { role: "user", content: [{ type: "text", text: "Suite 1" }] },
      { role: "assistant", content: [{ type: "text", text: "Réponse 1" }] },
      { role: "user", content: [{ type: "text", text: "Suite 2" }] },
      { role: "assistant", content: [{ type: "text", text: "Réponse 2" }] },
      { role: "user", content: [{ type: "text", text: "Suite 3" }] },
      { role: "assistant", content: [{ type: "text", text: "Réponse 3" }] },
      { role: "user", content: [{ type: "text", text: "Dernier tour" }] },
    ];

    const t0 = 1_800_000_000_000;
    // Initial turn establishes warm baseline
    pruneColdCacheAgentMessages(baseTurn.slice(0, 2), {
      sessionKey,
      provider: "openrouter",
      model: "google/gemini-3.1-pro",
      nowMs: t0,
    });

    // Warm (+2 min < 5 min): NOT pruned
    const warm = pruneColdCacheAgentMessages(baseTurn, {
      sessionKey,
      provider: "openrouter",
      model: "google/gemini-3.1-pro",
      nowMs: t0 + 2 * 60_000,
    }) as any[];
    expect(warm[1].content[0].text.length).toBe(bigJson.length);

    // Cold (+10 min > 5 min): pruned AND still wrapped in <untrusted_tool_result>
    const cold = delimitUntrustedAgentMessages(
      pruneColdCacheAgentMessages(baseTurn, {
        sessionKey,
        provider: "openrouter",
        model: "google/gemini-3.1-pro",
        nowMs: t0 + 10 * 60_000,
      }),
      "Europe/Paris",
    ) as any[];
    expect(cold[1].content[0].text).toContain("caractères élagués après expiration du cache froid");
    expect(cold[1].content[0].text).toContain('<untrusted_tool_result source="twenty_list_people">');
    globalColdCacheTracker.clear();
  });

  it("6. classifies read-only vs mutating MCP/skill calls accurately & collects all deployment secrets", () => {
    expect(isReadOnlyAgentToolCall("read_skill", { name: "clean-code" })).toBe(true);
    expect(isReadOnlyAgentToolCall("read_skill", { action: "read", name: "clean-code" })).toBe(true);
    expect(isReadOnlyAgentToolCall("read_skill", { action: "save", name: "my-proc" })).toBe(false);
    expect(isReadOnlyAgentToolCall("read_skill", { action: "patch", name: "my-proc" })).toBe(false);

    expect(isReadOnlyAgentToolCall("twenty_list_people", {})).toBe(true);
    expect(isReadOnlyAgentToolCall("twenty_create_person", {})).toBe(false);
    expect(isReadOnlyAgentToolCall("affine_list_docs", {})).toBe(true);
    expect(isReadOnlyAgentToolCall("affine_create_doc", {})).toBe(false);
    expect(isReadOnlyAgentToolCall("ubersuggest_keyword_overview", {})).toBe(true);
    expect(isReadOnlyAgentToolCall("context7_query_docs", {})).toBe(true);

    const secrets = collectDeploymentSecretValues({
      TWENTY_API_KEY: "twenty_secret_token_example",
      COOLIFY_API_TOKEN: "coolify_token_example",
      SHORT_IGNORED: "abc",
      UBERSUGGEST_API_KEY: "uber_secret_token_example",
    } as any);
    expect(secrets).toContain("twenty_secret_token_example");
    expect(secrets).toContain("coolify_token_example");
    expect(secrets).toContain("uber_secret_token_example");
    expect(secrets).not.toContain("abc");
  });

  it("7. accepts live OmniRoute v3.8.51 'gemini' / 'nvidia' / 'mistral' free providers while blocking unapproved commercial ones", () => {
    const engine = new RakazoFreePolicyEngine();
    expect(() => engine.assertZeroCostAndAllowed("gemini", 0.0)).not.toThrow();
    expect(() => engine.assertZeroCostAndAllowed("mistral", 0.0)).not.toThrow();
    expect(() => engine.assertZeroCostAndAllowed("nvidia", 0.0)).not.toThrow();
    expect(() => engine.assertZeroCostAndAllowed("opencode", 0.0)).not.toThrow();
    expect(() => engine.assertZeroCostAndAllowed("gemini", 0.0001)).toThrow();
    for (const blocked of ["openai", "anthropic", "cohere", "groq", "together", "novamira"]) {
      expect(() => engine.assertZeroCostAndAllowed(blocked, 0.0)).toThrow();
    }

    expect(inferFreeProviderFromModel("gemini-3.5-flash-lite")).toBe("gemini");
    expect(inferFreeProviderFromModel("codestral-2508")).toBe("mistralai");
    expect(inferFreeProviderFromModel("deepseek-r1:free")).toBe("deepseek");
    expect(inferFreeProviderFromModel("keepalive")).toBeUndefined();
  });

  it("8. ignores OmniRoute SSE keepalive frames and infers resolvedProvider when x-omniroute-provider is omitted", async () => {
    const ssePayload = [
      'data: {"id":"chatcmpl-keepalive","object":"chat.completion.chunk","model":"keepalive","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
      "",
      'data: {"id":"chatcmpl-real","object":"chat.completion.chunk","model":"gemini-3.5-flash-lite","choices":[{"index":0,"delta":{"content":"Connexion OmniRoute validée !"},"finish_reason":null}]}',
      "",
      'data: {"id":"chatcmpl-real","object":"chat.completion.chunk","model":"gemini-3.5-flash-lite","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":24,"completion_tokens":8,"total_tokens":32}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const encoder = new TextEncoder();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(ssePayload));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "x-omniroute-response-cost": "0.0000000000",
          },
        },
      ),
    );

    try {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: "http://omniroute.local/v1",
        apiKey: "test_key",
      });
      const chunks = [];
      for await (const ch of transport.stream({
        model: "combo/rakazo-fast",
        messages: [{ role: "user", content: "Ping" }],
      })) {
        chunks.push(ch);
      }

      const textOut = chunks
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      expect(textOut).toBe("Connexion OmniRoute validée !");

      const usageChunk = chunks.find((c) => c.type === "usage");
      expect(usageChunk?.usage?.resolvedModel).toBe("gemini-3.5-flash-lite");
      expect(usageChunk?.usage?.resolvedProvider).toBe("gemini");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("9. probes OmniRoute /models without leaking secrets and builds boolean readiness map for all 18 MCPs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          object: "list",
          data: [
            { id: "combo/rakazo-fast" },
            { id: "combo/rakazo-coding" },
            { id: "combo/rakazo-reasoning" },
            { id: "combo/rakazo-writing" },
            { id: "combo/rakazo-analysis" },
            { id: "gemini/gemini-3.5-flash-lite" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    try {
      const probe = await probeOmniRouteHealth({
        baseUrl: "http://omniroute-probe-test.local/v1",
        apiKey: "secret_should_never_leak",
        forceRefresh: true,
      });
      expect(probe.configured).toBe(true);
      expect(probe.ok).toBe(true);
      expect(probe.totalModels).toBe(6);
      expect(probe.rakazoCombos).toHaveLength(5);
      expect(JSON.stringify(probe)).not.toContain("secret_should_never_leak");
      expect(JSON.stringify(probe)).not.toContain("omniroute-probe-test.local");

      const map = getConnectorReadinessMap({
        SEARXNG_URL: "http://searxng:8080",
        POSTIZ_API_KEY: "pk_test",
        TWENTY_API_URL: "http://twenty:3000",
        TWENTY_API_KEY: "",
      } as any);
      expect(map.searxng_scraperr).toBe(true);
      expect(map.postiz).toBe(true);
      expect(map.twenty_crm).toBe(false);
      expect(map.system_platform).toBe(true);
      expect(map.image_optimizer).toBe(true);
      expect(Object.keys(map)).toHaveLength(18);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
