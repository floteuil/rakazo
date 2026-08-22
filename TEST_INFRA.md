# TEST_INFRA — Rakazo WebUI Mobile-First & Sovereign Enterprise MCP Connectors

## 1. Mission & Testing Philosophy

The Rakazo WebUI Mobile-First and Sovereign Enterprise MCP Connectors test infrastructure provides rigorous, opaque-box, deterministic verification across all layers of the monorepo: Web Application UI (`apps/web`), Fastify/oRPC API (`apps/api`), Domain Contracts & MCP Catalog (`packages/contracts`), Database Layer (`packages/db`), and Pi-Runtime Adapters (`packages/adapters`).

### Core Principles
1. **Opaque-Box Verification**: Tests validate behavior against public interface contracts, observable DOM trees, HTTP responses, database states, and tool call executions rather than implementation internals.
2. **Authoritative Specification Derivation**: Every test case directly traces back to requirements defined in `ORIGINAL_REQUEST.md` (§R1–§R5) and `PROJECT.md` interface contracts.
3. **Strict Isolation & Idempotency**: Each test case sets up its own fixtures and mocks, does not depend on test execution order, and operates without shared mutable state.
4. **Mobile & Ergonomic Fidelity**: Validates mobile UX constraints including iOS Safari zoom prevention (font size >= 16px), safe-area insets (`env(safe-area-inset-bottom)`), touch targets (>= 40–44px), off-canvas drawer navigation, and modal responsiveness while guaranteeing desktop high-fidelity preservation (316px docked sidebar, 1080px dialogs).
5. **Least-Privilege Sovereign Tool Security**: Verifies that enterprise tools (SearXNG, Scraperr, GitHub, Notion, Postiz, WordPress/Novamira, n8n, Cloudflare, Système) are strictly filtered per agent, subagents inherit parent tool restrictions, and sensitive tokens are systematically scrubbed.
6. **Progressive Monorepo Testability**: Self-contained test suites run with ultra-fast Vitest execution in CI and local development.

---

## 2. Feature Inventory Coverage Mapping

| Feature # | Feature Name | Primary Test Suite | Tier Coverage |
|:---:|---|---|:---:|
| **F1** | Mobile Drawer Navigation | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3, 4 |
| **F2** | Mobile Header & Hamburger | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3 |
| **F3** | iOS Safari Auto-Zoom Prevention | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2 |
| **F4** | Mobile Touch Ergonomics | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2 |
| **F5** | Safe-Area Inset Handling | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2 |
| **F6** | Adaptive Overlays & Modals | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3, 4 |
| **F7** | Desktop High-Fidelity UI | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2 |
| **F8** | Sovereign MCP Catalog Matrix | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx`, `packages/contracts/src/mcp-catalog.ts` | Tier 1, 2, 4 |
| **F9** | Plugins & Integrations Showcase | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx`, `apps/web/src/pages/PluginsOverlay.tsx` | Tier 1, 2, 3, 4 |
| **F10** | MCP Connector Detail Inspector | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 4 |
| **F11** | Hybrid Agent Tool Selector UI | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3, 4 |
| **F12** | Per-Agent Tool Permissions DB Persistence | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3 |
| **F13** | Dynamic Runtime Tool Filtering | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx`, `packages/adapters/src/enterprise-tools.ts` | Tier 1, 2, 3, 4 |
| **F14** | Subagent Permission Inheritance | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3, 4 |
| **F15** | Multi-Layer Security Sanitization | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx`, `packages/adapters/src/enterprise-tools.ts` | Tier 1, 2, 4 |
| **F16** | Monorepo CI/CD Validation | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 3 |
| **F17** | Adversarial Coverage Hardening | `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx` | Tier 1, 2, 3, 4 |

---

