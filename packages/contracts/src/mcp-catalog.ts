export type SovereignCategory =
  | "all"
  | "connected"
  | "search"
  | "code"
  | "workspace"
  | "social"
  | "cms"
  | "automation"
  | "infra"
  | "system";

export interface CategoryInfo {
  id: SovereignCategory;
  label: string;
  description: string;
}

export const SOVEREIGN_CATEGORIES: CategoryInfo[] = [
  { id: "all", label: "Tous", description: "Tous les connecteurs et outils disponibles" },
  { id: "connected", label: "Connectés", description: "Connecteurs actuellement opérationnels" },
  {
    id: "search",
    label: "Recherche",
    description: "Recherche web privée & extraction sans traçage",
  },
  { id: "code", label: "Ingénierie", description: "Gestion de dépôts Git, code, PR & tickets" },
  {
    id: "workspace",
    label: "Workspace",
    description: "Bases de connaissances, pages & documentation",
  },
  { id: "social", label: "Social", description: "Publication & planification multi-réseaux" },
  { id: "cms", label: "CMS", description: "Gestion de contenu WordPress & réseau Novamira" },
  {
    id: "automation",
    label: "Automatisation",
    description: "Workflows événementiels n8n & webhooks",
  },
  {
    id: "infra",
    label: "Infrastructure",
    description: "Réseau de bordure, DNS & cache Cloudflare",
  },
  {
    id: "system",
    label: "Système",
    description: "Sandbox, fichiers, shell & coordination multi-agents",
  },
];

export interface McpToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required: boolean;
  enum?: string[];
  default?: string | number | boolean;
}

export interface BotMcpConfig {
  connectors?: Record<string, boolean>;
  tools?: Record<string, boolean>;
}

export interface McpToolDefinition {
  name: string;
  label: string;
  description: string;
  connectorId: string;
  category: SovereignCategory;
  isSensitive?: boolean;
  requiredParams: string[];
  parameters: McpToolParameter[];
  exampleInvocation?: Record<string, unknown>;
}

export interface SovereignMcpConnector {
  id: string;
  slug: string;
  name: string;
  category: SovereignCategory;
  categoryLabel: string;
  description: string;
  icon: string;
  endpoint: string;
  protocol: string;
  status: "operational" | "connected" | "disconnected";
  statusText: string;
  badgeText: string;
  securityLevel: string;
  secretEnvVar?: string;
  isBuiltin: boolean;
  tools: McpToolDefinition[];
}

