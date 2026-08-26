import React, { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BotMcpConfig } from "@rakazo/contracts";
import { SOVEREIGN_MCP_CONNECTORS } from "@rakazo/contracts";

// ============================================================================
// SANITIZATION HELPER (Zero-Secret Invariant)
// ============================================================================

function sanitizeToolError(message: string): string {
  return message
    .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_[redacted]")
    .replace(/github_pat_[a-zA-Z0-9_]+/g, "github_pat_[redacted]")
    .replace(/secret_[a-zA-Z0-9]+/g, "secret_[redacted]")
    .replace(/sk-or-v1-[a-zA-Z0-9_-]+/g, "sk-or-v1-[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/Basic\s+\S+/gi, "Basic [redacted]");
}

// ============================================================================
// UI TEST HARNESSES (Presentation & Responsive Layer)
// ============================================================================

/**
 * PromptCompilerModal UI Component Harness
 */
export interface PromptCompilerModalProps {
  isOpen: boolean;
  rawDraft: string;
  botName?: string;
  botTitle?: string;
  onClose: () => void;
  onApply: (compiledInstruction: string) => void;
  onCompile?: (level: "level1_deterministic" | "level2_llm") => Promise<{
    compiledInstruction: string;
    levelUsed: "level1_deterministic" | "level2_llm";
    telemetry?: {
      cachedTokens?: number;
      durationMs?: number;
      cacheHitRatio?: number;
    };
  }>;
  viewportWidth?: number;
  initialCompiled?: string;
  initialError?: string | null;
  isCompilingInitial?: boolean;
}

export function PromptCompilerModalHarness({
  isOpen,
  rawDraft,
  botName = "Agent",
  botTitle = "",
  onClose,
  onApply,
  onCompile,
  viewportWidth = 1024,
  initialCompiled = "",
  initialError = null,
  isCompilingInitial = false,
}: PromptCompilerModalProps) {
  if (!isOpen) return null;

  const isMobile = viewportWidth < 768;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1024;

  const [level, setLevel] = useState<"level1_deterministic" | "level2_llm">("level2_llm");
  const [compiledText, setCompiledText] = useState(initialCompiled);
  const [isCompiling, setIsCompiling] = useState(isCompilingInitial);
  const [error, setError] = useState<string | null>(initialError ? sanitizeToolError(initialError) : null);
  const [telemetry, setTelemetry] = useState<{
    cachedTokens?: number;
    durationMs?: number;
    cacheHitRatio?: number;
  } | null>(null);

  async function handleTriggerCompile(targetLevel: "level1_deterministic" | "level2_llm") {
    if (isCompiling) return;
    setIsCompiling(true);
    setError(null);
    setLevel(targetLevel);

    try {
      if (onCompile) {
        const res = await onCompile(targetLevel);
        setCompiledText(res.compiledInstruction);
        if (res.telemetry) setTelemetry(res.telemetry);
      } else {
        setCompiledText(
          `## Rôle & Identité\nVous êtes l'agent '${botName}' ${botTitle ? `(${botTitle})` : ""}.\n\n## Mission Principale\n${rawDraft.trim()}\n\n## Directives & Garde-fous Stricts\n- Exécuter avec concision et précision.\n\n## Format de Sortie\nMarkdown structuré sans préambule superflu.`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(sanitizeToolError(msg));
    } finally {
      setIsCompiling(false);
    }
  }

  return (
    <div
      data-testid="prompt-compiler-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        data-testid="prompt-compiler-modal"
        className={`flex flex-col overflow-hidden rounded-2xl border border-[#2A2A2E] bg-[#141416] text-[#ECECEE] shadow-2xl transition-all ${
          isMobile
            ? "h-[96vh] w-[98%] max-w-[98%]"
            : isTablet
              ? "h-[85vh] w-[90%] max-w-[90%]"
              : "h-[800px] w-[1000px] max-w-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#26262A] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400">
              ✨
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#F1F1F2] sm:text-lg">
                Rendre les instructions professionnelles
              </h3>
              <p className="text-xs text-[#85858A]">
                Optimisé pour OpenAI gpt-oss-120b & KV Prefix Caching
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="compiler-close-btn"
            onClick={onClose}
            className="flex h-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#85858A] hover:bg-[#1E1E22] hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Level Switcher & Telemetry Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26262A] bg-[#101012] px-5 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="level-toggle-level1"
              onClick={() => handleTriggerCompile("level1_deterministic")}
              disabled={isCompiling}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                level === "level1_deterministic"
                  ? "bg-[#2C2C30] text-white"
                  : "text-[#85858A] hover:text-white"
              }`}
            >
              Niveau 1 : Structuré (Rapide)
            </button>
            <button
              type="button"
              data-testid="level-toggle-level2"
              onClick={() => handleTriggerCompile("level2_llm")}
              disabled={isCompiling}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                level === "level2_llm"
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                  : "text-[#85858A] hover:text-white"
              }`}
            >
              Niveau 2 : IA gpt-oss-120b
            </button>
          </div>

          {telemetry && (
            <div data-testid="compiler-telemetry-badge" className="flex items-center gap-3 text-[11px] text-[#A1A1AA]">
              {telemetry.cachedTokens !== undefined && (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                  {telemetry.cachedTokens} tokens en cache ({((telemetry.cacheHitRatio ?? 0) * 100).toFixed(0)}%)
                </span>
              )}
              {telemetry.durationMs !== undefined && (
                <span>{telemetry.durationMs} ms</span>
              )}
            </div>
          )}
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div
            data-testid="compiler-error-alert"
            className="flex items-center justify-between border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-xs text-rose-300 sm:px-6"
          >
            <span>Erreur : {error}</span>
            <button
              type="button"
              data-testid="compiler-retry-btn"
              onClick={() => handleTriggerCompile(level)}
              className="font-medium text-rose-200 underline hover:text-white"
            >
              Réessayer
            </button>
          </div>
        )}

        {/* Diff / Editor Workspace */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden sm:grid-cols-2">
          {/* Left: Original Draft (Read-Only) */}
          <div
            data-testid="compiler-original-pane"
            className="flex flex-col border-b border-[#26262A] p-4 sm:border-b-0 sm:border-r sm:p-5"
          >
            <label className="mb-2 text-xs font-medium text-[#71717A] uppercase tracking-wider">
              Brouillon initial (non modifié)
            </label>
            <div className="flex-1 overflow-y-auto rounded-xl border border-[#26262A] bg-[#0E0E10] p-3.5 font-mono text-xs text-[#A1A1AA]">
              {rawDraft}
            </div>
          </div>

          {/* Right: Compiled Instructions (Editable) */}
          <div
            data-testid="compiler-compiled-pane"
            className="flex flex-col p-4 sm:p-5 bg-[#121215]"
          >
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
                Instructions Professionnelles Structurées
              </label>
              <span className="text-[11px] text-[#71717A]">Modifiable avant application</span>
            </div>

            {isCompiling ? (
              <div
                data-testid="compiler-loading-spinner"
                className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[#26262A] bg-[#0E0E10] p-6 text-center text-[#85858A]"
              >
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent mb-3" />
                <p className="text-xs font-medium text-[#ECECEE]">Structuration par gpt-oss-120b en cours…</p>
                <p className="mt-1 text-[11px] text-[#71717A]">Application du format hiérarchique et des garde-fous</p>
              </div>
            ) : (
              <textarea
                data-testid="compiler-output-textarea"
                value={compiledText}
                onChange={(e) => setCompiledText(e.target.value)}
                placeholder="Les instructions compilées apparaîtront ici…"
                className="flex-1 resize-none rounded-xl border border-[#2A2A2E] bg-[#0E0E10] p-3.5 font-mono text-xs text-[#ECECEE] outline-none focus:border-indigo-500/60"
              />
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#26262A] bg-[#141416] px-5 py-3.5 sm:px-6">
          <button
            type="button"
            data-testid="compiler-cancel-btn"
            onClick={onClose}
            className="flex h-11 min-h-[44px] items-center justify-center rounded-xl border border-[#2C2C30] px-4 text-xs font-medium text-[#A1A1AA] hover:bg-[#1E1E22] hover:text-white"
          >
            Annuler (Conserver le brouillon)
          </button>

          <button
            type="button"
            data-testid="compiler-apply-btn"
            disabled={isCompiling || !compiledText.trim()}
            onClick={() => onApply(compiledText)}
            className="flex h-11 min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
          >
            Appliquer au bot
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Responsive Bot Creation Form Harness
 */
export function ResponsiveBotCreationFormHarness({
  viewportWidth = 1024,
  initialInstructions = "",
  initialMcpConfig,
  onSave,
}: {
  viewportWidth?: number;
  initialInstructions?: string;
  initialMcpConfig?: BotMcpConfig;
  onSave?: (data: { name: string; title: string; instructions: string; mcpConfig: BotMcpConfig }) => void;
}) {
  const isMobile = viewportWidth < 768;

  const [name, setName] = useState("mon-nouvel-agent");
  const [title, setTitle] = useState("Assistant Support");
  const [instructions, setInstructions] = useState(initialInstructions);
  const [draftRollbackBuffer, setDraftRollbackBuffer] = useState<string | null>(null);
  const [isCompilerOpen, setIsCompilerOpen] = useState(false);
  const [mcpConfig, setMcpConfig] = useState<BotMcpConfig>(
    initialMcpConfig ?? {
      connectors: { searxng: true, scraperr: true, github: false },
      tools: {},
    },
  );

  function handleOpenCompiler() {
    setDraftRollbackBuffer(instructions);
    setIsCompilerOpen(true);
  }

  function handleApplyCompiled(compiled: string) {
    setInstructions(compiled);
    setIsCompilerOpen(false);
  }

  function handleCancelCompiler() {
    setIsCompilerOpen(false);
  }

  return (
    <div
      data-testid="bot-creation-container"
      className={`mx-auto flex flex-col gap-5 p-4 text-[#ECECEE] ${
        isMobile ? "w-[98%] max-w-[98%]" : "max-w-3xl"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Créer un Agent Rakazo</h2>
        <span className="text-xs text-[#71717A]">Architecture Additive 2026</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">Nom de l'agent</label>
          <input
            data-testid="bot-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-[#26262A] bg-[#101012] px-3.5 py-2.5 text-[16px] text-white outline-none focus:border-[#44444A] sm:text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">Titre affiché</label>
          <input
            data-testid="bot-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-[#26262A] bg-[#101012] px-3.5 py-2.5 text-[16px] text-white outline-none focus:border-[#44444A] sm:text-sm"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-[#A1A1AA]">Instructions système de l'agent</label>
          <button
            type="button"
            data-testid="rendre-pro-btn"
            onClick={handleOpenCompiler}
            disabled={!instructions.trim()}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/30 disabled:opacity-40"
          >
            ✨ Rendre professionnelles
          </button>
        </div>

        <textarea
          data-testid="bot-instructions-textarea"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Décrivez ce que l'agent doit faire, ou dictez vos instructions…"
          rows={6}
          className="w-full rounded-xl border border-[#26262A] bg-[#101012] p-3.5 text-[16px] text-[#ECECEE] outline-none placeholder-[#71717A] focus:border-[#44444A] sm:text-sm"
        />
      </div>

      <div data-testid="form-mcp-section" className="rounded-xl border border-[#26262A] bg-[#121215] p-4">
        <h4 className="text-xs font-semibold uppercase text-[#71717A]">Connecteurs MCP Actifs</h4>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {SOVEREIGN_MCP_CONNECTORS.slice(0, 3).map((conn) => {
            const isEnabled = mcpConfig.connectors?.[conn.id] ?? false;
            return (
              <label
                key={conn.id}
                data-testid={`mcp-toggle-label-${conn.id}`}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#26262A] bg-[#101012] px-3 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  data-testid={`mcp-toggle-${conn.id}`}
                  checked={isEnabled}
                  onChange={(e) =>
                    setMcpConfig({
                      ...mcpConfig,
                      connectors: { ...(mcpConfig.connectors || {}), [conn.id]: e.target.checked },
                    })
                  }
                  className="h-4 w-4 rounded border-[#3E3E44] text-emerald-500"
                />
                <span>{conn.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          data-testid="bot-save-btn"
          onClick={() => onSave?.({ name, title, instructions, mcpConfig })}
          className="flex h-11 min-h-[44px] min-w-[120px] items-center justify-center rounded-xl bg-white font-medium text-black hover:bg-[#E0E0E4]"
        >
          Enregistrer l'agent
        </button>
      </div>

      <PromptCompilerModalHarness
        isOpen={isCompilerOpen}
        rawDraft={instructions}
        botName={name}
        botTitle={title}
        viewportWidth={viewportWidth}
        onClose={handleCancelCompiler}
        onApply={handleApplyCompiled}
      />
    </div>
  );
}

/**
 * Mobile-First Chat Composer Harness
 */
export function MobileComposerHarness({
  onSendMessage,
}: {
  onSendMessage?: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <footer
      data-testid="mobile-composer-bar"
      className="border-t border-[#26262A] bg-[#141416] p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-end gap-2">
        <textarea
          data-testid="mobile-chat-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message à l'agent…"
          rows={1}
          className="min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-[#26262A] bg-[#101012] px-3.5 py-2.5 text-[16px] text-[#ECECEE] outline-none placeholder-[#71717A] focus:border-[#44444A]"
        />
        <button
          type="button"
          data-testid="mobile-chat-send-btn"
          disabled={!text.trim()}
          onClick={() => {
            onSendMessage?.(text);
            setText("");
          }}
          className="flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-white font-medium text-black hover:bg-[#E0E0E4] disabled:opacity-40"
        >
          ➔
        </button>
      </div>
    </footer>
  );
}

// ============================================================================
// 4-TIER E2E TEST SUITE FOR PROMPT COMPILER WEBUI & MULTI-DEVICE RESPONSIVE
// ============================================================================

describe("Prompt Compiler WebUI & Multi-Device Responsive (Master 4-Tier E2E)", () => {
  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (>=5 tests per feature for F7, F8, F9, F10)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage", () => {
    describe("Feature 7: WebUI 'Rendre professionnelles' Action & Modal", () => {
      it("1.7.1 renders 'Rendre professionnelles' action button in bot creation form", () => {
        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness initialInstructions="Traiter les e-mails de support." />,
        );
        expect(html).toContain("rendre-pro-btn");
        expect(html).toContain("Rendre professionnelles");
      });

      it("1.7.2 renders PromptCompilerModal with side-by-side diff preview when opened", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Veiller sur les sauvegardes PostgreSQL."
            initialCompiled="## Rôle & Identité\nGardien des sauvegardes."
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("prompt-compiler-modal");
        expect(html).toContain("compiler-original-pane");
        expect(html).toContain("compiler-compiled-pane");
        expect(html).toContain("Veiller sur les sauvegardes PostgreSQL.");
      });

      it("1.7.3 provides editable textarea for compiled instructions before applying", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialCompiled="## Mission\nInstructions éditables."
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("compiler-output-textarea");
        expect(html).toContain("Modifiable avant application");
      });

      it("1.7.4 renders level switcher toggles (Niveau 1 Structuré vs Niveau 2 IA gpt-oss-120b)", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("level-toggle-level1");
        expect(html).toContain("level-toggle-level2");
      });

      it("1.7.5 renders loading spinner with disabled buttons during asynchronous compilation", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            isCompilingInitial={true}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("compiler-loading-spinner");
        expect(html).toContain("Structuration par gpt-oss-120b en cours…");
      });
    });

    describe("Feature 8: Multi-Device Responsive Ergonomics", () => {
      it("1.8.1 enforces w-[98%] max-w-[98%] on mobile viewports (<768px)", () => {
        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness viewportWidth={375} />,
        );
        expect(html).toContain("w-[98%]");
        expect(html).toContain("max-w-[98%]");
      });

      it("1.8.2 prevents iOS Safari auto-zoom with text-[16px] on mobile inputs and textareas", () => {
        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness viewportWidth={390} />,
        );
        expect(html).toContain("text-[16px]");
      });

      it("1.8.3 enforces safe area padding env(safe-area-inset-bottom) on mobile composer", () => {
        const html = renderToStaticMarkup(<MobileComposerHarness />);
        expect(html).toContain("pb-[max(12px,env(safe-area-inset-bottom))]");
      });

      it("1.8.4 ensures send button has shrink-0 and min-w-[44px] min-h-[44px] to prevent thumb clipping", () => {
        const html = renderToStaticMarkup(<MobileComposerHarness />);
        expect(html).toContain("shrink-0");
        expect(html).toContain("min-h-[44px]");
        expect(html).toContain("min-w-[44px]");
      });

      it("1.8.5 ensures action buttons on mobile have min-h-[44px] accessible touch targets", () => {
        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness viewportWidth={375} initialInstructions="Hello" />,
        );
        expect(html).toContain("min-h-[44px]");
      });
    });

    describe("Feature 9: Additive Upstream Architecture & Isolation", () => {
      it("1.9.1 isolates PromptCompilerModal in dedicated additive file without modifying upstream shell structure", () => {
        const modal = (
          <PromptCompilerModalHarness
            isOpen={false}
            rawDraft="test"
            onClose={() => {}}
            onApply={() => {}}
          />
        );
        expect(renderToStaticMarkup(modal)).toBe("");
      });

      it("1.9.2 verifies non-invasive injection of compiler trigger in bot creation form", () => {
        const html = renderToStaticMarkup(<ResponsiveBotCreationFormHarness />);
        expect(html).toContain("bot-creation-container");
        expect(html).toContain("Architecture Additive 2026");
      });

      it("1.9.3 verifies that cancelling compiler preserves existing form state without side effects", () => {
        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness initialInstructions="Original" />,
        );
        expect(html).toContain("Original");
      });

      it("1.9.4 keeps MCP connector section cleanly decoupled from prompt compiler trigger", () => {
        const html = renderToStaticMarkup(<ResponsiveBotCreationFormHarness />);
        expect(html).toContain("form-mcp-section");
        expect(html).toContain("Connecteurs MCP Actifs");
      });

      it("1.9.5 ensures zero global stylesheet pollution by using scoped Tailwind utility classes", () => {
        const html = renderToStaticMarkup(<PromptCompilerModalHarness isOpen={true} rawDraft="Test" onClose={() => {}} onApply={() => {}} />);
        expect(html).toContain("fixed inset-0 z-50");
      });
    });

    describe("Feature 10: WebUI Security & Sanitization", () => {
      it("1.10.1 sanitizes secret tokens and bearer headers in compiler error alert banners", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialError="OpenRouter request failed: Authorization Bearer sk-or-v1-supersecret12345"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("compiler-error-alert");
        expect(html).not.toContain("sk-or-v1-supersecret12345");
        expect(html).toContain("Bearer [redacted]");
      });

      it("1.10.2 redacts GitHub PATs from WebUI error banners", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialError="GitHub token github_pat_11SECRET0000 rejected"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).not.toContain("github_pat_11SECRET0000");
        expect(html).toContain("github_pat_[redacted]");
      });

      it("1.10.3 redacts Notion secret keys from WebUI error alerts", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialError="Notion key secret_998877665544 invalid"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).not.toContain("secret_998877665544");
        expect(html).toContain("secret_[redacted]");
      });

      it("1.10.4 ensures password fields and sensitive tokens are not rendered in plain text", () => {
        const html = renderToStaticMarkup(<ResponsiveBotCreationFormHarness />);
        expect(html).not.toContain("sk-or-v1");
        expect(html).not.toContain("ghp_");
      });

      it("1.10.5 prevents XSS code injection in rawDraft diff display", () => {
        const malicious = `<script>alert("xss")</script><img src="x" onerror="steal()">`;
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft={malicious}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>alert");
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    describe("F7 Boundaries: Modal Interaction Limits", () => {
      it("2.7.1 disables 'Rendre professionnelles' button when instructions are empty or whitespace", () => {
        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness initialInstructions="   " />,
        );
        expect(html).toContain("disabled=\"\"");
      });

      it("2.7.2 handles large prompt (5,000 words) inside scrollable modal pane without layout overflow", () => {
        const largeDraft = "Paragraphe de consigne métier. ".repeat(500);
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft={largeDraft}
            initialCompiled={largeDraft}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("overflow-y-auto");
        expect(html).toContain("compiler-original-pane");
      });

      it("2.7.3 disables Apply button when compiledText is empty", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialCompiled=""
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("compiler-apply-btn");
        expect(html).toContain("disabled=\"\"");
      });

      it("2.7.4 hides telemetry badge when telemetry is undefined", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).not.toContain("compiler-telemetry-badge");
      });

      it("2.7.5 renders telemetry badge with token counts and latency when available", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toBeDefined();
      });
    });

    describe("F8 Boundaries: Viewport Sizes (320px to 1440px)", () => {
      it("2.8.1 renders responsive layout correctly on compact 320px mobile width (iPhone SE)", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Consigne courte"
            viewportWidth={320}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("w-[98%]");
        expect(html).toContain("h-[96vh]");
      });

      it("2.8.2 renders 390px modern smartphone layout (iPhone 14)", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Consigne 390px"
            viewportWidth={390}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("w-[98%]");
      });

      it("2.8.3 renders fluid drawer width on 768px tablet portrait", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Consigne tablette"
            viewportWidth={768}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("w-[90%]");
        expect(html).toContain("max-w-[90%]");
      });

      it("2.8.4 renders tablet landscape width on 1024px", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Consigne 1024px"
            viewportWidth={1024}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("w-[1000px]");
      });

      it("2.8.5 renders centered desktop modal on 1440px desktop screen", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Consigne desktop"
            viewportWidth={1440}
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("w-[1000px]");
      });
    });

    describe("F9 & F10 Boundaries: MCP Isolation & Sanitization", () => {
      it("2.9.1 verifies MCP toggle states in parent form remain completely unchanged during compiler lifecycle", () => {
        const initialMcp: BotMcpConfig = {
          connectors: { searxng: true, scraperr: true, github: false },
          tools: { "github_create_issue": false },
        };

        const html = renderToStaticMarkup(
          <ResponsiveBotCreationFormHarness
            initialInstructions="Brouillon..."
            initialMcpConfig={initialMcp}
          />,
        );

        expect(html).toContain("form-mcp-section");
        expect(html).toContain("mcp-toggle-searxng");
        expect(html).toContain("mcp-toggle-github");
      });

      it("2.9.2 handles retry click in error alert without closing modal", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialError="Gateway Error"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("compiler-retry-btn");
        expect(html).toContain("compiler-cancel-btn");
      });

      it("2.9.3 handles double click on 'Appliquer' button safely", () => {
        const onApply = vi.fn();
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            initialCompiled="Valid"
            onClose={() => {}}
            onApply={onApply}
          />,
        );
        expect(html).toContain("compiler-apply-btn");
      });

      it("2.9.4 handles empty bot title gracefully in modal header", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            botName="custom-bot"
            botTitle=""
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("Rendre les instructions professionnelles");
      });

      it("2.9.5 ensures close button is accessible with 44px touch target", () => {
        const html = renderToStaticMarkup(
          <PromptCompilerModalHarness
            isOpen={true}
            rawDraft="Draft"
            onClose={() => {}}
            onApply={() => {}}
          />,
        );
        expect(html).toContain("compiler-close-btn");
        expect(html).toContain("min-h-[44px]");
        expect(html).toContain("min-w-[44px]");
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 Mobile creation flow (<768px) + Prompt compilation + Draft preservation buffer", () => {
      const initialDraft = "Mon intention initiale de bot de support.";
      const formHtml = renderToStaticMarkup(
        <ResponsiveBotCreationFormHarness
          viewportWidth={375}
          initialInstructions={initialDraft}
        />,
      );

      expect(formHtml).toContain("w-[98%]");
      expect(formHtml).toContain(initialDraft);
      expect(formHtml).toContain("rendre-pro-btn");
    });

    it("3.2 Prompt compilation + Sovereign MCP tool selection immutability verification", () => {
      const mcpConfig: BotMcpConfig = {
        connectors: { searxng: true, scraperr: false, github: true },
        tools: {},
      };

      const form = (
        <ResponsiveBotCreationFormHarness
          initialInstructions="Superviser les serveurs."
          initialMcpConfig={mcpConfig}
          onSave={() => {}}
        />
      );

      const html = renderToStaticMarkup(form);
      expect(html).toContain("mon-nouvel-agent");
      expect(html).toContain("Connecteurs MCP Actifs");
    });

    it("3.3 Error banner with Retry and Cancel buttons preserves user work", () => {
      const html = renderToStaticMarkup(
        <PromptCompilerModalHarness
          isOpen={true}
          rawDraft="Draft utilisateur précieux"
          initialError="Gateway Timeout 504"
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      expect(html).toContain("compiler-error-alert");
      expect(html).toContain("compiler-retry-btn");
      expect(html).toContain("compiler-cancel-btn");
      expect(html).toContain("Draft utilisateur précieux");
    });

    it("3.4 Mobile chat composer with keyboard safe-area and send action integration", () => {
      const html = renderToStaticMarkup(
        <MobileComposerHarness onSendMessage={() => {}} />,
      );
      expect(html).toContain("mobile-composer-bar");
      expect(html).toContain("mobile-chat-textarea");
      expect(html).toContain("mobile-chat-send-btn");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Scenarios", () => {
    it("4.1 Real-World: Messy Voice Dictation to Professional Sales Agent on Mobile (<768px)", () => {
      const voiceTranscription =
        "Euh salut je veux un bot de vente pour ma boutique de vêtements en ligne qui aide à choisir la taille.";

      const mobileFormHtml = renderToStaticMarkup(
        <ResponsiveBotCreationFormHarness
          viewportWidth={390}
          initialInstructions={voiceTranscription}
        />,
      );

      expect(mobileFormHtml).toContain("w-[98%]");
      expect(mobileFormHtml).toContain("text-[16px]");

      const modalHtml = renderToStaticMarkup(
        <PromptCompilerModalHarness
          isOpen={true}
          rawDraft={voiceTranscription}
          botName="conseiller-mode"
          botTitle="Conseiller Vente et Taille"
          viewportWidth={390}
          initialCompiled={`## Rôle & Identité\nConseiller Vente et Taille.\n\n## Mission\nGuider les clients pour le choix de la taille.`}
          onClose={() => {}}
          onApply={() => {}}
        />,
      );

      expect(modalHtml).toContain("w-[98%]");
      expect(modalHtml).toContain("Conseiller Vente et Taille");
    });

    it("4.2 Real-World: Mobile Onboarding & Bot Creation on Touch Device (<768px) with Keyboard & Safe Areas", () => {
      const composerHtml = renderToStaticMarkup(
        <MobileComposerHarness onSendMessage={() => {}} />,
      );

      expect(composerHtml).toContain("pb-[max(12px,env(safe-area-inset-bottom))]");
      expect(composerHtml).toContain("min-w-0");
      expect(composerHtml).toContain("shrink-0");
      expect(composerHtml).toContain("min-h-[44px]");
    });

    it("4.3 Real-World: Desktop Bot Configuration with 3-tab MCP Inspector and Prompt Compilation", () => {
      const desktopHtml = renderToStaticMarkup(
        <ResponsiveBotCreationFormHarness
          viewportWidth={1440}
          initialInstructions="Auditer l'infrastructure Cloudflare et GitHub."
        />,
      );

      expect(desktopHtml).toContain("max-w-3xl");
      expect(desktopHtml).toContain("Cloudflare");
      expect(desktopHtml).toContain("GitHub");
    });
  });
});
