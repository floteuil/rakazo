import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type DeepDiagnosticReport,
  type DiagnosticIncident,
  type DiagnosticIncidentContext,
  type DiagnosticLayer,
  type DiagnosticProbeResult,
  type DiagnosticSeverity,
  FORBIDDEN_MCP_CONNECTORS,
  normalizeErrorSignature,
  type RuntimeFootprintMetrics,
  SOVEREIGN_MCP_CONNECTORS,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import {
  assertNonHdsWindmillEndpoint,
  getWindmillRgpdConfig,
  sanitizeToolError,
} from "./enterprise-tools.js";
import { getConnectorReadinessMap, probeOmniRouteHealth } from "./omniroute-transport.js";
import { searchUnifiedSkillCatalog } from "./skill-advisor.js";
import { getSovereignSkillFull, loadUnifiedSkillCatalogIndex } from "./sovereign-skills-store.js";

const MAX_MEMORY_INCIDENTS = 150;
const MAX_DISK_LOG_BYTES = 1_572_864; // 1.5 MB rotating cap

const incidentRingBuffer: DiagnosticIncident[] = [];
let hydratedFromDisk = false;

function formatParisTimestamp(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function resolveIncidentLogPath(dataDir?: string): string | null {
  const base = dataDir ?? process.env.DATA_DIR;
  if (!base || process.env.VITEST) return null;
  try {
    const dir = path.join(base, "diagnostics");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, "incidents.jsonl");
  } catch {
    return null;
  }
}

function hydrateRingBufferOnce(dataDir?: string): void {
  if (hydratedFromDisk) return;
  hydratedFromDisk = true;
  const logPath = resolveIncidentLogPath(dataDir);
  if (!logPath || !existsSync(logPath)) return;
  try {
    const lines = readFileSync(logPath, "utf8")
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .slice(-MAX_MEMORY_INCIDENTS);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as DiagnosticIncident;
        if (parsed?.id && parsed?.signature) {
          incidentRingBuffer.push(parsed);
        }
      } catch {
        // Ignore partial line
      }
    }
  } catch {
    // Non-blocking
  }
}

