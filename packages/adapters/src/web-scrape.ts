export interface WebScrapeArgs {
  url: string;
  selector?: string;
  maxLength?: number;
}

export interface WebScrapeResult {
  url: string;
  title?: string;
  content: string;
  length: number;
  truncated: boolean;
  error?: string;
}

const DEFAULT_MAX_LENGTH = 20_000;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function convertHtmlToMarkdown(html: string): string {
  let md = html;

  // 1. Strip comments
  md = md.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Strip non-content / boilerplate blocks
  md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  md = md.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "");
  md = md.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");
  md = md.replace(/<canvas\b[^<]*(?:(?!<\/canvas>)<[^<]*)*<\/canvas>/gi, "");
  md = md.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "");
  md = md.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "");
  md = md.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "");
  md = md.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, "");
  md = md.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "");
  md = md.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, "");

  // 3. Convert code blocks (<pre><code>...</code></pre>)
  md = md.replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, "")).trim()}\n\`\`\`\n\n`;
  });
  md = md.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return `\n\n\`\`\`\n${decodeHtmlEntities(code.replace(/<[^>]+>/g, "")).trim()}\n\`\`\`\n\n`;
  });
  md = md.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inline) => {
    const clean = decodeHtmlEntities(inline.replace(/<[^>]+>/g, "")).trim();
    return clean ? ` \`${clean}\` ` : "";
  });

  // 4. Convert headings
  md = md.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, text) => `\n\n# ${text.trim()}\n\n`);
  md = md.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, text) => `\n\n## ${text.trim()}\n\n`);
  md = md.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, text) => `\n\n### ${text.trim()}\n\n`);
  md = md.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_, text) => `\n\n#### ${text.trim()}\n\n`);
  md = md.replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, (_, text) => `\n\n##### ${text.trim()}\n\n`);
  md = md.replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, (_, text) => `\n\n###### ${text.trim()}\n\n`);

  // 5. Convert structural and inline markup
  md = md.replace(/<hr\b[^>]*>/gi, "\n\n---\n\n");
  md = md.replace(/<br\b[^>]*>/gi, "\n");
  md = md.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => `\n\n${text.trim()}\n\n`);
  md = md.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, text) => {
    const lines = text
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
    return `\n\n${lines.map((l: string) => `> ${l}`).join("\n")}\n\n`;
  });

  // 6. Convert tables
  md = md.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows: string[][] = [];
    const rowMatches = tableContent.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi) || [];

    for (const rowHtml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowHtml.match(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi) || [];
      for (const cellHtml of cellMatches) {
        const cellText = decodeHtmlEntities(cellHtml.replace(/<[^>]+>/g, ""))
          .replace(/\s+/g, " ")
          .trim();
        cells.push(cellText);
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return "";
    const colCount = Math.max(...rows.map((r) => r.length));
    const header = rows[0]!;
    while (header.length < colCount) header.push("");

    let tableMd = `\n\n| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |\n`;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      while (row.length < colCount) row.push("");
      tableMd += `| ${row.join(" | ")} |\n`;
    }
    return `${tableMd}\n`;
  });

  // 7. Convert lists
  md = md.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `\n* ${text.trim()}`);
  md = md.replace(/<\/?(?:ul|ol)\b[^>]*>/gi, "\n");

  // 8. Convert links and emphasis
  md = md.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    if (!cleanText || href.startsWith("javascript:")) return cleanText;
    return `[${cleanText}](${href.trim()})`;
  });
  md = md.replace(
    /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi,
    (_, text) => `**${text.trim()}**`,
  );
  md = md.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, text) => `*${text.trim()}*`);

  // 9. Strip all remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // 10. Decode entities & clean up blank lines
  md = decodeHtmlEntities(md);
  md = md
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return md;
}

async function scrapeWithScraperr(
  url: string,
  scraperrUrl: string,
  signal?: AbortSignal,
): Promise<{ title?: string; content: string } | null> {
  const base = scraperrUrl.replace(/\/+$/, "");
  const target = `${base}/api/scrape`;
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; markdown?: string; content?: string };
    const content = data.markdown || data.content;
    if (content) {
      return { title: data.title, content };
    }
    return null;
  } catch {
    return null;
  }
}

export async function executeWebScrape(
  args: WebScrapeArgs,
  context?: { signal?: AbortSignal },
): Promise<WebScrapeResult> {
  const rawUrl = (args.url || "").trim();
  if (!rawUrl) {
    return {
      url: "",
      content: "",
      length: 0,
      truncated: false,
      error: "URL must not be empty.",
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl,
      content: "",
      length: 0,
      truncated: false,
      error: `Invalid URL format: ${rawUrl}`,
    };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      url: rawUrl,
      content: "",
      length: 0,
      truncated: false,
      error: `Unsupported protocol ${parsedUrl.protocol}. Only http and https URLs are allowed.`,
    };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === "169.254.169.254" ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname.endsWith(".internal")
  ) {
    return {
      url: rawUrl,
      content: "",
      length: 0,
      truncated: false,
      error: `Access to private or metadata network address ${hostname} is blocked for security.`,
    };
  }

  const maxLength =
    typeof args.maxLength === "number" && args.maxLength > 0 ? args.maxLength : DEFAULT_MAX_LENGTH;

  const timeoutSignal = AbortSignal.timeout(15000);
  const combinedSignal = context?.signal
    ? typeof AbortSignal.any === "function"
      ? AbortSignal.any([timeoutSignal, context.signal])
      : timeoutSignal
    : timeoutSignal;

  // Check optional Scraperr forwarding
  if (process.env.SCRAPERR_URL) {
    const scraperrResult = await scrapeWithScraperr(
      parsedUrl.toString(),
      process.env.SCRAPERR_URL,
      combinedSignal,
    );
    if (scraperrResult) {
      let content = scraperrResult.content.trim();
      let truncated = false;
      if (content.length > maxLength) {
        content =
          content.slice(0, maxLength) + `\n\n... [Content truncated at ${maxLength} characters]`;
        truncated = true;
      }
      return {
        url: parsedUrl.toString(),
        title: scraperrResult.title,
        content,
        length: content.length,
        truncated,
      };
    }
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Rakazo/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
      },
      signal: combinedSignal,
    });

    if (!response.ok) {
      return {
        url: parsedUrl.toString(),
        content: "",
        length: 0,
        truncated: false,
        error: `Failed to fetch URL with HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();

    // Extract title
    let title: string | undefined;
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, "").trim());
    }

    // If a selector is provided, check if section can be targeted
    let targetHtml = html;
    if (args.selector) {
      const sel = args.selector.replace(/^[#.]/, "");
      const sectionRegex = new RegExp(
        `<(?:div|section|article|main)[^>]+(?:id|class)=["'][^"']*${sel}[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:div|section|article|main)>`,
        "i",
      );
      const match = html.match(sectionRegex);
      if (match && match[1]) {
        targetHtml = match[1];
      }
    }

    let markdown = convertHtmlToMarkdown(targetHtml);
    let truncated = false;

    if (markdown.length > maxLength) {
      markdown =
        markdown.slice(0, maxLength) + `\n\n... [Content truncated at ${maxLength} characters]`;
      truncated = true;
    }

    return {
      url: parsedUrl.toString(),
      title,
      content: markdown,
      length: markdown.length,
      truncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      url: parsedUrl.toString(),
      content: "",
      length: 0,
      truncated: false,
      error: `Scraping error: ${message}`,
    };
  }
}
