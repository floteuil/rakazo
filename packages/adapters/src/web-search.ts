export interface WebSearchArgs {
  query: string;
  categories?: string;
  language?: string;
  time_range?: string;
  max_results?: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  publishedDate?: string | null;
}

export interface WebSearchResult {
  query: string;
  count: number;
  results: WebSearchResultItem[];
  formattedCitations: string;
  error?: string;
}

export interface SearxngRawResult {
  url?: string;
  title?: string;
  content?: string;
  snippet?: string;
  engine?: string;
  publishedDate?: string | null;
  published_date?: string | null;
}

export interface SearxngRawResponse {
  query?: string;
  number_of_results?: number;
  results?: SearxngRawResult[];
  error?: string;
}

const DEFAULT_SEARXNG_URL = "http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080";
const LOCAL_SEARXNG_URL = "http://127.0.0.1:8080";

function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function formatCitations(results: WebSearchResultItem[]): string {
  if (!results.length) return "";
  return results
    .map((item, idx) => {
      const num = idx + 1;
      const title = item.title.trim() || item.url;
      const snippet = item.snippet.trim();
      const meta = item.publishedDate ? ` (${item.publishedDate})` : "";
      return snippet
        ? `[${num}] [${title}](${item.url})${meta} - ${snippet}`
        : `[${num}] [${title}](${item.url})${meta}`;
    })
    .join("\n");
}

export function getSearxngEndpoints(): string[] {
  const endpoints: string[] = [];
  if (process.env.SEARXNG_URL) {
    endpoints.push(process.env.SEARXNG_URL.replace(/\/+$/, ""));
  }
  if (!endpoints.includes(DEFAULT_SEARXNG_URL)) {
    endpoints.push(DEFAULT_SEARXNG_URL);
  }
  if (!endpoints.includes(LOCAL_SEARXNG_URL)) {
    endpoints.push(LOCAL_SEARXNG_URL);
  }
  return endpoints;
}

export async function executeWebSearch(
  args: WebSearchArgs,
  context?: { signal?: AbortSignal },
): Promise<WebSearchResult> {
  const query = (args.query || "").trim();
  if (!query) {
    return {
      query: "",
      count: 0,
      results: [],
      formattedCitations: "",
      error: "Search query must not be empty.",
    };
  }

  const maxResults =
    typeof args.max_results === "number" && args.max_results > 0
      ? Math.min(args.max_results, 50)
      : 10;

  const params = new URLSearchParams({
    q: query,
    format: "json",
    safesearch: "1",
    language: args.language || "auto",
  });

  if (args.categories) {
    params.set("categories", args.categories);
  }
  if (args.time_range) {
    params.set("time_range", args.time_range);
  }

  const endpoints = getSearxngEndpoints();
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const targetUrl = `${endpoint}/search?${params.toString()}`;
    const timeoutSignal = AbortSignal.timeout(10000);
    const combinedSignal = context?.signal
      ? typeof AbortSignal.any === "function"
        ? AbortSignal.any([timeoutSignal, context.signal])
        : timeoutSignal
      : timeoutSignal;

    try {
      const res = await fetch(targetUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Rakazo-WebSearch/1.0",
        },
        signal: combinedSignal,
      });

      if (!res.ok) {
        throw new Error(`SearXNG responded with HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as SearxngRawResponse;
      const rawResults = Array.isArray(data.results) ? data.results : [];

      const parsedResults: WebSearchResultItem[] = rawResults
        .slice(0, maxResults)
        .map((r) => ({
          title: stripHtmlTags(r.title || ""),
          url: r.url || "",
          snippet: stripHtmlTags(r.content || r.snippet || ""),
          engine: r.engine,
          publishedDate: r.publishedDate || r.published_date || null,
        }))
        .filter((r) => Boolean(r.url));

      const citations = formatCitations(parsedResults);

      return {
        query,
        count: parsedResults.length,
        results: parsedResults,
        formattedCitations: citations,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Try next endpoint in fallback list
    }
  }

  return {
    query,
    count: 0,
    results: [],
    formattedCitations: "",
    error: `SearXNG search service unavailable: ${lastError?.message || "connection failed"}.`,
  };
}
