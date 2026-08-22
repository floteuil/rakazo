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
  { id: "search", label: "Recherche", description: "Recherche web privée & extraction sans traçage" },
  { id: "code", label: "Ingénierie", description: "Gestion de dépôts Git, code, PR & tickets" },
  { id: "workspace", label: "Workspace", description: "Bases de connaissances, pages & documentation" },
  { id: "social", label: "Social", description: "Publication & planification multi-réseaux" },
  { id: "cms", label: "CMS", description: "Gestion de contenu WordPress & réseau Novamira" },
  { id: "automation", label: "Automatisation", description: "Workflows événementiels n8n & webhooks" },
  { id: "infra", label: "Infrastructure", description: "Réseau de bordure, DNS & cache Cloudflare" },
  { id: "system", label: "Système", description: "Sandbox, fichiers, shell & coordination multi-agents" },
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
            description: "Chemin du fichier au sein du dépôt (ex: 'packages/contracts/src/index.ts').",
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
        description: "Création d'un nouveau ticket sur un dépôt GitHub avec titre, corps Markdown et labels.",
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
        description: "Recherche globale de pages et bases de données dans l'espace de travail Notion connecté.",
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
        description: "Récupération des propriétés et du contenu en blocs d'une page Notion par son identifiant UUID.",
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
        description: "Liste des canaux et comptes de réseaux sociaux connectés et autorisés sur l'instance Postiz.",
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
            description: "Horodatage ISO-8601 pour planification différée (ex: '2026-08-22T14:00:00Z').",
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
        description: "Récupération du contenu HTML complet et des métadonnées d'un article WordPress par son ID.",
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
        description: "Lister les fichiers et répertoires dans le dossier home du bot ou dans l'espace partagé.",
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
        description: "Attacher un fichier du workspace à la conversation pour prévisualisation et téléchargement.",
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
        description: "Ouvrir un fichier ou une URL dans l'application graphique par défaut du container.",
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
        description: "Solliciter la prise de contrôle manuelle de l'écran par l'utilisateur pour authentification ou validation.",
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
        description: "Enregistrer un fait ou une directive permanente dans la mémoire explicite du bot.",
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
        description: "Lancer un assistant auxiliaire éphémère durant ce tour pour une tâche d'exploration ou de révision.",
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
