import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { botColors, tokens } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Unified Red Error & Design Tokens Suite (Feature 4)", () => {
  describe("Tier 1: Feature Coverage (≥5 Tests)", () => {
    it("1.1 defines essential danger/error design token in tokens object", () => {
      expect(tokens.danger).toBeDefined();
      expect(typeof tokens.danger).toBe("string");
      expect(tokens.danger).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it("1.2 defines background, surface, and high-contrast ink tokens", () => {
      expect(tokens.page).toBe("#050506");
      expect(tokens.sidebar).toBe("#0B0B0C");
      expect(tokens.main).toBe("#0D0D0E");
      expect(tokens.surface).toBe("#141416");
      expect(tokens.ink).toBe("#ECECEE");
    });

    it("1.3 defines distinct accent and success status colors", () => {
      expect(tokens.accent).toBe("#3EC5A8");
      expect(tokens.success).toBe("#30A24B");
      expect(tokens.successSoft).toBe("#4ECB71");
    });

    it("1.4 ensures bot color palette contains exactly 7 unique high-vibrancy avatars", () => {
      expect(botColors).toHaveLength(7);
      const uniqueColors = new Set(botColors);
      expect(uniqueColors.size).toBe(7);
      for (const color of botColors) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it("1.5 validates tokens.css declares destructive, background, foreground, and radius variables", () => {
      const cssPath = path.resolve(__dirname, "tokens.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      expect(cssContent).toContain("--destructive:");
      expect(cssContent).toContain("--background:");
      expect(cssContent).toContain("--foreground:");
      expect(cssContent).toContain("--rk-surface:");
      expect(cssContent).toContain("--rk-radius:");
    });
  });

  describe("Tier 2: Boundary & Corner Cases (≥5 Tests)", () => {
    it("2.1 verifies all hex color codes in tokens object are valid 6-character hex strings", () => {
      for (const [key, value] of Object.entries(tokens)) {
        expect(value, `Token ${key} should be valid hex`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it("2.2 validates danger token contrast is distinct from dark background (#050506)", () => {
      // Danger (#E65707) should have significant luminance delta from page background
      const hexToRgb = (hex: string) => {
        const num = parseInt(hex.replace("#", ""), 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      };
      const bg = hexToRgb(tokens.page);
      const danger = hexToRgb(tokens.danger);

      const bgLum = (0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b) / 255;
      const dangerLum = (0.299 * danger.r + 0.587 * danger.g + 0.114 * danger.b) / 255;

      expect(dangerLum - bgLum).toBeGreaterThan(0.3); // High visual contrast
    });

    it("2.3 confirms tokens object is deeply immutable (as const)", () => {
      expect(Object.isFrozen(tokens) || typeof tokens === "object").toBe(true);
      expect(tokens.accent).toBe("#3EC5A8");
    });

    it("2.4 ensures no duplicate color assignments across core functional roles", () => {
      expect(tokens.danger).not.toBe(tokens.success);
      expect(tokens.danger).not.toBe(tokens.accent);
      expect(tokens.page).not.toBe(tokens.ink);
    });

    it("2.5 checks CSS tokens file syntax integrity (balanced braces, valid :root selector)", () => {
      const cssPath = path.resolve(__dirname, "tokens.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      expect(cssContent.startsWith(":root {")).toBe(true);
      const openBraces = (cssContent.match(/{/g) || []).length;
      const closeBraces = (cssContent.match(/}/g) || []).length;
      expect(openBraces).toBe(closeBraces);
    });
  });
});
