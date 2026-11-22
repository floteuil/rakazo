import {
  type CatalogSkillSummary,
  extractSovereignSkillSlug,
  MAX_ACTIVE_SKILLS_PER_BOT,
  type RecommendedSkillItem,
  type RecommendSkillsForBotInput,
  type RecommendSkillsForBotOutput,
  type SearchSkillCatalogInput,
  type SearchSkillCatalogOutput,
} from "@rakazo/contracts";
import { OmniRouteInferenceTransport } from "./omniroute-transport.js";
import {
  getUnifiedSkillBySlug,
  loadUnifiedSkillCatalogIndex,
  type UnifiedCatalogIndexEntry,
} from "./sovereign-skills-store.js";

const MAX_ADVISOR_TOKENS = 4096;
const ADVISOR_TIMEOUT_MS = 25_000;
const CANDIDATE_POOL_LIMIT = 80;
const MAX_CANDIDATES_PER_CATEGORY = 26;

const STOPWORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "dans",
  "pour",
  "par",
  "sur",
  "avec",
  "sans",
  "cet",
  "cette",
  "ces",
  "mon",
  "mes",
  "ton",
  "tes",
  "son",
  "ses",
  "notre",
  "nos",
  "votre",
  "vos",
  "etre",
  "est",
  "sont",
  "sera",
  "avoir",
  "faire",
  "plus",
  "tres",
  "tout",
  "tous",
  "toute",
  "toutes",
  "qui",
  "que",
  "quoi",
  "dont",
  "ou",
  "et",
  "mais",
  "donc",
  "car",
  "aux",
  "au",
  "ce",
  "se",
  "sa",
  "il",
  "elle",
  "ils",
  "elles",
  "je",
  "tu",
  "nous",
  "vous",
  "veux",
  "voudrais",
  "aimerais",
  "besoin",
  "agent",
  "bot",
  "assistant",
  "specialise",
  "specialiser",
  "mission",
  "travail",
  "tache",
  "taches",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "your",
  "use",
  "using",
  "when",
]);

/**
 * Bilingual FR -> EN & domain concept expansion dictionary so French natural-language prompts
 * recall the exact best skills across all 3,538 French & English skill entries.
 */
