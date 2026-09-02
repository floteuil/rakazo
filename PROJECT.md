# Project: RAKAZO — UI/UX Excellence & Robustness Integration

## Architecture
RAKAZO is an enterprise-grade AI Agent monorepo (19 packages/apps managed by Turborepo 2 + pnpm 9 workspaces) with strict TypeScript 5.8, React 18, Tailwind CSS v4, Fastify/Hono API, Prisma 7 / PostgreSQL, and standalone Coolify PaaS OmniRoute gateway integration.

### Core Architecture Flow
```
User Interface (React 18 / Tailwind v4 / @rakazo/chat-ui)
         │
         ▼  (SSE Streaming & oRPC / TypeBox Schemas)
Backend & Core (apps/api, @rakazo/core, @rakazo/contracts)
         │
         ├── Policy & Invariants Engine (@rakazo/adapters: free-policy-engine, loop-guards, subagent-inheritance)
         │
         ├── Runtime Execution (@rakazo/adapters: CanonicalAgentRuntime, pi-runtime)
         │         │
         │         ├── OpenRouter Premium (`openai/gpt-oss-120b`) [Commercial Tier]
         │         └── OmniRoute Sovereign Gateway (Coolify App 21, 3-tier combo routing) [Free Tier]
         │
         └── Database & SQL Telemetry (@rakazo/db: Prisma 7, PostgreSQL, PromptExecutionLog)
```

## Feature Inventory
Every requirement from the Survey phase is mapped to a specific milestone. No feature is unassigned.

