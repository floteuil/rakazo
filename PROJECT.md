# Project: Rakazo WebUI Mobile-First & Sovereign Enterprise MCP Connectors

## Architecture
- **Monorepo Structure**: 18 packages/apps managed with Turborepo and Vitest:
  - `apps/web`: React 19 + Tailwind CSS + Lucide Icons Web application.
  - `apps/api`: Fastify + oRPC backend API.
  - `packages/contracts`: Zod schemas, oRPC contracts, and MCP catalog definitions (`@rakazo/contracts`).
  - `packages/db`: Prisma ORM client and repository layer (`@rakazo/db`).
  - `packages/adapters`: Pi AI runtime, tool definitions, executor, and security sanitizers (`@rakazo/adapters`).
  - `packages/adapter-kit`, `packages/core`, `packages/ui-tokens`, `packages/ui-web`, `packages/testkit`.
- **Data Flow & Lifecycle**:
  - WebUI (`CreateBotForm` / `BotSettings`) -> oRPC API (`bots.create` / `bots.update`) -> DB (`prisma.bot` with `metadata.mcp`) -> `executor.ts` dynamically filters permitted tools -> `pi-runtime.ts` instantiates agent with strict least-privilege toolset -> `executeEnterpriseTool` executes with `sanitizeToolError`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Mobile Drawer Navigation | Mobile sidebar off-canvas drawer with backdrop, swipe/tap close, fixed on desktop (`md:relative`) | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Mobile Header & Hamburger | Compact mobile header with active agent info, status, and hamburger menu toggle | M1 | ORIGINAL_REQUEST §R1 |
| 3 | iOS Safari Auto-Zoom Prevention | Input font-size >= 16px (`text-[16px] sm:text-[15.5px]`) to stop iOS zoom on focus | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Mobile Touch Ergonomics | Touch targets >= 40-44px on all buttons and action bars | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Safe-Area Inset Handling | Bottom composer respects `env(safe-area-inset-bottom)` and `viewport-fit=cover` | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Adaptive Overlays & Modals | All modals (Skills, Models, Voice, Plugins, Bot forms, Auth, Onboarding) adapt to full-screen / bottom-sheet on mobile | M1 | ORIGINAL_REQUEST §R1 |
| 7 | Desktop High-Fidelity UI | Desktop layout retains 100% of rich 316px docked sidebar, 1080px rounded floating dialogs | M1 | ORIGINAL_REQUEST §R1 |
| 8 | Sovereign MCP Catalog Matrix | Shared catalog defining 8 Sovereign Connectors (40 tools) with metadata, categories, endpoints | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Plugins & Integrations Showcase | Redesigned `PluginsOverlay.tsx` with Sovereign MCP showcase, category tabs, and status badges | M2 | ORIGINAL_REQUEST §R2 |
| 10 | MCP Connector Detail Inspector | Inspector panel/drawer with Overview, Available Tools table, and Security/Secrets status | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Hybrid Agent Tool Selector UI | `<BotMcpToolSelector />` with global 1-click connector toggle + per-tool accordion checkboxes | M3 | ORIGINAL_REQUEST §R3 |
| 12 | Per-Agent Tool Permissions DB Persistence | Store enabled connectors/tools in Bot `metadata.mcp` schema and repository layers | M3 | ORIGINAL_REQUEST §R3 |
| 13 | Dynamic Runtime Tool Filtering | `executor.ts` & `pi-runtime.ts` dynamically filter injected tools according to bot permissions | M4 | ORIGINAL_REQUEST §R3 |
| 14 | Subagent Permission Inheritance | Subagents spawned via `run_subagent` inherit parent bot's restricted toolset | M4 | ORIGINAL_REQUEST §R3 |
| 15 | Multi-Layer Security Sanitization | `sanitizeToolError`, secret scrubbing (GitHub PATs, Notion tokens, etc.), and zero secrets in Git | M4 | ORIGINAL_REQUEST §R4 |
| 16 | Monorepo CI/CD Validation | 0 TypeScript errors (`pnpm check`), 100% test pass rate (`pnpm test`), and clean `pnpm build` | M5 | ORIGINAL_REQUEST §R5 |
| 17 | Adversarial Coverage Hardening | White-box adversarial testing (Tier 5) hardening edge cases and security boundaries | M5 | ORIGINAL_REQUEST §R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | WebUI Mobile-First & Adaptive Overlays | `Shell.tsx`, `SkillLibraryOverlay`, `ModelSettingsOverlay`, `VoiceSettingsOverlay`, `Onboarding`, `Auth`, `index.html` | none | DONE |
| M2 | Sovereign Enterprise MCP Connectors Manager | `packages/contracts/src/mcp-catalog.ts`, `apps/web/src/pages/PluginsOverlay.tsx` | none | DONE |
| M3 | Hybrid MCP Agent Assignment & DB Persistence | `packages/contracts/src/domain.ts`, `packages/db`, `apps/api`, `BotMcpToolSelector.tsx`, `CreateBotForm`, `BotSettings` | M2 | DONE |
| M4 | Dynamic Runtime Tool Filtering & Security | `packages/adapters/src/executor.ts`, `packages/adapters/src/pi-runtime.ts`, `packages/adapters/src/enterprise-tools.ts` | M3 | DONE |
| M5 | 100% E2E Pass & Adversarial Coverage Hardening | Full monorepo test pass (Tiers 1-4) + Tier 5 Adversarial Coverage Hardening | M1, M2, M3, M4 | DONE |

