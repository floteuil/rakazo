import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertHtmlToMarkdown, executeWebScrape } from "./web-scrape.js";

describe("web-scrape", () => {
  const originalEnv = process.env.SCRAPERR_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.SCRAPERR_URL;
  });

  afterEach(() => {
    process.env.SCRAPERR_URL = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("convertHtmlToMarkdown", () => {
    it("strips scripts, styles, nav, footer, and other noise elements", () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page</title>
            <style>body { color: red; }</style>
            <script>alert("evil");</script>
          </head>
          <body>
            <header><p>Site Header</p></header>
            <nav><a href="/home">Home</a></nav>
            <main>
              <h1>Main Title</h1>
              <p>Main content paragraph.</p>
            </main>
            <aside><p>Sidebar ads</p></aside>
            <footer><p>Copyright 2026</p></footer>
          </body>
        </html>
      `;

      const md = convertHtmlToMarkdown(html);
      expect(md).not.toContain("alert");
      expect(md).not.toContain("color: red");
      expect(md).not.toContain("Site Header");
      expect(md).not.toContain("Sidebar ads");
      expect(md).not.toContain("Copyright 2026");
      expect(md).toContain("# Main Title");
      expect(md).toContain("Main content paragraph.");
    });

    it("converts headings, paragraphs, links, bold, and italics", () => {
      const html = `
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <p>This is <strong>bold</strong> and <em>italic</em> text with a <a href="https://rakazo.com">Rakazo Link</a>.</p>
      `;

      const md = convertHtmlToMarkdown(html);
      expect(md).toContain("# Heading 1");
      expect(md).toContain("## Heading 2");
      expect(md).toContain("**bold**");
      expect(md).toContain("*italic*");
      expect(md).toContain("[Rakazo Link](https://rakazo.com)");
    });

    it("converts lists, code blocks, blockquotes, and tables", () => {
      const html = `
        <blockquote>An inspiring quote.</blockquote>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
        <pre><code>const x = 42;</code></pre>
        <table>
          <tr><th>Col A</th><th>Col B</th></tr>
          <tr><td>Val 1</td><td>Val 2</td></tr>
        </table>
      `;

      const md = convertHtmlToMarkdown(html);
      expect(md).toContain("> An inspiring quote.");
      expect(md).toContain("* Item 1");
      expect(md).toContain("* Item 2");
      expect(md).toContain("```\nconst x = 42;\n```");
      expect(md).toContain("| Col A | Col B |");
      expect(md).toContain("| --- | --- |");
      expect(md).toContain("| Val 1 | Val 2 |");
    });

    it("decodes HTML entities properly", () => {
      const html = `<p>Tom &amp; Jerry &gt; Mickey &lt; 100 &quot;cartoons&quot; &#39;classic&#39;</p>`;
      const md = convertHtmlToMarkdown(html);
      expect(md).toBe(`Tom & Jerry > Mickey < 100 "cartoons" 'classic'`);
    });
  });

  describe("executeWebScrape", () => {
    it("returns error for empty URL", async () => {
      const res = await executeWebScrape({ url: "" });
      expect(res.error).toMatch(/URL must not be empty/i);
    });

    it("rejects invalid protocols (ftp, file, javascript)", async () => {
      const res1 = await executeWebScrape({ url: "ftp://files.example.com/doc.pdf" });
      expect(res1.error).toMatch(/Unsupported protocol/i);

      const res2 = await executeWebScrape({ url: "javascript:alert(1)" });
      expect(res2.error).toMatch(/Unsupported protocol|Invalid URL format/i);
    });

    it("successfully fetches and converts HTML to Markdown", async () => {
      const htmlDoc = `
        <html>
          <head><title>Documentation - Rakazo</title></head>
          <body>
            <h1>Getting Started</h1>
            <p>Welcome to Rakazo documentation.</p>
          </body>
        </html>
      `;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => htmlDoc,
      });

      const res = await executeWebScrape({ url: "https://docs.rakazo.com/start" });
      expect(res.title).toBe("Documentation - Rakazo");
      expect(res.content).toContain("# Getting Started");
      expect(res.content).toContain("Welcome to Rakazo documentation.");
      expect(res.truncated).toBe(false);
      expect(res.length).toBeGreaterThan(0);
    });

    it("truncates content exceeding maxLength and sets truncated to true", async () => {
      const longText = "A".repeat(500);
      const htmlDoc = `<html><head><title>Long</title></head><body><p>${longText}</p></body></html>`;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => htmlDoc,
      });

      const res = await executeWebScrape({
        url: "https://example.com/long",
        maxLength: 100,
      });

      expect(res.truncated).toBe(true);
      expect(res.content).toContain("... [Content truncated at 100 characters]");
    });

    it("forwards to Scraperr service when SCRAPERR_URL is configured", async () => {
      process.env.SCRAPERR_URL = "http://scraperr-service:3000";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          title: "Scraperr Extracted Title",
          markdown: "# Scraperr Result\n\nClean text.",
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await executeWebScrape({ url: "https://example.com/article" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://scraperr-service:3000/api/scrape",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ url: "https://example.com/article" }),
        }),
      );
      expect(res.title).toBe("Scraperr Extracted Title");
      expect(res.content).toContain("# Scraperr Result");
    });

    it("returns error on HTTP 404 / 500 responses", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const res = await executeWebScrape({ url: "https://example.com/missing" });
      expect(res.error).toMatch(/HTTP 404/);
    });
  });
});
