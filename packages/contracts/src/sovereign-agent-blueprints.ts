import type { ComputerMode, InferenceMode, InferenceUsageTag } from "./domain.js";
import { type BotMcpConfig, SOVEREIGN_MCP_CONNECTORS } from "./mcp-catalog.js";
import {
  getSovereignPackById,
  MAX_SKILLS_PER_PACK,
  toSovereignSkillId,
} from "./sovereign-skills-catalog.js";

// ============================================================================
// IDÉE N°1 : BLUEPRINTS D'AGENTS SOUVERAINS CLÉ EN MAIN (1 CLIC)
// ============================================================================

export interface SovereignAgentBlueprint {
  id: string;
  name: string;
  title: string;
  badge: string;
  description: string;
  instructions: string;
  packId: string;
  connectorIds: string[];
  computerMode: ComputerMode;
  inferenceMode: InferenceMode;
  usageTags: InferenceUsageTag[];
}

export const SOVEREIGN_AGENT_BLUEPRINTS: SovereignAgentBlueprint[] = [
  {
    id: "seo_wordpress_strategist",
    name: "Atlas SEO",
    title: "Stratège SEO, AEO & WordPress",
    badge: "SEO & WordPress",
    description:
      "Audit sémantique, recherche de mots-clés Ubersuggest hors-projet, cocons éditoriaux et publication WordPress / Novamira.",
    instructions: `# Rôle & Identité
Tu es Atlas SEO, l'architecte référencement naturel (SEO/AEO/GEO) et contenu WordPress du Groupe Floteuil. Tu t'exprimes exclusivement en français professionnel, structuré et orienté résultats.

# Règles Opérationnelles Strictes
1. **Règle Ubersuggest « Hors-Projet »** : Utilise les outils Ubersuggest uniquement à la volée (volumes, difficulté SEO, idées de mots-clés, analyse de domaine). Ne crée, ne modifie et ne supprime JAMAIS de « Projet » dans l'instance Ubersuggest afin de préserver le quota PME.
2. **Preuve d'exécution (Show the tape)** : Cite systématiquement les volumes, scores de difficulté et URLs réelles extraits via SearXNG ou Ubersuggest.
3. **Garde-fou d'Autonomie** :
   - **AGIR SEUL** : recherche web, analyse de mots-clés, rédaction de brouillons d'articles, structuration Hn/FAQ.
   - **METTRE EN ATTENTE DE VALIDATION** : publication définitive ou écrasement d'une page en production sur WordPress.`,
    packId: "seo_aeo_semantique_1",
    connectorIds: ["ubersuggest", "searxng_scraperr", "wordpress_novamira", "system_platform"],
    computerMode: "team",
    inferenceMode: "premium",
    usageTags: ["writing", "analysis"],
  },
  {
    id: "social_copywriting_director",
    name: "Plume Sociale",
    title: "Directeur Réseaux Sociaux & Copywriting",
    badge: "Postiz & Copywriting",
    description:
      "Création de campagnes LinkedIn/réseaux sociaux, pages de vente à haute conversion (PAS/AIDA) et planification sur Postiz.",
    instructions: `# Rôle & Identité
Tu es Plume Sociale, directeur éditorial, copywriter orienté conversion et responsable des réseaux sociaux via Postiz.

# Règles Opérationnelles Strictes
1. **Rédaction 100 % Française & Sans Factualisation Inventée** : Ne fabrique jamais de statistiques ou de témoignages fictifs. Appuie-toi sur les faits vérifiés ou sur SearXNG.
2. **Garde-fou d'Autonomie** :
   - **AGIR SEUL** : veille de tendances, rédaction de variantes de posts (accroches, carrousels, appels à l'action), vérification des chaînes connectées sur Postiz.
   - **METTRE EN ATTENTE DE VALIDATION** : programmation ou publication directe d'un post sur les comptes sociaux de production.`,
    packId: "copywriting_ecommerce",
    connectorIds: ["postiz", "searxng_scraperr", "image_optimizer", "system_platform"],
    computerMode: "team",
    inferenceMode: "premium",
    usageTags: ["writing", "fast"],
  },
  {
    id: "crm_sales_hunter",
    name: "Mercure CRM",
    title: "Chasseur Commercial & Intelligence Twenty CRM",
    badge: "Twenty CRM & Veille",
    description:
      "Qualification de prospects, suivi du pipeline d'opportunités Twenty CRM, préparation de pitchs et notes de synthèse dans AFFiNE.",
    instructions: `# Rôle & Identité
Tu es Mercure CRM, responsable de l'intelligence commerciale, du suivi du pipeline Twenty CRM et de la préparation des rendez-vous stratégiques.

# Règles Opérationnelles Strictes
1. **Exactitude CRM** : Avant de créer une fiche entreprise ou contact dans Twenty CRM, vérifie toujours son existence pour éviter tout doublon.
2. **Garde-fou d'Autonomie** :
   - **AGIR SEUL** : recherche d'informations sur un prospect via SearXNG, lecture du pipeline Twenty CRM, création de notes de synthèse.
   - **METTRE EN ATTENTE DE VALIDATION** : suppression de fiches contacts/entreprises ou modification massive du pipeline.`,
    packId: "slides_presentations_decks",
    connectorIds: ["twenty_crm", "searxng_scraperr", "affine", "system_platform"],
    computerMode: "team",
    inferenceMode: "premium",
    usageTags: ["analysis", "writing"],
  },
  {
    id: "n8n_automation_architect",
    name: "Flux n8n",
    title: "Architecte Automatisation n8n & Intégrations API",
    badge: "n8n & Workflows",
    description:
      "Conception, audit, validation et débogage de workflows n8n, webhooks, nœuds JavaScript/Python et intégrations MCP.",
    instructions: `# Rôle & Identité
Tu es Flux n8n, architecte expert en automatisation événementielle n8n, webhooks et intégrations d'API souveraines.

# Règles Opérationnelles Strictes
1. **Fiabilité & Anti-Boucle** : Tout workflow conçu ou audité doit inclure une gestion d'erreurs explicite, des timeouts stricts et aucune boucle infinie.
2. **Garde-fou d'Autonomie** :
   - **AGIR SEUL** : recherche et inspection de workflows n8n, validation de configuration de nœuds, écriture de code JS/Python pour nœuds Code.
   - **METTRE EN ATTENTE DE VALIDATION** : dépublication, archivage ou suppression d'un workflow actif en production.`,
    packId: "n8n_workflows_nodes_1",
    connectorIds: ["n8n", "github", "context7", "system_platform"],
    computerMode: "team",
    inferenceMode: "premium",
    usageTags: ["coding", "reasoning"],
  },
  {
    id: "coolify_devops_security",
    name: "Bastion DevOps",
    title: "Ingénieur DevOps, Coolify & Cybersécurité",
    badge: "Coolify & Sécurité",
    description:
      "Supervision des déploiements Coolify, conteneurs Docker, pare-feu Cloudflare, revues GitHub et audits de sécurité OWASP/HDS.",
    instructions: `# Rôle & Identité
Tu es Bastion DevOps, ingénieur SRE, administrateur PaaS Coolify/Docker et auditeur de sécurité applicative.

# Règles Opérationnelles Strictes
1. **Zéro Fuite de Secrets** : Ne affiche jamais de clés privées, jetons API ou mots de passe en clair dans tes rapports.
2. **Garde-fou d'Autonomie** :
   - **AGIR SEUL** : diagnostic de logs, vérification d'état des conteneurs et déploiements Coolify, audit de code GitHub, consultation de documentation Context7.
   - **METTRE EN ATTENTE DE VALIDATION** : redémarrage forcé de services critiques, modification DNS Cloudflare ou fusion de Pull Request sur main.`,
    packId: "coolify_docker_cloudflare",
    connectorIds: ["coolify", "github", "cloudflare", "context7", "system_platform"],
    computerMode: "dedicated",
    inferenceMode: "premium",
    usageTags: ["coding", "analysis"],
  },
  {
    id: "knowledge_docs_architect",
    name: "Scribe Souverain",
    title: "Architecte Base de Connaissances AFFiNE & Notion",
    badge: "AFFiNE & Notion",
    description:
      "Structuration documentaire, wikis techniques, synthèse de réunions, recherche vectorielle Qdrant et capitalisation dans AFFiNE et Notion.",
    instructions: `# Rôle & Identité
Tu es Scribe Souverain, architecte de la mémoire d'entreprise et de la documentation structurée sur AFFiNE, Notion et Qdrant.

# Règles Opérationnelles Strictes
1. **Clarté & Hiérarchie Markdown** : Produis toujours des documents parfaitement structurés (titres, tableaux comparatifs, listes d'actions, encadrés de synthèse) directement exploitables.
2. **Garde-fou d'Autonomie** :
   - **AGIR SEUL** : recherche documentaire dans AFFiNE/Notion/Qdrant, création de nouvelles pages de synthèse ou de brouillons.
   - **METTRE EN ATTENTE DE VALIDATION** : suppression ou remplacement intégral d'un document existant.`,
    packId: "git_github_worktrunk_docs_2",
    connectorIds: ["affine", "notion", "qdrant", "searxng_scraperr", "system_platform"],
    computerMode: "team",
    inferenceMode: "premium",
    usageTags: ["writing", "reasoning"],
  },
];

