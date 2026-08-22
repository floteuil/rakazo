/**
 * Semantic Tool Response Compactor
 *
 * Compresses large and verbose tool execution payloads into semantically dense,
 * token-efficient representations before LLM context ingestion.
 */

export const MAX_SHELL_OUTPUT_CHARS = 4000;
export const MAX_FILE_ENTRIES_BEFORE_COMPACT = 40;
export const MAX_FILE_SAMPLE_ENTRIES = 30;
export const MAX_GENERIC_RESULT_CHARS = 12000;
export const MAX_GITHUB_REPOS = 30;
export const MAX_GITHUB_ISSUES = 30;
export const MAX_NOTION_RESULTS = 30;
export const MAX_CLOUDFLARE_RECORDS = 50;

/**
 * Strips nulls, undefined, and empty objects recursively.
 */
export function cleanJsonPayload(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  if (Array.isArray(value)) {
    const cleaned = value.map(cleanJsonPayload).filter((v) => v !== undefined);
    return cleaned;
  }

  if (typeof value === "object") {
    const res: Record<string, unknown> = {};
    let hasKeys = false;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanJsonPayload(v);
      if (cleaned !== undefined) {
        // Drop empty objects (except if originally special)
        if (
          typeof cleaned === "object" &&
          cleaned !== null &&
          !Array.isArray(cleaned) &&
          Object.keys(cleaned).length === 0
        ) {
          continue;
        }
        res[k] = cleaned;
        hasKeys = true;
      }
    }
    return hasKeys ? res : undefined;
  }

  return value;
}

/**
 * Safely truncates a JSON object/string under maxChars without breaking JSON structure.
 */
