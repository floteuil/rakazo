import {
  type BotMcpConfig,
  DEFAULT_ENABLED_SOVEREIGN_TOOLS,
  getConnectorForTool,
  type McpToolDefinition,
  SOVEREIGN_MCP_CONNECTORS,
  type SovereignMcpConnector,
} from "@rakazo/contracts";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cloud,
  Cpu,
  Globe,
  Info,
  LayoutGrid,
  Minus,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Workflow,
  X,
} from "lucide-react";
import React, { useCallback, useId, useMemo, useState } from "react";

// ============================================================================
// GITHUB SVG ICON
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
// HELPER FUNCTIONS
// ============================================================================

export function isToolActive(config: BotMcpConfig | undefined, toolName: string): boolean {
  if (!config) return DEFAULT_ENABLED_SOVEREIGN_TOOLS.includes(toolName);
  if (config.tools && typeof config.tools[toolName] === "boolean") {
    return config.tools[toolName]!;
  }
  if (config.connectors) {
    const connector = getConnectorForTool(toolName);
    if (connector && typeof config.connectors[connector.id] === "boolean") {
      return config.connectors[connector.id]!;
    }
  }
  return DEFAULT_ENABLED_SOVEREIGN_TOOLS.includes(toolName);
}

export function getAllActiveMcpConfig(): BotMcpConfig {
  const connectors: Record<string, boolean> = {};
  const tools: Record<string, boolean> = {};
  for (const connector of SOVEREIGN_MCP_CONNECTORS) {
    connectors[connector.id] = true;
    for (const tool of connector.tools) {
      tools[tool.name] = true;
    }
  }
  return { connectors, tools };
}

export function getRecommendedMcpConfig(): BotMcpConfig {
  const connectors: Record<string, boolean> = {
    searxng_scraperr: true,
    system_platform: true,
    github: false,
    notion: false,
    postiz: false,
    wordpress_novamira: false,
    n8n: false,
    cloudflare: false,
  };
  const tools: Record<string, boolean> = {};
  for (const connector of SOVEREIGN_MCP_CONNECTORS) {
    for (const tool of connector.tools) {
      tools[tool.name] = DEFAULT_ENABLED_SOVEREIGN_TOOLS.includes(tool.name);
    }
  }
  return { connectors, tools };
}

export function getAllDisabledMcpConfig(): BotMcpConfig {
  const connectors: Record<string, boolean> = {};
  const tools: Record<string, boolean> = {};
  for (const connector of SOVEREIGN_MCP_CONNECTORS) {
    connectors[connector.id] = false;
    for (const tool of connector.tools) {
      tools[tool.name] = false;
    }
  }
  return { connectors, tools };
}

// ============================================================================
// TRI-STATE SWITCH COMPONENT
// ============================================================================

interface TriStateSwitchProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (nextChecked: boolean) => void;
  id?: string;
  label?: string;
  disabled?: boolean;
}

function TriStateSwitch({
  checked,
  indeterminate = false,
  onChange,
  id,
  label,
  disabled = false,
}: TriStateSwitchProps) {
  const switchId = id || useId();

  return (
    <button
      type="button"
      id={switchId}
      role="switch"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked || indeterminate);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-[#17171A] ${
        indeterminate
          ? "bg-amber-500/80"
          : checked
            ? "bg-emerald-500"
            : "bg-[#2A2A2E]"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
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
          <Minus className="h-3 w-3 text-amber-700 stroke-[3]" />
        ) : checked ? (
          <Check className="h-3 w-3 text-emerald-600 stroke-[3]" />
        ) : null}
      </span>
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT PROPS & LOGIC
// ============================================================================

export interface BotMcpToolSelectorProps {
  value?: BotMcpConfig;
  onChange: (config: BotMcpConfig) => void;
  className?: string;
}

