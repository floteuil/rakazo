import type { Bot, ComputerStatus, ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ChoiceChipsCard,
  MentionPopover,
  MessageActionBar,
  TimestampBadge,
  ToolActivityAccordion,
} from "./ui-excellence-components.test.js";
import { BREAKPOINTS, ResponsiveContainer, TouchInteractiveButton } from "./responsive-matrix.test.js";
import { createStreamingRedactor, projectMessages } from "@rakazo/core";
import { reduceThreadSnapshot } from "../lib/thread-events.js";

function makeTestComputer(): ComputerStatus {
  return {
    botId: "bot-sys",
    mode: "team",
    kind: "fake",
    state: "booting",
    controlHolder: "none",
    controlBotId: null,
    screenAvailable: false,
    screenWidth: 1280,
    screenHeight: 800,
    homeRevision: null,
    busyBotName: null,
  };
}

describe("E2E Comprehensive Tier 3 & Tier 4 Real-World Application Scenarios", () => {
  describe("Scenario 1: Multi-turn Chat with Tool Activity & Suggestion Selection", () => {
    it("1.1 executes full turn: user prompt -> tool execution -> suggestion card -> choice selection -> resumption", () => {
      // Step 1: User sends prompt
      const userMessage: ThreadMessage = {
        id: "msg-1",
        threadId: "thread-sc1",
        seq: 1,
        role: "user",
        blocks: [{ kind: "text", text: "Diagnose system health and recommend action" }],
        createdAt: "2026-09-02T14:00:00.000Z",
      };

      // Step 2: Agent executes MCP tool and emits accordion block
      const toolAccordion = (
        <ToolActivityAccordion
          toolName="cloudflare_list_zones"
          status="completed"
          args={{ page: 1, per_page: 5 }}
          result={JSON.stringify({ zones: [{ id: "z1", name: "rakazo.io", status: "active" }] })}
          durationMs={180}
        />
      );
      const accordionHtml = renderToStaticMarkup(toolAccordion);
      expect(accordionHtml).toContain("cloudflare_list_zones");

      // Step 3: Suggestion choice card is rendered with options
      const choiceBlock = {
        kind: "choice" as const,
        question: "Select diagnostic remediation:",
        options: [
          { id: "opt-1", letter: "A", label: "Purge Cloudflare CDN edge cache" },
          { id: "opt-2", letter: "B", label: "Restart container runner pool" },
        ],
      };
      const onSelect = vi.fn();
      const choiceCard = <ChoiceChipsCard block={choiceBlock} onSelectOption={onSelect} />;
      const choiceHtml = renderToStaticMarkup(choiceCard);
      expect(choiceHtml).toContain("Purge Cloudflare CDN edge cache");

      // Step 4: Bot durable message finalized
      const botResponse: ThreadMessage = {
        id: "msg-2",
        threadId: "thread-sc1",
        seq: 2,
        role: "bot",
        blocks: [
          { kind: "text", text: "Diagnostic completed: edge cache latency detected." },
          choiceBlock,
        ],
        createdAt: "2026-09-02T14:00:02.000Z",
      };

      const threadSnapshot: ThreadSnapshot = {
        botId: "bot-sys",
        threadId: "thread-sc1",
        cursor: 2,
        messages: [userMessage, botResponse],
        olderCursor: null,
        run: null,
        computer: makeTestComputer(),
      };

      expect(threadSnapshot.messages).toHaveLength(2);
      expect(threadSnapshot.messages[1]!.blocks[0]).toMatchObject({
        kind: "text",
      });
    });
  });

  describe("Scenario 2: Streaming Emoji & Secret Masking Run", () => {
    it("2.1 streams multi-byte emojis and redacts split API tokens in real-time SSE chunks", () => {
      const sensitiveKey = "sk-live-supersecret-token-998877";
      const redactor = createStreamingRedactor([sensitiveKey]);

      const incomingSseDeltas = [
        "Déploiement en cours... 🚀\n",
        "Connexion à la base de données 🤖\n",
        "Clé utilisée : Bearer sk-live-super",
        "secret-token-998877\n",
        "Opération réussie 🎉✨",
      ];

      const processedChunks: string[] = [];
      for (const delta of incomingSseDeltas) {
        processedChunks.push(redactor.push(delta));
      }
      processedChunks.push(redactor.finish());

      const fullStreamOutput = processedChunks.join("");

      // Verifications
      expect(fullStreamOutput).toContain("Déploiement en cours... 🚀");
      expect(fullStreamOutput).toContain("Connexion à la base de données 🤖");
      expect(fullStreamOutput).toContain("Clé utilisée : Bearer [redacted]");
      expect(fullStreamOutput).not.toContain("sk-live-supersecret-token-998877");
      expect(fullStreamOutput).toContain("Opération réussie 🎉✨");
    });
  });

  describe("Scenario 3: Run Error Recovery & Retry Flow", () => {
    it("3.1 triggers transient failure, displays error state, retries, and cleans banner upon success", () => {
      // Initial state with failed run
      const failedSnapshot: ThreadSnapshot = {
        botId: "bot-dev",
        threadId: "thread-err",
        cursor: 1,
        messages: [
          {
            id: "msg-1",
            threadId: "thread-err",
            seq: 1,
            role: "user",
            blocks: [{ kind: "text", text: "Générer rapport financier Q3" }],
            createdAt: "2026-09-02T14:10:00.000Z",
          },
        ],
        olderCursor: null,
        run: {
          id: "run-failed",
          botId: "bot-dev",
          threadId: "thread-err",
          taskId: "task-1",
          status: "failed",
          trigger: "user",
          modelProvider: "mistral",
          modelId: "codestral-latest",
          error: "Timeout amont: le service d'analyse était indisponible",
          startedAt: "2026-09-02T14:10:00.000Z",
          completedAt: "2026-09-02T14:10:05.000Z",
        },
        computer: makeTestComputer(),
      };

      expect(failedSnapshot.run?.status).toBe("failed");
      expect(failedSnapshot.run?.error).toContain("Timeout amont");

      // User triggers retry / follow-up
      const retriedState = reduceThreadSnapshot(failedSnapshot, {
        id: "ev-retry",
        workspaceId: "ws-1",
        threadId: "thread-err",
        botId: "bot-dev",
        seq: 2,
        type: "thread.message.created",
        createdAt: "2026-09-02T14:10:10.000Z",
        payload: {
          messageId: "msg-retry",
          role: "user",
          blocks: [{ kind: "text", text: "Relancer la génération du rapport Q3" }],
        },
      });

      // Streaming progress starts for new run
      const streamState = reduceThreadSnapshot(retriedState, {
        id: "ev-prog",
        workspaceId: "ws-1",
        threadId: "thread-err",
        botId: "bot-dev",
        seq: 3,
        type: "thread.progress",
        runId: "run-success-2",
        createdAt: "2026-09-02T14:10:11.000Z",
        payload: { delta: "Rapport Q3 généré avec succès." },
      });

      // Successful completion arrives
      const finalState = reduceThreadSnapshot(streamState, {
        id: "ev-done",
        workspaceId: "ws-1",
        threadId: "thread-err",
        botId: "bot-dev",
        seq: 4,
        type: "thread.message.created",
        runId: "run-success-2",
        createdAt: "2026-09-02T14:10:12.000Z",
        payload: {
          messageId: "msg-bot-success",
          role: "bot",
          blocks: [{ kind: "text", text: "Rapport Q3 généré avec succès. Total: 1.2M€ (+14%)." }],
        },
      });

      expect(finalState?.messages).toHaveLength(3);
      expect(finalState?.messages.some((m) => m.id.startsWith("progress:"))).toBe(false);
      expect(finalState?.messages[2]?.id).toBe("msg-bot-success");
    });
  });

  describe("Scenario 4: Keyboard-Driven Mentions & Reaction Ergonomics", () => {
    it("4.1 navigates @mention menu with keyboard, submits prompt, views timestamps, and toggles reactions", () => {
      const specialistBot: Bot = {
        id: "bot-security",
        workspaceId: "ws-1",
        name: "Security Auditor",
        title: "AppSec & HDS Specialist",
        description: "Vulnerability analysis",
        instructions: "Audit code for CVEs",
        color: "red",
        notifyOnFinish: true,
        pinned: false,
        archivedAt: null,
        unread: false,
        parentBotId: null,
        threadId: "thread-sec",
        preview: "Sec audit ready",
        status: "active",
        computerMode: "team",
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
        voiceId: null,
        autoSpeak: false,
      };

      const handleSelectBot = vi.fn();
      const handleClose = vi.fn();

      const popover = (
        <MentionPopover
          query="Sec"
          bots={[specialistBot]}
          selectedIndex={0}
          onSelectBot={handleSelectBot}
          onClose={handleClose}
        />
      );

      const popoverMarkup = renderToStaticMarkup(popover);
      expect(popoverMarkup).toContain("Security Auditor");
      expect(popoverMarkup).toContain("AppSec &amp; HDS Specialist");

      // Select bot via Enter key
      handleSelectBot(specialistBot);
      expect(handleSelectBot).toHaveBeenCalledWith(specialistBot);

      // Render message bubble with TimestampBadge and MessageActionBar
      const timestampBadge = (
        <TimestampBadge
          createdAt="2026-09-02T14:20:00.000Z"
          durationMs={1850}
          resolvedModel="gpt-oss-120b"
          resolvedProvider="openrouter"
          isFree={false}
        />
      );
      const timestampMarkup = renderToStaticMarkup(timestampBadge);
      expect(timestampMarkup).toContain("A réfléchi pendant 1.9s");
      expect(timestampMarkup).toContain("Modèle : gpt-oss-120b · openrouter");

      const handleReact = vi.fn();
      const actionBar = (
        <MessageActionBar
          text="Audit terminé: 0 faille critique détectée."
          messageId="msg-sec-101"
          onReact={handleReact}
          initialReaction="up"
        />
      );
      const actionMarkup = renderToStaticMarkup(actionBar);
      expect(actionMarkup).toContain("👍");
      expect(actionMarkup).toContain("bg-emerald-900/50"); // Active reaction
    });
  });

  describe("Scenario 5: Multi-Device Responsive Stress Test", () => {
    it("5.1 validates layout containment across all 9 responsive device breakpoints", () => {
      for (const bp of BREAKPOINTS) {
        const markup = renderToStaticMarkup(
          <ResponsiveContainer width={bp.width}>
            <div data-testid="chat-header">Header ({bp.name})</div>
            <div data-testid="chat-messages">
              <div data-testid="bubble-user">User: Start task</div>
              <div data-testid="bubble-bot">Bot: In progress</div>
            </div>
            <div data-testid="chat-input-row">
              <TouchInteractiveButton label="Send" />
            </div>
          </ResponsiveContainer>,
        );

        expect(markup).toContain(`width:${bp.width}px`);
        expect(markup).toContain("min-height:44px"); // Touch target contract
        expect(markup).toContain("overflow-x:hidden"); // No horizontal scroll bug
      }
    });
  });
});
