/**
 * Bouclier de Tolérance et Auto-Réparation de Tool-Calling (Inspiré d'Hermes Agent).
 *
 * Résout les hallucinations mineures de syntaxe, noms d'outils déformés, résidus XML,
 * arguments JSON malformés ou tronqués, et garantit l'alternance stricte des rôles
 * conversationnels pour les modèles souverains (Gemini 3.1, GPT-OSS 120B, Mistral).
 */

import type { SanitizableMessage } from "./history-sanitize.js";

/** Calcule la distance de Levenshtein entre deux chaînes de caractères. */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1, // suppression
        matrix[i]![j - 1]! + 1, // insertion
        matrix[i - 1]![j - 1]! + cost, // substitution
      );
    }
  }

  return matrix[an]![bn]!;
}

/** Calcule le score de similarité (de 0.0 à 1.0) entre deux chaînes. */
export function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(a, b);
  return (maxLen - dist) / maxLen;
}

export interface ToolNameRepairResult {
  name: string;
  repaired: boolean;
  original: string;
  reason?: string;
}

/**
 * Répare les anomalies courantes de nommage d'outils causées par les hallucinations LLM :
 * - Résidus XML / guillemets (ex: `terminal" parameter="command"` -> `terminal`)
 * - Balises englobantes (ex: `<write_file>` -> `write_file`)
 * - Normalisation de casse, d'espaces et tirets en underscores (`"write file"` -> `"write_file"`)
 * - Conversion CamelCase (`todoTool` -> `todo_tool`)
 * - Suppression des suffixes d'outils jusqu'à 2 fois (`TodoTool_tool` -> `todo`)
 * - Détection floue (Fuzzy match) avec seuil Levenshtein à 0.70
 */
export function repairToolCallName(
  rawName: string,
  validToolNames: Iterable<string>,
): ToolNameRepairResult {
  const validSet = new Set(validToolNames);
  if (!rawName || typeof rawName !== "string") {
    return { name: "", repaired: false, original: rawName ?? "" };
  }

  const original = rawName.trim();
  if (validSet.has(original)) {
    return { name: original, repaired: false, original };
  }

  let cleaned = original;

  // 1. Découpage aux séparateurs XML / guillemets si le modèle fuit des attributs
  for (const sep of ['"', "'", "<", ">", "/"]) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0) {
      cleaned = cleaned.substring(0, idx).trim();
      break;
    }
  }

  // Nettoyage des balises débutantes résiduelles (ex: `<write_file`)
  cleaned = cleaned.replace(/^[<>/'"]+/, "").replace(/[<>/'"]+$/, "").trim();

  if (validSet.has(cleaned)) {
    return { name: cleaned, repaired: true, original, reason: "xml_quote_trimmed" };
  }

  // 2. Normalisation de base : minuscules, espaces et tirets vers underscores
  const normalized = cleaned.toLowerCase().replace(/[\s-]+/g, "_");
  if (validSet.has(normalized)) {
    return { name: normalized, repaired: true, original, reason: "normalized_separators" };
  }

  // 3. Conversion CamelCase vers snake_case (ex: todoTool -> todo_tool)
  const camelToSnake = cleaned
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (validSet.has(camelToSnake)) {
    return { name: camelToSnake, repaired: true, original, reason: "camel_to_snake" };
  }

  // 4. Suppression des suffixes d'outils parasites (ex: _tool, -tool, tool)
  function stripToolSuffix(s: string): string | null {
    const lc = s.toLowerCase();
    for (const suffix of ["_tool", "-tool", "tool"]) {
      if (lc.endsWith(suffix) && lc.length > suffix.length) {
        return s.slice(0, -suffix.length).replace(/[_-]+$/, "");
      }
    }
    return null;
  }

  let candidate: string | null = camelToSnake;
  for (let round = 0; round < 2; round++) {
    candidate = stripToolSuffix(candidate);
    if (!candidate) break;
    if (validSet.has(candidate)) {
      return { name: candidate, repaired: true, original, reason: "stripped_tool_suffix" };
    }
  }

  // 5. Recherche floue Levenshtein (cutoff 0.70)
  let bestMatch: string | null = null;
  let bestScore = 0.70; // seuil minimal

  const targetLower = normalized;
  for (const valid of validSet) {
    const score = similarityScore(targetLower, valid.toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      bestMatch = valid;
    }
  }

  if (bestMatch) {
    return { name: bestMatch, repaired: true, original, reason: `fuzzy_match_${Math.round(bestScore * 100)}pct` };
  }

  // Si non réparable, retourne le nom nettoyé ou original
  return { name: cleaned || original, repaired: false, original };
}

/**
 * Rééquilibre les délimiteurs JSON (crochets et accolades) ouverts mais non fermés,
 * en respectant les chaînes de caractères (les accolades dans "code: }" ne sont pas structurelles).
 */
export function rebalanceJsonClosers(raw: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let i = 0;
  const n = raw.length;

  while (i < n) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        stack.push("}");
      } else if (ch === "[") {
        stack.push("]");
      } else if (ch === "}" || ch === "]") {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }
    i++;
  }

  // Si on est coupé au milieu d'une chaîne, on ferme d'abord le guillemet
  let suffix = "";
  if (inString) {
    suffix += '"';
  }

  while (stack.length > 0) {
    suffix += stack.pop();
  }

  return suffix ? raw + suffix : raw;
}