const BILINGUAL_CONCEPT_EXPANSIONS: Array<{
  triggers: string[];
  expansions: string[];
  facetLabelFr: string;
}> = [
  {
    triggers: [
      "blog",
      "article",
      "articles",
      "redaction",
      "rediger",
      "redacteur",
      "editorial",
      "editoriale",
      "contenu",
      "contenus",
      "ecriture",
      "copywriting",
      "storytelling",
      "plume",
    ],
    expansions: [
      "copywriting",
      "blog",
      "seo",
      "content",
      "writing",
      "editorial",
      "markdown",
      "aeo",
      "geo",
      "headline",
      "proofread",
      "faq",
      "brand-guidelines",
      "wordpress",
      "docs-as-marketing",
    ],
    facetLabelFr: "Rédaction Éditoriale & Copywriting",
  },
  {
    triggers: [
      "seo",
      "referencement",
      "mot",
      "mots",
      "cles",
      "serp",
      "trafic",
      "organique",
      "maillage",
      "backlink",
      "backlinks",
      "netlinking",
      "aeo",
      "geo",
      "google",
    ],
    expansions: [
      "seo",
      "keyword",
      "serp",
      "aeo",
      "geo",
      "backlink",
      "sitemap",
      "schema",
      "audit",
      "ubersuggest",
      "programmatic-seo",
      "content-strategy",
    ],
    facetLabelFr: "Référencement Naturel (SEO / AEO / GEO)",
  },
  {
    triggers: [
      "wordpress",
      "gutenberg",
      "elementor",
      "cms",
      "woocommerce",
      "publication",
      "publier",
    ],
    expansions: [
      "wordpress",
      "woocommerce",
      "gutenberg",
      "elementor",
      "cms",
      "php",
      "blog",
      "seo",
    ],
    facetLabelFr: "Publication CMS & WordPress",
  },
  {
    triggers: [
      "ecommerce",
      "boutique",
      "produit",
      "produits",
      "fiche",
      "fiches",
      "panier",
      "conversion",
      "cro",
      "vente",
      "ventes",
      "landing",
      "stripe",
      "shopify",
    ],
    expansions: [
      "ecommerce",
      "woocommerce",
      "shopify",
      "product",
      "conversion",
      "cro",
      "landing-page",
      "copywriting",
      "pricing",
      "stripe",
      "onboarding",
    ],
    facetLabelFr: "E-Commerce & Optimisation de Conversion",
  },
  {
    triggers: [
      "design",
      "interface",
      "ui",
      "ux",
      "maquette",
      "visuel",
      "responsive",
      "mobile",
      "telephone",
      "ergonomie",
      "accessibilite",
      "animation",
      "css",
      "tailwind",
    ],
    expansions: [
      "ui",
      "ux",
      "design",
      "frontend",
      "layout",
      "tailwind",
      "responsive",
      "mobile",
      "accessibility",
      "wcag",
      "a11y",
      "animation",
      "hig",
      "typography",
    ],
    facetLabelFr: "Design UI/UX, Mobile-First & Accessibilité",
  },
  {
    triggers: [
      "frontend",
      "react",
      "nextjs",
      "next",
      "web",
      "application",
      "composant",
      "composants",
      "typescript",
      "javascript",
      "pwa",
    ],
    expansions: [
      "react",
      "nextjs",
      "typescript",
      "javascript",
      "frontend",
      "tailwind",
      "zustand",
      "state",
      "pwa",
      "vite",
      "shadcn",
    ],
    facetLabelFr: "Ingénierie Frontend React / Next.js / TS",
  },
  {
    triggers: [
      "backend",
      "api",
      "apis",
      "rest",
      "graphql",
      "serveur",
      "microservice",
      "python",
      "fastapi",
      "node",
      "nodejs",
      "webhook",
    ],
    expansions: [
      "backend",
      "api",
      "rest",
      "graphql",
      "fastapi",
      "python",
      "nodejs",
      "pydantic",
      "openapi",
      "webhook",
      "auth",
    ],
    facetLabelFr: "Architecture Backend & APIs",
  },
  {
    triggers: [
      "base",
      "donnees",
      "bdd",
      "sql",
      "postgres",
      "postgresql",
      "prisma",
      "migration",
      "schema",
      "requete",
      "vecteur",
      "vectoriel",
      "qdrant",
      "pocketbase",
    ],
    expansions: [
      "database",
      "postgresql",
      "sql",
      "prisma",
      "migration",
      "schema",
      "optimization",
      "vector",
      "qdrant",
      "pocketbase",
    ],
    facetLabelFr: "Bases de Données, SQL & Recherche Vectorielle",
  },
  {
    triggers: [
      "automatisation",
      "automatiser",
      "workflow",
      "workflows",
      "flux",
      "n8n",
      "windmill",
      "make",
      "cron",
      "orchestration",
      "pipeline",
    ],
    expansions: [
      "automation",
      "workflow",
      "n8n",
      "windmill",
      "webhook",
      "cron",
      "pipeline",
      "script",
      "orchestration",
      "integration",
    ],
    facetLabelFr: "Automatisation & Orchestration (Windmill / n8n)",
  },
  {
    triggers: [
      "ia",
      "rag",
      "llm",
      "prompt",
      "prompts",
      "memoire",
      "autonome",
      "mcp",
      "omniroute",
      "evaluation",
    ],
    expansions: [
      "llm",
      "rag",
      "prompt",
      "agent",
      "mcp",
      "memory",
      "embedding",
      "evaluation",
      "omniroute",
      "context",
    ],
    facetLabelFr: "Ingénierie IA, RAG & Serveurs MCP",
  },
  {
    triggers: [
      "securite",
      "cyber",
      "audit",
      "rgpd",
      "gdpr",
      "hds",
      "conformite",
      "faille",
      "vulnerabilite",
      "secret",
      "secrets",
      "jwt",
    ],
    expansions: [
      "security",
      "audit",
      "vulnerability",
      "gdpr",
      "compliance",
      "jwt",
      "secrets",
      "hardening",
      "owasp",
      "container-scanning",
    ],
    facetLabelFr: "Cybersécurité, Audit & Conformité RGPD",
  },
  {
    triggers: [
      "pentest",
      "offensif",
      "offensive",
      "intrusion",
      "exploit",
      "redteam",
      "fuzzing",
      "burp",
    ],
    expansions: [
      "penetration",
      "pentest",
      "exploit",
      "fuzzing",
      "injection",
      "burp",
      "reverse",
      "vulnerability",
    ],
    facetLabelFr: "Tests d'Intrusion & Sécurité Offensive",
  },
  {
    triggers: [
      "devops",
      "docker",
      "coolify",
      "cloud",
      "cloudflare",
      "vps",
      "deploiement",
      "deployer",
      "production",
      "monitoring",
      "incident",
      "linux",
    ],
    expansions: [
      "devops",
      "docker",
      "deployment",
      "coolify",
      "cloudflare",
      "linux",
      "vps",
      "container",
      "github-actions",
      "incident",
      "sre",
    ],
    facetLabelFr: "DevOps, Conteneurs Docker & Cloud",
  },
  {
    triggers: [
      "test",
      "tests",
      "qualite",
      "qa",
      "tdd",
      "e2e",
      "playwright",
      "vitest",
      "bug",
      "bugs",
      "debogage",
      "revue",
      "clean",
    ],
    expansions: [
      "testing",
      "qa",
      "tdd",
      "e2e",
      "playwright",
      "vitest",
      "debugging",
      "code-review",
      "clean-code",
      "lint",
      "coverage",
    ],
    facetLabelFr: "Qualité Logicielle, Tests Automatisés & Revue",
  },
  {
    triggers: [
      "reseaux",
      "sociaux",
      "social",
      "linkedin",
      "instagram",
      "tiktok",
      "newsletter",
      "email",
      "marketing",
      "marque",
      "branding",
      "presentation",
      "slides",
    ],
    expansions: [
      "social",
      "marketing",
      "brand",
      "email",
      "newsletter",
      "copywriting",
      "slides",
      "presentation",
      "image",
      "content",
    ],
    facetLabelFr: "Réseaux Sociaux, Marque & Contenus Visuels",
  },
  {
    triggers: [
      "client",
      "clients",
      "support",
      "sav",
      "crm",
      "twenty",
      "odoo",
      "facture",
      "facturation",
      "comptabilite",
      "commercial",
      "prospect",
    ],
    expansions: [
      "customer",
      "support",
      "crm",
      "odoo",
      "chatwoot",
      "onboarding",
      "research",
      "sales",
      "faq",
      "erp",
    ],
    facetLabelFr: "Relation Client, CRM & Gestion Métier",
  },
  {
    triggers: [
      "documentation",
      "doc",
      "docs",
      "wiki",
      "readme",
      "tutoriel",
      "architecture",
      "adr",
      "cahier",
      "charges",
      "plan",
    ],
    expansions: [
      "documentation",
      "readme",
      "wiki",
      "tutorial",
      "architecture",
      "adr",
      "domain-modeling",
      "writing-plans",
      "mermaid",
    ],
    facetLabelFr: "Documentation Technique, Architecture & Specs",
  },
];

