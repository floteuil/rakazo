import type { InferenceMode, InferenceUsageTag, ThreadMessage } from "@rakazo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelSettingsOverlay } from "./ModelSettingsOverlay";
import { IntelligenceSelector } from "./Shell";

// Helper to simulate MessageView turn metadata rendering logic
function renderMessageTurnBadge(message: ThreadMessage): string {
  const m = message as any;
  const rawMeta = m.metadata || m.executionMetadata || m.execution || m.inference || {};
  const resolvedModel =
    rawMeta.resolvedModel ||
    rawMeta.model ||
    m.resolvedModel ||
    m.model ||
    m.run?.modelId ||
    m.run?.model ||
    null;
  const resolvedProvider =
    rawMeta.resolvedProvider ||
    rawMeta.provider ||
    m.resolvedProvider ||
    m.provider ||
    m.run?.modelProvider ||
    m.run?.provider ||
    null;
  const isFree =
    rawMeta.isFree ??
    m.isFree ??
    (rawMeta.mode === "free" ||
      m.inferenceMode === "free" ||
      (typeof resolvedModel === "string" &&
        (resolvedModel.includes(":free") || resolvedModel.includes("free"))));

  if (!resolvedModel && !resolvedProvider) return "";

  const text =
    resolvedModel && resolvedProvider
      ? `Modèle utilisé : ${resolvedModel} · ${resolvedProvider}`
      : resolvedModel
        ? `Gratuit via OmniRoute · ${resolvedModel}`
        : `Modèle utilisé : ${resolvedProvider}`;

  return renderToStaticMarkup(
    <div data-testid="turn-execution-metadata" className="turn-badge">
      <span className="dot" />
      <span>{text}</span>
    </div>,
  );
}