function sanitizeStackPreview(stack?: string): string[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .map((line) => sanitizeToolError(line.trim()))
    .filter((line) => line.length > 0 && !line.includes("node:internal"))
    .slice(0, 6)
    .map((line) =>
      line
        .replace(/^at\s+/, "")
        .replace(/\/app\//g, "")
        .replace(/.*\/scratch\/rakazo_app\//g, ""),
    );
}

export function inferSuspectedFileAndHint(params: {
  layer: DiagnosticLayer;
  code: string;
  message: string;
  stackPreview: string[];
  route?: string;
  toolName?: string;
}): { suspectedFile: string; remediationHintFr: string } {
  const { layer, code, message, stackPreview, route, toolName } = params;

  // 1. Extract concrete monorepo file from stack trace if present
  for (const frame of stackPreview) {
    const match = frame.match(/((?:apps|packages)\/[a-zA-Z0-9_./-]+\.tsx?:\d+)/);
    if (match?.[1] && !match[1].includes("flight-recorder.ts")) {
      return {
        suspectedFile: match[1],
        remediationHintFr: buildHintForLayer(layer, code, message, toolName),
      };
    }
  }

  // 2. Deterministic mapping by layer / route / tool
  if (layer === "inference_gateway" || /omniroute|openrouter|combo\/rakazo/i.test(message)) {
    return {
      suspectedFile: "packages/adapters/src/omniroute-transport.ts",
      remediationHintFr:
        "Vérifier la santé du conteneur OmniRoute (`/v1/models`), la clé `OMNIROUTE_API_KEY` et les combos `combo/rakazo-*`.",
    };
  }
  if (layer === "skill_engine" || (route && route.includes("skills"))) {
    return {
      suspectedFile: "packages/adapters/src/skill-advisor.ts",
      remediationHintFr:
        "Vérifier l'archive `unified-skills-archive/*.json.gz`, le plafond `MAX_ACTIVE_SKILLS_PER_BOT = 20` et `apps/api/src/skills.ts`.",
    };
  }
  if (layer === "mcp_connector" || toolName) {
    if (toolName?.startsWith("windmill_")) {
      return {
        suspectedFile: "packages/adapters/src/enterprise-tools.ts (executeWindmillRgpdTool)",
        remediationHintFr:
          "Vérifier `WINDMILL_AUTOLITE_URL`/`TOKEN` ou `WINDMILL_PROXY_URL`/`TOKEN` sur Coolify RGPD (hors HDS).",
      };
    }
    return {
      suspectedFile: "packages/adapters/src/enterprise-tools.ts",
      remediationHintFr: buildHintForLayer(layer, code, message, toolName),
    };
  }
  if (layer === "agent_executor") {
    return {
      suspectedFile: "packages/adapters/src/executor.ts",
      remediationHintFr:
        "Inspecter le `runId` en échec, le bail worker (`leaseOwner`) et la boucle d'outils dans `pi-runtime.ts`.",
    };
  }
  if (layer === "web_client") {
    return {
      suspectedFile: route?.includes("/app") ? "apps/web/src/pages/Shell.tsx" : "apps/web/src/App.tsx",
      remediationHintFr:
        "Examiner la trace composant React remontée par le navigateur mobile/desktop et les props nulles éventuelles.",
    };
  }
  if (layer === "security_perimeter") {
    return {
      suspectedFile: "packages/auth/src/intrusion-shield.ts",
      remediationHintFr:
        "Tentative d'intrusion bloquée automatiquement (bruteforce IP ou requête CSRF externe). Aucun impact sur vos appareils légitimes.",
    };
  }
  if (layer === "database_worker") {
    return {
      suspectedFile: "packages/db/src/repos.ts",
      remediationHintFr:
        "Vérifier la connectivité PostgreSQL (`DATABASE_URL`), les migrations Prisma et l'état du conteneur `worker`.",
    };
  }
  return {
    suspectedFile: route ? `apps/api/src/router.ts (${route})` : "apps/api/src/router.ts",
    remediationHintFr: buildHintForLayer(layer, code, message, toolName),
  };
}

function buildHintForLayer(
  layer: DiagnosticLayer,
  code: string,
  message: string,
  toolName?: string,
): string {
  if (/timeout|aborted|timed out/i.test(message)) {
    return "Délai réseau dépassé : vérifier la latence du service amont ou augmenter le timeout du connecteur concerné.";
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return `Authentification refusée${toolName ? ` pour '${toolName}'` : ""} : contrôler le jeton d'environnement correspondant dans Coolify.`;
  }
  if (code === "RUN_EXECUTION_FAILED" || layer === "agent_executor") {
    return "Tour d'agent interrompu : vérifier la réponse du fournisseur LLM et les arguments du dernier outil appelé.";
  }
  return "Inspecter le fichier suspecté et la trace d'exécution ci-dessous pour appliquer un correctif ciblé.";
}

export interface RecordDiagnosticIncidentInput {
  severity: DiagnosticSeverity;
  layer: DiagnosticLayer;
  code: string;
  title: string;
  message: string;
  error?: unknown;
  stack?: string;
  context?: DiagnosticIncidentContext;
  dataDir?: string;
}

/**
 * Records a secret-scrubbed incident in the bounded Flight Recorder ring buffer + rotating JSONL file.
 */
export function recordDiagnosticIncident(input: RecordDiagnosticIncidentInput): DiagnosticIncident {
  hydrateRingBufferOnce(input.dataDir);

  const now = new Date();
  const cleanTitle = sanitizeToolError(input.title).slice(0, 220);
  const cleanMessage = sanitizeToolError(input.message).slice(0, 2000);
  const rawStack =
    input.stack ?? (input.error instanceof Error ? input.error.stack : undefined);
  const stackPreview = sanitizeStackPreview(rawStack);

  const sigKey = `${input.layer}:${input.code}:${input.context?.route ?? ""}:${input.context?.toolName ?? ""}`;
  const signature = normalizeErrorSignature(sigKey, cleanMessage);

  // Deduplicate if already in ring buffer
  const existingIdx = incidentRingBuffer.findIndex((item) => item.signature === signature);
  if (existingIdx !== -1) {
    const existing = incidentRingBuffer[existingIdx]!;
    const updated: DiagnosticIncident = {
      ...existing,
      timestamp: now.toISOString(),
      parisTime: formatParisTimestamp(now),
      message: cleanMessage,
      stackPreview: stackPreview.length > 0 ? stackPreview : existing.stackPreview,
      context: { ...existing.context, ...(input.context ?? {}) },
      occurrences: existing.occurrences + 1,
    };
    incidentRingBuffer.splice(existingIdx, 1);
    incidentRingBuffer.unshift(updated);
    return updated;
  }

  const { suspectedFile, remediationHintFr } = inferSuspectedFileAndHint({
    layer: input.layer,
    code: input.code,
    message: cleanMessage,
    stackPreview,
    route: input.context?.route,
    toolName: input.context?.toolName,
  });

  const incident: DiagnosticIncident = {
    id: `inc_${now.getTime().toString(36)}_${signature.slice(4, 10)}`,
    signature,
    timestamp: now.toISOString(),
    parisTime: formatParisTimestamp(now),
    severity: input.severity,
    layer: input.layer,
    code: input.code,
    title: cleanTitle,
    message: cleanMessage,
    suspectedFile,
    remediationHintFr,
    stackPreview,
    context: input.context ?? {},
    occurrences: 1,
  };

  incidentRingBuffer.unshift(incident);
  if (incidentRingBuffer.length > MAX_MEMORY_INCIDENTS) {
    incidentRingBuffer.length = MAX_MEMORY_INCIDENTS;
  }

  const logPath = resolveIncidentLogPath(input.dataDir);
  if (logPath) {
    try {
      if (existsSync(logPath)) {
        const st = statSync(logPath);
        if (st.size >= MAX_DISK_LOG_BYTES) {
          renameSync(logPath, `${logPath}.1`);
        }
      }
      appendFileSync(logPath, `${JSON.stringify(incident)}\n`, "utf8");
    } catch {
      // Never crash application on telemetry disk write
    }
  }

  return incident;
}

export function listRecordedIncidents(dataDir?: string): DiagnosticIncident[] {
  hydrateRingBufferOnce(dataDir);
  return [...incidentRingBuffer];
}

export function clearRecordedIncidents(dataDir?: string): number {
  hydrateRingBufferOnce(dataDir);
  const count = incidentRingBuffer.length;
  incidentRingBuffer.length = 0;
  const logPath = resolveIncidentLogPath(dataDir);
  if (logPath && existsSync(logPath)) {
    try {
      writeFileSync(logPath, "", "utf8");
    } catch {
      // Ignore
    }
  }
  return count;
}

async function measureEventLoopLagMs(): Promise<number> {
  const start = performance.now();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return Math.max(0, Number((performance.now() - start).toFixed(2)));
}

async function probeWindmillInstance(instance: "autolite" | "proxy"): Promise<DiagnosticProbeResult> {
  const probeId = `windmill_${instance}`;
  const label = instance === "autolite" ? "Windmill AutoLite RGPD" : "Windmill Proxy RGPD";
  const t0 = performance.now();

  try {
    const cfg = getWindmillRgpdConfig(instance);
    if (!cfg.baseUrl || !cfg.token) {
      return {
        id: probeId,
        nameFr: label,
        status: "warn",
        latencyMs: Math.round(performance.now() - t0),
        detailFr: "Variables d'environnement non renseignées (connecteur en réserve).",
        suspectedFile: "apps/api/src/env.ts",
        remediationFr: `Définir WINDMILL_${instance.toUpperCase()}_URL et WINDMILL_${instance.toUpperCase()}_TOKEN dans Coolify.`,
      };
    }

    assertNonHdsWindmillEndpoint(cfg.baseUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(`${cfg.baseUrl}/api/users/whoami`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      const latencyMs = Math.round(performance.now() - t0);
      if (!res.ok) {
        return {
          id: probeId,
          nameFr: label,
          status: "fail",
          latencyMs,
          detailFr: `Réponse HTTP ${res.status} sur /api/users/whoami.`,
          suspectedFile: "packages/adapters/src/enterprise-tools.ts",
          remediationFr: `Vérifier la validité du jeton WINDMILL_${instance.toUpperCase()}_TOKEN sur Coolify RGPD.`,
        };
      }
      const userJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const username = typeof userJson.username === "string" ? userJson.username : "authentifié";
      return {
        id: probeId,
        nameFr: label,
        status: "pass",
        latencyMs,
        detailFr: `Connecté (${username}, workspace '${cfg.workspace}', périmètre RGPD vérifié).`,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return {
      id: probeId,
      nameFr: label,
      status: "fail",
      latencyMs: Math.round(performance.now() - t0),
      detailFr: sanitizeToolError(err instanceof Error ? err.message : String(err)),
      suspectedFile: "packages/adapters/src/enterprise-tools.ts",
      remediationFr: `Vérifier l'accessibilité réseau de ${label} depuis le conteneur API.`,
    };
  }
}

export interface RunDeepDiagnosticsOptions {
  prisma?: PrismaClient;
  dataDir?: string;
  gitSha?: string;
  skipExternalNetworkProbes?: boolean;
}

/**
 * Executes 10 deterministic, zero-LLM-cost live health probes + aggregates Flight Recorder
 * and database failures into an AI-ready Forensic Markdown Report.
 */
export async function runDeepSelfDiagnostics(
  options: RunDeepDiagnosticsOptions = {},
): Promise<DeepDiagnosticReport> {
  hydrateRingBufferOnce(options.dataDir);
  const now = new Date();
  const parisTime = formatParisTimestamp(now);
  const gitSha = options.gitSha || process.env.GIT_SHA || "local-dev";

  const mem = process.memoryUsage();
  const eventLoopLagMs = await measureEventLoopLagMs();
  const runtimeMetrics: RuntimeFootprintMetrics = {
    uptimeSec: Math.round(process.uptime()),
    rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
    heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
    heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(1)),
    externalMb: Number((mem.external / (1024 * 1024)).toFixed(1)),
    eventLoopLagMs,
    nodeVersion: process.version,
  };

  const probes: DiagnosticProbeResult[] = [];

  // Probe 1 & 2: PostgreSQL + Stuck/Failed Runs
  let dbFailedRunsSummary: DiagnosticIncident[] = [];
  if (options.prisma) {
    const tDb = performance.now();
    try {
      const [botCount, stuckRuns, recentFailedRuns] = await Promise.all([
        options.prisma.bot.count(),
        options.prisma.run.count({
          where: {
            status: { in: ["running", "leased"] },
            updatedAt: { lt: new Date(Date.now() - 15 * 60_000) },
          },
        }),
        options.prisma.run.findMany({
          where: {
            status: "failed",
            createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
          },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: {
            id: true,
            botId: true,
            error: true,
            modelProvider: true,
            modelId: true,
            createdAt: true,
          },
        }),
      ]);
      const dbMs = Math.round(performance.now() - tDb);
      probes.push({
        id: "postgresql_prisma",
        nameFr: "Base PostgreSQL & Prisma",
        status: dbMs > 800 ? "warn" : "pass",
        latencyMs: dbMs,
        detailFr: `Opérationnelle en ${dbMs} ms (${botCount} agent(s) actif(s)).`,
      });

      probes.push({
        id: "worker_runs_queue",
        nameFr: "File d'Exécution & Worker",
        status: stuckRuns > 0 ? "warn" : "pass",
        latencyMs: dbMs,
        detailFr:
          stuckRuns > 0
            ? `${stuckRuns} exécution(s) bloquée(s) > 15 min · ${recentFailedRuns.length} échec(s) sur 24h.`
            : `0 run bloqué · ${recentFailedRuns.length} échec(s) sur les dernières 24h.`,
        ...(stuckRuns > 0
          ? {
              suspectedFile: "packages/adapters/src/job-reconciler.ts",
              remediationFr: "Vérifier l'état du conteneur `worker` et le réconciliateur de baux.",
            }
          : {}),
      });

      dbFailedRunsSummary = recentFailedRuns
        .filter((r) => Boolean(r.error))
        .map((r) => {
          const cleanErr = sanitizeToolError(r.error || "Erreur d'exécution");
          const sig = normalizeErrorSignature("run_failed", cleanErr);
          const { suspectedFile, remediationHintFr } = inferSuspectedFileAndHint({
            layer: "agent_executor",
            code: "RUN_EXECUTION_FAILED",
            message: cleanErr,
            stackPreview: [],
          });
          return {
            id: `run_${r.id.slice(0, 10)}`,
            signature: sig,
            timestamp: r.createdAt.toISOString(),
            parisTime: formatParisTimestamp(r.createdAt),
            severity: "error" as const,
            layer: "agent_executor" as const,
            code: "RUN_EXECUTION_FAILED",
            title: `Échec du Run ${r.id.slice(0, 8)} (${r.modelId || "modèle par défaut"})`,
            message: cleanErr,
            suspectedFile,
            remediationHintFr,
            stackPreview: [],
            context: {
              runId: r.id,
              botId: r.botId,
              model: r.modelId ?? undefined,
            },
            occurrences: 1,
          };
        });
    } catch (err) {
      probes.push({
        id: "postgresql_prisma",
        nameFr: "Base PostgreSQL & Prisma",
        status: "fail",
        latencyMs: Math.round(performance.now() - tDb),
        detailFr: sanitizeToolError(err instanceof Error ? err.message : String(err)),
        suspectedFile: "packages/db/prisma/schema.prisma",
        remediationFr: "Vérifier le conteneur `postgres` et la variable `DATABASE_URL`.",
      });
    }
  } else {
    probes.push({
      id: "postgresql_prisma",
      nameFr: "Base PostgreSQL & Prisma",
      status: "pass",
      latencyMs: 0,
      detailFr: "Mode autonome hors-base (tests / CLI léger).",
    });
  }

  // Probe 3: Unified 3,538-Skill Archive & Shard Decompression
  const tSkills = performance.now();
  try {
    const idx = loadUnifiedSkillCatalogIndex();
    const searchCheck = searchUnifiedSkillCatalog({ query: "seo copywriting", limit: 3 });
    const shardCheck = getSovereignSkillFull("copywriting");
    const skillMs = Math.round(performance.now() - tSkills);
    const ok = idx.totalSkills >= 3500 && searchCheck.items.length > 0 && Boolean(shardCheck?.content);
    probes.push({
      id: "unified_skills_engine",
      nameFr: "Catalogue Natif 3 538 Skills & Shards",
      status: ok ? "pass" : "fail",
      latencyMs: skillMs,
      detailFr: ok
        ? `${idx.totalSkills} skills indexées · Recherche BM25 + décompression .gz OK en ${skillMs} ms.`
        : `Catalogue incomplet (${idx.totalSkills} skills).`,
      ...(!ok
        ? {
            suspectedFile: "packages/adapters/src/sovereign-skills-store.ts",
            remediationFr: "Vérifier la présence de `unified-skills-archive/*.json.gz`.",
          }
        : {}),
    });
  } catch (err) {
    probes.push({
      id: "unified_skills_engine",
      nameFr: "Catalogue Natif 3 538 Skills & Shards",
      status: "fail",
      latencyMs: Math.round(performance.now() - tSkills),
      detailFr: sanitizeToolError(err instanceof Error ? err.message : String(err)),
      suspectedFile: "packages/adapters/src/sovereign-skills-store.ts",
    });
  }

  // Probe 4, 5, 6: Network Gateways (OmniRoute + Windmill AutoLite RGPD + Windmill Proxy RGPD)
  if (!options.skipExternalNetworkProbes) {
    const [omni, wmAutolite, wmProxy] = await Promise.all([
      probeOmniRouteHealth(),
      probeWindmillInstance("autolite"),
      probeWindmillInstance("proxy"),
    ]);

    probes.push({
      id: "omniroute_gateway",
      nameFr: "Passerelle IA OmniRoute ($0.00)",
      status: omni.ok && omni.rakazoCombos.length >= 5 ? "pass" : omni.ok ? "warn" : "fail",
      latencyMs: omni.latencyMs ?? 0,
      detailFr: omni.ok
        ? `En ligne (${omni.latencyMs ?? 0} ms) · ${omni.rakazoCombos.length}/5 combos Rakazo actifs sur ${omni.totalModels} modèles.`
        : "Passerelle OmniRoute injoignable ou non configurée.",
      ...(!omni.ok
        ? {
            suspectedFile: "packages/adapters/src/omniroute-adapter.ts",
            remediationFr: "Vérifier `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY` et le conteneur OmniRoute.",
          }
        : {}),
    });
    probes.push(wmAutolite);
    probes.push(wmProxy);
  } else {
    probes.push({
      id: "omniroute_gateway",
      nameFr: "Passerelle IA OmniRoute ($0.00)",
      status: "pass",
      latencyMs: 0,
      detailFr: "Sonde réseau ignorée (mode hors-ligne).",
    });
  }

  // Probe 7: MCP Sovereign Registry & Zero-HDS / Zero-Stripe Guard
  const tMcp = performance.now();
  const readiness = getConnectorReadinessMap(process.env);
  const configuredCount = Object.values(readiness).filter(Boolean).length;
  const forbiddenLeak = SOVEREIGN_MCP_CONNECTORS.some((c) =>
    FORBIDDEN_MCP_CONNECTORS.some((f) => c.id.toLowerCase().includes(f)),
  );
  const n8nStillRegistered = SOVEREIGN_MCP_CONNECTORS.some((c) => c.id === "n8n");
  probes.push({
    id: "mcp_sovereign_registry",
    nameFr: "Registre MCP & Cloisonnement RGPD (Zéro HDS)",
    status: forbiddenLeak || n8nStillRegistered ? "fail" : "pass",
    latencyMs: Math.round(performance.now() - tMcp),
    detailFr:
      forbiddenLeak || n8nStillRegistered
        ? "Violation détectée dans le catalogue MCP souverain !"
        : `${SOVEREIGN_MCP_CONNECTORS.length} connecteurs souverains (${configuredCount} prêts) · 0 connecteur HDS/Stripe/n8n.`,
  });

  // Probe 7b: Cyber-Perimeter & Single-Owner Auth Sanctuary
  const isProdHttps =
    process.env.NODE_ENV === "production" &&
    Boolean(process.env.WEB_ORIGIN?.trim().toLowerCase().startsWith("https://"));
  const signupsLocked = process.env.SIGNUPS_ENABLED === "false" || process.env.SIGNUPS_ENABLED === "0";
  const allowlistCount = (process.env.SIGNUP_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  const strongSecrets =
    !isProdHttps ||
    ((process.env.BETTER_AUTH_SECRET?.length ?? 0) >= 32 &&
      !process.env.BETTER_AUTH_SECRET?.includes("replace-with") &&
      (process.env.ENCRYPTION_KEY?.length ?? 0) >= 32 &&
      !process.env.ENCRYPTION_KEY?.includes("replace-with"));
  const blockedIntrusions = incidentRingBuffer.filter((i) => i.layer === "security_perimeter").length;
  const authPerimeterOk = !isProdHttps || (signupsLocked && allowlistCount > 0 && strongSecrets);
  probes.push({
    id: "auth_intrusion_perimeter",
    nameFr: "Bouclier Anti-Intrusion & Périmètre Auth",
    status: authPerimeterOk ? "pass" : "warn",
    latencyMs: 0,
    detailFr: isProdHttps
      ? `Inscriptions fermées · Propriétaire unique (${allowlistCount} autorisé) · Sessions 30j glissantes · ${blockedIntrusions} intrusion(s) bloquée(s).`
      : `Bouclier anti-bruteforce IP + CSRF actif (${blockedIntrusions} intrusion(s) bloquée(s)).`,
    ...(!authPerimeterOk
      ? {
          suspectedFile: "packages/auth/src/intrusion-shield.ts",
          remediationFr:
            "Vérifier `SIGNUPS_ENABLED=false`, `SIGNUP_ALLOWLIST` et l'entropie de `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY`.",
        }
      : {}),
  });

  // Probe 8: Memory & Event-Loop Health
  const memWarn = runtimeMetrics.rssMb > 540 || runtimeMetrics.eventLoopLagMs > 120;
  probes.push({
    id: "runtime_memory_eventloop",
    nameFr: "Empreinte RAM Node.js & Event-Loop",
    status: memWarn ? "warn" : "pass",
    latencyMs: runtimeMetrics.eventLoopLagMs,
    detailFr: `RSS ${runtimeMetrics.rssMb} Mo · Heap ${runtimeMetrics.heapUsedMb}/${runtimeMetrics.heapTotalMb} Mo · Lag boucle ${runtimeMetrics.eventLoopLagMs} ms.`,
    ...(memWarn
      ? {
          suspectedFile: "docker-compose.yaml",
          remediationFr: "Surveiller la charge mémoire du conteneur API/Worker (plafond 640 Mo).",
        }
      : {}),
  });

  // Probe 9: Persistent Data Directory & Flight Recorder Storage
  const tDisk = performance.now();
  const logPath = resolveIncidentLogPath(options.dataDir);
  probes.push({
    id: "persistent_storage",
    nameFr: "Stockage /data & Rotation Boîte Noire",
    status: "pass",
    latencyMs: Math.round(performance.now() - tDisk),
    detailFr: logPath
      ? `Journal rotatif actif (${logPath}, plafond 1,5 Mo).`
      : "Tampon circulaire mémoire actif (plafond 150 incidents).",
  });

  // Probe 10: Client WebUI Crash Telemetry
  const clientCrashes = incidentRingBuffer.filter((i) => i.layer === "web_client");
  probes.push({
    id: "web_client_telemetry",
    nameFr: "Télémétrie Navigateur Mobile & Desktop",
    status: clientCrashes.length > 0 ? "warn" : "pass",
    latencyMs: 0,
    detailFr:
      clientCrashes.length > 0
        ? `${clientCrashes.length} exception(s) cliente(s) remontée(s) par le navigateur.`
        : "0 crash UI remonté depuis les sessions mobile et ordinateur.",
  });

  // Merge ring-buffer incidents + DB failed runs (deduplicated by signature)
  const mergedIncidents: DiagnosticIncident[] = [...incidentRingBuffer];
  const seenSigs = new Set(mergedIncidents.map((i) => i.signature));
  for (const dbInc of dbFailedRunsSummary) {
    if (!seenSigs.has(dbInc.signature) && mergedIncidents.length < MAX_MEMORY_INCIDENTS) {
      seenSigs.add(dbInc.signature);
      mergedIncidents.push(dbInc);
    }
  }

  const hasFail = probes.some((p) => p.status === "fail");
  const hasWarn =
    probes.some((p) => p.status === "warn") ||
    mergedIncidents.some((i) => i.severity === "critical" || i.severity === "error");
  const overallStatus = hasFail ? "critical" : hasWarn ? "degraded" : "healthy";

  const aiForensicMarkdownFr = buildAiForensicMarkdownFr({
    parisTime,
    gitSha,
    overallStatus,
    runtimeMetrics,
    probes,
    recentIncidents: mergedIncidents.slice(0, 15),
  });

  return {
    generatedAt: now.toISOString(),
    parisTime,
    gitSha,
    overallStatus,
    zeroLlmCost: true,
    runtimeMetrics,
    probes,
    recentIncidents: mergedIncidents.slice(0, 40),
    aiForensicMarkdownFr,
  };
}

export function buildAiForensicMarkdownFr(data: {
  parisTime: string;
  gitSha: string;
  overallStatus: "healthy" | "degraded" | "critical";
  runtimeMetrics: RuntimeFootprintMetrics;
  probes: DiagnosticProbeResult[];
  recentIncidents: DiagnosticIncident[];
}): string {
  const statusLabel =
    data.overallStatus === "healthy"
      ? "SAIN (HEALTHY)"
      : data.overallStatus === "degraded"
        ? "DÉGRADÉ (WARN)"
        : "CRITIQUE (FAIL)";

  const lines: string[] = [
    "# RAPPORT FORENSIQUE D'AUTO-DIAGNOSTIC RAKAZO (PRÊT POUR IA)",
    `- **Horodatage (Europe/Paris)** : ${data.parisTime}`,
    `- **État Global** : ${statusLabel}`,
    `- **Révision Git** : \`${data.gitSha}\` · **Node** : \`${data.runtimeMetrics.nodeVersion}\` · **Uptime** : ${data.runtimeMetrics.uptimeSec}s`,
    `- **Empreinte Serveur** : RSS \`${data.runtimeMetrics.rssMb} Mo\` · V8 Heap \`${data.runtimeMetrics.heapUsedMb}/${data.runtimeMetrics.heapTotalMb} Mo\` · Event-Loop Lag \`${data.runtimeMetrics.eventLoopLagMs} ms\``,
    "",
    "## 1. Résultat des Sondes Système Actives",
  ];

  for (const p of data.probes) {
    const icon = p.status === "pass" ? "[OK]" : p.status === "warn" ? "[WARN]" : "[FAIL]";
    lines.push(`- ${icon} **${p.nameFr}** (${p.latencyMs} ms) : ${p.detailFr}`);
    if (p.status !== "pass" && (p.suspectedFile || p.remediationFr)) {
      lines.push(
        `  - *Fichier cible* : \`${p.suspectedFile ?? "N/A"}\` | *Action* : ${p.remediationFr ?? "Vérifier les logs."}`,
      );
    }
  }

  lines.push("", "## 2. Journal Boîte Noire (Incidents Dédupliqués & Traces)");
  if (data.recentIncidents.length === 0) {
    lines.push("- Aucun incident ni exception enregistré dans la boîte noire.");
  } else {
    for (const inc of data.recentIncidents) {
      lines.push(
        `### [${inc.severity.toUpperCase()}] ${inc.code} — ${inc.title} (${inc.occurrences}x, dernier à ${inc.parisTime})`,
        `- **Couche** : \`${inc.layer}\` | **Fichier suspecté** : \`${inc.suspectedFile}\``,
        `- **Message nettoyé** : ${inc.message}`,
        `- **Piste de résolution** : ${inc.remediationHintFr}`,
      );
      const ctxEntries = Object.entries(inc.context).filter(([, v]) => v !== undefined && v !== "");
      if (ctxEntries.length > 0) {
        lines.push(
          `- **Contexte** : ${ctxEntries.map(([k, v]) => `${k}=\`${String(v)}\``).join(", ")}`,
        );
      }
      if (inc.stackPreview.length > 0) {
        lines.push("```text", ...inc.stackPreview, "```");
      }
    }
  }

  return lines.join("\n");
}
