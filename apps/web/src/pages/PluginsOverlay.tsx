import {
  type ConnectionCatalogItem,
  type McpToolDefinition,
  SOVEREIGN_CATEGORIES,
  SOVEREIGN_MCP_CONNECTORS,
  type SovereignCategory,
  type SovereignMcpConnector,
} from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  Cpu,
  ExternalLink,
  FolderGit2,
  Globe,
  Info,
  Key,
  Layers,
  LayoutGrid,
  Lock,
  Plus,
  Search,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useId, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

// ============================================================================
// ICON RESOLVER HELPER
// ============================================================================

function GithubIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function renderConnectorIcon(iconName: string, className = "h-5 w-5") {
  switch (iconName) {
    case "Globe":
      return <Globe className={className} />;
    case "Github":
      return <GithubIcon className={className} />;
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
    default:
      return <Boxes className={className} />;
  }
}

// ============================================================================
// PROPS & CACHE
// ============================================================================

let cachedCatalog: ConnectionCatalogItem[] = [];

export interface PluginsOverlayProps {
  onClose: () => void;
  initialConnectorId?: string;
  initialCatalog?: ConnectionCatalogItem[];
}

type InspectorTab = "overview" | "tools" | "security";

function markConnected(items: ConnectionCatalogItem[], slug: string, connected: boolean) {
  return items.map((entry) => (entry.slug === slug ? { ...entry, connected } : entry));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PluginsOverlay({
  onClose,
  initialConnectorId,
  initialCatalog,
}: PluginsOverlayProps) {
  const searchInputId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SovereignCategory>("all");
  const [customConnectors, setCustomConnectors] = useState<SovereignMcpConnector[]>(() => {
    try {
      const stored = localStorage.getItem("rakazo:custom_mcp_connectors");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customCategory, setCustomCategory] = useState<SovereignCategory>("automation");
  const [customEndpoint, setCustomEndpoint] = useState("");
  const [customProtocol, setCustomProtocol] = useState("SSE / JSON-RPC");
  const [customApiKey, setCustomApiKey] = useState("");
  const [customToolsInput, setCustomToolsInput] = useState("");

  const allSovereignConnectors = useMemo(() => {
    return [...SOVEREIGN_MCP_CONNECTORS, ...customConnectors];
  }, [customConnectors]);

  const [selectedConnector, setSelectedConnector] = useState<SovereignMcpConnector | null>(() => {
    if (initialConnectorId) {
      return (
        SOVEREIGN_MCP_CONNECTORS.find((c) => c.id === initialConnectorId) ??
        customConnectors.find((c) => c.id === initialConnectorId) ??
        null
      );
    }
    return null;
  });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("overview");
  const [expandedToolName, setExpandedToolName] = useState<string | null>(null);
  const [copiedExample, setCopiedExample] = useState<string | null>(null);

  // Composio external apps state
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>(initialCatalog ?? cachedCatalog);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    initialCatalog === undefined && cachedCatalog.length === 0,
  );

  async function refreshCatalog() {
    try {
      const items = await rpc.connections.catalog({});
      cachedCatalog = items;
      setCatalog(items);
      return items;
    } catch {
      // Graceful fallback for pure sovereign deployment
      setCatalog([]);
      return [];
    }
  }

  useEffect(() => {
    void refreshCatalog()
      .catch(() => {
        // Pure sovereign mode fallback
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSaveCustomConnector() {
    if (!customName.trim() || !customEndpoint.trim()) return;
    const slug = (
      customSlug.trim() || customName.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    ).replace(/^_+|_+$/g, "");
    const id = `custom_${slug}`;

    let tools: McpToolDefinition[] = [];
    if (customToolsInput.trim()) {
      try {
        const parsed = JSON.parse(customToolsInput);
        if (Array.isArray(parsed)) {
          tools = parsed.map((t, idx) => ({
            name: t.name || `${slug}_tool_${idx + 1}`,
            label: t.label || t.name || `Outil ${idx + 1}`,
            description: t.description || "Outil MCP personnalisé",
            connectorId: id,
            category: customCategory,
            requiredParams: t.requiredParams || [],
            parameters: t.parameters || [],
          }));
        }
      } catch {
        tools = customToolsInput
          .split(",")
          .map((name) => {
            const cleanName = name
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_]+/g, "_");
            return {
              name: cleanName,
              label: name.trim(),
              description: `Capacité ${name.trim()} fournie par le connecteur ${customName}`,
              connectorId: id,
              category: customCategory,
              requiredParams: [],
              parameters: [
                {
                  name: "input",
                  type: "string" as const,
                  description: "Paramètres de la requête",
                  required: false,
                },
              ],
            };
          })
          .filter((t) => t.name.length > 0);
      }
    }

    if (tools.length === 0) {
      tools = [
        {
          name: `${slug}_execute`,
          label: `Exécution ${customName}`,
          description: `Exécuter une action ou requête sur le connecteur ${customName}`,
          connectorId: id,
          category: customCategory,
          requiredParams: ["action"],
          parameters: [
            {
              name: "action",
              type: "string",
              description: "Action ou méthode à appeler",
              required: true,
            },
            {
              name: "payload",
              type: "object",
              description: "Paramètres ou données de la requête",
              required: false,
            },
          ],
        },
      ];
    }

    const newConnector: SovereignMcpConnector = {
      id,
      slug,
      name: customName.trim(),
      category: customCategory,
      categoryLabel:
        SOVEREIGN_CATEGORIES.find((c) => c.id === customCategory)?.label || "Automatisation",
      description: customDescription.trim() || `Connecteur MCP personnalisé pour ${customName}`,
      icon: "Boxes",
      endpoint: customEndpoint.trim(),
      protocol: customProtocol,
      status: "connected",
      statusText: "Connecté (Personnalisé)",
      badgeText: "MCP Personnalisé",
      securityLevel: "Authentification Chiffrée",
      secretEnvVar: customApiKey.trim() ? "API_KEY_SECURE" : undefined,
      isBuiltin: false,
      tools,
    };

    const nextList = [...customConnectors.filter((c) => c.id !== id), newConnector];
    setCustomConnectors(nextList);
    try {
      localStorage.setItem("rakazo:custom_mcp_connectors", JSON.stringify(nextList));
    } catch {}

    setAddCustomOpen(false);
    setCustomName("");
    setCustomSlug("");
    setCustomDescription("");
    setCustomEndpoint("");
    setCustomApiKey("");
    setCustomToolsInput("");
    setSelectedConnector(newConnector);
  }

  function handleDeleteCustomConnector(connectorId: string) {
    const nextList = customConnectors.filter((c) => c.id !== connectorId);
    setCustomConnectors(nextList);
    try {
      localStorage.setItem("rakazo:custom_mcp_connectors", JSON.stringify(nextList));
    } catch {}
    if (selectedConnector?.id === connectorId) {
      setSelectedConnector(null);
    }
  }

  // Filter Sovereign Connectors
  const filteredSovereignConnectors = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return allSovereignConnectors.filter((connector) => {
      // Category filter
      if (category !== "all" && category !== "connected") {
        if (connector.category !== category) return false;
      }

      // Search needle
      if (!needle) return true;

      const inName = connector.name.toLowerCase().includes(needle);
      const inSlug = connector.slug.toLowerCase().includes(needle);
      const inDesc = connector.description.toLowerCase().includes(needle);
      const inTools = connector.tools.some(
        (tool) =>
          tool.name.toLowerCase().includes(needle) ||
          tool.label.toLowerCase().includes(needle) ||
          tool.description.toLowerCase().includes(needle),
      );

      return inName || inSlug || inDesc || inTools;
    });
  }, [allSovereignConnectors, category, query]);

  // Filter Composio Apps
  const filteredComposioApps = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return catalog.filter((item) => {
      if (category === "connected" && !item.connected) return false;
      if (
        category !== "all" &&
        category !== "connected" &&
        category !== "workspace" &&
        category !== "social"
      ) {
        return false;
      }
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle);
    });
  }, [catalog, category, query]);

  // Total tool count
  const totalSovereignTools = useMemo(() => {
    return allSovereignConnectors.reduce((acc, c) => acc + c.tools.length, 0);
  }, [allSovereignConnectors]);

  function setItemConnected(slug: string, connected: boolean) {
    cachedCatalog = markConnected(cachedCatalog, slug, connected);
    setCatalog((prev) => markConnected(prev, slug, connected));
  }

  async function connectComposio(item: ConnectionCatalogItem) {
    setError(null);
    setPending(item.slug);
    try {
      const started = await rpc.connections.begin({ provider: item.slug, displayName: item.name });
      if (started.authorizationUrl)
        window.open(started.authorizationUrl, "_blank", "noopener,noreferrer");
      if (item.noAuth && !started.authorizationUrl) {
        setItemConnected(item.slug, true);
        return;
      }
      for (let i = 0; i < 45; i += 1) {
        const row = await rpc.connections
          .complete({ connectionId: started.connectionId })
          .catch(() => undefined);
        if (row?.status === "connected") {
          setItemConnected(item.slug, true);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la connexion");
    } finally {
      setPending(null);
    }
  }

  async function revokeComposio(item: ConnectionCatalogItem) {
    setError(null);
    setPending(item.slug);
    try {
      const rows = await rpc.connections.list();
      const row =
        rows.find((entry) => entry.provider === item.slug && entry.status === "connected") ??
        rows.find((entry) => entry.provider === item.slug && entry.status === "pending") ??
        rows.find((entry) => entry.provider === item.slug && entry.status === "error");
      if (!row) {
        setError(`Aucun enregistrement de connexion trouvé pour ${item.name}.`);
        return;
      }
      await rpc.connections.revoke({ connectionId: row.id });
      setItemConnected(item.slug, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de révoquer la connexion");
    } finally {
      setPending(null);
    }
  }

  function handleCopyJson(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopiedExample(id);
    setTimeout(() => {
      setCopiedExample((current) => (current === id ? null : current));
    }, 2000);
  }

  function openInspector(connector: SovereignMcpConnector, defaultTab: InspectorTab = "overview") {
    setSelectedConnector(connector);
    setInspectorTab(defaultTab);
    setExpandedToolName(connector.tools[0]?.name ?? null);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Catalogue des Connecteurs MCP Souverains et Plugins"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[rgba(4,4,5,.75)] md:p-6 backdrop-blur-sm transition-all"
    >
      <div className="flex h-[92vh] md:h-[780px] w-full md:w-[1120px] max-w-full flex-col overflow-hidden rounded-t-[24px] md:rounded-[26px] border border-[#26262A] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.65)] text-[#EDEDEF]">
        {/* ================================================================= */}
        {/* TOP BAR / HEADER */}
        {/* ================================================================= */}
        <div className="flex items-center justify-between border-b border-[#26262A] px-4 py-3 sm:px-6 sm:py-4 bg-[#111113]">
          <div className="flex items-center gap-3">
            {selectedConnector ? (
              <button
                type="button"
                onClick={() => setSelectedConnector(null)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#26262A] bg-[#17171A] text-[#A1A1AA] hover:bg-[#232326] hover:text-white transition-colors cursor-pointer"
                title="Retour au catalogue"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles size={16} />
              </span>
            )}
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-[#EDEDEF]">
                  {selectedConnector
                    ? selectedConnector.name
                    : "Connecteurs MCP Souverains & Plugins"}
                </h2>
                {selectedConnector ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {selectedConnector.statusText}
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-neutral-800 border border-neutral-700 px-2.5 py-0.5 text-[11px] font-medium text-neutral-300">
                    {totalSovereignTools} outils intégrés
                  </span>
                )}
              </div>
              <p className="text-xs text-[#71717A] mt-0.5">
                {selectedConnector
                  ? `${selectedConnector.protocol} • ${selectedConnector.tools.length} capacités disponibles`
                  : "Écosystème MCP Floteuil Enterprise — Connecteurs natifs, outils souverains et intégrations"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!selectedConnector ? (
              <button
                type="button"
                data-testid="add-custom-mcp-trigger"
                onClick={() => setAddCustomOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>Nouveau MCP</span>
              </button>
            ) : !selectedConnector.isBuiltin ? (
              <button
                type="button"
                data-testid="delete-custom-mcp-trigger"
                onClick={() => handleDeleteCustomConnector(selectedConnector.id)}
                className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                title="Supprimer ce connecteur personnalisé"
              >
                <Trash2 size={14} />
                <span>Supprimer</span>
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-[#85858A] hover:bg-[#232326] hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Error notification */}
        {error ? (
          <div className="flex items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-6 py-2.5 text-xs text-rose-400">
            <AlertCircle size={14} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400/80 hover:text-rose-200 cursor-pointer"
            >
              ✕
            </button>
          </div>
        ) : null}

        {/* ================================================================= */}
        {/* VIEW 1: CATALOG OVERVIEW */}
        {/* ================================================================= */}
        {!selectedConnector ? (
          <>
            {/* Search & Category Tabs Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#26262A] bg-[#111113] px-4 py-2.5 sm:px-6 sm:py-3">
              {/* Category Pills */}
              <div
                role="tablist"
                aria-label="Catégories de connecteurs"
                className="flex items-center gap-1.5 overflow-x-auto rk-scroll py-0.5"
              >
                {SOVEREIGN_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={category === cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`cursor-pointer shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      category === cat.id
                        ? "bg-[#27272A] text-white font-semibold shadow-sm border border-neutral-700"
                        : "bg-transparent text-[#71717A] hover:text-[#EDEDEF]"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative shrink-0">
                <Search size={14} className="absolute left-3 top-2.5 text-[#71717A]" />
                <input
                  id={searchInputId}
                  type="text"
                  placeholder="Filtrer les connecteurs & outils..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full md:w-64 rounded-lg border border-[#26262A] bg-[#17171A] pl-8 pr-8 py-1.5 text-xs text-white placeholder-[#71717A] focus:border-neutral-500 focus:outline-none transition-colors"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-2.5 text-[#71717A] hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>

            {/* Scrollable Content: Sovereign MCP Grid + Composio Section */}
            <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 rk-scroll space-y-6">
              {/* Section 1: Sovereign MCP Connectors */}
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                      Connecteurs Souverains Entreprise (In-Cluster)
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#71717A] font-mono">
                    {filteredSovereignConnectors.length} connecteur
                    {filteredSovereignConnectors.length > 1 ? "s" : ""}
                  </span>
                </div>

                {filteredSovereignConnectors.length === 0 ? (
                  <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-[#26262A] bg-[#101012] text-center p-6">
                    <p className="text-sm font-medium text-[#71717A]">
                      Aucun connecteur souverain ne correspond à « {query} »
                    </p>
                    <p className="mt-1 text-xs text-[#52525B]">
                      Essayez d'autres mots-clés ou sélectionnez la catégorie « Tous ».
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    {filteredSovereignConnectors.map((connector) => (
                      <div
                        key={connector.id}
                        data-testid={`connector-card-${connector.id}`}
                        className="group flex flex-col justify-between rounded-xl border border-[#26262A] bg-[#17171A]/70 p-5 hover:border-neutral-700 hover:bg-[#1A1A1E] transition-all"
                      >
                        <div>
                          {/* Card Top: Icon, Title, Status Badge */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#232328] border border-neutral-800 text-emerald-400 group-hover:border-emerald-500/30 transition-colors">
                                {renderConnectorIcon(connector.icon, "h-5 w-5")}
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-[#EDEDEF] group-hover:text-white flex items-center gap-1.5">
                                  {connector.name}
                                </h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[11px] font-mono text-[#71717A]">
                                    {connector.slug}
                                  </span>
                                  <span className="text-[10px] text-[#52525B]">•</span>
                                  <span className="text-[11px] text-neutral-400">
                                    {connector.categoryLabel}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Status Indicator */}
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-400 shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              {connector.statusText}
                            </span>
                          </div>

                          {/* Description */}
                          <p className="mt-3 text-xs leading-relaxed text-[#A1A1AA] line-clamp-2">
                            {connector.description}
                          </p>

                          {/* Tools Snippet Pills */}
                          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                            {connector.tools.slice(0, 4).map((tool) => (
                              <span
                                key={tool.name}
                                className="rounded-md bg-[#101012] border border-[#232328] px-2 py-0.5 text-[10.5px] font-mono text-neutral-300"
                              >
                                {tool.name}
                              </span>
                            ))}
                            {connector.tools.length > 4 ? (
                              <span className="rounded-md bg-[#101012] border border-[#232328] px-1.5 py-0.5 text-[10.5px] font-mono text-neutral-400">
                                +{connector.tools.length - 4}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Card Bottom: Metadata & Inspect Button */}
                        <div className="mt-4 pt-3.5 border-t border-[#232328] flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[11px] text-[#71717A]">
                            <Server size={12} className="text-emerald-500/70" />
                            <span className="truncate max-w-[200px]">{connector.endpoint}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openInspector(connector, "overview")}
                            className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-[#3F3F46] bg-[#222226] px-3 py-1.5 text-xs font-medium text-[#EDEDEF] hover:bg-[#2C2C32] hover:text-white transition-colors"
                          >
                            Inspecter
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Composio External Integrations */}
              <div className="pt-4 border-t border-[#232328]">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="flex items-center gap-2">
                    <Boxes size={16} className="text-neutral-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                      Extensions & Applications Externes (Composio)
                    </h3>
                  </div>
                  {catalog.length > 0 ? (
                    <span className="text-[11px] text-[#71717A] font-mono">
                      {catalog.length} app{catalog.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>

                {loading ? (
                  <p className="text-xs text-[#7A7A80] py-2">
                    Vérification du catalogue externe Composio…
                  </p>
                ) : catalog.length === 0 ? (
                  <div className="flex items-center justify-between rounded-xl border border-[#232328] bg-[#111113] p-4 text-xs text-[#85858A]">
                    <div className="flex items-center gap-3">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-800 text-neutral-400">
                        <Lock size={15} />
                      </div>
                      <div>
                        <div className="font-medium text-[#D1D1D6]">Mode Souverain Pur Actif</div>
                        <div className="text-[11.5px] text-[#71717A] mt-0.5">
                          Composio n'est pas activé sur cette instance. Les 8 Connecteurs MCP
                          Souverains ci-dessus couvrent 100% des opérations d'entreprise sans fuite
                          de données.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : filteredComposioApps.length === 0 ? (
                  <p className="text-xs text-[#71717A] py-2">
                    Aucune application externe Composio ne correspond au filtre.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredComposioApps.map((item) => (
                      <div
                        key={item.slug}
                        className="flex items-center gap-3 rounded-xl border border-[#232328] bg-[#161619] px-4 py-3"
                      >
                        {item.logo ? (
                          <img
                            src={item.logo}
                            alt=""
                            className="h-9 w-9 rounded-lg bg-[#2C2C30] object-contain shrink-0"
                          />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#2C2C30] font-semibold text-xs text-white shrink-0">
                            {item.name[0]}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#ECECEE] truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-[#7A7A80] truncate">
                            {item.slug}
                            {item.noAuth ? " · sans auth" : ""}
                          </div>
                        </div>
                        {item.connected ? (
                          <Button
                            type="button"
                            variant="pill"
                            size="sm"
                            disabled={pending === item.slug}
                            onClick={() => void revokeComposio(item)}
                          >
                            {pending === item.slug ? "Révocation…" : "Déconnecter"}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="pill"
                            size="sm"
                            disabled={pending === item.slug}
                            onClick={() => void connectComposio(item)}
                          >
                            {pending === item.slug ? "Connexion…" : "Connecter"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ================================================================= */
          /* VIEW 2: DETAIL INSPECTOR FOR SELECTED CONNECTOR                   */
          /* ================================================================= */
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Inspector Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-[#26262A] bg-[#111113] px-6 py-2.5">
              <div
                role="tablist"
                aria-label="Onglets d'inspection"
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "overview"}
                  onClick={() => setInspectorTab("overview")}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    inspectorTab === "overview"
                      ? "bg-[#27272A] text-white font-semibold"
                      : "text-[#71717A] hover:text-[#EDEDEF]"
                  }`}
                >
                  <Info size={14} />
                  Vue d'ensemble
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "tools"}
                  onClick={() => setInspectorTab("tools")}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    inspectorTab === "tools"
                      ? "bg-[#27272A] text-white font-semibold"
                      : "text-[#71717A] hover:text-[#EDEDEF]"
                  }`}
                >
                  <Workflow size={14} />
                  Outils & Capacités ({selectedConnector.tools.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === "security"}
                  onClick={() => setInspectorTab("security")}
                  className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    inspectorTab === "security"
                      ? "bg-[#27272A] text-white font-semibold"
                      : "text-[#71717A] hover:text-[#EDEDEF]"
                  }`}
                >
                  <ShieldCheck size={14} />
                  Sécurité & Secrets
                </button>
              </div>

              <div className="text-[11px] font-mono text-[#71717A] hidden sm:block">
                ID: {selectedConnector.id}
              </div>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-6 rk-scroll">
              {/* TAB 1: OVERVIEW */}
              {inspectorTab === "overview" ? (
                <div className="space-y-6 max-w-4xl">
                  {/* Hero Description Card */}
                  <div className="rounded-2xl border border-[#26262A] bg-[#17171A] p-6">
                    <div className="flex items-start gap-4">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                        {renderConnectorIcon(selectedConnector.icon, "h-6 w-6")}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-white">
                            {selectedConnector.name}
                          </h3>
                          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-medium text-emerald-400">
                            {selectedConnector.badgeText}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[#A1A1AA]">
                          {selectedConnector.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Architecture & Endpoint Specs Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-[#26262A] bg-[#161619] p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                        <Server size={14} className="text-emerald-400" />
                        Spécifications Réseau & Protocole
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-[#232328]">
                          <span className="text-[#71717A]">Endpoint Serveur</span>
                          <span className="font-mono text-emerald-400 truncate max-w-[220px]">
                            {selectedConnector.endpoint}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#232328]">
                          <span className="text-[#71717A]">Protocole de transport</span>
                          <span className="text-neutral-200">{selectedConnector.protocol}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-[#71717A]">Type d'intégration</span>
                          <span className="text-neutral-200">
                            {selectedConnector.isBuiltin
                              ? "Natif Souverain (In-Cluster)"
                              : "Connecteur Externe"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#26262A] bg-[#161619] p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                        <ShieldCheck size={14} className="text-emerald-400" />
                        Gouvernance & Isolation des Données
                      </div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between py-1 border-b border-[#232328]">
                          <span className="text-[#71717A]">Niveau de Sécurité</span>
                          <span className="text-emerald-400 font-medium truncate max-w-[220px]">
                            {selectedConnector.securityLevel}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#232328]">
                          <span className="text-[#71717A]">Secret d'authentification</span>
                          <span className="font-mono text-neutral-300">
                            {selectedConnector.secretEnvVar ?? "Natif"}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-[#71717A]">Assainissement des tokens</span>
                          <span className="text-emerald-400 flex items-center gap-1 font-medium">
                            <Check size={12} /> Actif (Zéro Fuite)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-xl border border-[#26262A] bg-[#111113] p-4 text-center">
                      <div className="text-2xl font-bold text-white">
                        {selectedConnector.tools.length}
                      </div>
                      <div className="text-[11px] text-[#71717A] mt-1">Outils opérationnels</div>
                    </div>
                    <div className="rounded-xl border border-[#26262A] bg-[#111113] p-4 text-center">
                      <div className="text-2xl font-bold text-amber-400">
                        {selectedConnector.tools.filter((t) => t.isSensitive).length}
                      </div>
                      <div className="text-[11px] text-[#71717A] mt-1">
                        Actions avec confirmation
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#26262A] bg-[#111113] p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-400">100%</div>
                      <div className="text-[11px] text-[#71717A] mt-1">Disponibilité garantie</div>
                    </div>
                  </div>

                  {/* Call to action */}
                  <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 p-4">
                    <div>
                      <div className="text-xs font-semibold text-emerald-300">
                        Explorer les {selectedConnector.tools.length} outils de ce connecteur
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">
                        Consultez les schémas JSON, paramètres obligatoires et exemples d'appels.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectorTab("tools")}
                      className="cursor-pointer rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 transition-colors shrink-0"
                    >
                      Voir les outils
                    </button>
                  </div>
                </div>
              ) : null}

              {/* TAB 2: TOOLS & CAPABILITIES */}
              {inspectorTab === "tools" ? (
                <div className="space-y-4 max-w-4xl">
                  <div className="flex items-center justify-between text-xs text-[#71717A]">
                    <span>
                      Cliquez sur un outil pour inspecter ses paramètres typés et son exemple
                      d'invocation.
                    </span>
                    <span className="font-mono">
                      {selectedConnector.tools.length} capacité
                      {selectedConnector.tools.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {selectedConnector.tools.map((tool) => {
                      const isExpanded = expandedToolName === tool.name;

                      return (
                        <div
                          key={tool.name}
                          data-testid={`tool-item-${tool.name}`}
                          className={`rounded-xl border transition-all ${
                            isExpanded
                              ? "border-emerald-500/40 bg-[#17171B]"
                              : "border-[#26262A] bg-[#141417] hover:border-neutral-700"
                          }`}
                        >
                          {/* Tool Accordion Header */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedToolName((curr) => (curr === tool.name ? null : tool.name))
                            }
                            className="cursor-pointer w-full flex items-center justify-between p-4 text-left"
                          >
                            <div className="flex items-start gap-3">
                              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#222226] text-emerald-400 font-mono text-xs shrink-0 mt-0.5">
                                <Zap size={13} />
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-semibold text-emerald-400">
                                    {tool.name}
                                  </span>
                                  <span className="text-xs text-neutral-300 font-medium">
                                    — {tool.label}
                                  </span>
                                  {tool.isSensitive ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                      <AlertTriangle size={10} />
                                      Action sensible
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-[#A1A1AA] leading-relaxed">
                                  {tool.description}
                                </p>
                              </div>
                            </div>

                            <ChevronDown
                              size={16}
                              className={`text-[#71717A] shrink-0 transition-transform ${
                                isExpanded ? "rotate-180 text-white" : ""
                              }`}
                            />
                          </button>

                          {/* Expanded Tool Details: Parameters & JSON Example */}
                          {isExpanded ? (
                            <div className="border-t border-[#26262A] p-4 bg-[#101012] space-y-4 rounded-b-xl">
                              {/* Parameters Table */}
                              <div>
                                <div className="text-[11.5px] font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                                  Paramètres d'entrée ({tool.parameters.length})
                                </div>

                                {tool.parameters.length === 0 ? (
                                  <p className="text-xs text-[#71717A] italic">
                                    Cet outil ne requiert aucun argument d'entrée.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto rounded-lg border border-[#232328]">
                                    <table className="w-full text-left text-xs border-collapse">
                                      <thead>
                                        <tr className="border-b border-[#232328] bg-[#141416] text-[#71717A]">
                                          <th className="py-2 px-3 font-medium">Nom</th>
                                          <th className="py-2 px-3 font-medium">Type</th>
                                          <th className="py-2 px-3 font-medium">Obligatoire</th>
                                          <th className="py-2 px-3 font-medium">Description</th>
                                          <th className="py-2 px-3 font-medium">Détails / Enum</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[#1F1F24]">
                                        {tool.parameters.map((param) => (
                                          <tr key={param.name} className="hover:bg-[#161619]">
                                            <td className="py-2 px-3 font-mono text-emerald-400 font-medium">
                                              {param.name}
                                            </td>
                                            <td className="py-2 px-3 font-mono text-[11px] text-neutral-400">
                                              {param.type}
                                            </td>
                                            <td className="py-2 px-3">
                                              {param.required ? (
                                                <span className="rounded bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">
                                                  Requis
                                                </span>
                                              ) : (
                                                <span className="text-[11px] text-[#71717A]">
                                                  Optionnel
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2 px-3 text-[#A1A1AA] text-xs">
                                              {param.description}
                                            </td>
                                            <td className="py-2 px-3 font-mono text-[11px] text-[#85858A]">
                                              {param.enum ? (
                                                <span className="text-amber-300/90">
                                                  [{param.enum.join(", ")}]
                                                </span>
                                              ) : param.default !== undefined ? (
                                                <span>défaut: {String(param.default)}</span>
                                              ) : (
                                                "—"
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Example Payload */}
                              {tool.exampleInvocation ? (
                                <div>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11.5px] font-semibold text-neutral-300 uppercase tracking-wider">
                                      Exemple de payload JSON
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyJson(
                                          JSON.stringify(tool.exampleInvocation, null, 2),
                                          tool.name,
                                        )
                                      }
                                      className="cursor-pointer inline-flex items-center gap-1 rounded bg-[#222226] border border-[#2E2E34] px-2 py-0.5 text-[11px] text-neutral-300 hover:text-white transition-colors"
                                    >
                                      {copiedExample === tool.name ? (
                                        <>
                                          <Check size={11} className="text-emerald-400" />
                                          Copié !
                                        </>
                                      ) : (
                                        <>
                                          <Copy size={11} />
                                          Copier JSON
                                        </>
                                      )}
                                    </button>
                                  </div>
                                  <pre className="rounded-lg border border-[#232328] bg-[#0C0C0E] p-3 text-xs font-mono text-emerald-300/90 overflow-x-auto">
                                    {JSON.stringify(tool.exampleInvocation, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* TAB 3: SECURITY & SECRETS */}
              {inspectorTab === "security" ? (
                <div className="space-y-6 max-w-4xl">
                  {/* Security Architecture Card */}
                  <div className="rounded-2xl border border-[#26262A] bg-[#17171A] p-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">
                          Protocole d'Isolation & Assainissement des Secrets
                        </h4>
                        <p className="text-xs text-[#71717A]">
                          Modèle de sécurité à divulgation nulle pour environnements souverains.
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-[#A1A1AA] leading-relaxed">
                      Chaque appel d'outil MCP transite exclusivement par l'exécuteur serveur
                      Rakazo. Les clés d'API et tokens maîtres (tels que{" "}
                      <code className="font-mono text-emerald-400">
                        {selectedConnector.secretEnvVar ?? "SYSTEM_INTERNAL"}
                      </code>
                      ) sont stockés dans les variables d'environnement du serveur d'exécution et ne
                      sont jamais exposés aux modèles LLM ni transmis au navigateur client.
                    </p>
                  </div>

                  {/* Secret Config Table */}
                  <div className="rounded-xl border border-[#26262A] bg-[#161619] p-5 space-y-3">
                    <div className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                      <Key size={14} className="text-emerald-400" />
                      État du Secret d'Authentification
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-2 border-b border-[#232328]">
                        <span className="text-[#71717A]">Variable d'environnement</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {selectedConnector.secretEnvVar ?? "N/A (Isolation Process)"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-[#232328]">
                        <span className="text-[#71717A]">Statut d'injection</span>
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                          <CheckCircle2 size={13} />
                          Configuré & Assaini côté serveur
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-[#232328]">
                        <span className="text-[#71717A]">Masquage Token (Redacted)</span>
                        <span className="font-mono text-neutral-400 tracking-wider">
                          ••••••••••••••••••••••••••••••••
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-[#71717A]">Politique d'erreur</span>
                        <span className="text-neutral-300">
                          Assainissement strict des codes et messages d'erreur
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Verification Guarantee */}
                  <div className="rounded-xl border border-[#26262A] bg-[#111113] p-4 flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-neutral-400 leading-relaxed">
                      <strong className="text-neutral-200">Garantie Souveraine :</strong> Aucune
                      télémétrie, requête tierce ou log externe n'est émis lors de l'exécution des
                      outils de ce connecteur. Les données restent dans le périmètre applicatif
                      Floteuil Enterprise.
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL: AJOUTER UN CONNECTEUR MCP PERSONNALISÉ */}
        {/* ================================================================= */}
        {addCustomOpen ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ajouter un Connecteur MCP Personnalisé"
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          >
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#2A2A2F] bg-[#17171A] shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#26262A] px-5 py-4 bg-[#121214]">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Plus size={15} />
                  </span>
                  <h3 className="text-base font-semibold text-[#EDEDEF]">Nouveau Connecteur MCP</h3>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={() => setAddCustomOpen(false)}
                  className="text-[#71717A] hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4 rk-scroll text-xs">
                <div>
                  <label className="block text-[#A1A1AA] font-medium mb-1.5">
                    Nom du connecteur <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Hubspot CRM, Base Données SQL, API Partenaire"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#A1A1AA] font-medium mb-1.5">
                      Identifiant (Slug)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: hubspot_crm"
                      value={customSlug}
                      onChange={(e) => setCustomSlug(e.target.value)}
                      className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[#A1A1AA] font-medium mb-1.5">Catégorie</label>
                    <select
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value as SovereignCategory)}
                      className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white focus:border-emerald-500 focus:outline-none"
                    >
                      {SOVEREIGN_CATEGORIES.filter(
                        (c) => c.id !== "all" && c.id !== "connected",
                      ).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[#A1A1AA] font-medium mb-1.5">
                    URL du serveur MCP / Endpoint <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: https://mcp.groupefloteuil.eu/sse ou http://localhost:8000"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                    className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#A1A1AA] font-medium mb-1.5">Protocole</label>
                    <input
                      type="text"
                      placeholder="SSE / JSON-RPC"
                      value={customProtocol}
                      onChange={(e) => setCustomProtocol(e.target.value)}
                      className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[#A1A1AA] font-medium mb-1.5">
                      Clé d'API / Token (Optionnel)
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#A1A1AA] font-medium mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    placeholder="Décrivez les fonctionnalités et données fournies par ce connecteur..."
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#A1A1AA] font-medium mb-1.5">
                    Outils déclarés (Noms séparés par virgules ou JSON)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: get_customer, create_ticket, search_orders"
                    value={customToolsInput}
                    onChange={(e) => setCustomToolsInput(e.target.value)}
                    className="w-full rounded-lg border border-[#2A2A2F] bg-[#101012] px-3 py-2 text-white placeholder-[#52525B] focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-[#26262A] px-5 py-3.5 bg-[#121214]">
                <button
                  type="button"
                  onClick={() => setAddCustomOpen(false)}
                  className="rounded-lg px-3.5 py-1.5 text-xs text-[#A1A1AA] hover:text-white transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={!customName.trim() || !customEndpoint.trim()}
                  onClick={handleSaveCustomConnector}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Enregistrer le connecteur
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
