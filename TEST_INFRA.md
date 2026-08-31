# RAKAZO OmniRoute Test Infrastructure & 4-Tier Testing Methodology (TEST_INFRA)

## 1. Overview & Testing Philosophy

The Rakazo OmniRoute test infrastructure is built upon an opaque-box, requirement-driven testing architecture derived strictly from `ORIGINAL_REQUEST.md` and `PROJECT.md`. It guarantees that all 22 system features operate deterministically across all layers without reliance on implementation shortcuts or static model coupling.

### Testing Methodology
1. **Category-Partition & Domain Boundary Analysis**: Bounded inputs, 0 prompt tokens, cache ratio bounds $[0, 1]$, FNV-1a hash key distribution.
2. **Deterministic Cognitive Priority Resolution**: Priority ordering: `reasoning` (100) > `coding` (80) > `analysis` (60) > `writing` (40) > `fast` (20) > default `general` (20).
3. **Double Zero-Cost Barrier & Fail-Closed Invariants**: Pre-dispatch route veto and post-response assertion ($cost \le \$0.000000$) with fail-closed rejection on invalid, positive, or negative costs.
4. **Triple Coherence Equation**:
   $$\mathbf{OmniRoute\ Response\ Headers} \equiv \mathbf{PromptExecutionLog\ (SQL)} \equiv \mathbf{WebUI\ Rendered\ Metadata}$$

---

## 2. 4-Tier Testing Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       4-TIER E2E TEST HIERARCHY                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Tier 1: Feature Coverage (>= 5 tests per feature)                         │
│   - Unit & integration verification of each individual capability           │
│   - 5 cognitive profiles + Premium mode + Headers + DB + WebUI             │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Tier 2: Boundary & Corner Cases (>= 5 tests per feature)                  │
│   - Extreme token lengths, 0 tokens, 0% vs 100% cache ratio, FNV-1a       │
│   - Header fallbacks, tag limits, 25 max iterations, 3 duplicate breaker    │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Tier 3: Cross-Feature Interactions & Dynamic Failover                     │
│   - Multi-feature pairwise combinations (Transport + Runtime + Telemetry)   │
│   - Dynamic failover (Mistral -> Groq) without user-facing errors           │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Tier 4: Real-World Scenarios & Triple Coherence Certification             │
│   - Multi-turn MCP tool workflows with semantic compaction                 │
│   - Subagent task confinement & 8192 token ceiling                          │
│   - Exact Identity: Headers == SQL Telemetry == WebUI Metadata              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature Inventory & Test Coverage Mapping

| # | Feature | Requirement | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|-------------|:----------------:|:-----------------:|:----------------------:|:-------------------:|
| 1 | 3-Level Dynamic Decoupling | R1 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 2 | Static Coupling Ban | R1 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 3 | OmniRoute Response Header Capture | R2 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 4 | End-to-End Metadata Propagation | R2 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 5 | Non-blocking SQL Telemetry | R2 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 6 | 4-Block Token 0 Invariant Cache | R4 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 7 | Provider-Independent Session Affinity | R4 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 8 | Strict Cache Ratio Calculation | R4 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 9 | Canonical Agentic Loop Guards | R5 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 10 | Semantic Tool Compaction | R5 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 11 | Subagent Strict Confinement | R5 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 12 | Double Zero-Cost Barrier | R5 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 13 | WebUI Bot Settings Decoupling | R3 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 14 | WebUI Chat Turn Execution Badge | R3 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 15 | Smooth Dynamic Failover UX | R3 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 16 | Mobile & Desktop Responsive UX | R3 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 17 | E2E Testing Track & Test Harness | Acceptance | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 18 | Triple Coherence Verification | R6 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 19 | Monorepo Zero-Error Typecheck & 100% Tests | Acceptance | ✓ | ✓ | ✓ | ✓ |
| 20 | VPS Multi-App & Premium Route Sanctuary | R6 | ≥ 5 | ≥ 5 | ✓ | ✓ |
| 21 | Documentation Updates | R6 | ✓ | ✓ | ✓ | ✓ |
| 22 | Master Passation Artifact | R6 | ✓ | ✓ | ✓ | ✓ |

---

## 4. Test Suites Inventory & Execution Details

### Master Test Suites
1. `apps/web/src/pages/e2e-omniroute-triple-coherence.test.tsx`
   - Formal verification of Triple Coherence across all 5 profiles and dynamic failover.
   - Comprehensive Tier 1, Tier 2, Tier 3, and Tier 4 assertions.
2. `packages/testkit/src/tests/tier1-features-r1-r6.e2e.test.ts`
   - Tier 1 Feature coverage across Features 1-15 (75 unit tests).
3. `packages/testkit/src/tests/tier2-boundary-r1-r6.e2e.test.ts`
   - Tier 2 Boundary analysis across Features 1-15 (75 boundary tests).
4. `packages/testkit/src/tests/tier3-pairwise-r1-r6.e2e.test.ts`
   - Tier 3 Cross-feature interactions and pairwise validation.
5. `packages/testkit/src/tests/tier4-real-world-scenarios.e2e.test.ts`
   - Tier 4 Multi-turn MCP workflows and subagent task execution.
6. `packages/testkit/src/tests/tier5-adversarial-stress.e2e.test.ts`
   - High-throughput concurrency, simulated socket termination, and DB fail-open resilience.

### Test Runner Commands
- **Full Monorepo Typecheck Gate (0 errors required across all 19 packages)**:
  ```bash
  pnpm check
  ```
- **Full Monorepo Test Gate (100% pass rate required across all test suites)**:
  ```bash
  pnpm test
  ```
- **Targeted Triple Coherence Suite**:
  ```bash
  pnpm vitest run apps/web/src/pages/e2e-omniroute-triple-coherence.test.tsx
  ```
- **Targeted OmniRoute Testkit Suites**:
  ```bash
  pnpm vitest run packages/testkit/src/tests/tier*.ts
  ```

---

## 5. Acceptance & Certification Criteria

- [x] **0 TypeScript Errors**: `pnpm check` succeeds across all 19 packages.
- [x] **100% Test Pass Rate**: `pnpm test` executes and passes all test suites.
- [x] **Formal Triple Coherence Certification**: Verified identity between OmniRoute Response Headers, SQL `PromptExecutionLog`, and WebUI Rendered Metadata.
- [x] **Dynamic Failover & Resilience**: Verified smooth failover with preserved session affinity (`x-session-id`) and accurate telemetry recording.