interface IndexedSkillDoc {
  entry: UnifiedCatalogIndexEntry;
  docLen: number;
  termWeights: Map<string, number>;
  slugNorm: string;
  nameNorm: string;
  haystackLower: string;
}

interface BuiltSearchEngine {
  docs: IndexedSkillDoc[];
  avgDocLen: number;
  idf: Map<string, number>;
}

let cachedEngine: BuiltSearchEngine | null = null;

// biome-ignore lint/suspicious/noControlCharactersInRegex: Fast ASCII check skips expensive ICU NFD normalization on pure-ASCII strings
const NON_ASCII_RE = /[^\x00-\x7f]/;

export function normalizeSearchText(text: string): string {
  const lower = text.toLowerCase();
  const deaccented = NON_ASCII_RE.test(lower)
    ? lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : lower;
  return deaccented.replace(/[^a-z0-9-]+/g, " ").trim();
}

function tokenize(text: string): string[] {
  const norm = normalizeSearchText(text);
  if (!norm) return [];
  const out: string[] = [];
  for (const raw of norm.split(/\s+/)) {
    if (!raw) continue;
    for (const part of raw.split("-")) {
      if (part.length >= 2 && !STOPWORDS.has(part)) {
        out.push(part);
      }
    }
    if (raw.includes("-") && raw.length >= 4) {
      out.push(raw);
    }
  }
  return out;
}

function addWeightedTokens(map: Map<string, number>, tokens: string[], weight: number): number {
  let added = 0;
  for (const tok of tokens) {
    map.set(tok, (map.get(tok) ?? 0) + weight);
    added += weight;
  }
  return added;
}

