# TEST_INFRA — Rakazo Sovereign Skills System

## 1. Mission & Testing Philosophy

The Rakazo Sovereign Skills System E2E test infrastructure provides comprehensive, opaque-box, deterministic verification across all layers of the monorepo: Data Layer (`@rakazo/db`), Domain Contracts (`@rakazo/contracts`), Backend API (`@rakazo/api`), Runtime Adapters (`@rakazo/adapters`), and Frontend WebUI (`apps/web`).

### Core Principles
1. **Opaque-Box Verification**: Tests validate behavior against public interface contracts and observable outputs (HTTP responses, database states, prompt injection templates, tool call executions, DOM structures) rather than internal private variables.
2. **Authoritative Specification Derivation**: Every assertion directly derives from `ORIGINAL_REQUEST.md` (§R1–§R7) and `PROJECT.md` interface specifications.
3. **Strict Isolation & Idempotency**: Each test creates and cleans up its own fixtures without depending on execution ordering or shared mutable state.
4. **Adversarial & Defense-in-Depth Testing**: All entry points are tested against malicious payloads (ReDoS, XSS injections, token exhaustion attacks, 2MB size overflows, multi-tenant slug collisions).
5. **Progressive Monorepo Testability**: Self-contained test suites run with fast Vitest execution in CI and local dev without requiring an external PostgreSQL instance or cloud dependencies.

---

## 2. Feature Inventory Coverage Mapping

| Feature # | Feature Description | Primary Test Suite | Tier Coverage |
|:---:|---|---|:---:|
| **F1** | Prisma Schema (`Skill` & `BotSkill` models) | `packages/adapters/src/skills-e2e-suite.test.ts`, `apps/api/src/skills.test.ts` | Tier 1, 2, 3 |
| **F2** | PostgreSQL Migration `0012_skills` DDL | `packages/adapters/src/skills-e2e-suite.test.ts` | Tier 1, 3 |
| **F3** | Database Repository (`skills.ts`) | `apps/api/src/skills.test.ts`, `packages/adapters/src/skills-e2e-suite.test.ts` | Tier 1, 2, 3 |
| **F4** | Zod Schemas & Domain Contracts | `packages/contracts/src/skills.test.ts` | Tier 1, 2 |
| **F5** | Hybrid YAML/Markdown Parser & Sanitizer | `packages/contracts/src/skills.test.ts` | Tier 1, 2, 4 |
| **F6** | oRPC API Router & Fastify/Hono Handlers | `apps/api/src/skills.test.ts` | Tier 1, 2, 3 |
| **F7** | Taught Skills Backward Compatibility | `packages/contracts/src/skills.test.ts`, `apps/api/src/skills.test.ts` | Tier 1, 3 |
| **F8** | Skill Library Overlay WebUI Component | `apps/web/src/pages/SkillLibraryOverlay.test.tsx` | Tier 1, 2 |
| **F9** | Bot Form Skill Multi-Selector | `apps/web/src/pages/SkillLibraryOverlay.test.tsx` | Tier 1, 3 |
| **F10** | 100% French UI & Sidebar Navigation | `apps/web/src/pages/SkillLibraryOverlay.test.tsx` | Tier 1 |
| **F11** | `read_skill` Builtin Tool Definition & Schema | `packages/adapters/src/skills-runtime.test.ts` | Tier 1, 2 |
| **F12** | Hybrid Runtime Prompt Injection (<4KB Direct vs >=4KB Indexed) | `packages/adapters/src/skills-runtime.test.ts`, `packages/adapters/src/skills-e2e-suite.test.ts` | Tier 1, 2, 3, 4 |
| **F13** | Token Guardrails & Context Protection (32KB cumulative cap) | `packages/adapters/src/skills-runtime.test.ts`, `packages/adapters/src/skills-e2e-suite.test.ts` | Tier 1, 2 |
| **F14** | Cybersecurity, Guardrails & Secret Redaction | `packages/contracts/src/skills.test.ts`, `packages/adapters/src/skills-e2e-suite.test.ts` | Tier 2, 4 |
| **F15** | Upstream Modular Coexistence | `packages/contracts/src/skills.test.ts`, `apps/api/src/skills.test.ts` | Tier 1, 3 |
| **F16** | End-to-End Multi-Tier Integration | `packages/adapters/src/skills-e2e-suite.test.ts` | Tier 1, 2, 3, 4 |

