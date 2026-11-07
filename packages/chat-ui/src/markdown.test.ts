import { describe, expect, it } from "vitest";
import { closeUnterminatedFence, sanitizeMarkdownUrl } from "./markdown";
import {
  chatMermaidConfig,
  isMermaidFence,
  mermaidSvgImage,
  renderMermaidSvgSync,
} from "./mermaid";

describe("sanitizeMarkdownUrl", () => {
  it("allows normal external links and optionally allows local links", () => {
    expect(sanitizeMarkdownUrl("https://example.com/docs")).toBe("https://example.com/docs");
    expect(sanitizeMarkdownUrl("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(sanitizeMarkdownUrl("/docs", true)).toBe("/docs");
    expect(sanitizeMarkdownUrl("#section", true)).toBe("#section");
  });

  it("rejects executable and embedded-data URLs", () => {
    expect(sanitizeMarkdownUrl("javascript:alert(1)", true)).toBeUndefined();
    expect(sanitizeMarkdownUrl("data:text/html,<script>alert(1)</script>", true)).toBeUndefined();
    expect(sanitizeMarkdownUrl("/docs")).toBeUndefined();
  });
});

describe("closeUnterminatedFence", () => {
  it("temporarily closes a partial streaming code fence", () => {
    expect(closeUnterminatedFence("Before\n```ts\nconst value = 1;")).toBe(
      "Before\n```ts\nconst value = 1;\n```",
    );
  });

  it("leaves complete markdown unchanged", () => {
    const markdown = "```ts\nconst value = 1;\n```\n\nDone";
    expect(closeUnterminatedFence(markdown)).toBe(markdown);
  });

  it("handles tilde code fences properly", () => {
    expect(closeUnterminatedFence('```ts\nconst x = 1;\n```\n~~~json\n{"a": 1}')).toBe(
      '```ts\nconst x = 1;\n```\n~~~json\n{"a": 1}\n~~~',
    );
  });

  it("handles text without code blocks without modification", () => {
    const plain = "# Title\n\nParagraph text with *emphasis* and [link](https://example.com)";
    expect(closeUnterminatedFence(plain)).toBe(plain);
  });
});

describe("Mermaid diagram rendering (Upstream #1423 / 050ce8a59)", () => {
  it("recognizes mermaid code fence identifiers", () => {
    expect(isMermaidFence("mermaid")).toBe(true);
    expect(isMermaidFence("Mermaid title='Flow'")).toBe(true);
    expect(isMermaidFence("typescript")).toBe(false);
    expect(isMermaidFence("")).toBe(false);
  });

  it("enforces strict security and disables htmlLabels in chatMermaidConfig", () => {
    const cfg = chatMermaidConfig("dark");
    expect(cfg.securityLevel).toBe("strict");
    expect(cfg.htmlLabels).toBe(false);
    expect(cfg.secure).toContain("htmlLabels");
    expect(cfg.secure).toContain("securityLevel");
  });

  it("renders valid flowcharts and sequence diagrams to safe SVG data URLs", () => {
    const svg = renderMermaidSvgSync(
      "graph TD\n  accTitle: Pipeline\n  A[Start] --> B[End]",
      "dark",
    );
    expect(svg).toBeTruthy();
    const img = mermaidSvgImage(svg!);
    expect(img).toBeDefined();
    expect(img?.src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(img?.alt).toBe("Pipeline");
    expect(img?.width).toBeGreaterThan(0);
    expect(img?.height).toBeGreaterThan(0);
  });

  it("returns null on invalid Mermaid syntax so callers fall back to a code block", () => {
    expect(renderMermaidSvgSync("not a mermaid diagram\n123 === ???", "dark")).toBeNull();
  });
});
