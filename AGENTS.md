# Autonomous Operating & Architectural Constitution for Rakazo Agents

> **Authoritative Specification & Operating Guide for Human Contributors and Autonomous AI Agents**  
> **Repository**: `github.com/floteuil/rakazo` (branch `main`)  
> **Monorepo Engine**: Turborepo 2 + pnpm 9 workspaces (19 packages)  
> **Runtime**: Pi Autonomous Agent Runtime + Free Intelligence Gateway (OmniRoute) + Node.js 22  

---

## 1. Repository Identity & Security Mandate

Rakazo is a public, open-source sovereign autonomous AI agent platform. All contributors and autonomous agents operating in this repository must adhere to the **Zero-Secret Guarantee**:

1. **Public Repository Assumption**: Every commit, branch, pull request, diff, and issue is considered public. Never commit real credentials, production connection strings, API tokens, customer identifiers, or private keys.
2. **Deterministic Placeholders**: Always use designated development placeholders (e.g., `dev-secret-change-me-please-32chars`, `sk-or-v1-mock-key`, `sk-omniroute-local-key`) in tests and documentation.
3. **Pre-Commit Verification**: Always inspect `git status` and staged diffs before committing. Never force-add files ignored by `.gitignore` (such as `.env`, `data/`, `*.local`, `dist/`).
4. **Immediate Alert Protocol**: If sensitive production data is accidentally committed or encountered, halt operations immediately and alert the repository maintainer.

---

