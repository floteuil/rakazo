/**
 * Gestion des règles d'approbation permanentes (« Standing Rules »).
 *
 * Résout le problème de la fatigue décisionnelle où l'utilisateur est sollicité à chaque
 * action unitaire ("Park For Me"). Permet d'accorder des autorisations ciblées :
 * 1. « Autoriser une seule fois » (once)
 * 2. « Toujours autoriser dans cette discussion » (thread)
 * 3. « Toujours autoriser pour cet agent » (agent)
 *
 * Sécurité garantie : Les outils critiques et destructeurs (suppression de base de données,
 * paiement, annulation irréversible) sont systématiquement marqués "closed" et ne peuvent
 * JAMAIS faire l'objet d'une règle permanente.
 */

export type StandingRuleScope = "once" | "thread" | "agent";

export interface StandingRule {
  toolName: string;
  scope: StandingRuleScope;
  agentId?: string;
  threadId?: string;
  grantedAt: string;
  closed?: boolean;
}

/** Libellés français normalisés pour l'interface utilisateur. */
export const STANDING_RULE_LABELS_FR: Record<StandingRuleScope, string> = {
  once: "Autoriser une seule fois",
  thread: "Toujours autoriser dans cette discussion",
  agent: "Toujours autoriser pour cet agent",
};

/**
 * Liste des outils souverains critiques et destructeurs qui exigent TOUJOURS une confirmation
 * explicite unitaire (impossible d'activer une standing rule dessus).
 */
export const CRITICAL_CLOSED_TOOLS = new Set<string>([
  "archive_or_cancel",
  "delete_workspace",
  "delete_folder",
  "delete_doc",
  "trash_doc",
  "odoo_archive_or_cancel",
  "odoo_post_invoice",
  "twenty_delete_person",
  "twenty_delete_company",
  "destroy_database",
  "delete_database_row",
  "postiz_delete_post",
]);

/**
 * Détermine si un outil ou une action est éligible à une règle d'approbation permanente.
 * Les outils fermés par défaut ou critiques renvoient systématiquement false.
 */
export function offersStandingRule(
  toolName: string,
  actionPolicy?: { closed?: boolean; source?: string; behaviour?: string },
): boolean {
  if (!toolName) return false;
  if (actionPolicy?.closed === true) return false;
  if (actionPolicy?.behaviour === "hand_off") return false;
  if (actionPolicy?.source === "task") return false;

  const normalizedTool = toolName.toLowerCase().trim();
  if (CRITICAL_CLOSED_TOOLS.has(normalizedTool)) {
    return false;
  }

  // Mots-clés destructeurs critiques
  if (
    normalizedTool.includes("delete") ||
    normalizedTool.includes("destroy") ||
    normalizedTool.includes("archive") ||
    normalizedTool.includes("wipe") ||
    normalizedTool.includes("purge")
  ) {
    return false;
  }

  return true;
}

/**
 * Évalue si un outil dispose déjà d'une autorisation permanente valide pour le contexte donné.
 */
export function resolveToolApprovalStatus(
  rules: readonly StandingRule[],
  toolName: string,
  options: { threadId?: string; agentId?: string } = {},
): "approved" | "needs_approval" {
  if (!toolName || !Array.isArray(rules) || rules.length === 0) {
    return "needs_approval";
  }

  // Si l'outil est critique, il ne peut jamais être pré-approuvé par règle permanente
  if (!offersStandingRule(toolName)) {
    return "needs_approval";
  }

  const normalizedTool = toolName.toLowerCase().trim();

  for (const rule of rules) {
    if (rule.toolName.toLowerCase().trim() !== normalizedTool) continue;
    if (rule.closed === true) continue;

    // Règle portée sur tout l'agent
    if (rule.scope === "agent" && options.agentId && rule.agentId === options.agentId) {
      return "approved";
    }

    // Règle portée sur le fil de discussion actif
    if (rule.scope === "thread" && options.threadId && rule.threadId === options.threadId) {
      return "approved";
    }
  }

  return "needs_approval";
}

/**
 * Crée une nouvelle règle d'approbation permanente.
 */
export function createStandingRule(
  toolName: string,
  scope: StandingRuleScope,
  params: { agentId?: string; threadId?: string } = {},
): StandingRule {
  const isClosed = !offersStandingRule(toolName);
  return {
    toolName: toolName.trim(),
    scope: isClosed ? "once" : scope,
    agentId: params.agentId,
    threadId: params.threadId,
    grantedAt: new Date().toISOString(),
    closed: isClosed,
  };
}
