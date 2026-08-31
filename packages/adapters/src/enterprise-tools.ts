import type { ConnectorTool } from "@rakazo/adapter-kit";

/* ========================================================================== */
/* Utility & Resilience Helpers                                              */
/* ========================================================================== */

export function createCombinedSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }
  return timeoutSignal;
}

export function sanitizeToolError(message: string): string {
  return message
    .replace(/ghp_[a-zA-Z0-9_]+/g, "ghp_[redacted]")
    .replace(/github_pat_[a-zA-Z0-9_]+/g, "github_pat_[redacted]")
    .replace(/secret_[a-zA-Z0-9_]+/g, "secret_[redacted]")
    .replace(/ntn_[a-zA-Z0-9_]+/g, "ntn_[redacted]")
    .replace(/pk_[a-zA-Z0-9_]+/g, "pk_[redacted]")
    .replace(/nova_[a-zA-Z0-9_]+/g, "nova_[redacted]")
    .replace(/n8n_api_[a-zA-Z0-9_]+/g, "n8n_api_[redacted]")
    .replace(/cf_token_[a-zA-Z0-9_-]+/g, "cf_token_[redacted]")
    .replace(/cfat_[a-zA-Z0-9_-]+/g, "cfat_[redacted]")
    .replace(/sk-or-[a-zA-Z0-9_-]+/g, "sk-or-[redacted]")
    .replace(/sk-ant-[a-zA-Z0-9_-]+/g, "sk-ant-[redacted]")
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "sk-[redacted]")
    .replace(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@/g, "postgres://$1:[redacted]@")
    .replace(/Bearer\s+[a-zA-Z0-9_\-.+/=]+/gi, "Bearer [redacted]")
    .replace(/Basic\s+[a-zA-Z0-9_\-.+/=]+/gi, "Basic [redacted]");
}

async function safeFetchJson<T>(
  url: string,
  options: RequestInit,
  serviceName: string,
  context?: { signal?: AbortSignal },
  timeoutMs = 15000,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const signal = createCombinedSignal(timeoutMs, context?.signal);
  try {
    const res = await fetch(url, { ...options, signal });
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const errMsg =
        json &&
        typeof json === "object" &&
        "message" in json &&
        typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : json && typeof json === "object" && "error" in json
            ? typeof (json as { error?: unknown }).error === "string"
              ? (json as { error: string }).error
              : JSON.stringify((json as { error?: unknown }).error)
            : `HTTP ${res.status} ${res.statusText}`;
      return {
        ok: false,
        error: sanitizeToolError(`${serviceName} API error: ${errMsg}`),
        status: res.status,
      };
    }

    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: sanitizeToolError(`${serviceName} request failed: ${message}`),
    };
  }
}

/* ========================================================================== */
/* 1. GitHub Integration                                                      */
/* ========================================================================== */

function getGithubConfig() {
  const token = process.env.GITHUB_TOKEN?.trim();
  const apiUrl = (process.env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(
    /\/+$/,
    "",
  );
  return { token, apiUrl };
}

function getGithubHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Rakazo-Agent/1.0",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export interface GithubSearchReposArgs {
  q: string;
  sort?: "stars" | "forks" | "help-wanted-issues" | "updated";
  order?: "desc" | "asc";
  per_page?: number;
  page?: number;
}

export async function executeGithubSearchRepos(
  args: GithubSearchReposArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getGithubConfig();
  const q = (args.q || "").trim();
  if (!q) return { error: "GitHub search query 'q' must not be empty." };

  const params = new URLSearchParams({ q });
  if (args.sort) params.set("sort", args.sort);
  if (args.order) params.set("order", args.order);
  if (args.per_page) params.set("per_page", String(Math.min(args.per_page, 100)));
  if (args.page) params.set("page", String(args.page));

  const url = `${apiUrl}/search/repositories?${params.toString()}`;
  const res = await safeFetchJson<{
    total_count: number;
    items: Array<{
      id: number;
      name: string;
      full_name: string;
      description: string | null;
      html_url: string;
      stargazers_count: number;
      language: string | null;
      forks_count: number;
      updated_at: string;
    }>;
  }>(url, { method: "GET", headers: getGithubHeaders(token) }, "GitHub", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    total_count: res.data.total_count,
    items: (res.data.items || []).map((repo) => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      stars: repo.stargazers_count,
      language: repo.language,
      forks: repo.forks_count,
      updated_at: repo.updated_at,
    })),
  };
}

export interface GithubGetFileContentsArgs {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

export async function executeGithubGetFileContents(
  args: GithubGetFileContentsArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getGithubConfig();
  const owner = (args.owner || "").trim();
  const repo = (args.repo || "").trim();
  const path = (args.path || "").replace(/^\/+/, "");
  if (!owner || !repo || !path) {
    return { error: "Missing required parameters: 'owner', 'repo', and 'path' are required." };
  }

  const params = new URLSearchParams();
  if (args.ref) params.set("ref", args.ref);
  const query = params.toString() ? `?${params.toString()}` : "";
  const url = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}${query}`;

  const res = await safeFetchJson<{
    name: string;
    path: string;
    sha: string;
    size: number;
    type: string;
    content?: string;
    encoding?: string;
    html_url: string;
    download_url: string | null;
  }>(url, { method: "GET", headers: getGithubHeaders(token) }, "GitHub", context);

  if (!res.ok) return { error: res.error, status: res.status };

  let decodedContent: string | undefined;
  if (res.data.encoding === "base64" && res.data.content) {
    try {
      decodedContent = Buffer.from(res.data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    } catch {
      decodedContent = "[Binary or undecodable content]";
    }
  }

  return {
    name: res.data.name,
    path: res.data.path,
    sha: res.data.sha,
    size: res.data.size,
    type: res.data.type,
    content: decodedContent ?? res.data.content,
    html_url: res.data.html_url,
    download_url: res.data.download_url,
  };
}

export interface GithubListIssuesArgs {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  labels?: string;
  per_page?: number;
  page?: number;
  sort?: "created" | "updated" | "comments";
  direction?: "asc" | "desc";
}

export async function executeGithubListIssues(
  args: GithubListIssuesArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getGithubConfig();
  const owner = (args.owner || "").trim();
  const repo = (args.repo || "").trim();
  if (!owner || !repo) return { error: "'owner' and 'repo' are required." };

  const params = new URLSearchParams();
  if (args.state) params.set("state", args.state);
  if (args.labels) params.set("labels", args.labels);
  if (args.sort) params.set("sort", args.sort);
  if (args.direction) params.set("direction", args.direction);
  if (args.per_page) params.set("per_page", String(Math.min(args.per_page, 100)));
  if (args.page) params.set("page", String(args.page));

  const url = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params.toString()}`;
  const res = await safeFetchJson<
    Array<{
      id: number;
      number: number;
      title: string;
      state: string;
      user: { login: string } | null;
      html_url: string;
      comments: number;
      labels: Array<{ name: string }>;
      created_at: string;
      body: string | null;
      pull_request?: unknown;
    }>
  >(url, { method: "GET", headers: getGithubHeaders(token) }, "GitHub", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    issues: (res.data || []).map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user?.login,
      html_url: issue.html_url,
      comments: issue.comments,
      labels: (issue.labels || []).map((l) => l.name),
      created_at: issue.created_at,
      is_pull_request: Boolean(issue.pull_request),
      body_preview: issue.body
        ? issue.body.length > 300
          ? `${issue.body.slice(0, 300)}…`
          : issue.body
        : "",
    })),
  };
}

