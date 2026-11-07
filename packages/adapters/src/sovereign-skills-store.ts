import { readFileSync } from "node:fs";
import {
  extractSovereignSkillSlug,
  getSovereignSkillBySlug,
  type SovereignSkillCatalogEntry,
} from "@rakazo/contracts";

let cachedContentMap: Record<string, string> | null = null;

function loadContentMap(): Record<string, string> {
  if (cachedContentMap) return cachedContentMap;
  try {
    const jsonUrl = new URL("./sovereign-skills-content.json", import.meta.url);
    const raw = readFileSync(jsonUrl, "utf8");
    cachedContentMap = JSON.parse(raw) as Record<string, string>;
  } catch {
    cachedContentMap = {};
  }
  return cachedContentMap;
}

export function getSovereignSkillContent(slugOrId: string): string | undefined {
  const slug = extractSovereignSkillSlug(slugOrId);
  const map = loadContentMap();
  return map[slug];
}

export function getSovereignSkillFull(
  slugOrId: string,
): (SovereignSkillCatalogEntry & { content: string }) | undefined {
  const entry = getSovereignSkillBySlug(slugOrId);
  if (!entry) return undefined;
  const content = getSovereignSkillContent(entry.slug) ?? `# ${entry.name}\n\n${entry.description}`;
  return {
    ...entry,
    content,
  };
}