export function safelyTruncateJson(value: unknown, maxChars = MAX_GENERIC_RESULT_CHARS): string {
  if (value === null || value === undefined) {
    return "ok";
  }

  if (typeof value === "string") {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars - 1)}…`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    const cleaned = typeof value === "object" && value !== null ? cleanJsonPayload(value) : value;
    if (cleaned === undefined) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        return "{}";
      }
      return "ok";
    }

    const text = JSON.stringify(cleaned);
    if (!text) return "ok";
    if (text.length <= maxChars) return text;

    // If it's an array that's too long, truncate array elements
    if (Array.isArray(cleaned)) {
      let low = 0;
      let high = cleaned.length;
      let bestStr = "";
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const sub = cleaned.slice(0, mid);
        const testStr = JSON.stringify(sub);
        if (testStr.length <= maxChars) {
          bestStr = testStr;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (bestStr && bestStr !== "[]") {
        return bestStr;
      }
    }

    // If it's an object that's too long, truncate string values
    if (typeof cleaned === "object" && cleaned !== null) {
      const shallow = { ...(cleaned as Record<string, unknown>) };
      for (const key of Object.keys(shallow)) {
        if (typeof shallow[key] === "string" && (shallow[key] as string).length > 200) {
          shallow[key] = (shallow[key] as string).slice(0, 200) + "… [truncated]";
        }
      }
      const attempt = JSON.stringify(shallow);
      if (attempt.length <= maxChars) return attempt;
    }

    // Fallback: slice string and append ellipsis
    return `${text.slice(0, maxChars - 1)}…`;
  } catch {
    try {
      const fallback =
        typeof value === "object" && value !== null
          ? Object.prototype.toString.call(value)
          : String(value);
      return fallback.length > maxChars ? `${fallback.slice(0, maxChars - 1)}…` : fallback;
    } catch {
      return "[unserializable payload]";
    }
  }
}

/**
 * Compacts list_files output.
 * when count > 40 entries, output directory structure breakdown, top 30 files, and summary line ... (+X more files)
 */
function compactListFiles(result: unknown): string {
  if (result === null || result === undefined) return "ok";

  let list: unknown[] | null = null;
  if (Array.isArray(result)) {
    list = result;
  } else if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.files)) list = obj.files;
    else if (Array.isArray(obj.entries)) list = obj.entries;
    else if (Array.isArray(obj.items)) list = obj.items;
  }

  if (!list) {
    if (typeof result === "string") {
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) return compactListFiles(parsed);
      } catch {
        // String not JSON
      }
    }
    return safelyTruncateJson(result);
  }

  if (list.length === 0) {
    return "[]";
  }

  if (list.length <= MAX_FILE_ENTRIES_BEFORE_COMPACT) {
    return JSON.stringify(list);
  }

  // Count > 40 entries
  const paths = list.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      if (typeof o.path === "string") return o.path;
      if (typeof o.name === "string") return o.name;
    }
    return JSON.stringify(item);
  });

  // Directory structure breakdown
  const dirCounts = new Map<string, number>();
  for (const p of paths) {
    const parts = p.replace(/^\/+/, "").split("/");
    const topDir = parts.length > 1 ? `${parts[0]}/` : "(root)";
    dirCounts.set(topDir, (dirCounts.get(topDir) ?? 0) + 1);
  }

  const dirSummary = Array.from(dirCounts.entries())
    .map(([dir, count]) => `${dir} (${count})`)
    .join(", ");

  const sampleCount = Math.min(paths.length, MAX_FILE_SAMPLE_ENTRIES);
  const sample = paths.slice(0, sampleCount);
  const remaining = list.length - sampleCount;

  return `Found ${list.length} files across directories (${dirSummary}) (showing first ${sampleCount}):\n${sample.join("\n")}\n... (+${remaining} more files)`;
}

/**
 * Compacts shell output.
 * when stdout+stderr > 4,000 characters, keep first 2,000 characters and last 2,000 characters with clear [... X characters truncated ...] marker
 */
function compactShell(result: unknown): string {
  if (result === null || result === undefined) return "ok";

  let text = "";
  if (typeof result === "string") {
    text = result;
  } else if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (obj.output !== undefined && obj.output !== null) {
      text = String(obj.output);
    } else if (obj.stdout !== undefined || obj.stderr !== undefined) {
      const stdout = obj.stdout !== undefined && obj.stdout !== null ? String(obj.stdout) : "";
      const stderr = obj.stderr !== undefined && obj.stderr !== null ? String(obj.stderr) : "";
      if (stdout && stderr) {
        text = `${stdout}\n${stderr}`;
      } else {
        text = stdout || stderr;
      }
    } else {
      text = JSON.stringify(result);
    }
  } else {
    text = String(result);
  }

  if (text.length <= MAX_SHELL_OUTPUT_CHARS) {
    return text;
  }

  const head = text.slice(0, 2000);
  const tail = text.slice(-2000);
  const omitted = text.length - 4000;
  return `${head}\n[... ${omitted} characters truncated ...]\n${tail}`;
}

/**
 * Compacts github_search_repos output.
 * compact repo objects to { total_count, items: repo.map(r => `${r.full_name} (${r.stars}⭐, ${r.language}) - ${r.description}`) }
 */
function compactGithubSearchRepos(result: unknown): string {
  if (result === null || result === undefined) return "ok";

  let repos: unknown[] | null = null;
  let totalCount = 0;

  if (Array.isArray(result)) {
    repos = result;
    totalCount = result.length;
  } else if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      repos = obj.items;
      totalCount = typeof obj.total_count === "number" ? obj.total_count : repos.length;
    } else if (Array.isArray(obj.repositories)) {
      repos = obj.repositories;
      totalCount = typeof obj.total_count === "number" ? obj.total_count : repos.length;
    }
  }

  if (!repos) {
    return safelyTruncateJson(result);
  }

  if (repos.length === 0) {
    return Array.isArray(result) ? "[]" : JSON.stringify({ total_count: 0, items: [] });
  }

  const items = repos.slice(0, MAX_GITHUB_REPOS).map((r) => {
    if (!r || typeof r !== "object") return String(r);
    const repo = r as Record<string, unknown>;
    const fullName = String(repo.full_name || repo.name || "unknown");
    const stars = repo.stars ?? repo.stargazers_count ?? 0;
    const language = repo.language ? String(repo.language) : "unknown";
    const desc = repo.description ? String(repo.description).slice(0, 200) : "";
    return `${fullName} (${stars}⭐, ${language}) - ${desc}`.trim();
  });

  return JSON.stringify({
    total_count: totalCount,
    items,
  });
}

/**
 * Compacts github_list_issues output.
 * compact to list of #number [state] title (@author)
 */
function compactGithubListIssues(result: unknown): string {
  if (result === null || result === undefined) return "ok";

  let issues: unknown[] | null = null;
  if (Array.isArray(result)) {
    issues = result;
  } else if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.issues)) issues = obj.issues;
    else if (Array.isArray(obj.items)) issues = obj.items;
  }

  if (!issues) {
    return safelyTruncateJson(result);
  }

  if (issues.length === 0) {
    return "[]";
  }

  const compacted = issues.slice(0, MAX_GITHUB_ISSUES).map((item) => {
    if (!item || typeof item !== "object") return String(item);
    const issue = item as Record<string, unknown>;
    const number = issue.number ?? issue.id ?? "?";
    const state = String(issue.state || "open");
    const title = String(issue.title || "Untitled");
    const author =
      issue.author ||
      (issue.user && typeof issue.user === "object"
        ? (issue.user as Record<string, unknown>).login
        : issue.user) ||
      "unknown";
    return `#${number} [${state}] ${title} (@${author})`;
  });

  return JSON.stringify(compacted);
}

