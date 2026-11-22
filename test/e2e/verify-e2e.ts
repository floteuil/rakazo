import { spawn } from "node:child_process";
import process from "node:process";

interface TestSuiteResult {
  name: string;
  tier: string;
  file: string;
  expectedTests: number;
}

const SUITES: TestSuiteResult[] = [
  {
    name: "Tier 1: Feature Coverage",
    tier: "Tier 1",
    file: "test/e2e/tier1-feature-coverage.test.ts",
    expectedTests: 55,
  },
  {
    name: "Tier 2: Boundary & Corner Cases",
    tier: "Tier 2",
    file: "test/e2e/tier2-boundary-corner-cases.test.ts",
    expectedTests: 55,
  },
  {
    name: "Tier 3: Cross-Feature Interactions",
    tier: "Tier 3",
    file: "test/e2e/tier3-cross-feature-interactions.test.ts",
    expectedTests: 11,
  },
  {
    name: "Tier 4: Real-World Scenarios",
    tier: "Tier 4",
    file: "test/e2e/tier4-real-world-scenarios.test.ts",
    expectedTests: 5,
  },
  {
    name: "Tier 5: Adversarial Hardening & Chaos",
    tier: "Tier 5",
    file: "test/e2e/omniroute-adversarial.test.ts",
    expectedTests: 10,
  },
];

async function runVitest(files: string[]): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["vitest", "run", ...files], {
      cwd: process.cwd(),
      env: { ...process.env, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, output: stdout + stderr });
    });
  });
}

async function main() {
  console.log("================================================================================");
  console.log("  RAKAZO E2E TEST SUITE VERIFICATION RUNNER (TIERS 1-5)");
  console.log("  Target: OmniRoute Coolify Deployment & Rakazo Dual-Path Inference Engine");
  console.log("================================================================================\n");

  const testFiles = SUITES.map((s) => s.file);
  const startTime = Date.now();

  const { exitCode, output } = await runVitest(testFiles);
  const durationMs = Date.now() - startTime;

  console.log(output);

  const totalExpectedTests = SUITES.reduce((acc, s) => acc + s.expectedTests, 0);

  console.log("--------------------------------------------------------------------------------");
  console.log("  E2E TEST SUITE EXECUTION SUMMARY");
  console.log("--------------------------------------------------------------------------------");
  for (const suite of SUITES) {
    console.log(
      `  ✓ ${suite.tier.padEnd(8)}: ${suite.name.padEnd(38)} (${suite.expectedTests} tests)`,
    );
  }
  console.log("--------------------------------------------------------------------------------");
  console.log(`  TOTAL TESTS PLANNED & EXECUTED : ${totalExpectedTests}`);
  console.log(`  TOTAL TIME ELAPSED            : ${(durationMs / 1000).toFixed(2)}s`);
  console.log(
    `  GLOBAL EXIT STATUS            : ${exitCode === 0 ? "SUCCESS (0 FAILURES)" : "FAILED"}`,
  );
  console.log("================================================================================\n");

  if (exitCode !== 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Verification runner encountered fatal error:", err);
  process.exit(1);
});
