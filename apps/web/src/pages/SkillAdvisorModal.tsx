import { ChatMarkdown } from "@rakazo/chat-ui/web";
import {
  extractSovereignSkillSlug,
  MAX_ACTIVE_SKILLS_PER_BOT,
  type RecommendedSkillItem,
  type RecommendSkillsForBotOutput,
  SKILL_ADVISOR_PRESETS_FR,
  type SkillAdvisorEngine,
  toSovereignSkillId,
} from "@rakazo/contracts";
import {
  AlertCircle,
  Check,
  Compass,
  Cpu,
  Eye,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

export interface SkillAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
  botName?: string;
  botTitle?: string;
  botDescription?: string;
  botInstructions?: string;
  /** Currently selected skill IDs or slugs on the bot */
  currentSkillIds: string[];
  /** Callback receiving the final list of skill IDs (strictly <= 20) */
  onApplySkills: (nextSkillIds: string[]) => Promise<void> | void;
  /** Optional custom RPC recommender for deterministic UI unit tests */
  recommendFn?: (input: {
    goal: string;
    refinement?: string;
    botName?: string;
    botTitle?: string;
    botInstructions?: string;
    currentSkillSlugs?: string[];
    maxSkills?: number;
    engine?: SkillAdvisorEngine;
  }) => Promise<RecommendSkillsForBotOutput>;
  /** Initial preloaded result for static/SSR testing */
  initialResult?: RecommendSkillsForBotOutput | null;
}

