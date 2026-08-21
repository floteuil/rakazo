import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeWebSearch,
  formatCitations,
  getSearxngEndpoints,
  type WebSearchResultItem,
} from "./web-search.js";

describe("web-search", () => {
  const originalEnv = process.env.SEARXNG_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.SEARXNG_URL;
  });

  afterEach(() => {
    process.env.SEARXNG_URL = originalEnv;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("getSearxngEndpoints", () => {
    it("returns default docker and local endpoints when SEARXNG_URL is unset", () => {
      const endpoints = getSearxngEndpoints();
      expect(endpoints).toContain("http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080");
      expect(endpoints).toContain("http://127.0.0.1:8080");
      expect(endpoints[0]).toBe("http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080");
    });

    it("prioritizes custom SEARXNG_URL when set in environment", () => {
      process.env.SEARXNG_URL = "http://custom-searxng.internal:9090/";
      const endpoints = getSearxngEndpoints();
      expect(endpoints[0]).toBe("http://custom-searxng.internal:9090");
      expect(endpoints).toContain("http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080");
    });
  });

  describe("formatCitations", () => {
    it("returns empty string for empty results", () => {
      expect(formatCitations([])).toBe("");
    });

    it("formats markdown citations with numbering, title, url, snippet, and date", () => {
      const items: WebSearchResultItem[] = [
        {
          title: "First Article",
          url: "https://example.com/1",
          snippet: "This is a summary.",
          publishedDate: "2026-08-20",
        },
        {
          title: "Second Article",
          url: "https://example.com/2",
          snippet: "Another summary.",
        },
      ];

      const formatted = formatCitations(items);
      expect(formatted).toContain(
        "[1] [First Article](https://example.com/1) (2026-08-20) - This is a summary.",
      );
      expect(formatted).toContain("[2] [Second Article](https://example.com/2) - Another summary.");
    });

    it("handles items with missing snippets gracefully", () => {
      const items: WebSearchResultItem[] = [
        {
          title: "Title Only",
          url: "https://example.com/title",
          snippet: "",
        },
      ];
      expect(formatCitations(items)).toBe("[1] [Title Only](https://example.com/title)");
    });
  });

  describe("executeWebSearch", () => {
    it("returns an error if query is empty or only whitespace", async () => {
      const result = await executeWebSearch({ query: "   " });
      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.error).toMatch(/Search query must not be empty/i);
    });

    it("successfully queries SearXNG and parses JSON results with citations", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          query: "tech trends",
          number_of_results: 2,
          results: [
            {
              title: "<b>AI Trends</b> 2026",
              url: "https://news.tech.com/ai-2026",
              content: "Summary of <em>emerging</em> tech.",
              engine: "google",
              publishedDate: "2026-08-15",
            },
            {
              title: "Cloud Infrastructure",
              url: "https://cloud.tech.com/infra",
              content: "Latest in cloud deployments.",
              engine: "bing",
            },
          ],
        }),
      });
      globalThis.fetch = mockFetch;

      const result = await executeWebSearch({
        query: "tech trends",
        categories: "it",
        language: "fr",
        time_range: "week",
        max_results: 5,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const calledUrl = new URL(mockFetch.mock.calls[0]![0] as string);
      expect(calledUrl.searchParams.get("q")).toBe("tech trends");
      expect(calledUrl.searchParams.get("format")).toBe("json");
      expect(calledUrl.searchParams.get("categories")).toBe("it");
      expect(calledUrl.searchParams.get("language")).toBe("fr");
      expect(calledUrl.searchParams.get("time_range")).toBe("week");

      expect(result.count).toBe(2);
      expect(result.results[0]!.title).toBe("AI Trends 2026");
      expect(result.results[0]!.snippet).toBe("Summary of emerging tech.");
      expect(result.results[0]!.publishedDate).toBe("2026-08-15");
      expect(result.formattedCitations).toContain(
        "[1] [AI Trends 2026](https://news.tech.com/ai-2026)",
      );
    });

    it("falls back to the secondary endpoint if the primary endpoint fails", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("connect ECONNREFUSED");
        }
        return {
          ok: true,
          json: async () => ({
            query: "fallback query",
            results: [
              {
                title: "Fallback Result",
                url: "https://fallback.com",
                content: "Found on localhost fallback.",
              },
            ],
          }),
        };
      });
      globalThis.fetch = mockFetch;

      const result = await executeWebSearch({ query: "fallback query" });

      expect(callCount).toBe(2);
      expect(result.count).toBe(1);
      expect(result.results[0]!.url).toBe("https://fallback.com");
    });

    it("returns a graceful error when all endpoints fail", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network unreachable"));

      const result = await executeWebSearch({ query: "offline test" });

      expect(result.count).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.error).toMatch(/SearXNG search service unavailable/i);
    });

    it("returns an error if SearXNG responds with non-200 HTTP status", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      });

      const result = await executeWebSearch({ query: "gateway error" });

      expect(result.count).toBe(0);
      expect(result.error).toMatch(/HTTP 502/);
    });
  });
});
