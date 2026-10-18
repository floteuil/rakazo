import { resolveAuthSecret, resolveEncryptionKey, resolveSupervisorToken } from "@rakazo/core";

export interface AppEnv {
  databaseUrl: string;
  realtimeDatabaseUrl: string;
  authSecret: string;
  authUrl: string;
  webOrigin: string;
  apiUrl: string;
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
  encryptionKey: string;
  dataDir: string;
  sandboxSupervisorUrl: string;
  sandboxSupervisorToken: string;
  sandboxProvider: string;
  agentRuntime: string;
  openRouterKey: string | undefined;
  e2bApiKey: string | undefined;
  daytonaApiKey: string | undefined;
  daytonaApiUrl: string | undefined;
  daytonaTarget: string | undefined;
  boxApiKey: string | undefined;
  boxApiUrl: string | undefined;
  composioApiKey: string | undefined;
  defaultProvider: string;
  defaultModel: string;
  wakeupDriver: string;
  port: number;
  gitSha: string | undefined;
  searxngUrl: string | undefined;
  scraperrUrl: string | undefined;
  githubToken: string | undefined;
  githubApiUrl: string | undefined;
  notionApiKey: string | undefined;
  postizApiKey: string | undefined;
  postizApiUrl: string | undefined;
  wordpressUrl: string | undefined;
  wordpressUsername: string | undefined;
  wordpressAppPassword: string | undefined;
  novamiraApiKey: string | undefined;
  n8nApiKey: string | undefined;
  n8nApiUrl: string | undefined;
  cloudflareApiToken: string | undefined;
  cloudflareAccountId: string | undefined;
  omnirouteBaseUrl: string;
  omnirouteApiKey?: string;
  twentyApiUrl?: string;
  twentyApiKey?: string;
  affineBaseUrl?: string;
  affineWorkspaceId?: string;
  affineEmail?: string;
  context7ApiKey?: string;
  context7ApiUrl?: string;
  openDesignDaemonUrl?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  coolifyApiUrl?: string;
  coolifyApiToken?: string;
  flowiseApiEndpoint?: string;
  flowiseApiKey?: string;
  pocketbaseUrl?: string;
  pocketbaseAdminToken?: string;
  ubersuggestApiKey?: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const authSecret = resolveAuthSecret(source);
  return {
    databaseUrl: required(source, "DATABASE_URL"),
    realtimeDatabaseUrl: source.REALTIME_DATABASE_URL ?? required(source, "DATABASE_URL"),
    authSecret,
    authUrl: source.BETTER_AUTH_URL ?? source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    webOrigin: source.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    apiUrl: source.API_URL ?? "http://127.0.0.1:3100",
    signupsEnabled: source.SIGNUPS_ENABLED,
    signupAllowlist: source.SIGNUP_ALLOWLIST,
    encryptionKey: resolveEncryptionKey(source),
    dataDir: source.DATA_DIR ?? "./data",
    sandboxSupervisorUrl: source.SANDBOX_SUPERVISOR_URL ?? "http://127.0.0.1:7091",
    sandboxSupervisorToken: resolveSupervisorToken(source),
    sandboxProvider: source.SANDBOX_PROVIDER ?? "docker",
    agentRuntime: source.AGENT_RUNTIME ?? "pi",
    openRouterKey: source.OPENROUTER_API_KEY,
    e2bApiKey: source.E2B_API_KEY,
    daytonaApiKey: source.DAYTONA_API_KEY,
    daytonaApiUrl: source.DAYTONA_API_URL,
    daytonaTarget: source.DAYTONA_TARGET,
    boxApiKey: source.BOX_API_KEY,
    boxApiUrl: source.BOX_API_URL ?? source.BOX_BASE_URL,
    composioApiKey: source.COMPOSIO_API_KEY,
    defaultProvider: source.PI_DEFAULT_PROVIDER ?? "openrouter",
    defaultModel: source.PI_DEFAULT_MODEL ?? "deepseek/deepseek-v4-flash-0731",
    wakeupDriver: source.WAKEUP_DRIVER ?? "graphile",
    port: Number(source.API_PORT ?? 3100),
    gitSha: optional(source.GIT_SHA) ?? optional(source.RAKAZO_GIT_SHA),
    searxngUrl: optional(source.SEARXNG_URL),
    scraperrUrl: optional(source.SCRAPERR_URL),
    githubToken: optional(source.GITHUB_TOKEN),
    githubApiUrl: optional(source.GITHUB_API_URL),
    notionApiKey: optional(source.NOTION_API_KEY),
    postizApiKey: optional(source.POSTIZ_API_KEY),
    postizApiUrl: optional(source.POSTIZ_API_URL),
    wordpressUrl: optional(source.WORDPRESS_URL),
    wordpressUsername: optional(source.WORDPRESS_USERNAME),
    wordpressAppPassword: optional(source.WORDPRESS_APP_PASSWORD),
    novamiraApiKey: optional(source.NOVAMIRA_API_KEY),
    n8nApiKey: optional(source.N8N_API_KEY),
    n8nApiUrl: optional(source.N8N_API_URL),
    cloudflareApiToken: optional(source.CLOUDFLARE_API_TOKEN),
    cloudflareAccountId: optional(source.CLOUDFLARE_ACCOUNT_ID),
    omnirouteBaseUrl:
      optional(source.OMNIROUTE_BASE_URL) ?? "https://omniroute.workspacegroupefloteuil.eu/v1",
    omnirouteApiKey: optional(source.OMNIROUTE_API_KEY),
    twentyApiUrl: optional(source.TWENTY_API_URL),
    twentyApiKey: optional(source.TWENTY_API_KEY),
    affineBaseUrl: optional(source.AFFINE_BASE_URL),
    affineWorkspaceId: optional(source.AFFINE_WORKSPACE_ID),
    affineEmail: optional(source.AFFINE_EMAIL),
    context7ApiKey: optional(source.CONTEXT7_API_KEY),
    context7ApiUrl: optional(source.CONTEXT7_API_URL),
    openDesignDaemonUrl: optional(source.OPEN_DESIGN_DAEMON_URL),
    qdrantUrl: optional(source.QDRANT_URL),
    qdrantApiKey: optional(source.QDRANT_API_KEY),
    coolifyApiUrl: optional(source.COOLIFY_API_URL),
    coolifyApiToken: optional(source.COOLIFY_API_TOKEN),
    flowiseApiEndpoint: optional(source.FLOWISE_API_ENDPOINT),
    flowiseApiKey: optional(source.FLOWISE_API_KEY),
    pocketbaseUrl: optional(source.POCKETBASE_URL),
    pocketbaseAdminToken: optional(source.POCKETBASE_ADMIN_TOKEN),
    ubersuggestApiKey: optional(source.UBERSUGGEST_API_KEY),
  };
}

function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