## 2. The 6 Core Architectural Pillars

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           THE 6 CORE RAKAZO PILLARS                               │
├───────────────────────────────┬───────────────────────────────────────────────────┤
│ 1. Additive & Non-Breaking    │ Monorepo integrity, isolated customization,       │
│    Evolution                  │ dual-path inference, backward compatibility.      │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 2. Sovereign MCP & Free       │ Read-only adapters, sandbox isolation, double     │
│    Intelligence Double Barrier│ zero-cost barrier, fail-closed never-paid fallback│
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 3. Strict Zero-Secret Masking │ Centralized regex redaction, sanitizeToolError,   │
│    & Sanitization             │ runtime secret guards, dev vs prod separation.    │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 4. 19-Package Monorepo        │ Strict package boundaries, workspace:* protocol,  │
│    Topology Map               │ unidirectional layering, zero circular imports.   │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 5. Bot Deletion Cascade       │ Atomic database cascade (Prisma onDelete: Cascade)│
│    Invariants                 │ + physical disk & sandbox container teardown.     │
├───────────────────────────────┼───────────────────────────────────────────────────┤
│ 6. Verification & Quality     │ 0 TS errors (pnpm check), 100% tests (pnpm test), │
│    Gates                      │ CI sync-upstream gating, active PR tracking.      │
└───────────────────────────────┴───────────────────────────────────────────────────┘
```

---

### Pillar 1: Additive & Non-Breaking Evolution

To ensure seamless continuous synchronization with the upstream repository (`elie222/rakazo`), all Rakazo enhancements must strictly follow the **Additive Isolation Pattern**:

- **Upstream Baseline Preservation**: Upstream files are treated as upstream baseline. Never modify core upstream logic destructively.
- **Isolated Customization Directories**: All custom enterprise connectors, prompt compilers, prefix caching optimizers, free intelligence gateways, and UI components reside in dedicated additive files and folders:
  - Custom adapters and runtime services: `packages/adapters/src/` (e.g., `omniroute-adapter.ts`, `free-policy-engine.ts`, `enterprise-tools.ts`, `prompt-compiler.ts`, `pi-runtime.ts`).
  - Shared contracts and Zod schemas: `packages/contracts/src/` (e.g., `domain.ts`, `prompt-compiler.ts`, `mcp-catalog.ts`).
  - Database schema & migrations: `packages/db/prisma/schema.prisma` and additive migrations in `packages/db/prisma/migrations/` (e.g. `0015_free_intelligence_gateway/`).
  - Frontend extensions: `apps/web/src/pages/` and `packages/chat-ui/src/`.
- **Dual-Path Inference Compatibility**:
  - `BotInferenceConfig.mode` defaults to `"premium"`. Existing bots continue executing on `openai/gpt-oss-120b` via OpenRouter with zero configuration migration required.
  - Adding `"free"` mode routes requests through `FreeOmniRouteAdapter` using open-weights models (`meta-llama`, `qwen`, `deepseek`, `mistralai`, `google`).
- **Inter-Package Import Rules**: All cross-package imports must use standard workspace specifiers (`@rakazo/contracts`, `@rakazo/adapters`, `@rakazo/db`, `@rakazo/core`, etc.) governed by `pnpm-workspace.yaml`. Direct relative traversals across package boundaries (e.g., `../../packages/contracts/src/...`) are strictly forbidden.
- **Forward-Compatible Schema Migrations**: All PostgreSQL database schema changes must be forward-compatible. Never drop or rename columns destructively in a single release.

---

### Pillar 2: Sovereign MCP Least Privilege & Free Intelligence Double Barrier

Rakazo provides in-cluster, sovereign Model Context Protocol (MCP) tool adapters and a **strictly free inference gateway** with absolute zero-cost enforcement:

1. **Minimal Privilege by Default**:
   - Newly created bots are granted access **only** to essential search and extraction tools: `web_search` (SearXNG) and `web_scrape` (Scraperr).
   - Heavy enterprise integrations (GitHub, Notion, Postiz, WordPress, Novamira, n8n, Cloudflare, Composio) are strictly **opt-in** and must be explicitly configured per bot via `bot.metadata.mcp.tools[connectorId]`.
2. **Double Barrier Zero-Cost Architecture ($0.0000)**:
   - **Barrier 1 (Local Policy Engine - `RakazoFreePolicyEngine`)**: Pre-dispatch check enforcing approved provider allowlist (`meta-llama`, `mistralai`, `qwen`, `deepseek`, `google`), model `:free` suffix, and price verification ($0.000000). Commercial or positive-cost routes are rejected immediately.
   - **Barrier 2 (Adapter Response Verification - `FreeOmniRouteAdapter`)**: Real-time inspection of HTTP response headers (`x-omniroute-cost`) and streaming SSE chunks. If cost > $0.00 is detected, the stream is aborted immediately.
3. **Strict Fail-Closed (Never-Paid Fallback)**:
   - If free capacity is exhausted, rate-limited, or unavailable, execution terminates with the sanitized message `"Capacité gratuite temporairement indisponible"`.
   - Free bots **NEVER** fall back to paid OpenRouter or commercial routes under any circumstances.
4. **Subagent Confinement & Inference Mode Inheritance**:
   - Subagents inherit the parent bot's inference mode (`parent === "free"` → `subagent === "free"`). Privilege escalation attempts to `"premium"` are vetoed.
   - Subagent nesting is strictly capped at **Depth 1** (`host.depth <= 1`). Subagents cannot spawn further subagents.
   - Delegation tools (`run_subagent`, `spawn_bot`, `archive_bot`, `delete_bot`) are stripped from child tool catalogs.
   - Subagent prompt tokens are capped at **8,192 tokens**.
   - Anti-loop circuit breaker terminates turns after 3 redundant consecutive tool calls or 25 tool iteration steps.
5. **Prompt Compilation MCP Immutability Invariant**:
   - Prompt compilers (`compilePromptLevel1Deterministic` and Level 2 OpenRouter) are formatters and optimizers. They are strictly prohibited from mutating, adding, or removing MCP tool configurations.
   - Enforced programmatically via `verifyMcpImmutabilityAtContractLevel` in `@rakazo/contracts`.

---

### Pillar 3: Strict Zero-Secret Masking & Sanitization

To protect users against accidental token leaks in logs, telemetry, or user interfaces, all tool errors and outgoing outputs pass through a centralized redaction layer:

1. **Centralized Sanitization Pipeline (`sanitizeToolError`)**:
   All error messages, tool outputs, and LLM payloads are processed with automated regex sanitization in `packages/adapters/src/enterprise-tools.ts`:
   - GitHub Personal Access Tokens: `ghp_[a-zA-Z0-9_]+` → `ghp_[redacted]`, `github_pat_[a-zA-Z0-9_]+` → `github_pat_[redacted]`.
   - Notion API Keys: `secret_[a-zA-Z0-9_]+` → `secret_[redacted]`, `ntn_[a-zA-Z0-9_]+` → `ntn_[redacted]`.
   - Postiz API Keys: `pk_[a-zA-Z0-9_]+` → `pk_[redacted]`.
   - Novamira API Keys: `nova_[a-zA-Z0-9_]+` → `nova_[redacted]`.
   - n8n API Keys: `n8n_api_[a-zA-Z0-9_]+` → `n8n_api_[redacted]`.
   - Cloudflare Tokens: `cf_token_[a-zA-Z0-9_-]+` → `cf_token_[redacted]`, `cfat_[a-zA-Z0-9_-]+` → `cfat_[redacted]`.
   - OpenRouter / Anthropic / OpenAI Keys: `sk-or-*`, `sk-ant-*`, `sk-*` → `sk-[redacted]`.
   - OmniRoute Gateway Keys: `sk-omniroute-*` → `sk-[redacted]`.
   - Database Connection Strings: `postgres(ql)?://user:password@host` → `postgres://user:[redacted]@host`.
   - Authorization Headers: `Bearer [token]`, `Basic [token]` → `Bearer [redacted]`, `Basic [redacted]`.
