/**
 * Micro-Optimisations Chirurgicales du Runtime Pi & des Schémas MCP
 * (Inspiré de src/runtime/time-context.ts, src/shared/json-schema.ts et agent-runtime.md de n8n-io/nod).
 *
 * Contient 3 briques déterministes zéro-LLM :
 *  1. Annotation automatique des horodatages ISO-8601 (UTC / décalages numériques) vers le fuseau
 *     local de l'utilisateur (par défaut `Europe/Paris`, gestion exacte heure d'hiver CET / été CEST),
 *     limitée à 32 instants uniques et ignorant les dates seules (`YYYY-MM-DD`).
 *  2. Normalisation JSON Schema Draft 2020-12 à la volée pour prévenir tout rejet HTTP 400 chez
 +     Anthropic, Gemini, OpenAI ou OpenRouter sur des schémas MCP complexes + indexation paresseuse.
 *  3. Classification fine des erreurs fournisseurs pour interdire toute compaction destructive
 *     de contexte lorsqu'un provider renvoie un `429 Rate Limit`, `402 Quota` ou erreur serveur
 *     mentionnant le mot « tokens ».
 */

const ISO_INSTANT_WITH_OFFSET_RE =
  /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))\b/gi;

const MAX_TRAVERSAL_NODES = 10_000;
export const DEFAULT_LOCAL_TIMEZONE = "Europe/Paris";
export const MAX_ANNOTATED_TIMESTAMPS = 32;

/**
 * Formate un objet `Date` valide vers une chaîne ISO locale lisible avec décalage exact
 * dans le fuseau horaire demandé (ex. `2026-11-21T15:30:00+01:00` en hiver, `+02:00` en été).
 */
