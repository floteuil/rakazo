import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  type CatalogSkillSummary,
  extractSovereignSkillSlug,
  getSovereignSkillBySlug,
  type SovereignSkillCatalogEntry,
  type SovereignSkillCategoryId,
} from "@rakazo/contracts";

export interface UnifiedCatalogIndexEntry extends CatalogSkillSummary {
  enHint?: string;
}

interface UnifiedCatalogIndexFile {
  version: string;
  totalSkills: number;
  categories: Array<{ id: string; label: string; count: number }>;
  skills: UnifiedCatalogIndexEntry[];
}

const UNIFIED_TO_SOVEREIGN_CATEGORY: Record<string, SovereignSkillCategoryId> = {
  "01_Design_et_UX": "design_ui_ux",
  "02_Developpement_Web": "web_frontend",
  "03_Backend_et_APIs": "backend_data",
  "04_Bases_de_donnees": "backend_data",
  "05_Securite_et_Pentest": "devops_security",
  "06_DevOps_et_Cloud": "devops_security",
  "07_IA_et_Data_Science": "automation_ai",
  "08_Tests_et_Qualite": "qa_docs_git",
  "09_Productivite_et_Outils": "automation_ai",
  "10_Gestion_de_Projet_et_Docs": "qa_docs_git",
  "11_Divers_et_Autres": "seo_marketing",
};

const MAX_CACHED_SHARDS = 6;

let cachedIndex: UnifiedCatalogIndexFile | null = null;
let cachedBySlug: Map<string, UnifiedCatalogIndexEntry> | null = null;
let cachedLegacyContentMap: Record<string, string> | null = null;
const shardLruCache = new Map<string, Record<string, string>>();

export function loadUnifiedSkillCatalogIndex(): UnifiedCatalogIndexFile {
  if (cachedIndex) return cachedIndex;
  try {
    const gzUrl = new URL("./unified-skills-archive/catalog-index.json.gz", import.meta.url);
    const compressed = readFileSync(gzUrl);
    const jsonText = gunzipSync(compressed).toString("utf8");
    cachedIndex = JSON.parse(jsonText) as UnifiedCatalogIndexFile;
  } catch {
    cachedIndex = { version: "2.0.0", totalSkills: 0, categories: [], skills: [] };
  }
  cachedBySlug = new Map(cachedIndex.skills.map((entry) => [entry.slug.toLowerCase(), entry]));
  return cachedIndex;
}

export function getUnifiedSkillBySlug(slugOrId: string): UnifiedCatalogIndexEntry | undefined {
  const slug = extractSovereignSkillSlug(slugOrId);
  if (!cachedBySlug) {
    loadUnifiedSkillCatalogIndex();
  }
  return cachedBySlug?.get(slug);
}

function loadCategoryShard(categoryId: string): Record<string, string> {
  const hit = shardLruCache.get(categoryId);
  if (hit) {
    // Refresh LRU order
    shardLruCache.delete(categoryId);
    shardLruCache.set(categoryId, hit);
    return hit;
  }

  let parsed: Record<string, string> = {};
  try {
    const shardUrl = new URL(
      `./unified-skills-archive/shard-${categoryId}.json.gz`,
      import.meta.url,
    );
    const compressed = readFileSync(shardUrl);
    parsed = JSON.parse(gunzipSync(compressed).toString("utf8")) as Record<string, string>;
  } catch {
    parsed = {};
  }

  if (shardLruCache.size >= MAX_CACHED_SHARDS) {
    const oldestKey = shardLruCache.keys().next().value;
    if (oldestKey) shardLruCache.delete(oldestKey);
  }
  shardLruCache.set(categoryId, parsed);
  return parsed;
}

function loadLegacyContentMap(): Record<string, string> {
  if (cachedLegacyContentMap) return cachedLegacyContentMap;
  try {
    const jsonUrl = new URL("./sovereign-skills-content.json", import.meta.url);
    const raw = readFileSync(jsonUrl, "utf8");
    cachedLegacyContentMap = JSON.parse(raw) as Record<string, string>;
  } catch {
    cachedLegacyContentMap = {};
  }
  return cachedLegacyContentMap;
}

export function getSovereignSkillContent(slugOrId: string): string | undefined {
  const slug = extractSovereignSkillSlug(slugOrId);
  const unified = getUnifiedSkillBySlug(slug);
  if (unified?.isStarter) {
    const legacyStarter = loadLegacyContentMap()[slug];
    if (legacyStarter) return legacyStarter;
  }
  if (unified) {
    const shard = loadCategoryShard(unified.categoryId);
    if (shard[unified.slug]) {
      return shard[unified.slug];
    }
  }
  const legacyMap = loadLegacyContentMap();
  return legacyMap[slug];
}

export function getSovereignSkillFull(
  slugOrId: string,
): (SovereignSkillCatalogEntry & { content: string }) | undefined {
  const starterEntry = getSovereignSkillBySlug(slugOrId);
  if (starterEntry) {
    const content =
      getSovereignSkillContent(starterEntry.slug) ??
      `# ${starterEntry.name}\n\n${starterEntry.description}`;
    return {
      ...starterEntry,
      content,
    };
  }

  const unified = getUnifiedSkillBySlug(slugOrId);
  if (!unified) return undefined;

  const content =
    getSovereignSkillContent(unified.slug) ?? `# ${unified.name}\n\n${unified.description}`;
  const mappedCategory: SovereignSkillCategoryId =
    UNIFIED_TO_SOVEREIGN_CATEGORY[unified.categoryId] ?? "automation_ai";

  return {
    id: unified.id,
    slug: unified.slug,
    name: unified.name,
    description: unified.description,
    packId: unified.categoryId,
    packName: unified.categoryLabel,
    category: mappedCategory,
    tags: unified.tags,
    sizeBytes: unified.sizeBytes,
    content,
  };
}
