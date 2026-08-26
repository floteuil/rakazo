# Project: Rakazo Major Iteration — Prompt Compiler, Prefix Caching, Responsive WebUI & Upstream Coexistence

## Architecture
Rakazo is a full-stack, enterprise-grade AI agent platform built as a Turborepo monorepo with 19 packages across `apps/`, `packages/`, and `infra/`.

```
                        ┌──────────────────────────────────────────┐
                        │      apps/web (React 19 / Vite 7 /       │
                        │      Tailwind v4 / @rakazo/chat-ui)      │
                        └────────────────────┬─────────────────────┘
                                             │ oRPC / HTTP
                                             ▼
                        ┌──────────────────────────────────────────┐
                        │          apps/api (Hono / Node)          │
                        └────────────────────┬─────────────────────┘
                                             │
                      ┌──────────────────────┼──────────────────────┐
                      ▼                      ▼                      ▼
             @rakazo/contracts       @rakazo/adapters         @rakazo/db
            (Zod schemas, RPC,      (Pi Runtime, Prompt      (Prisma, Pg,
             Domain, MCP types)      Compiler, Loop Guards)   Repositories)
                      │                      │
                      └──────────────────────┴──────────────────────┐
                                                                    ▼
                                                             OpenRouter API
                                                            (gpt-oss-120b)
```

### Module Boundaries
1. `@rakazo/contracts`: Pure contract/domain layer. Declares Zod schemas, RPC routes, and domain types. No side-effects or heavy runtime dependencies.
2. `@rakazo/adapters`: Execution and integration layer. Implements `PromptCompilerService`, Pi runtime agent execution, loop guards, tool compacting, and OpenRouter client adapters.
3. `apps/web` & `@rakazo/chat-ui`: Presentation layer. `Shell.tsx`, `CreateBotModal`, `BotSettings`, `PromptCompilerModal`, responsive layouts, and safe-area touch ergonomics.
4. `@rakazo/db` & `apps/api`: Persistence and routing layer. Exposes RPC procedures, enforces authentication, and applies defensive HTTP security headers.
5. `packages/testkit`: Unified test harness for integration and E2E testing.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1.1 | Prompt Compiler Schemas | Zod validation schemas for prompt compile input/output, levels (1 & 2), and cache telemetry in `@rakazo/contracts` | M1 | ORIGINAL_REQUEST §R1 |
| F1.2 | PromptCompilerService Level 1 & Level 2 | Service in `@rakazo/adapters` transforming messy draft into structured prompt for `gpt-oss-120b` (Level 1 deterministic rule-based, Level 2 OpenRouter LLM) | M1 | ORIGINAL_REQUEST §R1 |
| F1.3 | MCP Immutability Invariant | Guarantee Prompt Compiler never touches, enables, or modifies `bot.metadata.mcp` configuration | M1 | ORIGINAL_REQUEST §R1 |
| F1.4 | RPC Route `prompts.compile` | Exposing prompt compilation endpoint via oRPC in `@rakazo/contracts` and `apps/api` | M1 | ORIGINAL_REQUEST §R1 |
| F2.1 | 4-Block Cache-Friendly System Prompt | Refactoring prompt assembly in `@rakazo/adapters` (Bloc A: stable guards -> Bloc B: bot config -> Bloc C: compact history -> Bloc D: ephemeral turn) | M2 | ORIGINAL_REQUEST §R2 |
| F2.2 | Prefix Caching Telemetry & Sticky Routing | Extracting `cached_tokens`, `cacheHitRatio` in `pi-runtime.ts` and `executor.ts` with session affinity routing | M2 | ORIGINAL_REQUEST §R2 |
| F2.3 | Guardrails & Compacting Preservation | Preserving and validating `loop-guards.ts` (redundant calls, iteration limits) and `tool-compacting.ts` | M2 | ORIGINAL_REQUEST §R2 |
| F3.1 | "Rendre professionnelles" Action Button | Adding action trigger in `CreateBotModal` and `BotSettings` in `apps/web/src/pages/Shell.tsx` | M3 | ORIGINAL_REQUEST §R1, R3 |
| F3.2 | Editable Diff & Preview Modal | `PromptCompilerModal.tsx` providing live diff, editable output, loading state, error alerts, and double-submission protection | M3 | ORIGINAL_REQUEST §R1, R3 |
| F3.3 | Draft Preservation & Rollback Buffer | Preserving initial user draft upon cancellation or network failure with 0 data loss | M3 | ORIGINAL_REQUEST §R1 |
| F3.4 | Multi-Device Responsive Ergonomics | Mobile (<768px: `max-w-[98%]`, composer `min-w-0 shrink-0`, safe-area insets, virtual keyboard), Tablet (768-1024px: drawer/modal fluid layouts), Desktop (>=1024px: 3-tab MCP inspector) | M3 | ORIGINAL_REQUEST §R3 |
| F4.1 | Additive Upstream Architecture | Ensuring all new files and services are isolated to prevent git merge conflicts with `elie222/rakazo` | M4 | ORIGINAL_REQUEST §R4 |
| F4.2 | Upstream Compatibility & Customization Map | Creating comprehensive `UPSTREAM COMPATIBILITY & CUSTOMIZATION MAP` detailing all additive touchpoints | M4 | ORIGINAL_REQUEST §R4 |
| F5.1 | Security & Zero-Secret Policy | Enforcing unified `sanitizeToolError`, defensive HTTP headers in `apps/api`, and anti-SSRF protections | M5 | ORIGINAL_REQUEST §R5 |
| F5.2 | Monorepo Quality Baseline | 0 TypeScript errors on `pnpm check` across all 19 packages and 100% test pass rate | M5 | ORIGINAL_REQUEST §R5 |
| F5.3 | Master Closing Artifacts | Authoring `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` and `ITERATION_REPORT.md` | M5 | ORIGINAL_REQUEST §R5 |
| F6.1 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test suite validating all features across 4 tiers | Final Milestone | ORIGINAL_REQUEST §Acceptance Criteria |
| F6.2 | Adversarial Hardening (Tier 5) | White-box stress testing, boundary fuzzing, and coverage audit | Final Milestone | ORIGINAL_REQUEST §Acceptance Criteria |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Prompt Compiler Engine & 2-Level Compilation | F1.1, F1.2, F1.3, F1.4 (`@rakazo/contracts`, `@rakazo/adapters`, `apps/api`) | none | DONE |
| M2 | Context Optimization, Prefix Caching & Telemetry | F2.1, F2.2, F2.3 (`@rakazo/adapters`, runtime prompt layout, telemetry) | M1 | IN_PROGRESS |
| M3 | Responsive WebUI & Prompt Compiler Action | F3.1, F3.2, F3.3, F3.4 (`apps/web`, `PromptCompilerModal`, responsive design) | M1, M2 | PLANNED |
| M4 | Additive Upstream Compatibility & Customization Map | F4.1, F4.2 (Upstream verification, isolation map artifact) | M1, M2, M3 | PLANNED |
| M5 | Security, 100% Tests, 0 TS Errors & Master Blueprint | F5.1, F5.2, F5.3 (Security audit, `pnpm check`, `pnpm test`, Master Blueprint, Iteration Report) | M1, M2, M3, M4 | PLANNED |
| M_E2E | E2E Testing Track | F6.1, F6.2 (`packages/testkit`, 150 tests across Tiers 1-4) | M1 | DONE (TEST_READY.md) |