function getSearchEngine(): BuiltSearchEngine {
  if (cachedEngine) return cachedEngine;

  const catalog = loadUnifiedSkillCatalogIndex();
  const df = new Map<string, number>();
  const docs: IndexedSkillDoc[] = [];
  let totalLen = 0;

  for (const entry of catalog.skills) {
    const termWeights = new Map<string, number>();
    let docLen = 0;
    docLen += addWeightedTokens(termWeights, tokenize(entry.slug), 4.5);
    docLen += addWeightedTokens(termWeights, tokenize(entry.name), 4.0);
    docLen += addWeightedTokens(termWeights, tokenize(entry.tags.join(" ")), 3.2);
    docLen += addWeightedTokens(termWeights, tokenize(entry.categoryLabel), 1.5);
    docLen += addWeightedTokens(termWeights, tokenize(entry.description), 1.6);
    if (entry.enHint) {
      docLen += addWeightedTokens(termWeights, tokenize(entry.enHint), 1.5);
    }

    for (const term of termWeights.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }

    const slugNorm = normalizeSearchText(entry.slug);
    const nameNorm = normalizeSearchText(entry.name);
    const haystackLower = normalizeSearchText(
      `${entry.slug} ${entry.name} ${entry.tags.join(" ")} ${entry.categoryLabel} ${entry.description} ${entry.enHint ?? ""}`,
    );

    docs.push({
      entry,
      docLen: Math.max(1, docLen),
      termWeights,
      slugNorm,
      nameNorm,
      haystackLower,
    });
    totalLen += Math.max(1, docLen);
  }

  const nDocs = Math.max(1, docs.length);
  const idf = new Map<string, number>();
  for (const [term, freq] of df.entries()) {
    idf.set(term, Math.log(1 + (nDocs - freq + 0.5) / (freq + 0.5)));
  }

  cachedEngine = {
    docs,
    avgDocLen: totalLen / nDocs,
    idf,
  };
  return cachedEngine;
}

function toPublicSummary(entry: UnifiedCatalogIndexEntry): CatalogSkillSummary {
  return {
    id: entry.id,
    slug: entry.slug,
    name: entry.name,
    description: entry.description,
    categoryId: entry.categoryId,
    categoryLabel: entry.categoryLabel,
    tags: entry.tags,
    risk: entry.risk,
    requiresOptIn: entry.requiresOptIn,
    isStarter: entry.isStarter,
    sizeBytes: entry.sizeBytes,
  };
}

export function expandQueryWithBilingualFacets(rawText: string): {
  queryTerms: Map<string, number>;
  facetsExplored: string[];
  detectedOffensiveIntent: boolean;
} {
  const baseTokens = tokenize(rawText);
  const tokenSet = new Set(baseTokens);
  const queryTerms = new Map<string, number>();

  for (const tok of baseTokens) {
    queryTerms.set(tok, (queryTerms.get(tok) ?? 0) + 2.2);
  }

  const facetsExplored: string[] = [];
  let detectedOffensiveIntent = false;

  for (const group of BILINGUAL_CONCEPT_EXPANSIONS) {
    const matched = group.triggers.some((trig) => tokenSet.has(trig));
    if (matched) {
      facetsExplored.push(group.facetLabelFr);
      if (group.facetLabelFr.includes("Offensive")) {
        detectedOffensiveIntent = true;
      }
      for (const exp of group.expansions) {
        for (const subTok of tokenize(exp)) {
          queryTerms.set(subTok, Math.max(queryTerms.get(subTok) ?? 0, 1.35));
        }
      }
    }
  }

  return { queryTerms, facetsExplored, detectedOffensiveIntent };
}

function scoreDocBM25(
  doc: IndexedSkillDoc,
  engine: BuiltSearchEngine,
  queryTerms: Map<string, number>,
  normalizedRawQuery: string,
): number {
  const k1 = 1.5;
  const b = 0.72;
  let score = 0;

  for (const [qTerm, qBoost] of queryTerms.entries()) {
    const tf = doc.termWeights.get(qTerm);
    if (!tf) continue;
    const idf = engine.idf.get(qTerm) ?? 0.5;
    const denom = tf + k1 * (1 - b + b * (doc.docLen / engine.avgDocLen));
    score += idf * ((tf * (k1 + 1)) / denom) * qBoost;
  }

  // Substring & prefix match boosts for interactive search feel
  if (normalizedRawQuery.length >= 3) {
    if (doc.slugNorm === normalizedRawQuery || doc.nameNorm === normalizedRawQuery) {
      score += 35;
    } else if (
      doc.slugNorm.includes(normalizedRawQuery) ||
      doc.nameNorm.includes(normalizedRawQuery)
    ) {
      score += 14;
    } else if (doc.haystackLower.includes(normalizedRawQuery)) {
      score += 5;
    }
  }

  // Slight tie-breaker bonus for French-enriched starter skills when relevance is equal
  if (score > 0 && doc.entry.isStarter) {
    score += 0.65;
  }

  return score;
}