export interface GithubCreateIssueArgs {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export async function executeGithubCreateIssue(
  args: GithubCreateIssueArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getGithubConfig();
  if (!token) return { error: "GitHub integration is not configured. Please set GITHUB_TOKEN." };

  const owner = (args.owner || "").trim();
  const repo = (args.repo || "").trim();
  const title = (args.title || "").trim();
  if (!owner || !repo || !title) {
    return { error: "Missing required parameters: 'owner', 'repo', and 'title' are required." };
  }

  const url = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;
  const headers = { ...getGithubHeaders(token), "Content-Type": "application/json" };
  const res = await safeFetchJson<{
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    created_at: string;
  }>(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        body: args.body,
        labels: args.labels,
        assignees: args.assignees,
      }),
    },
    "GitHub",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    number: res.data.number,
    title: res.data.title,
    state: res.data.state,
    html_url: res.data.html_url,
    created_at: res.data.created_at,
  };
}

export interface GithubGetPullRequestArgs {
  owner: string;
  repo: string;
  pull_number: number;
}

export async function executeGithubGetPullRequest(
  args: GithubGetPullRequestArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getGithubConfig();
  const owner = (args.owner || "").trim();
  const repo = (args.repo || "").trim();
  const pullNumber = Number(args.pull_number);
  if (!owner || !repo || !pullNumber) {
    return { error: "'owner', 'repo', and 'pull_number' are required." };
  }

  const url = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`;
  const res = await safeFetchJson<{
    number: number;
    title: string;
    state: string;
    user: { login: string } | null;
    html_url: string;
    created_at: string;
    body: string | null;
    merged: boolean;
    mergeable: boolean | null;
    additions: number;
    deletions: number;
    changed_files: number;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
  }>(url, { method: "GET", headers: getGithubHeaders(token) }, "GitHub", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    number: res.data.number,
    title: res.data.title,
    state: res.data.state,
    author: res.data.user?.login,
    html_url: res.data.html_url,
    created_at: res.data.created_at,
    body: res.data.body,
    merged: res.data.merged,
    mergeable: res.data.mergeable,
    additions: res.data.additions,
    deletions: res.data.deletions,
    changed_files: res.data.changed_files,
    head_branch: res.data.head?.ref,
    base_branch: res.data.base?.ref,
  };
}

export interface GithubCreateIssueCommentArgs {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
}

export async function executeGithubCreateIssueComment(
  args: GithubCreateIssueCommentArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getGithubConfig();
  if (!token) return { error: "GitHub integration is not configured. Please set GITHUB_TOKEN." };

  const owner = (args.owner || "").trim();
  const repo = (args.repo || "").trim();
  const issueNumber = Number(args.issue_number);
  const body = (args.body || "").trim();
  if (!owner || !repo || !issueNumber || !body) {
    return { error: "'owner', 'repo', 'issue_number', and 'body' are required." };
  }

  const url = `${apiUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`;
  const headers = { ...getGithubHeaders(token), "Content-Type": "application/json" };
  const res = await safeFetchJson<{
    id: number;
    html_url: string;
    created_at: string;
    user: { login: string } | null;
    body: string;
  }>(url, { method: "POST", headers, body: JSON.stringify({ body }) }, "GitHub", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    html_url: res.data.html_url,
    created_at: res.data.created_at,
    author: res.data.user?.login,
    body: res.data.body,
  };
}

/* ========================================================================== */
/* 2. Notion Integration                                                      */
/* ========================================================================== */

function getNotionConfig() {
  const apiKey = process.env.NOTION_API_KEY?.trim();
  const apiUrl = (process.env.NOTION_API_URL?.trim() || "https://api.notion.com/v1").replace(
    /\/+$/,
    "",
  );
  return { apiKey, apiUrl };
}

function getNotionHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export interface NotionSearchArgs {
  query?: string;
  filter?: { property: "object"; value: "page" | "database" };
  sort?: { direction: "ascending" | "descending"; timestamp: "last_edited_time" };
  page_size?: number;
}

export async function executeNotionSearch(
  args: NotionSearchArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getNotionConfig();
  if (!apiKey) return { error: "Notion integration is not configured. Please set NOTION_API_KEY." };

  const url = `${apiUrl}/search`;
  const res = await safeFetchJson<{
    results: Array<{
      id: string;
      object: string;
      url: string;
      last_edited_time: string;
      properties?: Record<string, unknown>;
      title?: Array<{ plain_text: string }>;
    }>;
    has_more: boolean;
    next_cursor: string | null;
  }>(
    url,
    {
      method: "POST",
      headers: getNotionHeaders(apiKey),
      body: JSON.stringify({
        query: args.query || undefined,
        filter: args.filter || undefined,
        sort: args.sort || undefined,
        page_size: args.page_size ? Math.min(args.page_size, 100) : 20,
      }),
    },
    "Notion",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    results: (res.data.results || []).map((item) => ({
      id: item.id,
      object: item.object,
      url: item.url,
      last_edited_time: item.last_edited_time,
      properties: item.properties,
    })),
    has_more: res.data.has_more,
    next_cursor: res.data.next_cursor,
  };
}

export interface NotionGetPageArgs {
  page_id: string;
}

export async function executeNotionGetPage(
  args: NotionGetPageArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getNotionConfig();
  if (!apiKey) return { error: "Notion integration is not configured. Please set NOTION_API_KEY." };

  const pageId = (args.page_id || "").trim();
  if (!pageId) return { error: "'page_id' is required." };

  const pageUrl = `${apiUrl}/pages/${encodeURIComponent(pageId)}`;
  const pageRes = await safeFetchJson<{
    id: string;
    object: string;
    url: string;
    created_time: string;
    last_edited_time: string;
    archived: boolean;
    properties: Record<string, unknown>;
    parent: Record<string, unknown>;
  }>(pageUrl, { method: "GET", headers: getNotionHeaders(apiKey) }, "Notion", context);

  if (!pageRes.ok) return { error: pageRes.error, status: pageRes.status };

  // Fetch initial block children for content
  const blocksUrl = `${apiUrl}/blocks/${encodeURIComponent(pageId)}/children?page_size=50`;
  const blocksRes = await safeFetchJson<{
    results: Array<{
      id: string;
      type: string;
      [key: string]: unknown;
    }>;
  }>(blocksUrl, { method: "GET", headers: getNotionHeaders(apiKey) }, "Notion", context);

  return {
    id: pageRes.data.id,
    url: pageRes.data.url,
    created_time: pageRes.data.created_time,
    last_edited_time: pageRes.data.last_edited_time,
    archived: pageRes.data.archived,
    parent: pageRes.data.parent,
    properties: pageRes.data.properties,
    blocks: blocksRes.ok ? blocksRes.data.results : [],
  };
}

export interface NotionQueryDatabaseArgs {
  database_id: string;
  filter?: Record<string, unknown>;
  sorts?: Array<Record<string, unknown>>;
  page_size?: number;
}

export async function executeNotionQueryDatabase(
  args: NotionQueryDatabaseArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getNotionConfig();
  if (!apiKey) return { error: "Notion integration is not configured. Please set NOTION_API_KEY." };

  const dbId = (args.database_id || "").trim();
  if (!dbId) return { error: "'database_id' is required." };

  const url = `${apiUrl}/databases/${encodeURIComponent(dbId)}/query`;
  const res = await safeFetchJson<{
    results: Array<{
      id: string;
      object: string;
      url: string;
      properties: Record<string, unknown>;
      created_time: string;
      last_edited_time: string;
    }>;
    has_more: boolean;
    next_cursor: string | null;
  }>(
    url,
    {
      method: "POST",
      headers: getNotionHeaders(apiKey),
      body: JSON.stringify({
        filter: args.filter || undefined,
        sorts: args.sorts || undefined,
        page_size: args.page_size ? Math.min(args.page_size, 100) : 20,
      }),
    },
    "Notion",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    results: res.data.results,
    has_more: res.data.has_more,
    next_cursor: res.data.next_cursor,
  };
}

export interface NotionCreatePageArgs {
  parent: { database_id?: string; page_id?: string };
  properties: Record<string, unknown>;
  children?: Array<Record<string, unknown>>;
}

export async function executeNotionCreatePage(
  args: NotionCreatePageArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getNotionConfig();
  if (!apiKey) return { error: "Notion integration is not configured. Please set NOTION_API_KEY." };

  if (!args.parent || (!args.parent.database_id && !args.parent.page_id)) {
    return { error: "'parent' must include either 'database_id' or 'page_id'." };
  }

  const url = `${apiUrl}/pages`;
  const res = await safeFetchJson<{
    id: string;
    url: string;
    created_time: string;
    properties: Record<string, unknown>;
  }>(
    url,
    {
      method: "POST",
      headers: getNotionHeaders(apiKey),
      body: JSON.stringify({
        parent: args.parent,
        properties: args.properties || {},
        children: args.children || undefined,
      }),
    },
    "Notion",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    url: res.data.url,
    created_time: res.data.created_time,
    properties: res.data.properties,
  };
}

export interface NotionUpdatePageArgs {
  page_id: string;
  properties?: Record<string, unknown>;
  archived?: boolean;
  icon?: Record<string, unknown>;
  cover?: Record<string, unknown>;
}

export async function executeNotionUpdatePage(
  args: NotionUpdatePageArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getNotionConfig();
  if (!apiKey) return { error: "Notion integration is not configured. Please set NOTION_API_KEY." };

  const pageId = (args.page_id || "").trim();
  if (!pageId) return { error: "'page_id' is required." };

  const url = `${apiUrl}/pages/${encodeURIComponent(pageId)}`;
  const body: Record<string, unknown> = {};
  if (args.properties) body.properties = args.properties;
  if (args.archived !== undefined) body.archived = args.archived;
  if (args.icon) body.icon = args.icon;
  if (args.cover) body.cover = args.cover;

  const res = await safeFetchJson<{
    id: string;
    url: string;
    last_edited_time: string;
    archived: boolean;
    properties: Record<string, unknown>;
  }>(
    url,
    { method: "PATCH", headers: getNotionHeaders(apiKey), body: JSON.stringify(body) },
    "Notion",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    url: res.data.url,
    last_edited_time: res.data.last_edited_time,
    archived: res.data.archived,
  };
}

/* ========================================================================== */
/* 3. Postiz Integration                                                      */
/* ========================================================================== */

function getPostizConfig() {
  const apiKey = process.env.POSTIZ_API_KEY?.trim();
  const apiUrl = (process.env.POSTIZ_API_URL?.trim() || "http://postiz:5000").replace(/\/+$/, "");
  return { apiKey, apiUrl };
}

function getPostizHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

export async function executePostizListIntegrations(
  _args: Record<string, unknown>,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getPostizConfig();
  if (!apiKey) return { error: "Postiz integration is not configured. Please set POSTIZ_API_KEY." };

  const url = `${apiUrl}/api/v1/integrations`;
  const res = await safeFetchJson<
    Array<{
      id: string;
      name: string;
      identifier?: string;
      type?: string;
      provider?: string;
      status?: string;
      picture?: string;
    }>
  >(url, { method: "GET", headers: getPostizHeaders(apiKey) }, "Postiz", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    integrations: (Array.isArray(res.data) ? res.data : []).map((item) => ({
      id: item.id,
      name: item.name,
      identifier: item.identifier,
      provider: item.provider || item.type,
      status: item.status,
    })),
  };
}

export interface PostizCreatePostArgs {
  content: string;
  integrationIds?: string[];
  scheduledAt?: string;
  tags?: string[];
  media?: string[];
}

export async function executePostizCreatePost(
  args: PostizCreatePostArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getPostizConfig();
  if (!apiKey) return { error: "Postiz integration is not configured. Please set POSTIZ_API_KEY." };

  const content = (args.content || "").trim();
  if (!content) return { error: "'content' is required for creating a social post." };

  const url = `${apiUrl}/api/v1/posts`;
  const res = await safeFetchJson<{
    id: string;
    content: string;
    status: string;
    scheduledAt?: string;
    integrationIds?: string[];
    createdAt?: string;
  }>(
    url,
    {
      method: "POST",
      headers: getPostizHeaders(apiKey),
      body: JSON.stringify({
        content,
        integrationIds: args.integrationIds || [],
        scheduledAt: args.scheduledAt,
        tags: args.tags,
        media: args.media,
      }),
    },
    "Postiz",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    content: res.data.content,
    status: res.data.status,
    scheduledAt: res.data.scheduledAt,
  };
}

export interface PostizListPostsArgs {
  status?: "draft" | "scheduled" | "published" | "failed" | "all";
  limit?: number;
  page?: number;
}

export async function executePostizListPosts(
  args: PostizListPostsArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getPostizConfig();
  if (!apiKey) return { error: "Postiz integration is not configured. Please set POSTIZ_API_KEY." };

  const params = new URLSearchParams();
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.limit) params.set("limit", String(Math.min(args.limit, 100)));
  if (args.page) params.set("page", String(args.page));

  const url = `${apiUrl}/api/v1/posts?${params.toString()}`;
  const res = await safeFetchJson<{
    posts: Array<{
      id: string;
      content: string;
      status: string;
      scheduledAt?: string;
      createdAt?: string;
    }>;
    total?: number;
  }>(url, { method: "GET", headers: getPostizHeaders(apiKey) }, "Postiz", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    posts: Array.isArray(res.data) ? res.data : res.data.posts || [],
    total: res.data.total,
  };
}

/* ========================================================================== */
/* 4. WordPress & Novamira Integration                                        */
/* ========================================================================== */

function getWordpressConfig() {
  const wpUrl = (process.env.WORDPRESS_URL?.trim() || "https://novamira.com").replace(/\/+$/, "");
  const username = process.env.WORDPRESS_USERNAME?.trim();
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim();
  return { wpUrl, username, appPassword };
}

function getWordpressHeaders(): Record<string, string> {
  const { username, appPassword } = getWordpressConfig();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (username && appPassword) {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }
  return headers;
}

export interface WordpressListPostsArgs {
  status?: string;
  search?: string;
  per_page?: number;
  page?: number;
  categories?: number[];
  tags?: number[];
}

export async function executeWordpressListPosts(
  args: WordpressListPostsArgs,
  context?: { signal?: AbortSignal },
) {
  const { wpUrl } = getWordpressConfig();
  const params = new URLSearchParams();
  if (args.status) params.set("status", args.status);
  if (args.search) params.set("search", args.search);
  if (args.per_page) params.set("per_page", String(Math.min(args.per_page, 100)));
  if (args.page) params.set("page", String(args.page));
  if (args.categories && args.categories.length)
    params.set("categories", args.categories.join(","));
  if (args.tags && args.tags.length) params.set("tags", args.tags.join(","));

  const url = `${wpUrl}/wp-json/wp/v2/posts?${params.toString()}`;
  const res = await safeFetchJson<
    Array<{
      id: number;
      date: string;
      status: string;
      slug: string;
      link: string;
      title: { rendered: string };
      excerpt: { rendered: string };
      categories: number[];
      tags: number[];
    }>
  >(url, { method: "GET", headers: getWordpressHeaders() }, "WordPress", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    posts: (res.data || []).map((p) => ({
      id: p.id,
      date: p.date,
      status: p.status,
      slug: p.slug,
      link: p.link,
      title: p.title?.rendered,
      excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, "").trim(),
      categories: p.categories,
      tags: p.tags,
    })),
  };
}

export interface WordpressGetPostArgs {
  id: number;
}

export async function executeWordpressGetPost(
  args: WordpressGetPostArgs,
  context?: { signal?: AbortSignal },
) {
  const { wpUrl } = getWordpressConfig();
  const postId = Number(args.id);
  if (!postId) return { error: "'id' is required." };

  const url = `${wpUrl}/wp-json/wp/v2/posts/${postId}`;
  const res = await safeFetchJson<{
    id: number;
    date: string;
    modified: string;
    slug: string;
    status: string;
    link: string;
    title: { rendered: string };
    content: { rendered: string };
    excerpt: { rendered: string };
    author: number;
    categories: number[];
    tags: number[];
  }>(url, { method: "GET", headers: getWordpressHeaders() }, "WordPress", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    id: res.data.id,
    date: res.data.date,
    modified: res.data.modified,
    slug: res.data.slug,
    status: res.data.status,
    link: res.data.link,
    title: res.data.title?.rendered,
    content: res.data.content?.rendered,
    excerpt: res.data.excerpt?.rendered?.replace(/<[^>]+>/g, "").trim(),
    author: res.data.author,
    categories: res.data.categories,
    tags: res.data.tags,
  };
}

export interface WordpressCreatePostArgs {
  title: string;
  content: string;
  status?: "publish" | "draft" | "pending" | "private";
  categories?: number[];
  tags?: number[];
  slug?: string;
  excerpt?: string;
}

export async function executeWordpressCreatePost(
  args: WordpressCreatePostArgs,
  context?: { signal?: AbortSignal },
) {
  const { wpUrl, username, appPassword } = getWordpressConfig();
  if (!username || !appPassword) {
    return {
      error:
        "WordPress authentication is not configured. Please set WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD.",
    };
  }

  const title = (args.title || "").trim();
  const content = (args.content || "").trim();
  if (!title || !content) return { error: "'title' and 'content' are required." };

  const url = `${wpUrl}/wp-json/wp/v2/posts`;
  const res = await safeFetchJson<{
    id: number;
    date: string;
    status: string;
    link: string;
    slug: string;
    title: { rendered: string };
  }>(
    url,
    {
      method: "POST",
      headers: getWordpressHeaders(),
      body: JSON.stringify({
        title,
        content,
        status: args.status || "draft",
        categories: args.categories,
        tags: args.tags,
        slug: args.slug,
        excerpt: args.excerpt,
      }),
    },
    "WordPress",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    title: res.data.title?.rendered,
    status: res.data.status,
    link: res.data.link,
    date: res.data.date,
  };
}

export interface WordpressUpdatePostArgs {
  id: number;
  title?: string;
  content?: string;
  status?: "publish" | "draft" | "pending" | "private";
  categories?: number[];
  tags?: number[];
  slug?: string;
  excerpt?: string;
}

export async function executeWordpressUpdatePost(
  args: WordpressUpdatePostArgs,
  context?: { signal?: AbortSignal },
) {
  const { wpUrl, username, appPassword } = getWordpressConfig();
  if (!username || !appPassword) {
    return {
      error:
        "WordPress authentication is not configured. Please set WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD.",
    };
  }

  const postId = Number(args.id);
  if (!postId) return { error: "'id' is required." };

  const url = `${wpUrl}/wp-json/wp/v2/posts/${postId}`;
  const body: Record<string, unknown> = {};
  if (args.title !== undefined) body.title = args.title;
  if (args.content !== undefined) body.content = args.content;
  if (args.status !== undefined) body.status = args.status;
  if (args.categories !== undefined) body.categories = args.categories;
  if (args.tags !== undefined) body.tags = args.tags;
  if (args.slug !== undefined) body.slug = args.slug;
  if (args.excerpt !== undefined) body.excerpt = args.excerpt;

  const res = await safeFetchJson<{
    id: number;
    modified: string;
    status: string;
    link: string;
    title: { rendered: string };
  }>(
    url,
    { method: "POST", headers: getWordpressHeaders(), body: JSON.stringify(body) },
    "WordPress",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.id,
    title: res.data.title?.rendered,
    status: res.data.status,
    link: res.data.link,
    modified: res.data.modified,
  };
}

export interface NovamiraExecuteAbilityArgs {
  site: string;
  ability: string;
  params?: Record<string, unknown>;
}

export async function executeNovamiraExecuteAbility(
  args: NovamiraExecuteAbilityArgs,
  context?: { signal?: AbortSignal },
) {
  const apiKey = process.env.NOVAMIRA_API_KEY?.trim();
  const baseUrl = (process.env.NOVAMIRA_URL?.trim() || "https://novamira.com").replace(/\/+$/, "");

  const site = (args.site || "").trim();
  const ability = (args.ability || "").trim();
  if (!site || !ability) return { error: "'site' and 'ability' are required." };

  const url = `${baseUrl}/api/mcp/execute`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["X-Novamira-Key"] = apiKey;
  }

  const res = await safeFetchJson<{
    success: boolean;
    result?: unknown;
    error?: string;
  }>(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        site,
        ability,
        params: args.params || {},
      }),
    },
    "Novamira",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };
  return res.data;
}

/* ========================================================================== */
/* 5. n8n Integration                                                         */
/* ========================================================================== */

function getN8nConfig() {
  const apiKey = process.env.N8N_API_KEY?.trim();
  const apiUrl = (process.env.N8N_API_URL?.trim() || "http://n8n:5678").replace(/\/+$/, "");
  return { apiKey, apiUrl };
}

function getN8nHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (apiKey) {
    headers["X-N8N-API-KEY"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export interface N8nTriggerWebhookArgs {
  webhookPath?: string;
  url?: string;
  data?: Record<string, unknown>;
  method?: "POST" | "GET";
}

export async function executeN8nTriggerWebhook(
  args: N8nTriggerWebhookArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getN8nConfig();
  const rawPath = (args.webhookPath || "").replace(/^\/+/, "");
  const targetUrl = args.url ? args.url : `${apiUrl}/webhook/${rawPath}`;
  if (!args.url && !rawPath) {
    return { error: "Either 'webhookPath' or 'url' must be provided." };
  }

  const method = args.method || "POST";
  const options: RequestInit = {
    method,
    headers: getN8nHeaders(apiKey),
  };
  if (method === "POST" && args.data) {
    options.body = JSON.stringify(args.data);
  }

  const res = await safeFetchJson<unknown>(targetUrl, options, "n8n Webhook", context);
  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    result: res.data,
  };
}

export interface N8nListWorkflowsArgs {
  active?: boolean;
  tags?: string[];
  limit?: number;
}

export async function executeN8nListWorkflows(
  args: N8nListWorkflowsArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getN8nConfig();
  if (!apiKey) return { error: "n8n API is not configured. Please set N8N_API_KEY." };

  const params = new URLSearchParams();
  if (args.active !== undefined) params.set("active", String(args.active));
  if (args.limit) params.set("limit", String(Math.min(args.limit, 100)));

  const url = `${apiUrl}/api/v1/workflows?${params.toString()}`;
  const res = await safeFetchJson<{
    data: Array<{
      id: string;
      name: string;
      active: boolean;
      createdAt: string;
      updatedAt: string;
      tags?: Array<{ id: string; name: string }>;
    }>;
  }>(url, { method: "GET", headers: getN8nHeaders(apiKey) }, "n8n", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    workflows: (res.data.data || []).map((wf) => ({
      id: wf.id,
      name: wf.name,
      active: wf.active,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt,
      tags: (wf.tags || []).map((t) => t.name),
    })),
  };
}

export interface N8nGetExecutionArgs {
  executionId: string;
  includeData?: boolean;
}

export async function executeN8nGetExecution(
  args: N8nGetExecutionArgs,
  context?: { signal?: AbortSignal },
) {
  const { apiKey, apiUrl } = getN8nConfig();
  if (!apiKey) return { error: "n8n API is not configured. Please set N8N_API_KEY." };

  const execId = String(args.executionId || "").trim();
  if (!execId) return { error: "'executionId' is required." };

  const url = `${apiUrl}/api/v1/executions/${encodeURIComponent(execId)}?includeData=${Boolean(args.includeData)}`;
  const res = await safeFetchJson<{
    id: string;
    finished: boolean;
    mode: string;
    status: string;
    startedAt: string;
    stoppedAt: string;
    workflowId: string;
    data?: unknown;
  }>(url, { method: "GET", headers: getN8nHeaders(apiKey) }, "n8n", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    id: res.data.id,
    finished: res.data.finished,
    status: res.data.status,
    mode: res.data.mode,
    startedAt: res.data.startedAt,
    stoppedAt: res.data.stoppedAt,
    workflowId: res.data.workflowId,
    resultSummary: res.data.data ? "data included" : "no data",
  };
}

/* ========================================================================== */
/* 6. Cloudflare Integration                                                  */
/* ========================================================================== */

function getCloudflareConfig() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const apiUrl = (
    process.env.CLOUDFLARE_API_URL?.trim() || "https://api.cloudflare.com/client/v4"
  ).replace(/\/+$/, "");
  return { token, apiUrl };
}

function getCloudflareHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export interface CloudflareListZonesArgs {
  name?: string;
  status?: "active" | "pending" | "initializing" | "moved" | "deleted" | "deactivated";
  page?: number;
  per_page?: number;
}

export async function executeCloudflareListZones(
  args: CloudflareListZonesArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getCloudflareConfig();
  if (!token)
    return { error: "Cloudflare integration is not configured. Please set CLOUDFLARE_API_TOKEN." };

  const params = new URLSearchParams();
  if (args.name) params.set("name", args.name);
  if (args.status) params.set("status", args.status);
  if (args.page) params.set("page", String(args.page));
  if (args.per_page) params.set("per_page", String(Math.min(args.per_page, 50)));

  const url = `${apiUrl}/zones?${params.toString()}`;
  const res = await safeFetchJson<{
    success: boolean;
    result: Array<{
      id: string;
      name: string;
      status: string;
      paused: boolean;
      type: string;
      name_servers: string[];
    }>;
    result_info?: { total_count: number; page: number; per_page: number };
  }>(url, { method: "GET", headers: getCloudflareHeaders(token) }, "Cloudflare", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    zones: (res.data.result || []).map((zone) => ({
      id: zone.id,
      name: zone.name,
      status: zone.status,
      paused: zone.paused,
      name_servers: zone.name_servers,
    })),
    total: res.data.result_info?.total_count,
  };
}

export interface CloudflareListDnsRecordsArgs {
  zone_id: string;
  name?: string;
  type?: string;
  page?: number;
  per_page?: number;
}

export async function executeCloudflareListDnsRecords(
  args: CloudflareListDnsRecordsArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getCloudflareConfig();
  if (!token)
    return { error: "Cloudflare integration is not configured. Please set CLOUDFLARE_API_TOKEN." };

  const zoneId = (args.zone_id || "").trim();
  if (!zoneId) return { error: "'zone_id' is required." };

  const params = new URLSearchParams();
  if (args.name) params.set("name", args.name);
  if (args.type) params.set("type", args.type);
  if (args.page) params.set("page", String(args.page));
  if (args.per_page) params.set("per_page", String(Math.min(args.per_page, 100)));

  const url = `${apiUrl}/zones/${encodeURIComponent(zoneId)}/dns_records?${params.toString()}`;
  const res = await safeFetchJson<{
    success: boolean;
    result: Array<{
      id: string;
      zone_id: string;
      name: string;
      type: string;
      content: string;
      proxiable: boolean;
      proxied: boolean;
      ttl: number;
      created_on: string;
      modified_on: string;
    }>;
  }>(url, { method: "GET", headers: getCloudflareHeaders(token) }, "Cloudflare", context);

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    records: (res.data.result || []).map((rec) => ({
      id: rec.id,
      name: rec.name,
      type: rec.type,
      content: rec.content,
      proxied: rec.proxied,
      ttl: rec.ttl,
      modified_on: rec.modified_on,
    })),
  };
}

export interface CloudflareCreateDnsRecordArgs {
  zone_id: string;
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  comment?: string;
}

export async function executeCloudflareCreateDnsRecord(
  args: CloudflareCreateDnsRecordArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getCloudflareConfig();
  if (!token)
    return { error: "Cloudflare integration is not configured. Please set CLOUDFLARE_API_TOKEN." };

  const zoneId = (args.zone_id || "").trim();
  const type = (args.type || "").trim().toUpperCase();
  const name = (args.name || "").trim();
  const content = (args.content || "").trim();
  if (!zoneId || !type || !name || !content) {
    return { error: "'zone_id', 'type', 'name', and 'content' are required." };
  }

  const url = `${apiUrl}/zones/${encodeURIComponent(zoneId)}/dns_records`;
  const res = await safeFetchJson<{
    success: boolean;
    result: {
      id: string;
      name: string;
      type: string;
      content: string;
      proxied: boolean;
      ttl: number;
    };
  }>(
    url,
    {
      method: "POST",
      headers: getCloudflareHeaders(token),
      body: JSON.stringify({
        type,
        name,
        content,
        ttl: args.ttl || 1, // 1 = automatic in Cloudflare
        proxied: Boolean(args.proxied),
        priority: args.priority,
        comment: args.comment,
      }),
    },
    "Cloudflare",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.result?.id,
    name: res.data.result?.name,
    type: res.data.result?.type,
    content: res.data.result?.content,
    proxied: res.data.result?.proxied,
    ttl: res.data.result?.ttl,
  };
}

export interface CloudflarePurgeCacheArgs {
  zone_id: string;
  purge_everything?: boolean;
  files?: string[];
  tags?: string[];
  hosts?: string[];
  prefixes?: string[];
}

export async function executeCloudflarePurgeCache(
  args: CloudflarePurgeCacheArgs,
  context?: { signal?: AbortSignal },
) {
  const { token, apiUrl } = getCloudflareConfig();
  if (!token)
    return { error: "Cloudflare integration is not configured. Please set CLOUDFLARE_API_TOKEN." };

  const zoneId = (args.zone_id || "").trim();
  if (!zoneId) return { error: "'zone_id' is required." };

  const url = `${apiUrl}/zones/${encodeURIComponent(zoneId)}/purge_cache`;
  const body: Record<string, unknown> = {};
  if (args.purge_everything) {
    body.purge_everything = true;
  } else {
    if (args.files && args.files.length) body.files = args.files;
    if (args.tags && args.tags.length) body.tags = args.tags;
    if (args.hosts && args.hosts.length) body.hosts = args.hosts;
    if (args.prefixes && args.prefixes.length) body.prefixes = args.prefixes;
  }

  if (Object.keys(body).length === 0) {
    body.purge_everything = true;
  }

  const res = await safeFetchJson<{
    success: boolean;
    result: { id: string };
  }>(
    url,
    { method: "POST", headers: getCloudflareHeaders(token), body: JSON.stringify(body) },
    "Cloudflare",
    context,
  );

  if (!res.ok) return { error: res.error, status: res.status };

  return {
    ok: true,
    id: res.data.result?.id,
    success: res.data.success,
  };
}

/* ========================================================================== */
/* Tool Definitions & Master Dispatcher                                       */
/* ========================================================================== */

export const enterpriseAgentTools: ConnectorTool[] = [
  // GitHub
  {
    name: "github_search_repos",
    description: "Search GitHub repositories with queries, sorting, and pagination.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search keyword or query qualifier (e.g. 'react in:name').",
        },
        sort: { type: "string", enum: ["stars", "forks", "help-wanted-issues", "updated"] },
        order: { type: "string", enum: ["desc", "asc"] },
        per_page: { type: "number", description: "Results per page (max 100, default 30)." },
        page: { type: "number", description: "Page number to fetch." },
      },
      required: ["q"],
    },
  },
  {
    name: "github_get_file_contents",
    description: "Read text or JSON files from a GitHub repository, automatically decoded.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner or organization name." },
        repo: { type: "string", description: "Repository name." },
        path: { type: "string", description: "File path within repository (e.g. 'src/index.ts')." },
        ref: { type: "string", description: "Optional git branch, tag, or commit SHA." },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "github_list_issues",
    description: "List issues and pull requests for a repository with state and label filters.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner or organization." },
        repo: { type: "string", description: "Repository name." },
        state: { type: "string", enum: ["open", "closed", "all"] },
        labels: {
          type: "string",
          description: "Comma-separated list of label names (e.g. 'bug,ui').",
        },
        per_page: { type: "number", description: "Results per page (max 100)." },
        page: { type: "number", description: "Page number." },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_create_issue",
    description: "Create a new issue in a GitHub repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner or organization." },
        repo: { type: "string", description: "Repository name." },
        title: { type: "string", description: "Issue title." },
        body: { type: "string", description: "Issue description/body content in Markdown." },
        labels: { type: "array", items: { type: "string" }, description: "Labels to apply." },
        assignees: { type: "array", items: { type: "string" }, description: "Logins to assign." },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    name: "github_get_pull_request",
    description: "Retrieve detailed information, branch refs, and status for a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner or organization." },
        repo: { type: "string", description: "Repository name." },
        pull_number: { type: "number", description: "Pull request number." },
      },
      required: ["owner", "repo", "pull_number"],
    },
  },
  {
    name: "github_create_issue_comment",
    description: "Add a comment to an existing issue or pull request in a GitHub repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string", description: "Repository owner or organization." },
        repo: { type: "string", description: "Repository name." },
        issue_number: { type: "number", description: "Issue or PR number to comment on." },
        body: { type: "string", description: "Markdown comment text." },
      },
      required: ["owner", "repo", "issue_number", "body"],
    },
  },

  // Notion
  {
    name: "notion_search",
    description: "Search workspace pages and databases in Notion.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query text." },
        filter: {
          type: "object",
          properties: {
            property: { type: "string" },
            value: { type: "string", enum: ["page", "database"] },
          },
        },
        page_size: {
          type: "number",
          description: "Maximum number of results to return (max 100).",
        },
      },
    },
  },
  {
    name: "notion_get_page",
    description: "Retrieve a Notion page's properties and block contents.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Notion Page UUID." },
      },
      required: ["page_id"],
    },
  },
  {
    name: "notion_query_database",
    description: "Query records from a Notion database with optional filters and sorting.",
    inputSchema: {
      type: "object",
      properties: {
        database_id: { type: "string", description: "Notion Database UUID." },
        filter: { type: "object", description: "Notion filter object." },
        sorts: { type: "array", items: { type: "object" }, description: "Notion sorting rules." },
        page_size: { type: "number", description: "Maximum results (max 100)." },
      },
      required: ["database_id"],
    },
  },
  {
    name: "notion_create_page",
    description: "Create a new page inside a Notion parent page or database.",
    inputSchema: {
      type: "object",
      properties: {
        parent: {
          type: "object",
          properties: {
            database_id: { type: "string" },
            page_id: { type: "string" },
          },
          description: "Parent database_id or page_id.",
        },
        properties: { type: "object", description: "Notion property values for the new page." },
        children: {
          type: "array",
          items: { type: "object" },
          description: "Initial block content.",
        },
      },
      required: ["parent", "properties"],
    },
  },
  {
    name: "notion_update_page",
    description: "Update properties or archived status of an existing Notion page.",
    inputSchema: {
      type: "object",
      properties: {
        page_id: { type: "string", description: "Notion Page UUID." },
        properties: { type: "object", description: "Property updates." },
        archived: { type: "boolean", description: "Set true to archive/trash the page." },
      },
      required: ["page_id"],
    },
  },

  // Postiz
  {
    name: "postiz_list_integrations",
    description: "List connected social media channels and accounts on Postiz.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "postiz_create_post",
    description: "Create or schedule a social media post across connected channels via Postiz.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Post text content." },
        integrationIds: {
          type: "array",
          items: { type: "string" },
          description: "Target social channel IDs from postiz_list_integrations.",
        },
        scheduledAt: {
          type: "string",
          description: "ISO-8601 date string for scheduled posting (e.g. '2026-08-22T10:00:00Z').",
        },
        tags: { type: "array", items: { type: "string" }, description: "Post tags." },
        media: {
          type: "array",
          items: { type: "string" },
          description: "Image/video URLs to attach.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "postiz_list_posts",
    description: "List scheduled, published, or draft social media posts on Postiz.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "scheduled", "published", "failed", "all"] },
        limit: { type: "number", description: "Number of posts to return (default 20)." },
        page: { type: "number", description: "Page number." },
      },
    },
  },

  // WordPress / Novamira
  {
    name: "wordpress_list_posts",
    description: "List WordPress posts with search, category, and status filters.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Post status: publish, draft, pending, future, private.",
        },
        search: { type: "string", description: "Search terms in title or content." },
        per_page: { type: "number", description: "Posts per page (default 10)." },
        page: { type: "number", description: "Page number." },
        categories: { type: "array", items: { type: "number" }, description: "Category IDs." },
        tags: { type: "array", items: { type: "number" }, description: "Tag IDs." },
      },
    },
  },
  {
    name: "wordpress_get_post",
    description: "Retrieve full HTML and rendered content for a specific WordPress post.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "WordPress Post ID." },
      },
      required: ["id"],
    },
  },
  {
    name: "wordpress_create_post",
    description: "Create and publish or draft a WordPress post.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title." },
        content: { type: "string", description: "Full post body content (HTML or Markdown)." },
        status: { type: "string", enum: ["publish", "draft", "pending", "private"] },
        categories: { type: "array", items: { type: "number" } },
        tags: { type: "array", items: { type: "number" } },
        slug: { type: "string", description: "Custom URL slug." },
        excerpt: { type: "string", description: "Post excerpt/summary." },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "wordpress_update_post",
    description: "Update an existing WordPress post's content, title, or status.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "WordPress Post ID." },
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string", enum: ["publish", "draft", "pending", "private"] },
        categories: { type: "array", items: { type: "number" } },
        tags: { type: "array", items: { type: "number" } },
        slug: { type: "string" },
        excerpt: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "novamira_execute_ability",
    description: "Execute a Novamira automation or CMS ability across connected agency sites.",
    inputSchema: {
      type: "object",
      properties: {
        site: { type: "string", description: "Target site domain or slug (e.g. 'novamira.com')." },
        ability: { type: "string", description: "Name of the ability to execute." },
        params: { type: "object", description: "Parameters payload for the ability." },
      },
      required: ["site", "ability"],
    },
  },

  // n8n
  {
    name: "n8n_trigger_webhook",
    description: "Trigger an n8n workflow webhook endpoint with a custom JSON payload.",
    inputSchema: {
      type: "object",
      properties: {
        webhookPath: {
          type: "string",
          description: "Webhook path identifier (e.g. 'my-webhook-path').",
        },
        url: { type: "string", description: "Optional full webhook URL." },
        data: { type: "object", description: "JSON payload to send." },
        method: { type: "string", enum: ["POST", "GET"] },
      },
    },
  },
  {
    name: "n8n_list_workflows",
    description: "List automated workflows in n8n and inspect their active statuses.",
    inputSchema: {
      type: "object",
      properties: {
        active: { type: "boolean", description: "Filter by active status." },
        limit: { type: "number", description: "Maximum workflows to return." },
      },
    },
  },
  {
    name: "n8n_get_execution",
    description: "Inspect the status, execution logs, and data of an n8n workflow run.",
    inputSchema: {
      type: "object",
      properties: {
        executionId: { type: "string", description: "n8n Execution ID." },
        includeData: { type: "boolean", description: "Include detailed execution step data." },
      },
      required: ["executionId"],
    },
  },

  // Cloudflare
  {
    name: "cloudflare_list_zones",
    description: "List domain zones and DNS status managed in Cloudflare.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Domain name filter (e.g. 'workspacegroupefloteuil.eu').",
        },
        status: {
          type: "string",
          enum: ["active", "pending", "initializing", "moved", "deleted", "deactivated"],
        },
        page: { type: "number" },
        per_page: { type: "number" },
      },
    },
  },
  {
    name: "cloudflare_list_dns_records",
    description: "List DNS records (A, CNAME, TXT, MX) for a Cloudflare zone.",
    inputSchema: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "Cloudflare Zone ID." },
        name: { type: "string", description: "DNS record hostname filter." },
        type: { type: "string", description: "Record type filter (e.g. 'A', 'CNAME', 'TXT')." },
        page: { type: "number" },
        per_page: { type: "number" },
      },
      required: ["zone_id"],
    },
  },
  {
    name: "cloudflare_create_dns_record",
    description: "Create a new DNS record in a Cloudflare zone.",
    inputSchema: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "Cloudflare Zone ID." },
        type: { type: "string", description: "Record type (A, AAAA, CNAME, TXT, MX, etc.)." },
        name: { type: "string", description: "Record name / subdomain (e.g. 'api' or '@')." },
        content: { type: "string", description: "Record IP address or target destination." },
        ttl: { type: "number", description: "TTL in seconds (1 for auto)." },
        proxied: { type: "boolean", description: "Whether Cloudflare proxy is enabled." },
        priority: { type: "number", description: "Priority for MX/SRV records." },
        comment: { type: "string", description: "Optional note." },
      },
      required: ["zone_id", "type", "name", "content"],
    },
  },
  {
    name: "cloudflare_purge_cache",
    description: "Purge cached assets, specific URLs, or the entire cache for a Cloudflare zone.",
    inputSchema: {
      type: "object",
      properties: {
        zone_id: { type: "string", description: "Cloudflare Zone ID." },
        purge_everything: { type: "boolean", description: "Purge all cached assets across zone." },
        files: { type: "array", items: { type: "string" }, description: "Specific URLs to purge." },
        tags: { type: "array", items: { type: "string" }, description: "Cache tags to purge." },
        hosts: { type: "array", items: { type: "string" }, description: "Hostnames to purge." },
      },
      required: ["zone_id"],
    },
  },
];

export const ENTERPRISE_TOOL_NAMES = new Set(enterpriseAgentTools.map((t) => t.name));

export function isEnterpriseTool(name: string): boolean {
  return ENTERPRISE_TOOL_NAMES.has(name);
}

export async function executeEnterpriseTool(
  name: string,
  args: Record<string, unknown>,
  context?: { signal?: AbortSignal },
): Promise<unknown> {
  switch (name) {
    // GitHub
    case "github_search_repos":
      return executeGithubSearchRepos(
        {
          q: String(args.q ?? args.query ?? ""),
          sort: args.sort as GithubSearchReposArgs["sort"],
          order: args.order as GithubSearchReposArgs["order"],
          per_page:
            args.per_page !== undefined
              ? Number(args.per_page)
              : args.perPage !== undefined
                ? Number(args.perPage)
                : undefined,
          page: args.page ? Number(args.page) : undefined,
        },
        context,
      );
    case "github_get_file_contents":
      return executeGithubGetFileContents(
        {
          owner: String(args.owner ?? ""),
          repo: String(args.repo ?? ""),
          path: String(args.path ?? ""),
          ref: args.ref ? String(args.ref) : undefined,
        },
        context,
      );
    case "github_list_issues":
      return executeGithubListIssues(
        {
          owner: String(args.owner ?? ""),
          repo: String(args.repo ?? ""),
          state: args.state as GithubListIssuesArgs["state"],
          labels: args.labels ? String(args.labels) : undefined,
          per_page:
            args.per_page !== undefined
              ? Number(args.per_page)
              : args.perPage !== undefined
                ? Number(args.perPage)
                : undefined,
          page: args.page ? Number(args.page) : undefined,
          sort: args.sort as GithubListIssuesArgs["sort"],
          direction: args.direction as GithubListIssuesArgs["direction"],
        },
        context,
      );
    case "github_create_issue":
      return executeGithubCreateIssue(
        {
          owner: String(args.owner ?? ""),
          repo: String(args.repo ?? ""),
          title: String(args.title ?? ""),
          body: args.body ? String(args.body) : undefined,
          labels: Array.isArray(args.labels) ? args.labels.map(String) : undefined,
          assignees: Array.isArray(args.assignees) ? args.assignees.map(String) : undefined,
        },
        context,
      );
    case "github_get_pull_request":
      return executeGithubGetPullRequest(
        {
          owner: String(args.owner ?? ""),
          repo: String(args.repo ?? ""),
          pull_number: Number(args.pull_number ?? args.pullNumber ?? 0),
        },
        context,
      );
    case "github_create_issue_comment":
      return executeGithubCreateIssueComment(
        {
          owner: String(args.owner ?? ""),
          repo: String(args.repo ?? ""),
          issue_number: Number(args.issue_number ?? args.issueNumber ?? 0),
          body: String(args.body ?? ""),
        },
        context,
      );

    // Notion
    case "notion_search":
      return executeNotionSearch(
        {
          query: args.query ? String(args.query) : undefined,
          filter: args.filter as NotionSearchArgs["filter"],
          sort: args.sort as NotionSearchArgs["sort"],
          page_size:
            args.page_size !== undefined
              ? Number(args.page_size)
              : args.pageSize !== undefined
                ? Number(args.pageSize)
                : undefined,
        },
        context,
      );
    case "notion_get_page":
      return executeNotionGetPage(
        {
          page_id: String(args.page_id ?? args.pageId ?? ""),
        },
        context,
      );
    case "notion_query_database":
      return executeNotionQueryDatabase(
        {
          database_id: String(args.database_id ?? args.databaseId ?? ""),
          filter: args.filter as Record<string, unknown> | undefined,
          sorts: args.sorts as Array<Record<string, unknown>> | undefined,
          page_size:
            args.page_size !== undefined
              ? Number(args.page_size)
              : args.pageSize !== undefined
                ? Number(args.pageSize)
                : undefined,
        },
        context,
      );
    case "notion_create_page":
      return executeNotionCreatePage(
        {
          parent: (args.parent ?? {}) as NotionCreatePageArgs["parent"],
          properties: (args.properties ?? {}) as Record<string, unknown>,
          children: Array.isArray(args.children)
            ? (args.children as Array<Record<string, unknown>>)
            : undefined,
        },
        context,
      );
    case "notion_update_page":
      return executeNotionUpdatePage(
        {
          page_id: String(args.page_id ?? args.pageId ?? ""),
          properties: args.properties as Record<string, unknown> | undefined,
          archived: args.archived !== undefined ? Boolean(args.archived) : undefined,
          icon: args.icon as Record<string, unknown> | undefined,
          cover: args.cover as Record<string, unknown> | undefined,
        },
        context,
      );

    // Postiz
    case "postiz_list_integrations":
      return executePostizListIntegrations(args, context);
    case "postiz_create_post":
      return executePostizCreatePost(
        {
          content: String(args.content ?? ""),
          integrationIds: Array.isArray(args.integrationIds)
            ? args.integrationIds.map(String)
            : Array.isArray(args.integration_ids)
              ? args.integration_ids.map(String)
              : undefined,
          scheduledAt: args.scheduledAt
            ? String(args.scheduledAt)
            : args.scheduled_at
              ? String(args.scheduled_at)
              : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
          media: Array.isArray(args.media) ? args.media.map(String) : undefined,
        },
        context,
      );
    case "postiz_list_posts":
      return executePostizListPosts(
        {
          status: args.status as PostizListPostsArgs["status"],
          limit: args.limit !== undefined ? Number(args.limit) : undefined,
          page: args.page ? Number(args.page) : undefined,
        },
        context,
      );

    // WordPress / Novamira
    case "wordpress_list_posts":
      return executeWordpressListPosts(
        {
          status: args.status ? String(args.status) : undefined,
          search: args.search ? String(args.search) : undefined,
          per_page:
            args.per_page !== undefined
              ? Number(args.per_page)
              : args.perPage !== undefined
                ? Number(args.perPage)
                : undefined,
          page: args.page ? Number(args.page) : undefined,
          categories: Array.isArray(args.categories) ? args.categories.map(Number) : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(Number) : undefined,
        },
        context,
      );
    case "wordpress_get_post":
      return executeWordpressGetPost(
        {
          id: Number(args.id ?? 0),
        },
        context,
      );
    case "wordpress_create_post":
      return executeWordpressCreatePost(
        {
          title: String(args.title ?? ""),
          content: String(args.content ?? ""),
          status: args.status as WordpressCreatePostArgs["status"],
          categories: Array.isArray(args.categories) ? args.categories.map(Number) : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(Number) : undefined,
          slug: args.slug ? String(args.slug) : undefined,
          excerpt: args.excerpt ? String(args.excerpt) : undefined,
        },
        context,
      );
    case "wordpress_update_post":
      return executeWordpressUpdatePost(
        {
          id: Number(args.id ?? 0),
          title: args.title ? String(args.title) : undefined,
          content: args.content ? String(args.content) : undefined,
          status: args.status as WordpressUpdatePostArgs["status"],
          categories: Array.isArray(args.categories) ? args.categories.map(Number) : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(Number) : undefined,
          slug: args.slug ? String(args.slug) : undefined,
          excerpt: args.excerpt ? String(args.excerpt) : undefined,
        },
        context,
      );
    case "novamira_execute_ability":
      return executeNovamiraExecuteAbility(
        {
          site: String(args.site ?? ""),
          ability: String(args.ability ?? ""),
          params: args.params as Record<string, unknown> | undefined,
        },
        context,
      );

    // n8n
    case "n8n_trigger_webhook":
      return executeN8nTriggerWebhook(
        {
          webhookPath: args.webhookPath
            ? String(args.webhookPath)
            : args.webhook_path
              ? String(args.webhook_path)
              : undefined,
          url: args.url ? String(args.url) : undefined,
          data: args.data as Record<string, unknown> | undefined,
          method: args.method as N8nTriggerWebhookArgs["method"],
        },
        context,
      );
    case "n8n_list_workflows":
      return executeN8nListWorkflows(
        {
          active: args.active !== undefined ? Boolean(args.active) : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
          limit: args.limit !== undefined ? Number(args.limit) : undefined,
        },
        context,
      );
    case "n8n_get_execution":
      return executeN8nGetExecution(
        {
          executionId: String(args.executionId ?? args.execution_id ?? ""),
          includeData: args.includeData !== undefined ? Boolean(args.includeData) : undefined,
        },
        context,
      );

    // Cloudflare
    case "cloudflare_list_zones":
      return executeCloudflareListZones(
        {
          name: args.name ? String(args.name) : undefined,
          status: args.status as CloudflareListZonesArgs["status"],
          page: args.page ? Number(args.page) : undefined,
          per_page:
            args.per_page !== undefined
              ? Number(args.per_page)
              : args.perPage !== undefined
                ? Number(args.perPage)
                : undefined,
        },
        context,
      );
    case "cloudflare_list_dns_records":
      return executeCloudflareListDnsRecords(
        {
          zone_id: String(args.zone_id ?? args.zoneId ?? ""),
          name: args.name ? String(args.name) : undefined,
          type: args.type ? String(args.type) : undefined,
          page: args.page ? Number(args.page) : undefined,
          per_page:
            args.per_page !== undefined
              ? Number(args.per_page)
              : args.perPage !== undefined
                ? Number(args.perPage)
                : undefined,
        },
        context,
      );
    case "cloudflare_create_dns_record":
      return executeCloudflareCreateDnsRecord(
        {
          zone_id: String(args.zone_id ?? args.zoneId ?? ""),
          type: String(args.type ?? ""),
          name: String(args.name ?? ""),
          content: String(args.content ?? ""),
          ttl: args.ttl ? Number(args.ttl) : undefined,
          proxied: args.proxied !== undefined ? Boolean(args.proxied) : undefined,
          priority: args.priority ? Number(args.priority) : undefined,
          comment: args.comment ? String(args.comment) : undefined,
        },
        context,
      );
    case "cloudflare_purge_cache":
      return executeCloudflarePurgeCache(
        {
          zone_id: String(args.zone_id ?? args.zoneId ?? ""),
          purge_everything:
            args.purge_everything !== undefined
              ? Boolean(args.purge_everything)
              : args.purgeEverything !== undefined
                ? Boolean(args.purgeEverything)
                : undefined,
          files: Array.isArray(args.files) ? args.files.map(String) : undefined,
          tags: Array.isArray(args.tags) ? args.tags.map(String) : undefined,
          hosts: Array.isArray(args.hosts) ? args.hosts.map(String) : undefined,
          prefixes: Array.isArray(args.prefixes) ? args.prefixes.map(String) : undefined,
        },
        context,
      );

    default:
      return { error: `Enterprise tool ${name} not recognized.` };
  }
}