2. **Runtime Secrets Guard (`@rakazo/core/secrets-guard.ts`)**:
   - `isDevSecretAllowed()` permits fallback placeholders during `development` and `test` environments.
   - In `production`, any occurrence of default placeholders (`dev-secret-change-me-please-32chars`) immediately throws a fast-fail startup exception.

---

### Pillar 4: 19-Package Monorepo Topology Map

The Rakazo repository is structured into 19 discrete packages orchestrated by **Turborepo 2** and **pnpm workspaces**:

```
                                ┌───────────────────────────┐
                                │       rakazo (root)       │
                                └─────────────┬─────────────┘
                                              │
              ┌───────────────────────────────┴──────────────────────────────┐
              │                                                              │
     ┌────────▼────────┐                                            ┌────────▼────────┐
     │  APPLICATIONS   │                                            │ SHARED PACKAGES │
     ├─────────────────┤                                            ├─────────────────┤
     │ apps/api        │ (Fastify/Hono Backend REST & RPC)          │ @rakazo/adapter-kit
     │ apps/desktop    │ (Electron Desktop App)                     │ @rakazo/adapters│
     │ apps/mobile     │ (React Native / Expo Mobile App)           │ @rakazo/auth    │
     │ apps/web        │ (React 18 + Tailwind v4 Web App)           │ @rakazo/chat-ui │
     │ apps/worker     │ (BullMQ Background Worker & Scheduler)     │ @rakazo/contracts
     │ apps/www        │ (Astro Marketing & Docs Portal)            │ @rakazo/core    │
     └─────────────────┘                                            │ @rakazo/db      │
              │                                                     │ @rakazo/memory  │
              │                   ┌───────────────────────────┐     │ @rakazo/testkit │
              └──────────────────►│       INFRASTRUCTURE      │◄────│ @rakazo/ui-tokens
                                  ├───────────────────────────┤     │ @rakazo/ui-web  │
                                  │ infra/sandboxes/supervisor│     └─────────────────┘
                                  └───────────────────────────┘
```

#### Monorepo Directory & Role Registry

