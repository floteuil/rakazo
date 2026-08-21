# Project: Rakazo Sovereign Skills System & Web Tools Platform

## Architecture
Rakazo is an enterprise full-stack multi-agent platform orchestrated via Turborepo (`pnpm@9.15.0`), TypeScript NodeNext, Hono (`hono` ^4.9.6), oRPC (`@orpc/server` ^1.15.0), Prisma PostgreSQL (`@rakazo/db`), and React + Tailwind CSS (`apps/web`).

### 1. Data Layer (`packages/db`)
- **`Skill` Model**: Global workspace-scoped library of markdown skills (`id`, `workspaceId`, `userId`, `name`, `slug`, `description`, `content`, `tags`, `metadata`, `createdAt`, `updatedAt`).
- **`BotSkill` Model**: Explicit Many-to-Many join table linking `Bot` and `Skill` with `enabled` toggle, foreign key cascades (`onDelete: Cascade`), and composite indexes (`@@unique([botId, skillId])`, `@@index([workspaceId, botId])`, `@@index([skillId])`).
- **PostgreSQL Migration**: `packages/db/prisma/migrations/0012_skills/migration.sql` with non-destructive, additive DDL.
- **Repository Abstraction**: `packages/db/src/skills.ts` exporting `createSkillRepos` for clean CRUD and transaction-safe bot assignments.

### 2. Contracts & Backend API Layer (`packages/contracts`, `apps/api`)
- **Zod Schemas**: `packages/contracts/src/domain.ts` defining `SkillSchema`, `SkillSummarySchema`, `BotSkillAssignmentSchema`, and input schemas with strict size caps (max 2MB content) and slug validation.
- **oRPC Router**: `packages/contracts/src/rpc.ts` exposing `skills` router (`list`, `get`, `create`, `update`, `delete`, `uploadMarkdown`, `assignToBot`, `getBotSkills`), preserving `taughtSkills` namespace for backward compatibility with desktop GUI recording sessions.
- **Hybrid YAML/Markdown Parser**: `packages/contracts/src/skill-parser.ts` using `yaml` v2.x for parsing YAML frontmatter with automatic extraction fallback from `# Title` H1 and first paragraph, slugification, XSS tag sanitization, and 2MB file limit.
- **API Handlers**: `apps/api/src/skills.ts` and `apps/api/src/router.ts` implementing endpoints with tenant isolation (`scoped(actor, record)`), multi-tenant slug collision resolution, and concurrency safety.

### 3. Frontend WebUI Layer (`apps/web`)
- **`SkillLibraryOverlay.tsx`**: Sovereign Skill Library modal conforming to Rakazo dark design tokens (`#141416` container, `#26262A` borders, Geist typography), Drag & Drop `.md` file upload with instant preview, tag filter pills, search input, card catalog with `< 4 Ko : Direct` (green) vs `>= 4 Ko : Indexé` (blue) indicators, split Markdown editor with live preview (`ChatMarkdown`), delete confirmation modal, 100% French UI.
- **Bot Form Multi-Badge Selector**: Interactive chips and checkboxes in `CreateBotForm` and `BotSettings` (`Shell.tsx`) to attach/detach skills with cumulative token/size indicators.
- **Sidebar Integration**: Sparkles icon button in `Shell.tsx` for quick access to the Skill Library.

### 4. Pi-Runtime Hybrid Injection & Token Guardrails (`packages/adapters`)
- **`read_skill` Builtin Tool**: Registered in `builtinAgentTools` (`builtin-tools.ts`), typed in `pi-runtime.ts` (`parametersFor`, `prepareArguments`), added to `READ_ONLY_AGENT_TOOLS`, and dispatched in `executor.ts` (`applyTool`) to query `prisma.skill`.
- **Hybrid Context Injection**: In `executor.ts`, active bot skills are evaluated:
  - Skills < 4KB (and cumulative direct budget <= 32KB): Injected with full markdown content into the system prompt under `## Compétences & Connaissances Spécialisées de l'Agent`.
  - Skills >= 4KB (or exceeding cumulative budget): Injected as condensed metadata index with directive to invoke `read_skill(name: "<slug>")` on demand.