export interface ToolArgumentsRepairResult {
  arguments: string;
  repaired: boolean;
  parsed: Record<string, unknown>;
  reason?: string;
  isTruncated?: boolean;
}

/**
 * Détecte si un payload d'arguments d'outil a été coupé de manière critique en plein vol
 * (ex: commande shell tronquée dangereuse comme `rm -rf /usr/...`).
 */
export function isTruncatedToolArguments(rawArgs: string): boolean {
  if (!rawArgs || typeof rawArgs !== "string") return false;
  const trimmed = rawArgs.trim();
  if (trimmed.length === 0) return false;

  // Si le JSON se termine brusquement sans caractère de fermeture et sans délimiteur
  const endsWithCloser = trimmed.endsWith("}") || trimmed.endsWith("]");
  if (!endsWithCloser && trimmed.length > 15) {
    // Si des accolades ou guillemets sont restés ouverts
    const openBraces = (trimmed.match(/\{/g) || []).length;
    const closeBraces = (trimmed.match(/\}/g) || []).length;
    if (openBraces > closeBraces) return true;
  }
  return false;
}

/**
 * Répare les arguments JSON malformés :
 * - Caractères vides ou 'None' -> '{}'
 * - Virgules traînantes avant accolades/crochets de fin
 * - Remplacement de booléens / None style Python (True/False/None)
 * - Caractères de contrôle non échappés
 * - Rééquilibrage syntaxique des fermetures
 */
