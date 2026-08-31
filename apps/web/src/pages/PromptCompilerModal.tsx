import { AlertCircle, Check, RefreshCw, Sparkles, X } from "lucide-react";
import React, { useState } from "react";
import { rpc } from "../lib/rpc.js";

// Zero-Secret Invariant Masking Helper
function sanitizeToolError(message: string): string {
  return message
    .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_[redacted]")
    .replace(/github_pat_[a-zA-Z0-9_]+/g, "github_pat_[redacted]")
    .replace(/secret_[a-zA-Z0-9]+/g, "secret_[redacted]")
    .replace(/sk-or-v1-[a-zA-Z0-9_-]+/g, "sk-or-v1-[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/Basic\s+\S+/gi, "Basic [redacted]");
}

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

export function PromptCompilerModal({
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
  const [error, setError] = useState<string | null>(
    initialError ? sanitizeToolError(initialError) : null,
  );
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
        try {
          const res = await (rpc as any).prompts.compile({
            rawInstruction: rawDraft,
            botName,
            botTitle,
            level: targetLevel,
          });
          setCompiledText(res.compiledInstruction);
          if (res.telemetry) setTelemetry(res.telemetry);
        } catch (rpcErr) {
          const fallback =
            "## Rôle & Identité\nVous êtes l'agent '" +
            botName +
            "' " +
            (botTitle ? "(" + botTitle + ")" : "") +
            ".\n\n## Mission Principale\n" +
            rawDraft.trim() +
            "\n\n## Directives & Garde-fous Stricts\n- Exécuter avec concision, méthode et précision.\n- N'appeler que les outils strictement nécessaires.\n\n## Format de Sortie\nMarkdown dense et structuré sans préambule superflu.";
          setCompiledText(fallback);
        }
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
        className={
          "flex flex-col overflow-hidden rounded-2xl border border-[#2A2A2E] bg-[#141416] text-[#ECECEE] shadow-2xl transition-all " +
          (isMobile
            ? "h-[96vh] w-[98%] max-w-[98%]"
            : isTablet
              ? "h-[85vh] w-[90%] max-w-[90%]"
              : "h-[800px] w-[1000px] max-w-full")
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#26262A] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400">
              <Sparkles size={18} />
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
            aria-label="Fermer"
            className="flex h-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#85858A] hover:bg-[#1E1E22] hover:text-white"
          >
            <X size={18} />
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
              className={
                "flex items-center justify-center rounded-lg px-3 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-medium transition-colors " +
                (level === "level1_deterministic"
                  ? "bg-[#2C2C30] text-white"
                  : "text-[#85858A] hover:text-white")
              }
            >
              Niveau 1 : Structuré (Rapide)
            </button>
            <button
              type="button"
              data-testid="level-toggle-level2"
              onClick={() => handleTriggerCompile("level2_llm")}
              disabled={isCompiling}
              className={
                "flex items-center justify-center rounded-lg px-3 py-1.5 min-h-[38px] sm:min-h-0 text-xs font-medium transition-colors " +
                (level === "level2_llm"
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                  : "text-[#85858A] hover:text-white")
              }
            >
              Niveau 2 : IA gpt-oss-120b
            </button>
          </div>

          {telemetry && (
            <div
              data-testid="compiler-telemetry-badge"
              className="flex items-center gap-3 text-[11px] text-[#A1A1AA]"
            >
              {telemetry.cachedTokens !== undefined && (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                  {telemetry.cachedTokens} tokens en cache (
                  {((telemetry.cacheHitRatio ?? 0) * 100).toFixed(0)}%)
                </span>
              )}
              {telemetry.durationMs !== undefined && <span>{telemetry.durationMs} ms</span>}
            </div>
          )}
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div
            data-testid="compiler-error-alert"
            className="flex items-center justify-between border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-xs text-rose-300 sm:px-6"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-rose-400" />
              <span>Erreur : {error}</span>
            </div>
            <button
              type="button"
              data-testid="compiler-retry-btn"
              onClick={() => handleTriggerCompile(level)}
              className="flex items-center gap-1 font-medium text-rose-200 underline hover:text-white min-h-[44px] px-2"
            >
              <RefreshCw size={12} />
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
            <label className="mb-2 text-xs font-medium uppercase tracking-wider text-[#71717A]">
              Brouillon initial (non modifié)
            </label>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#26262A] bg-[#0E0E10] p-3.5 font-mono text-xs text-[#A1A1AA]">
              {rawDraft || "(Aucun texte saisi)"}
            </div>
          </div>

          {/* Right: Compiled Instructions (Editable) */}
          <div
            data-testid="compiler-compiled-pane"
            className="flex flex-col bg-[#121215] p-4 sm:p-5"
          >
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium uppercase tracking-wider text-indigo-400">
                Instructions Professionnelles Structurées
              </label>
              <span className="text-[11px] text-[#71717A]">Modifiable avant application</span>
            </div>

            {isCompiling ? (
              <div
                data-testid="compiler-loading-spinner"
                className="flex flex-1 flex-col items-center justify-center rounded-xl border border-[#26262A] bg-[#0E0E10] p-6 text-center text-[#85858A]"
              >
                <div className="mb-3 h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                <p className="text-xs font-medium text-[#ECECEE]">
                  Structuration par gpt-oss-120b en cours…
                </p>
                <p className="mt-1 text-[11px] text-[#71717A]">
                  Application du format hiérarchique et des garde-fous
                </p>
              </div>
            ) : (
              <textarea
                data-testid="compiler-output-textarea"
                value={compiledText}
                onChange={(e) => setCompiledText(e.target.value)}
                placeholder="Les instructions compilées apparaîtront ici…"
                className="flex-1 resize-none rounded-xl border border-[#2A2A2E] bg-[#0E0E10] p-3.5 font-mono text-[16px] text-[#ECECEE] outline-none focus:border-indigo-500/60 sm:text-xs"
              />
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#26262A] bg-[#141416] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-3.5">
          <button
            type="button"
            data-testid="compiler-cancel-btn"
            onClick={onClose}
            className="flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#2C2C30] px-4 text-xs font-medium text-[#A1A1AA] hover:bg-[#1E1E22] hover:text-white"
          >
            Annuler (Conserver le brouillon)
          </button>

          <button
            type="button"
            data-testid="compiler-apply-btn"
            disabled={isCompiling || !compiledText.trim()}
            onClick={() => onApply(compiledText)}
            className="flex h-11 min-h-[44px] min-w-[44px] items-center gap-1.5 justify-center rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
          >
            <Check size={14} />
            Appliquer au bot
          </button>
        </div>
      </div>
    </div>
  );
}
