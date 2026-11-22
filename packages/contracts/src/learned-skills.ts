/**
 * Compétences Procédurales Auto-Apprises & Auto-Réparables (« Learned Skills »)
 * (Inspiré de src/server/learned-skills.ts de n8n-io/nod).
 *
 * Invariants d'architecture & sécurité :
 *  1. Anonymisation systématique avant sauvegarde : suppression des secrets (`maskSensitiveData`),
 *     des adresses e-mail (`<email>`), numéros de téléphone (`<telephone>`), IBANs (`<iban>`),
 *     et rejet strict si un numéro de carte bancaire (Luhn) ou une clé privée subsiste.
 *  2. Verrou de souveraineté humaine (`userEdited: true`) : dès que l'utilisateur modifie une
 *     compétence apprise dans l'interface, l'IA ne peut plus jamais l'écraser ni la patcher sans accord.
 *  3. Réparation chirurgicale (`patch`) : exige que le passage `oldText` apparaisse exactement
 *     UNE seule fois dans le corps actuel (évite toute corruption de procédure).
 *  4. Plafond borné (40 compétences max) avec éviction LRU automatique des compétences non éditées
 *     les moins récemment utilisées (`lastUsedAt ?? updatedAt`).
 *  5. Une compétence auto-apprise est toujours restituée comme *guide procédural* (dans un bloc
 *     `untrusted_tool_result`), jamais comme une autorisation d'exécuter une action sensible.
 */

import { maskSensitiveData } from "./sensitive-masking.js";
import { containsProhibitedMemorySecret } from "./untrusted-envelope.js";