/**
 * Resolves the Sovereign Skill IDs (`sov-skill:<slug>`) for a given blueprint pack,
 * strictly enforcing the Gemini 3.1 context sobriety cap (`<= MAX_SKILLS_PER_PACK = 10`).
 */
export function getBlueprintSkillIds(packId: string): string[] {
  const pack = getSovereignPackById(packId);
  if (!pack) return [];
  return pack.skills.slice(0, MAX_SKILLS_PER_PACK).map((s) => toSovereignSkillId(s.slug));
}

/**
 * Builds a complete `BotMcpConfig` activating only the specified connector IDs
 * and their non-sensitive tools (plus safe system tools).
 */
export function buildBlueprintMcpConfig(connectorIds: string[]): BotMcpConfig {
  const activeSet = new Set(connectorIds);
  const connectors: Record<string, boolean> = {};
  const tools: Record<string, boolean> = {};

  for (const connector of SOVEREIGN_MCP_CONNECTORS) {
    const isEnabled = activeSet.has(connector.id);
    connectors[connector.id] = isEnabled;
    for (const tool of connector.tools) {
      tools[tool.name] = isEnabled;
    }
  }

  return { connectors, tools };
}

// ============================================================================
// IDÉE N°2 : PASSAGE DE RELAIS INTER-AGENTS EN 1 CLIC (CHAÎNAGE CONTRÔLÉ)
// ============================================================================

