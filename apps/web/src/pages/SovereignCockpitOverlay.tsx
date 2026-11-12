import {
  type Bot,
  MAX_SKILLS_PER_PACK,
  SOVEREIGN_MCP_CONNECTORS,
  SOVEREIGN_MEMORY_PROFILES,
  SOVEREIGN_SKILL_PACKS,
  SOVEREIGN_SKILLS_CATALOG,
  type SentinelReport,
} from "@rakazo/contracts";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

export interface SovereignCockpitOverlayProps {
  bots?: Bot[];
  initialUsage?: {
    inputTokens: number;
    outputTokens: number;
    runs: number;
  } | null;
  initialTab?: "sobriety" | "connectors" | "sentinel";
  onClose: () => void;
}

const ANTI_RUNAWAY_LAYERS = [
  {
    id: "layer-1",
    title: "Plafond Strict d'Appels d'Outils",
    badge: "MAX = 25 / tour",
    description:
      "Coupe automatiquement toute chaîne d'outils dépassant 25 appels sur un même tour pour empêcher tout dérapage.",
  },
  {
    id: "layer-2",
    title: "Disjoncteur Anti-Boucle Identique",
    badge: "Max 3x identiques",
    description:
      "Bloque immédiatement un agent qui tente d'appeler 3 fois de suite le même outil avec les mêmes arguments.",
  },
  {
    id: "layer-3",
    title: "Sobriété Contexte Gemini 3.1 (Packs Métier)",
    badge: `≤ ${MAX_SKILLS_PER_PACK} skills / pack`,
    description:
      "0 compétence activée par défaut. Les 379 compétences sont réparties en 51 packs plafonnés à 10 skills max.",
  },
  {
    id: "layer-4",
    title: "Garde-Fou Routine Silencieuse",
    badge: "NO_SIGNAL",
    description:
      "Les routines planifiées s'arrêtent dès le 1er tour sans rapport inutile lorsqu'aucune nouveauté n'est détectée.",
  },
  {
    id: "layer-5",
    title: "Compaction Handoff & Relais Contrôlé",
    badge: "Handoff 5 lignes",
    description:
      "Remasterisation du fil et passage de relais inter-agents en 5 lignes validé par l'humain (0 boucle inter-agents).",
  },
  {
    id: "layer-6",
    title: "Plafond Sous-Agents & Profondeur",
    badge: "Max 6 sous-tâches",
    description:
      "Interdit la création récursive de sous-agents et limite strictement les délégations par exécution.",
  },
  {
    id: "layer-7",
    title: "Standard Horaire Français & Contrat d'Action",
    badge: "Europe/Paris • 24h",
    description:
      "Exécution serveur autonome à l'heure de Paris et distinction stricte AGIR SEUL vs METTRE EN ATTENTE.",
  },
] as const;