- **Token Guardrails**: Protects OpenRouter context window (`openai/gpt-oss-120b`) from context exhaustion while guaranteeing deep domain knowledge retrieval.

### 5. Cybersecurity & Coexistence
- Strict 2MB file upload limit, HTML tag stripping (anti-XSS), secret masking preservation (`sanitizeToolError`, `createStreamingRedactor`), isolated modules, and upstream sync compatibility (`sync-upstream.yml`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|:------:|
| 1 | Prisma Schema (`Skill` & `BotSkill`) | Add `Skill` and `BotSkill` models with foreign keys, cascades, indexes, and unique slug constraint | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | PostgreSQL Migration `0012_skills` | Additive, non-destructive SQL migration DDL for `skills` and `bot_skills` tables | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 3 | Database Repository (`skills.ts`) | Data access helpers for CRUD, slug lookup, and transaction-safe bot skill assignments | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 4 | Zod Schemas & Domain Contracts | Type-safe Zod contracts with 2MB limits, slug validation, and summary schemas | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 5 | Hybrid YAML/Markdown Parser & Sanitizer | Smart frontmatter parsing, H1/paragraph fallback, slugification, XSS tag sanitization | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 6 | oRPC API Router & Fastify/Hono Handlers | CRUD endpoints (`list`, `get`, `create`, `update`, `delete`, `uploadMarkdown`, `assignToBot`, `getBotSkills`) with tenant isolation | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 7 | Taught Skills Backward Compatibility | Segregate legacy GUI macros to preserve `TeachComputerSection.tsx` without route collision | M2 | Survey Explorer 2 | DONE |
| 8 | Skill Library Overlay Component | Dark theme modal with Drag & Drop `.md` upload, search filters, card catalog, editor & preview | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 9 | Bot Form Skill Multi-Selector | Multi-badge / checkbox selector in `CreateBotForm` and `BotSettings` with direct/indexed badges | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 10 | 100% French UI & Sidebar Integration | Sparkles button in sidebar, French copy across all skill library dialogs and messages | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 11 | `read_skill` Builtin Tool Definition | Tool definition in `builtin-tools.ts`, schema in `pi-runtime.ts`, query handler in `executor.ts` | M4 | ORIGINAL_REQUEST §R4 | DONE |
| 12 | Hybrid Runtime Prompt Injection | Direct prompt injection (<4KB & <=32KB budget) vs condensed index (>=4KB) in `executor.ts` | M4 | ORIGINAL_REQUEST §R4 | DONE |
| 13 | Token Guardrails & Context Protection | Enforce token budgets for OpenRouter `openai/gpt-oss-120b` and prevent prompt bloating | M4 | ORIGINAL_REQUEST §R4 | DONE |
| 14 | Cybersecurity, Guardrails & Secret Redaction | 2MB upload limit, ReDoS protection, secret masking preservation (`sanitizeToolError`) | M5 | ORIGINAL_REQUEST §R5 | DONE |
| 15 | Upstream Modular Coexistence | Clean file isolation, non-breaking schema/contracts, conflict-free sync with upstream | M5 | ORIGINAL_REQUEST §R6 | DONE |
| 16 | E2E Testing Suite (Tiers 1-4) | Comprehensive opaque-box test suite for schema, API, parser, runtime, and WebUI | E2E Track | ORIGINAL_REQUEST §R7 | DONE |
| 17 | Adversarial Hardening (Tier 5) | White-box stress testing, boundary values, prompt injection fuzzing, token leak checks | M6 | Project Pattern Phase 2 | DONE |
| 18 | Final Monorepo Verification & Documentation | `pnpm check` (0 errors), `pnpm test` (100%), `pnpm build`, update documentation | M6 | ORIGINAL_REQUEST §Acceptance Criteria | DONE |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|:------:|
| E2E | E2E Testing Suite Track | Design `TEST_INFRA.md` and implement 4-Tier test suite (`TEST_READY.md`) | none | DONE |
| M1 | Prisma Data Model & PostgreSQL Migration | `schema.prisma`, `0012_skills/migration.sql`, `packages/db/src/skills.ts`, DB tests | none | DONE |
| M2 | oRPC API Contracts, Parser & Backend Handlers | `domain.ts`, `rpc.ts`, `skill-parser.ts`, `apps/api/src/skills.ts`, API tests | M1 | DONE |
| M3 | Modern React + Tailwind WebUI & Selectors | `SkillLibraryOverlay.tsx`, `Shell.tsx` bot form selectors, sidebar button | M2 | DONE |
| M4 | Pi-Runtime Hybrid Injection & `read_skill` Tool | `builtin-tools.ts`, `pi-runtime.ts`, `executor.ts`, hybrid injection logic | M1, M2 | DONE |
| M5 | Cybersecurity, Guardrails & Upstream Isolation | 2MB limits, XSS sanitization, secret masking, upstream sync compatibility | M2, M3, M4 | DONE |
| M6 | Final E2E Pass, Adversarial Hardening & Build | 100% pass on Tiers 1-4, Tier 5 Adversarial hardening, `pnpm check`, `pnpm build`, docs | E2E, M5 | DONE |

---

## Interface Contracts

### 1. `Skill` Contract
- **Input (Create)**: `{ name: string, slug?: string, description?: string, content: string, tags?: string[], metadata?: Record<string, unknown> }`
- **Output**: `{ id: string, workspaceId: string, name: string, slug: string, description: string, content: string, tags: string[], metadata: Record<string, unknown>, createdAt: string, updatedAt: string }`

### 2. `UploadSkillMarkdown` Contract
- **Input**: `{ filename?: string, content: string, overwrite?: boolean }` (Max 2MB)
- **Output**: Full `Skill` record with parsed frontmatter / extracted fallback fields.

### 3. `AssignSkillsToBot` Contract
- **Input**: `{ botId: string, skillIds: string[] }`
- **Output**: `{ ok: true, count: number }`

### 4. `read_skill` Tool Interface
- **Input**: `{ name: string }` (slug or exact name)
- **Output**: `{ name: string, slug: string, description: string, tags: string[], content: string }` or `{ error: string }`

---

## Code Layout
- `packages/db/prisma/schema.prisma`: Prisma models for `Skill` and `BotSkill`.
- `packages/db/prisma/migrations/0012_skills/migration.sql`: PostgreSQL additive migration DDL.
- `packages/db/src/skills.ts`: Database repository functions.
- `packages/contracts/src/domain.ts`: Zod domain schemas and types.
- `packages/contracts/src/rpc.ts`: oRPC router definitions.
- `packages/contracts/src/skill-parser.ts`: Hybrid YAML/Markdown parser & sanitizer.
- `apps/api/src/skills.ts`: Backend API service handlers.
- `apps/api/src/router.ts`: oRPC handler registration.
- `apps/web/src/pages/SkillLibraryOverlay.tsx`: React + Tailwind Skill Library modal.
- `apps/web/src/pages/Shell.tsx`: Sidebar button, `CreateBotForm`, and `BotSettings` integration.
- `packages/adapters/src/builtin-tools.ts`: `read_skill` tool definition.
- `packages/adapters/src/pi-runtime.ts`: TypeBox schema and argument normalization for `read_skill`.
- `packages/adapters/src/executor.ts`: Hybrid prompt injection logic and `read_skill` execution.
- `tests/`: Comprehensive unit, integration, and E2E test suites across all packages.