export function formatInstantInTimeZone(date: Date, timeZone = DEFAULT_LOCAL_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });

  const parts = formatter.formatToParts(date);
  const byType: Record<string, string> = {};
  for (const p of parts) {
    byType[p.type] = p.value;
  }

  const rawOffset = byType.timeZoneName ?? "GMT";
  let offset = "+00:00";
  if (rawOffset === "GMT" || rawOffset === "UTC") {
    offset = "+00:00";
  } else {
    const m = rawOffset.match(/([+-]\d{1,2})(?::?(\d{2}))?/);
    if (m) {
      const sign = m[1]!.startsWith("-") ? "-" : "+";
      const hh = m[1]!.replace(/^[+-]/, "").padStart(2, "0");
      const mm = (m[2] ?? "00").padStart(2, "0");
      offset = `${sign}${hh}:${mm}`;
    }
  }

  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}:${byType.second}${offset}`;
}

/**
 * Vérifie qu'une chaîne ISO-8601 correspond à une vraie date calendaire (rejette ex. `2026-02-31`).
 */
function parseValidIsoInstant(isoCandidate: string): Date | null {
  const datePart = isoCandidate.slice(0, 10);
  const calendarCheck = new Date(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(calendarCheck.getTime())) return null;
  if (calendarCheck.toISOString().slice(0, 10) !== datePart) return null;

  const parsed = new Date(isoCandidate);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed;
}

/**
 * Extrait jusqu'à `maxCount` horodatages avec fuseau (`Z` ou `±HH:MM`) depuis un résultat d'outil
 * (chaîne, JSON sérialisé ou objet imbriqué) et génère une ligne d'équivalences locales déterministes.
 * Les dates pures (`YYYY-MM-DD`) et les heures sans décalage ne sont jamais converties.
 */
export function annotateLocalTimestamps(
  payload: unknown,
  timeZone = DEFAULT_LOCAL_TIMEZONE,
  maxCount = MAX_ANNOTATED_TIMESTAMPS,
): string {
  if (!timeZone || payload === null || payload === undefined) return "";

  // Validation rapide du fuseau horaire
  try {
    Intl.DateTimeFormat("fr-FR", { timeZone });
  } catch {
    return "";
  }

  const stack: unknown[] = [payload];
  const conversions = new Map<string, string>();
  let visited = 0;

  while (stack.length > 0 && visited < MAX_TRAVERSAL_NODES && conversions.size < maxCount) {
    const current = stack.pop();
    visited++;

    if (typeof current === "string") {
      ISO_INSTANT_WITH_OFFSET_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while (
        (match = ISO_INSTANT_WITH_OFFSET_RE.exec(current)) !== null &&
        conversions.size < maxCount
      ) {
        const rawIso = match[1]!;
        if (conversions.has(rawIso)) continue;
        const validDate = parseValidIsoInstant(rawIso);
        if (!validDate) continue;
        conversions.set(rawIso, formatInstantInTimeZone(validDate, timeZone));
      }
    } else if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0 && stack.length < MAX_TRAVERSAL_NODES; i--) {
        stack.push(current[i]);
      }
    } else if (typeof current === "object" && current !== null) {
      const values = Object.values(current as Record<string, unknown>);
      for (let i = values.length - 1; i >= 0 && stack.length < MAX_TRAVERSAL_NODES; i--) {
        stack.push(values[i]);
      }
    }
  }

  if (conversions.size === 0) return "";
  return `Horaires convertis en heure locale (${timeZone}) : ${JSON.stringify(Object.fromEntries(conversions))}`;
}

// ============================================================================
// 2. NORMALISATION JSON SCHEMA DRAFT 2020-12 & INDEXATION PARESSEUSE MCP
// ============================================================================

const UNSUPPORTED_DRAFT2020_KEYWORDS = new Set<string>([
  "$schema",
  "$id",
  "$dynamicRef",
  "$dynamicAnchor",
  "$recursiveRef",
  "$recursiveAnchor",
  "patternProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "dependentSchemas",
  "dependencies",
  "examples",
]);

/**
 * Nettoie récursivement un JSON Schema d'outil MCP pour le rendre 100 % conforme aux validateurs
 * stricts (Anthropic Draft 2020-12, OpenAI Responses, Gemini, OpenRouter) sans altérer l'objet source :
 * - Convertit `exclusiveMinimum: true` + `minimum: N` vers Draft 2020-12 ou retire le booléen obsolète.
 * - Normalise `items: [SchemaA, SchemaB]` (tuple Draft-07) vers `items: { anyOf: [...] }`.
 * - Retire `patternProperties` et les méta-mots-clés incompatibles hors d'une map `properties`.
 */
export function sanitizeToolJsonSchemaDraft2020(
  schema: unknown,
  seen = new WeakSet<object>(),
): Record<string, unknown> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: "object", properties: {} };
  }

  const cleaned = cleanSchemaNode(schema, false, seen);
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) {
    return { type: "object", properties: {} };
  }

  const root = cleaned as Record<string, unknown>;
  if (!root.type) {
    root.type = "object";
  }
  if (root.type === "object" && (!root.properties || typeof root.properties !== "object")) {
    root.properties = {};
  }
  return root;
}

function cleanSchemaNode(
  node: unknown,
  insidePropertiesMap: boolean,
  seen: WeakSet<object>,
): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => cleanSchemaNode(entry, false, seen));
  }
  if (!node || typeof node !== "object") {
    return node;
  }
  if (seen.has(node)) {
    return {};
  }
  seen.add(node);

  const src = node as Record<string, unknown>;

  // Dans une map `properties` ou `$defs`, les clés sont des noms de champs utilisateur (ex. un champ appelé "examples")
  if (insidePropertiesMap) {
    const propMapOut: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(src)) {
      propMapOut[propName] = cleanSchemaNode(propSchema, false, seen);
    }
    seen.delete(node);
    return propMapOut;
  }

  const out: Record<string, unknown> = {};
  const hadPatternProps = Object.prototype.hasOwnProperty.call(src, "patternProperties");

  for (const [key, value] of Object.entries(src)) {
    if (UNSUPPORTED_DRAFT2020_KEYWORDS.has(key)) {
      continue;
    }

    // Conversion Draft-04 booléenne `exclusiveMinimum: true` -> numérique Draft 2020-12
    if (key === "exclusiveMinimum") {
      if (typeof value === "number") {
        out.exclusiveMinimum = value;
      } else if (value === true && typeof src.minimum === "number") {
        out.exclusiveMinimum = src.minimum;
        delete out.minimum;
      }
      continue;
    }
    if (key === "exclusiveMaximum") {
      if (typeof value === "number") {
        out.exclusiveMaximum = value;
      } else if (value === true && typeof src.maximum === "number") {
        out.exclusiveMaximum = src.maximum;
        delete out.maximum;
      }
      continue;
    }

    if (key === "minimum" && src.exclusiveMinimum === true && typeof value === "number") {
      out.exclusiveMinimum = value;
      continue;
    }
    if (key === "maximum" && src.exclusiveMaximum === true && typeof value === "number") {
      out.exclusiveMaximum = value;
      continue;
    }

    // Normalisation tuple `items: [...]` -> `{ anyOf: [...] }` pour Anthropic/OpenAI
    if (key === "items" && Array.isArray(value)) {
      const cleanedTuple = value.map((v) => cleanSchemaNode(v, false, seen));
      out.items = cleanedTuple.length === 1 ? cleanedTuple[0] : { anyOf: cleanedTuple };
      continue;
    }

    // Si `patternProperties` a été retiré et `additionalProperties: false` était présent,
    // assouplir pour ne pas rejeter les clés dynamiques légitimes
    if (key === "additionalProperties" && hadPatternProps && value === false) {
      out.additionalProperties = true;
      continue;
    }

    if (key === "properties" || key === "$defs" || key === "definitions") {
      out[key] = cleanSchemaNode(value, true, seen);
    } else {
      out[key] = cleanSchemaNode(value, false, seen);
    }
  }

  seen.delete(node);
  return out;
}

export interface SearchableToolLike {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface LazyToolSearchResponse {
  /** Jusqu'à `maxFullSchemas` (défaut 3) outils avec leur schéma complet prêt à l'emploi. */
  detailedTools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  /** Index léger des autres outils correspondants (nom + résumé court). */
  deferredIndex: Array<{
    name: string;
    summary: string;
  }>;
  totalMatched: number;
}

/**
 * Recherche intelligente d'outils MCP à la façon de `nod_tool_search` :
 * - Supporte la recherche exacte séparée par virgules (`"n8n_list_workflows, odoo_get_invoices"`)
 *   ou la recherche par mots-clés pondérée.
 * - Retourne les 3 premiers schémas complets et les suivants sous forme d'index ultra-compact
 *   pour économiser des milliers de tokens de déclaration.
 */
export function searchLazyMcpTools(
  tools: readonly SearchableToolLike[],
  query: string,
  maxFullSchemas = 3,
): LazyToolSearchResponse {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery || tools.length === 0) {
    return { detailedTools: [], deferredIndex: [], totalMatched: 0 };
  }

  // Cas 1 : liste explicite de noms séparés par virgules
  if (cleanQuery.includes(",")) {
    const requestedNames = cleanQuery
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const exactMatches = tools.filter((t) => requestedNames.includes(t.name.toLowerCase()));
    if (exactMatches.length > 0) {
      return {
        detailedTools: exactMatches.map((t) => ({
          name: t.name,
          description: t.description ?? "",
          inputSchema: sanitizeToolJsonSchemaDraft2020(t.inputSchema),
        })),
        deferredIndex: [],
        totalMatched: exactMatches.length,
      };
    }
  }

  const terms = cleanQuery
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 2);

  const scored: Array<{ tool: SearchableToolLike; score: number }> = [];
  const lowerExact = cleanQuery.toLowerCase();

  for (const tool of tools) {
    const nameNorm = tool.name.toLowerCase();
    const descNorm = (tool.description ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

    if (nameNorm === lowerExact) {
      scored.push({ tool, score: 1_000 });
      continue;
    }

    let score = 0;
    if (nameNorm.includes(lowerExact)) score += 120;
    for (const term of terms) {
      if (nameNorm.includes(term)) score += 40;
      if (descNorm.includes(term)) score += 15;
    }
    if (score > 0) {
      scored.push({ tool, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));

  const limit = Math.max(1, maxFullSchemas);
  const detailedTools = scored.slice(0, limit).map(({ tool }) => ({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: sanitizeToolJsonSchemaDraft2020(tool.inputSchema),
  }));

  const deferredIndex = scored.slice(limit, limit + 25).map(({ tool }) => ({
    name: tool.name,
    summary: (tool.description ?? "").slice(0, 120),
  }));

  return {
    detailedTools,
    deferredIndex,
    totalMatched: scored.length,
  };
}

// ============================================================================
// 3. GARDE ANTI-FAUSSE-COMPACTION SUR ERREURS HTTP 429 / 402 / QUOTA / 5XX
// ============================================================================

const NON_OVERFLOW_HTTP_STATUSES = new Set([401, 402, 403, 404, 408, 409, 410, 429]);

const RATE_OR_QUOTA_PATTERNS: readonly RegExp[] = [
  /\brate[ _-]?limit/i,
  /\btokens?\s+per\s+(?:minute|min|second|day|hour)\b/i,
  /\brequests?\s+per\s+(?:minute|min|second|day)\b/i,
  /\b(?:tpm|rpm|tpd)\b/i,
  /\binsufficient[ _-]?(?:quota|credits?|funds?|balance)\b/i,
  /\bcredit\s+balance\b/i,
  /\bbilling\b/i,
  /\bpayment\s+required\b/i,
  /\btoo\s+many\s+requests\b/i,
  /\b(?:http|status(?:\s+code)?)\s*(?:401|402|403|404|408|409|410|429|5\d\d)\b/i,
];

const TRUE_CONTEXT_OVERFLOW_PATTERNS: readonly RegExp[] = [
  /\bcontext[ _-]?length[ _-]?exceeded\b/i,
  /\bmaximum\s+context\s+length\b/i,
  /\bprompt\s+is\s+too\s+long\b/i,
  /\binput\s+(?:is\s+)?too\s+long\b/i,
  /\bcontext\s+window\s+exceeded\b/i,
  /\bexceeds?\s+(?:the\s+)?(?:maximum\s+)?(?:context|token)\s+(?:window|limit|length)\b/i,
];

export type ProviderErrorClassification =
  | "context_overflow"
  | "rate_or_quota_limit"
  | "auth_or_permission"
  | "transient_server_error"
  | "other_error";

export interface ProviderErrorAnalysis {
  classification: ProviderErrorClassification;
  /** Vrai UNIQUEMENT s'il s'agit d'un authentique dépassement de fenêtre de contexte. */
  shouldTriggerCompaction: boolean;
  statusCode?: number;
}

/**
 * Analyse une erreur remontée par un fournisseur LLM pour déterminer s'il s'agit d'un vrai
 * dépassement de contexte (`shouldTriggerCompaction: true`) ou d'une limite de débit / quota / HTTP
 * (`429 Tokens per minute`, `402 Insufficient credits`, `503`) qui ne doit JAMAIS déclencher
 * une compaction destructive de l'historique.
 */
export function classifyProviderErrorForCompaction(
  error: unknown,
  explicitStatusCode?: number,
): ProviderErrorAnalysis {
  const errObj = error && typeof error === "object" ? (error as Record<string, unknown>) : undefined;
  const rawStatus =
    explicitStatusCode ??
    (typeof errObj?.status === "number" ? errObj.status : undefined) ??
    (typeof errObj?.statusCode === "number" ? errObj.statusCode : undefined);

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof errObj?.message === "string"
          ? errObj.message
          : String(error ?? "");

  const code = typeof errObj?.code === "string" ? errObj.code.toLowerCase() : "";

  // 1. Codes HTTP explicites hors dépassement de contexte (comme le patch Pi de n8n-io/nod)
  if (rawStatus !== undefined) {
    if (rawStatus === 401 || rawStatus === 403) {
      return {
        classification: "auth_or_permission",
        shouldTriggerCompaction: false,
        statusCode: rawStatus,
      };
    }
    if (rawStatus === 402 || rawStatus === 429) {
      return {
        classification: "rate_or_quota_limit",
        shouldTriggerCompaction: false,
        statusCode: rawStatus,
      };
    }
    if (rawStatus >= 500 && rawStatus < 600) {
      return {
        classification: "transient_server_error",
        shouldTriggerCompaction: false,
        statusCode: rawStatus,
      };
    }
    if (NON_OVERFLOW_HTTP_STATUSES.has(rawStatus)) {
      return {
        classification: "other_error",
        shouldTriggerCompaction: false,
        statusCode: rawStatus,
      };
    }
  }

  // 2. Codes d'erreur et motifs textuels de quota / rate-limit (ex. "Rate limit reached for tokens per minute")
  if (
    code.includes("rate_limit") ||
    code.includes("insufficient_quota") ||
    code.includes("billing") ||
    RATE_OR_QUOTA_PATTERNS.some((re) => re.test(message))
  ) {
    return {
      classification: "rate_or_quota_limit",
      shouldTriggerCompaction: false,
      statusCode: rawStatus,
    };
  }

  // 3. Détection stricte d'un vrai dépassement de fenêtre de contexte
  if (
    code === "context_length_exceeded" ||
    TRUE_CONTEXT_OVERFLOW_PATTERNS.some((re) => re.test(message))
  ) {
    return {
      classification: "context_overflow",
      shouldTriggerCompaction: true,
      statusCode: rawStatus,
    };
  }

  return {
    classification: "other_error",
    shouldTriggerCompaction: false,
    statusCode: rawStatus,
  };
}