export const SOVEREIGN_MCP_CONNECTORS: SovereignMcpConnector[] = [
  {
    id: "searxng_scraperr",
    slug: "searxng_scraperr",
    name: "Recherche & Scraping Web Souverain",
    category: "search",
    categoryLabel: "Recherche & Scraping",
    description:
      "Cluster privé de recherche SearXNG sans traçage et scraper web Scraperr haute performance pour l'extraction propre de documentation et pages web.",
    icon: "Globe",
    endpoint: "https://search.groupefloteuil.internal",
    protocol: "HTTP REST / Scraperr Private Engine",
    status: "operational",
    statusText: "Connecté & Opérationnel",
    badgeText: "Floteuil Enterprise · Souverain",
    securityLevel: "Zero-Tracking · No Logs · No Third-Party Telemetry",
    secretEnvVar: "SEARXNG_URL / SCRAPERR_URL",
    isBuiltin: true,
    tools: [
      {
        name: "web_search",
        label: "Recherche Web SearXNG",
        description:
          "Recherche web souveraine multi-moteurs SearXNG sans traçage avec filtres par catégorie, langue et période.",
        connectorId: "searxng_scraperr",
        category: "search",
        isSensitive: false,
        requiredParams: ["query"],
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Termes de recherche ou question formulée.",
            required: true,
          },
          {
            name: "categories",
            type: "string",
            description: "Filtre de catégorie (ex: general, news, science, it).",
            required: false,
          },
          {
            name: "language",
            type: "string",
            description: "Code de langue (ex: 'fr', 'en', 'auto').",
            required: false,
          },
          {
            name: "time_range",
            type: "string",
            description: "Filtre temporel (ex: day, week, month, year).",
            required: false,
          },
          {
            name: "max_results",
            type: "number",
            description: "Nombre maximum de résultats à retourner (défaut 10).",
            required: false,
            default: 10,
          },
        ],
        exampleInvocation: {
          query: "architecture micro-frontends 2026",
          language: "fr",
          max_results: 5,
        },
      },
      {
        name: "web_scrape",
        label: "Extraction Web Scraperr",
        description:
          "Scraping et extraction propre de contenu textuel et markdown structuré depuis une page web ou documentation publique.",
        connectorId: "searxng_scraperr",
        category: "search",
        isSensitive: false,
        requiredParams: ["url"],
        parameters: [
          {
            name: "url",
            type: "string",
            description: "URL HTTP ou HTTPS complète de la page à scraper.",
            required: true,
          },
          {
            name: "selector",
            type: "string",
            description: "Sélecteur CSS optionnel ou section ciblée.",
            required: false,
          },
          {
            name: "maxLength",
            type: "number",
            description: "Longueur maximale de caractères à extraire (défaut 20000).",
            required: false,
            default: 20000,
          },
        ],
        exampleInvocation: {
          url: "https://developer.mozilla.org/fr/docs/Web/API",
          maxLength: 8000,
        },
      },
    ],
  },
  {
    id: "github",
    slug: "github",
    name: "GitHub Enterprise MCP",
    category: "code",
    categoryLabel: "Ingénierie & Dépôts",
    description:
      "Intégration d'ingénierie logicielle pour rechercher des dépôts, lire du code source, gérer les issues et examiner les pull requests.",
    icon: "Github",
    endpoint: "https://api.github.com",
    protocol: "HTTPS / GitHub REST v3 & GraphQL",
    status: "connected",
    statusText: "Connecté",
    badgeText: "GitHub Enterprise MCP",
    securityLevel: "Bearer Token Sanitized · Ephemeral Header Injection",
    secretEnvVar: "GITHUB_TOKEN",
    isBuiltin: true,
    tools: [
      {
        name: "github_search_repos",
        label: "Recherche de Dépôts GitHub",
        description:
          "Recherche de dépôts GitHub avec requêtes avancées, tris par étoiles ou mise à jour, et pagination.",
        connectorId: "github",
        category: "code",
        isSensitive: false,
        requiredParams: ["q"],
        parameters: [
          {
            name: "q",
            type: "string",
            description: "Mots-clés de recherche ou qualificateur (ex: 'react in:name').",
            required: true,
          },
          {
            name: "sort",
            type: "string",
            description: "Critère de tri.",
            required: false,
            enum: ["stars", "forks", "help-wanted-issues", "updated"],
          },
          {
            name: "order",
            type: "string",
            description: "Ordre du tri.",
            required: false,
            enum: ["desc", "asc"],
          },
          {
            name: "per_page",
            type: "number",
            description: "Nombre de résultats par page (max 100, défaut 30).",
            required: false,
            default: 30,
          },
          {
            name: "page",
            type: "number",
            description: "Numéro de page à récupérer.",
            required: false,
          },
        ],
        exampleInvocation: {
          q: "rakazo_app org:groupefloteuil",
          sort: "updated",
          per_page: 10,
        },
      },
      {
        name: "github_get_file_contents",
        label: "Lecture de Fichier GitHub",
        description:
          "Lecture et décodage automatique de fichiers texte, TypeScript, Markdown ou JSON depuis une branche ou un commit GitHub.",
        connectorId: "github",
        category: "code",
        isSensitive: false,
        requiredParams: ["owner", "repo", "path"],
        parameters: [
          {
            name: "owner",
            type: "string",
            description: "Propriétaire ou organisation du dépôt.",
            required: true,
          },
          {
            name: "repo",
            type: "string",
            description: "Nom du dépôt.",
            required: true,
          },
          {
            name: "path",
            type: "string",
            description:
              "Chemin du fichier au sein du dépôt (ex: 'packages/contracts/src/index.ts').",
            required: true,
          },
          {
            name: "ref",
            type: "string",
            description: "Branche git, tag ou commit SHA (défaut branche principale).",
            required: false,
          },
        ],
        exampleInvocation: {
          owner: "groupefloteuil",
          repo: "rakazo_app",
          path: "package.json",
        },
      },
      {
        name: "github_list_issues",
        label: "Liste des Issues & PRs",
        description:
          "Consultation des tickets et pull requests d'un dépôt GitHub avec filtres d'état et étiquettes.",
        connectorId: "github",
        category: "code",
        isSensitive: false,
        requiredParams: ["owner", "repo"],
        parameters: [
          {
            name: "owner",
            type: "string",
            description: "Propriétaire ou organisation.",
            required: true,
          },
          {
            name: "repo",
            type: "string",
            description: "Nom du dépôt.",
            required: true,
          },
          {
            name: "state",
            type: "string",
            description: "État des tickets.",
            required: false,
            enum: ["open", "closed", "all"],
          },
          {
            name: "labels",
            type: "string",
            description: "Liste de labels séparés par des virgules (ex: 'bug,ui').",
            required: false,
          },
          {
            name: "per_page",
            type: "number",
            description: "Résultats par page (max 100).",
            required: false,
          },
          {
            name: "page",
            type: "number",
            description: "Numéro de page.",
            required: false,
          },
        ],
        exampleInvocation: {
          owner: "groupefloteuil",
          repo: "rakazo_app",
          state: "open",
        },
      },
      {
        name: "github_create_issue",
        label: "Création d'Issue GitHub",
        description:
          "Création d'un nouveau ticket sur un dépôt GitHub avec titre, corps Markdown et labels.",
        connectorId: "github",
        category: "code",
        isSensitive: true,
        requiredParams: ["owner", "repo", "title"],
        parameters: [
          {
            name: "owner",
            type: "string",
            description: "Propriétaire ou organisation.",
            required: true,
          },
          {
            name: "repo",
            type: "string",
            description: "Nom du dépôt.",
            required: true,
          },
          {
            name: "title",
            type: "string",
            description: "Titre explicite du ticket.",
            required: true,
          },
          {
            name: "body",
            type: "string",
            description: "Description et détails du problème au format Markdown.",
            required: false,
          },
          {
            name: "labels",
            type: "array",
            description: "Liste d'étiquettes à assigner.",
            required: false,
          },
          {
            name: "assignees",
            type: "array",
            description: "Identifiants GitHub des personnes assignées.",
            required: false,
          },
        ],
        exampleInvocation: {
          owner: "groupefloteuil",
          repo: "rakazo_app",
          title: "Support MCP Tool Selection in BotSettings",
        },
      },
      {
        name: "github_get_pull_request",
        label: "Détails d'une Pull Request",
        description:
          "Récupération approfondie des métadonnées, état de merge, branches et diff d'une Pull Request.",
        connectorId: "github",
        category: "code",
        isSensitive: false,
        requiredParams: ["owner", "repo", "pull_number"],
        parameters: [
          {
            name: "owner",
            type: "string",
            description: "Propriétaire ou organisation.",
            required: true,
          },
          {
            name: "repo",
            type: "string",
            description: "Nom du dépôt.",
            required: true,
          },
          {
            name: "pull_number",
            type: "number",
            description: "Numéro de la Pull Request.",
            required: true,
          },
        ],
        exampleInvocation: {
          owner: "groupefloteuil",
          repo: "rakazo_app",
          pull_number: 42,
        },
      },
      {
        name: "github_create_issue_comment",
        label: "Commentaire Issue / PR",
        description:
          "Publication d'un commentaire au format Markdown sur une issue ou pull request existante.",
        connectorId: "github",
        category: "code",
        isSensitive: true,
        requiredParams: ["owner", "repo", "issue_number", "body"],
        parameters: [
          {
            name: "owner",
            type: "string",
            description: "Propriétaire ou organisation.",
            required: true,
          },
          {
            name: "repo",
            type: "string",
            description: "Nom du dépôt.",
            required: true,
          },
          {
            name: "issue_number",
            type: "number",
            description: "Numéro du ticket ou de la pull request.",
            required: true,
          },
          {
            name: "body",
            type: "string",
            description: "Contenu Markdown du commentaire.",
            required: true,
          },
        ],
        exampleInvocation: {
          owner: "groupefloteuil",
          repo: "rakazo_app",
          issue_number: 42,
          body: "Verification completed: all 40 MCP tools cataloged and tested.",
        },
      },
    ],
  },
  {
    id: "notion",
    slug: "notion",
    name: "Notion Workspace MCP",
    category: "workspace",
    categoryLabel: "Connaissances & Workspace",
    description:
      "Gestion documentaire d'entreprise pour rechercher, lire et mettre à jour des pages et bases de données Notion.",
    icon: "BookOpen",
    endpoint: "https://api.notion.com/v1",
    protocol: "HTTPS / Notion-Version: 2022-06-28",
    status: "connected",
    statusText: "Connecté",
    badgeText: "Notion API v2022-06-28",
    securityLevel: "API Key Header Redacted · Scoped Workspace Token",
    secretEnvVar: "NOTION_API_KEY",
    isBuiltin: true,
    tools: [
      {
        name: "notion_search",
        label: "Recherche Notion",
        description:
          "Recherche globale de pages et bases de données dans l'espace de travail Notion connecté.",
        connectorId: "notion",
        category: "workspace",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Texte de la requête de recherche.",
            required: false,
          },
          {
            name: "filter",
            type: "object",
            description: "Filtre d'objet Notion (page ou database).",
            required: false,
          },
          {
            name: "page_size",
            type: "number",
            description: "Nombre maximum d'éléments retournés (max 100).",
            required: false,
          },
        ],
        exampleInvocation: {
          query: "Documentation API",
          page_size: 10,
        },
      },
      {
        name: "notion_get_page",
        label: "Lecture de Page Notion",
        description:
          "Récupération des propriétés et du contenu en blocs d'une page Notion par son identifiant UUID.",
        connectorId: "notion",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["page_id"],
        parameters: [
          {
            name: "page_id",
            type: "string",
            description: "UUID de la page Notion à consulter.",
            required: true,
          },
        ],
        exampleInvocation: {
          page_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        },
      },
      {
        name: "notion_query_database",
        label: "Interrogation Base Notion",
        description:
          "Filtrage et tri avancé des enregistrements d'une base de données Notion avec pagination.",
        connectorId: "notion",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["database_id"],
        parameters: [
          {
            name: "database_id",
            type: "string",
            description: "UUID de la base de données Notion.",
            required: true,
          },
          {
            name: "filter",
            type: "object",
            description: "Filtre Notion structuré (propriétés, conditions).",
            required: false,
          },
          {
            name: "sorts",
            type: "array",
            description: "Règles de tri Notion par propriété et direction.",
            required: false,
          },
          {
            name: "page_size",
            type: "number",
            description: "Nombre maximal de résultats (max 100).",
            required: false,
          },
        ],
        exampleInvocation: {
          database_id: "f8e7d6c5-b4a3-2109-8765-43210fedcba9",
          page_size: 25,
        },
      },
      {
        name: "notion_create_page",
        label: "Création de Page Notion",
        description:
          "Création d'une nouvelle page ou entrée dans une base de données Notion avec propriétés et contenu initial.",
        connectorId: "notion",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["parent", "properties"],
        parameters: [
          {
            name: "parent",
            type: "object",
            description: "Parent Notion contenant database_id ou page_id.",
            required: true,
          },
          {
            name: "properties",
            type: "object",
            description: "Propriétés Notion de la nouvelle page.",
            required: true,
          },
          {
            name: "children",
            type: "array",
            description: "Blocs de contenu initiaux de la page.",
            required: false,
          },
        ],
        exampleInvocation: {
          parent: { database_id: "f8e7d6c5-b4a3-2109-8765-43210fedcba9" },
          properties: { Name: { title: [{ text: { content: "Nouveau Rapport" } }] } },
        },
      },
      {
        name: "notion_update_page",
        label: "Mise à Jour Page Notion",
        description:
          "Modification des propriétés, icône, couverture ou statut d'archivage d'une page Notion existante.",
        connectorId: "notion",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["page_id"],
        parameters: [
          {
            name: "page_id",
            type: "string",
            description: "UUID de la page Notion à mettre à jour.",
            required: true,
          },
          {
            name: "properties",
            type: "object",
            description: "Nouvelles valeurs de propriétés Notion.",
            required: false,
          },
          {
            name: "archived",
            type: "boolean",
            description: "Définir à vrai pour archiver la page.",
            required: false,
          },
        ],
        exampleInvocation: {
          page_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          properties: { Status: { select: { name: "Terminé" } } },
        },
      },
    ],
  },
  {
    id: "postiz",
    slug: "postiz",
    name: "Postiz Social Media MCP",
    category: "social",
    categoryLabel: "Marketing & Réseaux Sociaux",
    description:
      "Gestionnaire de publication et planification multi-canaux (LinkedIn, X/Twitter, Threads, Bluesky, Facebook) via Postiz.",
    icon: "Share2",
    endpoint: "https://postiz.groupefloteuil.internal/api/v1",
    protocol: "HTTPS / Postiz v1 REST API",
    status: "connected",
    statusText: "Connecté",
    badgeText: "Postiz v1 REST API",
    securityLevel: "Internal Private Network · API Key Auth Redacted",
    secretEnvVar: "POSTIZ_API_KEY",
    isBuiltin: true,
    tools: [
      {
        name: "postiz_list_integrations",
        label: "Canaux Sociaux Postiz",
        description:
          "Liste des canaux et comptes de réseaux sociaux connectés et autorisés sur l'instance Postiz.",
        connectorId: "postiz",
        category: "social",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "postiz_create_post",
        label: "Publication / Planification Sociale",
        description:
          "Création ou programmation temporelle d'une publication avec texte, médias et tags sur les canaux cibles.",
        connectorId: "postiz",
        category: "social",
        isSensitive: true,
        requiredParams: ["content"],
        parameters: [
          {
            name: "content",
            type: "string",
            description: "Texte de la publication.",
            required: true,
          },
          {
            name: "integrationIds",
            type: "array",
            description: "Identifiants des canaux cibles (depuis postiz_list_integrations).",
            required: false,
          },
          {
            name: "scheduledAt",
            type: "string",
            description:
              "Horodatage ISO-8601 pour planification différée (ex: '2026-08-22T14:00:00Z').",
            required: false,
          },
          {
            name: "tags",
            type: "array",
            description: "Mots-clés ou tags à associer.",
            required: false,
          },
          {
            name: "media",
            type: "array",
            description: "URLs d'images ou médias à attacher.",
            required: false,
          },
        ],
        exampleInvocation: {
          content: "Lancement de la nouvelle version Rakazo Sovereign Studio ! 🚀",
          tags: ["tech", "ai", "sovereignty"],
        },
      },
      {
        name: "postiz_list_posts",
        label: "Historique des Publications",
        description:
          "Consultation des publications publiées, planifiées, en brouillon ou en échec sur Postiz.",
        connectorId: "postiz",
        category: "social",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          {
            name: "status",
            type: "string",
            description: "Filtre de statut.",
            required: false,
            enum: ["draft", "scheduled", "published", "failed", "all"],
          },
          {
            name: "limit",
            type: "number",
            description: "Nombre de posts à retourner (défaut 20).",
            required: false,
            default: 20,
          },
          {
            name: "page",
            type: "number",
            description: "Numéro de page.",
            required: false,
          },
        ],
        exampleInvocation: {
          status: "published",
          limit: 10,
        },
      },
    ],
  },
  {
    id: "wordpress_novamira",
    slug: "wordpress_novamira",
    name: "WordPress / Novamira MCP",
    category: "cms",
    categoryLabel: "CMS & Multi-Sites",
    description:
      "Gestion éditoriale de contenu WordPress et passerelle d'exécution d'habilités pour l'écosystème multi-sites Novamira.",
    icon: "LayoutGrid",
    endpoint: "https://novamira.com/wp-json/wp/v2",
    protocol: "HTTPS / WP REST API & Novamira Gateway",
    status: "connected",
    statusText: "Connecté",
    badgeText: "WP REST & Novamira Gateway",
    securityLevel: "Application Passwords · Ability Execution Quarantine",
    secretEnvVar: "WORDPRESS_API_KEY / NOVAMIRA_TOKEN",
    isBuiltin: true,
    tools: [
      {
        name: "wordpress_list_posts",
        label: "Liste des Articles WordPress",
        description:
          "Recherche et filtrage des articles de blog ou pages WordPress par statut, catégorie et mot-clé.",
        connectorId: "wordpress_novamira",
        category: "cms",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          {
            name: "status",
            type: "string",
            description: "Statut des articles (publish, draft, pending, future, private).",
            required: false,
          },
          {
            name: "search",
            type: "string",
            description: "Mots-clés de recherche dans le titre ou le contenu.",
            required: false,
          },
          {
            name: "per_page",
            type: "number",
            description: "Articles par page (défaut 10).",
            required: false,
            default: 10,
          },
          {
            name: "page",
            type: "number",
            description: "Numéro de page.",
            required: false,
          },
          {
            name: "categories",
            type: "array",
            description: "Identifiants des catégories à inclure.",
            required: false,
          },
          {
            name: "tags",
            type: "array",
            description: "Identifiants des tags à inclure.",
            required: false,
          },
        ],
        exampleInvocation: {
          search: "nouveautés",
          per_page: 5,
        },
      },
      {
        name: "wordpress_get_post",
        label: "Lecture d'Article WordPress",
        description:
          "Récupération du contenu HTML complet et des métadonnées d'un article WordPress par son ID.",
        connectorId: "wordpress_novamira",
        category: "cms",
        isSensitive: false,
        requiredParams: ["id"],
        parameters: [
          {
            name: "id",
            type: "number",
            description: "Identifiant numérique de l'article WordPress.",
            required: true,
          },
        ],
        exampleInvocation: {
          id: 108,
        },
      },
      {
        name: "wordpress_create_post",
        label: "Création d'Article WordPress",
        description:
          "Rédaction et publication ou mise en brouillon d'un article WordPress avec catégories, tags et slug.",
        connectorId: "wordpress_novamira",
        category: "cms",
        isSensitive: true,
        requiredParams: ["title", "content"],
        parameters: [
          {
            name: "title",
            type: "string",
            description: "Titre de l'article.",
            required: true,
          },
          {
            name: "content",
            type: "string",
            description: "Corps complet de l'article en HTML ou Markdown.",
            required: true,
          },
          {
            name: "status",
            type: "string",
            description: "Statut de publication.",
            required: false,
            enum: ["publish", "draft", "pending", "private"],
          },
          {
            name: "categories",
            type: "array",
            description: "Liste des IDs de catégories associées.",
            required: false,
          },
          {
            name: "tags",
            type: "array",
            description: "Liste des IDs de tags associés.",
            required: false,
          },
          {
            name: "slug",
            type: "string",
            description: "Identifiant URL slug personnalisé.",
            required: false,
          },
          {
            name: "excerpt",
            type: "string",
            description: "Extrait ou résumé pour l'affichage en liste.",
            required: false,
          },
        ],
        exampleInvocation: {
          title: "Guide de Souveraineté Numérique 2026",
          content: "<p>Découvrez notre nouvelle approche souveraine.</p>",
          status: "draft",
        },
      },
      {
        name: "wordpress_update_post",
        label: "Modification d'Article WordPress",
        description:
          "Mise à jour du contenu, titre, statut ou catégories d'un article WordPress existant.",
        connectorId: "wordpress_novamira",
        category: "cms",
        isSensitive: true,
        requiredParams: ["id"],
        parameters: [
          {
            name: "id",
            type: "number",
            description: "ID de l'article à modifier.",
            required: true,
          },
          {
            name: "title",
            type: "string",
            description: "Nouveau titre de l'article.",
            required: false,
          },
          {
            name: "content",
            type: "string",
            description: "Nouveau contenu complet.",
            required: false,
          },
          {
            name: "status",
            type: "string",
            description: "Nouveau statut de publication.",
            required: false,
            enum: ["publish", "draft", "pending", "private"],
          },
          {
            name: "categories",
            type: "array",
            description: "IDs des catégories révisées.",
            required: false,
          },
          {
            name: "tags",
            type: "array",
            description: "IDs des tags révisés.",
            required: false,
          },
          {
            name: "slug",
            type: "string",
            description: "Nouveau slug.",
            required: false,
          },
          {
            name: "excerpt",
            type: "string",
            description: "Nouvel extrait.",
            required: false,
          },
        ],
        exampleInvocation: {
          id: 108,
          status: "publish",
        },
      },
      {
        name: "novamira_execute_ability",
        label: "Exécution Capacité Novamira",
        description:
          "Déclenchement d'une capacité d'automatisation ou d'administration CMS sur un site du réseau Novamira.",
        connectorId: "wordpress_novamira",
        category: "cms",
        isSensitive: true,
        requiredParams: ["site", "ability"],
        parameters: [
          {
            name: "site",
            type: "string",
            description: "Domaine ou slug du site cible (ex: 'novamira-hubtowork-com').",
            required: true,
          },
          {
            name: "ability",
            type: "string",
            description: "Nom de l'aptitude ou capacité à exécuter.",
            required: true,
          },
          {
            name: "params",
            type: "object",
            description: "Paramètres spécifiques à l'aptitude.",
            required: false,
          },
        ],
        exampleInvocation: {
          site: "novamira.com",
          ability: "sync-inventory",
          params: { dryRun: false },
        },
      },
    ],
  },
  {
    id: "n8n",
    slug: "n8n",
    name: "n8n Workflow MCP",
    category: "automation",
    categoryLabel: "Automatisation & Workflows",
    description:
      "Moteur d'orchestration de flux d'automatisation d'entreprise, déclenchement de webhooks et suivi des exécutions.",
    icon: "Workflow",
    endpoint: "https://n8n.groupefloteuil.internal/api/v1",
    protocol: "HTTPS / n8n REST API & Webhooks",
    status: "connected",
    statusText: "Connecté",
    badgeText: "n8n Sovereign Engine",
    securityLevel: "Mutual TLS & Bearer API Key · Isolated Executor",
    secretEnvVar: "N8N_API_KEY",
    isBuiltin: true,
    tools: [
      {
        name: "n8n_trigger_webhook",
        label: "Déclenchement Webhook n8n",
        description:
          "Déclenchement d'un workflow n8n via son endpoint webhook avec transmission d'une charge utile JSON personnalisée.",
        connectorId: "n8n",
        category: "automation",
        isSensitive: true,
        requiredParams: [],
        parameters: [
          {
            name: "webhookPath",
            type: "string",
            description: "Identifiant du chemin webhook dans n8n.",
            required: false,
          },
          {
            name: "url",
            type: "string",
            description: "URL complète alternative du webhook.",
            required: false,
          },
          {
            name: "data",
            type: "object",
            description: "Données JSON transmises au déclencheur n8n.",
            required: false,
          },
          {
            name: "method",
            type: "string",
            description: "Méthode HTTP d'appel (POST ou GET).",
            required: false,
            enum: ["POST", "GET"],
          },
        ],
        exampleInvocation: {
          webhookPath: "lead-qualification-v2",
          data: { email: "contact@example.com", source: "assistant" },
          method: "POST",
        },
      },
      {
        name: "n8n_list_workflows",
        label: "Liste des Workflows n8n",
        description:
          "Consultation des flux d'automatisation n8n enregistrés et vérification de leur état d'activation.",
        connectorId: "n8n",
        category: "automation",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          {
            name: "active",
            type: "boolean",
            description: "Filtrer uniquement les workflows actifs.",
            required: false,
          },
          {
            name: "limit",
            type: "number",
            description: "Nombre maximal de workflows retournés.",
            required: false,
          },
        ],
        exampleInvocation: {
          active: true,
          limit: 20,
        },
      },
      {
        name: "n8n_get_execution",
        label: "Détail d'Exécution n8n",
        description:
          "Inspection de l'état, de la durée, des erreurs et des logs détaillés d'une exécution de workflow n8n.",
        connectorId: "n8n",
        category: "automation",
        isSensitive: false,
        requiredParams: ["executionId"],
        parameters: [
          {
            name: "executionId",
            type: "string",
            description: "Identifiant unique de l'exécution n8n.",
            required: true,
          },
          {
            name: "includeData",
            type: "boolean",
            description: "Inclure les données étape par étape (step data).",
            required: false,
          },
        ],
        exampleInvocation: {
          executionId: "987452",
          includeData: true,
        },
      },
    ],
  },
  {
    id: "cloudflare",
    slug: "cloudflare",
    name: "Cloudflare MCP",
    category: "infra",
    categoryLabel: "Réseau & CDN",
    description:
      "Gestion de l'infrastructure réseau périphérique, routage DNS sécurisé, certificats SSL et purge du cache de distribution CDN.",
    icon: "Cloud",
    endpoint: "https://api.cloudflare.com/client/v4",
    protocol: "HTTPS / Cloudflare Client API v4",
    status: "connected",
    statusText: "Connecté",
    badgeText: "Cloudflare API v4",
    securityLevel: "Scoped API Token · Restricted Zone Permissions",
    secretEnvVar: "CLOUDFLARE_API_TOKEN",
    isBuiltin: true,
    tools: [
      {
        name: "cloudflare_list_zones",
        label: "Liste des Zones Cloudflare",
        description:
          "Affichage des domaines et zones DNS configurés sur le compte Cloudflare d'entreprise.",
        connectorId: "cloudflare",
        category: "infra",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Filtre par nom de domaine (ex: 'workspacegroupefloteuil.eu').",
            required: false,
          },
          {
            name: "status",
            type: "string",
            description: "Filtre de statut de la zone.",
            required: false,
            enum: ["active", "pending", "initializing", "moved", "deleted", "deactivated"],
          },
          {
            name: "page",
            type: "number",
            description: "Numéro de page.",
            required: false,
          },
          {
            name: "per_page",
            type: "number",
            description: "Nombre de zones par page.",
            required: false,
          },
        ],
        exampleInvocation: {
          name: "groupefloteuil.eu",
        },
      },
      {
        name: "cloudflare_list_dns_records",
        label: "Enregistrements DNS",
        description:
          "Consultation des enregistrements DNS (A, AAAA, CNAME, TXT, MX) configurés pour une zone Cloudflare.",
        connectorId: "cloudflare",
        category: "infra",
        isSensitive: false,
        requiredParams: ["zone_id"],
        parameters: [
          {
            name: "zone_id",
            type: "string",
            description: "Identifiant hexadécimal de la zone Cloudflare.",
            required: true,
          },
          {
            name: "name",
            type: "string",
            description: "Filtre par nom d'hôte ou sous-domaine.",
            required: false,
          },
          {
            name: "type",
            type: "string",
            description: "Type d'enregistrement (ex: 'A', 'CNAME', 'TXT').",
            required: false,
          },
          {
            name: "page",
            type: "number",
            description: "Numéro de page.",
            required: false,
          },
          {
            name: "per_page",
            type: "number",
            description: "Nombre d'enregistrements par page.",
            required: false,
          },
        ],
        exampleInvocation: {
          zone_id: "023e105f4ecef8ad9ca31a8372d0c353",
          type: "A",
        },
      },
      {
        name: "cloudflare_create_dns_record",
        label: "Création Enregistrement DNS",
        description:
          "Ajout d'un nouvel enregistrement DNS avec gestion du TTL, priorité et proxy CDN Cloudflare.",
        connectorId: "cloudflare",
        category: "infra",
        isSensitive: true,
        requiredParams: ["zone_id", "type", "name", "content"],
        parameters: [
          {
            name: "zone_id",
            type: "string",
            description: "Identifiant de la zone Cloudflare cible.",
            required: true,
          },
          {
            name: "type",
            type: "string",
            description: "Type d'enregistrement (A, AAAA, CNAME, TXT, MX, etc.).",
            required: true,
          },
          {
            name: "name",
            type: "string",
            description: "Nom d'hôte ou sous-domaine (ex: 'api' ou '@').",
            required: true,
          },
          {
            name: "content",
            type: "string",
            description: "Adresse IP ou cible de redirection de l'enregistrement.",
            required: true,
          },
          {
            name: "ttl",
            type: "number",
            description: "Time-to-Live en secondes (1 pour gestion automatique).",
            required: false,
            default: 1,
          },
          {
            name: "proxied",
            type: "boolean",
            description: "Activer le proxy CDN et protection DDoS Cloudflare.",
            required: false,
            default: true,
          },
          {
            name: "priority",
            type: "number",
            description: "Priorité pour les enregistrements MX ou SRV.",
            required: false,
          },
          {
            name: "comment",
            type: "string",
            description: "Commentaire administratif optionnel.",
            required: false,
          },
        ],
        exampleInvocation: {
          zone_id: "023e105f4ecef8ad9ca31a8372d0c353",
          type: "CNAME",
          name: "app",
          content: "cname.rakazo.eu",
          proxied: true,
        },
      },
      {
        name: "cloudflare_purge_cache",
        label: "Purge du Cache CDN",
        description:
          "Purge instantanée d'URLs spécifiques, de tags ou de l'intégralité du cache CDN sur les serveurs Edge.",
        connectorId: "cloudflare",
        category: "infra",
        isSensitive: true,
        requiredParams: ["zone_id"],
        parameters: [
          {
            name: "zone_id",
            type: "string",
            description: "Identifiant de la zone Cloudflare.",
            required: true,
          },
          {
            name: "purge_everything",
            type: "boolean",
            description: "Purger l'intégralité du cache sur toute la zone.",
            required: false,
          },
          {
            name: "files",
            type: "array",
            description: "Liste des URLs précises de fichiers à purger.",
            required: false,
          },
          {
            name: "tags",
            type: "array",
            description: "Tags de cache à purger.",
            required: false,
          },
          {
            name: "hosts",
            type: "array",
            description: "Noms d'hôtes ciblés pour la purge.",
            required: false,
          },
        ],
        exampleInvocation: {
          zone_id: "023e105f4ecef8ad9ca31a8372d0c353",
          purge_everything: true,
        },
      },
    ],
  },
  {
    id: "twenty_crm",
    slug: "twenty_crm",
    name: "Twenty CRM Souverain",
    category: "workspace",
    categoryLabel: "CRM & Relations",
    description:
      "Plateforme CRM open source souveraine pour la gestion complète des contacts, entreprises, opportunités d'affaires, tâches et notes.",
    icon: "Users",
    endpoint: "https://crm.workspacegroupefloteuil.eu",
    protocol: "REST & GraphQL API",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Twenty CRM · Souverain",
    securityLevel: "Authenticated Bearer · Workspace Scoped",
    secretEnvVar: "TWENTY_API_KEY",
    isBuiltin: false,
    tools: [
      {
        name: "twenty_list_people",
        label: "Liste des Contacts & Prospects",
        description: "Lister ou rechercher des contacts et prospects dans Twenty CRM avec pagination et filtres.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          { name: "limit", type: "number", description: "Nombre maximum d'enregistrements (défaut 20).", required: false },
          { name: "startingAfter", type: "string", description: "Curseur de pagination.", required: false },
          { name: "order_by", type: "string", description: "Champ de tri (ex: createdAt, name).", required: false },
        ],
        exampleInvocation: { limit: 10 },
      },
      {
        name: "twenty_get_person",
        label: "Détails d'un Contact",
        description: "Récupérer la fiche complète d'un contact ou prospect par son ID Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["id"],
        parameters: [
          { name: "id", type: "string", description: "UUID du contact Twenty CRM.", required: true },
        ],
        exampleInvocation: { id: "55668c58-516f-49fb-ab26-84931e7b67bf" },
      },
      {
        name: "twenty_create_person",
        label: "Création d'un Contact",
        description: "Créer une nouvelle fiche contact ou prospect dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: [],
        parameters: [
          { name: "firstName", type: "string", description: "Prénom du contact.", required: false },
          { name: "lastName", type: "string", description: "Nom de famille.", required: false },
          { name: "email", type: "string", description: "Adresse email principale.", required: false },
          { name: "phone", type: "string", description: "Numéro de téléphone.", required: false },
          { name: "jobTitle", type: "string", description: "Poste ou fonction occupée.", required: false },
          { name: "city", type: "string", description: "Ville de résidence ou localisation.", required: false },
        ],
        exampleInvocation: { firstName: "Jean", lastName: "Dupont", email: "jean.dupont@example.com" },
      },
      {
        name: "twenty_update_person",
        label: "Mise à Jour d'un Contact",
        description: "Mettre à jour les champs d'un contact existant dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["id"],
        parameters: [
          { name: "id", type: "string", description: "UUID du contact à modifier.", required: true },
          { name: "firstName", type: "string", description: "Nouveau prénom.", required: false },
          { name: "lastName", type: "string", description: "Nouveau nom.", required: false },
          { name: "email", type: "string", description: "Nouvelle adresse email.", required: false },
          { name: "phone", type: "string", description: "Nouveau téléphone.", required: false },
          { name: "jobTitle", type: "string", description: "Nouveau titre de fonction.", required: false },
        ],
        exampleInvocation: { id: "55668c58-516f-49fb-ab26-84931e7b67bf", jobTitle: "Directeur Général" },
      },
      {
        name: "twenty_delete_person",
        label: "Suppression d'un Contact",
        description: "Supprimer un contact dans Twenty CRM par son identifiant.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["id"],
        parameters: [
          { name: "id", type: "string", description: "UUID du contact à supprimer.", required: true },
        ],
        exampleInvocation: { id: "55668c58-516f-49fb-ab26-84931e7b67bf" },
      },
      {
        name: "twenty_list_companies",
        label: "Liste des Entreprises",
        description: "Lister les entreprises clientes et comptes professionnels dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          { name: "limit", type: "number", description: "Nombre maximum d'enregistrements.", required: false },
          { name: "startingAfter", type: "string", description: "Curseur de pagination.", required: false },
        ],
        exampleInvocation: { limit: 20 },
      },
      {
        name: "twenty_get_company",
        label: "Détails d'une Entreprise",
        description: "Consulter la fiche détaillée d'une entreprise par son UUID Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["id"],
        parameters: [
          { name: "id", type: "string", description: "UUID de l'entreprise.", required: true },
        ],
        exampleInvocation: { id: "c1234567-89ab-cdef-0123-456789abcdef" },
      },
      {
        name: "twenty_create_company",
        label: "Création d'une Entreprise",
        description: "Créer une nouvelle organisation ou entreprise cliente dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["name"],
        parameters: [
          { name: "name", type: "string", description: "Raison sociale de l'entreprise.", required: true },
          { name: "domainName", type: "string", description: "Nom de domaine web (ex: acme.com).", required: false },
          { name: "employees", type: "number", description: "Nombre de salariés estimé.", required: false },
          { name: "address", type: "string", description: "Adresse du siège.", required: false },
        ],
        exampleInvocation: { name: "Acme Corp", domainName: "acme.com" },
      },
      {
        name: "twenty_update_company",
        label: "Mise à Jour d'Entreprise",
        description: "Modifier les attributs d'une entreprise enregistrée dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["id"],
        parameters: [
          { name: "id", type: "string", description: "UUID de l'entreprise à modifier.", required: true },
          { name: "name", type: "string", description: "Nouveau nom.", required: false },
          { name: "domainName", type: "string", description: "Nouveau nom de domaine.", required: false },
        ],
        exampleInvocation: { id: "c1234567-89ab-cdef-0123-456789abcdef", domainName: "acme-solutions.com" },
      },
      {
        name: "twenty_list_opportunities",
        label: "Liste des Opportunités Commerciales",
        description: "Lister les deals et opportunités de vente avec étape du pipeline et montant.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          { name: "limit", type: "number", description: "Nombre maximum d'opportunités.", required: false },
          { name: "stage", type: "string", description: "Filtrer par phase du cycle de vente.", required: false },
        ],
        exampleInvocation: { limit: 10 },
      },
      {
        name: "twenty_create_opportunity",
        label: "Création d'une Opportunité",
        description: "Créer un nouveau deal commercial dans le pipeline Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["name"],
        parameters: [
          { name: "name", type: "string", description: "Titre ou objet du deal.", required: true },
          { name: "amount", type: "number", description: "Montant estimé en euros.", required: false },
          { name: "stage", type: "string", description: "Étape de qualification commerciale.", required: false },
          { name: "closeDate", type: "string", description: "Date cible de clôture (ISO-8601).", required: false },
          { name: "companyId", type: "string", description: "UUID de l'entreprise associée.", required: false },
        ],
        exampleInvocation: { name: "Contrat Infogérance Annuel", amount: 15000, stage: "PROPOSAL" },
      },
      {
        name: "twenty_list_tasks",
        label: "Liste des Tâches CRM",
        description: "Lister les tâches de suivi commercial et rappels dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          { name: "limit", type: "number", description: "Nombre maximum de tâches.", required: false },
        ],
        exampleInvocation: { limit: 20 },
      },
      {
        name: "twenty_create_task",
        label: "Création d'une Tâche CRM",
        description: "Planifier une tâche de relance ou d'action commerciale dans Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["title"],
        parameters: [
          { name: "title", type: "string", description: "Intitulé de la tâche.", required: true },
          { name: "body", type: "string", description: "Description ou consignes détaillées.", required: false },
          { name: "dueAt", type: "string", description: "Échéance au format ISO-8601.", required: false },
          { name: "status", type: "string", description: "Statut initial (TODO, IN_PROGRESS, DONE).", required: false },
        ],
        exampleInvocation: { title: "Rappeler le client pour proposition", status: "TODO" },
      },
      {
        name: "twenty_create_note",
        label: "Ajout d'une Note CRM",
        description: "Ajouter une note de compte rendu ou mémo sur une fiche Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["body"],
        parameters: [
          { name: "body", type: "string", description: "Texte ou compte rendu de la note.", required: true },
          { name: "title", type: "string", description: "Titre de la note.", required: false },
          { name: "targetPersonId", type: "string", description: "UUID du contact associé.", required: false },
          { name: "targetCompanyId", type: "string", description: "UUID de l'entreprise associée.", required: false },
        ],
        exampleInvocation: { title: "Appel de cadrage", body: "Client très intéressé par l'intégration n8n et IA." },
      },
      {
        name: "twenty_graphql_query",
        label: "Requête GraphQL Twenty",
        description: "Exécuter une requête GraphQL directe pour interroger ou muter le schéma Twenty CRM.",
        connectorId: "twenty_crm",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["query"],
        parameters: [
          { name: "query", type: "string", description: "Chaîne de requête GraphQL valide.", required: true },
          { name: "variables", type: "object", description: "Variables d'exécution optionnelles.", required: false },
        ],
        exampleInvocation: { query: "{ people(first: 5) { edges { node { id name { firstName lastName } } } } }" },
      },
    ],
  },
  {
    id: "affine",
    slug: "affine",
    name: "AFFiNE Knowledge Base",
    category: "workspace",
    categoryLabel: "Base de Connaissances",
    description:
      "Espace documentaire unifié AFFiNE pour la gestion de notes, pages wiki, tableaux blancs et blocs de contenu multimédia.",
    icon: "BookOpen",
    endpoint: "https://affine.workspacegroupefloteuil.eu",
    protocol: "REST / GraphQL Engine",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "AFFiNE Enterprise · Souverain",
    securityLevel: "Workspace Token · Multi-User Isolation",
    secretEnvVar: "AFFINE_WORKSPACE_ID",
    isBuiltin: false,
    tools: [
      {
        name: "affine_list_docs",
        label: "Liste des Documents AFFiNE",
        description: "Lister les documents et pages enregistrés dans l'espace de travail AFFiNE.",
        connectorId: "affine",
        category: "workspace",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          { name: "limit", type: "number", description: "Nombre maximum de documents (défaut 50).", required: false },
        ],
        exampleInvocation: { limit: 20 },
      },
      {
        name: "affine_get_doc",
        label: "Lecture d'un Document AFFiNE",
        description: "Consulter le contenu intégral et les métadonnées d'un document AFFiNE par son identifiant.",
        connectorId: "affine",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["docId"],
        parameters: [
          { name: "docId", type: "string", description: "ID du document AFFiNE.", required: true },
        ],
        exampleInvocation: { docId: "88214aa2-839b-43dd-8be5-11bdb6c10551" },
      },
      {
        name: "affine_create_doc",
        label: "Création d'un Document AFFiNE",
        description: "Créer un nouveau document texte ou page dans le workspace AFFiNE.",
        connectorId: "affine",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["title"],
        parameters: [
          { name: "title", type: "string", description: "Titre du document.", required: true },
          { name: "content", type: "string", description: "Contenu initial en Markdown.", required: false },
        ],
        exampleInvocation: { title: "Documentation Architecture Rakazo", content: "# Architecture\nDocumentation des agents." },
      },
      {
        name: "affine_append_markdown",
        label: "Ajout de Contenu Markdown AFFiNE",
        description: "Ajouter des blocs Markdown à la fin d'un document AFFiNE existant.",
        connectorId: "affine",
        category: "workspace",
        isSensitive: true,
        requiredParams: ["docId", "markdown"],
        parameters: [
          { name: "docId", type: "string", description: "ID du document cible.", required: true },
          { name: "markdown", type: "string", description: "Texte Markdown à insérer.", required: true },
        ],
        exampleInvocation: { docId: "88214aa2-839b-43dd-8be5-11bdb6c10551", markdown: "\n## Nouvel ajout\nSection automatique." },
      },
      {
        name: "affine_search_docs",
        label: "Recherche de Documents AFFiNE",
        description: "Rechercher des documents AFFiNE par mot-clé dans le titre ou le contenu.",
        connectorId: "affine",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["query"],
        parameters: [
          { name: "query", type: "string", description: "Terme de recherche.", required: true },
        ],
        exampleInvocation: { query: "stratégie marketing" },
      },
    ],
  },
  {
    id: "context7",
    slug: "context7",
    name: "Context7 Live Documentation",
    category: "search",
    categoryLabel: "Documentation & Code",
    description:
      "Indexation et recherche de documentation temps réel Context7 par Upstash pour bibliothèques, frameworks et snippets de code.",
    icon: "SearchCode",
    endpoint: "https://context7.com/api",
    protocol: "Upstash Context7 Protocol",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Context7 · Upstash",
    securityLevel: "Ephemeral Queries · Zero Secret Retention",
    secretEnvVar: "CONTEXT7_API_KEY",
    isBuiltin: false,
    tools: [
      {
        name: "context7_resolve_library_id",
        label: "Résolution d'ID Bibliothèque Context7",
        description: "Résoudre le nom d'un framework ou package en identifiant Context7 compatible (ex: /vercel/next.js).",
        connectorId: "context7",
        category: "search",
        isSensitive: false,
        requiredParams: ["libraryName", "query"],
        parameters: [
          { name: "libraryName", type: "string", description: "Nom exact de la bibliothèque (ex: Next.js, React, Tailwind).", required: true },
          { name: "query", type: "string", description: "Contexte de recherche pour affiner la sélection.", required: true },
        ],
        exampleInvocation: { libraryName: "Next.js", query: "App router server actions" },
      },
      {
        name: "context7_query_docs",
        label: "Interrogation Documentation Context7",
        description: "Récupérer la documentation à jour et des exemples de code récents pour une bibliothèque résolue.",
        connectorId: "context7",
        category: "search",
        isSensitive: false,
        requiredParams: ["libraryId", "query"],
        parameters: [
          { name: "libraryId", type: "string", description: "ID bibliothèque Context7 obtenu via resolve (ex: /vercel/next.js).", required: true },
          { name: "query", type: "string", description: "Concept technique ou question précise à rechercher.", required: true },
          { name: "language", type: "string", description: "Langage de programmation cible (ex: TypeScript, Python).", required: false },
        ],
        exampleInvocation: { libraryId: "/vercel/next.js", query: "middleware and auth redirects" },
      },
    ],
  },
  {
    id: "open_design",
    slug: "open_design",
    name: "Open Design UI Studio",
    category: "code",
    categoryLabel: "Design & Interface",
    description:
      "Plateforme de rendu visuel et workspace de design Open Design hébergée sur VPS Coolify pour la génération d'artefacts HTML/CSS et composants d'interface.",
    icon: "Palette",
    endpoint: "http://127.0.0.1:7456",
    protocol: "Open Design Daemon Protocol",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Open Design · VPS Engine",
    securityLevel: "Localhost Daemon · Isolated Project Scope",
    secretEnvVar: "OPEN_DESIGN_DAEMON_URL",
    isBuiltin: false,
    tools: [
      {
        name: "open_design_list_projects",
        label: "Liste des Projets Design",
        description: "Lister les projets de maquettage et design disponibles sur l'instance Open Design.",
        connectorId: "open_design",
        category: "code",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "open_design_get_active_context",
        label: "Contexte Actif Open Design",
        description: "Récupérer le projet et le fichier actuellement ouverts dans l'interface visuelle Open Design.",
        connectorId: "open_design",
        category: "code",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "open_design_create_project",
        label: "Création d'un Projet Design",
        description: "Créer un nouveau projet vierge dans Open Design pour concevoir une interface.",
        connectorId: "open_design",
        category: "code",
        isSensitive: true,
        requiredParams: ["name"],
        parameters: [
          { name: "name", type: "string", description: "Nom du projet d'interface.", required: true },
        ],
        exampleInvocation: { name: "Dashboard E-commerce" },
      },
      {
        name: "open_design_create_artifact",
        label: "Création d'un Artefact UI",
        description: "Publier un nouvel artefact d'interface rendu (HTML, CSS, JSX) dans un projet Open Design.",
        connectorId: "open_design",
        category: "code",
        isSensitive: true,
        requiredParams: ["name", "content"],
        parameters: [
          { name: "name", type: "string", description: "Nom du fichier d'artefact (ex: index.html).", required: true },
          { name: "content", type: "string", description: "Code source complet rendu de l'interface.", required: true },
          { name: "project", type: "string", description: "ID ou slug du projet (utilise le projet actif par défaut).", required: false },
        ],
        exampleInvocation: { name: "index.html", content: "<div class='p-6'><h1>Aperçu</h1></div>" },
      },
      {
        name: "open_design_write_file",
        label: "Mise à Jour de Fichier Design",
        description: "Modifier ou écraser un fichier existant dans le projet Open Design pour itérer sur la maquette.",
        connectorId: "open_design",
        category: "code",
        isSensitive: true,
        requiredParams: ["path", "content"],
        parameters: [
          { name: "path", type: "string", description: "Chemin relatif du fichier dans le projet (ex: style.css).", required: true },
          { name: "content", type: "string", description: "Nouveau contenu du fichier.", required: true },
          { name: "project", type: "string", description: "ID ou nom du projet optionnel.", required: false },
        ],
        exampleInvocation: { path: "style.css", content: "body { background: #0f172a; }" },
      },
      {
        name: "open_design_get_artifact",
        label: "Lecture d'Artefact Rendu",
        description: "Récupérer le code source complet d'un artefact d'interface avec tous ses modules et tokens associés.",
        connectorId: "open_design",
        category: "code",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          { name: "project", type: "string", description: "ID du projet design cible.", required: false },
        ],
        exampleInvocation: {},
      },
      {
        name: "open_design_list_skills",
        label: "Liste des Compétences Design",
        description: "Consulter le catalogue des compétences de design disponibles sur le moteur Open Design.",
        connectorId: "open_design",
        category: "code",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
    ],
  },
  {
    id: "image_optimizer",
    slug: "image_optimizer",
    name: "Image Optimizer & Compression",
    category: "workspace",
    categoryLabel: "Médias & Assets",
    description:
      "Compression, redimensionnement et optimisation d'images WebP/PNG/JPEG haute fidélité pour le web et les applications.",
    icon: "Image",
    endpoint: "In-Process Media Compressor",
    protocol: "Native Media Buffer",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Core Media · In-Process",
    securityLevel: "Strict Sandbox · No External Network Leak",
    isBuiltin: true,
    tools: [
      {
        name: "image_optimize_compress",
        label: "Compression & Optimisation d'Image",
        description: "Optimiser et compresser une image par URL ou chemin local avec cible de qualité et format.",
        connectorId: "image_optimizer",
        category: "workspace",
        isSensitive: false,
        requiredParams: ["urls"],
        parameters: [
          { name: "urls", type: "string", description: "URL ou chemin de l'image (séparés par virgule si multiples).", required: true },
          { name: "quality", type: "number", description: "Qualité de compression de 1 à 100 (défaut 80).", required: false },
          { name: "format", type: "string", description: "Format de sortie (webp, png, jpeg, avif).", required: false },
        ],
        exampleInvocation: { urls: "https://example.com/banner.png", quality: 80, format: "webp" },
      },
    ],
  },
  {
    id: "qdrant",
    slug: "qdrant",
    name: "Qdrant Vector Database",
    category: "search",
    categoryLabel: "Base Vectorielle",
    description:
      "Base de données vectorielle souveraine Qdrant pour la recherche de similarité, l'indexation de chunks et le RAG multimodal.",
    icon: "Database",
    endpoint: "https://qdrant.workspacegroupefloteuil.eu",
    protocol: "Qdrant REST API v1",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Qdrant Enterprise · Souverain",
    securityLevel: "API Key Authenticated · HTTPS TLS",
    secretEnvVar: "QDRANT_API_KEY",
    isBuiltin: false,
    tools: [
      {
        name: "qdrant_list_collections",
        label: "Liste des Collections Vectorielles",
        description: "Lister toutes les collections vectorielles enregistrées sur l'instance Qdrant.",
        connectorId: "qdrant",
        category: "search",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "qdrant_search_points",
        label: "Recherche de Voisins Proches (Points)",
        description: "Rechercher des vecteurs similaires dans une collection Qdrant par vecteur d'embedding ou filtres.",
        connectorId: "qdrant",
        category: "search",
        isSensitive: false,
        requiredParams: ["collection_name", "vector"],
        parameters: [
          { name: "collection_name", type: "string", description: "Nom de la collection vectorielle.", required: true },
          { name: "vector", type: "array", description: "Vecteur numérique de dimension correspondante.", required: true },
          { name: "limit", type: "number", description: "Nombre de résultats maximum (défaut 10).", required: false },
          { name: "with_payload", type: "boolean", description: "Inclure le payload textuel associé.", required: false },
        ],
        exampleInvocation: { collection_name: "rakazo_docs", vector: [0.01, -0.05, 0.12], limit: 5 },
      },
      {
        name: "qdrant_upsert_points",
        label: "Indexation de Points Vectoriels",
        description: "Insérer ou mettre à jour des vecteurs avec métadonnées dans une collection Qdrant.",
        connectorId: "qdrant",
        category: "search",
        isSensitive: true,
        requiredParams: ["collection_name", "points"],
        parameters: [
          { name: "collection_name", type: "string", description: "Nom de la collection.", required: true },
          { name: "points", type: "array", description: "Liste d'objets { id, vector, payload } à indexer.", required: true },
        ],
        exampleInvocation: { collection_name: "rakazo_docs", points: [{ id: "doc-1", vector: [0.1, 0.2], payload: { title: "Intro" } }] },
      },
    ],
  },
  {
    id: "coolify",
    slug: "coolify",
    name: "Coolify DevOps PaaS Manager",
    category: "infra",
    categoryLabel: "Infrastructure PaaS",
    description:
      "Contrôle opérationnel des déploiements conteneurisés Coolify, gestion des microservices, redémarrage et consultation des logs.",
    icon: "Server",
    endpoint: "https://coolify.workspacegroupefloteuil.eu/api/v1",
    protocol: "Coolify API v1",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Coolify PaaS · Floteuil Cloud",
    securityLevel: "Bearer Token · Admin Scoped",
    secretEnvVar: "COOLIFY_API_TOKEN",
    isBuiltin: false,
    tools: [
      {
        name: "coolify_list_applications",
        label: "Liste des Applications Coolify",
        description: "Lister les applications et services hébergés sur l'instance Coolify PaaS.",
        connectorId: "coolify",
        category: "infra",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "coolify_get_application",
        label: "Détails d'une Application",
        description: "Récupérer la configuration, l'état de santé et le statut d'un conteneur par son UUID Coolify.",
        connectorId: "coolify",
        category: "infra",
        isSensitive: false,
        requiredParams: ["uuid"],
        parameters: [
          { name: "uuid", type: "string", description: "UUID de l'application dans Coolify.", required: true },
        ],
        exampleInvocation: { uuid: "s1253nc0yc4uu89lp6692r1s" },
      },
      {
        name: "coolify_deploy_application",
        label: "Déploiement d'Application Coolify",
        description: "Déclencher un nouveau build et déploiement pour une ressource Coolify par son UUID.",
        connectorId: "coolify",
        category: "infra",
        isSensitive: true,
        requiredParams: ["uuid"],
        parameters: [
          { name: "uuid", type: "string", description: "UUID de la ressource applicative.", required: true },
          { name: "force_rebuild", type: "boolean", description: "Forcer la reconstruction sans cache Docker.", required: false },
        ],
        exampleInvocation: { uuid: "s1253nc0yc4uu89lp6692r1s", force_rebuild: false },
      },
      {
        name: "coolify_restart_application",
        label: "Redémarrage d'Application",
        description: "Redémarrer les conteneurs d'une application hébergée sur Coolify.",
        connectorId: "coolify",
        category: "infra",
        isSensitive: true,
        requiredParams: ["uuid"],
        parameters: [
          { name: "uuid", type: "string", description: "UUID de l'application à redémarrer.", required: true },
        ],
        exampleInvocation: { uuid: "s1253nc0yc4uu89lp6692r1s" },
      },
      {
        name: "coolify_get_application_logs",
        label: "Logs d'une Application",
        description: "Consulter les dernières lignes de journalisation d'un conteneur applicatif.",
        connectorId: "coolify",
        category: "infra",
        isSensitive: false,
        requiredParams: ["uuid"],
        parameters: [
          { name: "uuid", type: "string", description: "UUID de l'application.", required: true },
          { name: "lines", type: "number", description: "Nombre de lignes de log à remonter (défaut 100).", required: false },
        ],
        exampleInvocation: { uuid: "s1253nc0yc4uu89lp6692r1s", lines: 50 },
      },
    ],
  },
  {
    id: "flowise",
    slug: "flowise",
    name: "Flowise AI Orchestrator",
    category: "automation",
    categoryLabel: "Orchestration IA",
    description:
      "Moteur d'exécution de graphes et pipelines IA Flowise, agents LangChain et prédictions conversationnelles.",
    icon: "GitBranch",
    endpoint: "https://flowise.workspacegroupefloteuil.eu",
    protocol: "Flowise Engine API v1",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Flowise · Souverain",
    securityLevel: "API Key Authenticated · Flow Isolation",
    secretEnvVar: "FLOWISE_API_KEY",
    isBuiltin: false,
    tools: [
      {
        name: "flowise_list_chatflows",
        label: "Liste des Chatflows Flowise",
        description: "Lister tous les flux conversationnels et agents orchestrés disponibles sur Flowise.",
        connectorId: "flowise",
        category: "automation",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "flowise_get_chatflow",
        label: "Détails d'un Chatflow",
        description: "Consulter la configuration et les nœuds constitutifs d'un pipeline Flowise par son identifiant.",
        connectorId: "flowise",
        category: "automation",
        isSensitive: false,
        requiredParams: ["id"],
        parameters: [
          { name: "id", type: "string", description: "UUID du chatflow Flowise.", required: true },
        ],
        exampleInvocation: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" },
      },
      {
        name: "flowise_run_prediction",
        label: "Exécution de Prédiction Flowise",
        description: "Envoyer un prompt ou une requête à un chatflow Flowise pour obtenir son inférence ou réponse.",
        connectorId: "flowise",
        category: "automation",
        isSensitive: true,
        requiredParams: ["chatflow_id", "question"],
        parameters: [
          { name: "chatflow_id", type: "string", description: "UUID du flux d'inférence cible.", required: true },
          { name: "question", type: "string", description: "Message d'entrée ou question utilisateur.", required: true },
          { name: "overrideConfig", type: "object", description: "Variables d'écrasement de configuration d'exécution.", required: false },
        ],
        exampleInvocation: { chatflow_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", question: "Résume ce rapport financier." },
      },
    ],
  },
  {
    id: "pocketbase",
    slug: "pocketbase",
    name: "PocketBase Auth & Records",
    category: "infra",
    categoryLabel: "Base de données & Auth",
    description:
      "Plateforme backend temps réel PocketBase (auth.hubtowrite.com) avec gestion des collections relationnelles et authentification.",
    icon: "ShieldCheck",
    endpoint: "https://auth.hubtowrite.com",
    protocol: "PocketBase REST API",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "PocketBase · HubtoWrite",
    securityLevel: "Admin Token · Record Rule Validation",
    secretEnvVar: "POCKETBASE_ADMIN_TOKEN",
    isBuiltin: false,
    tools: [
      {
        name: "pocketbase_health",
        label: "Santé Serveur PocketBase",
        description: "Vérifier la disponibilité et l'état de santé de l'instance PocketBase (auth.hubtowrite.com).",
        connectorId: "pocketbase",
        category: "infra",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "pocketbase_list_collections",
        label: "Liste des Collections PocketBase",
        description: "Lister les collections et tables relationnelles gérées par PocketBase.",
        connectorId: "pocketbase",
        category: "infra",
        isSensitive: false,
        requiredParams: [],
        parameters: [],
        exampleInvocation: {},
      },
      {
        name: "pocketbase_list_records",
        label: "Lecture d'Enregistrements PocketBase",
        description: "Lister ou filtrer des enregistrements au sein d'une collection PocketBase.",
        connectorId: "pocketbase",
        category: "infra",
        isSensitive: false,
        requiredParams: ["collection"],
        parameters: [
          { name: "collection", type: "string", description: "Nom ou identifiant de la collection cible.", required: true },
          { name: "filter", type: "string", description: "Filtre PocketBase (ex: status = 'active').", required: false },
          { name: "sort", type: "string", description: "Critère de tri (ex: -created).", required: false },
          { name: "perPage", type: "number", description: "Nombre d'enregistrements par page.", required: false },
        ],
        exampleInvocation: { collection: "users", perPage: 10 },
      },
      {
        name: "pocketbase_create_record",
        label: "Création d'Enregistrement PocketBase",
        description: "Créer un nouvel enregistrement dans une collection PocketBase.",
        connectorId: "pocketbase",
        category: "infra",
        isSensitive: true,
        requiredParams: ["collection", "data"],
        parameters: [
          { name: "collection", type: "string", description: "Nom de la collection cible.", required: true },
          { name: "data", type: "object", description: "Objet JSON des données à insérer.", required: true },
        ],
        exampleInvocation: { collection: "profiles", data: { username: "floteuil", verified: true } },
      },
    ],
  },
  {
    id: "ubersuggest",
    slug: "ubersuggest",
    name: "Ubersuggest SEO Intelligence",
    category: "search",
    categoryLabel: "SEO & Mots-clés",
    description:
      "Analyse ponctuelle de volumes de recherche, indicateurs de concurrence CPC et aperçus de domaines en mode consultation stricte hors projet.",
    icon: "TrendingUp",
    endpoint: "https://ubersuggest-mcp.neilpatelapi.com/mcp",
    protocol: "Remote MCP API",
    status: "connected",
    statusText: "Connecté & Opérationnel",
    badgeText: "Ubersuggest · Hors Projet",
    securityLevel: "Ad-hoc Analysis · Zero Project Quota Impact",
    isBuiltin: false,
    tools: [
      {
        name: "ubersuggest_keyword_overview",
        label: "Analyse Mots-Clés SEO Ubersuggest",
        description: "Consulter le volume de recherche mensuel, le coût par clic (CPC) et le score de difficulté SEO pour des mots-clés.",
        connectorId: "ubersuggest",
        category: "search",
        isSensitive: false,
        requiredParams: ["keyword"],
        parameters: [
          { name: "keyword", type: "string", description: "Mot-clé ou expression à auditer.", required: true },
          { name: "country", type: "string", description: "Code pays cible (ex: fr, us, en).", required: false },
        ],
        exampleInvocation: { keyword: "intelligence artificielle agence", country: "fr" },
      },
      {
        name: "ubersuggest_domain_overview",
        label: "Audit de Domaine SEO Ubersuggest",
        description: "Analyser le trafic organique estimé, l'autorité de domaine et les positions d'un nom de domaine.",
        connectorId: "ubersuggest",
        category: "search",
        isSensitive: false,
        requiredParams: ["domain"],
        parameters: [
          { name: "domain", type: "string", description: "Nom de domaine web à auditer (ex: groupefloteuil.fr).", required: true },
        ],
        exampleInvocation: { domain: "groupefloteuil.fr" },
      },
    ],
  },
  {
    id: "system_platform",
    slug: "system_platform",
    name: "Système, Fichiers & Multi-Agents",
    category: "system",
    categoryLabel: "Système & Sandbox",
    description:
      "Capacités natives du bot : manipulation du système de fichiers du container, shell sandboxé, mémoire durable et essaimage d'agents.",
    icon: "Cpu",
    endpoint: "Sandbox In-Process Runtime",
    protocol: "POSIX Isolation & In-Process Agent Engine",
    status: "connected",
    statusText: "Connecté (Natif)",
    badgeText: "Natif In-Process & Sandbox",
    securityLevel: "Container Sandbox · Strict Working Directory Enforcement",
    secretEnvVar: "SYSTEM_INTERNAL",
    isBuiltin: true,
    tools: [
      {
        name: "list_files",
        label: "Exploration de Fichiers",
        description:
          "Lister les fichiers et répertoires dans le dossier home du bot ou dans l'espace partagé.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: [],
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Chemin relatif ou absolu du répertoire à lister.",
            required: false,
          },
        ],
        exampleInvocation: {
          path: "src",
        },
      },
      {
        name: "read_file",
        label: "Lecture de Fichier Sandbox",
        description: "Lire le contenu textuel UTF-8 d'un fichier du workspace ou du dossier bot.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: ["path"],
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Chemin du fichier à lire.",
            required: true,
          },
        ],
        exampleInvocation: {
          path: "README.md",
        },
      },
      {
        name: "write_file",
        label: "Écriture de Fichier Sandbox",
        description: "Créer ou écraser un fichier texte UTF-8 dans le répertoire du bot.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: true,
        requiredParams: ["path", "content"],
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Chemin du fichier à créer ou modifier.",
            required: true,
          },
          {
            name: "content",
            type: "string",
            description: "Contenu texte UTF-8 à persister.",
            required: true,
          },
        ],
        exampleInvocation: {
          path: "notes.txt",
          content: "Compte rendu de réunion de projet.",
        },
      },
      {
        name: "attach_file",
        label: "Attachement de Fichier au Thread",
        description:
          "Attacher un fichier du workspace à la conversation pour prévisualisation et téléchargement.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: ["path"],
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Chemin du fichier à attacher dans le thread.",
            required: true,
          },
        ],
        exampleInvocation: {
          path: "rapport.pdf",
        },
      },
      {
        name: "shell",
        label: "Exécution Shell Sandboxée",
        description: "Exécuter une commande sécurisée dans le sandbox du container du bot.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: true,
        requiredParams: ["command"],
        parameters: [
          {
            name: "command",
            type: "string",
            description: "Ligne de commande à exécuter.",
            required: true,
          },
          {
            name: "cwd",
            type: "string",
            description: "Répertoire de travail d'exécution.",
            required: false,
          },
        ],
        exampleInvocation: {
          command: "pnpm test",
        },
      },
      {
        name: "open_path",
        label: "Ouverture Graphique de Fichier / URL",
        description:
          "Ouvrir un fichier ou une URL dans l'application graphique par défaut du container.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: ["path"],
        parameters: [
          {
            name: "path",
            type: "string",
            description: "Chemin local ou URL http(s) à ouvrir.",
            required: true,
          },
        ],
        exampleInvocation: {
          path: "https://localhost:3000",
        },
      },
      {
        name: "launch_app",
        label: "Lancement d'Application Graphique",
        description: "Démarrer une application graphique installée dans l'environnement du bot.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: ["application"],
        parameters: [
          {
            name: "application",
            type: "string",
            description: "Nom ou exécutable de l'application.",
            required: true,
          },
          {
            name: "uri",
            type: "string",
            description: "URI ou fichier optionnel passé au lancement.",
            required: false,
          },
        ],
        exampleInvocation: {
          application: "chromium",
          uri: "https://example.com",
        },
      },
      {
        name: "request_takeover",
        label: "Demande de Prise en Main Humaine",
        description:
          "Solliciter la prise de contrôle manuelle de l'écran par l'utilisateur pour authentification ou validation.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: ["reason"],
        parameters: [
          {
            name: "reason",
            type: "string",
            description: "Raison motivant l'intervention de l'utilisateur.",
            required: true,
          },
        ],
        exampleInvocation: {
          reason: "Veuillez saisir votre code d'authentification à double facteur (2FA).",
        },
      },
      {
        name: "remember",
        label: "Mémoire Durable du Bot",
        description:
          "Enregistrer un fait ou une directive permanente dans la mémoire explicite du bot.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: false,
        requiredParams: ["content"],
        parameters: [
          {
            name: "content",
            type: "string",
            description: "Fait ou directive à mémoriser durablement.",
            required: true,
          },
          {
            name: "path",
            type: "string",
            description: "Chemin spécifique de mémorisation optionnel.",
            required: false,
          },
        ],
        exampleInvocation: {
          content: "L'utilisateur préfère les réponses concises et les diagrammes en Mermaid.",
        },
      },
      {
        name: "run_subagent",
        label: "Délégation à un Sous-Agent Éphémère",
        description:
          "Lancer un assistant auxiliaire éphémère durant ce tour pour une tâche d'exploration ou de révision.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: true,
        requiredParams: ["name", "task"],
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Libellé court du sous-agent (ex: 'scout' ou 'reviewer').",
            required: true,
          },
          {
            name: "task",
            type: "string",
            description: "Tâche précise confiée au sous-agent.",
            required: true,
          },
          {
            name: "instructions",
            type: "string",
            description: "Directives système supplémentaires spécifiques.",
            required: false,
          },
        ],
        exampleInvocation: {
          name: "code-auditor",
          task: "Vérifier la conformité des types TypeScript dans le module contracts.",
        },
      },
      {
        name: "spawn_bot",
        label: "Création Dynamique d'un Bot Autonome",
        description: "Créer un bot autonome complet avec son propre thread, container et mémoire.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: true,
        requiredParams: ["name"],
        parameters: [
          {
            name: "name",
            type: "string",
            description: "Nom du nouveau bot.",
            required: true,
          },
          {
            name: "title",
            type: "string",
            description: "Titre ou fonction du bot.",
            required: false,
          },
          {
            name: "instructions",
            type: "string",
            description: "Instructions système pour le bot créé.",
            required: false,
          },
          {
            name: "prompt",
            type: "string",
            description: "Première tâche à exécuter immédiatement.",
            required: false,
          },
        ],
        exampleInvocation: {
          name: "QA Inspector",
          title: "Auditeur Qualité & Tests",
          instructions: "Exécuter les suites de tests et signaler toute régression.",
        },
      },
      {
        name: "archive_bot",
        label: "Archivage de Bot Créé",
        description: "Archiver et suspendre un bot créé dynamiquement par cet agent.",
        connectorId: "system_platform",
        category: "system",
        isSensitive: true,
        requiredParams: ["confirm_name"],
        parameters: [
          {
            name: "confirm_name",
            type: "string",
            description: "Nom exact du bot à archiver pour confirmation de sécurité.",
            required: true,
          },
          {
            name: "bot_id",
            type: "string",
            description: "ID optionnel du bot.",
            required: false,
          },
        ],
        exampleInvocation: {
          confirm_name: "QA Inspector",
        },
      },
    ],
  },
];