export function BotMcpToolSelector({
  value,
  onChange,
  className = "",
}: BotMcpToolSelectorProps) {
  const [expandedConnectors, setExpandedConnectors] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const effectiveConfig = useMemo<BotMcpConfig>(() => {
    if (!value) {
      return { connectors: {}, tools: {} };
    }
    return value;
  }, [value]);

  const toggleAccordion = useCallback((connectorId: string) => {
    setExpandedConnectors((prev) => ({
      ...prev,
      [connectorId]: !prev[connectorId],
    }));
  }, []);

  const expandAll = useCallback(() => {
    const all: Record<string, boolean> = {};
    for (const c of SOVEREIGN_MCP_CONNECTORS) {
      all[c.id] = true;
    }
    setExpandedConnectors(all);
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedConnectors({});
  }, []);

  const handleConnectorToggle = useCallback(
    (connector: SovereignMcpConnector) => {
      const activeCount = connector.tools.filter((t) =>
        isToolActive(effectiveConfig, t.name),
      ).length;
      const isAllActive = activeCount === connector.tools.length;
      const nextActive = !isAllActive;

      const newTools = { ...(effectiveConfig.tools || {}) };
      for (const t of connector.tools) {
        newTools[t.name] = nextActive;
      }
      const newConnectors = {
        ...(effectiveConfig.connectors || {}),
        [connector.id]: nextActive,
      };

      onChange({
        connectors: newConnectors,
        tools: newTools,
      });
    },
    [effectiveConfig, onChange],
  );

  const handleToolToggle = useCallback(
    (connector: SovereignMcpConnector, toolName: string) => {
      const currentStatus = isToolActive(effectiveConfig, toolName);
      const nextStatus = !currentStatus;

      const newTools = {
        ...(effectiveConfig.tools || {}),
        [toolName]: nextStatus,
      };

      const newActiveCount = connector.tools.filter((t) =>
        t.name === toolName ? nextStatus : isToolActive({ tools: newTools }, t.name),
      ).length;

      const newConnectors = {
        ...(effectiveConfig.connectors || {}),
        [connector.id]: newActiveCount > 0,
      };

      onChange({
        connectors: newConnectors,
        tools: newTools,
      });
    },
    [effectiveConfig, onChange],
  );

  const handleQuickAction = useCallback(
    (action: "all" | "recommended" | "none") => {
      if (action === "all") {
        onChange(getAllActiveMcpConfig());
      } else if (action === "recommended") {
        onChange(getRecommendedMcpConfig());
      } else {
        onChange(getAllDisabledMcpConfig());
      }
    },
    [onChange],
  );

  const totalToolCount = useMemo(() => {
    return SOVEREIGN_MCP_CONNECTORS.reduce((acc, c) => acc + c.tools.length, 0);
  }, []);

  const activeTotalToolCount = useMemo(() => {
    let count = 0;
    for (const c of SOVEREIGN_MCP_CONNECTORS) {
      for (const t of c.tools) {
        if (isToolActive(effectiveConfig, t.name)) {
          count += 1;
        }
      }
    }
    return count;
  }, [effectiveConfig]);

  const filteredConnectors = useMemo(() => {
    if (!searchQuery.trim()) return SOVEREIGN_MCP_CONNECTORS;
    const q = searchQuery.toLowerCase().trim();
    return SOVEREIGN_MCP_CONNECTORS.filter((c) => {
      if (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.categoryLabel.toLowerCase().includes(q)
      ) {
        return true;
      }
      return c.tools.some(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.label.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.requiredParams.some((p) => p.toLowerCase().includes(q)),
      );
    });
  }, [searchQuery]);

  return (
    <div className={`space-y-4 ${className}`} data-testid="bot-mcp-tool-selector">
      {/* Header & Quick Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-medium text-[#ECECEE]">
              Connecteurs & Outils MCP Souverains
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-950/70 border border-emerald-700/60 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Souverain
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#85858A]">
            Activez ou restreignez les connecteurs et outils autorisés pour cet agent ({activeTotalToolCount} / {totalToolCount} outils actifs).
          </p>
        </div>

        {/* Global Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleQuickAction("all")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2E2E33] bg-[#1C1C20] px-2.5 py-1.5 text-[12px] font-medium text-[#ECECEE] hover:bg-[#25252A] transition-colors"
            title="Activer tous les connecteurs et outils"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Tout activer
          </button>
          <button
            type="button"
            onClick={() => handleQuickAction("recommended")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-2.5 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-950/60 transition-colors"
            title="Appliquer la configuration souveraine recommandée"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Recommandé
          </button>
          <button
            type="button"
            onClick={() => handleQuickAction("none")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#2E2E33] bg-[#1C1C20] px-2.5 py-1.5 text-[12px] font-medium text-[#A1A1AA] hover:bg-[#25252A] hover:text-rose-400 transition-colors"
            title="Désactiver tous les connecteurs et outils"
          >
            <X className="h-3.5 w-3.5" />
            Tout désactiver
          </button>
        </div>
      </div>

      {/* Search and Expand/Collapse Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer les connecteurs et outils (ex: GitHub, SearXNG, DNS...)"
            className="w-full rounded-[10px] border border-[#26262A] bg-[#141416] py-1.5 pl-8 pr-3 text-[12.5px] text-[#ECECEE] placeholder-[#71717A] focus:border-emerald-500/60 focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={expandAll}
          className="rounded-[9px] border border-[#26262A] bg-[#17171A] px-2.5 py-1.5 text-[11.5px] text-[#85858A] hover:bg-[#222226] hover:text-[#ECECEE] transition-colors"
        >
          Déplier tout
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-[9px] border border-[#26262A] bg-[#17171A] px-2.5 py-1.5 text-[11.5px] text-[#85858A] hover:bg-[#222226] hover:text-[#ECECEE] transition-colors"
        >
          Replier tout
        </button>
      </div>

      {/* Connectors Accordion List */}
      <div className="space-y-2.5">
        {filteredConnectors.length === 0 ? (
          <div className="rounded-[11px] border border-[#26262A] bg-[#141416] p-6 text-center text-[13px] text-[#71717A]">
            Aucun connecteur ou outil ne correspond à votre recherche "{searchQuery}".
          </div>
        ) : (
          filteredConnectors.map((connector) => {
            const activeTools = connector.tools.filter((t) =>
              isToolActive(effectiveConfig, t.name),
            );
            const activeCount = activeTools.length;
            const totalCount = connector.tools.length;
            const isAllActive = activeCount === totalCount;
            const isPartial = activeCount > 0 && activeCount < totalCount;
            const isExpanded = expandedConnectors[connector.id] ?? Boolean(searchQuery);

            return (
              <div
                key={connector.id}
                data-testid={`mcp-connector-${connector.id}`}
                className="overflow-hidden rounded-[11px] border border-[#26262A] bg-[#17171A] transition-colors"
              >
                {/* Connector Header */}
                <div
                  onClick={() => toggleAccordion(connector.id)}
                  className="flex cursor-pointer items-center justify-between gap-3 p-3.5 hover:bg-[#1C1C20] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      aria-label={isExpanded ? "Replier" : "Déplier"}
                      className="text-[#71717A] hover:text-[#ECECEE] transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAccordion(connector.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[#2E2E33] bg-[#121214] text-emerald-400">
                      {renderConnectorIcon(connector.icon, "h-4.5 w-4.5")}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium text-[#ECECEE] truncate">
                          {connector.name}
                        </span>
                        <span className="rounded bg-[#26262A] px-1.5 py-0.5 text-[10px] font-medium text-[#A1A1AA]">
                          {connector.categoryLabel}
                        </span>
                        {/* Glowing Status Badge */}
                        <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.2 text-[10px] font-medium text-emerald-400">
                          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          {connector.statusText}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] text-[#71717A] truncate">
                        {connector.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Header Controls: Tool Counter & Toggle Switch */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`text-[12px] font-medium px-2 py-0.5 rounded-[7px] border ${
                        isAllActive
                          ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-400"
                          : isPartial
                            ? "border-amber-800/60 bg-amber-950/40 text-amber-400"
                            : "border-[#26262A] bg-[#121214] text-[#71717A]"
                      }`}
                    >
                      {activeCount} / {totalCount} actifs
                    </span>

                    <TriStateSwitch
                      checked={isAllActive}
                      indeterminate={isPartial}
                      label={`Basculer tous les outils de ${connector.name}`}
                      onChange={() => handleConnectorToggle(connector)}
                    />
                  </div>
                </div>

                {/* Collapsible Accordion Body */}
                {isExpanded ? (
                  <div className="border-t border-[#26262A] bg-[#131315] p-3.5 space-y-3">
                    {/* Connector Info Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#71717A] bg-[#18181B] px-3 py-1.5 rounded-lg border border-[#232326]">
                      <div className="flex items-center gap-2">
                        <Shield className="h-3 w-3 text-emerald-400" />
                        <span>Sécurité : {connector.securityLevel}</span>
                      </div>
                      <div className="font-mono text-[10px] text-[#85858A]">
                        Protocole : {connector.protocol}
                      </div>
                    </div>

                    {/* Tools Checkboxes */}
                    <div className="space-y-2">
                      {connector.tools.map((tool) => {
                        const active = isToolActive(effectiveConfig, tool.name);
                        return (
                          <div
                            key={tool.name}
                            data-testid={`tool-item-${tool.name}`}
                            onClick={() => handleToolToggle(connector, tool.name)}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors ${
                              active
                                ? "border-emerald-900/40 bg-[#161B18] hover:bg-[#1A221E]"
                                : "border-[#26262A] bg-[#17171A] hover:bg-[#1D1D21] opacity-75"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => handleToolToggle(connector, tool.name)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-1 h-4 w-4 rounded border-[#38383D] bg-[#222226] text-emerald-500 focus:ring-emerald-500 focus:ring-offset-[#17171A] cursor-pointer"
                            />

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[13px] font-medium text-[#ECECEE]">
                                  {tool.label}
                                </span>
                                <code className="rounded bg-[#202024] px-1.5 py-0.5 text-[11px] font-mono text-emerald-300">
                                  {tool.name}
                                </code>
                                {tool.isSensitive ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-800/60 bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                    <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                                    Action sensible
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-1 text-[12px] text-[#A1A1AA] leading-relaxed">
                                {tool.description}
                              </p>

                              {tool.requiredParams.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[#71717A]">
                                  <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[#85858A]">
                                    Paramètres requis :
                                  </span>
                                  {tool.requiredParams.map((param) => (
                                    <span
                                      key={param}
                                      className="rounded bg-[#26262A] px-1.5 py-0.2 font-mono text-[10.5px] text-[#D4D4D8]"
                                    >
                                      {param}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

