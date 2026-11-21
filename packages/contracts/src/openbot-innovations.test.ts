import { describe, expect, it } from "vitest";
import {
  ALREADY_WAITING_FR,
  CRITICAL_CLOSED_TOOLS,
  DECLINED_BY_PERSON_FR,
  HANDLED_BY_PERSON_FR,
  OUTCOME_UNKNOWN_FR,
  STANDING_RULE_LABELS_FR,
  buildRoutineChecklistNudgeFr,
  containsSensitiveData,
  countDanglingToolCalls,
  createStandingRule,
  extractRoutineParts,
  formatNotRunReasonFr,
  getApprovalOutcomeUserNoticeFr,
  identifyOpenRoutineParts,
  isRoutineChecklistComplete,
  maskSensitiveData,
  offersStandingRule,
  resolveToolApprovalStatus,
  sanitizeSeededHistory,
  sanitizeSkillPlaybookContent,
  type SanitizableMessage,
  type StandingRule,
} from "./index.js";

describe("OpenBot Innovations Suite: History Sanitize, Routine Checklist, Standing Rules & Sensitive Masking", () => {
  // =========================================================================
  // 1. History Sanitize (Anti-Dangles)
  // =========================================================================
  describe("1. History Sanitize Anti-Dangles", () => {
    it("preserves already healthy and paired history untouched", () => {
      const history: SanitizableMessage[] = [
        { role: "user", content: "Trouve les dernières opportunités Twenty CRM." },
        {
          role: "assistant",
          content: "Je recherche les fiches...",
          tool_calls: [
            {
              id: "call_crm_123",
              type: "function",
              function: { name: "twenty_list_opportunities", arguments: "{}" },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_crm_123",
          content: JSON.stringify([{ id: "opp_1", name: "Projet Alpha" }]),
        },
        { role: "assistant", content: "Voici l'opportunité trouvée : Projet Alpha." },
      ];

      const cleaned = sanitizeSeededHistory(history);
      expect(cleaned).toHaveLength(4);
      expect(cleaned[1]?.tool_calls).toHaveLength(1);
      expect(countDanglingToolCalls(history)).toBe(0);
    });

    it("drops dangling uncompleted tool call and empty assistant husk from interrupted run", () => {
      const interruptedHistory: SanitizableMessage[] = [
        { role: "user", content: "Lance une analyse du marché." },
        {
          role: "assistant",
          content: "", // Coquille vide sans texte
          tool_calls: [
            {
              id: "call_unanswered_999",
              type: "function",
              function: { name: "searxng_scraperr__web_search", arguments: '{"query":"market"}' },
            },
          ],
        },
        // Aucun message tool n'a pu atterrir car l'utilisateur a cliqué Stop
        { role: "user", content: "Finalement, fais autre chose." },
      ];

      expect(countDanglingToolCalls(interruptedHistory)).toBe(1);
      const cleaned = sanitizeSeededHistory(interruptedHistory);

      // Le message assistant sans texte et sans appel valide est complètement retiré
      expect(cleaned).toHaveLength(2);
      expect(cleaned[0]?.role).toBe("user");
      expect(cleaned[0]?.content).toBe("Lance une analyse du marché.");
      expect(cleaned[1]?.role).toBe("user");
      expect(cleaned[1]?.content).toBe("Finalement, fais autre chose.");
    });

    it("retains assistant text when tool calls are dropped but assistant said something", () => {
      const historyWithText: SanitizableMessage[] = [
        { role: "user", content: "Génère un rapport." },
        {
          role: "assistant",
          content: "Je commence par interroger l'API.",
          tool_calls: [
            {
              id: "call_lost_1",
              type: "function",
              function: { name: "custom_tool", arguments: "{}" },
            },
          ],
        },
        { role: "user", content: "Arrête tout." },
      ];

      const cleaned = sanitizeSeededHistory(historyWithText);
      expect(cleaned).toHaveLength(3);
      expect(cleaned[1]?.role).toBe("assistant");
      expect(cleaned[1]?.content).toBe("Je commence par interroger l'API.");
      expect(cleaned[1]?.tool_calls).toBeUndefined(); // L'appel orphelin a été retiré
    });

    it("drops orphaned tool results when tool call is missing", () => {
      const brokenHistory: SanitizableMessage[] = [
        { role: "user", content: "Message" },
        {
          role: "tool",
          tool_call_id: "non_existent_call",
          content: "Resultat fantôme",
        },
      ];

      const cleaned = sanitizeSeededHistory(brokenHistory);
      expect(cleaned).toHaveLength(1);
      expect(cleaned[0]?.role).toBe("user");
    });
  });

  // =========================================================================
  // 2. Routine Checklist Multi-Étapes
  // =========================================================================
  describe("2. Routine Checklist Multi-Étapes", () => {
    const routineInstruction = `
1. Extraire les nouveaux prospects dans Twenty CRM
2. Synthétiser les opportunités de la semaine
3. Rédiger un brouillon de publication Postiz
`;

    it("extracts numbered steps properly (2 to 10 steps)", () => {
      const steps = extractRoutineParts(routineInstruction);
      expect(steps).toHaveLength(3);
      expect(steps[0]).toContain("Extraire les nouveaux prospects");
      expect(steps[1]).toContain("Synthétiser les opportunités");
      expect(steps[2]).toContain("Rédiger un brouillon");
    });

    it("extracts inline numbered steps properly", () => {
      const inlineInstruction = "Consigne : 1) Récupérer le flux RSS 2) Filtrer les news tech 3) Sauvegarder dans Affine";
      const steps = extractRoutineParts(inlineInstruction);
      expect(steps).toHaveLength(3);
      expect(steps[0]).toBe("Récupérer le flux RSS");
      expect(steps[1]).toBe("Filtrer les news tech");
      expect(steps[2]).toBe("Sauvegarder dans Affine");
    });

    it("identifies open parts when the agent completed only step 1", () => {
      const steps = extractRoutineParts(routineInstruction);
      const partialAgentOutput = `
Voici mon avancée :
Étape 1 : Fait, 5 prospects extraits dans Twenty CRM.
`;
      const open = identifyOpenRoutineParts(steps, partialAgentOutput);
      expect(open).toHaveLength(2);
      expect(open[0]?.number).toBe(2);
      expect(open[1]?.number).toBe(3);
      expect(isRoutineChecklistComplete(steps, partialAgentOutput)).toBe(false);

      const nudge = buildRoutineChecklistNudgeFr(open);
      expect(nudge).toContain("[Rappel de Conformité de Routine]");
      expect(nudge).toContain("Étape 2 :");
      expect(nudge).toContain("Étape 3 :");
    });

    it("validates checklist completion when all steps are concluded (Done, Blocked, Skipped)", () => {
      const steps = extractRoutineParts(routineInstruction);
      const completeAgentOutput = `
Bilan d'exécution de la routine :
- Étape 1 : Fait (prospects récupérés)
- Étape 2 : Fait (synthèse prête)
- Étape 3 : Bloqué car aucun canal Postiz actif aujourd'hui.
`;
      const open = identifyOpenRoutineParts(steps, completeAgentOutput);
      expect(open).toHaveLength(0);
      expect(isRoutineChecklistComplete(steps, completeAgentOutput)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Standing Rules & Niveaux d'Approbation
  // =========================================================================
  describe("3. Standing Rules & Approbations Permanentes", () => {
    it("allows standing rules for standard tools and strictly forbids critical closed tools", () => {
      expect(offersStandingRule("twenty_list_opportunities")).toBe(true);
      expect(offersStandingRule("searxng_scraperr__web_search")).toBe(true);
      expect(offersStandingRule("postiz_create_post")).toBe(true);

      // Outils critiques irréversibles fermés
      expect(offersStandingRule("destroy_database")).toBe(false);
      expect(offersStandingRule("delete_workspace")).toBe(false);
      expect(offersStandingRule("twenty_delete_person")).toBe(false);
      expect(offersStandingRule("odoo_archive_or_cancel")).toBe(false);
      expect(CRITICAL_CLOSED_TOOLS.has("twenty_delete_person")).toBe(true);
    });

    it("resolves tool approval status based on thread or agent scope", () => {
      const rules: StandingRule[] = [
        createStandingRule("twenty_list_opportunities", "thread", { threadId: "thread_123" }),
        createStandingRule("postiz_create_post", "agent", { agentId: "agent_mercure" }),
      ];

      // Même threadId -> approuvé
      expect(
        resolveToolApprovalStatus(rules, "twenty_list_opportunities", { threadId: "thread_123" }),
      ).toBe("approved");

      // Autre threadId -> demande approbation
      expect(
        resolveToolApprovalStatus(rules, "twenty_list_opportunities", { threadId: "thread_999" }),
      ).toBe("needs_approval");

      // Même agent -> approuvé sur n'importe quel thread
      expect(
        resolveToolApprovalStatus(rules, "postiz_create_post", {
          agentId: "agent_mercure",
          threadId: "autre_thread",
        }),
      ).toBe("approved");

      // Outil critique destructeur -> toujours needs_approval même si règle créée
      expect(
        resolveToolApprovalStatus(rules, "destroy_database", { threadId: "thread_123" }),
      ).toBe("needs_approval");
    });

    it("provides standard French labels for standing rule scopes", () => {
      expect(STANDING_RULE_LABELS_FR.once).toBe("Autoriser une seule fois");
      expect(STANDING_RULE_LABELS_FR.thread).toBe("Toujours autoriser dans cette discussion");
      expect(STANDING_RULE_LABELS_FR.agent).toBe("Toujours autoriser pour cet agent");
    });
  });

  // =========================================================================
  // 4. Approval Outcomes (Normalisation des Refus Humains)
  // =========================================================================
  describe("4. Approval Outcomes Normalisation", () => {
    it("provides unambiguous non-evadable French messages for model prompt", () => {
      expect(DECLINED_BY_PERSON_FR).toContain("L'utilisateur a explicitement refusé cette action");
      expect(DECLINED_BY_PERSON_FR).toContain("Ne tentez pas cette action, ni aucune action équivalente");

      expect(HANDLED_BY_PERSON_FR).toContain("L'utilisateur a accompli cette action lui-même");
      expect(HANDLED_BY_PERSON_FR).toContain("Ne la répétez pas");

      expect(ALREADY_WAITING_FR).toContain("Une demande d'approbation rigoureusement identique");
      expect(OUTCOME_UNKNOWN_FR).toContain("résultat final est inconnu suite à une interruption");
    });

    it("formats not-run reasons and human notices correctly", () => {
      const formatted = formatNotRunReasonFr("outil temporairement indisponible.");
      expect(formatted).toBe(
        "Action non exécutée : outil temporairement indisponible. Réessayez si cela s'avère indispensable, ou mentionnez clairement dans votre réponse que l'information ou le résultat n'a pas pu être obtenu.",
      );

      expect(getApprovalOutcomeUserNoticeFr("declined")).toBe("Action refusée par l'utilisateur.");
      expect(getApprovalOutcomeUserNoticeFr("handled")).toBe(
        "Action réalisée manuellement par l'utilisateur.",
      );
    });
  });

  // =========================================================================
  // 5. Sensitive Masking & Bouclier de Confidentialité
  // =========================================================================
  describe("5. Sensitive Masking & Bouclier Anti-Fuite", () => {
    it("detects sensitive data presence reliably", () => {
      expect(containsSensitiveData("Mon texte standard sans secret")).toBe(false);
      expect(containsSensitiveData("Voici ma clé: sk-proj-1234567890abcdef1234567890")).toBe(true);
      expect(containsSensitiveData("Numéro de carte : 4532 1234 5678 9010")).toBe(true);
      expect(containsSensitiveData("Mon mot de passe : SecretPass123!")).toBe(true);
      expect(containsSensitiveData("Votre code validation : 849201")).toBe(true);
    });

    it("masks sensitive fields while preserving the surrounding text", () => {
      const rawText = `
Veuillez utiliser la configuration suivante :
api_key: sk-1234567890abcdef1234567890
cvv: 456
credit_card: 4532-1234-5678-9010
mot de passe: SuperSecret!
pin: 1234
Tout le reste du document reste lisible.
`;

      const masked = maskSensitiveData(rawText);
      expect(masked).not.toContain("sk-1234567890abcdef1234567890");
      expect(masked).not.toContain("456");
      expect(masked).not.toContain("4532-1234-5678-9010");
      expect(masked).not.toContain("SuperSecret!");
      expect(masked).toContain("[MASQUÉ: CLÉ FOURNISSEUR]");
      expect(masked).toContain("[MASQUÉ: CVV]");
      expect(masked).toContain("[MASQUÉ: NUMÉRO BANCAIRE]");
      expect(masked).toContain("[MASQUÉ: MOT DE PASSE]");
      expect(masked).toContain("Tout le reste du document reste lisible.");
    });

    it("sanitizes skill playbook content and counts masked elements", () => {
      const playbook = "Étape 1 : Connexion avec bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNdfWsf. Étape 2 : exporter.";
      const res = sanitizeSkillPlaybookContent(playbook);
      expect(res.maskedCount).toBeGreaterThanOrEqual(1);
      expect(res.sanitized).toContain("[MASQUÉ: JETON JWT]");
      expect(res.sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    });
  });
});
