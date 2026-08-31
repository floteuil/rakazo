# RAKAZO MASTER BLUEPRINT — CURRENT ARCHITECTURE & PLATFORM SPECIFICATION

**Version**: 2.6.0-omniroute-production-certified  
**Repository**: [https://github.com/floteuil/rakazo](https://github.com/floteuil/rakazo) (Turborepo 2 + pnpm Monorepo)  
**Branch**: `main`  
**Consolidation**: Free Intelligence Gateway (OmniRoute), Pluggable Transports, Shared Canonical MCP Runtime & Full-Chain Persistence  
**Verification Date**: 2026-08-31  
**Global Status**: Production Certified (0 TypeScript Errors across 19 packages, 2,658/2,658 tests passed with 100% success rate across 186 test files, 0 Plaintext Secrets)

---

## 1. System Overview & Monorepo Topology

Rakazo is an enterprise-grade, sovereign, multi-agent AI orchestration platform designed for autonomous execution of complex engineering workflows, containerized tool manipulation via the Model Context Protocol (MCP), secure sandbox environments, high-efficiency prompt compilation with KV prefix caching, and **Dual-Path Autonomous Inference** (Premium GPT-OSS-120B via OpenRouter vs. Strictly Free Sovereign Gateway via OmniRoute).

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
| `apps/web` | React 18, Vite, Tailwind CSS v4, Lucide Icons | Responsive chat shell, Intelligence Mode Segmented Control (Premium/Free), Usage Tags Selector (max 3), PromptCompilerModal, MCP Tool Selector, Skill Library Overlay. |
| `apps/api` | Fastify / Hono, Node.js, oRPC | REST / oRPC API gateway, bot lifecycle procedures (`create`, `update`, `duplicate`), SSE streams, auth gating, internal proxying. |
| `apps/worker` | Node.js, BullMQ, Redis | Asynchronous background jobs, routine scheduling, sandbox reconciliation, storage cleanup, agent execution worker, secret masking. |
| `apps/mobile` | React Native, Expo 57 | Mobile-native client, secure session storage, push notifications, voice transcription. |
| `apps/desktop` | Electron, Node.js | Desktop application shell, sandbox local proxy, window management, screen-lease support. |
| `apps/www` | Astro SSR | Public landing page, documentation portal, static assets. |
| `infra/sandboxes/supervisor` | Node.js, Docker/Containerd | Secure containerized sandbox supervision, process isolation, resource quotas. |
| `@rakazo/contracts` | TypeScript 5.8, Zod 3.23+ | Shared contracts, Zod schemas (`InferenceModeSchema`, `InferenceUsageTagSchema`, `BotInferenceConfigSchema`, `PromptExecutionLogInputSchema`), MCP catalog (40 tools), immutability validators. |
| `@rakazo/adapters` | TypeScript 5.8, Node.js | `CanonicalAgentRuntime`, `OmniRouteInferenceTransport`, `PiAiInferenceTransport`, `RakazoFreePolicyEngine`, PromptCompilerService, 4-block cache assembler, subagent inheritance, loop guards, secret sanitizer. |
| `@rakazo/adapter-kit` | TypeScript 5.8 | Standardized tool interfaces, connector registry, background job definitions. |
| `@rakazo/db` | Prisma 7, PostgreSQL 16 | PostgreSQL schema, Repositories (`repos.ts`: `mapBot`, `createBot`, `updateBot`), async SQL telemetry (`PromptExecutionLog`), cascade relations (`onDelete: Cascade`). |
| `@rakazo/core` | TypeScript 5.8 | Domain business logic, authentication handlers, cron execution, event bus, attachment management, runtime secret guards. |
| `@rakazo/chat-ui` | React 18, CSS Modules | Responsive chat components, message renderer, touch-safe composer (`min-h-[44px]`), code blocks. |
| `@rakazo/ui-tokens` / `ui-web` | CSS / Tailwind Tokens | Shared visual tokens, color schemes, typography, spacing primitives. |
| `@rakazo/testkit` | Vitest, Test Containers, Mocks | Monorepo integration harnesses, E2E test suites, OmniRoute mock servers, upstream sync stress tests, adversary fuzzers. |
| `@rakazo/memory` | TypeScript 5.8 | Context management, semantic search, memory persistence. |
| `@rakazo/auth` | TypeScript 5.8 | Token verification, OAuth flows, user permission gating. |

---

## 3. Dual-Path Intelligence Architecture & Unified Agentic Runtime

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
```

### 3.1 Path A: Historical Premium Path (`PiAiInferenceTransport`)
- **Sanctuarized & Unaltered**: 100% backward compatibility for all existing bots and bots created without explicit inference configuration.
- **Capabilities**: High-reasoning foundation model (`openai/gpt-oss-120b`), 4-block KV prefix caching, Level 2 LLM prompt compilation, enterprise multi-turn workflows.
- **Telemetry**: Logged as `inferenceMode: "premium"`, `isFree: false`.

### 3.2 Path B: Sovereign Free Gateway (`OmniRouteInferenceTransport`)
- **Zero Token Cost**: Routes agent inference to verified open-weights models and high-availability live combos (`combo/rakazo-*`).
- **Tag-Driven Cognitive Specialization**: Bots declare up to 3 usage tags (`coding`, `writing`, `reasoning`, `fast`, `analysis`), dynamically resolved to optimal live combos.
- **Double Zero-Cost Barrier**:
  1. *Local Policy Engine (`RakazoFreePolicyEngine`)*: Pre-flight assertion of `$0.000000` cost and approved provider allowlist (`omniroute`, `combo`, `meta-llama`, `mistralai`, `qwen`, `deepseek`, `google`).
  2. *Adapter Response Verification (`OmniRouteInferenceTransport`)*: Real-time inspection of HTTP response headers (`x-omniroute-cost`) and streaming chunks; immediate abort if cost $> \$0.00$.
- **Strict Fail-Closed (Never-Paid Fallback)**: If free capacity is exhausted or unavailable, returns `"Capacité gratuite temporairement indisponible"` without falling back to paid routes.

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
| `coding` | **80** | `combo/rakazo-coding` | `omniroute` | Qwen 2.5 Coder 32B Code Generation & Refactoring |
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

### 4.5 4-Block KV Prefix Caching & FNV-1a Session Affinity
Prompts are structured into 4 sequential blocks to preserve prefix caching across OpenRouter and OmniRoute:
1. **Block A (Static Platform Guardrails)**: System prompt and invariants at Token 0. Byte-identical across all platform bots.
2. **Block B (Durable Bot Definition & Skills)**: Bot identity, durable instructions, deterministically sorted skills (`${slug}:${name}`).
3. **Block C (Compacted History)**: Multi-turn messages with compacted tool outputs (`compactToolResult`).
4. **Block D (Ephemeral Current Turn)**: User query and current turn attachments.
- **Session Affinity (`x-session-id`)**: Deterministic 32-bit FNV-1a hash header computed via `computeSessionAffinityKey(botId, threadId)` and transmitted to OmniRoute to maximize upstream provider KV cache hits on Blocks A+B while handling failovers seamlessly.

### 4.6 Non-Blocking SQL Telemetry (`PromptExecutionLog`)
- Schema extended via additive migration `0015_free_intelligence_gateway`:
  - `inference_mode`: `"premium" | "free"`
  - `requested_category`: `String?`
  - `resolved_provider`: `String?`
  - `resolved_model`: `String?`
  - `is_free`: `Boolean`
- Ingested asynchronously via `recordPromptExecutionLogAsync` with fire-and-forget Promise handling. Database latency never impacts bot turn execution.

### 4.7 Sovereign MCP Tool Catalog & Secret Sanitization
- **40 Sovereign Tools**: Opt-in enterprise connectors (GitHub, Notion, Postiz, WordPress, Novamira, n8n, Cloudflare, Composio).
- **Immutability Invariant**: Prompt compilation and runtime execution are strictly prohibited from altering MCP tool activations.
- **Universal Secret Sanitizer (`sanitizeToolError`)**: Masks 12 sensitive credential families across GitHub PATs, Notion keys, database connection strings, and OAuth tokens without false positives.

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
1. **Isolated Namespace**: All containers and resources are strictly scoped to Coolify application UUIDs (`qmusbfbjcz0ohip348rv8fgc` for OmniRoute, `s1253nc0yc4uu89lp6692r1s` for Rakazo).
2. **Dedicated Volumes**: Storage scoped exclusively to named volumes (`qmusbfbjcz0ohip348rv8fgc_data`, `pgdata`, `appdata`). Zero volume pollution to other VPS applications.
3. **Zero Docker Socket Exposure**: No container has access to `/var/run/docker.sock`.
4. **Tenant Non-Interference**: Absolute isolation against all 15 co-located applications on the VPS (HubtoWrite, Veinart, Open-Design, Postiz, DocuSeal, n8n, Flowise, Odoo, SearXNG, Minio, Beszel, Scraperr).

---

## 6. Verification & Quality Matrix

| Verification Target | Requirement | Verified Monorepo Result | Status |
|---|---|---|---|
| **TypeScript Typecheck** | 0 diagnostic errors across 19 packages | **0 errors** (`pnpm check`, 19/19 packages) | 🟢 PASS |
| **Monorepo Test Suite** | 100% test pass rate ($\ge 2\,600$ tests) | **2,658 passed, 0 failed** (186 test files) | 🟢 PASS |
| **OmniRoute 5-Tier E2E Suite** | 193/193 tests across Tiers 1–5 | **193 / 193 passed (100%)** | 🟢 PASS |
| **Persistence Integrity Suite** | Full-chain roundtrip & duplication tests | **100% passed** | 🟢 PASS |
| **Cognitive Priority Routing** | Live combo resolution & multi-tag weights | **100% passed** | 🟢 PASS |
| **Canonical MCP Runtime** | Tool execution, circuit breaker, compaction | **100% passed** | 🟢 PASS |
| **Zero-Cost Invariant** | Cost = $0.000000 on all Free routes | **Verified across adversarial & empirical chaos tests** | 🟢 PASS |
| **Fail-Closed Barrier** | Zero fallback to paid models on failure | **100% rejected with standard sanitized error** | 🟢 PASS |
| **Subagent Inheritance** | Free parent strictly spawns Free subagent | **100% inherited, privilege escalation vetoed** | 🟢 PASS |
| **Subagent Confinement** | Depth = 1 strict, max 8,192 tokens | **100% recursion rejected, tokens clamped** | 🟢 PASS |
| **WebUI Ergonomics** | 9 screen resolutions, touch targets $\ge 44$px | **216 / 216 UI tests passed** | 🟢 PASS |
| **Secret Sanitization** | 12 sensitive token patterns scrubbed | **0 leaks detected across all logs and errors** | 🟢 PASS |

---

## 7. Operational Runbook & Verification Commands

```bash
# 1. Full Monorepo Type Check (19 packages)
pnpm check

# 2. Full Monorepo Test Suite (2,658+ tests)
pnpm test

# 3. 5-Tier E2E Integration Suite
pnpm vitest run \
  packages/testkit/src/tests/tier1-features-r1-r6.e2e.test.ts \
  packages/testkit/src/tests/tier2-boundary-r1-r6.e2e.test.ts \
  packages/testkit/src/tests/tier3-pairwise-r1-r6.e2e.test.ts \
  packages/testkit/src/tests/tier4-real-world-scenarios.e2e.test.ts \
  packages/testkit/src/tests/tier5-adversarial-stress.e2e.test.ts

# 4. Persistence & API Empirical Tests
pnpm vitest run \
  packages/db/src/repos.test.ts \
  packages/db/src/challenger-m1-persistence-empirical.test.ts \
  apps/api/src/router-bots-inference.test.ts \
  apps/api/src/challenger-m1-api-empirical.test.ts

# 5. OmniRoute Policy & Runtime Tests
pnpm vitest run \
  packages/contracts/src/omniroute-contracts.test.ts \
  packages/adapters/src/omniroute-adapter.test.ts \
  packages/adapters/src/free-policy-engine.test.ts \
  packages/adapters/src/subagent-inheritance.test.ts \
  packages/adapters/src/challenger-m3-caching-telemetry-empirical.test.ts

# 6. Biome Lint & Format Check
pnpm lint
pnpm format
```

---

## 8. Architectural Certification & Sign-off

The Rakazo codebase at Version 2.6.0-omniroute-production-certified fulfills 100% of the architectural, persistence, security, performance, ergonomics, container isolation, and QA criteria defined in the Master Project Plan.