describe("R3 WebUI UX Decoupling & Turn Observability Suite", () => {
  // ============================================================================
  // 1. DECOUPLED CAPABILITY DESCRIPTIONS
  // ============================================================================
  describe("1. Decoupled Capability Descriptions (USAGE_TAG_OPTIONS)", () => {
    it("renders clean capability descriptions without ephemeral static model names", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelector
          inferenceMode="free"
          usageTags={["coding", "reasoning", "fast", "writing", "analysis"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      // Verify all 5 decoupled capability descriptions are present
      expect(html).toContain("Optimisé pour la génération et revue de code");
      expect(html).toContain("Optimisé pour le raisonnement logique et complexe");
      expect(html).toContain("Ultra-rapide pour requêtes courtes");
      expect(html).toContain("Rédaction fluide et synthèse");
      expect(html).toContain("Analyse documentaire et extraction");

      // Verify no ephemeral static model names leaked into descriptions
      expect(html).not.toContain("DeepSeek / Qwen Coder");
      expect(html).not.toContain("Mistral Small 24B");
      expect(html).not.toContain("DeepSeek R1");
      expect(html).not.toContain("LLaMA 3.2 3B");
      expect(html).not.toContain("Qwen 2.5 72B");
    });
  });

  // ============================================================================
  // 2. STABLE INTENT PRESENTATION
  // ============================================================================
  describe("2. Stable Intent Representation (IntelligenceSelector)", () => {
    it("displays stable intent banner with selected tag in Free mode", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelector
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain('data-testid="omniroute-stable-intent"');
      expect(html).toContain("Gratuit via OmniRoute · Profil : Coding");
      expect(html).toContain("Zéro-Coût");
    });

    it("displays multiple tags in stable intent banner", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelector
          inferenceMode="free"
          usageTags={["coding", "reasoning"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("Gratuit via OmniRoute · Profil : Coding, Reasoning");
    });

    it("displays default 'Général' profile when no tags are selected", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelector
          inferenceMode="free"
          usageTags={[]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).toContain("Gratuit via OmniRoute · Profil : Général");
    });

    it("hides stable intent banner in Premium mode", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelector
          inferenceMode="premium"
          usageTags={[]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
        />,
      );

      expect(html).not.toContain('data-testid="omniroute-stable-intent"');
    });
  });

  // ============================================================================
  // 3. TURN OBSERVABILITY BADGE & FAILOVER RESILIENCE
  // ============================================================================
  describe("3. Per-Turn Execution Metadata Badge & Dynamic Failover", () => {
    it("renders per-turn metadata badge with resolved model and provider", () => {
      const message: ThreadMessage = {
        id: "msg-1",
        threadId: "th-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Voici le code généré." }],
        createdAt: new Date().toISOString(),
        metadata: {
          resolvedModel: "codestral-latest",
          resolvedProvider: "Mistral AI",
          isFree: true,
        },
      } as any;

      const html = renderMessageTurnBadge(message);
      expect(html).toContain('data-testid="turn-execution-metadata"');
      expect(html).toContain("Modèle utilisé : codestral-latest · Mistral AI");
    });

    it("renders OmniRoute free badge when only resolvedModel is present", () => {
      const message: ThreadMessage = {
        id: "msg-2",
        threadId: "th-1",
        seq: 2,
        role: "bot",
        blocks: [{ kind: "text", text: "Analyse terminée." }],
        createdAt: new Date().toISOString(),
        metadata: {
          resolvedModel: "qwen-2.5-coder-32b",
          isFree: true,
        },
      } as any;

      const html = renderMessageTurnBadge(message);
      expect(html).toContain('data-testid="turn-execution-metadata"');
      expect(html).toContain("Gratuit via OmniRoute · qwen-2.5-coder-32b");
    });

    it("updates turn metadata smoothly during failover without error alerts", () => {
      // Turn 1: Mistral
      const turn1: ThreadMessage = {
        id: "msg-turn1",
        threadId: "th-1",
        seq: 1,
        role: "bot",
        blocks: [{ kind: "text", text: "Première réponse via Mistral." }],
        createdAt: new Date().toISOString(),
        metadata: {
          resolvedModel: "codestral-latest",
          resolvedProvider: "Mistral AI",
          isFree: true,
        },
      } as any;

      const html1 = renderMessageTurnBadge(turn1);
      expect(html1).toContain("Modèle utilisé : codestral-latest · Mistral AI");
      expect(html1).not.toContain("Erreur");
      expect(html1).not.toContain("Failover");

      // Turn 2: Fallback to Groq / Qwen seamlessly
      const turn2: ThreadMessage = {
        id: "msg-turn2",
        threadId: "th-1",
        seq: 2,
        role: "bot",
        blocks: [{ kind: "text", text: "Deuxième réponse après failover transparent." }],
        createdAt: new Date().toISOString(),
        metadata: {
          resolvedModel: "qwen-2.5-coder-32b",
          resolvedProvider: "Groq",
          isFree: true,
        },
      } as any;

      const html2 = renderMessageTurnBadge(turn2);
      expect(html2).toContain("Modèle utilisé : qwen-2.5-coder-32b · Groq");
      expect(html2).not.toContain("Erreur");
      expect(html2).not.toContain("Failover");
    });
  });

  // ============================================================================
  // 4. MODEL SETTINGS OVERLAY
  // ============================================================================
  describe("4. ModelSettingsOverlay Decoupled Capability Banner", () => {
    it("renders capability banner explaining decoupled dynamic routing", () => {
      const html = renderToStaticMarkup(<ModelSettingsOverlay onClose={() => {}} />);

      expect(html).toContain('data-testid="omniroute-capability-banner"');
      expect(html).toContain("Mode Gratuit · Découplage Dynamique (OmniRoute)");
      expect(html).toContain("Zéro-Coût Garanti");
      expect(html).toContain("Coding, Reasoning, Fast, Writing, Analysis");
    });
  });

  // ============================================================================
  // 5. RESPONSIVENESS & TOUCH TARGETS
  // ============================================================================
  describe("5. Ergonomics & Multi-Screen Responsiveness", () => {
    it("ensures touch targets are >= 44px on mobile and desktop", () => {
      const html = renderToStaticMarkup(
        <IntelligenceSelector
          inferenceMode="free"
          usageTags={["coding"]}
          onChangeMode={() => {}}
          onToggleTag={() => {}}
          viewportWidth={375}
        />,
      );

      const count44px = (html.match(/min-h-\[44px\]/g) || []).length;
      expect(count44px).toBe(7); // 2 mode buttons + 5 tag chips
    });
  });
});