/**
 * Fast (< 5ms) manual search and filtering across the complete 3,538+ Unified Native Skill Catalog.
 */
export function searchUnifiedSkillCatalog(
  input: SearchSkillCatalogInput = {},
): SearchSkillCatalogOutput {
  const catalog = loadUnifiedSkillCatalogIndex();
  const engine = getSearchEngine();
  const includeOffensive = input.includeOffensive === true;
  const categoryFilter = input.categoryId?.trim() || "";
  const query = input.query?.trim() || "";
  const limit = Math.min(200, Math.max(1, input.limit ?? 48));
  const offset = Math.max(0, input.offset ?? 0);

  if (input.onlySlugs && input.onlySlugs.length > 0) {
    const items: CatalogSkillSummary[] = [];
    const seen = new Set<string>();
    for (const s of input.onlySlugs) {
      const found = getUnifiedSkillBySlug(s);
      if (found && !seen.has(found.slug)) {
        seen.add(found.slug);
        items.push(toPublicSummary(found));
      }
    }
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      totalCatalogSize: catalog.totalSkills,
      categories: catalog.categories,
    };
  }

  const eligibleDocs = engine.docs.filter((doc) => {
    if (!includeOffensive && doc.entry.requiresOptIn) return false;
    if (categoryFilter && categoryFilter !== "all" && doc.entry.categoryId !== categoryFilter) {
      return false;
    }
    return true;
  });

  if (!query) {
    // Default browse order: French-enriched starter skills first, then alphabetical
    const sorted = [...eligibleDocs].sort((a, b) => {
      if (a.entry.isStarter !== b.entry.isStarter) {
        return a.entry.isStarter ? -1 : 1;
      }
      return a.entry.name.localeCompare(b.entry.name, "fr");
    });
    return {
      items: sorted.slice(offset, offset + limit).map((d) => toPublicSummary(d.entry)),
      total: sorted.length,
      totalCatalogSize: catalog.totalSkills,
      categories: catalog.categories,
    };
  }

  const normQuery = normalizeSearchText(query);
  const { queryTerms } = expandQueryWithBilingualFacets(query);
  const scored: Array<{ entry: UnifiedCatalogIndexEntry; score: number }> = [];

  for (const doc of eligibleDocs) {
    let sc = scoreDocBM25(doc, engine, queryTerms, normQuery);
    // Prefix fallback for 2-char or partial word typing
    if (sc === 0 && normQuery.length >= 2 && doc.haystackLower.includes(normQuery)) {
      sc = 2.0;
    }
    if (sc > 0) {
      scored.push({ entry: doc.entry, score: sc });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug));

  return {
    items: scored.slice(offset, offset + limit).map((s) => toPublicSummary(s.entry)),
    total: scored.length,
    totalCatalogSize: catalog.totalSkills,
    categories: catalog.categories,
  };
}

export interface LlmAdvisorCallResult {
  rawContent: string;
  engineUsed: "omniroute" | "openrouter";
  resolvedModel?: string;
}

export interface SkillAdvisorOptions {
  omnirouteBaseUrl?: string;
  omnirouteApiKey?: string;
  openRouterApiKey?: string;
  openRouterBaseUrl?: string;
  openRouterModel?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Optional override hook for deterministic unit/adversarial testing */
  llmCompleteFn?: (params: {
    systemPrompt: string;
    userPrompt: string;
    preferredEngine: "omniroute" | "openrouter";
  }) => Promise<LlmAdvisorCallResult>;
}

interface ParsedAdvisorSelection {
  slug: string;
  groupFr: string;
  reasonFr: string;
}

interface ParsedAdvisorJson {
  summaryFr?: string;
  facetsExplored?: string[];
  selections?: ParsedAdvisorSelection[];
}

function extractAdvisorJson(raw: string): ParsedAdvisorJson | null {
  const withoutThoughts = raw.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
  const fenced = withoutThoughts.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? withoutThoughts;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<
      string,
      unknown
    >;
    const rawSelections = Array.isArray(parsed.selections)
      ? parsed.selections
      : Array.isArray(parsed.recommended)
        ? parsed.recommended
        : [];
    const selections: ParsedAdvisorSelection[] = [];
    for (const item of rawSelections) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const slug = typeof obj.slug === "string" ? extractSovereignSkillSlug(obj.slug) : "";
      if (!slug) continue;
      selections.push({
        slug,
        groupFr:
          typeof obj.groupFr === "string" && obj.groupFr.trim()
            ? obj.groupFr.trim().slice(0, 90)
            : "Compétences Recommandées",
        reasonFr:
          typeof obj.reasonFr === "string" && obj.reasonFr.trim()
            ? obj.reasonFr.trim().slice(0, 260)
            : "Pertinent pour couvrir efficacement cette facette de la mission de l'agent.",
      });
    }
    return {
      summaryFr:
        typeof parsed.summaryFr === "string" ? parsed.summaryFr.trim().slice(0, 600) : undefined,
      facetsExplored: Array.isArray(parsed.facetsExplored)
        ? parsed.facetsExplored.map((f) => String(f).trim()).filter(Boolean).slice(0, 8)
        : undefined,
      selections,
    };
  } catch {
    return null;
  }
}

