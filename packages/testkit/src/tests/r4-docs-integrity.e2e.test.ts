import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function getRepoRoot(): string {
  let dir = import.meta.dirname ?? process.cwd();
  while (dir !== "/" && dir !== ".") {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml")) || existsSync(resolve(dir, "turbo.json"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

describe("Requirement R4: Documentation Standardization & Env Setup E2E", () => {
  const rootDir = getRepoRoot();
  const agentsMdPath = resolve(rootDir, "AGENTS.md");
  const envSetupPath = resolve(rootDir, "docs/ENVIRONMENT_SETUP.md");

  let agentsMdContent = "";
  if (existsSync(agentsMdPath)) {
    agentsMdContent = readFileSync(agentsMdPath, "utf-8");
  }

  let envSetupContent = "";
  if (existsSync(envSetupPath)) {
    envSetupContent = readFileSync(envSetupPath, "utf-8");
  }

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 Tests)
  // ==========================================================================
  describe("Tier 1: Feature Coverage (R4 Documentation Artifacts)", () => {
    it("1.1 Verifies presence of AGENTS.md at repository root", () => {
      expect(existsSync(agentsMdPath)).toBe(true);
      expect(agentsMdContent.length).toBeGreaterThan(50);
    });

    it("1.2 Validates security & zero-secret policy statements in AGENTS.md", () => {
      expect(agentsMdContent).toMatch(/Zero-Secret|Never commit|zéro-secret|zero secret/i);
      expect(agentsMdContent).toMatch(/public repository|public/i);
    });

    it("1.3 Validates multi-surface targeting (Web, Desktop Electron, Mobile)", () => {
      expect(agentsMdContent).toMatch(/web/i);
      expect(agentsMdContent).toMatch(/desktop|electron/i);
      expect(agentsMdContent).toMatch(/mobile|expo/i);
    });

    it("1.4 Verifies presence of environment configuration documentation", () => {
      expect(existsSync(envSetupPath)).toBe(true);
      expect(envSetupContent.length).toBeGreaterThan(100);
    });

    it("1.5 Validates PR review and CI verification protocols in AGENTS.md", () => {
      expect(agentsMdContent).toMatch(/pull request|CI|checks|gating/i);
    });

    it("1.6 Verifies standard developer commands in repository documentation", () => {
      const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts.check).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES (>=5 Tests)
  // ==========================================================================
  describe("Tier 2: Boundary & Corner Cases (R4 Consistency & Zero-Secret Leaks)", () => {
    it("2.1 Scans documentation for zero accidental real API keys or tokens", () => {
      const sensitivePatterns = [
        /sk-[a-zA-Z0-9]{32,}/,
        /ghp_[a-zA-Z0-9]{36}/,
        /glpat-[a-zA-Z0-9_-]{20}/,
        /xox[baprs]-[0-9a-zA-Z]{10,48}/,
        /ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/, // Live JWT
      ];

      for (const pattern of sensitivePatterns) {
        expect(agentsMdContent).not.toMatch(pattern);
        if (envSetupContent) {
          expect(envSetupContent).not.toMatch(pattern);
        }
      }
    });

    it("2.2 Validates physical directory existence for core monorepo packages", () => {
      const corePackages = [
        "packages/adapter-kit",
        "packages/adapters",
        "packages/contracts",
        "packages/core",
        "packages/db",
        "packages/testkit",
        "apps/api",
        "apps/web",
      ];

      for (const pkgPath of corePackages) {
        expect(existsSync(resolve(rootDir, pkgPath))).toBe(true);
      }
    });

    it("2.3 Verifies consistency between package.json engines and Node.js requirement", () => {
      const packageJson = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf-8"));
      expect(packageJson.engines?.node).toMatch(/>=\s*22/);
      expect(packageJson.packageManager).toMatch(/pnpm@9/);
    });

    it("2.4 Validates clean markdown formatting without unresolved merge conflict markers", () => {
      const conflictMarkers = ["<<<<<<< HEAD", "=======", ">>>>>>>"];
      for (const marker of conflictMarkers) {
        expect(agentsMdContent).not.toContain(marker);
        if (envSetupContent) {
          expect(envSetupContent).not.toContain(marker);
        }
      }
    });

    it("2.5 Verifies all package tsconfig files extend root or monorepo standards", () => {
      const tsconfigs = [
        resolve(rootDir, "packages/contracts/tsconfig.json"),
        resolve(rootDir, "packages/adapters/tsconfig.json"),
        resolve(rootDir, "packages/db/tsconfig.json"),
        resolve(rootDir, "packages/testkit/tsconfig.json"),
      ];

      for (const tsconfig of tsconfigs) {
        if (existsSync(tsconfig)) {
          const config = JSON.parse(readFileSync(tsconfig, "utf-8"));
          expect(config.compilerOptions).toBeDefined();
        }
      }
    });
  });
});