## 3. 4-Tier Test Suite Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RAKAZO 4-TIER TEST ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 1: Feature Coverage (>=5 tests per feature, happy path & core logic)   │
│  - Mobile Navigation (5+)   - Header & Hamburger (5+) - Touch Targets (5+)  │
│  - iOS Font Size (5+)       - Safe Area Insets (5+)   - Overlays & Modals (5+)│
│  - Desktop Layout (5+)      - MCP Catalog Matrix (5+) - Plugins Showcase (5+)│
│  - Detail Inspector (5+)    - Tool Selector UI (5+)   - DB Persistence (5+) │
│  - Runtime Filter (5+)      - Subagent Inherit (5+)   - Sanitization (5+)   │
│  - CI/CD Validation (5+)    - Adversarial Tests (5+)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 2: Boundary & Corner Cases (Stress, limits, adversarial defense)      │
│  - Screen Resolution Bounds - Extreme Permission Sets - Malformed Metadata  │
│  - Secret Masking Variants  - Zero/Max Tools Toggled  - Rapid State Flips   │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 3: Cross-Feature Combinations (Pairwise interactions & transitions)   │
│  - Mobile Drawer + Modal    - Hybrid Selector + DB    - Category + Search   │
│  - Subagent + Restricted    - Viewport Resize Switch  - Secret Redact + API │
├─────────────────────────────────────────────────────────────────────────────┤
│  TIER 4: Real-World Application Scenarios (Realistic end-user workflows)    │
│  - Mobile User Journey: Hamburger -> Select Bot -> Safe-Area Composer Send  │
│  - Sovereign MCP Explorer: Showcase -> Filter Category -> Inspect Tools     │
│  - Agent Creation: Hybrid MCP Permissions -> Tool Selection -> Persist      │
│  - Subagent Enforcement: Parent Bot Spawn -> Restricted Tool Denial         │
│  - High-Fidelity Responsive Switch: Mobile Drawer to Desktop Docked Bar     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Detailed Tier Breakdown

#### Tier 1: Feature Coverage
- **F1: Mobile Drawer Navigation**: Off-canvas drawer sliding mechanism, semi-transparent backdrop overlay, tap-to-close behavior, desktop docked sidebar (`md:relative`).
- **F2: Mobile Header & Hamburger**: Compact mobile top bar, active agent title display, online/offline status dot, hamburger toggle button triggering drawer.
- **F3: iOS Safari Auto-Zoom Prevention**: Input elements (chat composer, search inputs, form text fields) styled with `text-[16px]` or `text-base` preventing automatic iOS Safari viewport zoom.
- **F4: Mobile Touch Ergonomics**: Minimum 40–44px hit-target heights on send buttons, action pills, navigation links, and modal dismiss buttons.
- **F5: Safe-Area Inset Handling**: Padding applied to bottom message composer and navigation containers respecting `env(safe-area-inset-bottom)` and `viewport-fit=cover`.
- **F6: Adaptive Overlays & Modals**: Responsiveness of all overlays (`SkillLibraryOverlay`, `ModelSettingsOverlay`, `VoiceSettingsOverlay`, `PluginsOverlay`, `BotSettings`, `CreateBotForm`, `Onboarding`, `Auth`) rendering full-screen or bottom-sheet on mobile and centered floating dialogs on desktop.
- **F7: Desktop High-Fidelity UI**: Full preservation of desktop workstation UX including 316px docked sidebar (`w-[316px]`), 1080px rounded floating dialogs (`w-[1080px]`), and rich multi-column layouts.
- **F8: Sovereign MCP Catalog Matrix**: Complete matrix of 8 Sovereign Connectors (SearXNG/Scraperr, GitHub, Notion, Postiz, WordPress/Novamira, n8n, Cloudflare, Système) exposing 40 tools with endpoints, badges, protocols, and parameter contracts.
- **F9: Plugins & Integrations Showcase**: Redesigned showcase in `PluginsOverlay.tsx` featuring Sovereign MCP connectors, category tabs (`all`, `connected`, `search`, `code`, `workspace`, `social`, `cms`, `automation`, `infra`, `system`), and status badges.
- **F10: MCP Connector Detail Inspector**: Inspector panel providing connector metadata, overview, available tools table with parameter specifications, and security/secret status.
- **F11: Hybrid Agent Tool Selector UI**: `<BotMcpToolSelector />` providing 1-click global connector activation switch and expandable accordion for granular per-tool checkboxes.
- **F12: Per-Agent Tool Permissions DB Persistence**: Bot `metadata.mcp` schema structure with `connectors` and `tools` boolean record maps, repository serialization, and database persistence.
- **F13: Dynamic Runtime Tool Filtering**: `filterToolsForBot` algorithm in runtime execution pipeline matching bot configuration and injecting only authorized tools.
- **F14: Subagent Permission Inheritance**: Child bots spawned via `run_subagent` strictly inherit and cannot exceed the parent bot's authorized toolset.
- **F15: Multi-Layer Security Sanitization**: `sanitizeToolError` scrubbing sensitive GitHub PATs, Notion tokens, bearer credentials, and connection strings from tool output errors.
- **F16: Monorepo CI/CD Validation**: Monorepo packages verification, TypeScript zero-error check, test runner compatibility.
- **F17: Adversarial Coverage Hardening**: Resilient handling of malformed metadata, XSS payload injections in tool names/prompts, empty configuration objects, and rapid toggle changes.