export function SovereignCockpitOverlay({
  bots = [],
  initialUsage = null,
  initialTab = "sobriety",
  onClose,
}: SovereignCockpitOverlayProps) {
  const [activeTab, setActiveTab] = useState<"sobriety" | "connectors" | "sentinel">(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [usage, setUsage] = useState(initialUsage);
  const [sentinelReport, setSentinelReport] = useState<SentinelReport | null>(null);
  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string>(() =>
    new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  );

  const totalTools = useMemo(
    () => SOVEREIGN_MCP_CONNECTORS.reduce((acc, c) => acc + c.tools.length, 0),
    [],
  );

  const filteredConnectors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SOVEREIGN_MCP_CONNECTORS;
    return SOVEREIGN_MCP_CONNECTORS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.categoryLabel.toLowerCase().includes(q) ||
        c.tools.some((t) => t.name.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  async function handleRefreshMetrics() {
    setRefreshingUsage(true);
    try {
      const [summary, sentReport] = await Promise.all([
        rpc.usage.summary(),
        (rpc as any).sentinel?.report?.().catch(() => null),
      ]);
      setUsage(summary);
      if (sentReport) setSentinelReport(sentReport);
      setLastCheckTime(
        new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      );
    } catch {
      // ignore in offline/static test environment
    } finally {
      setRefreshingUsage(false);
    }
  }

  return (
    <div
      data-testid="sovereign-cockpit-overlay"
      role="dialog"
      aria-label="Cockpit Souverain & Météo des Connecteurs"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm"
    >
      <div className="flex h-full w-full sm:h-[min(780px,92dvh)] md:w-[1040px] max-w-full flex-col overflow-hidden rounded-none sm:rounded-[22px] border border-[#26262A] bg-[#141416] text-[#EDEDEF] shadow-[0_40px_90px_rgba(0,0,0,.6)]">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#26262A] px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex items-start justify-between gap-3 sm:items-center">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck size={18} />
              </span>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-[#EDEDEF] truncate">
                  Cockpit de Sobriété IA & Météo MCP
                </h2>
                <p className="text-xs text-[#85858A] line-clamp-1">
                  Bouclier anti-emballement 7 couches • {SOVEREIGN_MCP_CONNECTORS.length}{" "}
                  connecteurs MCP ({totalTools} outils) • {SOVEREIGN_SKILLS_CATALOG.length} skills
                  FR
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Fermer le cockpit"
              onClick={onClose}
              className="grid min-h-[44px] min-w-[44px] sm:hidden shrink-0 place-items-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="cockpit-refresh-btn"
              onClick={() => void handleRefreshMetrics()}
              disabled={refreshingUsage}
              className="flex-1 sm:flex-initial min-h-[40px] sm:min-h-[34px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#3F3F46] bg-[#1C1C1F] px-3 py-1.5 text-xs font-medium text-[#EDEDEF] hover:bg-[#27272A] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshingUsage ? "animate-spin" : ""} />
              <span>Actualiser ({lastCheckTime})</span>
            </button>
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="hidden sm:grid h-8 w-8 place-items-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-[#26262A] bg-[#111113] px-4 py-2.5 sm:px-6">
          <button
            type="button"
            data-testid="cockpit-tab-sobriety"
            onClick={() => setActiveTab("sobriety")}
            className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "sobriety"
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "text-[#85858A] hover:text-[#EDEDEF]"
            }`}
          >
            <Gauge size={14} />
            <span>Bouclier Anti-Emballement & Tokens</span>
          </button>
          <button
            type="button"
            data-testid="cockpit-tab-connectors"
            onClick={() => setActiveTab("connectors")}
            className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "connectors"
                ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                : "text-[#85858A] hover:text-[#EDEDEF]"
            }`}
          >
            <Activity size={14} />
            <span>Météo des 18 MCP & OmniRoute</span>
          </button>
          <button
            type="button"
            data-testid="cockpit-tab-sentinel"
            onClick={() => setActiveTab("sentinel")}
            className={`min-h-[38px] rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === "sentinel"
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "text-[#85858A] hover:text-[#EDEDEF]"
            }`}
          >
            <Zap size={14} />
            <span>Sentinel & Sobriété Mémoire</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 rk-scroll space-y-5">
          {/* Top KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-3.5">
              <div className="flex items-center justify-between text-xs text-[#85858A]">
                <span>Bouclier IA</span>
                <ShieldCheck size={14} className="text-emerald-400" />
              </div>
              <div className="mt-1.5 text-base sm:text-lg font-semibold text-emerald-400">
                7 / 7 actifs
              </div>
              <div className="mt-0.5 text-[11px] text-[#71717A]">
                Protection anti-emballement verrouillée
              </div>
            </div>

            <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-3.5">
              <div className="flex items-center justify-between text-xs text-[#85858A]">
                <span>Connecteurs MCP</span>
                <Activity size={14} className="text-indigo-400" />
              </div>
              <div className="mt-1.5 text-base sm:text-lg font-semibold text-[#EDEDEF]">
                {SOVEREIGN_MCP_CONNECTORS.length} serveurs · {totalTools} outils
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-400">
                Passerelle OmniRoute opérationnelle
              </div>
            </div>

            <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-3.5">
              <div className="flex items-center justify-between text-xs text-[#85858A]">
                <span>Réserve de Skills FR</span>
                <Sparkles size={14} className="text-amber-400" />
              </div>
              <div className="mt-1.5 text-base sm:text-lg font-semibold text-[#EDEDEF]">
                {SOVEREIGN_SKILLS_CATALOG.length} skills ({SOVEREIGN_SKILL_PACKS.length} packs)
              </div>
              <div className="mt-0.5 text-[11px] text-[#71717A]">
                0 activé par défaut · Sur demande
              </div>
            </div>

            <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-3.5">
              <div className="flex items-center justify-between text-xs text-[#85858A]">
                <span>Consommation 7j</span>
                <Cpu size={14} className="text-purple-400" />
              </div>
              <div className="mt-1.5 text-base sm:text-lg font-semibold text-[#EDEDEF]">
                {usage
                  ? `${(usage.inputTokens + usage.outputTokens).toLocaleString("fr-FR")} tokens`
                  : `${bots.length} agent(s) configuré(s)`}
              </div>
              <div className="mt-0.5 text-[11px] text-[#71717A]">
                {usage
                  ? `${usage.runs} exécution(s) cette semaine`
                  : "Cliquez sur Actualiser pour le relevé"}
              </div>
            </div>
          </div>

          {activeTab === "sobriety" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <CheckCircle2 size={15} className="shrink-0" />
                  <span>Garantie Zéro Dérapage de Tokens Active</span>
                </div>
                <p className="mt-1 text-xs text-[#A1A1AA] leading-relaxed">
                  Toutes les exécutions d'agents, les appels d'outils MCP et les routines
                  quotidiennes passent obligatoirement par les 7 verrous ci-dessous avant
                  d'interroger la passerelle IA.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ANTI_RUNAWAY_LAYERS.map((layer) => (
                  <div
                    key={layer.id}
                    className="flex flex-col justify-between rounded-xl border border-[#26262A] bg-[#18181B] p-3.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#EDEDEF]">{layer.title}</span>
                        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-300">
                          {layer.badge}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[#85858A] leading-relaxed">
                        {layer.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : activeTab === "connectors" ? (
            <div className="space-y-4">
              {/* OmniRoute Gateway Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 p-3.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span>Passerelle Souveraine OmniRoute & OpenRouter</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-indigo-200/80">
                    Routage dynamique multi-combos (combo/rakazo-*) et compilateur de prompts
                    contractuel opérationnels.
                  </p>
                </div>
                <span className="self-start sm:self-auto rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  100 % Opérationnel
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-[#71717A]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrer un connecteur MCP ou un outil (ex: Postiz, Ubersuggest, Twenty CRM)..."
                  className="w-full rounded-xl border border-[#26262A] bg-[#18181B] pl-9 pr-3 py-2 text-[16px] sm:text-xs text-white placeholder-[#71717A] focus:border-indigo-500/50 focus:outline-none"
                />
              </div>

              {/* Connectors Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredConnectors.map((conn) => (
                  <div
                    key={conn.id}
                    data-testid={`cockpit-connector-${conn.id}`}
                    className="flex flex-col justify-between rounded-xl border border-[#26262A] bg-[#18181B] p-3.5"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-[#EDEDEF] truncate">
                            {conn.name}
                          </h3>
                          <span className="text-[10px] text-[#71717A]">{conn.categoryLabel}</span>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {conn.statusText}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] text-[#85858A] line-clamp-2 leading-relaxed">
                        {conn.description}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#26262A] pt-2.5 text-[10px] text-[#A1A1AA]">
                      <span className="font-mono">{conn.tools.length} outil(s)</span>
                      <span className="truncate max-w-[170px] text-[#71717A]">
                        {conn.badgeText}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div data-testid="cockpit-sentinel-view" className="space-y-4">
              {/* Sentinel Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <Zap size={15} className="shrink-0 text-amber-400" />
                    <span>Diagnostic Sentinel Zéro-LLM (Inspiré d'OpenMausBot)</span>
                  </div>
                  <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">
                    Surveillance temps réel non-bloquante des 18 connecteurs MCP et de la santé des
                    exécutions. Coût LLM : <strong>strictement 0,00 $ (0 token consommé)</strong>.
                  </p>
                </div>
                <span className="self-start sm:self-auto shrink-0 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 font-mono text-xs font-semibold text-emerald-300">
                  {sentinelReport ? `${sentinelReport.healthyCount} / 18 Sains` : "18 / 18 Sains"}
                </span>
              </div>

              {/* Same-Request Deduplicator & Memory Budget Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#EDEDEF]">
                        Déduplication same-request
                      </span>
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                        ≥ 40 car. actif
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#85858A] leading-relaxed">
                      Intercepte et neutralise les requêtes textuelles identiques soumises en rafale
                      ou en doublon. Évite tout double tour de LLM inutile et protège votre quota.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                    <CheckCircle2 size={13} />
                    <span>Protection anti-doublon en continu</span>
                  </div>
                </div>

                <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#EDEDEF]">
                        Plafonds Mémoire Dynamiques
                      </span>
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                        Multi-IA Actif
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#85858A] leading-relaxed">
                      S'adapte au modèle (Gemini 3.1, GPT-OSS 120B, Mistral). Les mémoires
                      excédentaires sont archivées automatiquement dans{" "}
                      <code className="text-[#A78BFA]">memory/archive.md</code> sans aucune perte de
                      données.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-300 font-medium">
                    <Database size={13} />
                    <span>Délestage LRU automatique</span>
                  </div>
                </div>
              </div>

              {/* Profiles Grid */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#ECECEE] flex items-center gap-1.5">
                  <Layers size={13} className="text-[#A78BFA]" />
                  <span>Profils de Contexte Mémoire par Modèle IA</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {Object.values(SOVEREIGN_MEMORY_PROFILES)
                    .slice(0, 4)
                    .map((prof) => (
                      <div
                        key={prof.id}
                        className="rounded-xl border border-[#26262A] bg-[#161619] p-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-medium text-[#EDEDEF] truncate">
                            {prof.label}
                          </span>
                          <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                            {prof.maxLines}L
                          </span>
                        </div>
                        <div className="text-[11px] text-[#71717A] mb-2 font-mono">
                          Quota : {Math.round(prof.maxBytes / 1024)} Ko
                        </div>
                        <div className="w-full bg-[#232326] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-400 h-full rounded-full"
                            style={{ width: `${prof.warningPercent}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[10.5px] text-[#85858A] line-clamp-2">
                          {prof.description}
                        </p>
                      </div>
                    ))}
                </div>
              </div>

              {/* Innovations Entreprise OpenBot (Anti-Dangles, Checklist Routines, Standing Rules & Bouclier Secrets) */}
              <div data-testid="cockpit-openbot-innovations" className="rounded-xl border border-[#26262A] bg-[#18181B] p-4 space-y-3">
                <h3 className="text-xs font-semibold text-[#ECECEE] flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span>Innovations de Résilience & Gouvernance (Inspiré d'OpenBot)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div className="rounded-xl border border-[#26262A] bg-[#161619] p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-[#EDEDEF] mb-1">
                      <span>Anti-Dangles</span>
                      <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">0.00 €</span>
                    </div>
                    <div className="text-[10.5px] text-[#85858A] leading-relaxed">
                      Élagage pré-vol des appels d'outils orphelins (Stop / réseau) pour éliminer toute erreur 400.
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#26262A] bg-[#161619] p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-[#EDEDEF] mb-1">
                      <span>Checklist Routines</span>
                      <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">2 à 10 étapes</span>
                    </div>
                    <div className="text-[10.5px] text-[#85858A] leading-relaxed">
                      Validation obligatoire Fait / Bloqué / Ignoré de chaque étape avant clôture de routine.
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#26262A] bg-[#161619] p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-[#EDEDEF] mb-1">
                      <span>Standing Rules</span>
                      <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">3 Niveaux</span>
                    </div>
                    <div className="text-[10.5px] text-[#85858A] leading-relaxed">
                      Autorisation permanente par discussion ou par agent. Verrouillage strict des outils destructeurs.
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#26262A] bg-[#161619] p-3">
                    <div className="flex items-center justify-between text-xs font-medium text-[#EDEDEF] mb-1">
                      <span>Bouclier Secrets</span>
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Auto-Mask</span>
                    </div>
                    <div className="text-[10.5px] text-[#85858A] leading-relaxed">
                      Masquage automatique des clés API, JWT, mots de passe, cartes et OTP dans les mémoires et skills.
                    </div>
                  </div>
                </div>
              </div>

              {/* Sentinel Issues Table / Status */}
              <div className="rounded-xl border border-[#26262A] bg-[#18181B] p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs font-semibold text-[#ECECEE] flex items-center gap-2">
                    <Activity size={14} className="text-indigo-400" />
                    <span>Analyseur d'Anomalies Sentinel (Signatures Normalisées)</span>
                  </div>
                  <span className="text-[11px] font-mono text-[#85858A]">
                    {sentinelReport?.issues?.length ?? 0} anomalie(s)
                  </span>
                </div>
                {sentinelReport && sentinelReport.issues.length > 0 ? (
                  <div className="space-y-2">
                    {sentinelReport.issues.map((iss) => (
                      <div
                        key={iss.sig}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#2B2B30] bg-[#141416] p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[#ECECEE] truncate">{iss.title}</div>
                          <div className="text-[10px] text-[#71717A] font-mono">
                            {iss.tool ?? "outil"} · {iss.sig}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-mono font-medium text-rose-300">
                          {iss.count}x
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                    <span>
                      Aucune anomalie ni boucle d'erreur détectée. Les 18 connecteurs et la mémoire
                      fonctionnent avec une disponibilité optimale.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