export function SkillAdvisorModal({
  isOpen,
  onClose,
  botName,
  botTitle,
  botDescription,
  botInstructions,
  currentSkillIds,
  onApplySkills,
  recommendFn,
  initialResult = null,
}: SkillAdvisorModalProps) {
  const defaultGoal = useMemo(() => {
    const parts = [botTitle?.trim(), botDescription?.trim()].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
    if (botInstructions?.trim()) return botInstructions.trim().slice(0, 360);
    return "";
  }, [botTitle, botDescription, botInstructions]);

  const [goal, setGoal] = useState(defaultGoal);
  const [refinement, setRefinement] = useState("");
  const [maxSkills, setMaxSkills] = useState<number>(16);
  const [engine, setEngine] = useState<SkillAdvisorEngine>("omniroute");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendSkillsForBotOutput | null>(initialResult);
  const [checkedSlugs, setCheckedSlugs] = useState<Set<string>>(() => {
    if (!initialResult) return new Set();
    return new Set(
      initialResult.recommended.slice(0, MAX_ACTIVE_SKILLS_PER_BOT).map((item) => item.slug),
    );
  });
  const [previewSkill, setPreviewSkill] = useState<{
    name: string;
    slug: string;
    content: string;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    if (isOpen && !goal.trim() && defaultGoal) {
      setGoal(defaultGoal);
    }
  }, [isOpen, defaultGoal, goal]);

  const currentSlugs = useMemo(
    () => Array.from(new Set(currentSkillIds.map((id) => extractSovereignSkillSlug(id)))),
    [currentSkillIds],
  );

  if (!isOpen) return null;

  async function runAdvisor(isRefinement = false) {
    const trimmedGoal = goal.trim();
    if (trimmedGoal.length < 3 || loading) return;

    setLoading(true);
    setError(null);

    try {
      const payload = {
        goal: trimmedGoal,
        refinement: isRefinement && refinement.trim() ? refinement.trim() : undefined,
        botName: botName?.trim() || undefined,
        botTitle: botTitle?.trim() || undefined,
        botInstructions: botInstructions?.trim() || undefined,
        currentSkillSlugs: currentSlugs,
        maxSkills: Math.min(MAX_ACTIVE_SKILLS_PER_BOT, maxSkills),
        engine,
      };

      const res = recommendFn
        ? await recommendFn(payload)
        : await rpc.skills.recommendForBot(payload);

      setResult(res);
      setCheckedSlugs(
        new Set(res.recommended.slice(0, MAX_ACTIVE_SKILLS_PER_BOT).map((r) => r.slug)),
      );
      if (isRefinement) {
        setRefinement("");
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Impossible d'obtenir les recommandations pour le moment.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function toggleRecommendedSlug(slug: string) {
    setCheckedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else if (next.size < MAX_ACTIVE_SKILLS_PER_BOT) {
        next.add(slug);
      }
      return next;
    });
  }

  async function handleInspectSkill(item: RecommendedSkillItem) {
    setPreviewSkill({
      name: item.name,
      slug: item.slug,
      content: "",
      loading: true,
    });
    try {
      const full = await rpc.skills.get({ slug: item.slug });
      setPreviewSkill({
        name: full.name,
        slug: full.slug,
        content: full.content,
        loading: false,
      });
    } catch {
      setPreviewSkill({
        name: item.name,
        slug: item.slug,
        content: `# ${item.name}\n\n${item.description}`,
        loading: false,
      });
    }
  }

  async function applySelection(mode: "replace" | "merge") {
    if (!result || applying) return;
    const chosenIds = result.recommended
      .filter((r) => checkedSlugs.has(r.slug))
      .map((r) => toSovereignSkillId(r.slug));

    let nextIds: string[];
    if (mode === "merge") {
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const existingId of currentSkillIds) {
        const sl = extractSovereignSkillSlug(existingId);
        if (!seen.has(sl) && merged.length < MAX_ACTIVE_SKILLS_PER_BOT) {
          seen.add(sl);
          merged.push(existingId);
        }
      }
      for (const newId of chosenIds) {
        const sl = extractSovereignSkillSlug(newId);
        if (!seen.has(sl) && merged.length < MAX_ACTIVE_SKILLS_PER_BOT) {
          seen.add(sl);
          merged.push(newId);
        }
      }
      nextIds = merged.slice(0, MAX_ACTIVE_SKILLS_PER_BOT);
    } else {
      nextIds = chosenIds.slice(0, MAX_ACTIVE_SKILLS_PER_BOT);
    }

    setApplying(true);
    try {
      await onApplySkills(nextIds);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec lors de l'activation des compétences.");
    } finally {
      setApplying(false);
    }
  }

  const groupedRecommendations = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, RecommendedSkillItem[]>();
    for (const item of result.recommended) {
      const group = item.groupFr || "Compétences Recommandées";
      const arr = map.get(group) ?? [];
      arr.push(item);
      map.set(group, arr);
    }
    return Array.from(map.entries()).map(([groupFr, items]) => ({ groupFr, items }));
  }, [result]);

  const checkedCount = checkedSlugs.size;

  return (
    <div
      data-testid="skill-advisor-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Conseiller IA de Compétences"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <button
        type="button"
        aria-label="Fermer le Conseiller IA"
        className="fixed inset-0 cursor-default"
        onClick={() => {
          if (!loading && !applying) onClose();
        }}
      />

      <div className="relative z-10 flex h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[#28282E] bg-[#111114] text-[#ECECEE] shadow-2xl sm:h-auto sm:max-h-[88vh] sm:rounded-2xl">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#222228] bg-[#151519] px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <Wand2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15.5px] font-semibold text-[#F4F4F6] sm:text-[17px]">
                  Conseiller IA de Compétences
                </h3>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
                  Max {MAX_ACTIVE_SKILLS_PER_BOT} skills / agent
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-[#8E8E95]">
                {botName
                  ? `Agent ciblé : ${botName} · Analyse intelligente des 3 538 compétences natives`
                  : "Décrivez le rôle de votre agent : l'IA parcourt les 3 538 compétences natives et sélectionne les meilleures."}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="skill-advisor-close-btn"
            aria-label="Fermer"
            disabled={loading || applying}
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-[#8E8E95] transition-colors hover:bg-[#222228] hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="rk-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {/* Mission Input Box */}
          <div className="rounded-xl border border-[#24242B] bg-[#16161B] p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="skill-advisor-goal-input"
                className="text-xs font-semibold tracking-wide text-[#D4D4D8] uppercase"
              >
                Mission & Spécialité de l'Agent
              </label>

              {/* Engine Route Switcher (99% OmniRoute Default) */}
              <div className="inline-flex items-center rounded-lg border border-[#2A2A32] bg-[#101013] p-0.5 text-[11px]">
                <button
                  type="button"
                  data-testid="advisor-engine-omniroute"
                  onClick={() => setEngine("omniroute")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    engine === "omniroute"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-[#85858A] hover:text-white"
                  }`}
                >
                  OmniRoute ($0)
                </button>
                <button
                  type="button"
                  data-testid="advisor-engine-openrouter"
                  onClick={() => setEngine("openrouter")}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    engine === "openrouter"
                      ? "bg-[#282830] text-white"
                      : "text-[#85858A] hover:text-white"
                  }`}
                >
                  OpenRouter
                </button>
              </div>
            </div>

            <textarea
              id="skill-advisor-goal-input"
              data-testid="skill-advisor-goal-input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              placeholder="Ex : Cet agent est spécialisé dans la rédaction d'articles de blog SEO orientés conversion, la recherche de mots-clés longue traîne et la mise en forme WordPress..."
              className="mt-2.5 w-full rounded-xl border border-[#2A2A32] bg-[#0D0D10] px-3.5 py-2.5 text-[16px] leading-relaxed text-[#F1F1F3] placeholder-[#686870] outline-none focus:border-emerald-500/60 sm:text-[13.5px]"
            />

            {/* Quick 1-Tap Presets (Horizontal Scroll on Mobile) */}
            <div className="mt-2.5">
              <span className="block text-[11px] text-[#7A7A82]">
                Exemples rapides en 1 tap :
              </span>
              <div className="rk-scroll mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                {SKILL_ADVISOR_PRESETS_FR.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`advisor-preset-${preset.id}`}
                    onClick={() => setGoal(preset.prompt)}
                    className="min-h-[38px] shrink-0 rounded-lg border border-[#2A2A32] bg-[#121216] px-3 py-1.5 text-xs font-medium text-[#C4C4CC] transition-colors hover:border-emerald-500/40 hover:text-white"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cap Selector + Primary Analyze CTA */}
            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#8E8E95]">Cible :</span>
                {[10, 15, 20].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    data-testid={`advisor-cap-${cap}`}
                    onClick={() => setMaxSkills(cap)}
                    className={`min-h-[38px] min-w-[44px] rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      maxSkills === cap
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : "border-[#2A2A32] bg-[#111115] text-[#9A9AA2] hover:text-white"
                    }`}
                  >
                    {cap === 20 ? "20 max" : `${cap}`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                data-testid="skill-advisor-submit-btn"
                disabled={loading || goal.trim().length < 3}
                onClick={() => void runAdvisor(false)}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13.5px] font-semibold text-black shadow-sm transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyse des 3 538 skills…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>
                      {result ? "Relancer la recommandation" : "Recommander les meilleures skills"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {error ? (
            <div
              data-testid="skill-advisor-error"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 text-xs text-rose-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          ) : null}

          {/* Results Area */}
          {result ? (
            <div data-testid="skill-advisor-results" className="space-y-4">
              {/* AI Strategy Summary Card */}
              <div className="rounded-xl border border-emerald-500/25 bg-[#131917] p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Compass className="h-4 w-4 shrink-0" />
                    <span>Diagnostic & Architecture de Compétences</span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#26332E] bg-[#0E1412] px-2.5 py-0.5 text-[11px] text-[#A7F3D0]">
                    <Cpu className="h-3 w-3" />
                    {result.engineUsed === "omniroute"
                      ? `OmniRoute (${result.resolvedModel || "combo/rakazo"})`
                      : result.engineUsed === "openrouter"
                        ? "OpenRouter"
                        : "Moteur Hybride BM25"}{" "}
                    · {result.totalCatalogScanned.toLocaleString("fr-FR")} skills scannées en{" "}
                    {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-[#E4E4E7]">
                  {result.summaryFr}
                </p>

                {result.facetsExplored.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {result.facetsExplored.map((facet) => (
                      <span
                        key={facet}
                        className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200"
                      >
                        {facet}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Selection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <span className="text-xs font-medium text-[#C4C4CC]">
                  <strong className="text-emerald-400">{checkedCount}</strong> /{" "}
                  {MAX_ACTIVE_SKILLS_PER_BOT} compétences cochées pour l'activation
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCheckedSlugs(
                        new Set(
                          result.recommended
                            .slice(0, MAX_ACTIVE_SKILLS_PER_BOT)
                            .map((item) => item.slug),
                        ),
                      )
                    }
                    className="min-h-[38px] rounded-lg border border-[#2A2A32] bg-[#17171C] px-2.5 py-1 text-xs text-[#D4D4D8] hover:text-white"
                  >
                    Tout cocher
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckedSlugs(new Set())}
                    className="min-h-[38px] rounded-lg border border-[#2A2A32] bg-[#17171C] px-2.5 py-1 text-xs text-[#9A9AA2] hover:text-white"
                  >
                    Tout décocher
                  </button>
                </div>
              </div>

              {/* Grouped Skill Cards */}
              <div className="space-y-3">
                {groupedRecommendations.map((group) => (
                  <div
                    key={group.groupFr}
                    className="overflow-hidden rounded-xl border border-[#25252C] bg-[#151519]"
                  >
                    <div className="flex items-center justify-between border-b border-[#222228] bg-[#18181E] px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Layers className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-xs font-semibold text-[#F1F1F4]">
                          {group.groupFr}
                        </span>
                      </div>
                      <span className="rounded-full bg-[#24242C] px-2 py-0.5 text-[10.5px] font-medium text-[#A1A1AA]">
                        {group.items.length} skill{group.items.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="divide-y divide-[#202026]">
                      {group.items.map((item) => {
                        const isChecked = checkedSlugs.has(item.slug);
                        const atCapAndUnchecked =
                          !isChecked && checkedSlugs.size >= MAX_ACTIVE_SKILLS_PER_BOT;
                        const isDirect = item.sizeBytes < 4096;
                        const alreadyOnBot = currentSlugs.includes(item.slug);

                        return (
                          <div
                            key={item.slug}
                            data-testid={`advisor-skill-card-${item.slug}`}
                            className={`flex items-start justify-between gap-3 px-3.5 py-3 transition-colors ${
                              isChecked ? "bg-emerald-500/[0.04]" : "hover:bg-white/[0.015]"
                            }`}
                          >
                            <button
                              type="button"
                              disabled={atCapAndUnchecked}
                              onClick={() => toggleRecommendedSlug(item.slug)}
                              className="flex min-h-[44px] min-w-0 flex-1 items-start gap-3 text-left disabled:opacity-45"
                            >
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                  isChecked
                                    ? "border-emerald-500 bg-emerald-500 text-black"
                                    : "border-[#3F3F46] bg-[#101014]"
                                }`}
                              >
                                {isChecked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                              </span>

                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[13px] font-semibold text-[#F4F4F6]">
                                    {item.name}
                                  </span>
                                  <span className="font-mono text-[10.5px] text-[#7A7A84]">
                                    ({item.slug})
                                  </span>
                                  {alreadyOnBot ? (
                                    <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">
                                      Déjà active
                                    </span>
                                  ) : null}
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                      isDirect
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-blue-500/10 text-blue-400"
                                    }`}
                                  >
                                    {isDirect
                                      ? "< 4 Ko · Direct"
                                      : `${(item.sizeBytes / 1024).toFixed(1)} Ko · Indexé`}
                                  </span>
                                </span>

                                <span className="mt-1 block text-xs leading-relaxed text-emerald-200/90">
                                  {item.reasonFr}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-[#85858E]">
                                  {item.description}
                                </span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleInspectSkill(item)}
                              title={`Lire le contenu complet de ${item.name}`}
                              aria-label={`Lire le contenu complet de ${item.name}`}
                              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[#282830] bg-[#18181E] text-[#A1A1AA] transition-colors hover:border-[#3F3F48] hover:text-white"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Conversational Refinement Input */}
              <div className="rounded-xl border border-[#24242C] bg-[#16161B] p-3">
                <label
                  htmlFor="skill-advisor-refinement"
                  className="block text-xs font-medium text-[#B8B8C2]"
                >
                  Affiner la sélection avec l'IA (optionnel)
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="skill-advisor-refinement"
                    data-testid="skill-advisor-refinement-input"
                    type="text"
                    value={refinement}
                    onChange={(e) => setRefinement(e.target.value)}
                    placeholder="Ex : Ajoute davantage de maillage interne et retire l'e-commerce…"
                    className="flex-1 rounded-xl border border-[#2A2A32] bg-[#0D0D10] px-3.5 py-2.5 text-[16px] text-[#F1F1F3] placeholder-[#686870] outline-none focus:border-emerald-500/60 sm:text-xs"
                  />
                  <button
                    type="button"
                    disabled={loading || !refinement.trim()}
                    onClick={() => void runAdvisor(true)}
                    className="flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    <span>Réajuster</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky Mobile Thumb-Zone Footer */}
        <div className="border-t border-[#222228] bg-[#151519] px-4 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-3.5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              disabled={applying}
              onClick={onClose}
              className="min-h-[44px] rounded-xl border border-[#2A2A32] bg-[#1A1A20] px-4 py-2 text-xs font-medium text-[#B8B8C0] transition-colors hover:text-white"
            >
              Annuler
            </button>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {result && currentSlugs.length > 0 ? (
                <button
                  type="button"
                  data-testid="skill-advisor-merge-btn"
                  disabled={applying || checkedCount === 0}
                  onClick={() => void applySelection("merge")}
                  className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  Fusionner avec l'existant (max {MAX_ACTIVE_SKILLS_PER_BOT})
                </button>
              ) : null}

              <button
                type="button"
                data-testid="skill-advisor-apply-btn"
                disabled={!result || applying || checkedCount === 0}
                onClick={() => void applySelection("replace")}
                className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-[13.5px] font-semibold text-black shadow-sm transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                <span>
                  {applying
                    ? "Activation en cours…"
                    : result
                      ? `Activer ces ${checkedCount} compétence${checkedCount > 1 ? "s" : ""}`
                      : "Lancez d'abord une recommandation"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full SKILL.md Preview Sheet */}
      {previewSkill ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-6"
        >
          <button
            type="button"
            aria-label="Fermer l'aperçu"
            className="fixed inset-0 cursor-default"
            onClick={() => setPreviewSkill(null)}
          />
          <div className="relative z-10 flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[#2C2C34] bg-[#141418] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:pb-0">
            <div className="flex items-center justify-between border-b border-[#24242C] px-4 py-3 sm:px-5">
              <div className="min-w-0 pr-2">
                <h4 className="truncate text-sm font-semibold text-[#F4F4F6]">
                  {previewSkill.name}
                </h4>
                <p className="font-mono text-[11px] text-[#7A7A84]">{previewSkill.slug}</p>
              </div>
              <button
                type="button"
                aria-label="Fermer l'aperçu"
                onClick={() => setPreviewSkill(null)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#8E8E95] hover:bg-[#222228] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rk-scroll flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-[#D4D4D8] sm:p-5">
              {previewSkill.loading ? (
                <p className="text-[#85858A]">Chargement du contenu intégral de la compétence…</p>
              ) : (
                <ChatMarkdown>{previewSkill.content}</ChatMarkdown>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