export function repairToolCallArguments(
  rawArgs: string,
  toolName = "?",
): ToolArgumentsRepairResult {
  const stripped = typeof rawArgs === "string" ? rawArgs.trim() : "";

  if (!stripped || stripped === "None" || stripped === "null") {
    return {
      arguments: "{}",
      repaired: stripped !== "{}",
      parsed: {},
      reason: "empty_or_none",
    };
  }

  // 1. Essai direct de parsing
  try {
    const directParsed = JSON.parse(stripped);
    if (typeof directParsed === "object" && directParsed !== null) {
      return {
        arguments: stripped,
        repaired: false,
        parsed: directParsed as Record<string, unknown>,
      };
    }
  } catch {
    // Poursuite des réparations
  }

  const truncated = isTruncatedToolArguments(stripped);

  // 2. Élimination des virgules traînantes : `, }` ou `, ]`
  let fixed = stripped.replace(/,\s*([}\]])/g, "$1");

  // 3. Remplacement des valeurs littérales Python courantes hors chaînes simples
  fixed = fixed.replace(/:\s*True\b/g, ": true");
  fixed = fixed.replace(/:\s*False\b/g, ": false");
  fixed = fixed.replace(/:\s*None\b/g, ": null");

  // 4. Rééquilibrage des fermetures
  const rebalanced = rebalanceJsonClosers(fixed) ?? fixed;

  // 5. Tentative de parsing post-rééquilibrage
  try {
    const repairedParsed = JSON.parse(rebalanced);
    if (typeof repairedParsed === "object" && repairedParsed !== null) {
      return {
        arguments: rebalanced,
        repaired: true,
        parsed: repairedParsed as Record<string, unknown>,
        reason: "syntax_rebalanced",
        isTruncated: truncated,
      };
    }
  } catch {
    // Poursuite
  }

  // 6. Remplacement des caractères de contrôle bruts non échappés
  try {
    const sanitizedControls = rebalanced.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
      if (c === "\n") return "\\n";
      if (c === "\r") return "\\r";
      if (c === "\t") return "\\t";
      return "";
    });
    const parsedControls = JSON.parse(sanitizedControls);
    if (typeof parsedControls === "object" && parsedControls !== null) {
      return {
        arguments: sanitizedControls,
        repaired: true,
        parsed: parsedControls as Record<string, unknown>,
        reason: "unescaped_controls_repaired",
        isTruncated: truncated,
      };
    }
  } catch {
    // Échec de la réparation complète
  }

  // 7. Dernier repli sécurisé : objet vide {}
  return {
    arguments: "{}",
    repaired: true,
    parsed: {},
    reason: "fallback_empty_object",
    isTruncated: truncated,
  };
}

export interface PartitionedBatch<T> {
  validCalls: T[];
  invalidCalls: Array<{ call: T; errorReason: string }>;
  isMixed: boolean;
}

/**
 * Partitionne un lot d'appels d'outils parallèles pour isoler les appels valides
 * des appels invalides, permettant l'exécution immédiate des valides (survie de lot mixte).
 */
export function partitionMixedBatch<
  T extends { id: string; name: string; arguments: string }
>(
  calls: readonly T[],
  validToolNames: Iterable<string>,
): PartitionedBatch<T> {
  const validSet = new Set(validToolNames);
  const validCalls: T[] = [];
  const invalidCalls: Array<{ call: T; errorReason: string }> = [];

  for (const call of calls) {
    const repaired = repairToolCallName(call.name, validSet);
    if (validSet.has(repaired.name)) {
      // Normalise le nom si réparé
      const effectiveCall = repaired.repaired ? { ...call, name: repaired.name } : call;
      validCalls.push(effectiveCall as T);
    } else {
      invalidCalls.push({
        call,
        errorReason: `Outil inconnu '${call.name}'. Veuillez utiliser un outil déclaré dans le catalogue souverain.`,
      });
    }
  }

  const isMixed = validCalls.length > 0 && invalidCalls.length > 0;
  return { validCalls, invalidCalls, isMixed };
}

/**
 * Assure la clôture d'une séquence d'outils interrompue :
 * Si l'historique conversationnel se termine par un message `role: "tool"`,
 * insère un message `assistant` synthétique pour préserver la règle d'alternance
 * stricte (`tool -> assistant -> user`) avant toute nouvelle entrée utilisateur.
 */
export function closeInterruptedToolSequence<T extends SanitizableMessage>(
  messages: T[],
  syntheticText = "Action d'outil enregistrée. Prêt pour la suite.",
): { messages: T[]; closed: boolean } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages, closed: false };
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === "tool") {
    const copy = [...messages];
    copy.push({
      role: "assistant",
      content: syntheticText,
    } as T);
    return { messages: copy, closed: true };
  }

  return { messages, closed: false };
}