/**
 * Extracts plain text from Notion title/Name properties.
 */
function extractNotionTitle(item: Record<string, unknown>): string {
  if (typeof item.title === "string" && item.title) return item.title;
  if (Array.isArray(item.title) && item.title.length > 0) {
    return item.title
      .map((t: unknown) =>
        t && typeof t === "object" && "plain_text" in t
          ? String((t as { plain_text: unknown }).plain_text)
          : "",
      )
      .join("");
  }
  if (item.properties && typeof item.properties === "object") {
    const props = item.properties as Record<string, unknown>;
    for (const key of ["Name", "name", "title", "Title", "Task", "task"]) {
      const p = props[key];
      if (p && typeof p === "object") {
        const propObj = p as Record<string, unknown>;
        if (Array.isArray(propObj.title) && propObj.title.length > 0) {
          return propObj.title
            .map((t: unknown) =>
              t && typeof t === "object" && "plain_text" in t
                ? String((t as { plain_text: unknown }).plain_text)
                : "",
            )
            .join("");
        }
      }
    }
    for (const p of Object.values(props)) {
      if (p && typeof p === "object") {
        const propObj = p as Record<string, unknown>;
        if (propObj.type === "title" && Array.isArray(propObj.title) && propObj.title.length > 0) {
          return propObj.title
            .map((t: unknown) =>
              t && typeof t === "object" && "plain_text" in t
                ? String((t as { plain_text: unknown }).plain_text)
                : "",
            )
            .join("");
        }
      }
    }
  }
  return "";
}

/**
 * Compacts notion_search and notion_query_database output.
 * strip deeply nested block structures, return concise page/DB summaries
 */
