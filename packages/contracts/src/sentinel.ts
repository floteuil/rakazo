/**
 * Module Sentinel — Diagnostic & Santé Zéro-LLM (Inspiré d'OpenMausBot).
 *
 * Analyse les journaux de télémétrie, exécutions et appels d'outils
 * pour générer un bilan de santé des 18 connecteurs MCP souverains
 * et détecter les erreurs répétitives, avec un coût LLM strictement nul ($0.00).
 */

import { SOVEREIGN_MCP_CONNECTORS } from "./mcp-catalog.js";

export type SentinelSeverity = "low" | "medium" | "high";
export type SentinelIssueKind =
  | "tool_error"
  | "timeout"
  | "model_error"
  | "rate_limit"
  | "network_error";

export interface SentinelIssue {
  sig: string;
  kind: SentinelIssueKind;
  title: string;
  tool?: string;
  connectorId?: string;
  count: number;
  lastAt: string;
  severity: SentinelSeverity;
  wastedTurns: number;
}

export interface SentinelConnectorHealth {
  connectorId: string;
  name: string;
  status: "healthy" | "degraded" | "down";
  totalCalls: number;
  failedCalls: number;
  successRate: number; // 0 - 100
  avgLatencyMs: number;
  lastError?: string;
}

export interface SentinelReport {
  timestamp: string;
  totalScanned: number;
  totalFailures: number;
  zeroLlmCost: true;
  connectorHealth: Record<string, SentinelConnectorHealth>;
  issues: SentinelIssue[];
  healthyCount: number;
  degradedCount: number;
}

/**
 * Normalise un message d'erreur pour créer une signature reproductible
 * sans exposer de données sensibles (chemins, UUIDs, tokens, adresses IP).
 */