| # | Package Name | Workspace Path | Role & Responsibilities |
|---|--------------|----------------|--------------------------|
| 1 | `rakazo` | Root (`/`) | Root workspace orchestration, `turbo.json`, `pnpm-workspace.yaml`, Biome config. |
| 2 | `@rakazo/api` | `apps/api` | Fastify & Hono HTTP backend, tRPC endpoints, auth routes, SSE message streaming. |
| 3 | `@rakazo/desktop` | `apps/desktop` | Electron desktop wrapper hosting the web UI with native window controls. |
| 4 | `@rakazo/mobile` | `apps/mobile` | React Native & Expo cross-platform iOS/Android mobile client. |
| 5 | `@rakazo/web` | `apps/web` | Primary React 18 Web UI, chat threads, intelligence selectors, tag chips, responsive drawer. |
| 6 | `@rakazo/worker` | `apps/worker` | Background task worker, Graphile / BullMQ job runner, routine scheduler. |
| 7 | `@rakazo/www` | `apps/www` | Astro-powered public landing page, technical documentation, and release notes. |
| 8 | `@rakazo/adapter-kit` | `packages/adapter-kit` | Abstract interfaces for agent adapters, sandbox providers, and storage stores. |
| 9 | `@rakazo/adapters` | `packages/adapters` | `FreeOmniRouteAdapter`, `RakazoFreePolicyEngine`, Pi runtime, prompt compilers (L1 & L2), 4-block cache assembler, sovereign MCP connectors. |
| 10 | `@rakazo/auth` | `packages/auth` | BetterAuth authentication integration, session tokens, user verification. |
| 11 | `@rakazo/chat-ui` | `packages/chat-ui` | Markdown renderers, streaming message blocks, agent status badges, copy tools. |
| 12 | `@rakazo/contracts` | `packages/contracts` | Canonical Zod schemas (`InferenceModeSchema`, `BotInferenceConfigSchema`), TypeScript types, RPC interfaces, MCP tool catalogs. |
| 13 | `@rakazo/core` | `packages/core` | Domain business logic, secrets guards, cron parsers, audio/speech processing. |
| 14 | `@rakazo/db` | `packages/db` | Prisma 7 ORM client, database migrations (`0015_free_intelligence_gateway`), SQL telemetry models (`PromptExecutionLog`). |
| 15 | `@rakazo/memory` | `packages/memory` | Supermemory client, vector indexing, working memory retrieval, and document store. |
| 16 | `@rakazo/testkit` | `packages/testkit` | E2E test harness, Testcontainers PostgreSQL, Playwright helpers, mock factories. |
| 17 | `@rakazo/ui-tokens` | `packages/ui-tokens` | Design tokens, color palettes, spacing primitives, CSS variable bindings. |
| 18 | `@rakazo/ui-web` | `packages/ui-web` | Headless & styled Web UI components (Radix primitives, modals, dropdowns, inputs). |
| 19 | `@rakazo/sandbox-supervisor` | `infra/sandboxes/supervisor` | Docker container manager, desktop screen lease allocator, execution sandbox runner. |

#### Layering & Dependency Rules
- **Leaf Packages**: `@rakazo/contracts`, `@rakazo/ui-tokens`, and `@rakazo/adapter-kit` must have zero internal package dependencies.
- **Core Domain**: `@rakazo/db` and `@rakazo/auth` depend only on `@rakazo/contracts`.
- **Runtime Layer**: `@rakazo/adapters` depends on `@rakazo/contracts`, `@rakazo/adapter-kit`, and `@rakazo/db`.
- **Application Layer**: `apps/*` consume `packages/*` via `workspace:*` dependencies. Applications must never import from other applications.

---

### Pillar 5: Bot Deletion Cascade Invariants

When a bot is archived or deleted (implemented in `destroyBot` / `child-bots.ts`), the platform enforces a strict **Two-Phase Complete Lifecycle Termination**:

1. **Phase 1: Atomic Database Cascade**:
   - Utilizing PostgreSQL relational integrity and Prisma `onDelete: Cascade` constraints in `schema.prisma`:
     - All related `threads`, `messages`, `events`, `tasks`, `runs`, `attempts`, and `external_effects` are deleted automatically.
     - Scheduled `routines`, `taught_skills`, `bot_skills`, `agent_homes`, `browser_profiles`, `artifacts`, and `computer_execution_leases` are purged.
     - Telemetry records (`PromptExecutionLog` containing `inference_mode`, `is_free`, `requested_category`) are disassociated via `onDelete: SetNull` or purged to preserve aggregate analytics without orphaned references.
     - An immutable audit row is recorded in `bot_deletions` storing `deletedByUserId`, `workspaceId`, and `memoriesPreserved` flag.
     - If memory preservation is requested (`!options.deleteMemories`), memory documents are retargeted to user scope under `Archived bots/<botName> (<botId>)`.
2. **Phase 2: Physical Storage & Sandbox Container Teardown**:
   - Active sandbox container runs are halted immediately (`deps.jobs.cancel(runJobKey(run.id))`).
   - The dedicated container is destroyed via `deps.sandbox.destroy(...)`.
   - Shared screen leases are released (`releaseTeamComputerScreen`).
   - Filesystem directories on disk are recursively purged:
     - `/data/homes/<botId>` (and `/data/agent-home/<botId>`)
     - `/data/home-revisions/<botId>.txt`
     - `/data/desktop-computers/<botId>`
     - Artifact files in `ArtifactStore` are deleted.

