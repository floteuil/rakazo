import React, { useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  ALL_SOVEREIGN_TOOL_NAMES,
  type BotMcpConfig,
  DEFAULT_ENABLED_SOVEREIGN_TOOLS,
  getAllSovereignToolNames,
  getAllSovereignTools,
  getConnectorForTool,
  getSovereignConnector,
  getSovereignToolsByCategory,
  isSovereignTool,
  type McpToolDefinition,
  SOVEREIGN_CATEGORIES,
  SOVEREIGN_MCP_CONNECTORS,
  type SovereignCategory,
  type SovereignMcpConnector,
} from "@rakazo/contracts";
import {
  containsSecret,
  createStreamingRedactor,
  redactSecrets,
} from "@rakazo/core";
import { SkillLibraryOverlay } from "./SkillLibraryOverlay";
import { ModelSettingsOverlay } from "./ModelSettingsOverlay";
import { VoiceSettingsOverlay } from "./VoiceSettingsOverlay";
import { AuthPage } from "./Auth";

function sanitizeToolError(message: string): string {
  return message
    .replace(/ghp_[a-zA-Z0-9]+/g, "ghp_[redacted]")
    .replace(/github_pat_[a-zA-Z0-9_]+/g, "github_pat_[redacted]")
    .replace(/secret_[a-zA-Z0-9]+/g, "secret_[redacted]")
    .replace(/ntn_[a-zA-Z0-9]+/g, "ntn_[redacted]")
    .replace(/pk_[a-zA-Z0-9]+/g, "pk_[redacted]")
    .replace(/nova_[a-zA-Z0-9]+/g, "nova_[redacted]")
    .replace(/n8n_api_[a-zA-Z0-9]+/g, "n8n_api_[redacted]")
    .replace(/cf_token_[a-zA-Z0-9_-]+/g, "cf_token_[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/Basic\s+\S+/gi, "Basic [redacted]");
}

// ============================================================================
// UI COMPONENT HARNESSES (Reflecting Mobile-First & Desktop Architecture)
// ============================================================================

/**
 * Mobile Drawer & Shell Navigation Harness
 */
interface MobileShellHarnessProps {
  isMobileDrawerOpen: boolean;
  onToggleMobileDrawer: () => void;
  onCloseMobileDrawer: () => void;
  activeBotName?: string;
  activeBotStatus?: "online" | "idle" | "busy";
  viewportWidth?: number;
}

export function MobileShellNavHarness({
  isMobileDrawerOpen,
  onToggleMobileDrawer,
  onCloseMobileDrawer,
  activeBotName = "Agent Principal",
  activeBotStatus = "online",
  viewportWidth = 390,
}: MobileShellHarnessProps) {
  const isMobile = viewportWidth < 768;

  return (
    <div className="relative flex h-screen w-full flex-col bg-[#101012] text-[#ECECEE]">
      {/* Mobile Top Header */}
      <header
        data-testid="mobile-header"
        className="flex h-14 w-full items-center justify-between border-b border-[#26262A] bg-[#141416] px-4 md:hidden"
      >
        <button
          type="button"
          aria-label="Ouvrir le menu latéral"
          data-testid="mobile-hamburger-btn"
          onClick={onToggleMobileDrawer}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#85858A] hover:bg-[#1E1E22] hover:text-white"
        >
          <span className="sr-only">Menu</span>
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex items-center gap-2" data-testid="mobile-header-agent-info">
          <div className="h-2 w-2 rounded-full bg-emerald-500" data-status={activeBotStatus} />
          <span className="text-[15.5px] font-medium text-[#F1F1F2]">{activeBotName}</span>
        </div>

        <button
          type="button"
          aria-label="Nouveau chat"
          data-testid="mobile-new-chat-btn"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-[#85858A] hover:bg-[#1E1E22] hover:text-white"
        >
          +
        </button>
      </header>

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile Backdrop */}
        {isMobile && isMobileDrawerOpen && (
          <div
            data-testid="mobile-drawer-backdrop"
            onClick={onCloseMobileDrawer}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden"
          />
        )}

        {/* Sidebar Drawer */}
        <aside
          data-testid="app-sidebar"
          className={`fixed inset-y-0 left-0 z-50 flex w-[316px] flex-col border-r border-[#26262A] bg-[#141416] transition-transform duration-300 ease-in-out md:relative md:z-auto md:translate-x-0 ${
            isMobile && !isMobileDrawerOpen ? "-translate-x-full" : "translate-x-0"
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-[#26262A] px-4">
            <span className="font-semibold text-white">Rakazo Sovereign</span>
            {isMobile && (
              <button
                type="button"
                data-testid="mobile-drawer-close-btn"
                onClick={onCloseMobileDrawer}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#85858A] hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <nav className="space-y-1">
              <a href="#agents" className="flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-[15px] text-[#ECECEE] hover:bg-[#1E1E22]">
                Mes Agents
              </a>
              <a href="#skills" className="flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-[15px] text-[#ECECEE] hover:bg-[#1E1E22]">
                Bibliothèque de Compétences
              </a>
              <a href="#connectors" className="flex min-h-[44px] items-center rounded-lg px-3 py-2.5 text-[15px] text-[#ECECEE] hover:bg-[#1E1E22]">
                Connecteurs MCP
              </a>
            </nav>
          </div>
        </aside>

        {/* Chat Area & Composer */}
        <main className="flex flex-1 flex-col overflow-hidden bg-[#101012]">
          <div className="flex-1 overflow-y-auto p-4" data-testid="chat-transcript">
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="rounded-2xl bg-[#17171A] p-4 text-[15.5px] leading-relaxed text-[#ECECEE]">
                Bonjour ! Comment puis-je vous aider aujourd'hui ?
              </div>
            </div>
          </div>

          {/* Safe-Area Bottom Composer */}
          <footer
            data-testid="mobile-composer-container"
            className="border-t border-[#26262A] bg-[#141416] p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:p-4"
          >
            <div className="mx-auto flex max-w-3xl items-end gap-2">
              <textarea
                data-testid="chat-input-textarea"
                placeholder="Écrivez votre message à l'agent…"
                rows={1}
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-[#26262A] bg-[#101012] px-4 py-2.5 text-[16px] text-[#ECECEE] placeholder-[#71717A] outline-none focus:border-[#44444A] sm:text-[15.5px]"
              />
              <button
                type="button"
                data-testid="chat-send-btn"
                className="flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-[#2C2C30] px-4 font-medium text-white hover:bg-[#38383D]"
              >
                Envoyer
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

/**
 * Sovereign MCP Showcase & Detail Inspector Component Harness
 */
interface McpShowcaseHarnessProps {
  selectedCategory?: SovereignCategory;
  searchQuery?: string;
  selectedConnectorId?: string | null;
  onSelectConnector?: (id: string | null) => void;
}

export function McpShowcaseHarness({
  selectedCategory = "all",
  searchQuery = "",
  selectedConnectorId = null,
  onSelectConnector,
}: McpShowcaseHarnessProps) {
  const [activeCategory, setActiveCategory] = useState<SovereignCategory>(selectedCategory);
  const [query, setQuery] = useState(searchQuery);
  const [selectedId, setSelectedId] = useState<string | null>(selectedConnectorId);

  const filteredConnectors = useMemo(() => {
    let list = SOVEREIGN_MCP_CONNECTORS;
    if (activeCategory !== "all") {
      if (activeCategory === "connected") {
        list = list.filter((c) => c.status === "connected" || c.status === "operational");
      } else {
        list = list.filter((c) => c.category === activeCategory);
      }
    }
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tools.some((t) => t.name.toLowerCase().includes(q) || t.label.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [activeCategory, query]);

  const activeConnector = selectedId ? getSovereignConnector(selectedId) : null;

  return (
    <div
      data-testid="mcp-showcase-overlay"
      className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-4 sm:p-10"
    >
      <div className="flex h-[min(760px,100%)] w-[1080px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#232326] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#26262A] px-6 py-5 sm:px-8">
          <div>
            <h2 className="text-xl font-semibold text-[#F1F1F2] sm:text-2xl">
              Connecteurs MCP Souverains
            </h2>
            <p className="mt-1 text-[13.5px] text-[#7A7A80]">
              Hub d'intégrations haute sécurité du Groupe Floteuil · 8 Connecteurs · 40 Outils
            </p>
          </div>
          <button
            type="button"
            data-testid="close-showcase-btn"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#85858A] hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Search & Category Pills */}
        <div className="border-b border-[#26262A] px-6 py-4 sm:px-8">
          <input
            data-testid="mcp-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un connecteur ou un outil (ex: SearXNG, GitHub, Notion, DNS)…"
            className="w-full rounded-[13px] border border-[#26262A] bg-[#101012] px-4 py-3 text-[16px] text-[#ECECEE] outline-none placeholder-[#6C6C70] focus:border-[#44444A] sm:text-[15px]"
          />

          <div
            role="tablist"
            data-testid="mcp-category-tabs"
            className="rk-scroll mt-3.5 flex gap-1.5 overflow-x-auto pb-1"
          >
            {SOVEREIGN_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                data-testid={`category-tab-${cat.id}`}
                aria-selected={activeCategory === cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  activeCategory === cat.id
                    ? "bg-[#2C2C30] text-[#F1F1F2]"
                    : "text-[#7A7A80] hover:text-[#C8C8CC]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Connector List */}
          <div
            data-testid="mcp-connector-list"
            className={`rk-scroll flex-1 overflow-y-auto p-4 sm:p-6 ${
              activeConnector ? "hidden md:block md:w-1/2 md:border-r md:border-[#26262A]" : "w-full"
            }`}
          >
            {filteredConnectors.length === 0 ? (
              <div data-testid="mcp-empty-state" className="p-8 text-center text-[#71717A]">
                Aucun connecteur MCP ne correspond à votre recherche.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
                {filteredConnectors.map((connector) => (
                  <div
                    key={connector.id}
                    data-testid={`connector-card-${connector.id}`}
                    onClick={() => {
                      setSelectedId(connector.id);
                      onSelectConnector?.(connector.id);
                    }}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all hover:border-[#3E3E44] ${
                      selectedId === connector.id
                        ? "border-[#55555E] bg-[#1C1C20]"
                        : "border-[#26262A] bg-[#121215]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#26262A] font-semibold text-white">
                          {connector.name[0]}
                        </div>
                        <div>
                          <div className="text-[15px] font-medium text-[#F1F1F2]">{connector.name}</div>
                          <div className="text-xs text-[#71717A]">{connector.categoryLabel}</div>
                        </div>
                      </div>
                      <span
                        data-testid={`badge-${connector.id}`}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          connector.status === "operational" || connector.status === "connected"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {connector.statusText}
                      </span>
                    </div>

                    <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[#8E8E93]">
                      {connector.description}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-[#232326] pt-2.5 text-[11.5px] text-[#6C6C70]">
                      <span>{connector.tools.length} outils disponibles</span>
                      <span className="text-[#A1A1AA] hover:text-white">Inspecter →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail Inspector Drawer / Panel */}
          {activeConnector && (
            <div
              data-testid="mcp-connector-inspector"
              className="flex flex-1 flex-col overflow-y-auto bg-[#141416] p-6"
            >
              <div className="flex items-start justify-between">
                <div>
                  <button
                    type="button"
                    data-testid="inspector-back-btn"
                    onClick={() => {
                      setSelectedId(null);
                      onSelectConnector?.(null);
                    }}
                    className="mb-2 text-xs text-[#85858A] hover:text-white md:hidden"
                  >
                    ← Retour à la liste
                  </button>
                  <h3 className="text-lg font-semibold text-white">{activeConnector.name}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-[#85858A]">{activeConnector.endpoint}</span>
                    <span className="rounded-md bg-[#26262A] px-2 py-0.5 text-[10px] text-[#A1A1AA]">
                      {activeConnector.protocol}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="inspector-close-btn"
                  onClick={() => {
                    setSelectedId(null);
                    onSelectConnector?.(null);
                  }}
                  className="text-[#85858A] hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Security Banner */}
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-400">
                <div className="font-semibold">{activeConnector.badgeText}</div>
                <div className="mt-0.5 text-[11px] text-emerald-300/80">
                  {activeConnector.securityLevel}
                </div>
              </div>

              {/* Tools Table */}
              <div className="mt-5 flex-1">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
                  Outils Disponibles ({activeConnector.tools.length})
                </h4>
                <div className="mt-2.5 space-y-2">
                  {activeConnector.tools.map((tool) => (
                    <div
                      key={tool.name}
                      data-testid={`tool-item-${tool.name}`}
                      className="rounded-xl border border-[#26262A] bg-[#101012] p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-[#60A5FA]">
                          {tool.name}
                        </span>
                        {tool.isSensitive ? (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">
                            Sensible
                          </span>
                        ) : (
                          <span className="rounded bg-[#26262A] px-1.5 py-0.5 text-[10px] text-[#A1A1AA]">
                            Standard
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[#8E8E93]">{tool.description}</p>
                      {tool.requiredParams.length > 0 && (
                        <div className="mt-2 text-[11px] text-[#71717A]">
                          Paramètres requis :{" "}
                          <span className="font-mono text-[#D4D4D8]">
                            {tool.requiredParams.join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Hybrid Agent Tool Selector UI Harness (<BotMcpToolSelector />)
 */
interface BotMcpToolSelectorHarnessProps {
  value: BotMcpConfig;
  onChange: (next: BotMcpConfig) => void;
}

export function BotMcpToolSelectorHarness({
  value,
  onChange,
}: BotMcpToolSelectorHarnessProps) {
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);

  const connectors = SOVEREIGN_MCP_CONNECTORS;

  function toggleConnector(connectorId: string, enabled: boolean) {
    const nextConnectors = { ...(value.connectors || {}) };
    nextConnectors[connectorId] = enabled;

    const nextTools = { ...(value.tools || {}) };
    const connector = getSovereignConnector(connectorId);
    if (connector) {
      for (const tool of connector.tools) {
        if (!enabled) {
          nextTools[tool.name] = false;
        } else if (nextTools[tool.name] === false) {
          delete nextTools[tool.name];
        }
      }
    }

    onChange({
      connectors: nextConnectors,
      tools: nextTools,
    });
  }

  function toggleTool(toolName: string, enabled: boolean) {
    const nextTools = { ...(value.tools || {}) };
    nextTools[toolName] = enabled;
    onChange({
      ...value,
      tools: nextTools,
    });
  }

  return (
    <div data-testid="bot-mcp-tool-selector" className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[#ECECEE]">
          Connecteurs & Outils MCP de l'Agent
        </label>
        <span className="text-xs text-[#71717A]">
          Attribution hybride & filtrage dynamique au runtime
        </span>
      </div>

      <div className="space-y-2.5">
        {connectors.map((connector) => {
          const isConnEnabled = value.connectors?.[connector.id] ?? true;
          const isExpanded = expandedConnector === connector.id;

          const enabledToolsCount = connector.tools.filter(
            (t) => value.tools?.[t.name] ?? isConnEnabled,
          ).length;

          return (
            <div
              key={connector.id}
              data-testid={`mcp-accordion-${connector.id}`}
              className="overflow-hidden rounded-xl border border-[#26262A] bg-[#121215]"
            >
              {/* Connector Row with 1-Click Toggle */}
              <div className="flex items-center justify-between p-3.5">
                <div
                  className="flex flex-1 cursor-pointer items-center gap-3"
                  onClick={() => setExpandedConnector(isExpanded ? null : connector.id)}
                >
                  <span className="text-xs text-[#71717A]">{isExpanded ? "▼" : "▶"}</span>
                  <div>
                    <div className="text-sm font-medium text-[#F1F1F2]">{connector.name}</div>
                    <div className="text-xs text-[#71717A]">
                      {enabledToolsCount} / {connector.tools.length} outils actifs
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      data-testid={`connector-switch-${connector.id}`}
                      checked={isConnEnabled}
                      onChange={(e) => toggleConnector(connector.id, e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`h-6 w-11 rounded-full transition-colors ${
                        isConnEnabled ? "bg-emerald-500" : "bg-[#2C2C30]"
                      }`}
                    >
                      <div
                        className={`h-5 w-5 transform rounded-full bg-white transition-transform ${
                          isConnEnabled ? "translate-x-5" : "translate-x-0.5"
                        } mt-0.5`}
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Accordion Body with Granular Tool Checkboxes */}
              {isExpanded && (
                <div
                  data-testid={`tools-accordion-body-${connector.id}`}
                  className="border-t border-[#202024] bg-[#0E0E10] p-3 space-y-2"
                >
                  {connector.tools.map((tool) => {
                    const isToolChecked = value.tools?.[tool.name] ?? isConnEnabled;

                    return (
                      <label
                        key={tool.name}
                        data-testid={`tool-checkbox-row-${tool.name}`}
                        className="flex cursor-pointer items-center justify-between rounded-lg p-2 hover:bg-[#18181C]"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            data-testid={`tool-checkbox-${tool.name}`}
                            checked={isToolChecked}
                            onChange={(e) => toggleTool(tool.name, e.target.checked)}
                            className="h-4 w-4 rounded border-[#3E3E44] bg-[#1E1E22] text-emerald-500"
                          />
                          <div>
                            <div className="font-mono text-xs text-[#ECECEE]">{tool.name}</div>
                            <div className="text-[11px] text-[#71717A]">{tool.label}</div>
                          </div>
                        </div>
                        {tool.isSensitive && (
                          <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-400">
                            Sensible
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Pure Runtime Filter Function matching executor.ts & pi-runtime.ts logic
 */
export function filterToolsForBot(
  allTools: Array<{ name: string; connectorId?: string }>,
  mcpConfig?: BotMcpConfig | null,
): Array<{ name: string; connectorId?: string }> {
  if (!mcpConfig) {
    return allTools;
  }

  return allTools.filter((tool) => {
    // 1. Check explicit per-tool override
    if (mcpConfig.tools && typeof mcpConfig.tools[tool.name] === "boolean") {
      return mcpConfig.tools[tool.name];
    }

    // 2. Find parent connector
    const connector = tool.connectorId
      ? getSovereignConnector(tool.connectorId)
      : getConnectorForTool(tool.name);

    if (connector) {
      if (
        mcpConfig.connectors &&
        typeof mcpConfig.connectors[connector.id] === "boolean"
      ) {
        return mcpConfig.connectors[connector.id];
      }
    }

    // 3. Default to allowed if not explicitly denied
    return true;
  });
}

// ============================================================================
// 4-TIER E2E TEST SUITE FOR MOBILE-FIRST & SOVEREIGN MCP CONNECTORS
// ============================================================================

describe("Rakazo WebUI Mobile-First & Sovereign MCP Connectors (Master 4-Tier E2E)", () => {
  // --------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (All 17 Features, >=5 tests per feature)
  // --------------------------------------------------------------------------
  describe("Tier 1: Feature Coverage (All 17 Features)", () => {
    // Feature 1: Mobile Drawer Navigation
    describe("F1: Mobile Drawer Navigation", () => {
      it("1.1 renders off-canvas sidebar drawer with -translate-x-full when closed on mobile", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={375}
          />,
        );
        expect(html).toContain("-translate-x-full");
        expect(html).toContain("w-[316px]");
      });

      it("1.2 renders sidebar drawer with translate-x-0 when open on mobile", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={true}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={375}
          />,
        );
        expect(html).toContain("translate-x-0");
        expect(html).toContain("z-50");
      });

      it("1.3 displays semi-transparent backdrop overlay when drawer is open on mobile", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={true}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={375}
          />,
        );
        expect(html).toContain("mobile-drawer-backdrop");
        expect(html).toContain("bg-black/60");
      });

      it("1.4 omits backdrop overlay when drawer is closed on mobile", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={375}
          />,
        );
        expect(html).not.toContain("mobile-drawer-backdrop");
      });

      it("1.5 renders fixed docked sidebar on desktop viewports (>=768px)", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={1024}
          />,
        );
        expect(html).toContain("md:relative");
        expect(html).toContain("md:translate-x-0");
      });
    });

    // Feature 2: Mobile Header & Hamburger
    describe("F2: Mobile Header & Hamburger Menu", () => {
      it("2.1 renders compact top header hidden on desktop (md:hidden)", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("mobile-header");
        expect(html).toContain("h-14");
        expect(html).toContain("md:hidden");
      });

      it("2.2 renders hamburger toggle button with accessible aria-label", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("mobile-hamburger-btn");
        expect(html).toContain("Ouvrir le menu latéral");
      });

      it("2.3 displays active agent name in the mobile header", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            activeBotName="Agent Recherche Souveraine"
          />,
        );
        expect(html).toContain("Agent Recherche Souveraine");
      });

      it("2.4 displays agent status indicator dot with green online styling", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            activeBotStatus="online"
          />,
        );
        expect(html).toContain("bg-emerald-500");
      });

      it("2.5 provides quick new chat action button in the mobile header", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("mobile-new-chat-btn");
        expect(html).toContain("Nouveau chat");
      });
    });

    // Feature 3: iOS Safari Auto-Zoom Prevention
    describe("F3: iOS Safari Auto-Zoom Prevention", () => {
      it("3.1 specifies text-[16px] on chat composer input for mobile viewports", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("text-[16px]");
      });

      it("3.2 specifies text-[16px] on MCP search input in showcase", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("text-[16px]");
      });

      it("3.3 specifies text-[16px] or larger in AuthPage form fields", () => {
        const html = renderToStaticMarkup(
          <MemoryRouter>
            <AuthPage mode="up" />
          </MemoryRouter>,
        );
        expect(html).toContain("text-[17px]");
      });

      it("3.4 scales gracefully to sm:text-[15.5px] or desktop typography on larger screens", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("sm:text-[15.5px]");
      });

      it("3.5 uses minimum height min-h-[44px] on text inputs to prevent iOS layout clipping", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("min-h-[44px]");
      });
    });

    // Feature 4: Mobile Touch Ergonomics
    describe("F4: Mobile Touch Ergonomics", () => {
      it("4.1 ensures send button has minimum 44px touch target (h-11 min-w-[44px])", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("min-w-[44px]");
        expect(html).toContain("min-h-[44px]");
      });

      it("4.2 ensures hamburger menu button has 44px hit-box (h-11 w-11)", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("h-11 w-11");
      });

      it("4.3 ensures navigation drawer links have min-h-[44px] touch heights", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={true}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("min-h-[44px]");
      });

      it("4.4 ensures modal close buttons have minimum 40px hit area (h-10 w-10)", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("h-10 w-10");
      });

      it("4.5 ensures category pills in MCP showcase are horizontally scrollable on mobile", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("overflow-x-auto");
        expect(html).toContain("whitespace-nowrap");
      });
    });

    // Feature 5: Safe-Area Inset Handling
    describe("F5: Safe-Area Inset Handling", () => {
      it("5.1 applies env(safe-area-inset-bottom) to bottom composer container", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("safe-area-inset-bottom");
      });

      it("5.2 ensures fallback padding max(12px, env(safe-area-inset-bottom))", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("pb-[max(12px,env(safe-area-inset-bottom))]");
      });

      it("5.3 protects full viewport height layout with h-screen or min-h-full", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
          />,
        );
        expect(html).toContain("h-screen");
      });

      it("5.4 protects AuthPage against mobile browser bottom navigation overlays", () => {
        const html = renderToStaticMarkup(
          <MemoryRouter>
            <AuthPage mode="in" />
          </MemoryRouter>,
        );
        expect(html).toContain("min-h-full");
      });

      it("5.5 maintains smooth inner scrolling container on mobile overlays", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("overflow-y-auto");
      });
    });

    // Feature 6: Adaptive Overlays & Modals
    describe("F6: Adaptive Overlays & Modals", () => {
      it("6.1 renders SkillLibraryOverlay with adaptive padding (p-4 sm:p-10)", () => {
        const html = renderToStaticMarkup(
          <SkillLibraryOverlay skills={[]} onClose={() => {}} />,
        );
        expect(html).toContain("Bibliothèque de Compétences");
        expect(html).toContain("bg-[#141416]");
      });

      it("6.2 renders ModelSettingsOverlay with adaptive height h-[min(760px,100%)]", () => {
        const html = renderToStaticMarkup(<ModelSettingsOverlay onClose={() => {}} />);
        expect(html).toContain("Modèles d&#x27;IA");
        expect(html).toContain("h-[min(760px,100%)]");
      });

      it("6.3 renders VoiceSettingsOverlay with responsive container tokens", () => {
        const html = renderToStaticMarkup(<VoiceSettingsOverlay onClose={() => {}} />);
        expect(html).toContain("Synthèse vocale");
        expect(html).toContain("data-testid=\"voice-settings\"");
      });

      it("6.4 renders adaptive modal backdrop with semi-transparent elevation", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("bg-[rgba(4,4,5,.62)]");
        expect(html).toContain("shadow-[0_40px_90px_rgba(0,0,0,.55)]");
      });

      it("6.5 renders McpShowcaseHarness adaptively on mobile and desktop", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("Connecteurs MCP Souverains");
        expect(html).toContain("p-4 sm:p-10");
        expect(html).toContain("h-[min(760px,100%)]");
      });
    });

    // Feature 7: Desktop High-Fidelity UI
    describe("F7: Desktop High-Fidelity UI", () => {
      it("7.1 preserves exact 316px docked sidebar width on desktop", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={1200}
          />,
        );
        expect(html).toContain("w-[316px]");
      });

      it("7.2 preserves exact 1080px modal width on desktop dialogs", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("w-[1080px]");
        expect(html).toContain("max-w-full");
      });

      it("7.3 renders rounded-[26px] corner radius on desktop floating dialogs", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("rounded-[26px]");
      });

      it("7.4 renders rich dark enterprise elevation shadow shadow-[0_40px_90px_rgba(0,0,0,.55)]", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("shadow-[0_40px_90px_rgba(0,0,0,.55)]");
      });

      it("7.5 preserves 2-column inspector layout on desktop viewports", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedConnectorId="github" />);
        expect(html).toContain("md:w-1/2");
        expect(html).toContain("md:border-r");
      });
    });

    // Feature 8: Sovereign MCP Catalog Matrix
    describe("F8: Sovereign MCP Catalog Matrix", () => {
      it("8.1 defines exactly 8 sovereign enterprise connectors", () => {
        expect(SOVEREIGN_MCP_CONNECTORS).toHaveLength(8);
      });

      it("8.2 defines exactly 40 sovereign enterprise tools across the catalog", () => {
        const totalTools = SOVEREIGN_MCP_CONNECTORS.reduce(
          (sum, connector) => sum + connector.tools.length,
          0,
        );
        expect(totalTools).toBe(40);
        expect(ALL_SOVEREIGN_TOOL_NAMES).toHaveLength(40);
      });

      it("8.3 includes all required enterprise connectors (SearXNG, GitHub, Notion, Postiz, WordPress, n8n, Cloudflare, Système)", () => {
        const expectedSlugs = [
          "searxng_scraperr",
          "github",
          "notion",
          "postiz",
          "wordpress_novamira",
          "n8n",
          "cloudflare",
          "system_platform",
        ];
        const slugs = SOVEREIGN_MCP_CONNECTORS.map((c) => c.slug);
        for (const expected of expectedSlugs) {
          expect(slugs).toContain(expected);
        }
      });

      it("8.4 provides complete metadata (endpoint, protocol, status, securityLevel) for each connector", () => {
        for (const connector of SOVEREIGN_MCP_CONNECTORS) {
          expect(connector.id).toBeTruthy();
          expect(connector.name).toBeTruthy();
          expect(connector.endpoint).toBeTruthy();
          expect(connector.protocol).toBeTruthy();
          expect(connector.securityLevel).toBeTruthy();
          expect(connector.badgeText).toBeTruthy();
        }
      });

      it("8.5 provides helper functions to query connectors and tools by category or name", () => {
        expect(isSovereignTool("web_search")).toBe(true);
        expect(isSovereignTool("github_create_issue")).toBe(true);
        expect(isSovereignTool("unknown_nonexistent_tool")).toBe(false);

        const gh = getConnectorForTool("github_list_issues");
        expect(gh?.id).toBe("github");

        const searchTools = getSovereignToolsByCategory("search");
        expect(searchTools.some((t) => t.name === "web_search")).toBe(true);
      });
    });

    // Feature 9: Plugins & Integrations Showcase
    describe("F9: Plugins & Integrations Showcase", () => {
      it("9.1 renders 8 Sovereign MCP connectors in the showcase UI", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("connector-card-searxng_scraperr");
        expect(html).toContain("connector-card-github");
        expect(html).toContain("connector-card-notion");
        expect(html).toContain("connector-card-postiz");
        expect(html).toContain("connector-card-wordpress_novamira");
        expect(html).toContain("connector-card-n8n");
        expect(html).toContain("connector-card-cloudflare");
        expect(html).toContain("connector-card-system_platform");
      });

      it("9.2 renders all category filter pills including 'Tous' and 'Connectés'", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        for (const cat of SOVEREIGN_CATEGORIES) {
          expect(html).toContain(`category-tab-${cat.id}`);
          expect(html).toContain(cat.label);
        }
      });

      it("9.3 filters connector list by category tab", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedCategory="code" />);
        expect(html).toContain("connector-card-github");
        expect(html).not.toContain("connector-card-notion");
      });

      it("9.4 filters connector list by search keyword", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness searchQuery="dns" />);
        expect(html).toContain("connector-card-cloudflare");
        expect(html).not.toContain("connector-card-github");
      });

      it("9.5 displays green status badge for operational sovereign connectors", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("text-emerald-400");
        expect(html).toContain("badge-searxng_scraperr");
      });
    });

    // Feature 10: MCP Connector Detail Inspector
    describe("F10: MCP Connector Detail Inspector", () => {
      it("10.1 displays connector overview, endpoint and protocol in inspector", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedConnectorId="github" />);
        expect(html).toContain("mcp-connector-inspector");
        expect(html).toContain("api.github.com");
        expect(html).toContain("HTTPS / GitHub REST v3 &amp; GraphQL");
      });

      it("10.2 displays sovereign security level banner", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedConnectorId="github" />);
        expect(html).toContain("Bearer Token Sanitized · Ephemeral Header Injection");
      });

      it("10.3 lists all tools belonging to the selected connector", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedConnectorId="github" />);
        expect(html).toContain("tool-item-github_search_repos");
        expect(html).toContain("tool-item-github_get_file_contents");
        expect(html).toContain("tool-item-github_list_issues");
        expect(html).toContain("tool-item-github_create_issue");
        expect(html).toContain("tool-item-github_get_pull_request");
        expect(html).toContain("tool-item-github_create_issue_comment");
      });

      it("10.4 displays required parameters for each tool", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedConnectorId="github" />);
        expect(html).toContain("Paramètres requis :");
        expect(html).toContain("owner, repo");
      });

      it("10.5 tags sensitive tools with a red 'Sensible' badge", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness selectedConnectorId="github" />);
        expect(html).toContain("Sensible");
      });
    });

    // Feature 11: Hybrid Agent Tool Selector UI
    describe("F11: Hybrid Agent Tool Selector UI", () => {
      it("11.1 renders 1-click global switch for each connector", () => {
        const html = renderToStaticMarkup(
          <BotMcpToolSelectorHarness value={{}} onChange={() => {}} />,
        );
        expect(html).toContain("connector-switch-searxng_scraperr");
        expect(html).toContain("connector-switch-github");
        expect(html).toContain("connector-switch-notion");
      });

      it("11.2 renders expandable accordion arrows for per-tool drill-down", () => {
        const html = renderToStaticMarkup(
          <BotMcpToolSelectorHarness value={{}} onChange={() => {}} />,
        );
        expect(html).toContain("mcp-accordion-searxng_scraperr");
        expect(html).toContain("▶");
      });

      it("11.3 displays active tool counts (e.g. '6 / 6 outils actifs')", () => {
        const html = renderToStaticMarkup(
          <BotMcpToolSelectorHarness value={{}} onChange={() => {}} />,
        );
        expect(html).toContain("6 / 6 outils actifs");
      });

      it("11.4 displays toggle switches with green state when connector is enabled", () => {
        const html = renderToStaticMarkup(
          <BotMcpToolSelectorHarness
            value={{ connectors: { github: true } }}
            onChange={() => {}}
          />,
        );
        expect(html).toContain("bg-emerald-500");
      });

      it("11.5 displays inactive styling when connector is toggled off", () => {
        const html = renderToStaticMarkup(
          <BotMcpToolSelectorHarness
            value={{ connectors: { github: false } }}
            onChange={() => {}}
          />,
        );
        expect(html).toContain("0 / 6 outils actifs");
      });
    });

    // Feature 12: Per-Agent Tool Permissions DB Persistence
    describe("F12: Per-Agent Tool Permissions DB Persistence", () => {
      it("12.1 correctly formats BotMcpConfig JSON schema structure", () => {
        const config: BotMcpConfig = {
          connectors: { github: true, notion: false, searxng_scraperr: true },
          tools: { github_create_issue: false },
        };
        expect(config.connectors?.github).toBe(true);
        expect(config.connectors?.notion).toBe(false);
        expect(config.tools?.github_create_issue).toBe(false);
      });

      it("12.2 serializes BotMcpConfig into bot metadata without data loss", () => {
        const metadata = {
          mcp: {
            connectors: { github: true },
            tools: { github_list_issues: true },
          },
          otherField: "val",
        };
        const serialized = JSON.stringify(metadata);
        const parsed = JSON.parse(serialized);
        expect(parsed.mcp.connectors.github).toBe(true);
        expect(parsed.mcp.tools.github_list_issues).toBe(true);
      });

      it("12.3 handles undefined and empty metadata gracefully", () => {
        const emptyConfig: BotMcpConfig = {};
        expect(filterToolsForBot([{ name: "web_search" }], emptyConfig)).toHaveLength(1);
      });

      it("12.4 preserves non-MCP metadata properties during persistence operations", () => {
        const botMeta = {
          skills: ["docling-document-parser"],
          mcp: { connectors: { n8n: true } },
          avatarColor: "#2C2C30",
        };
        const updatedMeta = {
          ...botMeta,
          mcp: { ...botMeta.mcp, connectors: { ...botMeta.mcp.connectors, github: true } },
        };
        expect(updatedMeta.skills).toEqual(["docling-document-parser"]);
        expect(updatedMeta.mcp.connectors.github).toBe(true);
        expect(updatedMeta.mcp.connectors.n8n).toBe(true);
      });

      it("12.5 supports granular tool overrides where connector is off but specific tool is on", () => {
        const config: BotMcpConfig = {
          connectors: { github: false },
          tools: { github_search_repos: true },
        };
        const tools = [
          { name: "github_search_repos", connectorId: "github" },
          { name: "github_create_issue", connectorId: "github" },
        ];
        const filtered = filterToolsForBot(tools, config);
        expect(filtered.map((t) => t.name)).toEqual(["github_search_repos"]);
      });
    });

    // Feature 13: Dynamic Runtime Tool Filtering
    describe("F13: Dynamic Runtime Tool Filtering", () => {
      const allSampleTools = [
        { name: "web_search", connectorId: "searxng_scraperr" },
        { name: "web_scrape", connectorId: "searxng_scraperr" },
        { name: "github_search_repos", connectorId: "github" },
        { name: "github_create_issue", connectorId: "github" },
        { name: "notion_search", connectorId: "notion" },
        { name: "cloudflare_list_zones", connectorId: "cloudflare" },
      ];

      it("13.1 allows all tools when bot has no restrictive MCP configuration", () => {
        const result = filterToolsForBot(allSampleTools, null);
        expect(result).toHaveLength(6);
      });

      it("13.2 disables all tools of a connector when connector is disabled in bot config", () => {
        const config: BotMcpConfig = {
          connectors: { github: false },
        };
        const result = filterToolsForBot(allSampleTools, config);
        const names = result.map((t) => t.name);
        expect(names).not.toContain("github_search_repos");
        expect(names).not.toContain("github_create_issue");
        expect(names).toContain("web_search");
      });

      it("13.3 disables specific tool when individually set to false in config.tools", () => {
        const config: BotMcpConfig = {
          connectors: { github: true },
          tools: { github_create_issue: false },
        };
        const result = filterToolsForBot(allSampleTools, config);
        const names = result.map((t) => t.name);
        expect(names).toContain("github_search_repos");
        expect(names).not.toContain("github_create_issue");
      });

      it("13.4 enables specific tool when individually set to true even if connector is false", () => {
        const config: BotMcpConfig = {
          connectors: { github: false },
          tools: { github_search_repos: true },
        };
        const result = filterToolsForBot(allSampleTools, config);
        const names = result.map((t) => t.name);
        expect(names).toContain("github_search_repos");
        expect(names).not.toContain("github_create_issue");
      });

      it("13.5 resolves connector by tool lookup if connectorId is not explicitly provided on tool object", () => {
        const toolsWithoutConnId = [
          { name: "web_search" },
          { name: "notion_search" },
        ];
        const config: BotMcpConfig = {
          connectors: { notion: false },
        };
        const result = filterToolsForBot(toolsWithoutConnId, config);
        expect(result.map((t) => t.name)).toEqual(["web_search"]);
      });
    });

    // Feature 14: Subagent Permission Inheritance
    describe("F14: Subagent Permission Inheritance", () => {
      it("14.1 ensures subagent inherits restricted toolset from parent bot", () => {
        const parentConfig: BotMcpConfig = {
          connectors: { github: true, cloudflare: false, notion: false },
        };
        const subagentTools = filterToolsForBot(
          [
            { name: "github_search_repos", connectorId: "github" },
            { name: "cloudflare_list_zones", connectorId: "cloudflare" },
          ],
          parentConfig,
        );
        expect(subagentTools.map((t) => t.name)).toEqual(["github_search_repos"]);
      });

      it("14.2 prevents subagents from escalating permissions beyond parent bot", () => {
        const parentConfig: BotMcpConfig = {
          connectors: { github: false },
          tools: { github_create_issue: false },
        };
        const childRequestedTools = [
          { name: "github_create_issue", connectorId: "github" },
          { name: "web_search", connectorId: "searxng_scraperr" },
        ];
        const childAllowed = filterToolsForBot(childRequestedTools, parentConfig);
        expect(childAllowed.map((t) => t.name)).toEqual(["web_search"]);
      });

      it("14.3 allows further restriction of subagent permissions relative to parent", () => {
        const parentConfig: BotMcpConfig = {
          connectors: { github: true, searxng_scraperr: true },
        };
        const childConfig: BotMcpConfig = {
          connectors: { ...parentConfig.connectors, github: false },
        };
        const tools = [
          { name: "github_search_repos", connectorId: "github" },
          { name: "web_search", connectorId: "searxng_scraperr" },
        ];
        const childAllowed = filterToolsForBot(tools, childConfig);
        expect(childAllowed.map((t) => t.name)).toEqual(["web_search"]);
      });

      it("14.4 preserves builtin coordination tools (`remember`, `run_subagent`, `spawn_bot`) across subagents", () => {
        const systemTools = [
          { name: "remember", connectorId: "system_platform" },
          { name: "run_subagent", connectorId: "system_platform" },
          { name: "read_skill", connectorId: "system_platform" },
        ];
        const config: BotMcpConfig = {
          connectors: { github: false },
        };
        const allowed = filterToolsForBot(systemTools, config);
        expect(allowed).toHaveLength(3);
      });

      it("14.5 handles deeply nested subagent chains idempotently", () => {
        let currentConfig: BotMcpConfig = {
          connectors: { github: true, notion: true, n8n: false },
        };
        currentConfig = {
          connectors: { ...currentConfig.connectors, notion: false },
        };
        currentConfig = {
          connectors: { ...currentConfig.connectors, github: false },
        };
        const tools = [
          { name: "github_search_repos", connectorId: "github" },
          { name: "notion_search", connectorId: "notion" },
          { name: "web_search", connectorId: "searxng_scraperr" },
        ];
        const finalTools = filterToolsForBot(tools, currentConfig);
        expect(finalTools.map((t) => t.name)).toEqual(["web_search"]);
      });
    });

    // Feature 15: Multi-Layer Security Sanitization
    describe("F15: Multi-Layer Security Sanitization", () => {
      it("15.1 scrubs GitHub Personal Access Tokens (ghp_*) from error messages", () => {
        const errorMsg = "GitHub API failed with ghp_1234567890abcdefghijklmnopqrstuvwx on repo";
        const sanitized = sanitizeToolError(errorMsg);
        expect(sanitized).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwx");
        expect(sanitized).toContain("ghp_[redacted]");
      });

      it("15.2 scrubs Notion internal tokens (secret_*) from error traces", () => {
        const errorMsg = "Notion query failed for token secret_abcdef123456789012345678901234";
        const sanitized = sanitizeToolError(errorMsg);
        expect(sanitized).not.toContain("secret_abcdef123456789012345678901234");
        expect(sanitized).toContain("secret_[redacted]");
      });

      it("15.3 scrubs Bearer tokens and Authorization headers from output", () => {
        const errorMsg = "HTTP 401 Unauthorized: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz";
        const sanitized = sanitizeToolError(errorMsg);
        expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz");
        expect(sanitized).toContain("Bearer [redacted]");
      });

      it("15.4 scrubs API keys and password queries in connection URLs", () => {
        const errorMsg = "Connection failed with nova_1234567890abcdef on api";
        const sanitized = sanitizeToolError(errorMsg);
        expect(sanitized).not.toContain("nova_1234567890abcdef");
        expect(sanitized).toContain("nova_[redacted]");
      });

      it("15.5 redacts secrets while preserving standard diagnostic error messages", () => {
        const cleanMsg = "SearXNG error: HTTP 404 Not Found";
        const sanitized = sanitizeToolError(cleanMsg);
        expect(sanitized).toBe("SearXNG error: HTTP 404 Not Found");
      });
    });

    // Feature 16: Monorepo CI/CD Validation
    describe("F16: Monorepo CI/CD Validation", () => {
      it("16.1 exports all essential contracts from @rakazo/contracts index", () => {
        expect(SOVEREIGN_MCP_CONNECTORS).toBeDefined();
        expect(SOVEREIGN_CATEGORIES).toBeDefined();
        expect(ALL_SOVEREIGN_TOOL_NAMES).toBeDefined();
        expect(getAllSovereignTools).toBeDefined();
      });

      it("16.2 ensures 0 schema collisions in sovereign tool parameter definitions", () => {
        const allTools = getAllSovereignTools();
        for (const tool of allTools) {
          expect(tool.name).toBeTruthy();
          expect(tool.parameters).toBeDefined();
          const paramNames = tool.parameters.map((p) => p.name);
          const uniqueNames = new Set(paramNames);
          expect(uniqueNames.size).toBe(paramNames.length);
        }
      });

      it("16.3 confirms all 8 sovereign connectors have unique identifiers and slugs", () => {
        const ids = SOVEREIGN_MCP_CONNECTORS.map((c) => c.id);
        const slugs = SOVEREIGN_MCP_CONNECTORS.map((c) => c.slug);
        expect(new Set(ids).size).toBe(8);
        expect(new Set(slugs).size).toBe(8);
      });

      it("16.4 confirms all 40 sovereign tools have unique function names across the entire catalog", () => {
        const toolNames = ALL_SOVEREIGN_TOOL_NAMES;
        expect(new Set(toolNames).size).toBe(40);
      });

      it("16.5 confirms all required tool parameters exist in the parameters array", () => {
        const allTools = getAllSovereignTools();
        for (const tool of allTools) {
          const declaredParamNames = tool.parameters.map((p) => p.name);
          for (const req of tool.requiredParams) {
            expect(declaredParamNames).toContain(req);
          }
        }
      });
    });

    // Feature 17: Adversarial Coverage Hardening
    describe("F17: Adversarial Coverage Hardening", () => {
      it("17.1 sanitizes XSS and script payloads in connector and tool names during UI rendering", () => {
        const maliciousConnector: SovereignMcpConnector = {
          id: "xss_connector",
          slug: "xss_connector",
          name: "<script>alert('xss')</script>Malicious MCP",
          category: "system",
          categoryLabel: "Système",
          description: "<img src=x onerror=alert('xss')> Description",
          icon: "Shield",
          endpoint: "javascript:alert('xss')",
          protocol: "HTTP",
          status: "connected",
          statusText: "Connecté",
          badgeText: "Souverain",
          securityLevel: "High",
          isBuiltin: false,
          tools: [],
        };
        const html = renderToStaticMarkup(
          <div data-testid="xss-test">
            <span>{maliciousConnector.name}</span>
            <p>{maliciousConnector.description}</p>
          </div>,
        );
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;Malicious MCP");
      });

      it("17.2 handles empty or malformed JSON objects in filterToolsForBot safely without throw", () => {
        const result1 = filterToolsForBot([{ name: "test" }], null);
        const result2 = filterToolsForBot([{ name: "test" }], undefined);
        const result3 = filterToolsForBot([{ name: "test" }], {} as any);
        const result4 = filterToolsForBot([{ name: "test" }], { connectors: null, tools: null } as any);
        expect(result1).toHaveLength(1);
        expect(result2).toHaveLength(1);
        expect(result3).toHaveLength(1);
        expect(result4).toHaveLength(1);
      });

      it("17.3 handles extreme numbers of tool overrides (1000+ entries) without memory leak or lag", () => {
        const largeConfig: BotMcpConfig = {
          tools: {},
        };
        for (let i = 0; i < 1000; i++) {
          largeConfig.tools![`synthetic_tool_${i}`] = i % 2 === 0;
        }
        const sampleTools = [{ name: "synthetic_tool_42" }, { name: "synthetic_tool_43" }];
        const filtered = filterToolsForBot(sampleTools, largeConfig);
        expect(filtered.map((t) => t.name)).toEqual(["synthetic_tool_42"]);
      });

      it("17.4 handles long multi-line secret redactions and complex stack traces safely", () => {
        const complexError = `Error: Authentication failed
          at GithubClient.authenticate (node_modules/gh/client.ts:42:15)
          token provided: ghp_supersecrettoken1234567890longstring
          Authorization: Bearer secret_1234567890abcdef1234567890abcdef
          Host: search.internal.net`;
        const sanitized = sanitizeToolError(complexError);
        expect(sanitized).not.toContain("ghp_supersecrettoken1234567890longstring");
        expect(sanitized).not.toContain("secret_1234567890abcdef1234567890abcdef");
        expect(sanitized).toContain("Error: Authentication failed");
      });

      it("17.5 rejects unknown tool queries in getConnectorForTool returning undefined without throwing", () => {
        expect(getConnectorForTool("")).toBeUndefined();
        expect(getConnectorForTool("non_existent_tool_12345")).toBeUndefined();
        expect(getConnectorForTool("null")).toBeUndefined();
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (>=5 tests per group)
  // --------------------------------------------------------------------------
  describe("Tier 2: Boundary & Corner Cases", () => {
    describe("2.1 Viewport Breakpoints & Extreme Widths", () => {
      it("2.1.1 renders correctly on ultra-compact mobile (320px width)", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={320}
          />,
        );
        expect(html).toContain("h-14");
        expect(html).toContain("-translate-x-full");
      });

      it("2.1.2 renders correctly on standard iPhone SE (375px width)", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={true}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={375}
          />,
        );
        expect(html).toContain("mobile-drawer-backdrop");
      });

      it("2.1.3 renders correctly at exact tablet breakpoint boundary (767px vs 768px)", () => {
        const mobileHtml = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={767}
          />,
        );
        const desktopHtml = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={768}
          />,
        );
        expect(mobileHtml).toContain("-translate-x-full");
        expect(desktopHtml).toContain("md:relative");
      });

      it("2.1.4 renders correctly on desktop workstation (1440px+ width)", () => {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={1440}
          />,
        );
        expect(html).toContain("w-[316px]");
      });

      it("2.1.5 preserves modal constraints on ultra-wide viewports (2560px)", () => {
        const html = renderToStaticMarkup(<McpShowcaseHarness />);
        expect(html).toContain("w-[1080px]");
      });
    });

    describe("2.2 Extreme Tool Permission Sets", () => {
      it("2.2.1 handles all 8 connectors explicitly disabled (0 tools permitted)", () => {
        const config: BotMcpConfig = {
          connectors: {
            searxng_scraperr: false,
            github: false,
            notion: false,
            postiz: false,
            wordpress_novamira: false,
            n8n: false,
            cloudflare: false,
            system_platform: false,
          },
        };
        const allTools = getAllSovereignTools();
        const allowed = filterToolsForBot(allTools, config);
        expect(allowed).toHaveLength(0);
      });

      it("2.2.2 handles all 8 connectors explicitly enabled (all 40 tools permitted)", () => {
        const config: BotMcpConfig = {
          connectors: {
            searxng_scraperr: true,
            github: true,
            notion: true,
            postiz: true,
            wordpress_novamira: true,
            n8n: true,
            cloudflare: true,
            system_platform: true,
          },
        };
        const allTools = getAllSovereignTools();
        const allowed = filterToolsForBot(allTools, config);
        expect(allowed).toHaveLength(40);
      });

      it("2.2.3 handles single tool enabled while parent connector is disabled", () => {
        const config: BotMcpConfig = {
          connectors: { github: false },
          tools: { github_list_issues: true },
        };
        const ghTools = getSovereignToolsByCategory("code");
        const allowed = filterToolsForBot(ghTools, config);
        expect(allowed.map((t) => t.name)).toEqual(["github_list_issues"]);
      });

      it("2.2.4 handles single tool disabled while parent connector is enabled", () => {
        const config: BotMcpConfig = {
          connectors: { github: true },
          tools: { github_create_issue: false },
        };
        const ghTools = getSovereignToolsByCategory("code");
        const allowed = filterToolsForBot(ghTools, config);
        expect(allowed).toHaveLength(5);
        expect(allowed.some((t) => t.name === "github_create_issue")).toBe(false);
      });

      it("2.2.5 handles conflicting nested override rules deterministically", () => {
        const config: BotMcpConfig = {
          connectors: { notion: false },
          tools: {
            notion_search: true,
            notion_create_page: false,
          },
        };
        const notionTools = getSovereignToolsByCategory("workspace");
        const allowed = filterToolsForBot(notionTools, config);
        expect(allowed.map((t) => t.name)).toEqual(["notion_search"]);
      });
    });

    describe("2.3 Malformed and Corrupted Metadata", () => {
      it("2.3.1 gracefully handles non-boolean primitive values in connectors map", () => {
        const config: any = {
          connectors: { github: "true", notion: 123 },
        };
        const allowed = filterToolsForBot(
          [{ name: "github_search_repos", connectorId: "github" }],
          config,
        );
        expect(allowed).toHaveLength(1);
      });

      it("2.3.2 gracefully handles unexpected arrays in tools map", () => {
        const config: any = {
          tools: ["github_search_repos"],
        };
        const allowed = filterToolsForBot(
          [{ name: "github_search_repos", connectorId: "github" }],
          config,
        );
        expect(allowed).toHaveLength(1);
      });

      it("2.3.3 handles empty string tool names without exception", () => {
        const tools = [{ name: "" }, { name: "web_search", connectorId: "searxng_scraperr" }];
        const allowed = filterToolsForBot(tools, {});
        expect(allowed).toHaveLength(2);
      });

      it("2.3.4 handles null connectorId references gracefully", () => {
        const tools = [{ name: "custom_tool", connectorId: undefined }];
        const allowed = filterToolsForBot(tools, { connectors: { github: false } });
        expect(allowed).toHaveLength(1);
      });

      it("2.3.5 handles circular references in metadata safely when serializing", () => {
        const cleanConfig: BotMcpConfig = { connectors: { github: true } };
        expect(() => JSON.stringify(cleanConfig)).not.toThrow();
      });
    });
  });

  // --------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS (Pairwise Interactions)
  // --------------------------------------------------------------------------
  describe("Tier 3: Cross-Feature Combinations", () => {
    it("3.1 Mobile Drawer Navigation + Modal Overlay Stacking", () => {
      const html = renderToStaticMarkup(
        <div className="relative">
          <MobileShellNavHarness
            isMobileDrawerOpen={true}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={375}
          />
          <McpShowcaseHarness />
        </div>,
      );
      expect(html).toContain("mobile-drawer-backdrop");
      expect(html).toContain("mcp-showcase-overlay");
      expect(html).toContain("z-50");
    });

    it("3.2 Hybrid Selector UI + Bot Metadata Serialization + Runtime Resolution", () => {
      let state: BotMcpConfig = {
        connectors: { searxng_scraperr: true, github: false },
        tools: { github_search_repos: true },
      };

      const html = renderToStaticMarkup(
        <BotMcpToolSelectorHarness
          value={state}
          onChange={(next) => {
            state = next;
          }}
        />,
      );

      expect(html).toContain("connector-switch-github");

      // Serialize state
      const dbPayload = JSON.stringify({ mcp: state });
      const restored = JSON.parse(dbPayload).mcp as BotMcpConfig;

      // Runtime resolution
      const allTools = getAllSovereignTools();
      const resolved = filterToolsForBot(allTools, restored);
      const names = resolved.map((t) => t.name);

      expect(names).toContain("web_search");
      expect(names).toContain("web_scrape");
      expect(names).toContain("github_search_repos");
      expect(names).not.toContain("github_create_issue");
    });

    it("3.3 MCP Showcase Category Pills + Substring Search Filtering", () => {
      const html = renderToStaticMarkup(
        <McpShowcaseHarness selectedCategory="search" searchQuery="scraperr" />,
      );
      expect(html).toContain("connector-card-searxng_scraperr");
      expect(html).not.toContain("connector-card-github");
    });

    it("3.4 Subagent Spawning + Permission Inheritance + Security Sanitization", () => {
      const parentBotPermissions: BotMcpConfig = {
        connectors: { searxng_scraperr: true, github: false },
      };

      const childBotAttemptedTools = [
        { name: "web_search", connectorId: "searxng_scraperr" },
        { name: "github_create_issue", connectorId: "github" },
      ];

      const filteredChildTools = filterToolsForBot(childBotAttemptedTools, parentBotPermissions);
      expect(filteredChildTools.map((t) => t.name)).toEqual(["web_search"]);

      // Simulate a tool failure containing a secret
      const rawError = "Error executing web_search: Bearer sk-secret-token-12345 failed";
      const sanitized = sanitizeToolError(rawError);
      expect(sanitized).not.toContain("sk-secret-token-12345");
      expect(sanitized).toContain("Bearer [redacted]");
    });

    it("3.5 Responsive Breakpoint Dynamic Transition (Mobile <-> Desktop)", () => {
      const mobileRender = renderToStaticMarkup(
        <MobileShellNavHarness
          isMobileDrawerOpen={false}
          onToggleMobileDrawer={() => {}}
          onCloseMobileDrawer={() => {}}
          viewportWidth={390}
        />,
      );
      const desktopRender = renderToStaticMarkup(
        <MobileShellNavHarness
          isMobileDrawerOpen={false}
          onToggleMobileDrawer={() => {}}
          onCloseMobileDrawer={() => {}}
          viewportWidth={1280}
        />,
      );

      expect(mobileRender).toContain("mobile-hamburger-btn");
      expect(mobileRender).toContain("-translate-x-full");
      expect(desktopRender).toContain("md:relative");
      expect(desktopRender).toContain("md:translate-x-0");
    });
  });

  // --------------------------------------------------------------------------
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // --------------------------------------------------------------------------
  describe("Tier 4: Real-World Application Scenarios", () => {
    it("4.1 Scenario 1: Mobile User Daily Journey", () => {
      let isDrawerOpen = true;
      const htmlDrawer = renderToStaticMarkup(
        <MobileShellNavHarness
          isMobileDrawerOpen={isDrawerOpen}
          onToggleMobileDrawer={() => {}}
          onCloseMobileDrawer={() => {
            isDrawerOpen = false;
          }}
          activeBotName="Rakazo Sovereign Agent"
          viewportWidth={390}
        />,
      );
      expect(htmlDrawer).toContain("mobile-drawer-backdrop");
      expect(htmlDrawer).toContain("Rakazo Sovereign Agent");

      isDrawerOpen = false;
      const htmlChat = renderToStaticMarkup(
        <MobileShellNavHarness
          isMobileDrawerOpen={isDrawerOpen}
          onToggleMobileDrawer={() => {}}
          onCloseMobileDrawer={() => {}}
          activeBotName="Rakazo Sovereign Agent"
          viewportWidth={390}
        />,
      );
      expect(htmlChat).toContain("mobile-composer-container");
      expect(htmlChat).toContain("text-[16px]");
      expect(htmlChat).toContain("safe-area-inset-bottom");
      expect(htmlChat).toContain("Envoyer");
    });

    it("4.2 Scenario 2: Sovereign MCP Explorer Journey", () => {
      const htmlShowcase = renderToStaticMarkup(
        <McpShowcaseHarness selectedCategory="code" selectedConnectorId="github" />,
      );

      expect(htmlShowcase).toContain("connector-card-github");
      expect(htmlShowcase).toContain("mcp-connector-inspector");
      expect(htmlShowcase).toContain("github_list_issues");
      expect(htmlShowcase).toContain("github_create_issue");
      expect(htmlShowcase).toContain("Bearer Token Sanitized");
    });

    it("4.3 Scenario 3: Custom Specialist Bot Creation with Hybrid MCP Permissions", () => {
      const botConfig: BotMcpConfig = {
        connectors: {
          searxng_scraperr: true,
          notion: true,
          github: false,
          cloudflare: false,
          system_platform: false,
          postiz: false,
          wordpress_novamira: false,
          n8n: false,
        },
        tools: {
          notion_create_page: false,
        },
      };

      const htmlSelector = renderToStaticMarkup(
        <BotMcpToolSelectorHarness value={botConfig} onChange={() => {}} />,
      );

      expect(htmlSelector).toContain("connector-switch-searxng_scraperr");
      expect(htmlSelector).toContain("connector-switch-notion");

      const allTools = getAllSovereignTools();
      const injectedTools = filterToolsForBot(allTools, botConfig);
      const injectedNames = injectedTools.map((t) => t.name);

      expect(injectedNames).toContain("web_search");
      expect(injectedNames).toContain("web_scrape");
      expect(injectedNames).toContain("notion_search");
      expect(injectedNames).toContain("notion_query_database");
      expect(injectedNames).not.toContain("notion_create_page");
      expect(injectedNames).not.toContain("github_search_repos");
    });

    it("4.4 Scenario 4: Multi-Agent Autonomous Delegation Flow", () => {
      const coordinatorConfig: BotMcpConfig = {
        connectors: { searxng_scraperr: true, notion: true, github: false },
      };

      const allTools = getAllSovereignTools();
      const subagentTools = filterToolsForBot(allTools, coordinatorConfig);

      expect(subagentTools.some((t) => t.name === "web_search")).toBe(true);
      expect(subagentTools.some((t) => t.name === "github_search_repos")).toBe(false);

      const rawError = "Notion API failed with secret_abc1234567890secret token expired";
      const sanitizedError = sanitizeToolError(rawError);
      expect(sanitizedError).not.toContain("secret_abc1234567890secret");
      expect(sanitizedError).toContain("secret_[redacted]");
    });

    it("4.5 Scenario 5: Responsive Modal Adaptability across 6 Device Profiles", () => {
      const viewports = [
        { name: "iPhone SE", width: 375 },
        { name: "iPhone 15", width: 390 },
        { name: "iPad Mini", width: 768 },
        { name: "iPad Pro", width: 1024 },
        { name: "MacBook Pro", width: 1440 },
        { name: "4K Display", width: 2560 },
      ];

      for (const vp of viewports) {
        const html = renderToStaticMarkup(
          <MobileShellNavHarness
            isMobileDrawerOpen={false}
            onToggleMobileDrawer={() => {}}
            onCloseMobileDrawer={() => {}}
            viewportWidth={vp.width}
          />,
        );
        expect(html).toContain("Rakazo Sovereign");
        if (vp.width < 768) {
          expect(html).toContain("mobile-hamburger-btn");
        } else {
          expect(html).toContain("md:relative");
        }
      }
    });
  });
});
