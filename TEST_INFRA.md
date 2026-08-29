# E2E Test Infra: OmniRoute Coolify Deployment & Rakazo Integration

## Test Philosophy
- Opaque-box, requirement-driven, independently verifiable.
- Dual-track architecture testing: OmniRoute deployment & persistence, Rakazo endpoint integration, Free fail-closed invariant, Premium non-regression, and zero VPS interference.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | VPS & Coolify Infrastructure Audit | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | OmniRoute Spec & Commit Pinning | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | OmniRoute Container Deployment | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Storage Encryption & Admin Auth | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Dedicated Endpoint Key Provisioning | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 6 | Rakazo Env Integration | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 7 | Zero-Provider Fail-Closed Invariant | ORIGINAL_REQUEST §R3/R4 | 5 | 5 | ✓ |
| 8 | Premium Path Non-Regression | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 9 | Persistence & Restart Resiliency | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 10 | Passive VPS Health Verification | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 11 | Master Documentation (Zero Secrets) | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Vitest / Bash remote integration test scripts
- Invocation: `pnpm vitest run test/e2e/omniroute-adversarial.test.ts` & remote verification scripts
- Pass/Fail semantics: 100% exit code 0, 0 unhandled errors, strict string assertion matching.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Free bot receives prompt with zero-provider configured -> clean fail-closed error with $0.0000 cost | F5, F6, F7 | High |
| 2 | Premium bot receives prompt -> executes via OpenRouter without contacting OmniRoute | F8 | Medium |
| 3 | OmniRoute container restarted -> volume `/app/data` retains keys and sqlite config | F3, F4, F9 | High |
| 4 | Unauthorized request to `/v1/chat/completions` -> 401 Unauthorized | F4, F5 | Medium |
| 5 | Full VPS tenant passive status check -> all 15 services healthy and undisturbed | F1, F10 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (55 test assertions)
- Tier 2: ≥5 boundary/error cases per feature (55 test assertions)
- Tier 3: Pairwise combinations of major features (11 interaction test suites)
- Tier 4: 5 realistic E2E end-user workflow scenarios
