/**
 * Bouclier Anti-Intrusion Serveur Invisible (`AuthIntrusionShield`)
 *
 * Conçu pour protéger une instance personnelle Rakazo exposée sur Internet (mobile 4G/5G + desktop)
 * avec ZÉRO friction utilisateur et ZÉRO régression fonctionnelle :
 * 1. Extraction d'IP cliente résistante à l'usurpation `X-Forwarded-For` derrière Traefik & proxy Vite.
 * 2. Protection anti-bruteforce progressive PAR IP (6 échecs / 10 min -> ban IP 15 min -> 1 h -> 6 h)
 *    sans jamais verrouiller le compte propriétaire sur ses autres appareils (téléphone / Mac).
 * 3. Réinitialisation immédiate du compteur d'échecs de l'IP dès qu'une connexion réussit.
 * 4. Garde CSRF `Origin` & `Sec-Fetch-Site` sur toutes les mutations sensibles.
 * 5. En-tête `Content-Security-Policy` calibré préservant 100 % des fonctionnalités (SSE, Voix,
 *    WebSockets, noVNC, `SandboxedArtifactModal`, `N8nWorkflowCanvas`).
 */

const MAX_TRACKED_IPS = 4_096;
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FAILURES_BEFORE_BAN = 6;
const STRIKE_RESET_MS = 24 * 60 * 60 * 1000; // 24 hours
const BAN_DURATIONS_MS = [
  15 * 60 * 1000, // 1er palier : 15 minutes
  60 * 60 * 1000, // 2e palier : 1 heure
  6 * 60 * 60 * 1000, // 3e+ palier : 6 heures
] as const;

export const HARDENED_CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: ws:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export function isHttpsProductionOrigin(
  webOrigin: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "production" && Boolean(webOrigin?.trim().toLowerCase().startsWith("https://"));
}

/**
 * Détecte si une adresse IPv4 ou IPv6 appartient à une boucle locale ou un réseau interne Docker/RFC-1918.
 */
export function isPrivateOrLoopbackIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^::ffff:/, "");
  if (!ip) return true;
  if (ip === "localhost" || ip === "::1" || ip.startsWith("127.")) return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  const m172 = /^172\.(\d{1,3})\./.exec(ip);
  if (m172) {
    const secondOctet = Number(m172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

function sanitizeIpToken(candidate: string): string {
  const trimmed = candidate.trim();
  if (!trimmed) return "";
  // Strip IPv4:port if present while preserving IPv6
  if (trimmed.includes(".") && trimmed.includes(":") && !trimmed.startsWith("[")) {
    return trimmed.split(":")[0]?.trim() ?? "";
  }
  return trimmed.replace(/^\[|\]$/g, "").slice(0, 64);
}

/**
 * Extrait l'IP cliente publique réelle de manière résistante au spoofing d'en-tête `X-Forwarded-For`.
 * Parcours de droite à gauche en ignorant les sauts internes Docker (`web` -> `api`), ce qui garantit
 * qu'un attaquant envoyant un faux `X-Forwarded-For: 1.2.3.4` est identifié par la vraie IP TCP ajoutée par Traefik.
 */
export function extractSpoofProofClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map(sanitizeIpToken)
      .filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]!;
      if (!isPrivateOrLoopbackIp(hop)) {
        return hop;
      }
    }
    const xReal = sanitizeIpToken(headers.get("x-real-ip") ?? "");
    if (xReal && !isPrivateOrLoopbackIp(xReal)) {
      return xReal;
    }
    if (hops.length > 0) {
      return hops[hops.length - 1]!;
    }
  }

  const xReal = sanitizeIpToken(headers.get("x-real-ip") ?? "");
  if (xReal) return xReal;

  const cfIp = sanitizeIpToken(headers.get("cf-connecting-ip") ?? "");
  if (cfIp) return cfIp;

  return "local";
}

/**
 * Masque le dernier segment d'une adresse IP pour la journalisation conforme RGPD dans la Boîte Noire.
 */
export function maskIpForAudit(ip: string): string {
  const clean = ip.trim();
  if (!clean || clean === "local") return "local";
  const v4 = clean.replace(/^::ffff:/i, "");
  const parts = v4.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  if (clean.includes(":")) {
    return `${clean.split(":").slice(0, 3).join(":")}::xxxx`;
  }
  return "masked-ip";
}

export function isSensitiveAuthMutation(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const p = pathname.toLowerCase();
  return (
    p.includes("/sign-in") ||
    p.includes("/sign-up") ||
    p.includes("/forget-password") ||
    p.includes("/forgot-password") ||
    p.includes("/reset-password") ||
    p.includes("/two-factor") ||
    p.includes("/email-otp") ||
    p.includes("/magic-link")
  );
}

interface IpAttemptRecord {
  failures: number[];
  bannedUntilMs: number;
  strikeCount: number;
  lastActivityMs: number;
}

export interface PreAuthVerdict {
  allowed: boolean;
  retryAfterSec: number;
  strikeCount: number;
}

export interface PostAuthVerdict {
  newlyBanned: boolean;
  retryAfterSec: number;
  strikeCount: number;
  recentFailures: number;
}

export interface IntrusionShieldTelemetry {
  trackedIps: number;
  activeBannedIps: number;
  totalBlockedRequests: number;
  totalBansIssued: number;
  lastBanAtIso: string | null;
}

export class AuthIntrusionShield {
  private readonly records = new Map<string, IpAttemptRecord>();
  private totalBlockedRequests = 0;
  private totalBansIssued = 0;
  private lastBanAtIso: string | null = null;

