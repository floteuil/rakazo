# E2E Test Infra: RAKAZO UI/UX Excellence & Robustness

## Test Philosophy
- Opaque-box & unit/integration dual validation, requirement-driven, derived strictly from `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---|---|:---:|:---:|:---:|:---:|
| 1 | MCP TypeBox Schemas & Enums | PR #450 / R2 | ≥5 | ≥5 | ✓ | ✓ |
| 2 | SSE UTF-16 Surrogate Sanitization | PR #424 / R2 | ≥5 | ≥5 | ✓ | ✓ |
| 3 | Resolved Run Error Banner Cleanup | PR #449, #447 / R2 | ≥5 | ≥5 | ✓ | ✓ |
| 4 | Unified Red Error Tokens | PR #428, #432, #462 / R1 | ≥5 | ≥5 | ✓ | ✓ |
| 5 | 9-Breakpoint Responsive Layout | R4 | ≥9 | ≥5 | ✓ | ✓ |
| 6 | Collapsible MCP Tool Activity Accordion | PR #440 / R1 | ≥5 | ≥5 | ✓ | ✓ |
| 7 | Interactive Suggestion Choice Chips | PR #433 / R1 | ≥5 | ≥5 | ✓ | ✓ |
| 8 | Hover Timestamps & Compute Duration | PR #397, #461 / R1 | ≥5 | ≥5 | ✓ | ✓ |
| 9 | Message Reactions & Copy Actions | PR #428, #432, #462 / R1 | ≥5 | ≥5 | ✓ | ✓ |
| 10 | `@mention` Popover & Keyboard Navigation | R1 | ≥5 | ≥5 | ✓ | ✓ |
| 11 | Shell.tsx Master Integration | R1 | ≥5 | ≥5 | ✓ | ✓ |
| 12 | Invariant Sanctuary Verification | R3 (10 invariants) | ≥10 | ≥5 | ✓ | ✓ |
| 13 | Monorepo Zero-Regression Certification | R5 | All 19 pkgs | Full build | ✓ | ✓ |

## Test Architecture
- Test runner: Vitest (`pnpm test` / `turbo test`) & Turborepo (`turbo check --force`).
- Test case format: Vitest `describe()`, `it()`, `expect()` with React Testing Library / `@testing-library/react` and Vitest jsdom/happy-dom for UI and Node.js for backend adapters.
- Test suites:
  - Unit/Adapter: `packages/adapters/src/pi-runtime.test.ts`, `packages/core/src/events.test.ts`, `apps/web/src/lib/thread-events.test.ts`
  - Web UI: `apps/web/src/tests/ui-excellence.test.tsx`, `apps/web/src/tests/responsive-matrix.test.tsx`
  - Invariants: `packages/adapters/src/free-policy-engine.test.ts`, `packages/adapters/src/loop-guards.test.ts`, `packages/db/src/repos.test.ts`

## Real-World Application Scenarios (Tier 4)
1. **Multi-turn Chat with Tool Activity & Suggestion Selection**: Run an agent invoking MCP tools, viewing collapsed activity accordion, receiving suggestion chips, selecting option B via click, and verifying conversation resumption.
2. **Streaming Emoji & Secret Masking Run**: Stream long text containing multi-byte emojis (`🚀`, `🤖`, `🎉`) interspersed with sensitive API tokens across small chunk boundaries, ensuring clean redaction and zero surrogate corruption.
3. **Run Error Recovery & Retry Flow**: Trigger a transient run failure, observe unified red error banner, click retry/follow-up, verify banner cleanup and proper thread snapshot restoration.
4. **Keyboard-Driven Mentions & Reaction Ergonomics**: Navigate chat composer, type `@`, use Arrow keys to select a specialist bot, hit Enter, submit prompt, view hover timestamps, compute duration badge, and toggle thumbs up reaction.
5. **Multi-Device Responsive Stress Test**: Mount chat shell across 9 distinct viewport widths (320px to 1440px+), verifying touch target sizing ($\ge 44$px), safe area insets, and drawer responsiveness.

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (where boundaries exist)
- Tier 3: Pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
- Tier 5: Adversarial white-box stress testing
