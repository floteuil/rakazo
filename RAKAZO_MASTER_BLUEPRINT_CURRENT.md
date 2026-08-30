# RAKAZO MASTER BLUEPRINT — CURRENT ARCHITECTURE & PLATFORM SPECIFICATION

**Version**: 2.5.0-free-intelligence-gateway  
**Repository**: [https://github.com/floteuil/rakazo](https://github.com/floteuil/rakazo) (Turborepo 2 + pnpm Monorepo)  
**Branch**: `main`  
**Consolidation**: Free Intelligence Gateway (OmniRoute) & Dual-Path Inference Architecture  
**Verification Date**: 2026-08-30  
**Global Status**: Production Certified (0 TypeScript Errors across 19 packages, 193/193 E2E tests across Tiers 1–5, 2,545+ monorepo tests passed with 100% success rate, 0 Plaintext Secrets)

---

## 1. System Overview & Monorepo Topology

Rakazo is an enterprise-grade, sovereign, multi-agent AI orchestration platform designed for autonomous execution of complex engineering workflows, containerized tool manipulation via the Model Context Protocol (MCP), secure sandbox environments, high-efficiency prompt compilation with KV prefix caching, and **Dual-Path Autonomous Inference** (Premium GPT-OSS-120B via OpenRouter vs. Strictly Free Sovereign Gateway via OmniRoute).

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   RAKAZO MONOREPO (TURBO 2 + PNPM)                      │
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
| `apps/web` | React 18, Vite, Tailwind CSS v4, Lucide Icons | Responsive chat shell, Intelligence Mode Segmented Control (Premium/Free), Usage Tags Selector (max 3), PromptCompilerModal, MCP Tool Selector, Skill Library Overlay. |
| `apps/api` | Fastify / Hono, Node.js | REST / oRPC API gateway, bot lifecycle endpoints, SSE streams, authentication validation, internal proxying. |
| `apps/worker` | Node.js, BullMQ, Redis | Asynchronous background jobs, routine scheduling, sandbox reconciliation, storage cleanup, agent execution worker. |
| `apps/mobile` | React Native, Expo 57 | Mobile-native client, secure session storage, push notifications, voice transcription. |
| `apps/desktop` | Electron, Node.js | Desktop application shell, sandbox local proxy, window management, screen-lease support. |
| `apps/www` | Astro SSR | Public landing page, documentation portal, static assets. |
| `infra/sandboxes/supervisor` | Node.js, Docker/Containerd | Secure containerized sandbox supervision, process isolation, resource quotas. |
| `@rakazo/contracts` | TypeScript 5.8, Zod 3.23+ | Shared contracts, Zod schemas (`InferenceModeSchema`, `InferenceUsageTagSchema`, `BotInferenceConfigSchema`, `PromptExecutionLogInputSchema`), MCP catalog (40 tools), immutability validators. |
| `@rakazo/adapters` | TypeScript 5.8, Node.js | `FreeOmniRouteAdapter`, `RakazoFreePolicyEngine`, PromptCompilerService, Pi Runtime adapter, 4-block cache assembler, subagent inheritance, loop guards, secret sanitizer. |
| `@rakazo/adapter-kit` | TypeScript 5.8 | Standardized tool interfaces, connector registry, background job definitions. |
| `@rakazo/db` | Prisma 7, PostgreSQL 16 | PostgreSQL schema, migration 0015 (`inference_mode`, `is_free`, etc.), async SQL telemetry (`PromptExecutionLog`), cascade relations (`onDelete: Cascade`). |
| `@rakazo/core` | TypeScript 5.8 | Domain business logic, authentication handlers, cron execution, event bus, attachment management, runtime secret guards. |
| `@rakazo/chat-ui` | React 18, CSS Modules | Responsive chat components, message renderer, touch-safe composer (`min-h-[44px]`), code blocks. |
| `@rakazo/ui-tokens` / `ui-web` | CSS / Tailwind Tokens | Shared visual tokens, color schemes, typography, spacing primitives. |
| `@rakazo/testkit` | Vitest, Test Containers, Mocks | Monorepo integration harnesses, E2E test suites, OmniRoute mock servers, upstream sync stress tests, adversary fuzzers. |
| `@rakazo/memory` | TypeScript 5.8 | Context management, semantic search, memory persistence. |
| `@rakazo/auth` | TypeScript 5.8 | Token verification, OAuth flows, user permission gating. |

---

## 3. Dual-Path Intelligence Architecture & Unified Agentic Runtime

Rakazo provides users and bots with two distinct inference paths orchestrated over a **single, unified agentic execution runtime** with pluggable `InferenceTransport`:

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
           [ Premium Inference Transport ]                         [ Free Inference Transport ]
           (Pi / OpenRouter Provider)                              (OmniRoute Sovereign Gateway)
                       │                                                     │
         • Model: openai/gpt-oss-120b                              • Model / Live Combo Routing
         • KV Prefix Caching (4-Block)                             • Approved Provider Allowlist
         • Advanced Prompt Compiler (L2)                           • Double Zero-Cost Barrier ($0.00)
         • Standard Agentic Depth                                  • Strict Subagent Confinement
                       │                                                     │
                       └──────────────────────────┬──────────────────────────┘
                                                  ▼
                              [ Shared Canonical Agentic Loop ]
                              • Full MCP Tool Calling (40 tools)
                              • Semantic Compaction (compactToolResult)
                              • Anti-Loop Disjoncteurs (3 identical / 25 steps)
                              • Native AbortSignal Cancellation
                                                  │
                                                  ▼
                                      [ Asynchronous SQL Telemetry ]
                                      (PromptExecutionLog in Prisma 7)
                                      • inferenceMode: "premium" | "free"
                                      • requestedCategory / resolvedProvider
                                      • resolvedModel / isFree: true | false
```

### 3.1 Path A: Historical Premium Path (OpenRouter GPT-OSS-120B)
- **Sanctuarized & Unaltered**: 100% backward compatibility for all existing agents and agents without explicit configuration.
- **Capabilities**: High-reasoning foundation model (`openai/gpt-oss-120b`), 4-block KV prefix caching with $>80\%$ hit rates, Level 2 LLM prompt compilation, and enterprise multi-turn workflows.
- **Telemetry**: Logged as `inferenceMode: "premium"`, `isFree: false`.

### 3.2 Path B: Free Sovereign Gateway (OmniRoute)
- **Zero Token Cost**: Routes agent inference to verified open-weights models and high-availability live combos with the `:free` suffix.
- **Tag-Driven Specialization**: Bots declare up to 3 usage tags (`coding`, `writing`, `reasoning`, `fast`, `analysis`), dynamically mapped to optimal free tier models and combos (`combo/rakazo-coding`, etc.).
- **Double Zero-Cost Barrier**:
  1. *Local Policy Engine (`RakazoFreePolicyEngine`)*: Pre-flight assertion of `$0.000000` cost and approved provider allowlist (`meta-llama`, `mistralai`, `qwen`, `deepseek`, `google`).
  2. *Adapter Response Verification (`FreeOmniRouteAdapter`)*: Real-time inspection of HTTP headers (`x-omniroute-cost`) and SSE chunks; immediate stream abort on any positive cost.
- **Strict Fail-Closed (Never-Paid Fallback)**: If free capacity is exhausted, rate-limited, or unavailable, returns `"Capacité gratuite temporairement indisponible"` without falling back to paid routes.

---

## 4. Core Architectural Subsystems & Invariants

### 4.1 Tag-Driven Model & Live Combo Routing Table

The `RakazoFreePolicyEngine` deterministically routes usage tags to verified open-weights models and OmniRoute live combos:

| Usage Tag | Primary Free Model / Combo Target | Provider | Primary Optimization |
|---|---|---|---|
| `coding` | `qwen/qwen-2.5-coder-32b-instruct:free` (`combo/rakazo-coding`) | `qwen` | Code generation, refactoring, syntax analysis |
| `reasoning` | `deepseek/deepseek-r1:free` (`combo/rakazo-reasoning`) | `deepseek` | Mathematical reasoning, chain-of-thought, logic |
| `writing` | `mistralai/mistral-small-24b-instruct:free` (`combo/rakazo-writing`) | `mistralai` | Creative writing, structured prose, editorial copy |
| `fast` | `meta-llama/llama-3.2-3b-instruct:free` (`combo/rakazo-fast`) | `meta-llama` | Ultra-low latency triage, intent classification |
| `analysis` | `qwen/qwen-2.5-72b-instruct:free` (`combo/rakazo-analysis`) | `qwen` | Deep data analysis, document synthesis |
| *(Default / Empty)* | `meta-llama/llama-3.3-70b-instruct:free` | `meta-llama` | High-capability generalist open-weights model |

### 4.2 Subagent Confinement & Inheritance Invariants
- **Inference Mode Inheritance**: A child subagent spawned by a Free parent is strictly initialized with `mode: "free"`. Any privilege escalation attempt to `"premium"` is vetoed by the runtime.
- **Depth 1 Limit**: Subagents cannot spawn child subagents (`host.depth <= 1`).
- **Token Ceiling**: Subagent token budget is strictly capped at `8 192` tokens.
- **Delegation Tool Stripping**: `DELEGATION_TOOL_NAMES` (`run_subagent`, `spawn_bot`, `archive_bot`, `delete_bot`) are stripped from subagent tool catalogs.
- **Anti-Loop Guards**: Circuit breaker triggers after 3 consecutive identical tool calls or 25 tool iteration steps per turn.

### 4.3 4-Block KV Prefix Caching & Session Affinity
Prompts are structured into 4 sequential blocks to preserve prefix caching across OpenRouter and OmniRoute:
1. **Block A (Static Platform Guardrails)**: System prompt and invariants. Byte-identical across all platform bots.
2. **Block B (Durable Bot Definition & Skills)**: Bot identity, durable instructions, deterministically sorted skills (`${slug}:${name}`).
3. **Block C (Compacted History)**: Multi-turn messages with compacted tool outputs (`compactToolResult`).
4. **Block D (Ephemeral Current Turn)**: User query and current turn attachments.
- **Session Affinity (`x-session-id`)**: Deterministic 32-bit FNV-1a hash header computed via `computeSessionAffinityKey(botId, threadId)` and transmitted to OmniRoute to maximize upstream provider KV cache hits on Blocks A+B while handling failovers seamlessly.

### 4.4 Non-Blocking SQL Telemetry (`PromptExecutionLog`)
- Schema extended via additive migration `0015_free_intelligence_gateway`:
  - `inference_mode`: `"premium" | "free"`
  - `requested_category`: `String?`
  - `resolved_provider`: `String?`
  - `resolved_model`: `String?`
  - `is_free`: `Boolean`
- Ingested asynchronously via `recordPromptExecutionLogAsync` with fire-and-forget Promise handling and metric clamping. Database latency never impacts bot turn execution.

### 4.5 Sovereign MCP Tool Catalog & Secret Sanitization
- **40 Sovereign Tools**: Opt-in enterprise connectors (GitHub, Notion, Postiz, WordPress, Novamira, n8n, Cloudflare, Composio).
- **Immutability Invariant**: Prompt compilation and runtime execution are strictly prohibited from altering MCP tool activations.
- **Universal Secret Sanitizer (`sanitizeToolError`)**: Masks 12 sensitive credential families across GitHub PATs, Notion keys, database connection strings, and OAuth tokens without false positives.

### 4.6 Multi-Screen WebUI Ergonomics
- **Responsive Geometry**: Fully verified across 9 viewports (320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px+).
- **Touch Ergonomics**: All interactive chips, toggles, and buttons meet WCAG 2.5.5 touch target standard ($\ge 44$px).
- **Safe Area Insets**: Handled via `pb-[max(0.875rem,env(safe-area-inset-bottom))]`.
- **Form Controls**: Segmented intelligence toggle (Premium / Free) and multi-select pill chips (max 3) integrated into `CreateBotForm.tsx` and `BotSettings.tsx`.

---

## 5. Deployment & Container Isolation Architecture

Rakazo supports two enterprise-grade containerized deployment topologies:

### 5.1 Coolify PaaS Multi-Application Topology (Production VPS `62.164.214.145`)

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

### 5.2 Local / Standalone Compose Topology (Development)

```text
                                  ┌───────────────────────────────┐
                                  │      Local Reverse Proxy      │
                                  └───────────────┬───────────────┘
                                                  │
                         ┌────────────────────────┴─────────────────────────┐
                         ▼                                                  ▼
                 [ Web UI (Vite) ]                                  [ API Backend ]
                 (Port 5173)                                        (Port 3100)
                                                                            │
                                     ┌──────────────────────────────────────┤
                                     │ (Private Bridge Network: 'app', 'data')
                                     ▼                                      ▼
                          [ Background Worker ]                    [ PostgreSQL 16 ]
                          (apps/worker)                            (Port 5432 / data)
                                     │
                                     │ (Internal HTTP / port 8080)
                                     ▼
                          [ OmniRoute Gateway ]
                          (Port 8080 / app, data)
                          • Non-Root UID 10001:10001
                          • NO edge network
                          • NO public port binding
                          • NO docker.sock mount
                          • cap_drop: [ALL], no-new-privileges
```

### 5.3 VPS Coolify Non-Interference Invariants
1. **Isolated Namespace**: All containers and resources are strictly scoped to their respective Coolify application UUIDs (`qmusbfbjcz0ohip348rv8fgc` for OmniRoute, `s1253nc0yc4uu89lp6692r1s` for Rakazo).
2. **Dedicated Volumes**: Storage scoped exclusively to named volumes (`qmusbfbjcz0ohip348rv8fgc_data`, `pgdata`, `appdata`). Zero volume pollution to other VPS applications.
3. **Zero Docker Socket Exposure**: No container has access to `/var/run/docker.sock`.
4. **Tenant Non-Interference**: Absolute isolation against all 15 co-located applications on the VPS (HubtoWrite, Veinart, Open-Design, Postiz, DocuSeal, n8n, Flowise, Odoo, SearXNG, Minio, Beszel, Scraperr).

---

## 6. Verification & Quality Matrix

| Verification Target | Requirement | Verified Monorepo Result | Status |
|---|---|---|---|
| **TypeScript Typecheck** | 0 diagnostic errors across 19 packages | **0 errors** (`pnpm check`, 19/19 packages) | 🟢 PASS |
| **Monorepo Test Suite** | 100% test pass rate ($\ge 2\,500$ tests) | **2,545+ passed, 0 failed** (178 test files) | 🟢 PASS |
| **OmniRoute 5-Tier E2E Suite** | 193/193 tests across Tiers 1–5 | **193 / 193 passed (100%)** | 🟢 PASS |
| **Contracts & Unit Tests** | All domain contracts & policy engines | **100% passed** | 🟢 PASS |
| **Zero-Cost Invariant** | Cost = $0.000000 on all Free routes | **Verified across adversarial & empirical chaos tests** | 🟢 PASS |
| **Fail-Closed Barrier** | Zero fallback to paid models on failure | **100% rejected with standard sanitized error** | 🟢 PASS |
| **Subagent Inheritance** | Free parent strictly spawns Free subagent | **100% inherited, privilege escalation vetoed** | 🟢 PASS |
| **Subagent Confinement** | Depth = 1 strict, max 8,192 tokens | **100% recursion rejected, tokens clamped** | 🟢 PASS |
| **WebUI Ergonomics** | 9 screen resolutions, touch targets $\ge 44$px | **216 / 216 UI tests passed** | 🟢 PASS |
| **Secret Sanitization** | 12 sensitive token patterns scrubbed | **0 leaks detected across all logs and errors** | 🟢 PASS |
| **MCP Immutability** | Zero configuration mutation by compilers | **100% immutable** | 🟢 PASS |

---

## 7. Operational Runbook & Verification Commands

```bash
# 1. Full Monorepo Type Check (19 packages)
pnpm check

# 2. Full Monorepo Test Suite (2,545+ tests)
pnpm test

# 3. 5-Tier E2E Integration Suite (193 tests)
pnpm vitest run \
  packages/testkit/src/tests/tier1-features-r1-r6.e2e.test.ts \
  packages/testkit/src/tests/tier2-boundary-r1-r6.e2e.test.ts \
  packages/testkit/src/tests/tier3-pairwise-r1-r6.e2e.test.ts \
  packages/testkit/src/tests/tier4-real-world-scenarios.e2e.test.ts \
  packages/testkit/src/tests/tier5-adversarial-stress.e2e.test.ts

# 4. OmniRoute Contracts & Policy Unit Tests
pnpm vitest run \
  packages/contracts/src/omniroute-contracts.test.ts \
  packages/adapters/src/omniroute-adapter.test.ts \
  packages/adapters/src/free-policy-engine.test.ts \
  packages/adapters/src/subagent-inheritance.test.ts \
  apps/web/src/pages/e2e-omniroute-ui.test.tsx \
  test/e2e/omniroute-adversarial.test.ts

# 5. Non-Blocking SQL Telemetry Stress Tests
pnpm vitest run \
  packages/db/src/m1-db-telemetry.empirical-challenge.test.ts \
  packages/db/src/challenger-m1-db-telemetry.test.ts \
  packages/testkit/src/tests/r3-sql-telemetry-empirical.challenger.test.ts

# 6. Prisma Client Generation & Migrations
pnpm db:generate
pnpm db:migrate

# 7. Biome Lint & Format Check
pnpm lint
pnpm format
```

---

## 8. Architectural Certification & Sign-off

The Rakazo codebase at Version 2.5.0-free-intelligence-gateway fulfills 100% of the architectural, security, performance, ergonomics, container isolation, and QA criteria defined in the Master Project Plan.
