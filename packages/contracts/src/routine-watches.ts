/**
 * Routines « Silencieuses par Défaut » à Détection de Delta, Heures Calmes & Run Track
 * (Inspiré de schedule_record_observation, Quiet Hours et Run Track de n8n-io/nod).
 *
 * Fonctionnalités :
 *  1. Baseline d'observation (`RoutineObservationRecord`) : permet à une routine de veille
 *     d'enregistrer une valeur vérifiée (`verified`) et de comparer son empreinte normalisée
 *     avec l'exécution précédente. Si rien n'a changé, la routine reste 100 % silencieuse
 *     (`shouldStayQuiet: true` -> `NO_SIGNAL`). Une source indisponible (`unavailable`) n'écrase
 *     jamais la dernière baseline valide.
 *  2. Heures Calmes (`QuietHoursPolicy`, défaut 22h00 -> 08h00 Europe/Paris) : retient les
 *     notifications mobiles/push non urgentes la nuit sans empêcher l'enregistrement du travail.
 *  3. Bandeau de Rattrapage (`buildRoutineRunTrackBannerFr`) : écrit de façon déterministe par
 *     le serveur lorsqu'une exécution planifiée démarre avec plus de 10 minutes de retard.
 */

export type RoutineObservationStatus = "verified" | "unavailable";

export interface RoutineObservationInput {
  watchKey: string;
  status: RoutineObservationStatus;
  sourceUrl?: string;
  value: string | null;
  summary: string;
  observedAt?: string;
}

export interface RoutineObservationRecord {
  watchKey: string;
  status: RoutineObservationStatus;
  sourceUrl: string;
  /** Dernière valeur vérifiée conservée comme référence de comparaison. */
  baselineValue: string | null;
  /** Empreinte normalisée déterministe FNV-1a 64-bit hex de `baselineValue`. */
  baselineFingerprint: string | null;
  lastSummary: string;
  lastVerifiedAt: string | null;
  lastCheckedAt: string;
  consecutiveUnchangedCount: number;
}

export interface RoutineDeltaDecision {
  changed: boolean;
  shouldStayQuiet: boolean;
  reason: "initial_baseline" | "value_changed" | "unchanged" | "source_unavailable";
  previousValue: string | null;
  currentValue: string | null;
  updatedRecord: RoutineObservationRecord;
  agentDirectiveFr: string;
}

/** Seuil de retard (10 minutes) au-delà duquel le serveur affiche un bandeau factuel Run Track. */
export const ROUTINE_LATE_START_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Empreinte déterministe rapide (double FNV-1a) utilisable aussi bien côté navigateur que Node.js
 * sans dépendance native.
 */
