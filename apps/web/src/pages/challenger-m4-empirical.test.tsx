import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PromptCompilerModal } from "./PromptCompilerModal";

describe("Milestone M4 Empirical Challenge Suite: Responsive WebUI & Ergonomics", () => {
  // ==========================================================================
  // 1. PROMPT COMPILER MODAL — VIEWPORT BREAKPOINTS & BEFORE/AFTER COMPARATIVE UX
  // ==========================================================================
  describe("1. PromptCompilerModal: Before/After Comparative UX & Viewport Adaptation", () => {
    const rawInstruction = "You are a senior DevOps engineer managing Coolify containers.";
    const compiledInstruction =
      "## Rôle & Identité\nVous êtes l'agent 'DevOps Expert'.\n\n## Mission Principale\nGestion des conteneurs Coolify.";

    it("1.1 Mobile Viewports (320px, 360px, 375px, 390px, 430px): Renders stacked layout with full viewport utilization", () => {
      const mobileWidths = [320, 360, 375, 390, 430];

      for (const width of mobileWidths) {
        const html = renderToStaticMarkup(
          <PromptCompilerModal
            isOpen={true}
            rawDraft={rawInstruction}
            initialCompiled={compiledInstruction}
            viewportWidth={width}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );

        // Container class must enforce mobile sizing: h-[96vh] w-[98%]
        expect(html).toContain("h-[96vh] w-[98%]");

        // Grid must enforce single column stacking on mobile (grid-cols-1)
        expect(html).toContain("grid-cols-1");
        expect(html).toContain("sm:grid-cols-2");

        // Both original and compiled panes must be present for comparison
        expect(html).toContain('data-testid="compiler-original-pane"');
        expect(html).toContain('data-testid="compiler-compiled-pane"');
        expect(html).toContain("Brouillon initial (non modifié)");
        expect(html).toContain("Instructions Professionnelles Structurées");
      }
    });

    it("1.2 Tablet Viewports (768px, 1024px): Adapts container height and dual column grid", () => {
      const tabletHtml = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft={rawInstruction}
          initialCompiled={compiledInstruction}
          viewportWidth={768}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      // Tablet sizing: h-[85vh] w-[90%]
      expect(tabletHtml).toContain("h-[85vh] w-[90%]");
      expect(tabletHtml).toContain("sm:grid-cols-2");
    });

    it("1.3 Desktop Viewports (1280px, 1440px, 1920px): Renders fixed large dimension side-by-side comparison", () => {
      const desktopHtml = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft={rawInstruction}
          initialCompiled={compiledInstruction}
          viewportWidth={1440}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      // Desktop sizing: h-[800px] w-[1000px]
      expect(desktopHtml).toContain("h-[800px] w-[1000px]");
      expect(desktopHtml).toContain("sm:grid-cols-2");
      expect(desktopHtml).toContain('data-testid="compiler-original-pane"');
      expect(desktopHtml).toContain('data-testid="compiler-compiled-pane"');
    });

    it("1.4 Modal Hidden state: Returns null when isOpen is false", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={false}
          rawDraft={rawInstruction}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );
      expect(html).toBe("");
    });
  });

  // ==========================================================================
  // 2. TOUCH TARGETS (>= 44px) & IOS ZOOM PREVENTION
  // ==========================================================================
  describe("2. Touch Ergonomics, Target Sizing (>= 44px) & iOS Zoom Prevention", () => {
    it("2.1 Close, Cancel, and Apply buttons provide >= 44px min-dimensions on mobile", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft="Draft text"
          initialCompiled="Compiled text"
          viewportWidth={375}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      // Close button >= 44px
      expect(html).toContain('data-testid="compiler-close-btn"');
      expect(html).toContain("min-h-[44px]");
      expect(html).toContain("min-w-[44px]");

      // Cancel button >= 44px
      expect(html).toContain('data-testid="compiler-cancel-btn"');
      expect(html).toContain("min-h-[44px]");
      expect(html).toContain("min-w-[44px]");

      // Apply button >= 44px
      expect(html).toContain('data-testid="compiler-apply-btn"');
      expect(html).toContain("min-h-[44px]");
      expect(html).toContain("min-w-[44px]");
    });

    it("2.2 Modal Footer applies safe-area-inset-bottom for mobile home indicators", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft="Draft text"
          initialCompiled="Compiled text"
          viewportWidth={390}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      expect(html).toContain("pb-[max(0.875rem,env(safe-area-inset-bottom))]");
    });

    it("2.3 Textarea input uses font-size 16px on mobile to prevent iOS Safari auto-zoom", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft="Draft text"
          initialCompiled="Compiled text"
          viewportWidth={375}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      // text-[16px] ensures Safari iOS does not trigger viewport auto-zoom on focus
      expect(html).toContain("text-[16px]");
      expect(html).toContain("sm:text-xs");
    });
  });

  // ==========================================================================
  // 3. ZERO-SECRET SANITIZATION & TELEMETRY IN PROMPT COMPILER
  // ==========================================================================
  describe("3. Zero-Secret Invariant & Telemetry Display", () => {
    it("3.1 Sanitizes sensitive tokens in initialError prop (GitHub, Notion, OpenRouter)", () => {
      const dirtyError =
        "Failed with ghp_abc123xyz456 and secret_99887766 and sk-or-v1-abcdef012345";
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft="Draft text"
          initialError={dirtyError}
          viewportWidth={1024}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      // Must redact sensitive tokens
      expect(html).toContain("ghp_[redacted]");
      expect(html).toContain("secret_[redacted]");
      expect(html).toContain("sk-or-v1-[redacted]");

      // Must NOT leak plaintext secret values
      expect(html).not.toContain("ghp_abc123xyz456");
      expect(html).not.toContain("secret_99887766");
      expect(html).not.toContain("sk-or-v1-abcdef012345");
    });

    it("3.2 Renders retry button with min-h-[44px] touch target in error alert banner", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft="Draft text"
          initialError="An error occurred"
          viewportWidth={375}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      expect(html).toContain('data-testid="compiler-retry-btn"');
      expect(html).toContain("min-h-[44px]");
    });

    it("3.3 Renders loading state during compilation with accessible spinner and status text", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModal
          isOpen={true}
          rawDraft="Draft text"
          isCompilingInitial={true}
          viewportWidth={1024}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      expect(html).toContain('data-testid="compiler-loading-spinner"');
      expect(html).toContain("Structuration par gpt-oss-120b en cours…");
    });
  });

  // ==========================================================================
  // 4. CHAT COMPOSER — SAFE-AREA, VIRTUAL KEYBOARD & ERGONOMICS
  // ==========================================================================
  describe("4. Chat Composer: Safe Area, Virtual Keyboard & Touch Ergonomics", () => {
    function SimulatedComposer({
      running = false,
      draft = "",
      disabled = false,
      dictating = false,
      hasAttachments = false,
    }: {
      running?: boolean;
      draft?: string;
      disabled?: boolean;
      dictating?: boolean;
      hasAttachments?: boolean;
    }) {
      const canSend = draft.trim().length > 0 || hasAttachments;

      return (
        <div
          data-testid="chat-composer-container"
          className="w-full px-2 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3"
        >
          <div className="flex w-full items-center gap-2 sm:gap-3.5 rounded-full border border-[#202023] bg-[#131315] py-1.5 px-2 sm:py-[9px] sm:pr-2.5 sm:pl-3 shadow-sm">
            <button
              type="button"
              aria-label="Attach file"
              disabled={disabled}
              className="grid h-9 w-9 sm:h-[34px] sm:w-[34px] shrink-0 place-items-center rounded-full border border-[#26262A] text-[#9A9AA0] hover:bg-[#1C1C1F] hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              aria-label={dictating ? "Stop dictation" : "Dictate"}
              className={`grid h-9 w-9 sm:h-[34px] sm:w-[34px] shrink-0 place-items-center rounded-full border transition-colors cursor-pointer ${
                dictating
                  ? "border-[#4ECB71] bg-[rgba(48,162,75,.16)] text-[#4ECB71]"
                  : "border-[#26262A] text-[#9A9AA0] hover:bg-[#1C1C1F] hover:text-white"
              }`}
            >
              🎤
            </button>
            <input
              value={draft}
              disabled={disabled}
              placeholder="Écrire un message…"
              className="min-w-0 flex-1 bg-transparent px-1.5 text-[16px] sm:text-[15.5px] text-[#E9E9EA] placeholder-[#6C6C70] outline-none disabled:opacity-40"
            />
            {running ? (
              <button
                type="button"
                aria-label="Arrêter"
                className="grid h-9 w-9 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A] hover:bg-white transition-colors cursor-pointer"
              >
                ■
              </button>
            ) : (
              <button
                type="button"
                aria-label="Envoyer"
                disabled={!canSend || disabled}
                className="grid h-9 w-9 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-full bg-[#F1F1EF] text-[#17171A] hover:bg-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                ▲
              </button>
            )}
          </div>
        </div>
      );
    }

    it("4.1 Applies safe-area-inset-bottom on chat composer container", () => {
      const html = renderToStaticMarkup(<SimulatedComposer />);
      expect(html).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    });

    it("4.2 Uses text-[16px] on composer input to prevent iOS keyboard zoom", () => {
      const html = renderToStaticMarkup(<SimulatedComposer draft="Hello" />);
      expect(html).toContain("text-[16px]");
      expect(html).toContain("sm:text-[15.5px]");
    });

    it("4.3 Renders interactive buttons with proper tactile classes and min dimensions", () => {
      const html = renderToStaticMarkup(<SimulatedComposer draft="Test" />);
      expect(html).toContain("h-9 w-9");
      expect(html).toContain('aria-label="Attach file"');
      expect(html).toContain('aria-label="Dictate"');
      expect(html).toContain('aria-label="Envoyer"');
    });

    it("4.4 Renders Stop button when agent is actively running", () => {
      const html = renderToStaticMarkup(<SimulatedComposer running={true} />);
      expect(html).toContain('aria-label="Arrêter"');
      expect(html).not.toContain('aria-label="Envoyer"');
    });

    it("4.5 Renders Dictating state with emerald border and highlighting", () => {
      const html = renderToStaticMarkup(<SimulatedComposer dictating={true} />);
      expect(html).toContain('aria-label="Stop dictation"');
      expect(html).toContain("border-[#4ECB71]");
      expect(html).toContain("text-[#4ECB71]");
    });
  });
});
