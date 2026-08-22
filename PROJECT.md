# Project: Rakazo Token Efficiency, AI Guardrails & Calibration Engine

## Architecture
Rakazo operates an autonomous multi-agent platform using a modular monorepo architecture (`pnpm` + Turborepo + TypeScript).
- **Core Engine & Adapters (`packages/adapters`)**:
  - `pi-runtime.ts`: Agent loop orchestrator wrapping `@earendil-works/pi-agent-core` with tool execution, streaming events, and subagents.
  - `executor.ts`: Worker task runner handling database persistence, secret gathering, tool dispatch, and prompt assembly.
  - `enterprise-tools.ts`: Sovereign connectors (SearXNG, GitHub, Notion, Postiz, WordPress/Novamira, n8n, Cloudflare) and error sanitizer (`sanitizeToolError`).
  - `child-bots.ts`: Agent lifecycle, spawning, archiving, and physical/database destruction (`destroyBot`).
  - `tool-compacting.ts`: Semantic tool output compactor for files, shell, GitHub, Notion, and Cloudflare.
  - `loop-guards.ts`: 25-step circuit breaker and 3-consecutive redundant tool call detector.
  - `home.ts`, `artifacts.ts`, `desktop-sandbox.ts`: Local filesystem storage on `/data`.
- **Contracts & Types (`packages/contracts`)**:
  - `mcp-catalog.ts`: Registry of 40 sovereign tools across 7 connectors, permissions, and tool schemas.
- **Database & Persistence (`packages/db`)**:
  - Prisma ORM managing 15 cascaded relational tables linked to `Bot`.
- **User Interface (`apps/web`, `apps/mobile`, `apps/desktop`)**:
  - Mobile-first WebUI, Desktop Electron, Expo Mobile apps with real-time streaming chat, tool overlays, and skills management.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Rakazo Agent Engine                                  │
│                                                                                         │
│   ┌────────────────────────┐    ┌──────────────────────────────────────────────────┐   │
│   │   System Instructions  │    │            LLM Runtime (PiAgentRuntime)          │   │
│   │   (executor.ts)        │    │            (packages/adapters/src/pi-runtime.ts) │   │
│   │                        │    │                                                  │   │
│   │ + Tool Parsimony Rule  │    │ + maxTokens: 16,384 (Elevated Output Ceiling)    │   │
│   │ + Anti-Speculation     │    │ + thinkingLevel: "low" (Economic CoT Budget)     │   │
│   │ + Full Code Directive  │    │ + compactToolResult() (Semantic Data Reducer)    │   │
│   └───────────┬────────────┘    └────────────────────────┬─────────────────────────┘   │
│               │                                          │                             │
│               ▼                                          ▼                             │
│   ┌────────────────────────┐    ┌──────────────────────────────────────────────────┐   │
│   │  Model Context Buffer  │◄───┤    Loop Guards & Circuit Breaker Interceptors    │   │
│   │  (Optimized History)   │    │    - Step Cap: max 25 tool iterations / turn     │   │
│   └────────────────────────┘    │    - Redundant Detector: max 3 consecutive same  │   │
│                                 │    - Subagent Depth: max depth 1                 │   │
│                                 │    - Unified sanitizeToolError()                 │   │
│                                 └────────────────────────┬─────────────────────────┘   │
│                                                          │                             │
│                                                          ▼                             │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │            Physical Storage & Cascade Cleanup Engine (child-bots.ts)           │   │
│   │            - Unconditional purge of /data/homes/<botId>                        │   │
│   │            - Unconditional purge of /data/home-revisions/<botId>.txt           │   │
│   │            - Purge of /data/desktop-computers/<botId>                          │   │
│   │            - 15 relational tables cascaded via Prisma / PostgreSQL             │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
Every feature from the Survey phase and `ORIGINAL_REQUEST.md` is assigned to a milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | High Output Token Budget | Configure `maxTokens` (16,384) in `pi-runtime.ts` for root and subagents to prevent truncation of full code files | M1 | ORIGINAL_REQUEST §R1 (DONE) |
| 2 | System Prompt Tool Parsimony | Inject strict tool targeting, anti-speculation, and code completeness directives in `executor.ts` | M1 | ORIGINAL_REQUEST §R1 (DONE) |
| 3 | Tool Response Semantic Compacting | Implement `compactToolResult` to compress large file lists, shell logs, GitHub, Notion, and Cloudflare payloads | M1 | ORIGINAL_REQUEST §R1 (DONE) |
| 4 | Iteration Circuit Breaker | Limit tool execution steps per user turn to max 25 iterations with clean synthesis warning | M2 | ORIGINAL_REQUEST §R2 (DONE) |
| 5 | Redundant Tool Call Detection | Detect 3 consecutive identical tool calls (`toolName` + canonical args hash) and intercept execution | M2 | ORIGINAL_REQUEST §R2 (DONE) |
| 6 | Subagent Depth Safeguard | Verify and reinforce subagent depth limit (max depth 1) preventing recursive loops | M2 | ORIGINAL_REQUEST §R2 (DONE) |
| 7 | Unified Error & Secret Sanitization | Unify `sanitizeToolError` across `pi-runtime.ts`, `executor.ts`, and all tool error pipelines | M2 | ORIGINAL_REQUEST §R4 (DONE) |
| 8 | Unconditional Physical Storage Cleanup | Purge `/data/homes/<botId>`, `/data/home-revisions/<botId>.txt`, and `/data/desktop-computers/<botId>` in `destroyBot` | M3 | ORIGINAL_REQUEST §R3 (DONE) |
| 9 | Monorepo Test Alignment & Fixes | Align assertions in `PluginsOverlay.test.tsx` and `BotMcpToolSelector.test.tsx` with sovereign tool catalog | M3 | ORIGINAL_REQUEST §R5 (DONE) |
| 10 | Comprehensive Test Suite & Monorepo Validation | Verify 100% test pass rate on `pnpm test` and 0 TypeScript errors on `pnpm check` | M4 | ORIGINAL_REQUEST §R5 (DONE) |
| 11 | Adversarial Hardening (Tier 5) | Adversarial stress testing for loop breaking, memory leaks, secret exposure, and token limits | M4 | Project Pattern (DONE) |

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | LLM Runtime Calibration & Tool Response Semantic Compacting | Elevated `maxTokens` (16,384), economic reasoning budget, system prompt tool parsimony directives, and semantic tool compacting (`compactToolResult`). | None | DONE |
| M2 | AI Guardrails, Circuit Breaker & Unified Secret Sanitization | Loop guards module (`loop-guards.ts`), 25-step circuit breaker, consecutive redundant call detector, subagent depth 1 verification, and full `sanitizeToolError` propagation. | M1 | DONE |
| M3 | Zero-Bloat Storage Auto-Cleanup & Monorepo Test Alignment | Unconditional physical cleanup in `destroyBot` (`/data/homes`, revisions, desktop workspaces), Prisma cascades audit, and sovereign tools test fixes. | M2 | DONE |
| M4 | Final Milestone: 100% E2E Test Suite Pass & Adversarial Hardening | Verification of all test tiers (Tiers 1-4) published by E2E Testing Track, followed by Phase 2 adversarial stress-testing (Tier 5). | M3, TEST_READY | DONE |