---

## 3. 4-Tier Test Suite Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RAKAZO 4-TIER TEST ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 1: Feature Coverage (>=5 tests per feature, happy path & core logic)   │
│  - Markdown Parsing (5+)    - CRUD Endpoints (6+)   - Bot Assignment (5+)   │
│  - Hybrid Injection (5+)    - read_skill Tool (5+)  - WebUI Rendering (5+)  │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 2: Boundary & Corner Cases (Stress, limits, adversarial defense)      │
│  - 2MB Size Limit Bounds    - Empty / Malformed     - ReDoS Protection      │
│  - Duplicate Slug Suffixing - Accents / Unicode     - HTML/XSS Sanitization │
│  - Non-Existent Tool Query  - Cumulative Budget (32KB overflow clamping)   │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 3: Cross-Feature Combinations (End-to-End Lifecycles & Cascades)      │
│  - Upload -> DB Persist -> Bot Attach -> Prompt Compile -> Tool Execution    │
│  - Cascade Deletion: Bot deletion leaves Skill intact                       │
│  - Cascade Deletion: Skill deletion detaches cleanly from Bot               │
│  - Multi-Bot & Multi-Skill Hybrid Context Concurrency                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 4: Real-World Enterprise Scenarios (Production Skill Payloads)        │
│  - Docling Document Parser (RAG & PDF extraction, >4KB indexed execution)   │
│  - TypeScript Pro (Strict enterprise engineering, <4KB direct injection)    │
│  - HDS Healthcare Security (French RGPD/HDS rules, secret masking defense)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Tier Breakdown

### Tier 1: Feature Coverage
- **Markdown & Frontmatter Parsing**:
  - Valid YAML frontmatter with `name`, `description`, `tags`, `metadata`.
  - Fallback extraction of title from `# H1 Heading`.
  - Fallback extraction of description from first body paragraph.
  - Comma-separated or array tags extraction.
  - Preservation of markdown body formatting (code blocks, tables, lists).
- **CRUD Operations**:
  - `listSkills` with search filter and pagination.
  - `getSkill` by ID and by unique workspace slug.
  - `createSkill` with explicit fields.
  - `updateSkill` for individual or multiple properties.
  - `deleteSkill` removing skill and associated records.
- **Bot-Skill Association**:
  - Assign multiple skills to a single bot.
  - Retrieve all active skills for a bot.
  - Detach a skill from a bot.
  - Toggle `enabled` state of a bot skill.
  - Re-assignment / overwrite idempotency.
- **Hybrid Context Prompt Injection**:
  - Direct full markdown injection for skills < 4KB.
  - Index metadata summary injection for skills >= 4KB.
  - Structural heading formatting `## Compétences & Connaissances Spécialisées de l'Agent`.
  - Inclusion of tag lists and slug references.
  - Clean omission when bot has 0 assigned skills.
- **`read_skill` Builtin Tool**:
  - Registration in `builtinAgentTools` with JSON Schema.
  - TypeBox parameter schema definition in `pi-runtime.ts`.
  - Argument normalization from `name` or `skill`.
  - Fetching complete markdown content by slug or case-insensitive name.
  - Structured return format with `name`, `slug`, `description`, `tags`, `content`.
- **WebUI Rendering & Design Tokens**:
  - Skill Library modal layout conforming to `#141416` container and `#26262A` border tokens.
  - Drag & Drop upload zone with instant preview.
  - Tag filter pills (`Tous`, `Développement`, `Sécurité`, etc.).
  - Search input with client-side reactive filtering.
  - Visual badges `< 4 Ko : Direct` (Green) vs `>= 4 Ko : Indexé` (Blue).

