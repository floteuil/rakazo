import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tokens, errorTokens, botColors } from "./index.js";

describe("UI Tokens - Design Token System", () => {
  it("exports unified red error tokens in tokens object", () => {
    expect(tokens.danger).toBe("#EF4444");
    expect(tokens.error).toBe("#EF4444");
    expect(tokens.errorInk).toBe("#FCA5A5");
  });

  it("exports errorTokens object with full error palette", () => {
    expect(errorTokens.error).toBe("#EF4444");
    expect(errorTokens.errorSurface).toBe("rgba(239, 68, 68, 0.10)");
    expect(errorTokens.errorBorder).toBe("rgba(239, 68, 68, 0.25)");
    expect(errorTokens.errorInk).toBe("#FCA5A5");
    expect(errorTokens.destructive).toBe("0 84% 60%");
  });

  it("exports surface, ink, and accent tokens intact", () => {
    expect(tokens.page).toBe("#050506");
    expect(tokens.surface).toBe("#141416");
    expect(tokens.surface2).toBe("#1A1A1D");
    expect(tokens.ink).toBe("#ECECEE");
    expect(tokens.accent).toBe("#3EC5A8");
  });

  it("exports botColors array", () => {
    expect(botColors.length).toBeGreaterThan(0);
    expect(botColors).toContain("#3EC5A8");
  });

  it("ensures tokens.css contains unified red error CSS custom properties", () => {
    const cssPath = resolve(__dirname, "tokens.css");
    const cssContent = readFileSync(cssPath, "utf-8");

    expect(cssContent).toContain("--rk-error: #ef4444;");
    expect(cssContent).toContain("--rk-error-surface: rgba(239, 68, 68, 0.10);");
    expect(cssContent).toContain("--rk-error-border: rgba(239, 68, 68, 0.25);");
    expect(cssContent).toContain("--rk-error-ink: #fca5a5;");
    expect(cssContent).toContain("--destructive: 0 84% 60%;");

    // Legacy orange values should not exist
    expect(cssContent).not.toContain("--destructive: 16 94% 46%;");
  });
});
