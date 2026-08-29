import crypto from "node:crypto";

// ============================================================================
// SHARED TYPES FOR OMNIROUTE E2E AND TEST SUITES
// ============================================================================

export type InferenceMode = "premium" | "free";
export type InferenceUsageTag = "coding" | "writing" | "reasoning" | "fast" | "analysis";

export interface BotInferenceConfig {
  mode: InferenceMode;
  tags: InferenceUsageTag[];
}

export interface PromptExecutionLogInput {
  runId: string;
  workerId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
  inferenceMode?: InferenceMode;
  requestedCategory?: string | null;
  resolvedProvider?: string | null;
  resolvedModel?: string | null;
  isFree?: boolean;
}

// ============================================================================
// 1. ADAPTER TYPES & REFERENCE IMPLEMENTATION
// ============================================================================
export interface OmniRouteChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface OmniRouteChatOptions {
  model?: string;
  messages: OmniRouteChatMessage[];
  tools?: any[];
  stream?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OmniRouteStreamChunk {
  content?: string;
  toolCalls?: any[];
  done?: boolean;
  raw?: any;
}

export interface OmniRouteResponse {
  id: string;
  content: string;
  toolCalls: any[];
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class ReferenceFreeOmniRouteAdapter {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;

  constructor(options: {
    baseUrl: string;
    apiKey: string;
    defaultModel?: string;
    timeoutMs?: number;
  }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel || "meta-llama/llama-3.3-70b-instruct:free";
    this.defaultTimeoutMs = options.timeoutMs ?? 30000;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getDefaultModel(): string {
    return this.defaultModel;
  }

  public async complete(options: OmniRouteChatOptions): Promise<OmniRouteResponse> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: options.messages,
          tools: options.tools,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const costHeader = response.headers.get("x-omniroute-cost");
      if (costHeader && Number.parseFloat(costHeader) > 0.000001) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const data = (await response.json()) as any;
      const choice = data.choices?.[0];
      return {
        id: data.id || "chatcmpl-unknown",
        content: choice?.message?.content || "",
        toolCalls: choice?.message?.tool_calls || [],
        model: data.model || this.defaultModel,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            }
          : undefined,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(
          "Request aborted or timed out: Capacité gratuite temporairement indisponible",
        );
      }
      if (err.message.includes("Capacité gratuite temporairement indisponible")) {
        throw err;
      }
      throw new Error("Capacité gratuite temporairement indisponible");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async *stream(
    options: OmniRouteChatOptions,
  ): AsyncGenerator<OmniRouteStreamChunk, void, unknown> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener("abort", () => controller.abort());
      }
    }