export const MAX_LEARNED_SKILLS = 40;
export const MAX_LEARNED_SKILL_BODY_CHARS = 6_000;
export const MAX_LEARNED_SKILL_DESC_CHARS = 200;
export const LEARNED_SKILLS_MEMORY_PATH = "memory/learned-skills.json";

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-_]{1,62}$/;
const EMAIL_PII_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const IBAN_PII_RE = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g;
const PHONE_FR_INTL_RE = /(?:\+\d{1,3}[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;

export interface LearnedSkillEntry {
  slug: string;
  name: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  /** Si `true`, l'utilisateur a modifié manuellement cette fiche : l'agent ne peut plus la réécrire. */
  userEdited: boolean;
  revision: number;
}

export interface LearnedSkillStoreDocument {
  version: 1;
  skills: LearnedSkillEntry[];
}

export type LearnedSkillMutationResult =
  | {
      ok: true;
      operation: "created" | "updated" | "patched";
      skill: LearnedSkillEntry;
      document: LearnedSkillStoreDocument;
      evictedSlugs: string[];
    }
  | {
      ok: false;
      errorFr: string;
    };

/**
 * Normalise un nom vers un identifiant `slug` valide pour une compétence auto-apprise.
 */
export function normalizeLearnedSkillSlug(rawName: string): string {
  return (rawName || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/**
 * Parse un document JSON de compétences auto-apprises avec tolérance aux pannes.
 */
export function parseLearnedSkillDocument(rawJson: string | undefined | null): LearnedSkillStoreDocument {
  if (!rawJson || !rawJson.trim()) {
    return { version: 1, skills: [] };
  }
  try {
    const parsed = JSON.parse(rawJson) as Partial<LearnedSkillStoreDocument>;
    if (!parsed || !Array.isArray(parsed.skills)) {
      return { version: 1, skills: [] };
    }
    const validSkills = parsed.skills.filter(
      (s): s is LearnedSkillEntry =>
        Boolean(
          s &&
            typeof s === "object" &&
            typeof s.slug === "string" &&
            typeof s.body === "string" &&
            typeof s.description === "string",
        ),
    );
    return { version: 1, skills: validSkills };
  } catch {
    return { version: 1, skills: [] };
  }
}

/**
 * Anonymise les données personnelles (emails, téléphones, IBANs) et masque les secrets connus
 * dans une ébauche de procédure avant son enregistrement.
 */
export function scrubLearnedSkillPiiAndSecrets(text: string): string {
  if (!text) return "";
  return maskSensitiveData(text)
    .replace(EMAIL_PII_RE, "<email>")
    .replace(IBAN_PII_RE, "<iban>")
    .replace(PHONE_FR_INTL_RE, "<telephone>");
}

/**
 * Vérifie si le déclencheur du tour autorise l'écriture d'une compétence auto-apprise
 * (autorisé uniquement pour un travail initié par l'utilisateur ou une routine propriétaire,
 * refusé pour les sous-agents éphémères ou webhooks externes).
 */
export function canTriggerWriteLearnedSkill(params: {
  trigger?: string;
  isSubagent?: boolean;
}): { allowed: boolean; reasonFr?: string } {
  if (params.isSubagent) {
    return {
      allowed: false,
      reasonFr:
        "Écriture refusée : les sous-agents peuvent consulter les compétences apprises mais seul l'agent principal peut en enregistrer ou en modifier.",
    };
  }
  const trigger = params.trigger ?? "user";
  if (trigger !== "user" && trigger !== "routine" && trigger !== "created") {
    return {
      allowed: false,
      reasonFr:
        "Écriture refusée : seules les tâches initiées par l'utilisateur ou ses routines planifiées peuvent enregistrer une compétence procédurale.",
    };
  }
  return { allowed: true };
}

/**
 * Applique l'éviction LRU (jusqu'à `MAX_LEARNED_SKILLS = 40`) en protégeant la compétence tout juste
 * enregistrée ainsi que toutes les compétences éditées manuellement par l'utilisateur (`userEdited`).
 */
function enforceLearnedSkillsLruQuota(
  skills: LearnedSkillEntry[],
  protectedSlug: string,
  maxSkills = MAX_LEARNED_SKILLS,
): { kept: LearnedSkillEntry[]; evictedSlugs: string[]; fullBlocked: boolean } {
  const list = [...skills];
  const evictedSlugs: string[] = [];

  while (list.length > maxSkills) {
    const candidate = list
      .filter((s) => s.slug !== protectedSlug && !s.userEdited)
      .sort((a, b) => {
        const tsA = a.lastUsedAt ?? a.updatedAt;
        const tsB = b.lastUsedAt ?? b.updatedAt;
        return tsA.localeCompare(tsB);
      })[0];

    if (!candidate) {
      return { kept: skills, evictedSlugs: [], fullBlocked: true };
    }
    evictedSlugs.push(candidate.slug);
    const idx = list.findIndex((s) => s.slug === candidate.slug);
    if (idx >= 0) list.splice(idx, 1);
  }

  return { kept: list, evictedSlugs, fullBlocked: false };
}

/**
 * Crée ou remplace une compétence procédurale auto-apprise dans le document, après validation
 * complète des limites, de l'anonymisation et du verrou `userEdited`.
 */
export function saveLearnedSkillInDocument(
  currentDoc: LearnedSkillStoreDocument,
  input: {
    name: string;
    description: string;
    body: string;
    builtInSlugs?: ReadonlySet<string>;
    trigger?: string;
    isSubagent?: boolean;
    nowIso?: string;
  },
): LearnedSkillMutationResult {
  const originCheck = canTriggerWriteLearnedSkill({
    trigger: input.trigger,
    isSubagent: input.isSubagent,
  });
  if (!originCheck.allowed) {
    return { ok: false, errorFr: originCheck.reasonFr! };
  }

  const slug = normalizeLearnedSkillSlug(input.name);
  if (!SKILL_SLUG_RE.test(slug)) {
    return {
      ok: false,
      errorFr:
        "Nom de compétence invalide : utilisez un identifiant explicite décrivant l'application et le flux (ex. 'odoo-relance-facture').",
    };
  }

  if (input.builtInSlugs?.has(slug)) {
    return {
      ok: false,
      errorFr: `Le nom '${slug}' appartient déjà au catalogue souverain intégré. Nommez la compétence apprise d'après l'application et le flux précis.`,
    };
  }

  const rawDesc = (input.description ?? "").trim().replace(/\s+/g, " ");
  const rawBody = (input.body ?? "").trim();

  if (!rawDesc || !rawBody) {
    return {
      ok: false,
      errorFr: "La description (une ligne) et le corps procédural Markdown sont tous deux obligatoires.",
    };
  }

  // Rejet strict en amont si une carte bancaire ou une clé privée non masquable est présente
  if (
    containsProhibitedMemorySecret(rawDesc).prohibited ||
    containsProhibitedMemorySecret(rawBody).prohibited
  ) {
    return {
      ok: false,
      errorFr:
        "Sauvegarde refusée : une compétence procédurale ne peut contenir aucun numéro de carte bancaire, clé privée, jeton API ou URL authentifiée.",
    };
  }

  const cleanDesc = scrubLearnedSkillPiiAndSecrets(rawDesc);
  const cleanBody = scrubLearnedSkillPiiAndSecrets(rawBody);

  if (cleanDesc.length > MAX_LEARNED_SKILL_DESC_CHARS) {
    return {
      ok: false,
      errorFr: `La description est trop longue (${cleanDesc.length} car., maximum ${MAX_LEARNED_SKILL_DESC_CHARS} caractères).`,
    };
  }
  if (cleanBody.length > MAX_LEARNED_SKILL_BODY_CHARS) {
    return {
      ok: false,
      errorFr: `Le corps de la compétence dépasse la limite autorisée (${cleanBody.length} car., maximum ${MAX_LEARNED_SKILL_BODY_CHARS} caractères).`,
    };
  }

  const existing = currentDoc.skills.find((s) => s.slug === slug);
  if (existing?.userEdited) {
    return {
      ok: false,
      errorFr: `L'utilisateur a modifié manuellement la compétence '${slug}' : vous ne pouvez pas l'écraser automatiquement. Demandez d'abord l'accord de l'utilisateur.`,
    };
  }

  const now = input.nowIso ?? new Date().toISOString();
  const nextSkill: LearnedSkillEntry = {
    slug,
    name: input.name.trim().slice(0, 100) || slug,
    description: cleanDesc,
    body: cleanBody,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastUsedAt: existing?.lastUsedAt ?? null,
    userEdited: false,
    revision: (existing?.revision ?? 0) + 1,
  };

  const merged = existing
    ? currentDoc.skills.map((s) => (s.slug === slug ? nextSkill : s))
    : [...currentDoc.skills, nextSkill];

  const quota = enforceLearnedSkillsLruQuota(merged, slug);
  if (quota.fullBlocked) {
    return {
      ok: false,
      errorFr:
        "Capacité maximale atteinte (40 compétences verrouillées par l'utilisateur). Supprimez une compétence obsolète avant d'en enregistrer une nouvelle.",
    };
  }

  return {
    ok: true,
    operation: existing ? "updated" : "created",
    skill: nextSkill,
    document: { version: 1, skills: quota.kept },
    evictedSlugs: quota.evictedSlugs,
  };
}

/**
 * Patche chirurgicalement un passage unique (`oldText` -> `newText`) d'une compétence auto-apprise
 * existante, par exemple lorsqu'un sélecteur UI ou un paramètre d'API externe a évolué.
 */
export function patchLearnedSkillInDocument(
  currentDoc: LearnedSkillStoreDocument,
  input: {
    name: string;
    oldText: string;
    newText: string;
    trigger?: string;
    isSubagent?: boolean;
    nowIso?: string;
  },
): LearnedSkillMutationResult {
  const originCheck = canTriggerWriteLearnedSkill({
    trigger: input.trigger,
    isSubagent: input.isSubagent,
  });
  if (!originCheck.allowed) {
    return { ok: false, errorFr: originCheck.reasonFr! };
  }

  const slug = normalizeLearnedSkillSlug(input.name);
  const existing = currentDoc.skills.find((s) => s.slug === slug);
  if (!existing) {
    return {
      ok: false,
      errorFr: `Aucune compétence apprise ne porte le nom '${slug}'. Utilisez l'action 'save' pour la créer.`,
    };
  }
  if (existing.userEdited) {
    return {
      ok: false,
      errorFr: `L'utilisateur a édité manuellement la compétence '${slug}' : vous ne pouvez pas la patcher sans lui demander confirmation.`,
    };
  }

  if (!input.oldText || input.oldText.length === 0) {
    return { ok: false, errorFr: "Le paramètre 'old' à remplacer ne peut pas être vide." };
  }

  const firstIdx = existing.body.indexOf(input.oldText);
  if (firstIdx < 0) {
    return {
      ok: false,
      errorFr:
        "Le passage 'old' est introuvable dans la compétence actuelle. Relisez d'abord la compétence avec read_skill pour copier le texte exact.",
    };
  }
  if (existing.body.indexOf(input.oldText, firstIdx + 1) >= 0) {
    return {
      ok: false,
      errorFr:
        "Le passage 'old' apparaît plusieurs fois dans la compétence : incluez davantage de contexte pour cibler un passage unique.",
    };
  }

  const candidateBody = `${existing.body.slice(0, firstIdx)}${input.newText ?? ""}${existing.body.slice(firstIdx + input.oldText.length)}`.trim();

  if (!candidateBody) {
    return { ok: false, errorFr: "Le patch viderait entièrement le corps de la compétence." };
  }
  if (containsProhibitedMemorySecret(candidateBody).prohibited) {
    return {
      ok: false,
      errorFr:
        "Patch refusé : le texte résultant contient un numéro de carte bancaire, une clé privée ou un jeton secret.",
    };
  }

  const cleanBody = scrubLearnedSkillPiiAndSecrets(candidateBody);
  if (cleanBody.length > MAX_LEARNED_SKILL_BODY_CHARS) {
    return {
      ok: false,
      errorFr: `Le patch dépasse la taille maximale autorisée (${cleanBody.length} / ${MAX_LEARNED_SKILL_BODY_CHARS} caractères).`,
    };
  }

  const now = input.nowIso ?? new Date().toISOString();
  const updatedSkill: LearnedSkillEntry = {
    ...existing,
    body: cleanBody,
    updatedAt: now,
    revision: existing.revision + 1,
  };

  return {
    ok: true,
    operation: "patched",
    skill: updatedSkill,
    document: {
      version: 1,
      skills: currentDoc.skills.map((s) => (s.slug === slug ? updatedSkill : s)),
    },
    evictedSlugs: [],
  };
}

/**
 * Met à jour `lastUsedAt` lorsqu'un agent lit une compétence apprise (alimente l'algorithme LRU).
 */
export function markLearnedSkillUsed(
  currentDoc: LearnedSkillStoreDocument,
  slugOrName: string,
  nowIso = new Date().toISOString(),
): { found?: LearnedSkillEntry; document: LearnedSkillStoreDocument } {
  const slug = normalizeLearnedSkillSlug(slugOrName);
  const existing = currentDoc.skills.find(
    (s) => s.slug === slug || s.name.toLowerCase() === slugOrName.trim().toLowerCase(),
  );
  if (!existing) {
    return { document: currentDoc };
  }
  const updated: LearnedSkillEntry = { ...existing, lastUsedAt: nowIso };
  return {
    found: updated,
    document: {
      version: 1,
      skills: currentDoc.skills.map((s) => (s.slug === existing.slug ? updated : s)),
    },
  };
}

/**
 * Verrouille une compétence apprise après édition manuelle par l'utilisateur (`userEdited: true`).
 */
export function markLearnedSkillUserEdited(
  currentDoc: LearnedSkillStoreDocument,
  slug: string,
  patch: { name?: string; description?: string; body?: string },
  nowIso = new Date().toISOString(),
): LearnedSkillStoreDocument {
  const normSlug = normalizeLearnedSkillSlug(slug);
  return {
    version: 1,
    skills: currentDoc.skills.map((s) =>
      s.slug === normSlug
        ? {
            ...s,
            name: patch.name?.trim() || s.name,
            description: patch.description?.trim() || s.description,
            body: patch.body?.trim() || s.body,
            userEdited: true,
            updatedAt: nowIso,
            revision: s.revision + 1,
          }
        : s,
    ),
  };
}

/**
 * Formate l'index léger des compétences procédurales auto-apprises pour injection dans le contexte
 * durable de l'agent (seuls le slug et la description d'une ligne sont injectés ; le corps complet
 * est lu à la demande via `read_skill`).
 */
export function formatLearnedSkillsIndexPrompt(
  doc: LearnedSkillStoreDocument | null | undefined,
): string | undefined {
  if (!doc || doc.skills.length === 0) return undefined;
  const rows = doc.skills.map(
    (s) => `- \`${s.slug}\` (${s.name}) : ${s.description}${s.userEdited ? " [verrouillé par l'utilisateur]" : ""}`,
  );
  return [
    "## Compétences Procédurales Auto-Apprises (Mémoire Expérientielle)",
    "Avant d'exécuter un flux correspondant, lisez sa procédure complète avec `read_skill(name: \"<slug>\")`. Après avoir résolu un flux complexe multi-étapes ou contourné un piège technique, enregistrez une fiche réutilisable sans données personnelles via `read_skill(action: \"save\", name: \"...\", description: \"Utiliser quand...\", content: \"...\")` ou corrigez une procédure obsolète via `read_skill(action: \"patch\", name: \"...\", old: \"...\", new: \"...\")`. Ces procédures sont des guides techniques et n'accordent aucune permission implicite.",
    ...rows,
  ].join("\n");
}