## Interface Contracts

### Shared MCP Catalog (`@rakazo/contracts` -> `apps/web`, `apps/api`, `packages/adapters`)
```typescript
export interface McpToolDefinition {
  name: string;
  label: string;
  description: string;
  category: string;
  isSensitive?: boolean;
  requiredParams: string[];
}

export interface SovereignMcpConnector {
  id: string;
  slug: string;
  name: string;
  category: "search" | "code" | "workspace" | "social" | "cms" | "automation" | "infra" | "system";
  categoryLabel: string;
  description: string;
  icon: string;
  endpoint: string;
  status: "connected" | "operational" | "disconnected";
  badgeText: string;
  tools: McpToolDefinition[];
}

export const SOVEREIGN_MCP_CONNECTORS: SovereignMcpConnector[];
```

### Bot Metadata Schema (`@rakazo/contracts` & `@rakazo/db`)
```typescript
export interface BotMcpConfig {
  connectors?: Record<string, boolean>; // connectorId -> boolean
  tools?: Record<string, boolean>;      // toolName -> boolean (override)
}

export interface BotMetadata {
  mcp?: BotMcpConfig;
  [key: string]: unknown;
}
```

### Runtime Dynamic Tool Filtering Contract (`packages/adapters`)
```typescript
export function filterToolsForBot(
  allTools: ConnectorTool[],
  mcpConfig?: BotMcpConfig | null,
  isGraphical?: boolean
): ConnectorTool[];
```

## Code Layout
- `apps/web/src/pages/Shell.tsx` — Mobile drawer, compact header, chat layout, `CreateBotForm`, `BotSettings`
- `apps/web/src/pages/PluginsOverlay.tsx` — Sovereign Enterprise MCP Manager UI & Detail Inspector
- `apps/web/src/pages/BotMcpToolSelector.tsx` — Reusable hybrid MCP selector (switches + accordions)
- `apps/web/src/pages/SkillLibraryOverlay.tsx` — Adaptive responsive modal
- `apps/web/src/pages/ModelSettingsOverlay.tsx` — Adaptive responsive modal
- `apps/web/src/pages/VoiceSettingsOverlay.tsx` — Adaptive responsive modal
- `apps/web/src/pages/Onboarding.tsx` & `Auth.tsx` — Mobile responsive containers
- `packages/contracts/src/mcp-catalog.ts` — Sovereign Enterprise MCP Connectors definition matrix
- `packages/contracts/src/domain.ts` — Zod schemas with metadata support
- `packages/db/prisma/schema.prisma` & `packages/db/src/repos.ts` — Bot model metadata persistence
- `packages/adapters/src/enterprise-tools.ts` — Enterprise tools execution and `sanitizeToolError`
- `packages/adapters/src/executor.ts` — Dynamic per-agent tool filtering and effect logging
- `packages/adapters/src/pi-runtime.ts` — Agent execution pipeline and subagent inheritance
