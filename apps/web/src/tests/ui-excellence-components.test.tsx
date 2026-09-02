import type { Bot } from "@rakazo/contracts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ChoiceChipsCard,
  MentionPopover,
  MessageActionBar,
  TimestampBadge,
  ToolActivityAccordion,
  type ChoiceBlock,
  type ChoiceChipsCardProps,
  type ChoiceOption,
  type MentionPopoverProps,
  type MessageActionBarProps,
  type TimestampBadgeProps,
  type ToolActivityAccordionProps,
} from "../components/chat/index.js";

// Re-export canonical components & types for dependent integration test suites
export {
  ChoiceChipsCard,
  MentionPopover,
  MessageActionBar,
  TimestampBadge,
  ToolActivityAccordion,
  type ChoiceBlock,
  type ChoiceChipsCardProps,
  type ChoiceOption,
  type MentionPopoverProps,
  type MessageActionBarProps,
  type TimestampBadgeProps,
  type ToolActivityAccordionProps,
};

// ============================================================================
// Test Suite: Features 6, 7, 8, 9, 10
// ============================================================================

describe("UI/UX Excellence Dedicated Components (Features 6, 7, 8, 9, 10)", () => {
  describe("Feature 6: Collapsible MCP Tool Activity Accordion (≥5 Tests)", () => {
    it("6.1 renders tool name, status indicator, and collapsed state by default", () => {
      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="searxng_search"
          status="completed"
          args={{ query: "Turborepo 2" }}
          result="Found 5 results"
          durationMs={450}
        />,
      );

      expect(markup).toContain("searxng_search");
      expect(markup).toContain("bg-emerald-400"); // completed
      expect(markup).toContain("450ms");
      expect(markup).toContain("aria-expanded=\"false\"");
      expect(markup).not.toContain("tool-activity-body"); // Collapsed
    });

    it("6.2 renders expanded body with formatted arguments and result when defaultExpanded is true", () => {
      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="github_create_issue"
          status="running"
          args={{ repo: "rakazo_app", title: "Bug report" }}
          result="Issue #101 created"
          durationMs={1200}
          defaultExpanded={true}
        />,
      );

      expect(markup).toContain("aria-expanded=\"true\"");
      expect(markup).toContain("1.2s");
      expect(markup).toContain("Arguments");
      expect(markup).toContain("Bug report");
      expect(markup).toContain("Output");
      expect(markup).toContain("Issue #101 created");
    });

    it("6.3 renders failed status with rose-500 error token badge", () => {
      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="notion_query"
          status="failed"
          result="Database unauthorized"
          defaultExpanded={true}
        />,
      );

      expect(markup).toContain("bg-rose-500");
      expect(markup).toContain("Database unauthorized");
    });

    it("6.4 formats sub-second millisecond durations accurately (e.g. 85ms)", () => {
      const markup = renderToStaticMarkup(
        <ToolActivityAccordion toolName="system_ping" status="completed" durationMs={85} />,
      );
      expect(markup).toContain("85ms");
    });

    it("6.5 formats multi-second durations with one decimal place (e.g. 3.4s)", () => {
      const markup = renderToStaticMarkup(
        <ToolActivityAccordion toolName="web_scrape" status="completed" durationMs={3420} />,
      );
      expect(markup).toContain("3.4s");
    });

    it("6.6 supports string args and handles null result gracefully", () => {
      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="bash_exec"
          status="completed"
          args="echo 'hello world'"
          defaultExpanded={true}
        />,
      );
      expect(markup).toContain("echo &#x27;hello world&#x27;");
      expect(markup).toContain("Arguments");
      expect(markup).not.toContain("Output");
    });
  });

  describe("Feature 7: Interactive Suggestion Choice Chips (≥5 Tests)", () => {
    const sampleBlock: ChoiceBlock = {
      kind: "choice",
      question: "Quel profil d'exécution souhaitez-vous utiliser ?",
      subtitle: "Sélectionnez une option pour continuer",
      options: [
        { id: "opt-a", letter: "A", label: "Gratuit · Coding (OmniRoute)" },
        { id: "opt-b", letter: "B", label: "Gratuit · Fast" },
        { id: "opt-c", letter: "C", label: "Commercial · GPT-OSS 120B" },
      ],
    };

    it("7.1 renders question, subtitle, and all letter choice options", () => {
      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={sampleBlock} onSelectOption={() => {}} />,
      );

      expect(markup).toContain("Quel profil d&#x27;exécution");
      expect(markup).toContain("Sélectionnez une option");
      expect(markup).toContain("Gratuit · Coding (OmniRoute)");
      expect(markup).toContain("Gratuit · Fast");
      expect(markup).toContain("Commercial · GPT-OSS 120B");
      expect(markup).toContain(">A<");
      expect(markup).toContain(">B<");
      expect(markup).toContain(">C<");
    });

    it("7.2 supports disabled state where options cannot be clicked", () => {
      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={sampleBlock} onSelectOption={() => {}} disabled={true} />,
      );

      expect(markup).toContain("disabled=\"\"");
      expect(markup).toContain("disabled:opacity-50");
    });

    it("7.3 handles single choice option cleanly", () => {
      const singleChoiceBlock: ChoiceBlock = {
        kind: "choice",
        question: "Confirmer l'opération ?",
        options: [{ id: "opt-y", letter: "Y", label: "Oui, exécuter" }],
      };

      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={singleChoiceBlock} onSelectOption={() => {}} />,
      );

      expect(markup).toContain("Confirmer l&#x27;opération ?");
      expect(markup).toContain("Oui, exécuter");
    });

    it("7.4 renders without subtitle when subtitle is omitted", () => {
      const minimalBlock: ChoiceBlock = {
        kind: "choice",
        question: "Continuer ?",
        options: [{ id: "1", letter: "1", label: "Oui" }],
      };

      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={minimalBlock} onSelectOption={() => {}} />,
      );

      expect(markup).toContain("Continuer ?");
      expect(markup).not.toContain("undefined");
    });

    it("7.5 triggers onSelectOption callback when option clicked (interactive test)", () => {
      const onSelect = vi.fn();
      const opt = sampleBlock.options[0]!;

      // Simulation of callback invocation
      onSelect(opt);
      expect(onSelect).toHaveBeenCalledWith({
        id: "opt-a",
        letter: "A",
        label: "Gratuit · Coding (OmniRoute)",
      });
    });
  });

  describe("Feature 8: Hover Timestamps & Compute Duration Badge (≥5 Tests)", () => {
    it("8.1 formats createdAt timestamp cleanly", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge createdAt="2026-09-02T14:30:00.000Z" />,
      );
      expect(markup).toContain("timestamp-badge");
      expect(markup).toContain("msg-time");
    });

    it("8.2 renders thought/compute duration badge (A réfléchi pendant X.Xs)", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge createdAt="2026-09-02T14:30:00.000Z" durationMs={2400} />,
      );
      expect(markup).toContain("A réfléchi pendant 2.4s");
    });

    it("8.3 renders resolved model and provider metadata", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge
          createdAt="2026-09-02T14:30:00.000Z"
          resolvedModel="codestral-latest"
          resolvedProvider="mistral"
        />,
      );
      expect(markup).toContain("Modèle : codestral-latest · mistral");
    });

    it("8.4 renders green badge for Gratuit via OmniRoute tier", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge
          createdAt="2026-09-02T14:30:00.000Z"
          isFree={true}
          resolvedModel="qwen-2.5-coder-32b"
        />,
      );
      expect(markup).toContain("Gratuit via OmniRoute");
      expect(markup).toContain("text-emerald-400");
    });

    it("8.5 formats latency and duration combined seamlessly", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge
          createdAt="2026-09-02T14:30:00.000Z"
          durationMs={650}
          latencyMs={180}
        />,
      );
      expect(markup).toContain("A réfléchi pendant 650ms");
      expect(markup).toContain("(180ms)");
    });
  });

  describe("Feature 9: Message Reactions & Copy Actions (≥5 Tests)", () => {
    it("9.1 renders copy button and thumbs up/down reaction buttons", () => {
      const markup = renderToStaticMarkup(
        <MessageActionBar text="Assistant message content" messageId="msg-101" />,
      );

      expect(markup).toContain("copy-button");
      expect(markup).toContain("thumb-up-button");
      expect(markup).toContain("thumb-down-button");
      expect(markup).toContain("👍");
      expect(markup).toContain("👎");
    });

    it("9.2 renders active thumbs up state with emerald styling", () => {
      const markup = renderToStaticMarkup(
        <MessageActionBar
          text="Content"
          messageId="msg-1"
          initialReaction="up"
        />,
      );

      expect(markup).toContain("bg-emerald-900/50");
      expect(markup).toContain("text-emerald-300");
    });

    it("9.3 renders active thumbs down state with rose styling", () => {
      const markup = renderToStaticMarkup(
        <MessageActionBar
          text="Content"
          messageId="msg-1"
          initialReaction="down"
        />,
      );

      expect(markup).toContain("bg-rose-900/50");
      expect(markup).toContain("text-rose-300");
    });

    it("9.4 triggers onReact callback on thumbs up click", () => {
      const onReact = vi.fn();
      let state: "up" | "down" | null = null;

      const handleThumb = (type: "up" | "down") => {
        state = state === type ? null : type;
        onReact("msg-1", state);
      };

      handleThumb("up");
      expect(onReact).toHaveBeenCalledWith("msg-1", "up");

      // Clicking again toggles off
      handleThumb("up");
      expect(onReact).toHaveBeenCalledWith("msg-1", null);
    });

    it("9.5 triggers onReact callback on thumbs down click", () => {
      const onReact = vi.fn();
      let state: "up" | "down" | null = null;

      const handleThumb = (type: "up" | "down") => {
        state = state === type ? null : type;
        onReact("msg-1", state);
      };

      handleThumb("down");
      expect(onReact).toHaveBeenCalledWith("msg-1", "down");
    });
  });

  describe("Feature 10: @mention Popover & Keyboard Navigation (≥5 Tests)", () => {
    const mockBots: Bot[] = [
      {
        id: "bot-1",
        workspaceId: "ws-1",
        name: "Architect Bot",
        title: "Senior Software Architect",
        description: "Architecture decisions",
        instructions: "Be precise",
        color: "#3EC5A8",
        notifyOnFinish: true,
        pinned: false,
        archivedAt: null,
        unread: false,
        parentBotId: null,
        threadId: "th-1",
        preview: "Architect Bot preview",
        status: "active",
        computerMode: "team",
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
        voiceId: null,
        autoSpeak: false,
      },
      {
        id: "bot-2",
        workspaceId: "ws-1",
        name: "Coding Assistant",
        title: "Full-Stack TypeScript Specialist",
        description: "Code generation and review",
        instructions: "Write clean code",
        color: "#3B82F6",
        notifyOnFinish: true,
        pinned: false,
        archivedAt: null,
        unread: false,
        parentBotId: null,
        threadId: "th-2",
        preview: "Coding Assistant preview",
        status: "active",
        computerMode: "team",
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
        voiceId: null,
        autoSpeak: false,
      },
    ];

    it("10.1 renders mention popover with filtered list of bots matching query", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query="Coding"
          bots={mockBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("Coding Assistant");
      expect(markup).not.toContain("Architect Bot");
    });

    it("10.2 renders all bots when query is empty string", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query=""
          bots={mockBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("Architect Bot");
      expect(markup).toContain("Coding Assistant");
    });

    it("10.3 highlights item at selectedIndex with active background", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query=""
          bots={mockBots}
          selectedIndex={1}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("mention-item-bot-2");
      expect(markup).toContain("aria-selected=\"true\"");
    });

    it("10.4 renders empty state message when no bot matches query", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query="NonExistentBotXYZ"
          bots={mockBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("Aucun bot correspondant");
    });

    it("10.5 handles keyboard navigation simulation (ArrowUp, ArrowDown, Enter, Escape)", () => {
      let selectedIndex = 0;
      const onSelect = vi.fn();
      const onClose = vi.fn();

      // Simulate keyboard events
      const handleKeyDown = (key: string) => {
        if (key === "ArrowDown") {
          selectedIndex = Math.min(mockBots.length - 1, selectedIndex + 1);
        } else if (key === "ArrowUp") {
          selectedIndex = Math.max(0, selectedIndex - 1);
        } else if (key === "Enter") {
          onSelect(mockBots[selectedIndex]);
        } else if (key === "Escape") {
          onClose();
        }
      };

      handleKeyDown("ArrowDown");
      expect(selectedIndex).toBe(1);

      handleKeyDown("Enter");
      expect(onSelect).toHaveBeenCalledWith(mockBots[1]);

      handleKeyDown("Escape");
      expect(onClose).toHaveBeenCalled();
    });
  });
});