export function computeObservationFingerprint(rawValue: string): string {
  const normalized = rawValue.trim().replace(/\s+/g, " ");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Normalise une clé d'observation pour stockage sécurisé dans `MemoryStore`.
 */
export function normalizeWatchKey(rawKey: string): string {
  const clean = (rawKey || "default")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return clean || "default";
}

/**
 * Compare une nouvelle observation de routine avec la baseline précédente et produit
 * à la fois l'enregistrement mis à jour et la consigne stricte (`NO_SIGNAL` ou alerte de delta).
 */
export function evaluateRoutineObservationDelta(
  previous: RoutineObservationRecord | null | undefined,
  input: RoutineObservationInput,
): RoutineDeltaDecision {
  const nowIso = input.observedAt ?? new Date().toISOString();
  const watchKey = normalizeWatchKey(input.watchKey);
  const safeUrl = (input.sourceUrl ?? previous?.sourceUrl ?? "").trim().slice(0, 500);
  const safeSummary = (input.summary ?? "").trim().slice(0, 1_000);

  if (input.status === "unavailable" || input.value === null || input.value === undefined) {
    const updatedRecord: RoutineObservationRecord = {
      watchKey,
      status: "unavailable",
      sourceUrl: safeUrl,
      // Règle d'or de Nod : une lecture indisponible n'écrase JAMAIS la dernière valeur vérifiée !
      baselineValue: previous?.baselineValue ?? null,
      baselineFingerprint: previous?.baselineFingerprint ?? null,
      lastSummary: safeSummary || "Source temporairement indisponible",
      lastVerifiedAt: previous?.lastVerifiedAt ?? null,
      lastCheckedAt: nowIso,
      consecutiveUnchangedCount: previous?.consecutiveUnchangedCount ?? 0,
    };
    return {
      changed: false,
      shouldStayQuiet: true,
      reason: "source_unavailable",
      previousValue: previous?.baselineValue ?? null,
      currentValue: null,
      updatedRecord,
      agentDirectiveFr:
        "Source temporairement indisponible : l'ancienne valeur de référence est préservée intacte. Répondez uniquement « NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui. » sauf si une panne prolongée exige d'alerter l'utilisateur.",
    };
  }

  const trimmedVal = String(input.value).trim();
  const nextFingerprint = computeObservationFingerprint(trimmedVal);

  if (!previous || previous.baselineFingerprint === null) {
    const updatedRecord: RoutineObservationRecord = {
      watchKey,
      status: "verified",
      sourceUrl: safeUrl,
      baselineValue: trimmedVal,
      baselineFingerprint: nextFingerprint,
      lastSummary: safeSummary,
      lastVerifiedAt: nowIso,
      lastCheckedAt: nowIso,
      consecutiveUnchangedCount: 0,
    };
    return {
      changed: true,
      shouldStayQuiet: false,
      reason: "initial_baseline",
      previousValue: null,
      currentValue: trimmedVal,
      updatedRecord,
      agentDirectiveFr: `Référence initiale enregistrée pour '${watchKey}' (${trimmedVal}). Présentez ce premier relevé concis à l'utilisateur ; les prochains contrôles resteront silencieux tant que cette valeur ne changera pas.`,
    };
  }

  if (previous.baselineFingerprint === nextFingerprint) {
    const updatedRecord: RoutineObservationRecord = {
      watchKey,
      status: "verified",
      sourceUrl: safeUrl,
      baselineValue: previous.baselineValue,
      baselineFingerprint: previous.baselineFingerprint,
      lastSummary: safeSummary || previous.lastSummary,
      lastVerifiedAt: nowIso,
      lastCheckedAt: nowIso,
      consecutiveUnchangedCount: (previous.consecutiveUnchangedCount ?? 0) + 1,
    };
    return {
      changed: false,
      shouldStayQuiet: true,
      reason: "unchanged",
      previousValue: previous.baselineValue,
      currentValue: trimmedVal,
      updatedRecord,
      agentDirectiveFr: `AUCUN CHANGEMENT détecté pour '${watchKey}' (valeur stable : ${trimmedVal}, ${updatedRecord.consecutiveUnchangedCount} vérification(s) consécutive(s) identique(s)). Répondez impérativement « NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui. » pour rester silencieux.`,
    };
  }

  const updatedRecord: RoutineObservationRecord = {
    watchKey,
    status: "verified",
    sourceUrl: safeUrl,
    baselineValue: trimmedVal,
    baselineFingerprint: nextFingerprint,
    lastSummary: safeSummary,
    lastVerifiedAt: nowIso,
    lastCheckedAt: nowIso,
    consecutiveUnchangedCount: 0,
  };

  return {
    changed: true,
    shouldStayQuiet: false,
    reason: "value_changed",
    previousValue: previous.baselineValue,
    currentValue: trimmedVal,
    updatedRecord,
    agentDirectiveFr: `CHANGEMENT DÉTECTÉ sur '${watchKey}' : passage de « ${previous.baselineValue} » à « ${trimmedVal} ». Signalez clairement cet écart précis et sa source à l'utilisateur.`,
  };
}

// ============================================================================
// 2. HEURES CALMES (« QUIET HOURS » — DÉFAUT 22:00 -> 08:00 EUROPE/PARIS)
// ============================================================================

export interface QuietHoursPolicy {
  enabled: boolean;
  /** Heure de début au format `HH:MM` (24h), défaut `"22:00"`. */
  startTime: string;
  /** Heure de fin au format `HH:MM` (24h), défaut `"08:00"`. */
  endTime: string;
  /** Fuseau horaire IANA, défaut `"Europe/Paris"`. */
  timeZone: string;
}

export const DEFAULT_QUIET_HOURS_POLICY: QuietHoursPolicy = {
  enabled: true,
  startTime: "22:00",
  endTime: "08:00",
  timeZone: "Europe/Paris",
};

function parseHhMmToMinutes(hhmm: string, fallbackMinutes: number): number {
  const m = (hhmm || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallbackMinutes;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallbackMinutes;
  return h * 60 + min;
}

/**
 * Détermine si un instant donné tombe pendant les Heures Calmes de l'utilisateur
 * dans son fuseau horaire local (gère les plages nocturnes à cheval sur minuit, ex. 22:00 -> 08:00).
 */
export function isWithinQuietHours(
  now: Date = new Date(),
  policy: Partial<QuietHoursPolicy> = DEFAULT_QUIET_HOURS_POLICY,
): boolean {
  const effective: QuietHoursPolicy = {
    ...DEFAULT_QUIET_HOURS_POLICY,
    ...policy,
  };
  if (!effective.enabled) return false;

  const startMinutes = parseHhMmToMinutes(effective.startTime, 22 * 60);
  const endMinutes = parseHhMmToMinutes(effective.endTime, 8 * 60);
  if (startMinutes === endMinutes) return false;

  let localHour = 0;
  let localMinute = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: effective.timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    localHour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    localMinute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  } catch {
    localHour = now.getUTCHours();
    localMinute = now.getUTCMinutes();
  }

  const currentMinutes = localHour * 60 + localMinute;
  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
  // Plage nocturne traversant minuit (ex. 22:00 -> 08:00)
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

// ============================================================================
// 3. BANDEAU DÉTERMINISTE « RUN TRACK » POUR EXÉCUTIONS PLANIFIÉES RETARDÉES
// ============================================================================

function formatClockHhMmInTz(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

/**
 * Génère un en-tête factuel rédigé par le serveur (jamais par le modèle) lorsqu'une routine
 * démarre avec plus de 10 minutes de retard ou après des créneaux ignorés.
 * Retourne `null` si l'exécution est ponctuelle (écart ≤ 10 min et 0 créneau sauté).
 */
export function buildRoutineRunTrackBannerFr(params: {
  scheduledFor: Date;
  startedAt: Date;
  skippedRunsCount?: number;
  timeZone?: string;
}): string | null {
  const tz = params.timeZone || "Europe/Paris";
  const delayMs = params.startedAt.getTime() - params.scheduledFor.getTime();
  const skipped = Math.max(0, Math.floor(params.skippedRunsCount ?? 0));

  if (delayMs <= ROUTINE_LATE_START_THRESHOLD_MS && skipped === 0) {
    return null;
  }

  const dueStr = formatClockHhMmInTz(params.scheduledFor, tz);
  const startStr = formatClockHhMmInTz(params.startedAt, tz);
  const skippedLabel =
    skipped === 0
      ? ""
      : skipped >= 100
        ? " · 100 créneaux intermédiaires ou plus ignorés"
        : ` · ${skipped} créneau${skipped > 1 ? "x" : ""} intermédiaire${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}`;

  return `> ◷ **Suivi d'exécution** : prévue à ${dueStr}, exécutée à ${startStr}${skippedLabel}.`;
}