async function runOmniRouteCompletion(
  options: SkillAdvisorOptions,
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmAdvisorCallResult> {
  const modelsToTry = ["combo/rakazo-fast", "combo/rakazo-reasoning"];
  let lastError: unknown;

  for (const comboModel of modelsToTry) {
    try {
      const transport = new OmniRouteInferenceTransport({
        baseUrl: options.omnirouteBaseUrl,
        apiKey: options.omnirouteApiKey,
        defaultModel: comboModel,
        timeoutMs: options.timeoutMs ?? ADVISOR_TIMEOUT_MS,
      });

      let content = "";
      let resolvedModel: string | undefined = comboModel;

      for await (const chunk of transport.stream({
        model: comboModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        maxTokens: MAX_ADVISOR_TOKENS,
      })) {
        if (chunk.type === "text" && chunk.text) {
          content += chunk.text;
        } else if (chunk.type === "usage" && chunk.usage?.resolvedModel) {
          resolvedModel = chunk.usage.resolvedModel;
        }
      }

      const parsedCheck = extractAdvisorJson(content);
      if (parsedCheck?.selections && parsedCheck.selections.length > 0) {
        return {
          rawContent: content,
          engineUsed: "omniroute",
          resolvedModel,
        };
      }
      lastError = new Error(`Unparseable JSON from ${comboModel}`);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OmniRoute advisor unavailable");
}

async function runOpenRouterCompletion(
  options: SkillAdvisorOptions,
  systemPrompt: string,
  userPrompt: string,
): Promise<LlmAdvisorCallResult> {
  const apiKey = (options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured");
  }
  const baseUrl = (
    options.openRouterBaseUrl ??
    process.env.OPENROUTER_BASE_URL ??
    "https://openrouter.ai/api/v1"
  ).replace(/\/+$/, "");
  const model =
    options.openRouterModel ?? process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
  const fetchImpl = options.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? ADVISOR_TIMEOUT_MS);

  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: MAX_ADVISOR_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`OpenRouter HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new Error("Empty OpenRouter response");
    }
    return {
      rawContent: content,
      engineUsed: "openrouter",
      resolvedModel: json.model ?? model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildDeterministicReasonFr(
  entry: UnifiedCatalogIndexEntry,
  facets: string[],
): { groupFr: string; reasonFr: string } {
  const groupFr = entry.categoryLabel;
  const tagHint = entry.tags.slice(0, 3).join(", ");
  const reasonFr = tagHint
    ? `Sélectionné pour renforcer le pôle « ${entry.categoryLabel} » (${tagHint}) en adéquation directe avec la mission décrite.`
    : facets[0]
      ? `Couvre les bonnes pratiques clés liées à « ${facets[0]} » pour sécuriser l'exécution de l'agent.`
      : `Apporte des procédures opérationnelles éprouvées pour accompagner les tâches principales de l'agent.`;
  return { groupFr, reasonFr };
}

/**
 * 2-Stage Hybrid AI Skill Advisor:
 * Stage 1: Scans all 3,538+ unified skills via Bilingual FR<->EN BM25 with category diversity.
 * Stage 2: Curates <= 20 complementary skills via OmniRoute (99% primary) with OpenRouter / BM25 fallback.
 */
export async function recommendSkillsForBot(
  input: RecommendSkillsForBotInput,
  options: SkillAdvisorOptions = {},
): Promise<RecommendSkillsForBotOutput> {
  const startTime = Date.now();
  const catalog = loadUnifiedSkillCatalogIndex();
  const engine = getSearchEngine();

  const hardMax = Math.min(
    MAX_ACTIVE_SKILLS_PER_BOT,
    Math.max(1, Math.trunc(input.maxSkills ?? 16)),
  );
  const preferredEngine = input.engine ?? "omniroute";
  const compositeContext = [
    input.goal,
    input.refinement ? `Affinement demandé : ${input.refinement}` : "",
    input.botName ? `Nom de l'agent : ${input.botName}` : "",
    input.botTitle ? `Rôle : ${input.botTitle}` : "",
    input.botInstructions ? input.botInstructions.slice(0, 1500) : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { queryTerms, facetsExplored, detectedOffensiveIntent } =
    expandQueryWithBilingualFacets(compositeContext);
  const allowOffensive = input.includeOffensive === true || detectedOffensiveIntent;
  const normGoal = normalizeSearchText(
    input.refinement ? `${input.goal} ${input.refinement}` : input.goal,
  );

  // Stage 1: Full-catalog BM25 scoring + category-diversified Top-90 candidate pool
  const allScored: Array<{ entry: UnifiedCatalogIndexEntry; score: number }> = [];
  for (const doc of engine.docs) {
    if (!allowOffensive && doc.entry.requiresOptIn) continue;
    const sc = scoreDocBM25(doc, engine, queryTerms, normGoal);
    if (sc > 0) {
      allScored.push({ entry: doc.entry, score: sc });
    }
  }
  allScored.sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug));

  const candidates: Array<{ entry: UnifiedCatalogIndexEntry; score: number }> = [];
  const perCategoryCount = new Map<string, number>();

  for (const item of allScored) {
    if (candidates.length >= CANDIDATE_POOL_LIMIT) break;
    const catCount = perCategoryCount.get(item.entry.categoryId) ?? 0;
    if (catCount >= MAX_CANDIDATES_PER_CATEGORY) continue;
    perCategoryCount.set(item.entry.categoryId, catCount + 1);
    candidates.push(item);
  }

  // Fallback if prompt had only ultra-generic words: seed with starter skills
  if (candidates.length === 0) {
    for (const doc of engine.docs) {
      if (!allowOffensive && doc.entry.requiresOptIn) continue;
      if (doc.entry.isStarter) {
        candidates.push({ entry: doc.entry, score: 1 });
        if (candidates.length >= CANDIDATE_POOL_LIMIT) break;
      }
    }
  }

  const candidateScoreBySlug = new Map(candidates.map((c) => [c.entry.slug, c.score]));

  // Stage 2: OmniRoute AI Curation (99% primary) -> Optional OpenRouter -> Deterministic BM25
  const systemPrompt = [
    "Tu es l'Architecte Conseiller en Compétences (Skills Advisor) de Rakazo.",
    `Ta mission : analyser le besoin métier de l'utilisateur et sélectionner LES MEILLEURES compétences complémentaires parmi les candidats du catalogue natif Rakazo, dans une limite STRICTE de ${hardMax} compétences maximum (jamais plus de ${MAX_ACTIVE_SKILLS_PER_BOT}).`,
    "Règles impératives :",
    `1. Sélectionne entre ${Math.min(6, hardMax)} et ${hardMax} compétences MAXIMUM, sans doublons fonctionnels : couvre intelligemment toutes les facettes utiles du métier de l'agent.`,
    "2. Utilise EXCLUSIVEMENT les `slug` exacts présents dans la liste des candidats ci-dessous (n'invente jamais de slug).",
    "3. Regroupe les compétences choisies en 3 à 5 pôles métiers clairs en français (`groupFr`) et rédige pour chacune une justification concrète en français (`reasonFr`, 1 phrase concise).",
    "4. Réponds UNIQUEMENT avec un objet JSON valide respectant strictement ce schéma, sans texte avant ni après :",
    '{"summaryFr":"Synthèse stratégique en 2 phrases en français.","facetsExplored":["Pôle 1","Pôle 2"],"selections":[{"slug":"slug-exact","groupFr":"Nom du Pôle en Français","reasonFr":"Pourquoi cette compétence aide concrètement cet agent."}]}',
  ].join("\n");

  const currentSlugsLine =
    input.currentSkillSlugs && input.currentSkillSlugs.length > 0
      ? `Compétences déjà attachées à l'agent : ${input.currentSkillSlugs.slice(0, 20).join(", ")}\n`
      : "";

  const candidatesText = candidates
    .map(
      (c, idx) =>
        `${idx + 1}. ${c.entry.slug} | ${c.entry.name} | [${c.entry.categoryLabel}] | ${c.entry.description.slice(0, 145)}`,
    )
    .join("\n");

  const userPrompt = [
    `Plafond demandé : maximum ${hardMax} compétences.`,
    input.botName || input.botTitle
      ? `Agent : ${[input.botName, input.botTitle].filter(Boolean).join(" — ")}`
      : "",
    `Mission principale demandée par l'utilisateur :\n${input.goal.trim()}`,
    input.refinement?.trim()
      ? `Directive d'affinement / ajustement :\n${input.refinement.trim()}`
      : "",
    input.botInstructions?.trim()
      ? `Extrait du prompt système actuel :\n${input.botInstructions.trim().slice(0, 900)}`
      : "",
    currentSlugsLine,
    `Catalogue candidat pré-filtré (${candidates.length} compétences sur ${catalog.totalSkills}) :\n${candidatesText}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let llmResult: LlmAdvisorCallResult | null = null;

  try {
    if (options.llmCompleteFn) {
      llmResult = await options.llmCompleteFn({
        systemPrompt,
        userPrompt,
        preferredEngine,
      });
    } else if (preferredEngine === "omniroute") {
      try {
        llmResult = await runOmniRouteCompletion(options, systemPrompt, userPrompt);
      } catch {
        // Optional OpenRouter secondary backup if configured
        if ((options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? "").trim()) {
          llmResult = await runOpenRouterCompletion(options, systemPrompt, userPrompt);
        }
      }
    } else {
      try {
        llmResult = await runOpenRouterCompletion(options, systemPrompt, userPrompt);
      } catch {
        llmResult = await runOmniRouteCompletion(options, systemPrompt, userPrompt);
      }
    }
  } catch {
    llmResult = null;
  }

  if (llmResult) {
    const parsed = extractAdvisorJson(llmResult.rawContent);
    if (parsed && parsed.selections && parsed.selections.length > 0) {
      const validated: RecommendedSkillItem[] = [];
      const seenSlugs = new Set<string>();

      for (const sel of parsed.selections) {
        if (validated.length >= hardMax) break;
        if (seenSlugs.has(sel.slug)) continue;
        const realEntry = getUnifiedSkillBySlug(sel.slug);
        if (!realEntry) continue;
        if (!allowOffensive && realEntry.requiresOptIn) continue;

        seenSlugs.add(realEntry.slug);
        validated.push({
          ...toPublicSummary(realEntry),
          groupFr: sel.groupFr,
          reasonFr: sel.reasonFr,
          score: candidateScoreBySlug.get(realEntry.slug),
        });
      }

      if (validated.length > 0) {
        return {
          recommended: validated.slice(0, hardMax),
          summaryFr:
            parsed.summaryFr ||
            `Sélection sur-mesure de ${validated.length} compétences complémentaires analysées parmi les ${catalog.totalSkills} compétences natives Rakazo.`,
          facetsExplored:
            parsed.facetsExplored && parsed.facetsExplored.length > 0
              ? parsed.facetsExplored
              : facetsExplored.length > 0
                ? facetsExplored
                : ["Analyse sémantique multi-pôles"],
          totalCatalogScanned: catalog.totalSkills,
          candidatesEvaluated: candidates.length,
          engineUsed: llmResult.engineUsed,
          resolvedModel: llmResult.resolvedModel,
          durationMs: Math.max(1, Date.now() - startTime),
        };
      }
    }
  }

  // Deterministic diversified BM25 fallback (guarantees 100% uptime & zero failure)
  const fallbackItems: RecommendedSkillItem[] = [];
  const catQuota = new Map<string, number>();
  const maxPerCatInFinal = Math.max(4, Math.ceil(hardMax / 2));

  for (const cand of candidates) {
    if (fallbackItems.length >= hardMax) break;
    const usedInCat = catQuota.get(cand.entry.categoryId) ?? 0;
    if (usedInCat >= maxPerCatInFinal) continue;
    catQuota.set(cand.entry.categoryId, usedInCat + 1);
    const { groupFr, reasonFr } = buildDeterministicReasonFr(cand.entry, facetsExplored);
    fallbackItems.push({
      ...toPublicSummary(cand.entry),
      groupFr,
      reasonFr,
      score: Number(cand.score.toFixed(2)),
    });
  }

  return {
    recommended: fallbackItems,
    summaryFr: `Sélection hybride de ${fallbackItems.length} compétences haute pertinence identifiées parmi les ${catalog.totalSkills} compétences de votre bibliothèque native Rakazo.`,
    facetsExplored:
      facetsExplored.length > 0 ? facetsExplored : ["Correspondance lexicale & métier BM25"],
    totalCatalogScanned: catalog.totalSkills,
    candidatesEvaluated: candidates.length,
    engineUsed: "deterministic_bm25",
    durationMs: Math.max(1, Date.now() - startTime),
  };
}