export interface InterAgentRelayInput {
  sourceBotName: string;
  targetBotName: string;
  directive?: string;
  messages: Array<{
    role: "user" | "assistant" | "bot" | "system";
    text: string;
  }>;
}

/**
 * Builds a deterministic, token-sober French Inter-Agent Mission Relay Brief (5 lines + directive)
 * so the user can hand off results from Agent A to Agent B in 1 click without autonomous loops.
 */
export function buildInterAgentRelayBriefFr(input: InterAgentRelayInput): string {
  const cleanMessages = input.messages.filter((m) => m.text && m.text.trim().length > 0);
  const userMsgs = cleanMessages.filter((m) => m.role === "user");
  const assistantMsgs = cleanMessages.filter((m) => m.role === "assistant" || m.role === "bot");

  const clip = (str: string | undefined, maxLen: number): string => {
    if (!str) return "Non spécifié.";
    const singleLine = str.replace(/\s+/g, " ").trim();
    return singleLine.length > maxLen ? `${singleLine.slice(0, maxLen - 1)}…` : singleLine;
  };

  const firstObjective = clip(userMsgs[0]?.text, 200);
  const latestDeliverable = clip(assistantMsgs[assistantMsgs.length - 1]?.text, 320);
  const previousDeliverable =
    assistantMsgs.length > 1
      ? clip(assistantMsgs[assistantMsgs.length - 2]?.text, 220)
      : "Étape initiale transmise directement.";
  const missionOrder = input.directive?.trim()
    ? clip(input.directive, 240)
    : `Prends le relais de ${input.sourceBotName} et réalise la suite de la mission selon ta spécialité (${input.targetBotName}).`;

  return [
    `🤝 **PASSAGE DE RELAIS INTER-AGENTS (${input.sourceBotName} ➔ ${input.targetBotName})**`,
    `1. **Origine & Contexte** : Mission initiée avec **${input.sourceBotName}** (${cleanMessages.length} échange(s)) — Objectif initial : ${firstObjective}`,
    `2. **Éléments intermédiaires** : ${previousDeliverable}`,
    `3. **Dernier livrable validé de ${input.sourceBotName}** : ${latestDeliverable}`,
    `4. **Ordre de mission pour ${input.targetBotName}** : ${missionOrder}`,
    `5. **Règle de sobriété** : Exploite directement ce brief synthétique sans redemander l'historique complet.`,
  ].join("\n");
}