    try {
      const url = `${this.baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model || this.defaultModel,
          messages: options.messages,
          tools: options.tools,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const costHeader = response.headers.get("x-omniroute-cost");
      if (costHeader && Number.parseFloat(costHeader) > 0.000001) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      if (!response.body) {
        throw new Error("Capacité gratuite temporairement indisponible");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (controller.signal.aborted || options.signal?.aborted) {
          throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (controller.signal.aborted || options.signal?.aborted) {
            throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
          }
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed === "data: [DONE]") {
            yield { done: true };
            return;
          }

          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.pricing && (parsed.pricing.prompt > 0 || parsed.pricing.completion > 0)) {
                throw new Error("Capacité gratuite temporairement indisponible");
              }
              const delta = parsed.choices?.[0]?.delta;
              if (delta) {
                yield {
                  content: delta.content,
                  toolCalls: delta.tool_calls,
                  raw: parsed,
                };
                if (controller.signal.aborted || options.signal?.aborted) {
                  throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
                }
              }
            } catch (err: any) {
              if (err.message.includes("Capacité gratuite temporairement indisponible")) {
                throw err;
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("Request aborted: Capacité gratuite temporairement indisponible");
      }
      if (err.message.includes("Capacité gratuite temporairement indisponible")) {
        throw err;
      }
      throw new Error("Capacité gratuite temporairement indisponible");
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================================
// 2. FREE POLICY ENGINE & BARRIER
// ============================================================================
export interface FreeRouteDecision {
  provider: string;
  model: string;
  isFree: true;
  costPerToken: number;
  category: InferenceUsageTag | "general";
}

export const APPROVED_FREE_PROVIDERS = [
  "meta-llama",
  "mistralai",
  "qwen",
  "deepseek",
  "google",
] as const;

export const AVOIDED_PROVIDERS = [
  "unapproved_commercial_proxy",
  "unknown_vendor",
  "tos_violating_mirror",
] as const;

export class ReferenceRakazoFreePolicyEngine {
  private approvedProviders = new Set<string>(APPROVED_FREE_PROVIDERS);
  private avoidedProviders = new Set<string>(AVOIDED_PROVIDERS);

  private tagToModelMap: Record<InferenceUsageTag, { provider: string; model: string }> = {
    coding: {
      provider: "qwen",
      model: "qwen/qwen-2.5-coder-32b-instruct:free",
    },
    reasoning: {
      provider: "deepseek",
      model: "deepseek/deepseek-r1:free",
    },
    writing: {
      provider: "mistralai",
      model: "mistralai/mistral-small-24b-instruct:free",
    },
    fast: {
      provider: "meta-llama",
      model: "meta-llama/llama-3.2-3b-instruct:free",
    },
    analysis: {
      provider: "qwen",
      model: "qwen/qwen-2.5-72b-instruct:free",
    },
  };

  private defaultRoute: { provider: string; model: string } = {
    provider: "meta-llama",
    model: "meta-llama/llama-3.3-70b-instruct:free",
  };

  public resolveRoute(tags: InferenceUsageTag[] = []): FreeRouteDecision {
    if (!Array.isArray(tags)) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    if (tags.length === 0) {
      this.assertZeroCostAndAllowed(this.defaultRoute.provider, 0.0);
      return {
        provider: this.defaultRoute.provider,
        model: this.defaultRoute.model,
        isFree: true,
        costPerToken: 0.0,
        category: "general",
      };
    }

    const primaryTag = tags[0]!;
    const target = this.tagToModelMap[primaryTag];

    if (!target) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    this.assertZeroCostAndAllowed(target.provider, 0.0);

    return {
      provider: target.provider,
      model: target.model,
      isFree: true,
      costPerToken: 0.0,
      category: primaryTag,
    };
  }

  public assertZeroCostAndAllowed(provider: string, cost: number): void {
    if (cost !== 0.0 || cost > 0.00000001 || cost < 0) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    if (this.avoidedProviders.has(provider)) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }

    if (!this.approvedProviders.has(provider)) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }
  }

  public validatePostInferenceCost(reportedCost: number, provider: string): void {
    this.assertZeroCostAndAllowed(provider, reportedCost);
  }

  public vetoPaidFallback(intendedModel: string): void {
    if (!intendedModel.includes(":free") && !intendedModel.includes("free")) {
      throw new Error("Capacité gratuite temporairement indisponible");
    }
  }
}

// ============================================================================
// 3. SUBAGENT INHERITANCE & GUARDRAILS
// ============================================================================
export interface BotContext {
  id: string;
  name: string;
  inferenceMode: InferenceMode;
  usageTags?: InferenceUsageTag[];
  tools?: string[];
  depth?: number;
}

export interface SubagentSpawnRequest {
  parentBot: BotContext;
  requestedInferenceMode?: InferenceMode;
  requestedUsageTags?: InferenceUsageTag[];
  taskPrompt: string;
  depth?: number;
}

export interface SubagentExecutionContext {
  botId: string;
  parentBotId: string;
  inferenceMode: InferenceMode;
  usageTags: InferenceUsageTag[];
  maxTokens: number;
  maxDepth: number;
  availableTools: string[];
  systemPrompt: string;
}

export const SUBAGENT_TOKEN_BUDGET_CEILING = 8192;
export const SUBAGENT_MAX_DEPTH = 1;
export const DELEGATION_TOOL_NAMES = [
  "spawn_subagent",
  "delegate_task",
  "child_bot_spawn",
  "create_child_agent",
] as const;

export class ReferenceSubagentExecutor {
  public spawnSubagent(request: SubagentSpawnRequest): SubagentExecutionContext {
    const parentDepth = request.parentBot.depth ?? 0;
    const newDepth = parentDepth + 1;

    if (newDepth > SUBAGENT_MAX_DEPTH) {
      throw new Error(
        `Subagent recursion depth ${newDepth} exceeds maximum allowed depth ${SUBAGENT_MAX_DEPTH}`,
      );
    }

    let resolvedMode: InferenceMode = request.parentBot.inferenceMode;
    if (request.parentBot.inferenceMode === "free") {
      resolvedMode = "free";
    } else if (request.requestedInferenceMode) {
      resolvedMode = request.requestedInferenceMode;
    }

    const resolvedTags = request.requestedUsageTags ?? request.parentBot.usageTags ?? [];

    const parentTools = request.parentBot.tools ?? [
      "web_search",
      "web_scrape",
      "spawn_subagent",
      "delegate_task",
      "bash_exec",
    ];

    const sanitizedTools = parentTools.filter(
      (tool) => !DELEGATION_TOOL_NAMES.includes(tool as any),
    );

    const systemPrompt = this.build4BlockSubagentPrompt({
      taskPrompt: request.taskPrompt,
      inferenceMode: resolvedMode,
      tools: sanitizedTools,
    });

    return {
      botId: `subagent-${Math.random().toString(36).substring(2, 9)}`,
      parentBotId: request.parentBot.id,
      inferenceMode: resolvedMode,
      usageTags: resolvedTags,
      maxTokens: SUBAGENT_TOKEN_BUDGET_CEILING,
      maxDepth: SUBAGENT_MAX_DEPTH,
      availableTools: sanitizedTools,
      systemPrompt,
    };
  }

  public build4BlockSubagentPrompt(params: {
    taskPrompt: string;
    inferenceMode: InferenceMode;
    tools: string[];
  }): string {
    const blockA =
      "[BLOCK_A_SYSTEM_INVARIANTS]\nYou are an isolated subagent. Follow safety and budget constraints.";
    const blockB = `[BLOCK_B_CAPABILITIES]\nInferenceMode: ${params.inferenceMode}\nTools: ${params.tools.join(", ")}`;
    const blockC = "[BLOCK_C_CONTEXT]\nSubagent execution scope: isolated task.";
    const blockD = `[BLOCK_D_TASK]\n${params.taskPrompt}`;

    return `${blockA}\n\n${blockB}\n\n${blockC}\n\n${blockD}`;
  }

  public validateTokenBudget(promptTokenCount: number): void {
    if (promptTokenCount > SUBAGENT_TOKEN_BUDGET_CEILING) {
      throw new Error(
        `Subagent token budget exceeded: ${promptTokenCount} tokens > ${SUBAGENT_TOKEN_BUDGET_CEILING} limit.`,
      );
    }
  }
}

// ============================================================================
// 4. VPS & COOLIFY AUDIT INSPECTOR (FEATURE 1 & 10)
// ============================================================================
export interface VpsResourceMetrics {
  cpuCores: number;
  totalRamMb: number;
  availableRamMb: number;
  diskTotalGb: number;
  diskFreeGb: number;
  osRelease: string;
}

export interface CoLocatedServiceStatus {
  id: string;
  name: string;
  status: "running" | "exited" | "degraded";
  uptimeSeconds: number;
  ports: number[];
  isolatedNetwork: boolean;
}

export class MockVpsAuditInspector {
  private services: CoLocatedServiceStatus[] = [
    {
      id: "srv-coolify-core",
      name: "coolify-core",
      status: "running",
      uptimeSeconds: 864000,
      ports: [8000],
      isolatedNetwork: true,
    },
    {
      id: "srv-traefik-proxy",
      name: "traefik-proxy",
      status: "running",
      uptimeSeconds: 864000,
      ports: [80, 443],
      isolatedNetwork: true,
    },
    {
      id: "srv-postgres-main",
      name: "postgres-main",
      status: "running",
      uptimeSeconds: 864000,
      ports: [5432],
      isolatedNetwork: true,
    },
    {
      id: "srv-redis-cache",
      name: "redis-cache",
      status: "running",
      uptimeSeconds: 864000,
      ports: [6379],
      isolatedNetwork: true,
    },
    {
      id: "srv-rakazo-web",
      name: "rakazo-web",
      status: "running",
      uptimeSeconds: 432000,
      ports: [5173],
      isolatedNetwork: true,
    },
    {
      id: "srv-rakazo-api",
      name: "rakazo-api",
      status: "running",
      uptimeSeconds: 432000,
      ports: [3100],
      isolatedNetwork: true,
    },
    {
      id: "srv-rakazo-worker",
      name: "rakazo-worker",
      status: "running",
      uptimeSeconds: 432000,
      ports: [],
      isolatedNetwork: true,
    },
    {
      id: "srv-novamira-hub",
      name: "novamira-hub",
      status: "running",
      uptimeSeconds: 650000,
      ports: [3001],
      isolatedNetwork: true,
    },
    {
      id: "srv-novamira-adns",
      name: "novamira-adns",
      status: "running",
      uptimeSeconds: 650000,
      ports: [3002],
      isolatedNetwork: true,
    },
    {
      id: "srv-postiz-social",
      name: "postiz-social",
      status: "running",
      uptimeSeconds: 520000,
      ports: [3000],
      isolatedNetwork: true,
    },
    {
      id: "srv-searxng-engine",
      name: "searxng-engine",
      status: "running",
      uptimeSeconds: 780000,
      ports: [8081],
      isolatedNetwork: true,
    },
    {
      id: "srv-n8n-automation",
      name: "n8n-automation",
      status: "running",
      uptimeSeconds: 590000,
      ports: [5678],
      isolatedNetwork: true,
    },
    {
      id: "srv-monitoring-grafana",
      name: "monitoring-grafana",
      status: "running",
      uptimeSeconds: 900000,
      ports: [3005],
      isolatedNetwork: true,
    },
    {
      id: "srv-monitoring-prometheus",
      name: "monitoring-prometheus",
      status: "running",
      uptimeSeconds: 900000,
      ports: [9090],
      isolatedNetwork: true,
    },
    {
      id: "srv-caddy-ssl",
      name: "caddy-ssl",
      status: "running",
      uptimeSeconds: 864000,
      ports: [8443],
      isolatedNetwork: true,
    },
  ];

  public getVpsMetrics(): VpsResourceMetrics {
    return {
      cpuCores: 8,
      totalRamMb: 32768,
      availableRamMb: 18450,
      diskTotalGb: 200,
      diskFreeGb: 142,
      osRelease: "Ubuntu 22.04 LTS (Jammy Jellyfish)",
    };
  }

  public getCoLocatedServices(): CoLocatedServiceStatus[] {
    return [...this.services];
  }

  public getCoolifyAppDetails(appId: string): {
    appId: string;
    name: string;
    fqdn: string;
    internalPort: number;
    volumeMount: string;
    status: string;
  } {
    if (appId === "qmusbfbjcz0ohip348rv8fgc" || appId === "app-21" || appId === "omniroute") {
      return {
        appId: "qmusbfbjcz0ohip348rv8fgc",
        name: "OmniRoute AI Gateway",
        fqdn: "https://omniroute.workspacegroupefloteuil.eu",
        internalPort: 20128,
        volumeMount: "/app/data",
        status: "ready",
      };
    }
    throw new Error(`Unknown Coolify App ID: ${appId}`);
  }

  public verifyZeroInterference(beforeSnapshot: CoLocatedServiceStatus[]): boolean {
    if (beforeSnapshot.length !== this.services.length) return false;
    for (let i = 0; i < beforeSnapshot.length; i++) {
      const b = beforeSnapshot[i]!;
      const cur = this.services.find((s) => s.id === b.id);
      if (cur?.status !== "running" || cur.uptimeSeconds < b.uptimeSeconds) {
        return false;
      }
    }
    return true;
  }
}

// ============================================================================
// 5. SPEC PINNING VALIDATOR (FEATURE 2)
// ============================================================================
export interface SpecPinningResult {
  repoUrl: string;
  pinnedCommit: string;
  pinnedRelease: string;
  targetVolume: string;
  targetPort: number;
  nonRootUser: string;
  isCompliant: boolean;
}

export class MockSpecPinningValidator {
  public static readonly EXPECTED_REPO = "https://github.com/floteuil/OmniRoute";
  public static readonly EXPECTED_COMMIT = "38e2616464fac4681c1f7a4e05dc9974e99e1dde";
  public static readonly EXPECTED_RELEASE = "release/v3.8.51";
  public static readonly EXPECTED_VOLUME = "/app/data";
  public static readonly EXPECTED_PORT = 20128;
  public static readonly EXPECTED_USER = "10001:10001";

  public validateSpec(config: {
    repoUrl: string;
    commitHash?: string;
    releaseTag?: string;
    volumeMount?: string;
    port?: number;
    user?: string;
  }): SpecPinningResult {
    const isRepoMatch = config.repoUrl === MockSpecPinningValidator.EXPECTED_REPO;
    const isCommitMatch =
      !config.commitHash || config.commitHash === MockSpecPinningValidator.EXPECTED_COMMIT;
    const isReleaseMatch =
      !config.releaseTag || config.releaseTag === MockSpecPinningValidator.EXPECTED_RELEASE;
    const isVolumeMatch =
      !config.volumeMount || config.volumeMount === MockSpecPinningValidator.EXPECTED_VOLUME;
    const isPortMatch =
      !config.port ||
      config.port === MockSpecPinningValidator.EXPECTED_PORT ||
      config.port === 8080;
    const isUserMatch =
      !config.user ||
      config.user === MockSpecPinningValidator.EXPECTED_USER ||
      config.user === "node";

    const isCompliant =
      isRepoMatch && isCommitMatch && isReleaseMatch && isVolumeMatch && isPortMatch && isUserMatch;

    return {
      repoUrl: config.repoUrl,
      pinnedCommit: config.commitHash || MockSpecPinningValidator.EXPECTED_COMMIT,
      pinnedRelease: config.releaseTag || MockSpecPinningValidator.EXPECTED_RELEASE,
      targetVolume: config.volumeMount || MockSpecPinningValidator.EXPECTED_VOLUME,
      targetPort: config.port || MockSpecPinningValidator.EXPECTED_PORT,
      nonRootUser: config.user || MockSpecPinningValidator.EXPECTED_USER,
      isCompliant,
    };
  }
}

// ============================================================================
// 6. PERSISTENCE & STORAGE SIMULATOR (FEATURE 4 & 9)
// ============================================================================
export interface OmniRoutePersistedKey {
  id: string;
  keyHash: string;
  name: string;
  createdAt: number;
  revoked: boolean;
}

export class MockOmniRouteStorageManager {
  private volumePath: string;
  private encryptionKey: string;
  private apiKeys = new Map<string, OmniRoutePersistedKey>();
  private adminPasswordHash: string;
  private isMounted = true;
  private isWalActive = true;

  constructor(
    options: { volumePath?: string; encryptionKey?: string; initialPassword?: string } = {},
  ) {
    this.volumePath = options.volumePath || "/app/data";
    this.encryptionKey = options.encryptionKey || "test-storage-encryption-key-32-chars-long!";
    this.adminPasswordHash = this.hashPassword(
      options.initialPassword || "SuperAdminStrongSecret2026!",
    );
  }

  public hashPassword(pwd: string): string {
    return crypto.createHash("sha256").update(`salt:${pwd}`).digest("hex");
  }

  public verifyPassword(pwd: string): boolean {
    return this.hashPassword(pwd) === this.adminPasswordHash;
  }

  public createApiKey(name: string): { key: string; record: OmniRoutePersistedKey } {
    if (!this.isMounted) throw new Error("Storage volume /app/data not mounted");
    const rawKey = `sk-omniroute-${crypto.randomBytes(16).toString("hex")}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const record: OmniRoutePersistedKey = {
      id: `key-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      keyHash,
      name,
      createdAt: Date.now(),
      revoked: false,
    };
    this.apiKeys.set(keyHash, record);
    return { key: rawKey, record };
  }

  public validateApiKey(rawKey: string): boolean {
    if (!this.isMounted) return false;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const record = this.apiKeys.get(keyHash);
    return Boolean(record && !record.revoked);
  }

  public revokeApiKey(rawKey: string): boolean {
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const record = this.apiKeys.get(keyHash);
    if (record) {
      record.revoked = true;
      return true;
    }
    return false;
  }

  public simulateRestart(): void {
    // In WAL SQLite with volume /app/data, keys and configs remain intact
    this.isMounted = true;
    this.isWalActive = true;
  }

  public simulateVolumeUnmount(): void {
    this.isMounted = false;
  }

  public getVolumeStatus(): {
    volumePath: string;
    isMounted: boolean;
    isWalActive: boolean;
    keyCount: number;
  } {
    return {
      volumePath: this.volumePath,
      isMounted: this.isMounted,
      isWalActive: this.isWalActive,
      keyCount: Array.from(this.apiKeys.values()).filter((k) => !k.revoked).length,
    };
  }
}

// ============================================================================
// 7. ADMIN AUTH & RATE LIMITER (FEATURE 4)
// ============================================================================
export class MockAdminAuthEngine {
  private failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCK_DURATION_MS = 60000;
  private jwtSecret: string;

  constructor(jwtSecret = "super-jwt-secret-2026") {
    this.jwtSecret = jwtSecret;
  }

  public attemptLogin(
    ip: string,
    passwordAttempt: string,
    storage: MockOmniRouteStorageManager,
  ): {
    success: boolean;
    token?: string;
    error?: string;
    locked?: boolean;
  } {
    const now = Date.now();
    const tracker = this.failedAttempts.get(ip);
    if (tracker && tracker.lockedUntil > now) {
      return {
        success: false,
        locked: true,
        error: "Trop de tentatives. IP temporairement verrouillée.",
      };
    }

    if (!passwordAttempt || passwordAttempt.trim().length === 0) {
      return { success: false, error: "Mot de passe obligatoire." };
    }

    const isValid = storage.verifyPassword(passwordAttempt);
    if (!isValid) {
      const count = (tracker?.count || 0) + 1;
      const lockedUntil = count >= this.MAX_ATTEMPTS ? now + this.LOCK_DURATION_MS : 0;
      this.failedAttempts.set(ip, { count, lockedUntil });
      return {
        success: false,
        error: "Identifiants invalides.",
        locked: lockedUntil > 0,
      };
    }

    // Reset failed attempts on success
    this.failedAttempts.delete(ip);
    const token = this.generateToken({ role: "admin", exp: now + 3600000 });
    return { success: true, token };
  }

  public generateToken(payload: { role: string; exp: number }): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto
      .createHmac("sha256", this.jwtSecret)
      .update(`${header}.${body}`)
      .digest("base64url");
    return `${header}.${body}.${sig}`;
  }

  public verifyToken(token: string): { valid: boolean; payload?: any; error?: string } {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return { valid: false, error: "Malformed JWT" };
      const [header, body, sig] = parts;
      const expectedSig = crypto
        .createHmac("sha256", this.jwtSecret)
        .update(`${header}.${body}`)
        .digest("base64url");
      if (sig !== expectedSig) return { valid: false, error: "Invalid signature" };
      const parsedBody = JSON.parse(Buffer.from(body!, "base64url").toString("utf-8"));
      if (parsedBody.exp && parsedBody.exp < Date.now()) {
        return { valid: false, error: "Token expired" };
      }
      return { valid: true, payload: parsedBody };
    } catch {
      return { valid: false, error: "Failed to parse token" };
    }
  }
}

// ============================================================================
// 8. HISTORICAL PREMIUM RUNTIME (FEATURE 8)
// ============================================================================
export class MockHistoricalPremiumRuntime {
  private openRouterCalls: Array<{ model: string; prompt: string; timestamp: number }> = [];

  public async executePremiumTurn(params: {
    systemPrompt: string;
    userPrompt: string;
    mcpTools?: string[];
  }): Promise<{
    content: string;
    model: string;
    inferenceMode: "premium";
    isFree: false;
    tokenCost: number;
    mcpToolsCount: number;
    kvPrefixCached: boolean;
  }> {
    const _isGptOss120b = true;
    const model = "openai/gpt-oss-120b";
    this.openRouterCalls.push({
      model,
      prompt: `${params.systemPrompt}\n${params.userPrompt}`,
      timestamp: Date.now(),
    });

    const has4Blocks =
      params.systemPrompt.includes("[BLOCK_A") ||
      params.systemPrompt.includes("[SYSTEM") ||
      params.systemPrompt.length > 50;

    return {
      content: `[OpenRouter GPT-OSS-120B] Execution completed with high-reasoning accuracy.`,
      model,
      inferenceMode: "premium",
      isFree: false,
      tokenCost: 0.0015,
      mcpToolsCount: params.mcpTools?.length || 40,
      kvPrefixCached: has4Blocks,
    };
  }

  public getCallCount(): number {
    return this.openRouterCalls.length;
  }
}

// ============================================================================
// 9. DOCUMENTATION AUDITOR (FEATURE 11)
// ============================================================================
export class MockDocumentationAuditor {
  public static readonly SENSITIVE_PATTERNS = [
    /ghp_[a-zA-Z0-9]{36}/,
    /sk-[a-zA-Z0-9]{32,}/,
    /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}/,
    /postgres:\/\/.*:.*@.*:.*/,
    /INITIAL_PASSWORD=(?!<)[a-zA-Z0-9_!@#$%^&*]{8,}/,
    /STORAGE_ENCRYPTION_KEY=(?!<)[a-zA-Z0-9_!@#$%^&*]{16,}/,
  ];

  public auditFileContent(
    content: string,
    filePath = "doc.md",
  ): { clean: boolean; leaks: string[] } {
    const leaks: string[] = [];
    for (const pattern of MockDocumentationAuditor.SENSITIVE_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        // Exclude dummy examples and template placeholders
        if (
          !match[0].includes("sk-omniroute-test-key") &&
          !match[0].includes("<") &&
          !match[0].includes("sk-omniroute-example")
        ) {
          leaks.push(
            `Detected potential sensitive credential: ${match[0].slice(0, 10)}... in ${filePath}`,
          );
        }
      }
    }
    return {
      clean: leaks.length === 0,
      leaks,
    };
  }
}
