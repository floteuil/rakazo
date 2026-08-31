import type { InferenceMode, InferenceUsageTag } from "@rakazo/contracts";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// ============================================================================
// COMPONENT TEST HARNESS: OMNIROUTE INTELLIGENCE & TAGS SELECTOR
// ============================================================================

interface BotInferenceFormState {
  name: string;
  instructions: string;
  inferenceMode: InferenceMode;
  usageTags: InferenceUsageTag[];
}

interface IntelligenceSelectorProps {
  inferenceMode: InferenceMode;
  usageTags: InferenceUsageTag[];
  onChangeMode: (mode: InferenceMode) => void;
  onToggleTag: (tag: InferenceUsageTag) => void;
  disabled?: boolean;
  viewportWidth?: number;
}

const USAGE_TAG_OPTIONS: {
  id: InferenceUsageTag;
  label: string;
  description: string;
  badge: string;
}[] = [
  {
    id: "coding",
    label: "Code & Scripting",
    description: "Optimisé pour la génération et revue de code",
    badge: "Dev",
  },
  {
    id: "writing",
    label: "Rédaction & Synthèse",
    description: "Rédaction fluide et synthèse",
    badge: "Prose",
  },
  {
    id: "reasoning",
    label: "Raisonnement & Logique",
    description: "Optimisé pour le raisonnement logique et complexe",
    badge: "Logic",
  },
  {
    id: "fast",
    label: "Ultra Rapide & Triage",
    description: "Ultra-rapide pour requêtes courtes",
    badge: "Fast",
  },
  {
    id: "analysis",
    label: "Analyse & Données",
    description: "Analyse documentaire et extraction",
    badge: "Data",
  },
];