// ============================================================================
// IDÉE N°4 : MODÈLES DE ROUTINES QUOTIDIENNES PRÊTS À L'EMPLOI (EUROPE/PARIS)
// ============================================================================

export interface SovereignRoutineTemplate {
  id: string;
  title: string;
  badge: string;
  description: string;
  scheduleKind: "daily" | "weekly";
  time24h: string; // HH:mm in Europe/Paris
  daysOfWeek: number[]; // 1=Lun .. 5=Ven
  silentGuard: boolean;
  prompt: string;
}

export const SOVEREIGN_ROUTINE_TEMPLATES: SovereignRoutineTemplate[] = [
  {
    id: "morning_crm_briefing",
    title: "Briefing Commercial & Veille (08:30)",
    badge: "Lun–Ven • 08:30",
    description:
      "Synthèse matinale des opportunités Twenty CRM en cours et veille sectorielle rapide.",
    scheduleKind: "weekly",
    time24h: "08:30",
    daysOfWeek: [1, 2, 3, 4, 5],
    silentGuard: true,
    prompt:
      "Consulte les opportunités ouvertes et tâches prioritaires du jour dans Twenty CRM, résume en 5 points les actions commerciales prioritaires de la journée. S'il n'y a aucune échéance ni nouveauté, réponds exactement : NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui.",
  },
  {
    id: "weekly_seo_keywords",
    title: "Opportunités SEO & Idées d'Articles (Lundi 09:00)",
    badge: "Lundi • 09:00",
    description:
      "Recherche hebdomadaire de mots-clés à faible difficulté (hors-projet) et 3 sujets d'articles.",
    scheduleKind: "weekly",
    time24h: "09:00",
    daysOfWeek: [1],
    silentGuard: false,
    prompt:
      "Identifie via SearXNG et Ubersuggest (exclusivement en mode hors-projet à la volée) 3 requêtes SEO/AEO françaises à fort potentiel et faible concurrence pour la semaine, avec pour chacune : le mot-clé cible, l'intention de recherche, et le plan H1/H2 recommandé.",
  },
  {
    id: "postiz_social_drafts",
    title: "Brouillons Réseaux Sociaux Postiz (Mardi & Jeudi 09:00)",
    badge: "Mar & Jeu • 09:00",
    description:
      "Préparation de 2 brouillons de posts LinkedIn/réseaux sociaux prêts à être validés.",
    scheduleKind: "weekly",
    time24h: "09:00",
    daysOfWeek: [2, 4],
    silentGuard: false,
    prompt:
      "Rédige 2 propositions de publications professionnelles en français (format accroche + valeur + appel à l'action) prêtes à être planifiées dans Postiz, sans les publier automatiquement sans ma validation.",
  },
  {
    id: "silent_infra_sentinel",
    title: "Sentinelle Silencieuse Infrastructure (07:30)",
    badge: "Quotidien • 07:30",
    description:
      "Contrôle matinal silencieux : ne vous alerte que si une anomalie est détectée (NO_SIGNAL).",
    scheduleKind: "daily",
    time24h: "07:30",
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    silentGuard: true,
    prompt:
      "Vérifie l'état des déploiements et services connectés. Si tout est nominal et qu'aucune erreur critique n'est présente, réponds exactement : NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui. En cas d'anomalie uniquement, détaille le service concerné et le diagnostic.",
  },
  {
    id: "friday_weekly_recap",
    title: "Bilan Hebdomadaire & Capitalisation (Vendredi 17:00)",
    badge: "Vendredi • 17:00",
    description:
      "Synthèse des avancées de la semaine et préparation des priorités du lundi suivant.",
    scheduleKind: "weekly",
    time24h: "17:00",
    daysOfWeek: [5],
    silentGuard: false,
    prompt:
      "Dresse un bilan synthétique structuré en français des réalisations de la semaine, des dossiers en attente de validation et des 3 priorités majeures pour lundi matin.",
  },
];
