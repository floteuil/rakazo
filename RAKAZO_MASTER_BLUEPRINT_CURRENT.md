# RAKAZO MASTER BLUEPRINT — CURRENT ARCHITECTURE & PLATFORM SPECIFICATION

**Version**: 2.4.0-excellence  
**Repository**: [https://github.com/floteuil/rakazo](https://github.com/floteuil/rakazo) (Turborepo 2 + pnpm Monorepo)  
**Branch**: `main`  
**Consolidation**: Post-Excellence & Hardening Iteration (R1–R5)  
**Verification Date**: 2026-08-27  
**Global Status**: Production Certified (0 TypeScript Errors across 19 packages, 1 764 tests passed with 100% success rate)

---

## 1. System Overview & Monorepo Topology

Rakazo is an enterprise-grade, sovereign, multi-agent AI orchestration platform designed for autonomous execution of complex engineering workflows, containerized tool manipulation via the Model Context Protocol (MCP), secure sandbox environments, and high-efficiency prompt compilation with KV prefix caching.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   RAKAZO MONOREPO (TURBO 2 + PNPM)                      │
├───────────────────────────────────────────┬─────────────────────────────────────────────┤
│ APPLICATIONS (7)                          │ SHARED PACKAGES (12)                        │
│ • apps/web      (React 18, Tailwind v4)   │ • @rakazo/contracts (Zod Schemas, MCP types)│
│ • apps/api      (Fastify / Hono, Node.js) │ • @rakazo/adapters  (Pi Runtime, Tools)     │
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
| `apps/web` | React 18, Vite, Tailwind CSS v4, Lucide Icons | Responsive chat shell, PromptCompilerModal (Before/After split), Bot MCP Tool Selector, Skill Library Overlay. |
| `apps/api` | Fastify / Hono, Node.js | REST / oRPC API gateway, bot lifecycle endpoints, SSE streams, authentication validation. |
| `apps/worker` | Node.js, BullMQ, Redis | Asynchronous background jobs, routine scheduling, sandbox reconciliation, storage cleanup. |
| `apps/mobile` | React Native, Expo 57 | Mobile-native client, secure session storage, push notifications, voice transcription. |
| `apps/desktop` | Electron, Node.js | Desktop application shell, sandbox local proxy, window management, screen-lease support. |
| `apps/www` | Astro SSR | Public landing page, documentation portal, static assets. |
| `infra/sandboxes/supervisor` | Node.js, Docker/Containerd | Secure containerized sandbox supervision, process isolation, resource quotas. |
| `@rakazo/contracts` | TypeScript 5.8, Zod 3.23+ | Shared contracts, Zod input/output schemas, MCP catalog (40 tools), immutability validators. |
| `@rakazo/adapters` | TypeScript 5.8, Node.js | PromptCompilerService, Pi Runtime adapter, 4-block cache assembler, loop guards, secret sanitizer. |
| `@rakazo/adapter-kit` | TypeScript 5.8 | Standardized tool interfaces, connector registry, background job definitions. |
| `@rakazo/db` | Prisma 7, PostgreSQL 16 | PostgreSQL schema, async SQL telemetry (`PromptExecutionLog`), cascade relations (`onDelete: Cascade`). |
| `@rakazo/core` | TypeScript 5.8 | Domain business logic, authentication handlers, cron execution, event bus, attachment management. |
| `@rakazo/chat-ui` | React 18, CSS Modules | Responsive chat components, message renderer, touch-safe composer (`min-h-[44px]`). |
| `@rakazo/ui-tokens` / `ui-web` | CSS / Tailwind Tokens | Shared visual tokens, color schemes, typography, spacing primitives. |
| `@rakazo/testkit` | Vitest, Test Containers, Mocks | Monorepo integration harnesses, E2E test suites, upstream sync stress tests, adversary fuzzers. |
| `@rakazo/memory` | TypeScript 5.8 | Context management, semantic search, memory persistence. |
| `@rakazo/auth` | TypeScript 5.8 | Token verification, OAuth flows, user permission gating. |

---

## 3. Core Architectural Mechanisms

### 3.1 Two-Level Prompt Compiler (`PromptCompilerService`)
- **Fast-Path Deterministic (Level 1)**:
  - Linear single-pass lexical analysis ($\mathcal{O}(N)$) without intermediate AST allocation or ReDoS vulnerability.
  - Automatically transforms raw user drafts into 5 hierarchical Markdown sections:
    1. `# Role & Identity`
    2. `## Core Mission`
    3. `## Operational Rules & Constraints`
    4. `## Output Format & Deliverables`
    5. `## Error Handling & Edge Cases`
  - Ultra-low latency: $< 10\text{ ms}$ even on 50,000 character inputs.
- **LLM-Powered Advanced (Level 2)**:
  - Deep system prompt synthesis using `openai/gpt-oss-120b` on OpenRouter.
  - 15,000 ms timeout via `AbortController`, guaranteed timer cleanup in `finally` block.
  - Fail-safe fallback: in case of timeout or API failure, automatically falls back to Level 1 deterministic output with secret-sanitized error diagnostics.
- **Zod Contract Enforcement**:
  - `PromptCompileInputSchema` validates input bounds (1 to 20,000 characters).
  - `PromptCompileOutputSchema` validates output payload structure.
  - `verifyMcpImmutabilityAtContractLevel` rejects any unexpected configuration mutations.

### 3.2 Pi Runtime & Subagent Confinement Guardrails
- **Strict Depth 1 Constraint**:
  - `executeSubagent` evaluates `host.depth > 0` and rejects recursion immediately before acquiring resources: `"Subagents cannot nest further (subagent depth is strictly 1)."`.
- **Delegation Tool Exclusion**:
  - Automatically filters out `DELEGATION_TOOL_NAMES` (`run_subagent`, `spawn_bot`, `archive_bot`, `delete_bot`) from subagent available tools.
- **Token Budget & Circuit Breakers**:
  - Strict subagent token ceiling: `Math.min(Math.max(options?.maxTokens ?? 8192, 1), 8192)`.
  - Anti-loop circuit breaker: `MAX_TOOL_ITERATIONS_PER_TURN = 25` and `MAX_CONSECUTIVE_REDUNDANT_CALLS = 3`.
  - Parallel subagent gate: `MAX_PARALLEL_SUBAGENTS = 4`.

### 3.3 4-Block KV Prefix Caching & Session Affinity
- **Byte-Invariant Prefix (Bloc A + Bloc B)**:
  - **Bloc A (Static Platform Guardrails)**: Zero dynamic timestamps, zero volatile tokens, 100% byte-identical across all agents on the platform.
  - **Bloc B (Durable Agent Definition)**: Bot identity, durable instructions, deterministically sorted skills (`${slug}:${name}`) ensuring identical byte layout regardless of database query ordering.
- **Dynamic Context (Bloc C + Bloc D)**:
  - **Bloc C (Compacted History)**: Multi-turn conversation with semantic tool result compression (`compactToolResult`).
  - **Bloc D (Ephemeral Current Turn)**: User query and current turn attachments.
- **Session Affinity**:
  - Deterministic FNV-1a hash key (`sess_<hash>`) for sticky upstream routing to maximize KV cache hit rates ($> 80\%$).

### 3.4 Sovereign MCP Tool Catalog & Least Privilege
- **40 Sovereign MCP Tools**:
  - Full support across 10 categories (web search, web scraping, git, notion, database, CRM, wordpress, automation, dns, storage).
- **Execution-Time Security Gate**:
  - `applyTool` verifies tool permissions via `isToolPermitted(botMetadata, toolName)`. Unauthorized invocations are rejected with security policy violation errors.
  - Prototype pollution protection (`__proto__`, `constructor.prototype`) in metadata extractors.
- **Immutability Invariant**:
  - Prompt compilation and runtime execution are strictly prohibited from altering MCP tool activations.

### 3.5 Asynchronous SQL Telemetry & DB Resilience
- **Model `PromptExecutionLog`**:
  - High-performance analytical logging schema with indexes on `botId`, `createdAt`, and `model`.
  - Cascade deletion on bot removal (`onDelete: Cascade`).
- **Non-Blocking Ingestion (`recordPromptExecutionLogAsync`)**:
  - Synchronous `void` signature.
  - Fire-and-forget Promise execution with internal `.catch()` handling.
  - Defensive normalization and clamping of metrics (`cacheHitRatio` clamped to `[0, 1]`, tokens clamped to $\ge 0$).
  - Database downtime or latency spikes never interrupt or slow down bot execution turns.

### 3.6 Universal Secret Sanitizer (`sanitizeToolError`)
- **12 Sensitive Token Patterns Masked**:
  1. GitHub Personal Access Tokens (`ghp_[a-zA-Z0-9_]+` $\rightarrow$ `ghp_[redacted]`)
  2. GitHub Fine-Grained Tokens (`github_pat_[a-zA-Z0-9_]+` $\rightarrow$ `github_pat_[redacted]`)
  3. Notion Integration Secrets (`secret_[a-zA-Z0-9_]+` $\rightarrow$ `secret_[redacted]`, `ntn_[a-zA-Z0-9_]+` $\rightarrow$ `ntn_[redacted]`)
  4. Postiz API Keys (`pk_[a-zA-Z0-9_]+` $\rightarrow$ `pk_[redacted]`)
  5. Novamira API Keys (`nova_[a-zA-Z0-9_]+` $\rightarrow$ `nova_[redacted]`)
  6. n8n Webhook Keys (`n8n_api_[a-zA-Z0-9_]+` $\rightarrow$ `n8n_api_[redacted]`)
  7. Cloudflare Tokens (`cf_token_[a-zA-Z0-9_-]+` $\rightarrow$ `cf_token_[redacted]`, `cfat_[a-zA-Z0-9_-]+` $\rightarrow$ `cfat_[redacted]`)
  8. OpenRouter API Keys (`sk-or-[a-zA-Z0-9_\-]+` $\rightarrow$ `sk-or-[redacted]`)
  9. Anthropic API Keys (`sk-ant-[a-zA-Z0-9_\-]+` $\rightarrow$ `sk-ant-[redacted]`)
  10. OpenAI API Keys (`sk-[a-zA-Z0-9_\-]{20,}` $\rightarrow$ `sk-[redacted]`)
  11. PostgreSQL Connection URIs (`postgres(ql)?://user:pass@host` $\rightarrow$ `postgres://user:[redacted]@host`)
  12. HTTP Authorization Headers (`Bearer \S+`, `Basic \S+` $\rightarrow$ `[redacted]`)
- **Zero False Positives**: Preserves legitimate error messages, HTTP status codes, and domain names.

### 3.7 Upstream Synchronization Security Gate
- **Workflow `.github/workflows/sync-upstream.yml`**:
  - `concurrency: { group: sync-upstream, cancel-in-progress: false }` ensures atomic sync execution.
  - `BASE_SHA=$(git rev-parse HEAD)` snapshot before merge.
  - `pnpm install --frozen-lockfile` validates dependency lockfile integrity.
  - Chained CI security gate: `pnpm db:generate && pnpm exec turbo check --force && pnpm test`.
  - Atomic rollback: any failure invokes `git reset --hard "$BASE_SHA"`, isolates the conflict into `upstream-sync-conflict`, and opens an automated alert Pull Request.

### 3.8 Responsive WebUI & Multi-Screen Ergonomics
- **9 Breakpoints Fully Supported**:
  - Smartphones: 320px, 360px, 375px, 390px, 430px.
  - Tablets: 768px, 1024px.
  - Desktops & 4K: 1280px, 1440px+.
- **Touch Ergonomics & Apple HIG / WCAG 2.5.5 Compliance**:
  - Primary touch targets enforce `min-h-[44px]` and `min-w-[44px]`.
  - Safe area inset handling via `pb-[max(0.875rem,env(safe-area-inset-bottom))]`.
  - Font size `text-[16px]` on mobile inputs prevents unwanted iOS Safari viewport auto-zoom.
- **Before/After Split UX in `PromptCompilerModal.tsx`**:
  - Responsive 2-column split on desktop / stacked tabbed view on mobile.
  - Non-destructive rollback buffer preserves original draft.

---

## 4. Quality & Compliance Metrics

| Metric / Audit Target | Required Standard | Verified Result | Status |
|---|---|---|---|
| TypeScript Typecheck (19 packages) | 0 diagnostic errors | **0 errors** (`turbo check --force`) | ✅ PASS |
| Monorepo Test Suites | 100% passing ($\ge 1\,709$ tests) | **1 764 passed (155 test files)** | ✅ PASS |
| R1 AI Runtime & Subagent Suite | 100% passing | **123 / 123 tests passed** | ✅ PASS |
| R2 Upstream Gate & Workflow Suite | 100% passing | **17 / 17 tests passed** | ✅ PASS |
| R3 SQL Telemetry & MCP Security | 100% passing | **37 / 37 tests passed** | ✅ PASS |
| R4 Responsive WebUI & Composer | 100% passing | **323 / 323 tests passed** | ✅ PASS |
| R5 Monorepo QA Gate & Integrity | 100% passing | **29 / 29 tests passed** | ✅ PASS |
| Secret Sanitization Coverage | 12 token families | **0 secret leak, 0 false positives** | ✅ PASS |
| Subagent Depth Confinement | Depth = 1 strict | **100% recursion rejected** | ✅ PASS |
| MCP Immutability Invariant | Zero mutation | **100% configuration immutable** | ✅ PASS |

---

## 5. Production Deployment Architecture

- **Infrastructure**: Coolify PaaS on dedicated VPS instance (`https://agents.workspacegroupefloteuil.eu`).
- **Reverse Proxy**: Traefik with automatic SSL / Let's Encrypt certificate renewal.
- **Database**: PostgreSQL 16 with pooled connections and Prisma 7 client.
- **Container Sandboxes**: Rootless Docker / gVisor sandbox runtime supervised by `infra/sandboxes/supervisor`.
- **Observability**: Asynchronous SQL telemetry, structured JSON logs without secrets, OpenRouter KV cache hit rate telemetry.