| # | Feature | Description | Milestone | Status |
|---|---|---|---|---|
| 1 | MCP Complex Schema & TypeBox Enum Normalization | Robust parsing of dynamic MCP schemas, unions, `anyOf`/`oneOf`, nullable types, single-value enums, null literals in `pi-runtime.ts` (PR #450) | M1 | DONE |
| 2 | SSE UTF-16 Surrogate Pair Sanitization | Prevent multi-byte Unicode / Emoji (`🚀`, `🤖`, `🎉`) slicing across chunk boundaries and secret redaction buffers in `events.ts` (PR #424) | M1 | DONE |
| 3 | Resolved Run Error Banner Cleanup | Reduction of terminal run events (`run.failed`, `run.cancelled`, `run.completed`) in `thread-events.ts` and clearing transient error banners upon retry/reload in `Shell.tsx` (PR #449, #447) | M1 | DONE |
| 4 | Unified Red Error Tokens | Centralization of error palette (`--rk-error`, `--rk-error-surface`, `--destructive`, `rose-500`) across `@rakazo/ui-tokens` & `@rakazo/ui-web` (PR #428, #432, #462) | M2 | DONE |
| 5 | 9-Breakpoint Responsive Layout & Touch Ergonomics | Strict $\ge 44$px touch targets, safe area insets, mobile drawers, responsive max-widths across 320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px+ | M2 | DONE |
| 6 | Collapsible MCP Tool Activity Accordion | Foldable activity log component `ToolActivityAccordion.tsx` with single-click toggle and sanitized argument/output preview (PR #440) | M3 | DONE |
| 7 | Interactive Suggestion Choice Chips | Interactive `ChoiceChipsCard.tsx` rendering letter badges and click-to-dispatch options from `kind: "choice"` blocks (PR #433) | M3 | DONE |
| 8 | Hover Timestamps & Compute Duration Badge | Message bubble hover timestamp overlay and calculation of thought/compute duration (`TimestampBadge.tsx`) (PR #397, #461) | M3 | DONE |
| 9 | Message Reactions & Copy Actions | Floating action bar `MessageActionBar.tsx` with thumbs up/down reaction state and quick clipboard copy (PR #428, #432, #462) | M3 | DONE |
| 10 | `@mention` Popover & Keyboard Navigation | Keyboard-driven bot/subagent mention menu `MentionPopover.tsx` with `ArrowUp`, `ArrowDown`, `Enter`, `Tab`, `Escape` navigation | M3 | DONE |
| 11 | Shell.tsx Master Integration | Flawless integration of all UI/UX components and event listeners in `apps/web/src/pages/Shell.tsx` | M4 | DONE |
| 12 | Invariant Sanctuary Verification | Formal validation of all 10 core invariants (OpenRouter gpt-oss-120b, OmniRoute 3-tier, Bot DB persistence, $0.00 zero-cost, SQL telemetry, MCP isToolPermitted, semantic compact, 25 loop circuit breaker, free subagent depth 1, 4-block cache & FNV-1a) | M4 | DONE |
| 13 | Monorepo Zero-Regression Certification | 0 TypeScript errors across all 19 packages via `turbo check --force`, 100% test pass rate across Vitest suites | M5 | DONE |
| 14 | Master Documentation Sync | Update `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `AGENTS.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/OMNIROUTE_DEPLOYMENT.md` | M5 | DONE |
| 15 | Master Architect Handoff Publication | Publish comprehensive final handoff report `RAKAZO_ARCHITECT_HANDOFF_UI_EXCELLENCE_AND_ROBUSTNESS.md` | M5 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Robustness Hotfixes | Features 1, 2, 3: MCP TypeBox schema compilation, SSE UTF-16 surrogate sanitization, terminal run snapshot reduction | none | DONE |
| M2 | Design Tokens & Responsive Ergonomics | Features 4, 5: Unified red error tokens, 9-breakpoint responsive CSS & touch targets | none | DONE |
| M3 | Interactive UI/UX Components | Features 6, 7, 8, 9, 10: Tool accordion, choice chips, hover timestamps, message reactions, mention popover | M2 | DONE |
| M4 | Shell.tsx Integration & Invariants Check | Features 11, 12: Integrated chat transcript, event subscriptions, invariant verification | M1, M3 | DONE |
| M5 | Test Certification, Docs Sync & Master Handoff | Features 13, 14, 15: Full test battery, master docs synchronization, handoff report | M4 | DONE |

## Interface Contracts
### `ToolActivityAccordion` (`apps/web/src/components/chat/ToolActivityAccordion.tsx`)
- Props: `{ toolName: string; status: "running" | "completed" | "failed"; args?: Record<string, unknown> | string; result?: string; durationMs?: number; defaultExpanded?: boolean; }`

### `ChoiceChipsCard` (`apps/web/src/components/chat/ChoiceChipsCard.tsx`)
- Props: `{ block: { kind: "choice"; question: string; subtitle?: string; options: Array<{ id: string; letter: string; label: string }>; }; onSelectOption: (option: { id: string; letter: string; label: string }) => void; disabled?: boolean; }`

### `TimestampBadge` (`apps/web/src/components/chat/TimestampBadge.tsx`)
- Props: `{ createdAt: string; resolvedModel?: string; resolvedProvider?: string; isFree?: boolean; durationMs?: number; latencyMs?: number; }`

### `MessageActionBar` (`apps/web/src/components/chat/MessageActionBar.tsx`)
- Props: `{ text: string; messageId: string; onReact?: (messageId: string, reaction: "up" | "down" | null) => void; }`

### `MentionPopover` (`apps/web/src/components/chat/MentionPopover.tsx`)
- Props: `{ query: string; bots: Bot[]; selectedIndex: number; onSelectBot: (bot: Bot) => void; onClose: () => void; }`

## Code Layout
- `packages/adapters/src/pi-runtime.ts` — MCP schema compilation & TypeBox enum resolution
- `packages/core/src/events.ts` — SSE streaming chunking & UTF-16 surrogate sanitizer
- `apps/web/src/lib/thread-events.ts` — Snapshot event filtering and terminal run reduction
- `packages/ui-tokens/src/tokens.css`, `packages/ui-tokens/src/index.ts` — Unified red error design tokens
- `apps/web/src/components/chat/*` — New dedicated UI/UX chat components
- `apps/web/src/pages/Shell.tsx` — Main chat shell integration
- `apps/web/src/tests/*`, `packages/testkit/*` — E2E and unit test suites
- `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `AGENTS.md`, `docs/*` — Master documentation
- `RAKAZO_ARCHITECT_HANDOFF_UI_EXCELLENCE_AND_ROBUSTNESS.md` — Authoritative master handoff artifact