---

### Pillar 6: Verification & Quality Gates

Quality is enforced through automated static analysis, type checking, test execution, and CI/CD gating:

#### 1. Canonical Verification Commands

| Action | Command | Gate Requirement |
|---|---|---|
| **Type Check All Packages** | `pnpm check`<br>`pnpm exec turbo check --force` | **0 errors, 0 warnings** across all 19 packages. |
| **Run All Test Suites** | `pnpm test`<br>`vitest run` | **100% test pass rate** (currently **2,266+ tests passing**, 0 failures). |
| **OmniRoute 5-Tier E2E Suite** | `npx tsx test/e2e/verify-e2e.ts` | **100% pass rate (136/136 tests across Tiers 1–5)**. |
| **Contracts & Unit Tests** | `pnpm vitest run packages/contracts/src/omniroute-contracts.test.ts packages/adapters/src/omniroute-adapter.test.ts` | **100% pass rate (67/67 tests)**. |
| **Prisma Client Generation** | `pnpm db:generate` | Prisma client generated in `packages/db/src/generated/prisma`. |
| **Database Migrations** | `pnpm db:migrate` | Migrations applied cleanly to target PostgreSQL database. |
| **Linting & Code Style** | `pnpm lint` | Biome static analysis with 0 errors. |
| **Automated Formatting** | `pnpm format` | Biome code formatting writeback. |
| **Integration Test Harness** | `pnpm test:integration` | Testcontainers PostgreSQL integration test suite. |
| **WebUI E2E Test Suite** | `pnpm test:e2e` | Playwright browser end-to-end tests. |
| **Topology & Boundary Tests** | `pnpm test:topology` | Monorepo package boundary and circular dependency check. |
| **Canary Health Check** | `pnpm test:canary` | Fast smoke test for critical runtime paths. |
| **Computer Sandbox Tests** | `pnpm test:computer` | Sandbox supervisor and container execution tests. |
| **Desktop Performance Tests**| `pnpm perf:desktop` | Electron / Web rendering benchmark tests. |

#### 2. CI/CD Upstream Sync Gate (`.github/workflows/sync-upstream.yml`)
- Scheduled cron and dispatch workflow fetches upstream updates from `elie222/rakazo`.
- Mandatory test step: `pnpm exec turbo check --force && pnpm test`.
- **Zero-Regression Gate**: If TypeScript compilation or any Vitest suite fails after merge, the merge is **immediately aborted** (`git merge --abort`), and an alert Pull Request is automatically generated against the branch `upstream-sync-conflict`. No broken code is ever pushed to `origin main`.

#### 3. Pull Request & Review Discipline
- Autonomous agents and contributors must follow through on opened PRs until all automated CI checks and review bots have completed.
- Address all actionable feedback, re-run verification commands, and push fixes until CI passes with zero warnings.

---

## 3. Reference Documentation & Guides

For deeper implementation details, consult the canonical documentation in the root and `docs/`:
- [`RAKAZO_MASTER_BLUEPRINT_CURRENT.md`](RAKAZO_MASTER_BLUEPRINT_CURRENT.md): Master architectural specification & platform blueprint.
- [`RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COOLIFY_DEPLOYMENT.md`](RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COOLIFY_DEPLOYMENT.md): Architectural handoff for OmniRoute Coolify deployment & Rakazo connection (Milestones M1–M5).
- [`docs/OMNIROUTE_DEPLOYMENT.md`](docs/OMNIROUTE_DEPLOYMENT.md): Authoritative production runbook for OmniRoute on Coolify PaaS (App 21).
- [`TEST_READY.md`](TEST_READY.md): 5-tier test matrix and E2E verification evidence.
- [`docs/ENVIRONMENT_SETUP.md`](docs/ENVIRONMENT_SETUP.md): Comprehensive 54+ environment variable catalog and developer onboarding guide.
- [`docs/computer-runtime.md`](docs/computer-runtime.md): Architecture of computer sandboxes, supervisor protocols, and screen leases.
- [`docs/self-host.md`](docs/self-host.md): Guide for production self-hosting with Docker Compose and Coolify PaaS.
- [`docs/performance.md`](docs/performance.md): Latency, prefix caching, and token optimization benchmarks.

