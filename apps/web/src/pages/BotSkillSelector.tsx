import { ChatMarkdown } from "@rakazo/chat-ui/web";
import {
  extractSovereignSkillSlug,
  MAX_SKILLS_PER_PACK,
  type Skill,
  type SkillSummary,
  SOVEREIGN_SKILL_CATEGORIES,
  SOVEREIGN_SKILL_PACKS,
  SOVEREIGN_SKILLS_CATALOG,
  type SovereignSkillCatalogEntry,
  type SovereignSkillCategoryId,
  type SovereignSkillPack,
  toSovereignSkillId,
} from "@rakazo/contracts";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  Eye,
  Globe,
  LayoutGrid,
  Minus,
  Search,
  Share2,
  Shield,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

export const RECOMMENDED_MAX_ACTIVE_SKILLS = 20;

function renderPackIcon(iconName: string, className = "h-4 w-4") {
  switch (iconName) {
    case "Globe":
      return <Globe className={className} />;
    case "Search":
      return <Search className={className} />;
    case "BookOpen":
      return <BookOpen className={className} />;
    case "Share2":
      return <Share2 className={className} />;
    case "LayoutGrid":
      return <LayoutGrid className={className} />;
    case "Workflow":
      return <Workflow className={className} />;
    case "Cloud":
      return <Cloud className={className} />;
    case "Cpu":
      return <Cpu className={className} />;
    case "Shield":
      return <Shield className={className} />;
    case "Sparkles":
      return <Sparkles className={className} />;
    default:
      return <Boxes className={className} />;
  }
}

interface TriStateSwitchProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (nextChecked: boolean) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
}

function PackTriStateSwitch({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  testId,
}: TriStateSwitchProps) {
  const switchId = useId();
  return (
    <button
      type="button"
      id={switchId}
      data-testid={testId}
      role="switch"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked || indeterminate);
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#17171A] ${
        indeterminate ? "bg-amber-500/80" : checked ? "bg-emerald-500" : "bg-[#2A2A2E]"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span
        className={`pointer-events-none inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked && !indeterminate
            ? "translate-x-5"
            : indeterminate
              ? "translate-x-2.5"
              : "translate-x-0"
        }`}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3 text-amber-600" strokeWidth={3} />
        ) : checked ? (
          <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} />
        ) : null}
      </span>
    </button>
  );
}

export interface BotSkillSelectorProps {
  selectedSkillIds: string[];
  onChange: (nextSkillIds: string[]) => void;
  availableSkills?: SkillSummary[];
  botSkills?: Skill[];
  disabled?: boolean;
}

