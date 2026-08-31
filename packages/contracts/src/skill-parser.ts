import YAML from "yaml";

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "skill"
  );
}

export function sanitizeMarkdownContent(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/javascript:[^"'\s>]+/gi, "")
    .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export function parseSimpleYaml(yamlStr: string): Record<string, unknown> {
  try {
    const parsed = YAML.parse(yamlStr);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback line-by-line parser for malformed YAML
  }

  const result: Record<string, unknown> = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && currentKey) {
      const val = trimmed
        .slice(2)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!currentArray) {
        currentArray = [];
        result[currentKey] = currentArray;
      }
      currentArray.push(val);
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      currentKey = trimmed.slice(0, colonIdx).trim();
      currentArray = null;
      let rawVal = trimmed.slice(colonIdx + 1).trim();

      if (!rawVal) {
        result[currentKey] = "";
        continue;
      }

      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        const items = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        result[currentKey] = items;
        continue;
      }

      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        rawVal = rawVal.slice(1, -1);
      }

      result[currentKey] = rawVal;
    }
  }

  return result;
}

export interface ParsedSkillMarkdown {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  metadata: Record<string, unknown>;
  content: string;
}

export function parseSkillMarkdown(
  rawMarkdown: string,
  fallbackFilename?: string,
): ParsedSkillMarkdown {
  if (rawMarkdown.length > 2_000_000) {
    throw new Error("Content exceeds 2MB limit");
  }

  const sanitized = sanitizeMarkdownContent(rawMarkdown);
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const match = sanitized.match(frontmatterRegex);

  let frontmatter: Record<string, unknown> = {};
  let bodyContent = sanitized;

  if (match && match[1] !== undefined) {
    try {
      frontmatter = parseSimpleYaml(match[1]);
    } catch {
      frontmatter = {};
    }
    bodyContent = sanitized.slice(match[0].length).trim();
  }

  // Extract name
  let name = "";
  if (typeof frontmatter.name === "string" && frontmatter.name.trim()) {
    name = frontmatter.name.trim();
  } else if (typeof frontmatter.title === "string" && frontmatter.title.trim()) {
    name = frontmatter.title.trim();
  } else {
    const h1Match = bodyContent.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
      name = h1Match[1].trim();
    } else if (fallbackFilename) {
      name = fallbackFilename.replace(/\.md$/i, "").replace(/[-_]/g, " ").trim();
    } else {
      name = "Compétence sans titre";
    }
  }

  // Extract slug
  let slug = "";
  if (typeof frontmatter.slug === "string" && frontmatter.slug.trim()) {
    slug = slugify(frontmatter.slug.trim());
  } else {
    slug = slugify(name);
  }

  // Extract description
  let description = "";
  if (typeof frontmatter.description === "string" && frontmatter.description.trim()) {
    description = frontmatter.description.trim();
  } else if (typeof frontmatter.summary === "string" && frontmatter.summary.trim()) {
    description = frontmatter.summary.trim();
  } else {
    // Extract first non-heading paragraph
    const lines = bodyContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed &&
        !trimmed.startsWith("#") &&
        !trimmed.startsWith("---") &&
        !trimmed.startsWith("```")
      ) {
        description = trimmed.slice(0, 300);
        break;
      }
    }
  }

  // Extract tags
  let tags: string[] = [];
  if (Array.isArray(frontmatter.tags)) {
    tags = frontmatter.tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof frontmatter.tags === "string") {
    tags = frontmatter.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } else if (Array.isArray(frontmatter.categories)) {
    tags = frontmatter.categories.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof frontmatter.categories === "string") {
    tags = frontmatter.categories
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Extra metadata
  const knownKeys = new Set([
    "name",
    "title",
    "slug",
    "description",
    "summary",
    "tags",
    "categories",
  ]);
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!knownKeys.has(key)) {
      metadata[key] = value;
    }
  }

  return {
    name,
    slug,
    description,
    tags,
    metadata,
    content: bodyContent || sanitized,
  };
}