  private pruneIfNeeded(nowMs: number): void {
    if (this.records.size < MAX_TRACKED_IPS) return;
    for (const [ip, rec] of this.records) {
      if (rec.bannedUntilMs <= nowMs && nowMs - rec.lastActivityMs > FAILURE_WINDOW_MS) {
        this.records.delete(ip);
      }
      if (this.records.size < MAX_TRACKED_IPS * 0.85) break;
    }
    while (this.records.size >= MAX_TRACKED_IPS) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey === undefined) break;
      this.records.delete(oldestKey);
    }
  }

  evaluatePreAuth(ip: string, nowMs: number = Date.now()): PreAuthVerdict {
    const key = ip || "local";
    const rec = this.records.get(key);
    if (!rec) {
      return { allowed: true, retryAfterSec: 0, strikeCount: 0 };
    }
    if (rec.bannedUntilMs > nowMs) {
      this.totalBlockedRequests += 1;
      const retryAfterSec = Math.max(1, Math.ceil((rec.bannedUntilMs - nowMs) / 1000));
      return {
        allowed: false,
        retryAfterSec,
        strikeCount: rec.strikeCount,
      };
    }
    return { allowed: true, retryAfterSec: 0, strikeCount: rec.strikeCount };
  }

  recordAuthOutcome(ip: string, succeeded: boolean, nowMs: number = Date.now()): PostAuthVerdict {
    const key = ip || "local";

    if (succeeded) {
      // Connexion légitime réussie : purge immédiate des erreurs de frappe éventuelles pour cette IP
      this.records.delete(key);
      return { newlyBanned: false, retryAfterSec: 0, strikeCount: 0, recentFailures: 0 };
    }

    this.pruneIfNeeded(nowMs);
    const existing = this.records.get(key);
    const baseStrike =
      existing && nowMs - existing.lastActivityMs <= STRIKE_RESET_MS ? existing.strikeCount : 0;
    const recentFailures = (existing?.failures ?? []).filter((t) => nowMs - t <= FAILURE_WINDOW_MS);
    recentFailures.push(nowMs);

    const nextRec: IpAttemptRecord = {
      failures: recentFailures,
      bannedUntilMs: existing?.bannedUntilMs && existing.bannedUntilMs > nowMs ? existing.bannedUntilMs : 0,
      strikeCount: baseStrike,
      lastActivityMs: nowMs,
    };

    let newlyBanned = false;
    let retryAfterSec = 0;

    if (recentFailures.length >= MAX_FAILURES_BEFORE_BAN && nextRec.bannedUntilMs <= nowMs) {
      nextRec.strikeCount = baseStrike + 1;
      const tierIdx = Math.min(nextRec.strikeCount - 1, BAN_DURATIONS_MS.length - 1);
      const banMs = BAN_DURATIONS_MS[tierIdx]!;
      nextRec.bannedUntilMs = nowMs + banMs;
      nextRec.failures = [];
      newlyBanned = true;
      retryAfterSec = Math.ceil(banMs / 1000);
      this.totalBansIssued += 1;
      this.lastBanAtIso = new Date(nowMs).toISOString();
    }

    // Réinsertion en fin de Map pour maintenir l'ordre LRU
    this.records.delete(key);
    this.records.set(key, nextRec);

    return {
      newlyBanned,
      retryAfterSec,
      strikeCount: nextRec.strikeCount,
      recentFailures: recentFailures.length,
    };
  }

  getTelemetry(nowMs: number = Date.now()): IntrusionShieldTelemetry {
    let activeBannedIps = 0;
    for (const rec of this.records.values()) {
      if (rec.bannedUntilMs > nowMs) activeBannedIps += 1;
    }
    return {
      trackedIps: this.records.size,
      activeBannedIps,
      totalBlockedRequests: this.totalBlockedRequests,
      totalBansIssued: this.totalBansIssued,
      lastBanAtIso: this.lastBanAtIso,
    };
  }

  clear(): void {
    this.records.clear();
    this.totalBlockedRequests = 0;
    this.totalBansIssued = 0;
    this.lastBanAtIso = null;
  }
}

export const globalAuthIntrusionShield = new AuthIntrusionShield();

export interface CsrfCheckResult {
  allowed: boolean;
  reason?: "untrusted_origin" | "cross_site_cookie_mutation";
  origin?: string;
}

/**
 * Vérifie qu'une requête mutante (`POST`, `PUT`, `PATCH`, `DELETE`) ne provient pas
 * d'un site tiers malveillant tentant d'exploiter les cookies de session (CSRF).
 * N'entrave jamais Safari/Chrome mobile, desktop, PWA, Electron ni les appels `Authorization: Bearer`.
 */
export function evaluateCsrfRequestSafety(
  request: Request,
  isOriginTrusted: (origin: string) => boolean,
  httpsProduction: boolean,
): CsrfCheckResult {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return { allowed: true };
  }

  const origin = request.headers.get("origin")?.trim();
  if (origin && origin !== "null") {
    if (!isOriginTrusted(origin)) {
      return { allowed: false, reason: "untrusted_origin", origin };
    }
    return { allowed: true };
  }

  // En production HTTPS, bloque les requêtes navigateur cross-site sans Origin valide portant un Cookie
  if (httpsProduction) {
    const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
    const hasCookie = Boolean(request.headers.get("cookie")?.trim());
    const hasBearer = Boolean(
      request.headers.get("authorization")?.trim().toLowerCase().startsWith("bearer "),
    );
    if (secFetchSite === "cross-site" && hasCookie && !hasBearer) {
      return { allowed: false, reason: "cross_site_cookie_mutation", origin: origin ?? "cross-site" };
    }
  }

  return { allowed: true };
}