## Interface Contracts

### `packages/adapters/src/tool-compacting.ts`
- `export function compactToolResult(toolName: string, result: unknown): string`
  - Compresses `list_files` (> 40 entries -> summary + sample), `shell` (> 4,000 chars -> head/tail window with marker), `github_search_repos`, `github_list_issues`, `notion_search`, `notion_query_database`, `cloudflare_list_dns_records`.
  - Fallback: Removes nulls/empty objects, preserves valid JSON formatting up to 12,000 characters, safe against throwing `toString` / `toJSON`.

### `packages/adapters/src/loop-guards.ts`
- `export const MAX_TOOL_ITERATIONS_PER_TURN = 25;`
- `export const MAX_CONSECUTIVE_REDUNDANT_CALLS = 3;`
- `export interface ToolCallTracker { stepCount: number; lastCallSignature: string | null; consecutiveSameCallCount: number; }`
- `export function createToolCallTracker(): ToolCallTracker;`
- `export function computeToolCallSignature(name: string, args: unknown): string;`
- `export function evaluateToolCallGuard(tracker: ToolCallTracker, name: string, args: unknown): { allow: true } | { allow: false; reason: string; terminate: boolean };`

### `packages/adapters/src/enterprise-tools.ts`
- `export function sanitizeToolError(message: string): string`
  - Masks tokens for GitHub, Notion, Postiz, Novamira, n8n, Cloudflare, OpenRouter, Anthropic, OpenAI, PostgreSQL URLs, Bearer and Basic headers.

### `packages/adapters/src/child-bots.ts`
- `destroyBot(deps, bot, options)`:
  - Purges Prisma database records with cascade.
  - Purges physical directories on disk under `/data/homes/<botId>`, `/data/home-revisions/<botId>.txt`, `/data/desktop-computers/<botId>`, `/data/artifacts/...`.

## Code Layout
- `packages/adapters/src/pi-runtime.ts` — Agent runtime, elevated `maxTokens`, tool dispatch, subagent host.
- `packages/adapters/src/tool-compacting.ts` — Semantic tool output compacting implementation.
- `packages/adapters/src/loop-guards.ts` — Circuit breaker and redundancy detector logic.
- `packages/adapters/src/executor.ts` — System prompt builder, tool dispatch error sanitization.
- `packages/adapters/src/enterprise-tools.ts` — Sovereign MCP tools, comprehensive regex token sanitizer.
- `packages/adapters/src/child-bots.ts` — Physical file and database destruction routines.
- `packages/adapters/src/home.ts` — Local agent home directory management.
- `apps/web/src/pages/PluginsOverlay.test.tsx` — Test file for sovereign tools overlay.
- `apps/web/src/pages/BotMcpToolSelector.test.tsx` — Test file for bot MCP tool selection.
- `packages/adapters/src/__tests__/` — Test suites created by E2E Testing Track.