export const ALL_SOVEREIGN_TOOL_NAMES: string[] = SOVEREIGN_MCP_CONNECTORS.flatMap((connector) =>
  connector.tools.map((t) => t.name),
);

export const DEFAULT_ENABLED_SOVEREIGN_TOOLS: string[] = [
  "web_search",
  "web_scrape",
  "read_skill",
  "remember",
  "run_subagent",
  "spawn_bot",
  "archive_bot",
];

export function getAllSovereignToolNames(): string[] {
  return [...ALL_SOVEREIGN_TOOL_NAMES];
}

export function getAllSovereignTools(): McpToolDefinition[] {
  return SOVEREIGN_MCP_CONNECTORS.flatMap((c) => c.tools);
}

export function getConnectorForTool(toolName: string): SovereignMcpConnector | undefined {
  return SOVEREIGN_MCP_CONNECTORS.find((connector) =>
    connector.tools.some((tool) => tool.name === toolName),
  );
}

export function getSovereignConnector(idOrSlug: string): SovereignMcpConnector | undefined {
  return SOVEREIGN_MCP_CONNECTORS.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
}

export function getSovereignToolsByCategory(category: SovereignCategory): McpToolDefinition[] {
  if (category === "all" || category === "connected") {
    return getAllSovereignTools();
  }
  return SOVEREIGN_MCP_CONNECTORS.filter((c) => c.category === category).flatMap((c) => c.tools);
}

export function isSovereignTool(toolName: string): boolean {
  return ALL_SOVEREIGN_TOOL_NAMES.includes(toolName);
}

export const FORBIDDEN_MCP_CONNECTORS = ["stripe", "stripe_agence"] as const;

export function isForbiddenMcpConnector(idOrSlug: string): boolean {
  const normalized = idOrSlug.toLowerCase().trim();
  return FORBIDDEN_MCP_CONNECTORS.some((forbidden) => normalized.includes(forbidden));
}