export function normalizeErrorSignature(toolName: string, error: string): string {
  if (!error) return `sig_${toolName || "unknown"}_empty`;
  const clean = error
    .replace(
      /(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g,
      "<uuid>",
    )
    .replace(/0x[0-9a-fA-F]+/g, "<hex>")
    .replace(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/g, "<ip>")
    .replace(/(?:\/[a-zA-Z0-9_.-]+)+/g, "<path>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/bearer\s+[a-zA-Z0-9_.-]+/gi, "bearer <redacted>")
    .toLowerCase()
    .trim();

  // Hash FNV-1a simple et rapide
  let hash = 0x811c9dc5;
  const str = `${toolName}:${clean}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `sig_${(hash >>> 0).toString(16)}`;
}

/**
 * Normalise un titre d'erreur pour affichage synthétique (140 caractères max).
 */
export function normalizeErrorTitle(error: string): string {
  if (!error) return "Erreur inconnue";
  return error
    .replace(/\s+/g, " ")
    .replace(/(?:\/[a-zA-Z0-9_.-]+)+/g, "<chemin>")
    .slice(0, 140)
    .trim();
}

/**
 * Identifie le connecteur MCP propriétaire d'un outil donné.
 */
export function findConnectorForTool(toolName: string): string | undefined {
  if (!toolName) return undefined;
  for (const conn of SOVEREIGN_MCP_CONNECTORS) {
    if (
      conn.id === toolName ||
      conn.slug === toolName ||
      toolName.startsWith(conn.id) ||
      toolName.startsWith(conn.slug) ||
      conn.tools.some((t) => t.name === toolName || toolName.startsWith(`${conn.id}_`))
    ) {
      return conn.id;
    }
  }
  // Correspondance par mot-clé racine (ex: 'searxng_scraperr_search' -> 'searxng_scraperr')
  for (const conn of SOVEREIGN_MCP_CONNECTORS) {
    const root = conn.id.split("_")[0];
    if (root && (toolName.includes(root) || conn.id.includes(toolName))) {
      return conn.id;
    }
  }
  return undefined;
}

export interface TelemetryLogEntry {
  toolName?: string;
  ok: boolean;
  error?: string;
  latencyMs?: number;
  timestamp?: string | Date;
}

/**
 * Moteur d'analyse Sentinel : compile le rapport de santé des 18 MCP
 * à partir des logs récents, avec 0 token consommé.
 */
export function analyzeSentinelTelemetry(logs: readonly TelemetryLogEntry[]): SentinelReport {
  const issuesMap = new Map<string, SentinelIssue>();
  const connectorStats: Record<
    string,
    { total: number; failed: number; latencySum: number; lastError?: string }
  > = {};

  // Initialise les 18 connecteurs souverains
  for (const conn of SOVEREIGN_MCP_CONNECTORS) {
    connectorStats[conn.id] = { total: 0, failed: 0, latencySum: 0 };
  }

  let totalFailures = 0;

  for (const log of logs) {
    const toolName = log.toolName || "tool_general";
    const connectorId = findConnectorForTool(toolName) || "system";

    if (!connectorStats[connectorId]) {
      connectorStats[connectorId] = { total: 0, failed: 0, latencySum: 0 };
    }
    const stat = connectorStats[connectorId]!;
    stat.total += 1;
    stat.latencySum += log.latencyMs ?? 50;

    if (!log.ok) {
      stat.failed += 1;
      totalFailures += 1;
      const rawError = log.error || "Échec d'exécution de l'outil";
      stat.lastError = rawError;

      const sig = normalizeErrorSignature(toolName, rawError);
      const isTimeout = /timeout|délai/i.test(rawError);
      const isRateLimit = /429|quota|rate limit/i.test(rawError);
      const kind: SentinelIssueKind = isTimeout
        ? "timeout"
        : isRateLimit
          ? "rate_limit"
          : "tool_error";

      const existing = issuesMap.get(sig);
      if (existing) {
        existing.count += 1;
        existing.wastedTurns += 1;
        existing.lastAt = log.timestamp
          ? new Date(log.timestamp).toISOString()
          : new Date().toISOString();
        if (existing.count >= 5) existing.severity = "high";
        else if (existing.count >= 2) existing.severity = "medium";
      } else {
        issuesMap.set(sig, {
          sig,
          kind,
          title: normalizeErrorTitle(rawError),
          tool: toolName,
          connectorId,
          count: 1,
          wastedTurns: 1,
          lastAt: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
          severity: "low",
        });
      }
    }
  }

  const connectorHealth: Record<string, SentinelConnectorHealth> = {};
  let healthyCount = 0;
  let degradedCount = 0;

  for (const conn of SOVEREIGN_MCP_CONNECTORS) {
    const stat = connectorStats[conn.id] ?? { total: 0, failed: 0, latencySum: 0 };
    const successRate =
      stat.total > 0 ? Math.round(((stat.total - stat.failed) / stat.total) * 100) : 100;
    const avgLatencyMs = stat.total > 0 ? Math.round(stat.latencySum / stat.total) : 0;

    let status: "healthy" | "degraded" | "down" = "healthy";
    if (stat.total > 0 && successRate < 50) {
      status = "down";
      degradedCount += 1;
    } else if (stat.total > 0 && successRate < 90) {
      status = "degraded";
      degradedCount += 1;
    } else {
      healthyCount += 1;
    }

    connectorHealth[conn.id] = {
      connectorId: conn.id,
      name: conn.name,
      status,
      totalCalls: stat.total,
      failedCalls: stat.failed,
      successRate,
      avgLatencyMs,
      lastError: stat.lastError,
    };
  }

  const sortedIssues = Array.from(issuesMap.values()).sort((a, b) => b.count - a.count);

  return {
    timestamp: new Date().toISOString(),
    totalScanned: logs.length,
    totalFailures,
    zeroLlmCost: true,
    connectorHealth,
    issues: sortedIssues,
    healthyCount,
    degradedCount,
  };
}