### Tier 2: Boundary & Corner Cases
- **Content Size Boundary**: Validates 2,000,000 characters passes while 2,000,001 characters throws Zod validation error.
- **Empty / Whitespace-Only Payloads**: Enforces rejection of empty markdown strings.
- **Missing Frontmatter**: Verifies parser does not crash on raw markdown without `---` delimiters.
- **Duplicate Slug Resolution**: Deterministic suffixing (`docling-parser-2`, `docling-parser-3`) when collisions occur within the same workspace.
- **Internationalization & Accents**: Slugification normalizes accents (`Sécurité HDS Santé` -> `securite-hds-sante`).
- **ReDoS Mitigation**: Regex evaluation against 100,000-character adversarial nested strings completes in < 10ms.
- **XSS & HTML Sanitization**: Dangerous tags (`<script>`, `<iframe>`, `<object>`, `<embed>`, `javascript:`, `onerror=`) are stripped while markdown styling is preserved.
- **Non-Existent Tool Query**: `read_skill(name: "unknown-skill")` returns structured error payload `{ error: "Skill 'unknown-skill' not found in workspace." }` without crashing runtime.
- **Cumulative 32KB Budget Overflow**: When multiple <4KB skills collectively exceed 32KB, excess skills are automatically downgraded to indexed mode.

### Tier 3: Cross-Feature Combinations
- **Complete End-to-End Pipeline**: Upload `.md` -> Parse frontmatter -> Save to DB repo -> Assign to Bot -> Compile hybrid system prompt -> Agent executes `read_skill` tool -> Delete bot with cascade check.
- **Cascade Deletion Semantics**:
  - Deleting a `Bot` cascades to delete `BotSkill` records while leaving global `Skill` records intact.
  - Deleting a `Skill` cascades to remove it from all assigned bots without affecting the `Bot` records.
- **Multi-Tenant Isolation**: Two distinct workspaces cannot view, update, delete, or invoke skills belonging to each other.

### Tier 4: Real-World Enterprise Scenarios
- **Scenario A: Docling Document Parser Skill**:
  - Large comprehensive RAG & PDF extraction manual (>4KB).
  - Triggers indexed mode in executor, requiring agent to invoke `read_skill(name: "docling-document-parser")`.
- **Scenario B: TypeScript Pro Skill**:
  - Concise enterprise TypeScript guidelines (<4KB).
  - Triggers direct prompt injection mode with full markdown code fences in the system prompt.
- **Scenario C: Healthcare HDS Security Skill**:
  - French healthcare data security rules, AES-256 encryption guidelines, and secret masking compliance.
  - Validates French terminology, token redaction, and `sanitizeToolError` preservation.

---

## 4. Test File Placement & Organization

The test suites are organized across standard monorepo locations:

1. **Contracts & Parsing Suite**:
   - `packages/contracts/src/skills.test.ts`: Contracts, Zod schemas, YAML/Markdown parser, sanitization, slugification.
2. **API & Handlers Suite**:
   - `apps/api/src/skills.test.ts`: oRPC API handlers, CRUD, upload, bot assignments, tenant isolation, slug collisions.
3. **Pi-Runtime & Adapter Suite**:
   - `packages/adapters/src/skills-runtime.test.ts`: Builtin tools registration, `pi-runtime.ts` argument normalization, `executor.ts` hybrid injection, token budget clamping.
4. **WebUI Component Suite**:
   - `apps/web/src/pages/SkillLibraryOverlay.test.tsx`: SkillLibraryOverlay component rendering, token badges, tag filtering, search, Drag & Drop upload parsing.
5. **Comprehensive 4-Tier Integration Suite**:
   - `packages/adapters/src/skills-e2e-suite.test.ts`: Full-stack orchestration across all 4 tiers, real-world skill payloads, cascade deletions, and adversarial boundary checks.

---

## 5. How to Run the Tests

### Run the entire test suite across the monorepo:
```bash
pnpm test
```

### Run specific Skill System test suites:
```bash
# Run all Skills test files
pnpm exec vitest run skills

# Run Contracts & Parser tests
pnpm exec vitest run packages/contracts/src/skills.test.ts

# Run API & Backend Handler tests
pnpm exec vitest run apps/api/src/skills.test.ts

# Run Pi-Runtime & Hybrid Injection tests
pnpm exec vitest run packages/adapters/src/skills-runtime.test.ts

# Run WebUI Component tests
pnpm exec vitest run apps/web/src/pages/SkillLibraryOverlay.test.tsx

# Run Comprehensive 4-Tier E2E Integration Suite
pnpm exec vitest run packages/adapters/src/skills-e2e-suite.test.ts
```

### Watch mode for continuous development:
```bash
pnpm exec vitest watch skills
```
