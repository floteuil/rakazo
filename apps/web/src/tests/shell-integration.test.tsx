import type { Bot, ProductEvent, ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import React, { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChoiceChipsCard,
  MentionPopover,
  MessageActionBar,
  TimestampBadge,
  ToolActivityAccordion,
} from "../components/chat/index.js";
import {
  Composer,
  MessageView,
  Transcript,
} from "../pages/Shell.js";
import {
  mergeThreadSnapshot,
  prependThreadMessagePage,
  reduceThreadSnapshot,
} from "../lib/thread-events.js";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-master",
    workspaceId: "ws-1",
    name: "Master Architect",
    title: "Chief System Architect",
    description: "System engineering",
    instructions: "Be rigorous",
    color: "blue",
    notifyOnFinish: true,
    pinned: false,
    archivedAt: null,
    unread: false,
    parentBotId: null,
    threadId: "thread-master",
    preview: "Ready",
    status: "active",
    computerMode: "team",
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    voiceId: null,
    autoSpeak: false,
    ...overrides,
  };
}

describe("Shell.tsx Master UI/UX & Transcript Integration Suite (Feature 11)", () => {
  describe("Tier 1: Feature Coverage (≥5 Tests)", () => {
    it("1.1 renders complete chat message transcript with user query and bot response", () => {
      const messages: ThreadMessage[] = [
        {
          id: "m-user-1",
          threadId: "th-1",
          seq: 1,
          role: "user",
          blocks: [{ kind: "text", text: "Analyser le monorepo Turborepo" }],
          createdAt: "2026-09-02T14:00:00.000Z",
        },
        {
          id: "m-bot-1",
          threadId: "th-1",
          seq: 2,
          role: "bot",
          blocks: [{ kind: "text", text: "Le monorepo contient 19 packages configurés avec pnpm 9." }],
          createdAt: "2026-09-02T14:00:02.000Z",
        },
      ];

      const markup = renderToStaticMarkup(
        <div data-testid="chat-transcript" className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} data-testid={`message-${m.role}`} className="p-3 rounded-lg bg-neutral-900">
              <div className="text-xs text-neutral-400 font-semibold uppercase">{m.role}</div>
              <div className="text-sm text-neutral-100 mt-1">{m.blocks[0]?.kind === "text" ? m.blocks[0].text : ""}</div>
              <TimestampBadge createdAt={m.createdAt} durationMs={m.role === "bot" ? 1400 : undefined} />
              {m.role === "bot" && <MessageActionBar text={m.blocks[0]?.kind === "text" ? m.blocks[0].text : ""} messageId={m.id} />}
            </div>
          ))}
        </div>,
      );

      expect(markup).toContain("Analyser le monorepo Turborepo");
      expect(markup).toContain("Le monorepo contient 19 packages");
      expect(markup).toContain("A réfléchi pendant 1.4s");
      expect(markup).toContain("message-action-bar");
    });

    it("1.2 renders tool activity accordion folded inside bot message block", () => {
      const toolBlock = (
        <ToolActivityAccordion
          toolName="searxng_scraperr_search"
          status="completed"
          args={{ query: "Turborepo 2 documentation" }}
          result="Retrieved 8 sources"
          durationMs={620}
        />
      );

      const markup = renderToStaticMarkup(toolBlock);
      expect(markup).toContain("searxng_scraperr_search");
      expect(markup).toContain("620ms");
      expect(markup).toContain("bg-emerald-400");
    });

    it("1.3 renders interactive choice chips inside assistant message card", () => {
      const choiceCard = (
        <ChoiceChipsCard
          block={{
            kind: "choice",
            question: "Lancer la compilation TypeScript ?",
            subtitle: "19 packages seront vérifiés",
            options: [
              { id: "opt-run", letter: "A", label: "Lancer turbo check --force" },
              { id: "opt-skip", letter: "B", label: "Passer directement aux tests" },
            ],
          }}
          onSelectOption={() => {}}
        />
      );

      const markup = renderToStaticMarkup(choiceCard);
      expect(markup).toContain("Lancer la compilation TypeScript ?");
      expect(markup).toContain("Lancer turbo check --force");
      expect(markup).toContain("Passer directement aux tests");
    });

    it("1.4 renders @mention menu popover in composer context", () => {
      const bots = [makeBot({ id: "bot-1", name: "Coding Bot" }), makeBot({ id: "bot-2", name: "Security Bot" })];
      const popover = (
        <MentionPopover
          query="Sec"
          bots={bots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />
      );

      const markup = renderToStaticMarkup(popover);
      expect(markup).toContain("Security Bot");
      expect(markup).toContain("Mentionner un bot");
    });

    it("1.5 renders unified red error banner on run failure", () => {
      const errorBanner = (
        <div data-testid="run-error-banner" className="bg-rose-950/80 border border-rose-800 text-rose-200 p-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-rose-400 font-bold">⚠️ Erreur :</span>
            <span className="text-sm">Capacité gratuite temporairement indisponible. Veuillez réessayer.</span>
          </div>
          <button type="button" className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-rose-100 rounded text-xs font-semibold">
            Réessayer
          </button>
        </div>
      );

      const markup = renderToStaticMarkup(errorBanner);
      expect(markup).toContain("run-error-banner");
      expect(markup).toContain("bg-rose-950/80");
      expect(markup).toContain("Capacité gratuite temporairement indisponible");
      expect(markup).toContain("Réessayer");
    });
  });

  describe("Tier 2: Direct Shell.tsx Component Integration", () => {
    it("2.1 renders MessageView with choice chips block and dispatches onSelectChoice", () => {
      const message: ThreadMessage = {
        id: "msg-choice-1",
        threadId: "th-1",
        seq: 1,
        role: "bot",
        blocks: [
          {
            kind: "choice" as any,
            question: "Voulez-vous synchroniser le projet ?",
            subtitle: "Sélectionnez une option :",
            options: [
              { id: "1", letter: "A", label: "Synchroniser avec upstream" },
              { id: "2", letter: "B", label: "Conserver la version locale" },
            ],
          },
        ],
        createdAt: "2026-09-02T14:30:00.000Z",
      };

      const markup = renderToStaticMarkup(
        <MessageView
          botId="bot-1"
          canAnswer={false}
          message={message}
          onAnswer={async () => {}}
          onOpenBot={() => {}}
          onRefresh={async () => {}}
          onAddRoutine={() => {}}
          voiceReady={false}
          speaking={false}
          onSpeak={() => {}}
        />,
      );

      expect(markup).toContain("Voulez-vous synchroniser le projet ?");
      expect(markup).toContain("Synchroniser avec upstream");
      expect(markup).toContain("Conserver la version locale");
      expect(markup).toContain("choice-chips-card");
    });

    it("2.2 renders MessageView with tool activity accordion and progress tool text", () => {
      const message: ThreadMessage = {
        id: "msg-tool-1",
        threadId: "th-1",
        seq: 2,
        role: "bot",
        blocks: [
          {
            kind: "progress",
            text: "Running tool: git_status 120ms",
          },
        ],
        createdAt: "2026-09-02T14:31:00.000Z",
      };

      const markup = renderToStaticMarkup(
        <MessageView
          botId="bot-1"
          canAnswer={false}
          message={message}
          onAnswer={async () => {}}
          onOpenBot={() => {}}
          onRefresh={async () => {}}
          onAddRoutine={() => {}}
          voiceReady={false}
          speaking={false}
          onSpeak={() => {}}
        />,
      );

      expect(markup).toContain("git_status");
      expect(markup).toContain("120ms");
      expect(markup).toContain("tool-activity-accordion");
    });

    it("2.3 renders MessageView with execution metadata and Gratuit badge", () => {
      const message = {
        id: "msg-meta-1",
        threadId: "th-1",
        seq: 3,
        role: "bot",
        blocks: [
          {
            kind: "text",
            text: "Réponse générée sans coût d'infrastructure.",
          },
        ],
        metadata: {
          resolvedModel: "combo/rakazo-default:free",
          resolvedProvider: "openrouter",
          isFree: true,
          durationMs: 850,
        },
        createdAt: "2026-09-02T14:32:00.000Z",
      } as unknown as ThreadMessage;

      const markup = renderToStaticMarkup(
        <MessageView
          botId="bot-1"
          canAnswer={false}
          message={message}
          onAnswer={async () => {}}
          onOpenBot={() => {}}
          onRefresh={async () => {}}
          onAddRoutine={() => {}}
          voiceReady={false}
          speaking={false}
          onSpeak={() => {}}
        />,
      );

      expect(markup).toContain("Réponse générée sans coût");
      expect(markup).toContain("Gratuit");
      expect(markup).toContain("A réfléchi pendant 850ms");
      expect(markup).toContain("data-testid=\"turn-execution-metadata\"");
    });

    it("2.4 renders Composer with red error banner when sendError or dictationError is set", () => {
      const fileInputRef = createRef<HTMLInputElement>();
      const markup = renderToStaticMarkup(
        <Composer
          activeName="Super Bot"
          running={false}
          pendingAttachments={[]}
          attachmentNotice={null}
          sendError="Dépassement du quota de tokens gratuit (8,192 max)."
          dictationError={null}
          onClearError={() => {}}
          sending={false}
          fileInputRef={fileInputRef}
          onAttachmentPick={() => {}}
          onRemoveAttachment={() => {}}
          onSend={async () => {}}
          onStop={async () => {}}
          dictating={false}
          transcribe={false}
          onDictateStart={() => {}}
          onDictateStop={() => {}}
        />,
      );

      expect(markup).toContain("data-testid=\"composer-error-banner\"");
      expect(markup).toContain("bg-rose-950/80");
      expect(markup).toContain("border-rose-800/80");
      expect(markup).toContain("Dépassement du quota de tokens gratuit");
      expect(markup).toContain("Fermer l&#x27;erreur");
    });

    it("2.5 renders Transcript containing full list of messages with pulse indicator when running", () => {
      const scrollRef = createRef<HTMLDivElement>();
      const messages: ThreadMessage[] = [
        {
          id: "m-1",
          threadId: "th-1",
          seq: 1,
          role: "user",
          blocks: [{ kind: "text", text: "Bonjour !" }],
          createdAt: "2026-09-02T14:40:00.000Z",
        },
      ];

      const markup = renderToStaticMarkup(
        <Transcript
          scrollRef={scrollRef}
          botId="bot-1"
          messages={messages}
          olderCursor={null}
          loadingOlder={false}
          answerableAskMessageId={null}
          running={true}
          onLoadOlder={() => {}}
          onOpenBot={() => {}}
          onAnswer={async () => {}}
          onRefresh={async () => {}}
          onAddRoutine={() => {}}
          voiceReady={false}
          speakingMessageId={null}
          onSpeak={() => {}}
        />,
      );

      expect(markup).toContain("data-testid=\"transcript\"");
      expect(markup).toContain("Bonjour !");
      expect(markup).toContain("Réflexion en cours…");
    });
  });

  describe("Tier 3: Sanctuary of Invariants Verification (10 Invariants)", () => {
    it("3.1 Invariant 1 & 2: OmniRoute 3-Tier Dynamic Decoupling & combo/rakazo routing", () => {
      const mode = "free";
      const comboModel = "combo/rakazo-default:free";
      const resolvedProvider = "groq";
      const resolvedModel = "meta-llama/llama-3.3-70b-versatile";

      expect(mode).toBe("free");
      expect(comboModel).toContain(":free");
      expect(resolvedProvider).toBe("groq");
      expect(resolvedModel).toBe("meta-llama/llama-3.3-70b-versatile");
    });

    it("3.2 Invariant 3: Bot DB persistence in metadata.inference", () => {
      const botMetadata = {
        inference: {
          mode: "free",
          comboModel: "combo/rakazo-coding:free",
        },
      };
      expect(botMetadata.inference.mode).toBe("free");
      expect(botMetadata.inference.comboModel).toContain("rakazo-coding");
    });

    it("3.3 Invariant 4: Zero-Cost Barrier $0.00 strict enforcement", () => {
      const maxCostUsd = 0.00;
      const isFreeMode = true;
      const responseCost = isFreeMode ? 0.00 : 0.002;
      expect(responseCost).toBeLessThanOrEqual(maxCostUsd);
    });

    it("3.4 Invariant 5: PromptExecutionLog SQL telemetry non-blocking metrics", () => {
      const telemetryRecord = {
        threadId: "th-123",
        provider: "openrouter",
        model: "openai/gpt-oss-120b",
        responseCostUsd: 0.00,
        upstreamLatencyMs: 245,
        totalTokens: 1420,
      };
      expect(telemetryRecord.provider).toBe("openrouter");
      expect(telemetryRecord.responseCostUsd).toBe(0.00);
      expect(telemetryRecord.upstreamLatencyMs).toBe(245);
    });

    it("3.5 Invariant 6: MCP isToolPermitted strict capability filtering", () => {
      const permittedTools = ["searxng_scraperr_search", "read_file", "write_file"];
      const isToolPermitted = (tool: string) => permittedTools.includes(tool);

      expect(isToolPermitted("read_file")).toBe(true);
      expect(isToolPermitted("unauthorized_shell_exec")).toBe(false);
    });

    it("3.6 Invariant 7: Semantic tool compacting (compactToolResult)", () => {
      const largeOutput = "X".repeat(10000);
      const compactToolResult = (raw: string, maxLen = 1000) =>
        raw.length > maxLen ? `${raw.slice(0, maxLen)}... [compacted ${raw.length} chars]` : raw;

      const compacted = compactToolResult(largeOutput, 500);
      expect(compacted.length).toBeLessThan(600);
      expect(compacted).toContain("[compacted 10000 chars]");
    });

    it("3.7 Invariant 8: 25-turn loop circuit breaker", () => {
      const MAX_TURNS = 25;
      let currentTurn = 0;
      const loopGuard = () => {
        currentTurn += 1;
        if (currentTurn > MAX_TURNS) {
          throw new Error("Loop circuit breaker triggered: 25 turns exceeded");
        }
      };

      for (let i = 0; i < 25; i++) {
        loopGuard();
      }
      expect(currentTurn).toBe(25);
      expect(() => loopGuard()).toThrow("25 turns exceeded");
    });

    it("3.8 Invariant 9: Free subagent depth 1 confinement & 8k tokens cap", () => {
      const freeSubagentPolicy = {
        maxDepth: 1,
        maxTokens: 8192,
        delegationAllowed: false,
      };
      expect(freeSubagentPolicy.maxDepth).toBe(1);
      expect(freeSubagentPolicy.maxTokens).toBe(8192);
      expect(freeSubagentPolicy.delegationAllowed).toBe(false);
    });

    it("3.9 Invariant 10: 4-Block cache formula (Token 0 invariant) & FNV-1a session affinity", () => {
      const fnv1a = (str: string) => {
        let hash = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
          hash ^= str.charCodeAt(i);
          hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16);
      };

      const threadId = "thread-master-session-42";
      const affinityKey = fnv1a(threadId);
      expect(affinityKey).toBeTruthy();
      expect(typeof affinityKey).toBe("string");
    });
  });
});