export function BotSkillSelector({
  selectedSkillIds,
  onChange,
  availableSkills = [],
  botSkills = [],
  disabled = false,
}: BotSkillSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "active" | "custom" | SovereignSkillCategoryId
  >("all");
  const [expandedPacks, setExpandedPacks] = useState<Record<string, boolean>>({});
  const [previewSkill, setPreviewSkill] = useState<{
    name: string;
    slug: string;
    description: string;
    content: string;
    loading: boolean;
  } | null>(null);

  // Map slug -> DB skill id (when materialized in workspace DB)
  const dbSkillBySlug = useMemo(() => {
    const map = new Map<string, SkillSummary | Skill>();
    for (const s of availableSkills) {
      map.set(s.slug.toLowerCase(), s);
    }
    for (const s of botSkills) {
      map.set(s.slug.toLowerCase(), s);
    }
    return map;
  }, [availableSkills, botSkills]);

  const dbSkillById = useMemo(() => {
    const map = new Map<string, SkillSummary | Skill>();
    for (const s of availableSkills) {
      map.set(s.id, s);
    }
    for (const s of botSkills) {
      map.set(s.id, s);
    }
    return map;
  }, [availableSkills, botSkills]);

  // Normalize selectedSkillIds into a Set of canonical slugs + raw IDs
  const selectedSlugsSet = useMemo(() => {
    const slugs = new Set<string>();
    for (const rawId of selectedSkillIds) {
      const dbSkill = dbSkillById.get(rawId);
      if (dbSkill) {
        slugs.add(dbSkill.slug.toLowerCase());
      } else {
        slugs.add(extractSovereignSkillSlug(rawId));
      }
    }
    return slugs;
  }, [selectedSkillIds, dbSkillById]);

  const isSlugSelected = useCallback(
    (slug: string, rawId?: string) => {
      if (rawId && selectedSkillIds.includes(rawId)) return true;
      return selectedSlugsSet.has(slug.toLowerCase());
    },
    [selectedSkillIds, selectedSlugsSet],
  );

  // Convert a target slug into the preferred ID to store in selectedSkillIds
  const preferredIdForSlug = useCallback(
    (slug: string, fallbackId?: string) => {
      const dbMatch = dbSkillBySlug.get(slug.toLowerCase());
      if (dbMatch) return dbMatch.id;
      return fallbackId ?? toSovereignSkillId(slug);
    },
    [dbSkillBySlug],
  );

  const toggleSingleSkill = useCallback(
    (slug: string, fallbackId?: string) => {
      if (disabled) return;
      const lowerSlug = slug.toLowerCase();
      const currentlySelected = isSlugSelected(lowerSlug, fallbackId);

      if (currentlySelected) {
        const next = selectedSkillIds.filter((id) => {
          if (fallbackId && id === fallbackId) return false;
          const dbS = dbSkillById.get(id);
          if (dbS && dbS.slug.toLowerCase() === lowerSlug) return false;
          return extractSovereignSkillSlug(id) !== lowerSlug;
        });
        onChange(next);
      } else {
        const idToAdd = preferredIdForSlug(lowerSlug, fallbackId);
        if (!selectedSkillIds.includes(idToAdd)) {
          onChange([...selectedSkillIds, idToAdd]);
        }
      }
    },
    [disabled, isSlugSelected, selectedSkillIds, dbSkillById, preferredIdForSlug, onChange],
  );

  const togglePack = useCallback(
    (pack: SovereignSkillPack, enable: boolean) => {
      if (disabled) return;
      const packSlugs = new Set(pack.skills.map((s) => s.slug.toLowerCase()));

      // Remove any existing IDs belonging to this pack first
      const remaining = selectedSkillIds.filter((id) => {
        const dbS = dbSkillById.get(id);
        const slug = dbS ? dbS.slug.toLowerCase() : extractSovereignSkillSlug(id);
        return !packSlugs.has(slug);
      });

      if (!enable) {
        onChange(remaining);
        return;
      }

      const toAdd = pack.skills.map((s) => preferredIdForSlug(s.slug, s.id));
      onChange(Array.from(new Set([...remaining, ...toAdd])));
    },
    [disabled, selectedSkillIds, dbSkillById, preferredIdForSlug, onChange],
  );

  // Custom workspace skills (created manually by user and not part of Sovereign Catalog)
  const customWorkspaceSkills = useMemo(() => {
    const sovereignSlugs = new Set(SOVEREIGN_SKILLS_CATALOG.map((s) => s.slug.toLowerCase()));
    const custom: SovereignSkillCatalogEntry[] = [];
    for (const s of availableSkills) {
      if (!sovereignSlugs.has(s.slug.toLowerCase())) {
        custom.push({
          id: s.id,
          slug: s.slug,
          name: s.name,
          description: s.description,
          packId: "custom_workspace",
          packName: "Compétences personnalisées du Workspace",
          category: "automation_ai",
          tags: s.tags,
          sizeBytes:
            typeof s.metadata?.sizeBytes === "number" ? (s.metadata.sizeBytes as number) : 1500,
        });
      }
    }
    return custom;
  }, [availableSkills]);

  const allPacks = useMemo<SovereignSkillPack[]>(() => {
    if (customWorkspaceSkills.length === 0) return SOVEREIGN_SKILL_PACKS;
    const customChunks: SovereignSkillPack[] = [];
    for (let i = 0; i < customWorkspaceSkills.length; i += MAX_SKILLS_PER_PACK) {
      const chunk = customWorkspaceSkills.slice(i, i + MAX_SKILLS_PER_PACK);
      const idx = Math.floor(i / MAX_SKILLS_PER_PACK) + 1;
      customChunks.push({
        id: idx === 1 ? "custom_workspace" : `custom_workspace_${idx}`,
        name: idx === 1 ? "Compétences Personnalisées" : `Compétences Personnalisées (${idx})`,
        description: "Compétences créées ou importées manuellement dans votre espace de travail.",
        category: "automation_ai",
        icon: "Sparkles",
        skills: chunk,
      });
    }
    return [...customChunks, ...SOVEREIGN_SKILL_PACKS];
  }, [customWorkspaceSkills]);

  // Active skills resolved for summary pills & token metrics
  const activeSkillsResolved = useMemo(() => {
    const list: {
      id: string;
      slug: string;
      name: string;
      sizeBytes: number;
      packName: string;
    }[] = [];

    for (const rawId of selectedSkillIds) {
      const dbS = dbSkillById.get(rawId);
      const slug = dbS ? dbS.slug.toLowerCase() : extractSovereignSkillSlug(rawId);
      const sov = SOVEREIGN_SKILLS_CATALOG.find((s) => s.slug.toLowerCase() === slug);
      if (sov) {
        list.push({
          id: rawId,
          slug: sov.slug,
          name: dbS?.name || sov.name,
          sizeBytes: sov.sizeBytes,
          packName: sov.packName,
        });
      } else if (dbS) {
        const sizeBytes =
          "content" in dbS && typeof dbS.content === "string" && dbS.content.length > 0
            ? dbS.content.length
            : typeof dbS.metadata?.sizeBytes === "number"
              ? (dbS.metadata.sizeBytes as number)
              : 1500;
        list.push({
          id: rawId,
          slug: dbS.slug,
          name: dbS.name,
          sizeBytes,
          packName: "Personnalisé",
        });
      }
    }
    return list;
  }, [selectedSkillIds, dbSkillById]);

  const { directCount, directBytes, indexedCount } = useMemo(() => {
    let dCount = 0;
    let dBytes = 0;
    let iCount = 0;
    for (const s of activeSkillsResolved.slice(0, RECOMMENDED_MAX_ACTIVE_SKILLS)) {
      if (s.sizeBytes < 4096 && dBytes + s.sizeBytes <= 12288) {
        dCount += 1;
        dBytes += s.sizeBytes;
      } else {
        iCount += 1;
      }
    }
    return { directCount: dCount, directBytes: dBytes, indexedCount: iCount };
  }, [activeSkillsResolved]);

  // Filtered packs based on category + search query
  const filteredPacks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPacks
      .map((pack) => {
        if (selectedCategory === "custom" && !pack.id.startsWith("custom_workspace")) {
          return null;
        }
        if (
          selectedCategory !== "all" &&
          selectedCategory !== "active" &&
          selectedCategory !== "custom" &&
          pack.category !== selectedCategory
        ) {
          return null;
        }

        const matchingSkills = pack.skills.filter((skill) => {
          if (selectedCategory === "active" && !isSlugSelected(skill.slug, skill.id)) {
            return false;
          }
          if (!q) return true;
          return (
            skill.name.toLowerCase().includes(q) ||
            skill.slug.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q) ||
            pack.name.toLowerCase().includes(q) ||
            skill.tags.some((t) => t.toLowerCase().includes(q))
          );
        });

        if (matchingSkills.length === 0) return null;
        return {
          ...pack,
          visibleSkills: matchingSkills,
        };
      })
      .filter(
        (p): p is SovereignSkillPack & { visibleSkills: SovereignSkillCatalogEntry[] } =>
          p !== null,
      );
  }, [allPacks, selectedCategory, searchQuery, isSlugSelected]);

  async function handleOpenPreview(skill: SovereignSkillCatalogEntry) {
    setPreviewSkill({
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      content: "",
      loading: true,
    });
    try {
      const full = await rpc.skills.get({ slug: skill.slug });
      setPreviewSkill({
        name: full.name,
        slug: full.slug,
        description: full.description,
        content: full.content,
        loading: false,
      });
    } catch {
      setPreviewSkill({
        name: skill.name,
        slug: skill.slug,
        description: skill.description,
        content: `# ${skill.name}\n\n${skill.description}`,
        loading: false,
      });
    }
  }

  return (
    <div data-testid="bot-skill-selector" className="space-y-4">
      {/* Header & Token Sobriety Indicator */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14.5px] font-semibold text-[#ECECEE]">
              Compétences & Packs Métiers (Skills)
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              Max {MAX_SKILLS_PER_PACK} skills / pack
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#85858A]">
            Par défaut, aucun skill n'est activé. Activez uniquement les packs ou compétences utiles
            à la mission de cet agent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="bot-skill-active-counter"
            className="rounded-lg border border-[#26262A] bg-[#141417] px-2.5 py-1 text-xs font-medium text-[#ECECEE]"
          >
            {activeSkillsResolved.length === 0
              ? "0 compétence active"
              : `${activeSkillsResolved.length} active(s) · ${directCount} directe(s) (${(
                  directBytes / 1024
                ).toFixed(1)} Ko), ${indexedCount} indexée(s)`}
          </span>
          {selectedSkillIds.length > 0 ? (
            <button
              type="button"
              data-testid="bot-skill-clear-all"
              disabled={disabled}
              onClick={() => onChange([])}
              className="min-h-[36px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40"
            >
              Tout désactiver
            </button>
          ) : null}
        </div>
      </div>

      {/* Warning if > 20 skills selected */}
      {activeSkillsResolved.length > RECOMMENDED_MAX_ACTIVE_SKILLS ? (
        <div
          data-testid="bot-skill-overload-warning"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">
              Sobriété Gemini 3.1 ({activeSkillsResolved.length} compétences sélectionnées) :
            </span>{" "}
            Pour garantir une précision chirurgicale et préserver le contexte du modèle, seules les{" "}
            <strong>{RECOMMENDED_MAX_ACTIVE_SKILLS} premières compétences</strong> seront injectées
            simultanément lors d'un tour. Privilégiez 1 à 2 Packs ciblés par agent.
          </div>
        </div>
      ) : null}

      {/* Active Skills Pills */}
      {activeSkillsResolved.length > 0 ? (
        <div
          data-testid="bot-skill-active-pills"
          className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-[#26262A] bg-[#111114] p-2.5"
        >
          {activeSkillsResolved.map((skill) => {
            const isDirect = skill.sizeBytes < 4096;
            return (
              <span
                key={skill.slug}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#2A2A30] bg-[#18181C] px-2.5 py-1 text-xs text-[#ECECEE]"
              >
                <span
                  title={
                    isDirect ? "Injection directe (< 4 Ko)" : "Indexé via read_skill (>= 4 Ko)"
                  }
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isDirect ? "bg-emerald-400" : "bg-blue-400"
                  }`}
                />
                <span className="max-w-[180px] truncate font-medium">{skill.name}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleSingleSkill(skill.slug, skill.id)}
                  aria-label={`Retirer ${skill.name}`}
                  className="ml-0.5 text-[#71717A] transition-colors hover:text-rose-400"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Search & Category Filter Bar */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
          <input
            type="text"
            data-testid="bot-skill-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un pack ou une compétence (ex: SEO, WordPress, n8n, Coolify, Playwright...)"
            className="w-full rounded-xl border border-[#26262A] bg-[#141417] py-2.5 pr-9 pl-9 text-[16px] text-[#ECECEE] placeholder-[#6C6C72] outline-none focus:border-emerald-500/50 sm:text-xs"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-[#71717A] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              selectedCategory === "all"
                ? "bg-white text-black"
                : "border border-[#26262A] bg-[#16161A] text-[#A1A1AA] hover:text-white"
            }`}
          >
            Tous ({allPacks.length} packs)
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("active")}
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              selectedCategory === "active"
                ? "bg-emerald-500 text-black"
                : "border border-[#26262A] bg-[#16161A] text-[#A1A1AA] hover:text-white"
            }`}
          >
            Actifs ({activeSkillsResolved.length})
          </button>
          {SOVEREIGN_SKILL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat.id
                  ? "bg-white text-black"
                  : "border border-[#26262A] bg-[#16161A] text-[#A1A1AA] hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pack Accordions List */}
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {filteredPacks.length === 0 ? (
          <div className="rounded-xl border border-[#26262A] bg-[#141417] p-6 text-center text-xs text-[#71717A]">
            Aucune compétence ou pack ne correspond à votre filtre.
          </div>
        ) : (
          filteredPacks.map((pack) => {
            const totalInPack = pack.skills.length;
            const enabledInPack = pack.skills.filter((s) => isSlugSelected(s.slug, s.id)).length;
            const allEnabled = totalInPack > 0 && enabledInPack === totalInPack;
            const someEnabled = enabledInPack > 0 && enabledInPack < totalInPack;
            const isExpanded = Boolean(expandedPacks[pack.id]) || searchQuery.trim().length > 0;

            return (
              <div
                key={pack.id}
                data-testid={`skill-pack-card-${pack.id}`}
                className={`overflow-hidden rounded-xl border transition-colors ${
                  allEnabled
                    ? "border-emerald-500/40 bg-[#151918]"
                    : someEnabled
                      ? "border-amber-500/35 bg-[#17171A]"
                      : "border-[#26262A] bg-[#141417]"
                }`}
              >
                {/* Pack Header */}
                <div className="flex min-h-[52px] items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPacks((prev) => ({
                        ...prev,
                        [pack.id]: !prev[pack.id],
                      }))
                    }
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#2C2C32] bg-[#1C1C21] text-[#D4D4D8]">
                      {renderPackIcon(pack.icon, "h-3.5 w-3.5")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-[#F1F1F3]">
                          {pack.name}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                            allEnabled
                              ? "bg-emerald-500/20 text-emerald-300"
                              : someEnabled
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-[#222227] text-[#8E8E95]"
                          }`}
                        >
                          {enabledInPack}/{totalInPack} skills
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11.5px] text-[#85858A]">
                        {pack.description}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2.5">
                    <PackTriStateSwitch
                      testId={`pack-toggle-${pack.id}`}
                      checked={allEnabled}
                      indeterminate={someEnabled}
                      disabled={disabled}
                      label={`Activer le pack ${pack.name}`}
                      onChange={(nextChecked) => togglePack(pack, nextChecked)}
                    />
                    <button
                      type="button"
                      aria-label={
                        isExpanded ? "Masquer les compétences" : "Afficher les compétences"
                      }
                      onClick={() =>
                        setExpandedPacks((prev) => ({
                          ...prev,
                          [pack.id]: !prev[pack.id],
                        }))
                      }
                      className="text-[#71717A] hover:text-white"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Skills List inside Pack */}
                {isExpanded ? (
                  <div className="divide-y divide-[#222226] border-t border-[#222226] bg-[#101013] px-3 py-1.5">
                    {pack.visibleSkills.map((skill) => {
                      const active = isSlugSelected(skill.slug, skill.id);
                      const isDirect = skill.sizeBytes < 4096;
                      return (
                        <div
                          key={skill.slug}
                          data-testid={`skill-item-${skill.slug}`}
                          className="flex min-h-[44px] items-center justify-between gap-2.5 py-2"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={active}
                              disabled={disabled}
                              onChange={() => toggleSingleSkill(skill.slug, skill.id)}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-[#3A3A40] bg-[#1B1B1F] accent-emerald-500"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium text-[#ECECEE]">
                                  {skill.name}
                                </span>
                                <span className="font-mono text-[10.5px] text-[#6C6C72]">
                                  ({skill.slug})
                                </span>
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    isDirect
                                      ? "bg-emerald-500/10 text-emerald-400"
                                      : "bg-blue-500/10 text-blue-400"
                                  }`}
                                >
                                  {isDirect
                                    ? "< 4 Ko · Direct"
                                    : `${(skill.sizeBytes / 1024).toFixed(1)} Ko · Indexé`}
                                </span>
                              </span>
                              <span className="mt-0.5 line-clamp-1 block text-[11px] text-[#85858A]">
                                {skill.description}
                              </span>
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => void handleOpenPreview(skill)}
                            title={`Aperçu de ${skill.name}`}
                            aria-label={`Aperçu de ${skill.name}`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#26262A] bg-[#18181C] text-[#A1A1AA] transition-colors hover:border-[#3A3A40] hover:text-white"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Quick Skill Markdown Preview Modal */}
      {previewSkill ? (
        <div
          data-testid="bot-skill-preview-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs sm:p-6"
        >
          <button
            type="button"
            aria-label="Fermer l'aperçu"
            className="fixed inset-0 cursor-default"
            onClick={() => setPreviewSkill(null)}
          />
          <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#2C2C32] bg-[#141417] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#26262A] px-5 py-3.5">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold text-[#F1F1F3]">
                  {previewSkill.name}
                </h4>
                <p className="font-mono text-[11px] text-[#71717A]">{previewSkill.slug}</p>
              </div>
              <button
                type="button"
                aria-label="Fermer l'aperçu"
                onClick={() => setPreviewSkill(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-xs leading-relaxed text-[#D4D4D8]">
              {previewSkill.loading ? (
                <p className="text-[#85858A]">Chargement du contenu de la compétence…</p>
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
