import { ChatMarkdown } from "@rakazo/chat-ui/web";
import {
  type CatalogSkillSummary,
  extractSovereignSkillSlug,
  MAX_ACTIVE_SKILLS_PER_BOT,
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
  UNIFIED_SKILL_CATEGORIES,
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
  Library,
  Loader2,
  Minus,
  Search,
  Share2,
  Shield,
  Sparkles,
  Wand2,
  Workflow,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";
import { SkillAdvisorModal } from "./SkillAdvisorModal";

export const RECOMMENDED_MAX_ACTIVE_SKILLS = MAX_ACTIVE_SKILLS_PER_BOT;

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
  botName?: string;
  botTitle?: string;
  botDescription?: string;
  botInstructions?: string;
}

export function BotSkillSelector({
  selectedSkillIds,
  onChange,
  availableSkills = [],
  botSkills = [],
  disabled = false,
  botName,
  botTitle,
  botDescription,
  botInstructions,
}: BotSkillSelectorProps) {
  const [browseMode, setBrowseMode] = useState<"packs" | "catalog">("packs");
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [capReachedNotice, setCapReachedNotice] = useState(false);

  // Packs mode state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "active" | "custom" | SovereignSkillCategoryId
  >("all");
  const [expandedPacks, setExpandedPacks] = useState<Record<string, boolean>>({});

  // Full 3,538+ Catalog mode state
  const [catalogCategory, setCatalogCategory] = useState<string>("all");
  const [catalogItems, setCatalogItems] = useState<CatalogSkillSummary[]>([]);
  const [catalogTotal, setCatalogTotal] = useState<number>(3538);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogOffset, setCatalogOffset] = useState<number>(0);
  const [resolvedCatalogMeta, setResolvedCatalogMeta] = useState<Map<string, CatalogSkillSummary>>(
    () => new Map(),
  );

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

  // Normalize selectedSkillIds into a Set of canonical slugs
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

  // Resolve metadata for any selected skill belonging to the 3,538 unified catalog (even before DB save)
  useEffect(() => {
    const unknownSlugs: string[] = [];
    for (const slug of selectedSlugsSet) {
      const inSov = SOVEREIGN_SKILLS_CATALOG.some((s) => s.slug.toLowerCase() === slug);
      const inDb = dbSkillBySlug.has(slug);
      const inResolved = resolvedCatalogMeta.has(slug);
      if (!inSov && !inDb && !inResolved) {
        unknownSlugs.push(slug);
      }
    }
    if (unknownSlugs.length === 0) return;

    let cancelled = false;
    void rpc.skills
      .searchCatalog({ onlySlugs: unknownSlugs, limit: 100 })
      .then((res) => {
        if (cancelled || res.items.length === 0) return;
        setResolvedCatalogMeta((prev) => {
          const next = new Map(prev);
          for (const item of res.items) {
            next.set(item.slug.toLowerCase(), item);
          }
          return next;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedSlugsSet, dbSkillBySlug, resolvedCatalogMeta]);

  // Debounced server-side search when browsing the full 3,538+ catalog
  useEffect(() => {
    if (browseMode !== "catalog") return;
    let cancelled = false;
    setCatalogLoading(true);

    const timer = setTimeout(() => {
      void rpc.skills
        .searchCatalog({
          query: searchQuery.trim() || undefined,
          categoryId: catalogCategory !== "all" ? catalogCategory : undefined,
          limit: 48,
          offset: 0,
        })
        .then((res) => {
          if (cancelled) return;
          setCatalogItems(res.items);
          setCatalogTotal(res.total);
          setCatalogOffset(res.items.length);
          setResolvedCatalogMeta((prev) => {
            const next = new Map(prev);
            for (const item of res.items) {
              next.set(item.slug.toLowerCase(), item);
            }
            return next;
          });
        })
        .catch(() => {
          if (!cancelled) setCatalogItems([]);
        })
        .finally(() => {
          if (!cancelled) setCatalogLoading(false);
        });
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [browseMode, searchQuery, catalogCategory]);

  async function handleLoadMoreCatalog() {
    if (catalogLoading) return;
    setCatalogLoading(true);
    try {
      const res = await rpc.skills.searchCatalog({
        query: searchQuery.trim() || undefined,
        categoryId: catalogCategory !== "all" ? catalogCategory : undefined,
        limit: 48,
        offset: catalogOffset,
      });
      setCatalogItems((prev) => [...prev, ...res.items]);
      setCatalogOffset((prev) => prev + res.items.length);
      setResolvedCatalogMeta((prev) => {
        const next = new Map(prev);
        for (const item of res.items) {
          next.set(item.slug.toLowerCase(), item);
        }
        return next;
      });
    } catch {
      // Ignore transient network hiccup
    } finally {
      setCatalogLoading(false);
    }
  }

  const isSlugSelected = useCallback(
    (slug: string, rawId?: string) => {
      if (rawId && selectedSkillIds.includes(rawId)) return true;
      return selectedSlugsSet.has(slug.toLowerCase());
    },
    [selectedSkillIds, selectedSlugsSet],
  );

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
        setCapReachedNotice(false);
        const next = selectedSkillIds.filter((id) => {
          if (fallbackId && id === fallbackId) return false;
          const dbS = dbSkillById.get(id);
          if (dbS && dbS.slug.toLowerCase() === lowerSlug) return false;
          return extractSovereignSkillSlug(id) !== lowerSlug;
        });
        onChange(next);
      } else {
        if (selectedSlugsSet.size >= MAX_ACTIVE_SKILLS_PER_BOT) {
          setCapReachedNotice(true);
          return;
        }
        setCapReachedNotice(false);
        const idToAdd = preferredIdForSlug(lowerSlug, fallbackId);
        if (!selectedSkillIds.includes(idToAdd)) {
          onChange([...selectedSkillIds, idToAdd]);
        }
      }
    },
    [
      disabled,
      isSlugSelected,
      selectedSkillIds,
      selectedSlugsSet.size,
      dbSkillById,
      preferredIdForSlug,
      onChange,
    ],
  );

  const togglePack = useCallback(
    (pack: SovereignSkillPack, enable: boolean) => {
      if (disabled) return;
      const packSlugs = new Set(pack.skills.map((s) => s.slug.toLowerCase()));

      const remaining = selectedSkillIds.filter((id) => {
        const dbS = dbSkillById.get(id);
        const slug = dbS ? dbS.slug.toLowerCase() : extractSovereignSkillSlug(id);
        return !packSlugs.has(slug);
      });

      if (!enable) {
        setCapReachedNotice(false);
        onChange(remaining);
        return;
      }

      const slotsLeft = Math.max(0, MAX_ACTIVE_SKILLS_PER_BOT - remaining.length);
      if (slotsLeft === 0) {
        setCapReachedNotice(true);
        return;
      }
      const toAdd = pack.skills
        .slice(0, slotsLeft)
        .map((s) => preferredIdForSlug(s.slug, s.id));
      if (toAdd.length < pack.skills.length) {
        setCapReachedNotice(true);
      } else {
        setCapReachedNotice(false);
      }
      onChange(Array.from(new Set([...remaining, ...toAdd])));
    },
    [disabled, selectedSkillIds, dbSkillById, preferredIdForSlug, onChange],
  );

  // Custom workspace skills (created manually by user and not part of Sovereign Starter Catalog)
  const customWorkspaceSkills = useMemo(() => {
    const sovereignSlugs = new Set(SOVEREIGN_SKILLS_CATALOG.map((s) => s.slug.toLowerCase()));
    const custom: SovereignSkillCatalogEntry[] = [];
    for (const s of availableSkills) {
      if (
        !sovereignSlugs.has(s.slug.toLowerCase()) &&
        s.metadata?.sovereign !== true
      ) {
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

  // Active skills resolved for summary pills & token metrics (supports all 3,538 unified skills!)
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
      const catMeta = resolvedCatalogMeta.get(slug);

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
          packName:
            typeof dbS.metadata?.packName === "string"
              ? (dbS.metadata.packName as string)
              : "Catalogue Natif",
        });
      } else if (catMeta) {
        list.push({
          id: rawId,
          slug: catMeta.slug,
          name: catMeta.name,
          sizeBytes: catMeta.sizeBytes,
          packName: catMeta.categoryLabel,
        });
      } else {
        list.push({
          id: rawId,
          slug,
          name: slug,
          sizeBytes: 3200,
          packName: "Catalogue Natif",
        });
      }
    }
    return list;
  }, [selectedSkillIds, dbSkillById, resolvedCatalogMeta]);

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

  async function handleOpenPreview(skill: {
    name: string;
    slug: string;
    description: string;
  }) {
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
              Compétences & Bibliothèque Native (3 538 Skills)
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              Max {MAX_SKILLS_PER_PACK} skills / pack · Plafond {MAX_ACTIVE_SKILLS_PER_BOT} / agent
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[#85858A]">
            Par défaut, aucune compétence n'est activée. Utilisez le{" "}
            <strong className="text-[#C4C4CC]">Conseiller IA</strong> ou parcourez manuellement les
            3 538 compétences natives.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="bot-skill-active-counter"
            className="rounded-lg border border-[#26262A] bg-[#141417] px-2.5 py-1.5 text-xs font-medium text-[#ECECEE]"
          >
            {activeSkillsResolved.length === 0
              ? "0 compétence active (Aucune par défaut)"
              : `${activeSkillsResolved.length} active(s) / ${MAX_ACTIVE_SKILLS_PER_BOT} max · ${directCount} directe(s) (${(
                  directBytes / 1024
                ).toFixed(1)} Ko), ${indexedCount} indexée(s)`}
          </span>
          {selectedSkillIds.length > 0 ? (
            <button
              type="button"
              data-testid="bot-skill-clear-all"
              disabled={disabled}
              onClick={() => {
                setCapReachedNotice(false);
                onChange([]);
              }}
              className="min-h-[44px] rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40 sm:min-h-[36px]"
            >
              Tout désactiver
            </button>
          ) : null}
        </div>
      </div>

      {/* Prominent AI Skill Advisor CTA Card (Mobile-First >= 48px target) */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-emerald-500/30 bg-[#121916] p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span className="text-[13px] font-semibold text-[#F1F1F4]">
              Conseiller IA de Compétences (OmniRoute)
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[#9CA3AF]">
            Décrivez la mission de cet agent : l'IA analyse les 3 538 skills et sélectionne jusqu'à{" "}
            {MAX_ACTIVE_SKILLS_PER_BOT} compétences sur-mesure.
          </p>
        </div>
        <button
          type="button"
          data-testid="open-skill-advisor-btn"
          disabled={disabled}
          onClick={() => setAdvisorOpen(true)}
          className="flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-black shadow-sm transition-colors hover:bg-emerald-400 disabled:opacity-45 sm:w-auto"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Conseiller & Activer par IA</span>
        </button>
      </div>

      {/* Interactive 20-skill Cap Notice */}
      {capReachedNotice ? (
        <div
          data-testid="bot-skill-cap-notice"
          className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200"
        >
          <span>
            Plafond optimal atteint ({MAX_ACTIVE_SKILLS_PER_BOT}/{MAX_ACTIVE_SKILLS_PER_BOT}{" "}
            compétences actives). Retirez une compétence avant d'en activer une nouvelle.
          </span>
          <button
            type="button"
            onClick={() => setCapReachedNotice(false)}
            className="rounded p-1 text-amber-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Warning if > 20 skills passed externally */}
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
            simultanément lors d'un tour. Privilégiez {RECOMMENDED_MAX_ACTIVE_SKILLS} compétences
            maximum par agent.
          </div>
        </div>
      ) : null}

      {/* Active Skills Pills */}
      {activeSkillsResolved.length > 0 ? (
        <div
          data-testid="bot-skill-active-pills"
          className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-[#26262A] bg-[#111114] p-2.5"
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
                <span className="max-w-[185px] truncate font-medium">{skill.name}</span>
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

      {/* Manual Mode Switcher: Starter Packs vs Full 3,538 Catalog */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#26262A] bg-[#111114] p-1">
        <button
          type="button"
          data-testid="browse-mode-packs"
          onClick={() => setBrowseMode("packs")}
          className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            browseMode === "packs"
              ? "bg-[#24242A] text-white shadow-xs"
              : "text-[#8E8E95] hover:text-white"
          }`}
        >
          <Boxes className="h-3.5 w-3.5" />
          <span>Packs Métier ({allPacks.length})</span>
        </button>
        <button
          type="button"
          data-testid="browse-mode-catalog"
          onClick={() => setBrowseMode("catalog")}
          className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            browseMode === "catalog"
              ? "bg-emerald-500/20 text-emerald-300 shadow-xs"
              : "text-[#8E8E95] hover:text-white"
          }`}
        >
          <Library className="h-3.5 w-3.5" />
          <span>Catalogue Complet (3 538)</span>
        </button>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
          <input
            type="text"
            data-testid="bot-skill-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              browseMode === "catalog"
                ? "Rechercher parmi les 3 538 compétences (ex: blog, seo, copywriting, nextjs, n8n, prisma...)"
                : "Rechercher un pack ou une compétence (ex: SEO, WordPress, n8n, Coolify, Playwright...)"
            }
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
        {browseMode === "packs" ? (
          <div className="rk-scroll flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`min-h-[40px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-[32px] ${
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
              className={`min-h-[40px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-[32px] ${
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
                className={`min-h-[40px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-[32px] ${
                  selectedCategory === cat.id
                    ? "bg-white text-black"
                    : "border border-[#26262A] bg-[#16161A] text-[#A1A1AA] hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="rk-scroll flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCatalogCategory("all")}
              className={`min-h-[40px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-[32px] ${
                catalogCategory === "all"
                  ? "bg-white text-black"
                  : "border border-[#26262A] bg-[#16161A] text-[#A1A1AA] hover:text-white"
              }`}
            >
              Toutes ({catalogTotal.toLocaleString("fr-FR")})
            </button>
            {UNIFIED_SKILL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCatalogCategory(cat.id)}
                className={`min-h-[40px] shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-[32px] ${
                  catalogCategory === cat.id
                    ? "bg-white text-black"
                    : "border border-[#26262A] bg-[#16161A] text-[#A1A1AA] hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main List: Starter Packs OR Full 3,538 Server-Paginated Catalog */}
      {browseMode === "packs" ? (
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {filteredPacks.length === 0 ? (
            <div className="space-y-2 rounded-xl border border-[#26262A] bg-[#141417] p-6 text-center text-xs text-[#71717A]">
              <p>Aucun pack de démarrage ne correspond à « {searchQuery} ».</p>
              <button
                type="button"
                onClick={() => setBrowseMode("catalog")}
                className="min-h-[40px] rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
              >
                Rechercher dans le Catalogue Complet (3 538 skills) →
              </button>
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
                              className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-lg border border-[#26262A] bg-[#18181C] text-[#A1A1AA] transition-colors hover:border-[#3A3A40] hover:text-white sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0"
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
      ) : (
        <div
          data-testid="unified-catalog-results"
          className="max-h-[440px] space-y-1.5 overflow-y-auto rounded-xl border border-[#26262A] bg-[#121216] p-2.5"
        >
          {catalogLoading && catalogItems.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#8E8E95]">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              <span>Recherche dans les 3 538 compétences natives…</span>
            </div>
          ) : catalogItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#71717A]">
              Aucune compétence trouvée pour cette requête.
            </div>
          ) : (
            <>
              <div className="px-1 pb-1 text-[11px] text-[#85858A]">
                {catalogTotal.toLocaleString("fr-FR")} compétence(s) trouvée(s) · Affichage de{" "}
                {catalogItems.length}
              </div>
              <div className="divide-y divide-[#1E1E24]">
                {catalogItems.map((item) => {
                  const active = isSlugSelected(item.slug, item.id);
                  const isDirect = item.sizeBytes < 4096;
                  return (
                    <div
                      key={item.slug}
                      data-testid={`catalog-skill-${item.slug}`}
                      className="flex min-h-[48px] items-center justify-between gap-2.5 py-2.5"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={active}
                          disabled={disabled}
                          onChange={() => toggleSingleSkill(item.slug, item.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-[#3A3A40] bg-[#1B1B1F] accent-emerald-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#F1F1F3]">
                              {item.name}
                            </span>
                            <span className="font-mono text-[10.5px] text-[#6C6C72]">
                              ({item.slug})
                            </span>
                            <span className="rounded bg-[#1F1F26] px-1.5 py-0.5 text-[10px] text-[#A1A1AA]">
                              {item.categoryLabel}
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
                                : `${(item.sizeBytes / 1024).toFixed(1)} Ko · Indexé`}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[11px] text-[#8E8E95]">
                            {item.description}
                          </span>
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={() => void handleOpenPreview(item)}
                        title={`Aperçu de ${item.name}`}
                        aria-label={`Aperçu de ${item.name}`}
                        className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-lg border border-[#26262A] bg-[#18181C] text-[#A1A1AA] transition-colors hover:border-[#3A3A40] hover:text-white sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {catalogItems.length < catalogTotal ? (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    disabled={catalogLoading}
                    onClick={() => void handleLoadMoreCatalog()}
                    className="min-h-[42px] w-full rounded-xl border border-[#2C2C34] bg-[#18181E] px-4 py-2 text-xs font-medium text-[#D4D4D8] transition-colors hover:border-emerald-500/40 hover:text-white"
                  >
                    {catalogLoading
                      ? "Chargement…"
                      : `Afficher plus (${catalogItems.length} / ${catalogTotal.toLocaleString("fr-FR")})`}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* AI Skill Advisor Modal */}
      <SkillAdvisorModal
        isOpen={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        botName={botName}
        botTitle={botTitle}
        botDescription={botDescription}
        botInstructions={botInstructions}
        currentSkillIds={selectedSkillIds}
        onApplySkills={(nextIds) => {
          setCapReachedNotice(false);
          const resolvedNext = nextIds
            .slice(0, MAX_ACTIVE_SKILLS_PER_BOT)
            .map((id) => preferredIdForSlug(extractSovereignSkillSlug(id), id));
          onChange(resolvedNext);
        }}
      />

      {/* Quick Skill Markdown Preview Modal */}
      {previewSkill ? (
        <div
          data-testid="bot-skill-preview-modal"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-xs sm:items-center sm:p-6"
        >
          <button
            type="button"
            aria-label="Fermer l'aperçu"
            className="fixed inset-0 cursor-default"
            onClick={() => setPreviewSkill(null)}
          />
          <div className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[#2C2C32] bg-[#141417] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[85vh] sm:rounded-2xl sm:pb-0">
            <div className="flex items-center justify-between border-b border-[#26262A] px-4 py-3 sm:px-5 sm:py-3.5">
              <div className="min-w-0 pr-2">
                <h4 className="truncate text-sm font-semibold text-[#F1F1F3]">
                  {previewSkill.name}
                </h4>
                <p className="font-mono text-[11px] text-[#71717A]">{previewSkill.slug}</p>
              </div>
              <button
                type="button"
                aria-label="Fermer l'aperçu"
                onClick={() => setPreviewSkill(null)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rk-scroll flex-1 overflow-y-auto p-4 text-xs leading-relaxed text-[#D4D4D8] sm:p-5">
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