---

## Interface Contracts

### `@rakazo/contracts` ↔ `@rakazo/adapters` & `apps/api`
```typescript
// Prompt Compilation Types
export type PromptCompilationLevel = "level1_deterministic" | "level2_llm";

export interface PromptCompileInput {
  rawInstruction: string;
  botName?: string;
  botTitle?: string;
  level?: PromptCompilationLevel;
  existingMetadata?: Record<string, unknown>; // READ-ONLY context, MCP fields are ignored
}

export interface PromptCompileOutput {
  compiledInstruction: string;
  levelUsed: PromptCompilationLevel;
  explanation?: string;
  telemetry?: {
    cachedTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    durationMs?: number;
    cacheHitRatio?: number;
  };
}
```

### `@rakazo/adapters` ↔ OpenRouter (`gpt-oss-120b`)
- Prompt structure formatted with strict system role separation, zero-chatter directive, role tags, and thought token preservation.
- Prefix caching layout:
  * **Bloc A (Static, Token 0)**: Invariant platform guardrails, parsimony rules, loop protection limits.
  * **Bloc B (Semi-Static)**: Bot persona, durable instructions, skill definitions.
  * **Bloc C (Dynamic History)**: Compacted prior message turns and compacted tool results.
  * **Bloc D (Ephemeral)**: Current user turn, attached files, execution ephemeral context.

### `apps/web` ↔ `apps/api`
- oRPC route: `prompts.compile` (with client-side fallback if offline).
- Invariant: `mcpConfig` state in `Shell.tsx` is completely decoupled and never sent to or returned by the prompt compiler.

---

## Code Layout
- `packages/contracts/src/prompt-compiler.ts`: Contracts & Zod schemas for prompt compilation and cache telemetry.
- `packages/contracts/src/rpc.ts`: oRPC contract registration for `prompts`.
- `packages/adapters/src/prompt-compiler.ts`: `PromptCompilerService` implementation (Level 1 deterministic + Level 2 `gpt-oss-120b` via OpenRouter) with `sanitizeToolError` credential masking.
- `packages/adapters/src/executor.ts`: 4-block cache-friendly system prompt assembly.
- `packages/adapters/src/pi-runtime.ts`: Telemetry extraction for cached tokens and session affinity routing.
- `packages/adapters/src/tool-compacting.ts`: Semantic tool response compaction with exception-safe fallback.
- `apps/web/src/pages/PromptCompilerModal.tsx`: Additive UI component for diff preview, editing, and rollback.
- `apps/web/src/pages/Shell.tsx`: Non-invasive injection points for "Rendre professionnelles" button in `CreateBotModal` and `BotSettings`.
- `apps/web/src/styles.css` / Tailwind: Multi-device responsive styling rules.
- `UPSTREAM COMPATIBILITY & CUSTOMIZATION MAP.md`: Upstream isolation inventory.
- `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`: Master architecture blueprint.
- `ITERATION_REPORT.md`: Closing iteration report.
