/**
 * Vérification contractuelle des routines multi-étapes.
 *
 * Résout le problème où un agent exécutant une routine complexe découpée en plusieurs
 * étapes (1, 2, 3...) s'arrête prématurément après la première étape en considérant à tort
 * sa mission achevée.
 *
 * Ce module décompose la consigne de la routine en une checklist d'étapes (2 à 10 étapes)
 * et s'assure que chaque étape est explicitement validée par l'agent (Fait, Bloqué ou Ignoré)
 * avant d'autoriser la clôture de la routine.
 */

export const MOST_ROUTINE_PARTS = 10;
const PART_SHOWN_MAX_CHARS = 90;

const LIST_ITEM_REGEX = /^(\s*)(?:[-*•+]|\d{1,2}[.)]|[a-z][.)]|(?:Étape|Etape|Point|Step)\s*\d{1,2}\s*[:.)-])\s+(\S.*)$/i;
const INLINE_STEP_REGEX = /(?:^|\s)(\d{1,2})[.)]\s+/g;

const STATUS_REGEX = /(?<!\p{L})(?:fait|termin[ée]e?|valid[ée]e?|effectu[ée]e?|ex[ée]cut[ée]e?|bloqu[ée]e?|impossible|[ée]chec|ignor[ée]e?|pass[ée]e?|omis(?:e)?|done|completed|blocked|skipped|failed)(?!\p{L})/iu;
const NUMBERED_CLOSURE_REGEX = /^(?:part|item|step|[ée]tape|point)?\s*#?(\d{1,2})\s*(?:[.):|\]–—-]|\s|$)/iu;

export interface RoutineOpenPart {
  number: number;
  text: string;
}

/** Raccourcit un libellé d'étape pour affichage synthétique. */
function shortenPartText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= PART_SHOWN_MAX_CHARS ? clean : `${clean.slice(0, PART_SHOWN_MAX_CHARS - 1)}…`;
}

function normalizeWordSequence(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Extrait les étapes numérotées d'une consigne sous forme de liste de sous-tâches.
 * Une routine multi-étapes doit comporter entre 2 et 10 étapes.
 */
export function extractRoutineParts(instruction: string): string[] {
  if (!instruction || typeof instruction !== "string") return [];

  const items: { indent: number; text: string }[] = [];
  for (const line of instruction.split(/\r?\n/)) {
    const match = LIST_ITEM_REGEX.exec(line);
    if (!match) continue;
    items.push({
      indent: (match[1] ?? "").replace(/\t/g, "    ").length,
      text: (match[2] ?? "").replace(/\s+/g, " ").trim(),
    });
  }

  if (items.length === 0) {
    return extractInlineSteps(instruction);
  }

  const outerIndent = Math.min(...items.map((it) => it.indent));
  const parts = items
    .filter((it) => it.indent === outerIndent && it.text.length > 0)
    .map((it) => shortenPartText(it.text));

  return parts.length >= 2 && parts.length <= MOST_ROUTINE_PARTS ? parts : [];
}

/** Détection des étapes inline ("1) faire ceci 2) faire cela"). */
function extractInlineSteps(instruction: string): string[] {
  const text = instruction.replace(/\s+/g, " ");
  const steps: { at: number; from: number }[] = [];
  for (const mark of text.matchAll(INLINE_STEP_REGEX)) {
    if (Number(mark[1]) !== steps.length + 1) continue;
    steps.push({ at: mark.index, from: mark.index + mark[0].length });
  }
  if (steps.length < 2 || steps.length > MOST_ROUTINE_PARTS) return [];
  return steps.map((step, index) =>
    shortenPartText(text.slice(step.from, steps[index + 1]?.at ?? text.length)),
  );
}

/**
 * Identifie les étapes de la routine qui n'ont pas encore été explicitement clôturées dans la réponse.
 * Une étape est considérée clôturée si une ligne de texte mentionne son numéro ou ses mots clés
 * ET un statut explicite (Fait / Bloqué / Ignoré / Done / Blocked / Skipped).
 */
export function identifyOpenRoutineParts(
  parts: readonly string[],
  agentOutput: string,
): RoutineOpenPart[] {
  if (!Array.isArray(parts) || parts.length === 0) return [];
  if (!agentOutput || typeof agentOutput !== "string") {
    return parts.map((text, idx) => ({ number: idx + 1, text }));
  }

  const closed = new Set<number>();
  for (const raw of agentOutput.split(/\r?\n/)) {
    if (!STATUS_REGEX.test(raw)) continue;
    const line = raw.replace(/^[^\p{L}\p{N}]+/u, "");
    const numbered = NUMBERED_CLOSURE_REGEX.exec(line);
    if (numbered) {
      const stepNum = Number(numbered[1]);
      if (stepNum >= 1 && stepNum <= parts.length) {
        closed.add(stepNum);
        continue;
      }
    }
    const normalizedLine = normalizeWordSequence(line);
    parts.forEach((part, index) => {
      const startWords = normalizeWordSequence(part).slice(0, 30);
      if (startWords.length >= 8 && normalizedLine.includes(startWords)) {
        closed.add(index + 1);
      }
    });
  }

  return parts
    .map((text, index) => ({ number: index + 1, text }))
    .filter((part) => !closed.has(part.number));
}

/** Vérifie si l'intégralité des étapes d'une routine a été formellement traitée. */
export function isRoutineChecklistComplete(
  parts: readonly string[],
  agentOutput: string,
): boolean {
  return identifyOpenRoutineParts(parts, agentOutput).length === 0;
}

/**
 * Génère un rappel structuré en français (nudge) si certaines étapes de la routine sont restées ouvertes.
 */
export function buildRoutineChecklistNudgeFr(openParts: readonly RoutineOpenPart[]): string {
  if (!openParts || openParts.length === 0) return "";
  const lines = openParts.map((p) => `• Étape ${p.number} : ${p.text}`).join("\n");
  return `[Rappel de Conformité de Routine]\nLes étapes suivantes de votre consigne n'ont pas encore été explicitement clôturées dans votre réponse :\n${lines}\n\nVeuillez expliciter pour chacune de ces étapes restantes son statut final :\n- « Fait » (validé),\n- « Bloqué » (avec le motif précis),\n- ou « Ignoré » (avec justification).`;
}