#### Tier 2: Boundary & Corner Cases
- **Viewport Dimension Boundaries**: Ultra-small mobile (320px), standard iPhone SE (375px), iPhone 14/15 (390px), iPad portrait breakpoint (768px), desktop (1024px), ultra-wide (1440px+).
- **Tool Selection Extremes**: 0 tools enabled, all 40 tools enabled, connector enabled with 0 individual tools enabled, individual tool enabled with connector disabled (override resolution).
- **Malformed & Corrupted Metadata**: `metadata.mcp = null`, `undefined`, boolean primitives, arrays, unknown connector IDs, empty strings.
- **Secret Redaction Variants**: Short tokens, multi-line error traces, embedded query strings, base64 tokens, Bearer headers, webhook URLs.

#### Tier 3: Cross-Feature Combinations
- **Mobile Drawer + Overlay Stacking**: Opening an overlay automatically dismisses or correctly layers over the mobile drawer without backdrop conflict.
- **Hybrid Selector UI + DB Serialization + Runtime Filter**: Toggle UI updates state -> serializes to `BotMetadata` -> runtime filters tools matching exact user selection.
- **Category Filter + Search Query in MCP Showcase**: Real-time combined filtering across category pill tabs and text query substring matching.
- **Subagent Spawning + Least-Privilege Filter + Error Sanitization**: Subagent executing restricted tool blocked gracefully, and any system error returned is fully sanitized.
- **Responsive Dynamic Transition**: Layout elements adapt fluidly across mobile and desktop breakpoints without layout shift or missing controls.

#### Tier 4: Real-World Application Scenarios
- **Scenario 1: Mobile User Daily Journey**: User opens hamburger menu on iPhone, navigates to agent chat, enters message in zoom-protected composer with safe-area padding, and submits via 44px touch target button.
- **Scenario 2: Enterprise Sovereign MCP Explorer**: User browses Sovereign MCP catalogue, filters by 'Ingénierie', inspects GitHub MCP connector, views 6 tools and parameter definitions, and checks operational status.
- **Scenario 3: Custom Agent Creation with Hybrid Toolset**: User creates a specialized RAG bot, enables SearXNG search connector, enables Notion workspace connector but disables `notion_delete_page`, and saves configuration.
- **Scenario 4: Multi-Agent Subagent Tool Execution**: Primary coordinator agent invokes subagent to scrape documentation; subagent receives only `web_scrape` tool and cannot access unassigned GitHub or Cloudflare tools.
- **Scenario 5: Full Responsive Adaptability Matrix**: System renders all overlays and dialogs across mobile and desktop breakpoints verifying consistent tokens, typography, and controls.

---

## 4. Test File Placement & Organization

The test suites are organized across standard monorepo locations:

1. **WebUI Mobile & MCP Master E2E Suite**:
   - `apps/web/src/pages/e2e-mobile-and-mcp.test.tsx`: Master 4-Tier test suite covering all 17 features, mobile navigation, adaptive overlays, MCP showcase, hybrid tool selector, persistence, and runtime tool filtering.
2. **Contracts & MCP Catalog Suite**:
   - `packages/contracts/src/mcp-catalog.ts`: Shared catalogue matrix defining all 8 Sovereign Connectors and 40 tools.
   - `packages/contracts/src/skills.test.ts`: Contracts, Zod schemas, YAML/Markdown parser.
3. **Enterprise Tools & Runtime Suite**:
   - `packages/adapters/src/e2e-enterprise-suite.test.ts`: Enterprise tools execution, SearXNG, Scraperr, GitHub, Notion, Postiz, WordPress, n8n, Cloudflare, secrets scrubbing.
   - `packages/adapters/src/enterprise-tools.test.ts`: Unit test suite for enterprise connector tools.
4. **Skills & Overlays WebUI Suite**:
   - `apps/web/src/pages/SkillLibraryOverlay.test.tsx`: Skill library modal rendering and responsive badges.
   - `apps/web/src/pages/BotSkillSelection.adversarial.test.tsx`: Adversarial validation of bot skill selector logic.

---

## 5. How to Run the Tests

### Run the Mobile-First & Enterprise MCP Master E2E Suite:
```bash
pnpm vitest run apps/web/src/pages/e2e-mobile-and-mcp.test.tsx
```

### Run all WebUI tests:
```bash
pnpm vitest run apps/web/src/
```

### Run all enterprise and adapter tests:
```bash
pnpm vitest run packages/adapters/src/e2e-enterprise-suite.test.ts
```

### Run the entire test suite across the monorepo:
```bash
pnpm test
```

### Watch mode for continuous development:
```bash
pnpm vitest watch apps/web/src/pages/e2e-mobile-and-mcp.test.tsx
```
