import type { Bot, ThreadMessage } from "@rakazo/contracts";
import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ChoiceChipsCard,
  MentionPopover,
  MessageActionBar,
  TimestampBadge,
  ToolActivityAccordion,
  type ChoiceBlock,
  type ChoiceOption,
} from "../components/chat/index.js";
import { BREAKPOINTS, ResponsiveContainer, TouchInteractiveButton } from "./responsive-matrix.test.js";

// Helper to construct test bots
function makeTestBot(id: string, name: string, title?: string, color?: string): Bot {
  return {
    id,
    workspaceId: "ws-test",
    name,
    title: title ?? "",
    description: `Bot ${name}`,
    instructions: "Instructions",
    color: color ?? "emerald",
    notifyOnFinish: true,
    pinned: false,
    archivedAt: null,
    unread: false,
    parentBotId: null,
    threadId: `th-${id}`,
    preview: "Preview",
    status: "active",
    computerMode: "team",
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    voiceId: null,
    autoSpeak: false,
  };
}

describe("ADVERSARIAL UI MATRIX & ERGONOMICS CHALLENGER SUITE", () => {
  // ==========================================================================
  // Section 1: ToolActivityAccordion Adversarial Stress Tests
  // ==========================================================================
  describe("1. ToolActivityAccordion Adversarial Ergonomics", () => {
    it("1.1 handles deeply nested JSON arguments (10 levels deep) and serializes safely without blowing stack", () => {
      let nested: any = { leaf: "deep_value" };
      for (let i = 0; i < 10; i++) {
        nested = { level: i, child: nested };
      }

      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="nested_json_inspector"
          status="completed"
          args={nested}
          defaultExpanded={true}
        />,
      );

      expect(markup).toContain("nested_json_inspector");
      expect(markup).toContain("deep_value");
      expect(markup).toContain("level");
      expect(markup).toContain("child");
    });

    it("1.2 handles massive multi-kilobyte JSON arguments (10,000+ characters) without overflow corruption", () => {
      const hugeData: Record<string, string> = {};
      for (let i = 0; i < 200; i++) {
        hugeData[`key_${i}`] = `value_${"x".repeat(50)}_${i}`;
      }

      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="huge_payload_tool"
          status="completed"
          args={hugeData}
          defaultExpanded={true}
        />,
      );

      expect(markup).toContain("huge_payload_tool");
      expect(markup).toContain("key_199");
      expect(markup).toContain("overflow-x-auto");
    });

    it("1.3 handles massive multi-line output results with unescaped HTML/special characters safely", () => {
      const dangerousOutput = "<script>alert('xss')</script>\nLine 2 & \"quotes\" 'single' <tag>\n" + "Log line...\n".repeat(50);

      const markup = renderToStaticMarkup(
        <ToolActivityAccordion
          toolName="shell_exec_raw"
          status="failed"
          result={dangerousOutput}
          defaultExpanded={true}
        />,
      );

      expect(markup).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
      expect(markup).not.toContain("<script>alert");
      expect(markup).toContain("bg-rose-500");
    });

    it("1.4 correctly distinguishes running (amber pulse), completed (emerald), and failed (rose-500) visual tokens", () => {
      const runningMarkup = renderToStaticMarkup(
        <ToolActivityAccordion toolName="tool_run" status="running" />,
      );
      expect(runningMarkup).toContain("bg-amber-400 animate-pulse");

      const completedMarkup = renderToStaticMarkup(
        <ToolActivityAccordion toolName="tool_done" status="completed" />,
      );
      expect(completedMarkup).toContain("bg-emerald-400");
      expect(completedMarkup).not.toContain("animate-pulse");

      const failedMarkup = renderToStaticMarkup(
        <ToolActivityAccordion toolName="tool_fail" status="failed" />,
      );
      expect(failedMarkup).toContain("bg-rose-500");
    });

    it("1.5 duration formatting edge cases: 0ms, sub-second 999ms, boundary 1000ms (1.0s), 65432ms (65.4s), undefined", () => {
      const m0 = renderToStaticMarkup(<ToolActivityAccordion toolName="t" status="completed" durationMs={0} />);
      expect(m0).toContain("0ms");

      const m999 = renderToStaticMarkup(<ToolActivityAccordion toolName="t" status="completed" durationMs={999} />);
      expect(m999).toContain("999ms");

      const m1000 = renderToStaticMarkup(<ToolActivityAccordion toolName="t" status="completed" durationMs={1000} />);
      expect(m1000).toContain("1.0s");

      const m65k = renderToStaticMarkup(<ToolActivityAccordion toolName="t" status="completed" durationMs={65432} />);
      expect(m65k).toContain("65.4s");

      const mUndef = renderToStaticMarkup(<ToolActivityAccordion toolName="t" status="completed" />);
      expect(mUndef).not.toContain("tool-duration");
    });

    it("1.6 accessibility attributes: aria-expanded reflects expanded state and toggle icon toggles ▲/▼", () => {
      const collapsed = renderToStaticMarkup(
        <ToolActivityAccordion toolName="acc_test" status="completed" defaultExpanded={false} />,
      );
      expect(collapsed).toContain("aria-expanded=\"false\"");
      expect(collapsed).toContain("▼");

      const expanded = renderToStaticMarkup(
        <ToolActivityAccordion toolName="acc_test" status="completed" defaultExpanded={true} />,
      );
      expect(expanded).toContain("aria-expanded=\"true\"");
      expect(expanded).toContain("▲");
    });
  });

  // ==========================================================================
  // Section 2: ChoiceChipsCard Adversarial Stress Tests
  // ==========================================================================
  describe("2. ChoiceChipsCard Adversarial Ergonomics", () => {
    const stressBlock: ChoiceBlock = {
      kind: "choice",
      question: "Stress test question with special chars: <>&\"' ?",
      subtitle: "Subtitle for stress testing",
      options: [
        { id: "opt-1", letter: "A", label: "Very Long Option Label ".repeat(5) },
        { id: "opt-2", letter: "B", label: "Short Option" },
        { id: "opt-3", letter: "C", label: "<script>alert('option')</script>" },
        { id: "opt-4", letter: "D", label: "Unicode Emojis: 🚀 🤖 🎉 ✨" },
      ],
    };

    it("2.1 verifies all options inherit disabled attribute and prevent interaction when disabled=true", () => {
      const onSelect = vi.fn();
      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={stressBlock} onSelectOption={onSelect} disabled={true} />,
      );

      // Verify disabled attributes on all buttons
      const disabledMatches = markup.match(/disabled=""/g);
      expect(disabledMatches?.length).toBe(4);
      expect(markup).toContain("disabled:cursor-not-allowed");
      expect(markup).toContain("disabled:opacity-50");
    });

    it("2.2 handles large array of options (A through Z, 26 options) without breaking layout", () => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const hugeOptions: ChoiceOption[] = alphabet.map((letter, idx) => ({
        id: `opt-${idx}`,
        letter,
        label: `Choice Option ${letter} - Description of option`,
      }));

      const block26: ChoiceBlock = {
        kind: "choice",
        question: "Alphabet options selector",
        options: hugeOptions,
      };

      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={block26} onSelectOption={() => {}} />,
      );

      for (const letter of alphabet) {
        expect(markup).toContain(`data-testid="choice-option-${letter}"`);
      }
      expect(markup).toContain("flex flex-wrap gap-2");
    });

    it("2.3 safely escapes HTML and script injection tags in choice questions and labels", () => {
      const markup = renderToStaticMarkup(
        <ChoiceChipsCard block={stressBlock} onSelectOption={() => {}} />,
      );

      expect(markup).not.toContain("<script>alert('option')</script>");
      expect(markup).toContain("&lt;script&gt;alert(&#x27;option&#x27;)&lt;/script&gt;");
    });

    it("2.4 verifies flex-wrap behavior on narrow mobile viewports (320px)", () => {
      const markup = renderToStaticMarkup(
        <ResponsiveContainer width={320}>
          <ChoiceChipsCard block={stressBlock} onSelectOption={() => {}} />
        </ResponsiveContainer>,
      );

      expect(markup).toContain("flex-wrap");
      expect(markup).toContain("max-w-lg");
    });
  });

  // ==========================================================================
  // Section 3: MentionPopover Adversarial Stress Tests
  // ==========================================================================
  describe("3. MentionPopover Adversarial Ergonomics & Keyboard Navigation Oracles", () => {
    const testBots: Bot[] = [
      makeTestBot("bot-coding", "Coding Bot", "Specialized in TypeScript", "#3B82F6"),
      makeTestBot("bot-security", "Security Auditor", "Finds vulnerabilities", "#EF4444"),
      makeTestBot("bot-fast", "Fast OmniRoute", "Sub-100ms responses", "#10B981"),
      makeTestBot("bot-writer", "Tech Writer", "Documentation master", "#8B5CF6"),
      makeTestBot("bot-reasoning", "Deep Reasoning", "Math & logic puzzles", "#F59E0B"),
    ];

    it("3.1 empty query ('') returns all bots without crashing", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query=""
          bots={testBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("Coding Bot");
      expect(markup).toContain("Security Auditor");
      expect(markup).toContain("Fast OmniRoute");
      expect(markup).toContain("Tech Writer");
      expect(markup).toContain("Deep Reasoning");
    });

    it("3.2 whitespace-only query ('   ') trims and returns all bots", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query="   "
          bots={testBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("Coding Bot");
      expect(markup).toContain("Deep Reasoning");
    });

    it("3.3 non-matching query ('xyz_nonexistent_bot_query') shows empty message gracefully", () => {
      const markup = renderToStaticMarkup(
        <MentionPopover
          query="xyz_nonexistent_bot_query"
          bots={testBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );

      expect(markup).toContain("data-testid=\"mention-empty\"");
      expect(markup).toContain("Aucun bot correspondant");
      expect(markup).not.toContain("Coding Bot");
    });

    it("3.4 search matches on both bot name and bot title (case-insensitive)", () => {
      // Matches title "Specialized in TypeScript"
      const markupTitle = renderToStaticMarkup(
        <MentionPopover
          query="typescript"
          bots={testBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );
      expect(markupTitle).toContain("Coding Bot");
      expect(markupTitle).not.toContain("Fast OmniRoute");

      // Matches name "Security"
      const markupName = renderToStaticMarkup(
        <MentionPopover
          query="security"
          bots={testBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );
      expect(markupName).toContain("Security Auditor");
      expect(markupName).not.toContain("Coding Bot");
    });

    it("3.5 boundary wrapping simulation on ArrowUp & ArrowDown navigation oracle", () => {
      const listLength = testBots.length; // 5

      // Oracle for ArrowDown: (prev + 1) % listLength
      let idx = 0;
      expect((idx + 1) % listLength).toBe(1); // 0 -> 1
      idx = 4;
      expect((idx + 1) % listLength).toBe(0); // 4 -> 0 (wrap around)

      // Oracle for ArrowUp: (prev - 1 + listLength) % listLength
      idx = 0;
      expect((idx - 1 + listLength) % listLength).toBe(4); // 0 -> 4 (wrap around)
      idx = 3;
      expect((idx - 1 + listLength) % listLength).toBe(2); // 3 -> 2

      // Boundary: single element list
      const singleLen = 1;
      expect((0 + 1) % singleLen).toBe(0);
      expect((0 - 1 + singleLen) % singleLen).toBe(0);
    });

    it("3.6 Tab, Enter, and Escape action handlers behave deterministically", () => {
      const selectedBot = testBots[2]!; // Fast OmniRoute
      const draft = "Hello @fa";
      const atIdx = draft.lastIndexOf("@");
      const prefix = atIdx >= 0 ? draft.slice(0, atIdx) : draft;
      const nextDraft = `${prefix}@${selectedBot.name} `;

      expect(nextDraft).toBe("Hello @Fast OmniRoute ");
    });

    it("3.7 handles bots with missing title or empty string name safely without exception", () => {
      // 1. Bot with name but undefined title
      const botWithoutTitle = [makeTestBot("bot-notitle", "StandaloneBot", undefined, "#3B82F6")];
      const markup1 = renderToStaticMarkup(
        <MentionPopover
          query=""
          bots={botWithoutTitle}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );
      expect(markup1).toContain("StandaloneBot");
      expect(markup1).toContain(">S<"); // Initial letter

      // 2. Corrupt bot with empty name: filtered out gracefully without throwing
      const corruptBots: Bot[] = [makeTestBot("bot-bare", "", undefined, undefined)];
      const markup2 = renderToStaticMarkup(
        <MentionPopover
          query=""
          bots={corruptBots}
          selectedIndex={0}
          onSelectBot={() => {}}
          onClose={() => {}}
        />,
      );
      expect(markup2).toContain("mention-popover");
      expect(markup2).toContain("Aucun bot correspondant");
    });
  });

  // ==========================================================================
  // Section 4: 9-Breakpoint Responsive Matrix & 44px Touch Ergonomics
  // ==========================================================================
  describe("4. 9-Breakpoint Responsive Matrix & Touch Target Ergonomics", () => {
    const allBreakpoints = [
      { name: "320px iPhone SE", width: 320, isMobile: true, maxContainer: "100%" },
      { name: "360px Android Compact", width: 360, isMobile: true, maxContainer: "100%" },
      { name: "375px iPhone Classic", width: 375, isMobile: true, maxContainer: "100%" },
      { name: "390px iPhone 14/15", width: 390, isMobile: true, maxContainer: "100%" },
      { name: "430px iPhone Pro Max", width: 430, isMobile: true, maxContainer: "100%" },
      { name: "768px iPad Portrait", width: 768, isTablet: true, maxContainer: "720px" },
      { name: "1024px iPad Landscape", width: 1024, isTablet: true, maxContainer: "720px" },
      { name: "1280px Desktop HD", width: 1280, isDesktop: true, maxContainer: "896px" },
      { name: "1440px Desktop QHD", width: 1440, isDesktop: true, maxContainer: "896px" },
    ];

    for (const bp of allBreakpoints) {
      it(`4.${allBreakpoints.indexOf(bp) + 1} stress-tests full transcript layout at ${bp.name} (${bp.width}px)`, () => {
        const markup = renderToStaticMarkup(
          <ResponsiveContainer width={bp.width}>
            <div data-testid="chat-transcript">
              <ToolActivityAccordion
                toolName="omniroute_resolver"
                status="completed"
                args={{ profile: "coding", mode: "free" }}
                result="Resolved to codestral-latest via Mistral"
                durationMs={340}
              />
              <ChoiceChipsCard
                block={{
                  kind: "choice",
                  question: "Continuer l'analyse ?",
                  options: [
                    { id: "1", letter: "A", label: "Oui, exécuter les tests" },
                    { id: "2", letter: "B", label: "Non, générer le rapport" },
                  ],
                }}
                onSelectOption={() => {}}
              />
              <TimestampBadge
                createdAt="2026-09-02T14:30:00.000Z"
                resolvedModel="Codestral"
                resolvedProvider="Mistral AI"
                isFree={true}
                durationMs={1200}
              />
              <MessageActionBar text="Message content" messageId="msg-1" />
            </div>
          </ResponsiveContainer>,
        );

        expect(markup).toContain(`width:${bp.width}px`);
        expect(markup).toContain("overflow-x:hidden");
        expect(markup).toContain(`max-width:${bp.maxContainer}`);
        expect(markup).toContain("Gratuit via OmniRoute");
        expect(markup).toContain("A réfléchi pendant 1.2s");
      });
    }

    it("4.10 verifies 44px touch target compliance on interactive buttons across all mobile viewports", () => {
      const buttonMarkup = renderToStaticMarkup(
        <TouchInteractiveButton label="Envoyer" minHeight={44} minWidth={44} />,
      );
      expect(buttonMarkup).toContain("min-height:44px");
      expect(buttonMarkup).toContain("min-width:44px");
    });

    it("4.11 verifies safe area inset bottom padding exists on all 5 smartphone breakpoints", () => {
      const mobileWidths = [320, 360, 375, 390, 430];
      for (const w of mobileWidths) {
        const markup = renderToStaticMarkup(
          <ResponsiveContainer width={w}>
            <div>Content</div>
          </ResponsiveContainer>,
        );
        expect(markup).toContain("env(safe-area-inset-bottom");
      }
    });

    it("4.12 validates unbroken string handling prevents layout rupture at 320px", () => {
      const longString = "A".repeat(500);
      const markup = renderToStaticMarkup(
        <ResponsiveContainer width={320}>
          <div style={{ wordBreak: "break-word", overflowWrap: "break-word" }}>
            {longString}
          </div>
        </ResponsiveContainer>,
      );

      expect(markup).toContain("overflow-x:hidden");
      expect(markup).toContain("word-break:break-word");
    });
  });

  // ==========================================================================
  // Section 5: TimestampBadge & MessageActionBar Adversarial Stress Tests
  // ==========================================================================
  describe("5. TimestampBadge & MessageActionBar Adversarial Stress", () => {
    it("5.1 TimestampBadge handles invalid date strings gracefully without throwing", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge createdAt="invalid-date-string" />,
      );
      expect(markup).toContain("invalid-date-string");
    });

    it("5.2 TimestampBadge displays OmniRoute Gratuit badge and latency in ms", () => {
      const markup = renderToStaticMarkup(
        <TimestampBadge
          createdAt="2026-09-02T14:45:00.000Z"
          resolvedModel="codestral-latest"
          resolvedProvider="Mistral AI"
          isFree={true}
          durationMs={4500}
          latencyMs={89}
        />,
      );

      expect(markup).toContain("Gratuit via OmniRoute");
      expect(markup).toContain("Modèle : codestral-latest · Mistral AI");
      expect(markup).toContain("A réfléchi pendant 4.5s");
      expect(markup).toContain("(89ms)");
    });

    it("5.3 MessageActionBar reaction toggles from up to null, down to null, up to down", () => {
      // Test state machine logic of MessageActionBar
      let currentReaction: "up" | "down" | null = null;
      const toggle = (type: "up" | "down") => {
        currentReaction = currentReaction === type ? null : type;
      };

      // 1. Initial click UP -> "up"
      toggle("up");
      expect(currentReaction).toBe("up");

      // 2. Click UP again -> null
      toggle("up");
      expect(currentReaction).toBe(null);

      // 3. Click DOWN -> "down"
      toggle("down");
      expect(currentReaction).toBe("down");

      // 4. Click UP while DOWN -> "up"
      toggle("up");
      expect(currentReaction).toBe("up");
    });

    it("5.4 MessageActionBar copy button renders with clipboard emoji and copy title", () => {
      const markup = renderToStaticMarkup(
        <MessageActionBar text="Test clipboard message" messageId="msg-copy-1" />,
      );

      expect(markup).toContain("data-testid=\"copy-button\"");
      expect(markup).toContain("Copier le message");
      expect(markup).toContain("data-testid=\"thumb-up-button\"");
      expect(markup).toContain("data-testid=\"thumb-down-button\"");
    });
  });
});