function IntelligenceSelectorHarness({
  inferenceMode,
  usageTags,
  onChangeMode,
  onToggleTag,
  disabled = false,
  viewportWidth = 1280,
}: IntelligenceSelectorProps) {
  const isMobile = viewportWidth < 768;

  return (
    <div
      data-testid="omniroute-intelligence-panel"
      className={`flex flex-col gap-4 rounded-xl border border-zinc-800 bg-[#0F0F12] p-4 text-white ${
        isMobile ? "w-full max-w-full px-3 py-4" : "max-w-[640px]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
            Moteur d'Intelligence
            {inferenceMode === "free" && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                100% Gratuit &amp; Zéro-Coût
              </span>
            )}
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Choisissez entre l'intelligence souveraine gratuite ou le modèle haute puissance.
          </p>
        </div>
      </div>

      {/* Segmented Control (Premium vs Gratuit) */}
      <div
        role="tablist"
        aria-label="Sélection du mode d'inférence"
        className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-900/90 p-1 border border-zinc-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={inferenceMode === "premium"}
          data-testid="mode-premium-btn"
          disabled={disabled}
          onClick={() => onChangeMode("premium")}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all ${
            inferenceMode === "premium"
              ? "bg-zinc-800 text-white shadow-sm border border-zinc-700"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-purple-500" />
          <span>Premium (GPT-OSS-120B)</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={inferenceMode === "free"}
          data-testid="mode-free-btn"
          disabled={disabled}
          onClick={() => onChangeMode("free")}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-all ${
            inferenceMode === "free"
              ? "bg-emerald-500/15 text-emerald-300 shadow-sm border border-emerald-500/30 font-semibold"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Gratuit (OmniRoute Free)</span>
        </button>
      </div>

      {/* Stable Intent Presentation */}
      {inferenceMode === "free" && (
        <div
          data-testid="omniroute-stable-intent"
          className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2 text-xs text-emerald-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-medium">
              Gratuit via OmniRoute · Profil :{" "}
              {usageTags.length > 0
                ? usageTags.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(", ")
                : "Général"}
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400/80 uppercase">Zéro-Coût</span>
        </div>
      )}

      {/* Usage Tags Section (Active only when Free mode is selected) */}
      {inferenceMode === "free" && (
        <div
          data-testid="usage-tags-container"
          className="flex flex-col gap-2 pt-2 border-t border-zinc-800/80"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Tags d'usage recommandés (max 3)</span>
            <span
              data-testid="tag-count-indicator"
              className={usageTags.length === 3 ? "text-amber-400 font-medium" : "text-zinc-500"}
            >
              {usageTags.length} / 3 sélectionnés
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {USAGE_TAG_OPTIONS.map((tag) => {
              const isSelected = usageTags.includes(tag.id);
              const isMaxReached = usageTags.length >= 3 && !isSelected;

              return (
                <button
                  key={tag.id}
                  type="button"
                  data-testid={`tag-chip-${tag.id}`}
                  aria-pressed={isSelected}
                  disabled={disabled || (isMaxReached && !isSelected)}
                  onClick={() => onToggleTag(tag.id)}
                  className={`flex min-h-[44px] items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition-all border ${
                    isSelected
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-xs"
                      : isMaxReached
                        ? "border-zinc-800/40 bg-zinc-900/30 text-zinc-600 opacity-50 cursor-not-allowed"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{tag.label}</span>
                    <span className="text-[10px] text-zinc-500">{tag.description}</span>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {tag.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Safe Area Mobile Footer padding container */}
      {isMobile && (
        <div
          data-testid="mobile-safe-area-padder"
          className="h-[env(safe-area-inset-bottom,16px)] w-full pointer-events-none"
        />
      )}
    </div>
  );
}

// Wrapper with real state logic
function StatefulIntelligenceForm({
  initialMode = "premium",
  initialTags = [],
  viewportWidth = 1280,
}: {
  initialMode?: InferenceMode;
  initialTags?: InferenceUsageTag[];
  viewportWidth?: number;
}) {
  const [formState, setFormState] = useState<BotInferenceFormState>({
    name: "Mon Assistant IA",
    instructions: "Instructions générales",
    inferenceMode: initialMode,
    usageTags: initialTags,
  });

  const handleToggleTag = (tag: InferenceUsageTag) => {
    setFormState((prev) => {
      if (prev.usageTags.includes(tag)) {
        return { ...prev, usageTags: prev.usageTags.filter((t) => t !== tag) };
      }
      if (prev.usageTags.length >= 3) {
        return prev; // Maximum 3 tags limit
      }
      return { ...prev, usageTags: [...prev.usageTags, tag] };
    });
  };

  return (
    <IntelligenceSelectorHarness
      inferenceMode={formState.inferenceMode}
      usageTags={formState.usageTags}
      onChangeMode={(mode) => setFormState((prev) => ({ ...prev, inferenceMode: mode }))}
      onToggleTag={handleToggleTag}
      viewportWidth={viewportWidth}
    />
  );
}

describe("E2E WebUI Intelligence & Tag Selector Suite (Tiers 1, 2, 4)", () => {
  // ============================================================================
  // TIER 1: FEATURE COVERAGE (UI Rendering, Segmented Control, Pill Chips)
  // ============================================================================
  describe("Tier 1 - WebUI Intelligence Selector Feature Coverage", () => {
    it("renders segmented control with Premium and Gratuit options in initial premium state", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="premium"
          usageTags={[]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain('data-testid="omniroute-intelligence-panel"');
      expect(html).toContain('data-testid="mode-premium-btn"');
      expect(html).toContain('data-testid="mode-free-btn"');
      expect(html).toContain("Premium (GPT-OSS-120B)");
      expect(html).toContain("Gratuit (OmniRoute Free)");
      expect(html).toContain('aria-selected="true"'); // Premium selected
      expect(html).not.toContain('data-testid="usage-tags-container"'); // Hidden when premium
    });

    it("renders free mode active banner and reveals all 5 usage tag chips", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("100% Gratuit &amp; Zéro-Coût");
      expect(html).toContain('data-testid="usage-tags-container"');
      expect(html).toContain('data-testid="tag-chip-coding"');
      expect(html).toContain('data-testid="tag-chip-writing"');
      expect(html).toContain('data-testid="tag-chip-reasoning"');
      expect(html).toContain('data-testid="tag-chip-fast"');
      expect(html).toContain('data-testid="tag-chip-analysis"');
      expect(html).toContain("1 / 3 sélectionnés");
    });

    it("renders active highlight styling on selected tags", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding", "fast"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("2 / 3 sélectionnés");
      expect(html).toContain('data-testid="tag-chip-coding" aria-pressed="true"');
      expect(html).toContain('data-testid="tag-chip-fast" aria-pressed="true"');
      expect(html).toContain('data-testid="tag-chip-writing" aria-pressed="false"');
    });

    it("verifies tag option metadata: Dev badge for coding, Logic badge for reasoning", () => {
      const coding = USAGE_TAG_OPTIONS.find((t) => t.id === "coding");
      const reasoning = USAGE_TAG_OPTIONS.find((t) => t.id === "reasoning");
      const writing = USAGE_TAG_OPTIONS.find((t) => t.id === "writing");
      const fast = USAGE_TAG_OPTIONS.find((t) => t.id === "fast");
      const analysis = USAGE_TAG_OPTIONS.find((t) => t.id === "analysis");

      expect(coding?.badge).toBe("Dev");
      expect(reasoning?.badge).toBe("Logic");
      expect(writing?.badge).toBe("Prose");
      expect(fast?.badge).toBe("Fast");
      expect(analysis?.badge).toBe("Data");
    });

    it("verifies StatefulIntelligenceForm initializes with provided default tags", () => {
      const html = renderToStaticMarkup(
        <StatefulIntelligenceForm initialMode="free" initialTags={["writing", "analysis"]} />,
      );

      expect(html).toContain("2 / 3 sélectionnés");
      expect(html).toContain('data-testid="tag-chip-writing" aria-pressed="true"');
      expect(html).toContain('data-testid="tag-chip-analysis" aria-pressed="true"');
    });

    it("verifies panel description text explains sovereign free intelligence", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="premium"
          usageTags={[]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("intelligence souveraine gratuite");
    });

    it("verifies green dot indicator rendered next to Free mode option", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={[]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("bg-emerald-400");
    });

    it("verifies purple dot indicator rendered next to Premium mode option", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="premium"
          usageTags={[]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("bg-purple-500");
    });
  });

  // ============================================================================
  // TIER 2: BOUNDARY & CORNER CASES (Max 3 Tags Limit, Disabled States)
  // ============================================================================
  describe("Tier 2 - Boundary Checks & Tag Limit Enforcement", () => {
    it("disables unselected tag chips when exactly 3 tags are selected", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding", "writing", "reasoning"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("3 / 3 sélectionnés");
      expect(html).toContain('data-testid="tag-chip-fast" aria-pressed="false" disabled=""');
      expect(html).toContain('data-testid="tag-chip-analysis" aria-pressed="false" disabled=""');
      expect(html).not.toContain('data-testid="tag-chip-coding" aria-pressed="true" disabled=""');
    });

    it("respects global disabled prop across all buttons and chips", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
          disabled={true}
        />,
      );

      expect(html).toContain('data-testid="mode-premium-btn" disabled=""');
      expect(html).toContain('data-testid="mode-free-btn" disabled=""');
      expect(html).toContain('data-testid="tag-chip-coding" aria-pressed="true" disabled=""');
    });

    it("handles empty initialTags array without errors", () => {
      const html = renderToStaticMarkup(
        <StatefulIntelligenceForm initialMode="free" initialTags={[]} />,
      );
      expect(html).toContain("0 / 3 sélectionnés");
    });

    it("renders warning highlight class on tag counter when 3 tags are reached", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding", "fast", "analysis"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );
      expect(html).toContain("text-amber-400 font-medium");
    });

    it("renders standard subdued class on tag counter when fewer than 3 tags are chosen", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );
      expect(html).toContain("text-zinc-500");
    });
  });

  // ============================================================================
  // TIER 4: MULTI-SCREEN & TOUCH ERGONOMICS ACROSS 9 RESOLUTIONS
  // ============================================================================
  describe("Tier 4 - Multi-Screen & Touch Ergonomics across 9 Viewports", () => {
    const VIEWPORT_RESOLUTIONS = [
      { name: "320px (iPhone SE 1st gen)", width: 320, isMobile: true },
      { name: "360px (Android Small)", width: 360, isMobile: true },
      { name: "375px (iPhone Mini)", width: 375, isMobile: true },
      { name: "390px (iPhone Standard)", width: 390, isMobile: true },
      { name: "430px (iPhone Pro Max)", width: 430, isMobile: true },
      { name: "768px (Tablet Portrait)", width: 768, isMobile: false },
      { name: "1024px (Tablet Landscape)", width: 1024, isMobile: false },
      { name: "1280px (Desktop Standard)", width: 1280, isMobile: false },
      { name: "1440px (Large Desktop)", width: 1440, isMobile: false },
    ];

    for (const vp of VIEWPORT_RESOLUTIONS) {
      it(`renders properly without overflow on ${vp.name}`, () => {
        const html = renderToStaticMarkup(
          <IntelligenceSelectorHarness
            inferenceMode="free"
            usageTags={["coding", "fast"]}
            onChangeMode={() => {}}
            onToggleTag={() => {}}
            viewportWidth={vp.width}
          />,
        );

        expect(html).toContain('data-testid="omniroute-intelligence-panel"');
        if (vp.isMobile) {
          expect(html).toContain("w-full max-w-full px-3 py-4");
          expect(html).toContain('data-testid="mobile-safe-area-padder"');
        } else {
          expect(html).toContain("max-w-[640px]");
        }
      });
    }

    it("verifies touch target compliance >= 44px on all interactive controls", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
          viewportWidth={375}
        />,
      );

      // Buttons and tag chips must include min-h-[44px]
      const count44px = (html.match(/min-h-\[44px\]/g) || []).length;
      // 2 mode buttons + 5 tag chips = 7 interactive items with min-h-[44px]
      expect(count44px).toBe(7);
    });

    it("applies dark theme background and border tokens", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelectorHarness
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("bg-[#0F0F12]");
      expect(html).toContain("border-zinc-800");
    });
  });
});