function compactNotionResult(toolName: string, result: unknown): string {
  if (result === null || result === undefined) return "ok";

  let items: unknown[] | null = null;
  if (Array.isArray(result)) {
    items = result;
  } else if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.results)) items = obj.results;
    else if (Array.isArray(obj.items)) items = obj.items;
  }

  if (!items) {
    return safelyTruncateJson(result);
  }

  if (items.length === 0) {
    return "[]";
  }

  const compacted = items.slice(0, MAX_NOTION_RESULTS).map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const item = raw as Record<string, unknown>;
    const summary: Record<string, unknown> = {
      id: item.id,
      object: item.object || "page",
      title: extractNotionTitle(item),
      url: item.url || "",
    };

    if (item.last_edited_time) {
      summary.last_edited_time = item.last_edited_time;
    }

    if (
      toolName === "notion_query_database" &&
      item.properties &&
      typeof item.properties === "object"
    ) {
      const flattenedProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item.properties as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const prop = v as Record<string, unknown>;
        const type = String(prop.type || "");
        if (type === "title" && Array.isArray(prop.title)) {
          flattenedProps[k] = prop.title
            .map((t: unknown) =>
              t && typeof t === "object" && "plain_text" in t
                ? String((t as { plain_text: unknown }).plain_text)
                : "",
            )
            .join("");
        } else if (type === "rich_text" && Array.isArray(prop.rich_text)) {
          flattenedProps[k] = prop.rich_text
            .map((t: unknown) =>
              t && typeof t === "object" && "plain_text" in t
                ? String((t as { plain_text: unknown }).plain_text)
                : "",
            )
            .join("");
        } else if (type === "select" && prop.select && typeof prop.select === "object") {
          flattenedProps[k] = (prop.select as Record<string, unknown>).name;
        } else if (type === "multi_select" && Array.isArray(prop.multi_select)) {
          flattenedProps[k] = prop.multi_select.map((s: unknown) =>
            s && typeof s === "object" ? String((s as Record<string, unknown>).name) : String(s),
          );
        } else if (type === "status" && prop.status && typeof prop.status === "object") {
          flattenedProps[k] = (prop.status as Record<string, unknown>).name;
        } else if (type === "number") {
          flattenedProps[k] = prop.number;
        } else if (type === "checkbox") {
          flattenedProps[k] = prop.checkbox;
        } else if (type === "date" && prop.date && typeof prop.date === "object") {
          flattenedProps[k] = (prop.date as Record<string, unknown>).start;
        } else if (type === "email" || type === "url" || type === "phone_number") {
          flattenedProps[k] = prop[type];
        }
      }
      summary.properties = flattenedProps;
    }

    return summary;
  });

  return JSON.stringify(compacted);
}

/**
 * Compacts cloudflare_list_dns_records output.
 * format as a clean tabular array [type, name, content, proxied]
 */
function compactCloudflareListDnsRecords(result: unknown): string {
  if (result === null || result === undefined) return "ok";

  let records: unknown[] | null = null;
  if (Array.isArray(result)) {
    records = result;
  } else if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.records)) records = obj.records;
    else if (Array.isArray(obj.result)) records = obj.result;
  }

  if (!records) {
    return safelyTruncateJson(result);
  }

  if (records.length === 0) {
    return "[]";
  }

  const tabular = records.slice(0, MAX_CLOUDFLARE_RECORDS).map((r) => {
    if (!r || typeof r !== "object") return r;
    const rec = r as Record<string, unknown>;
    const type = String(rec.type || "");
    const name = String(rec.name || "");
    const content = String(rec.content || "");
    const proxied = Boolean(rec.proxied);
    return [type, name, content, proxied];
  });

  return JSON.stringify(tabular);
}

/**
 * Master semantic compaction entrypoint.
 * Transforms raw tool outputs into compact, semantically dense representations for the LLM context.
 */
export function compactToolResult(toolName: string, result: unknown): string {
  if (result === null || result === undefined) {
    return "ok";
  }

  try {
    switch (toolName) {
      case "list_files":
        return compactListFiles(result);

      case "shell":
        return compactShell(result);

      case "github_search_repos":
        return compactGithubSearchRepos(result);

      case "github_list_issues":
        return compactGithubListIssues(result);

      case "notion_search":
      case "notion_query_database":
        return compactNotionResult(toolName, result);

      case "cloudflare_list_dns_records":
        return compactCloudflareListDnsRecords(result);

      default:
        return safelyTruncateJson(result);
    }
  } catch {
    return safelyTruncateJson(result);
  }
}
