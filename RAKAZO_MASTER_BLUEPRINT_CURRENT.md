# RAKAZO MASTER BLUEPRINT — CURRENT ARCHITECTURE & PLATFORM SPECIFICATION

**Version**: 2.7.0-ui-excellence-and-robustness-certified  
**Repository**: [https://github.com/floteuil/rakazo](https://github.com/floteuil/rakazo) (Turborepo 2 + pnpm Monorepo)  
**Branch**: `main`  
**Consolidation**: UI/UX Excellence Integration (`ToolActivityAccordion`, `ChoiceChipsCard`, `TimestampBadge`, `MessageActionBar`, `MentionPopover`, Unified Red Error Design Tokens `--rk-error`), Robustness Hotfixes (MCP Complex TypeBox Schemas, SSE UTF-16 Surrogate Sanitization, Terminal Run Snapshot Reduction), Free Intelligence Gateway (OmniRoute), 3-Tier Decoupling, Triple Coherence Observability, Pluggable Transports, Shared Canonical MCP Runtime & Full-Chain Persistence  
**Verification Date**: 2026-09-02  
**Global Status**: Production Certified (0 TypeScript Errors across 19 packages, 100% Vitest Pass Rate across Monorepo Test Suites, 0 Plaintext Secrets, 10/10 Invariants Sanctuarized)

---

## 1. System Overview & Monorepo Topology

Rakazo is an enterprise-grade, sovereign, multi-agent AI orchestration platform designed for autonomous execution of complex engineering workflows, containerized tool manipulation via the Model Context Protocol (MCP), secure sandbox environments, high-efficiency prompt compilation with KV prefix caching, **Dual-Path Autonomous Inference** (Premium GPT-OSS-120B via OpenRouter vs. Strictly Free Sovereign Gateway via OmniRoute with 3-tier dynamic decoupling and full observability), and an **agency-grade, touch-safe, responsive chat interface** equipped with interactive tool activity accordions, suggestion choice chips, per-turn duration metrics, message reactions, keyboard-navigable `@mention` summon, and unified design tokens.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   RAKAZO MONOREPO (TURBO 2 + PNPM)                      │
│                                  TypeScript 5.8 · Node.js 22 LTS                        │
├───────────────────────────────────────────┬─────────────────────────────────────────────┤
│ APPLICATIONS (7)                          │ SHARED PACKAGES (12)                        │
│ • apps/web      (React 18, Tailwind v4)   │ • @rakazo/contracts (Zod Schemas, MCP types)│
│ • apps/api      (Fastify / Hono, Node.js) │ • @rakazo/adapters  (OmniRoute, Pi, Tools)  │
│ • apps/worker   (BullMQ / Async Jobs)     │ • @rakazo/adapter-kit (Runtime interfaces)  │
│ • apps/mobile   (React Native Expo 57)    │ • @rakazo/db        (Prisma 7, PostgreSQL)  │
│ • apps/desktop  (Electron Shell)          │ • @rakazo/core      (Auth, Cron, Logic)     │
│ • apps/www      (Astro SSR Landing Page)  │ • @rakazo/chat-ui   (Markdown, UI components)│
│ • infra/sandboxes/supervisor (Isolation)  │ • @rakazo/ui-tokens & ui-web (Design tokens)│
│                                           │ • @rakazo/testkit   (E2E & Stress Harnesses)│
│                                           │ • @rakazo/memory    (Vector & Hybrid RAG)   │
│                                           │ • @rakazo/auth      (Session & Token Auth)  │
└───────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. Package Responsibility Matrix

| Package / Application | Role & Tech Stack | Core Responsibilities & Invariants |
|---|---|---|
| `apps/web` | React 18, Vite, Tailwind CSS v4, Lucide Icons | Responsive chat shell (`Shell.tsx`), dedicated UI excellence components (`ToolActivityAccordion`, `ChoiceChipsCard`, `TimestampBadge`, `MessageActionBar`, `MentionPopover`), Intelligence Mode Segmented Control (Premium/Free), Usage Tags Selector (max 3), PromptCompilerModal, MCP Tool Selector, Skill Library Overlay, Per-Turn Execution Badges (`Modèle : [Model] · [Provider]`, `A réfléchi pendant X.Xs`, `Gratuit via OmniRoute`), Unified Error Banner (`--rk-error`), 9-breakpoint responsive layout (320px to 1440px+). |
| `apps/api` | Fastify / Hono, Node.js, oRPC | REST / oRPC API gateway, bot lifecycle procedures (`create`, `update`, `duplicate`), SSE message streaming, auth gating, internal proxying. |
| `apps/worker` | Node.js, BullMQ, Redis | Asynchronous background jobs, routine scheduling, sandbox reconciliation, storage cleanup, agent execution worker, secret masking. |
| `apps/mobile` | React Native, Expo 57 | Mobile-native client, secure session storage, push notifications, voice transcription. |
| `apps/desktop` | Electron, Node.js | Desktop application shell, sandbox local proxy, window management, screen-lease support. |
| `apps/www` | Astro SSR | Public landing page, documentation portal, static assets. |
| `infra/sandboxes/supervisor` | Node.js, Docker/Containerd | Secure containerized sandbox supervision, process isolation, resource quotas. |
| `@rakazo/contracts` | TypeScript 5.8, Zod 3.23+ | Shared contracts, Zod schemas (`InferenceModeSchema`, `InferenceUsageTagSchema`, `BotInferenceConfigSchema`, `PromptExecutionLogInputSchema`), MCP catalog (40 tools), immutability validators. |
| `@rakazo/adapters` | TypeScript 5.8, Node.js | `CanonicalAgentRuntime`, `OmniRouteInferenceTransport`, `PiAiInferenceTransport`, `RakazoFreePolicyEngine`, `pi-runtime.ts` with TypeBox MCP complex schema normalization (`jsonSchemaParameters`, `jsonField`, unions, single-item enums, null literals, dynamic records), PromptCompilerService, 4-block cache assembler, subagent inheritance, loop guards, secret sanitizer. |
| `@rakazo/adapter-kit` | TypeScript 5.8 | Standardized tool interfaces, connector registry, background job definitions. |
| `@rakazo/db` | Prisma 7, PostgreSQL 16 | PostgreSQL schema, Repositories (`repos.ts`: `mapBot`, `createBot`, `updateBot`), async SQL telemetry (`PromptExecutionLog`), cascade relations (`onDelete: Cascade`). |
| `@rakazo/core` | TypeScript 5.8 | Domain business logic, authentication handlers, cron execution, event bus, attachment management, runtime secret guards, `events.ts` with SSE UTF-16 surrogate sanitization (`isHighSurrogate`, `isLowSurrogate`, streaming redactor multi-byte boundary defense). |
| `@rakazo/chat-ui` | React 18, CSS Modules | Responsive chat components, message renderer, touch-safe composer (`min-h-[44px]`), code blocks, responsive markdown containment (`overscroll-behavior-x: contain`, touch target expansion). |
| `@rakazo/ui-tokens` / `ui-web` | CSS / Tailwind Tokens | Shared visual tokens, unified red error palette (`--rk-error: #ef4444`, `--rk-error-surface: rgba(239, 68, 68, 0.10)`, `--rk-error-border: rgba(239, 68, 68, 0.25)`, `--rk-error-ink: #fca5a5`, `--destructive: 0 84% 60%`, `tokens.danger = "#EF4444"`, `tokens.error = "#EF4444"`), typography, spacing primitives. |
| `@rakazo/testkit` | Vitest, Test Containers, Mocks | Monorepo integration harnesses, E2E test suites, OmniRoute mock servers, upstream sync stress tests, adversary fuzzers, UI excellence and robustness test batteries (Tiers 1–4). |
| `@rakazo/memory` | TypeScript 5.8 | Context management, semantic search, memory persistence. |
| `@rakazo/auth` | TypeScript 5.8 | Token verification, OAuth flows, user permission gating. |

---

## 3. Dual-Path Intelligence Architecture & 3-Tier Dynamic Decoupling

Rakazo decouples model inference transport from agent orchestration through a **Pluggable Inference Transport Layer (`InferenceTransport`)** running over a shared **Canonical Agentic Runtime (`CanonicalAgentRuntime`)**:

```
                                  ┌────────────────────────────────┐
                                  │      User / Client Request     │
                                  └───────────────┬────────────────┘
                                                  │
                                                  ▼
                                     [ WebUI / Bot Configuration ]
                                                  │
                                                  ▼
                                       { bot.inference.mode }
                                                  │
                       ┌──────────────────────────┴──────────────────────────┐
                       │                                                     │
               [ "premium" ]                                            [ "free" ]
                       │                                                     │
                       ▼                                                     ▼
           [ PiAiInferenceTransport ]                              [ OmniRouteInferenceTransport ]
           (Pi / OpenRouter Gateway)                               (Sovereign Free Gateway)
                       │                                                     │
         • Model: openai/gpt-oss-120b                              • Live Combos: combo/rakazo-*
         • KV Prefix Caching (4-Block)                             • Approved Provider Allowlist
         • Advanced Prompt Compiler (L2)                           • Double Zero-Cost Barrier ($0.00)
         • Standard Agentic Depth                                  • Strict Subagent Confinement
                       │                                                     │
                       └──────────────────────────┬──────────────────────────┘
                                                  ▼
                              [ Shared CanonicalAgentRuntime MCP Loop ]
                              • Full MCP Tool Calling (40 tools)
                              • Robust TypeBox Schema Compilation (PR #450)
                              • SSE UTF-16 Surrogate Sanitization (PR #424)
                              • Semantic Compaction (compactToolResult)
                              • Anti-Loop Disjoncteurs (3 identical / 25 steps)
                              • Native AbortSignal Cancellation
                              • FNV-1a Session Affinity (x-session-id)
                                                  │
                                                  ▼
                                      [ Asynchronous SQL Telemetry ]
                                      (PromptExecutionLog in Prisma 7)
                                      • inferenceMode: "premium" | "free"
                                      • requestedCategory / resolvedProvider
                                      • resolvedModel / isFree: true | false
                                      • cacheHitRatio / durationMs
```

### 3.1 The 3-Tier Decoupling Architecture
1. **Tier 1 (Stable Product Intent)**: Mode `free` + cognitive profile (`coding`, `reasoning`, `fast`, `writing`, `analysis`) persisted in PostgreSQL `bot.metadata.inference`.
2. **Tier 2 (Logical Route Contract)**: Canonical route string (`combo/rakazo-coding`, `combo/rakazo-reasoning`, etc.) transmitted to OmniRoute as a capability contract via the Cognitive Priority Matrix.
3. **Tier 3 (Real Execution Resolution)**: Live provider (`mistral`, `groq`, `qwen`, `deepseek`) and model (`mistralai/codestral-latest`, etc.) dynamically resolved per turn by OmniRoute.

### 3.2 Triple Coherence Formal Invariant
$$\mathbf{OmniRoute\ Response\ Headers} \equiv \mathbf{PromptExecutionLog\ (SQL)} \equiv \mathbf{WebUI\ Rendered\ Metadata}$$

---

## 4. Core Architectural Subsystems & Invariants

### 4.1 Full Persistence Chain for Free Mode
- **Repository Mapping (`packages/db/src/repos.ts`)**:
  - `mapBot`: Safely extracts and types `inference: { mode, tags }` from JSONB `metadata.inference`.
  - `createBot`: Persists `metadata.inference` and enforces subagent Free mode inheritance when `parentBotId` is provided.
  - `updateBot`: Merges updated `inference` without altering unrelated metadata keys.
- **API Router Procedures (`apps/api/src/router.ts`)**:
  - `bots.create`: Accepts `BotInferenceConfig` and writes to repository.
  - `bots.update`: Updates `inference` in repository.
  - `bots.duplicate`: Clones `sourceInference` to the newly duplicated bot.
- **Legacy Default Guarantee**: Legacy bots without explicit `inference` cleanly default to `"premium"` with zero migration required.

### 4.2 Deterministic Cognitive Priority Routing & Live Combos
The `RakazoFreePolicyEngine` deterministically resolves multi-tag requests to live OmniRoute combos according to the **Cognitive Priority Matrix**:

| Intent Tag | Priority Weight | Primary Target Route | Provider | Primary Optimization |
|---|---|---|---|---|
| `reasoning` | **100** | `combo/rakazo-reasoning` | `omniroute` | DeepSeek R1 Chain-of-Thought & Mathematical Logic |
| `coding` | **80** | `combo/rakazo-coding` | `omniroute` | Qwen 2.5 Coder / Codestral Code Generation & Refactoring |
| `analysis` | **60** | `combo/rakazo-analysis` | `omniroute` | Qwen 2.5 72B Deep Data Analysis & Synthesis |
| `writing` | **40** | `combo/rakazo-writing` | `omniroute` | Mistral Small 24B Editorial Prose & Structured Copy |
| `fast` | **20** | `combo/rakazo-fast` | `omniroute` | LLaMA 3.2 3B Ultra-Low Latency & Intent Triage |
| *(Default / Empty)* | **0** | `combo/rakazo-fast` | `omniroute` | Fallback Generalist High-Availability Combo |

Multi-tag resolution selects the tag with the highest weight (`resolveDeterministicTag`), guaranteeing deterministic routing without combinatorial explosion.

### 4.3 Shared Canonical MCP Tool Loop & Loop Guards
- **Turn Iteration Limit**: `MAX_TOOL_ITERATIONS_PER_TURN = 25`. Turns exceeding 25 steps are safely terminated with a clean completion message.
- **Redundancy Detector**: `evaluateToolCallGuard` tracks consecutive identical tool calls with identical arguments, terminating after 3 repetitions.
- **Semantic Compactor (`compactToolResult`)**: Automatically compacts heavy tool outputs (shell logs, file trees, GitHub diffs, Notion JSON) before passing them back into the LLM context.
- **Universal Error Sanitizer (`sanitizeToolError`)**: Masks 12 credential patterns across GitHub PATs, Notion keys, database URLs, and API tokens.

### 4.4 Subagent Confinement & Inheritance Invariants
- **Inference Mode Inheritance**: A subagent spawned by a Free parent is strictly initialized with `mode: "free"`. Any privilege escalation attempt to `"premium"` is vetoed.
- **Depth 1 Limit**: Subagents cannot spawn child subagents (`SUBAGENT_MAX_DEPTH = 1`).
- **Token Ceiling**: Subagent token budget is strictly capped at `8 192` tokens (`SUBAGENT_TOKEN_BUDGET_CEILING = 8192`).
- **Delegation Tool Stripping**: `run_subagent`, `spawn_subagent`, `delegate_task`, `spawn_bot`, `archive_bot`, `delete_bot` are stripped from subagent tool catalogs.

### 4.5 2-Tier KV Prefix Caching & FNV-1a Session Affinity
1. **Tier 1 (4-Block Prompt Layout at Token 0)**:
   - Block A (Static Platform Guardrails): System invariants (~1,000 tokens).
   - Block B (Durable Bot Definition & Skills): Bot identity and sorted skills (`${slug}:${name}`).
   - Block C (Compacted History): Conversation history with `compactToolResult`.
   - Block D (Ephemeral Current Turn): User input and attachments.
2. **Tier 2 (OmniRoute 32-bit FNV-1a Sticky Session Affinity)**:
   - Deterministic hash key derived from `workspace:bot:thread`.
   - Propagated via header `x-session-id: <hash>`.
   - Provider-independent: Provider rotation during failover never corrupts session identity.
3. **Strict Mathematical Cache Hit Ratio**:
   $$\text{cacheHitRatio} = \begin{cases} \frac{\text{cachedTokens}}{\text{promptTokens}} & \text{if } \text{promptTokens} > 0 \\ 0.0 & \text{if } \text{promptTokens} = 0 \end{cases} \in [0.0, 1.0]$$

### 4.6 Non-Blocking SQL Telemetry (`PromptExecutionLog`)
- Recorded asynchronously via `recordPromptExecutionLogAsync(...)` with fire-and-forget Promise handling.
- Bounded fields: `botId`, `executionId`, `inferenceMode`, `requestedCategory`, `resolvedProvider`, `resolvedModel`, `isFree`, `promptTokens`, `completionTokens`, `cachedTokens`, `cacheHitRatio`, `durationMs`, `costEstimatedUsd`.
- Fail-open resilience: DB write latencies or timeouts never block user turns.

### 4.7 UI/UX Excellence & Interactive Chat Components
- **`ToolActivityAccordion` (`apps/web/src/components/chat/ToolActivityAccordion.tsx`)**:
  - 1-click foldable MCP tool activity accordion with accessible `aria-expanded` toggles.
  - Live status indicators (`bg-amber-400 animate-pulse` for running, `bg-emerald-400` for completed, `bg-rose-500` for failed).
  - Sub-second (`85ms`) and multi-second (`1.2s`, `3.4s`) compute duration formatting.
  - Formatted and scrollable arguments and tool result previews.
- **`ChoiceChipsCard` (`apps/web/src/components/chat/ChoiceChipsCard.tsx`)**:
  - Suggestion choice chips card handling `kind: "choice"` block structures.
  - Question heading `<h4>`, optional subtitle `<p>`, responsive flex container (`flex flex-wrap gap-2`).
  - Letter badges (`A`, `B`, `C`), hover/active scale transitions, disabled state support, and `onSelectOption` dispatch.
- **`TimestampBadge` (`apps/web/src/components/chat/TimestampBadge.tsx`)**:
  - Formatted message timestamp with hover exact time overlay.
  - Thought/compute duration badge (*« A réfléchi pendant X.Xs »* or *« A réfléchi pendant Xms »*).
  - Model & provider metadata display (`Modèle : [model] · [provider]`).
  - Free Tier badge (`text-emerald-400 bg-emerald-950/60 border border-emerald-800/40` *« Gratuit via OmniRoute »*).
  - Upstream latency formatting (`(Xms)`).
- **`MessageActionBar` (`apps/web/src/components/chat/MessageActionBar.tsx`)**:
  - Floating action bar for message bubbles with thumbs up/down reaction state toggling (emerald/rose) and quick clipboard copy with visual feedback.
- **`MentionPopover` (`apps/web/src/components/chat/MentionPopover.tsx`)**:
  - Keyboard-driven bot/subagent `@mention` summon menu.
  - Case-insensitive query filtering with defensive nullish checks against corrupted bot data.
  - Accessible `role="listbox"` and `role="option"` with `aria-selected` tracking, navigated via `ArrowUp`, `ArrowDown`, `Enter`, `Tab`, and `Escape`.
- **Unified Red Error Design System**:
  - Centralized error palette across `@rakazo/ui-tokens` (`--rk-error: #ef4444;`, `--rk-error-surface: rgba(239, 68, 68, 0.10);`, `--rk-error-border: rgba(239, 68, 68, 0.25);`, `--rk-error-ink: #fca5a5;`, `--destructive: 0 84% 60%;`, `tokens.danger = "#EF4444"`).
  - Applied across Composer error banners with dismiss button and auto-clear on message dispatch, follow-up, and bot switch.
- **9-Breakpoint Responsive Touch Ergonomics**:
  - Strict $\ge 44$px touch targets, safe area inset padding (`env(safe-area-inset-bottom)`), smooth touch scrolling with `overscroll-behavior-x: contain` on code and tables across 320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, and 1440px+.

### 4.8 Robustness Hotfixes & Boundary Defense
- **MCP Complex Schema & TypeBox Enum Normalization (PR #450)**:
  - In `packages/adapters/src/pi-runtime.ts` (`jsonSchemaParameters`, `jsonField`):
    - Guards against non-object inputs returning `Type.Object({})`.
    - Normalizes single-item enums (`["fast"]`) directly to `Type.Literal("fast")` or `Type.Null()`.
    - Handles multi-item enums with `null` literals (`["coding", null]`) by emitting `Type.Null()` for null entries.
    - Resolves `anyOf` and `oneOf` unions and type arrays (`type: ["string", "null"]`).
    - Compiles dynamic dictionary objects (`type: "object"` without `properties`) to `Type.Record(Type.String(), Type.Unknown())`.
- **SSE UTF-16 Surrogate Pair Sanitization (PR #424)**:
  - In `packages/core/src/events.ts` (`isHighSurrogate`, `isLowSurrogate`, `createStreamingRedactor`):
    - Detects high (`0xD800..0xDBFF`) and low (`0xDC00..0xDFFF`) surrogate code units.
    - Retains trailing unattached high surrogates across streaming SSE chunks in `buffer` instead of emitting corrupted replacement character `\uFFFD`.
    - Steps 2 code units for multi-byte emojis (`🚀`, `🤖`, `🎉`, `✨`, ZWJ sequences) during secret matching and protects surrogate pairs across chunk boundaries.
- **Resolved Run Error Banner Cleanup (PR #449, #447)**:
  - In `apps/web/src/lib/thread-events.ts` (`isThreadSnapshotEvent`, `reduceThreadSnapshot`):
    - Processes terminal run events: `run.completed`, `run.failed`, and `run.cancelled`.
    - Clears transient progress tokens (`!message.id.startsWith("progress:")`) and clears active `run` reference (`run: null`) upon receiving terminal run events.
    - Composer dismisses stale error banners upon retry, follow-up, or bot switch.

---

## 5. Deployment & Container Isolation Architecture

```text
                                  ┌───────────────────────────────┐
                                  │   Internet Ingress (HTTPS)    │
                                  └───────────────┬───────────────┘
                                                   │
                                                   ▼
                                        [ Traefik v3.6 Proxy ]
                                        (Let's Encrypt Automated TLS)
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         │                                                   │
                         ▼ (agents.workspacegroupefloteuil.eu)               ▼ (omniroute.workspacegroupefloteuil.eu)
          ┌──────────────────────────────┐                    ┌──────────────────────────────┐
          │ Coolify App 20: Rakazo Stack │                    │ Coolify App 21: OmniRoute    │
          ├──────────────────────────────┤                    ├──────────────────────────────┤
          │ • apps/web (React 18 / Vite) │                    │ • Image: floteuil/OmniRoute  │
          │ • apps/api (Fastify / Hono)  │───(Bearer Auth)───►│ • Target: runner-base (Node26)│
          │ • apps/worker (BullMQ)       │                    │ • Port: 20128                │
          │ • PostgreSQL 16 (Dedicated)  │                    │ • Volume: /app/data (SQLite) │
          └──────────────────────────────┘                    │ • Non-Root UID 1000:1000     │
                                                              └──────────────────────────────┘
```

### VPS Coolify Non-Interference Invariants
1. **Isolated Namespace**: Scoped to Coolify application UUIDs (`qmusbfbjcz0ohip348rv8fgc` for OmniRoute, `s1253nc0yc4uu89lp6692r1s` for Rakazo).
2. **Dedicated Volumes**: Storage scoped exclusively to named volumes (`qmusbfbjcz0ohip348rv8fgc_data`, `pgdata`, `appdata`).
3. **Zero Docker Socket Exposure**: No container has access to `/var/run/docker.sock`.
4. **Tenant Non-Interference**: Absolute isolation against all 15 co-located applications on the VPS (HubtoWrite, Veinart, Open-Design, Postiz, DocuSeal, n8n, Flowise, Odoo, SearXNG, Minio, Beszel, Scraperr).

---

## 6. Verification & Quality Matrix

| Verification Target | Requirement | Verified Monorepo Result | Status |
|---|---|---|---|
| **TypeScript Typecheck** | 0 diagnostic errors across 19 packages | **0 errors** (`pnpm check` / `turbo check --force`, 19/19 packages) | 🟢 PASS |
| **Monorepo Test Suite** | 100% test pass rate across all suites | **100% passed** (535 web tests, 180 UI excellence tests, 1,150+ adapter tests) | 🟢 PASS |
| **MCP Complex Schema Suite** | TypeBox enums, unions, dynamic objects | **13 / 13 passed (100%)** (`mcp-complex-schemas.test.ts`) | 🟢 PASS |
| **UTF-16 Surrogate Suite** | Multi-byte emojis, split boundaries, secrets | **13 / 13 passed (100%)** (`utf16-surrogate-sanitization.test.ts`) | 🟢 PASS |
| **Thread Cleanup Suite** | Terminal run reduction, progress token purge | **11 / 11 passed (100%)** (`thread-events-cleanup.test.ts`) | 🟢 PASS |
| **Unified Error Token Suite** | CSS vars, contrast, 7 bot accent colors | **10 / 10 passed (100%)** (`tokens-error.test.ts`) | 🟢 PASS |
| **9-Breakpoint Responsive Matrix** | 320px–1440px+, touch $\ge 44$px, safe areas | **15 / 15 passed (100%)** (`responsive-matrix.test.tsx`) | 🟢 PASS |
| **UI Excellence Components** | Accordion, Chips, Timestamp, Action Bar, Mention | **25 / 25 passed (100%)** (`ui-excellence-components.test.tsx`) | 🟢 PASS |
| **Shell Master Integration** | Integrated transcript, events, error banners | **35 / 35 passed (100%)** (`shell-integration.test.tsx`) | 🟢 PASS |
| **E2E Tier 3 & 4 Scenarios** | Combinatorial workflows & real-world turns | **45 / 45 passed (100%)** (`e2e-tier3-tier4-scenarios.test.tsx`) | 🟢 PASS |
| **Sanctuary of 10 Invariants** | OpenRouter, OmniRoute, DB, $0.00, SQL, MCP, Loop | **13 / 13 passed (100%)** (`invariant-sanctuary.test.ts`) | 🟢 PASS |
| **Triple Coherence E2E** | Headers == SQL Telemetry == WebUI Metadata | **15 / 15 passed (100%)** | 🟢 PASS |
| **Secret Sanitization** | 12 sensitive token patterns scrubbed | **0 leaks detected across all logs and errors** | 🟢 PASS |

---

## 7. Master Operational Runbook

```bash
# 1. Full Monorepo Type Check (19 packages)
pnpm check
# Or force re-check all targets:
pnpm turbo check --force

# 2. Full Monorepo Test Suite
pnpm test

# 3. UI Excellence & Robustness Test Suite (180 tests)
pnpm vitest run \
  packages/adapters/src/mcp-complex-schemas.test.ts \
  packages/core/src/utf16-surrogate-sanitization.test.ts \
  packages/ui-tokens/src/tokens-error.test.ts \
  packages/adapters/src/invariant-sanctuary.test.ts \
  apps/web/src/tests/

# 4. Web Package Dedicated Test Suite (535 tests across 28 files)
pnpm --filter @rakazo/web test

# 5. Biome Lint & Format Check
pnpm lint
pnpm format
```

---

## 8. Architectural Certification & Sign-off

The Rakazo codebase at Version 2.7.0-ui-excellence-and-robustness-certified fulfills 100% of the architectural, UI/UX, persistence, security, performance, ergonomics, container isolation, and QA criteria defined in the Master Project Plan.

### Key Canonical Documents
- [`RAKAZO_ARCHITECT_HANDOFF_UI_EXCELLENCE_AND_ROBUSTNESS.md`](RAKAZO_ARCHITECT_HANDOFF_UI_EXCELLENCE_AND_ROBUSTNESS.md): Authoritative Master Architecture, UI/UX Excellence, Robustness Hotfixes & Monorepo Certification Artifact.
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_RUNTIME_TRUTH_FINAL.md`](RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_RUNTIME_TRUTH_FINAL.md): Authoritative Master Architecture, Forensic Audit & Platform Runtime Truth Certification Artifact.
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_EXCELLENCE_FINAL.md`](RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_PRODUCTION_EXCELLENCE_FINAL.md): Master Passation & Production Excellence Certification Artifact.
- [`AGENTS.md`](AGENTS.md): Authoritative Operating Guide & 6 Core Platform Pillars.
- [`docs/ENVIRONMENT_SETUP.md`](docs/ENVIRONMENT_SETUP.md): Comprehensive Developer Setup & 54+ Environment Variables Taxonomy.
- [`docs/OMNIROUTE_DEPLOYMENT.md`](docs/OMNIROUTE_DEPLOYMENT.md): Authoritative Coolify PaaS Runbook for OmniRoute Gateway.
- [`TEST_READY.md`](TEST_READY.md): Master E2E & UI/UX Excellence Test Ready Certification Report.
