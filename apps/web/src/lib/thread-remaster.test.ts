import { describe, expect, it } from "vitest";
import {
  applySilentRoutineClause,
  buildFiveLineThreadHandoff,
  estimateTokensSavedByRemaster,
  hasSilentRoutineClause,
  REMASTER_SUGGESTION_THRESHOLD,
  ROUTINE_SILENT_CLAUSE_FR,
  shouldSuggestThreadRemaster,
  stripSilentRoutineClauseForEditor,
} from "./thread-remaster";

describe("Thread Remaster (P3 — Handoff 5 lignes) & Silent Routine UI Helpers (P4)", () => {
  it("builds a deterministic 5-line French continuity handoff with 0 LLM calls", () => {
    const handoff = buildFiveLineThreadHandoff({
      botName: "Orion",
      botTitle: "Architecte SEO & Contenu",
      botDescription: "Gère le référencement et les publications du groupe.",
      messages: [
        {
          role: "user",
          blocks: [{ kind: "text", text: "Prépare la stratégie de mots-clés pour HubToWork." }],
        },
        {
          role: "bot",
          blocks: [
            {
              kind: "text",
              text: "J'ai extrait 15 requêtes prioritaires et préparé le cocon sémantique.",
            },
          ],
        },
        {
          role: "user",
          blocks: [
            {
              kind: "text",
              text: "Parfait, passe maintenant à la rédaction du brouillon de la page pilier.",
            },
          ],
        },
      ],
    });

    const lines = handoff.split("\n");
    expect(lines).toHaveLength(6); // Header + 5 numbered lines
    expect(lines[0]).toBe("[HANDOFF DE CONTINUITÉ — FIL REMASTERISÉ]");
    expect(lines[1]).toContain("1. Agent & Rôle : Orion — Architecte SEO & Contenu");
    expect(lines[2]).toContain(
      "2. Objectif initial : Prépare la stratégie de mots-clés pour HubToWork.",
    );
    expect(lines[3]).toContain(
      "3. Dernier état validé : J'ai extrait 15 requêtes prioritaires et préparé le cocon sémantique.",
    );
    expect(lines[4]).toContain("4. Contexte condensé (3 msg) :");
    expect(lines[5]).toContain(
      "5. Prochaine étape immédiate : Parfait, passe maintenant à la rédaction du brouillon de la page pilier.",
    );
  });

  it("suggests thread remaster at or above REMASTER_SUGGESTION_THRESHOLD (12 messages) and computes token savings", () => {
    expect(REMASTER_SUGGESTION_THRESHOLD).toBe(12);
    expect(shouldSuggestThreadRemaster(11)).toBe(false);
    expect(shouldSuggestThreadRemaster(12)).toBe(true);

    const longMessages = Array.from({ length: 16 }, (_, idx) => ({
      role: idx % 2 === 0 ? "user" : "bot",
      blocks: [
        {
          kind: "text",
          text: `Message numéro ${idx + 1} contenant une analyse détaillée de l'architecture et des métriques de performance pour vérifier la réduction drastique de consommation de tokens.`,
        },
      ],
    }));

    const handoff = buildFiveLineThreadHandoff({
      botName: "Orion",
      messages: longMessages,
    });

    const stats = estimateTokensSavedByRemaster(longMessages, handoff);
    expect(stats.originalTokens).toBeGreaterThan(stats.handoffTokens);
    expect(stats.savedTokens).toBeGreaterThan(200);
    expect(stats.reductionPercent).toBeGreaterThan(50);
  });

  it("applies, detects, and strips the French NO_SIGNAL silent routine clause cleanly", () => {
    const rawPrompt = "Vérifie les erreurs 500 sur les sites WordPress.";
    expect(hasSilentRoutineClause(rawPrompt)).toBe(false);

    const protectedPrompt = applySilentRoutineClause(rawPrompt, true);
    expect(hasSilentRoutineClause(protectedPrompt)).toBe(true);
    expect(protectedPrompt).toContain(ROUTINE_SILENT_CLAUSE_FR);

    // Idempotent when called again
    expect(applySilentRoutineClause(protectedPrompt, true)).toBe(protectedPrompt);

    // Stripped cleanly for editor display or when disabled
    expect(stripSilentRoutineClauseForEditor(protectedPrompt)).toBe(rawPrompt);
    expect(applySilentRoutineClause(protectedPrompt, false)).toBe(rawPrompt);
  });
});
