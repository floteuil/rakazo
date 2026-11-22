import * as z from "zod";

/**
 * Plafond strict de compétences actives par agent pour garantir une précision chirurgicale,
 * préserver le cache KV du prompt système et éviter toute dégradation de performance.
 */
export const MAX_ACTIVE_SKILLS_PER_BOT = 20 as const;

export const UNIFIED_SKILL_CATEGORIES = [
  { id: "01_Design_et_UX", label: "Design, UI/UX & Animations" },
  { id: "02_Developpement_Web", label: "Développement Web, React, Next.js & CMS" },
  { id: "03_Backend_et_APIs", label: "Backend, APIs, Microservices & Intégrations" },
  { id: "04_Bases_de_donnees", label: "Bases de Données, SQL, ORM & Vector Search" },
  { id: "05_Securite_et_Pentest", label: "Cybersécurité, DevSecOps, Audit & Conformité" },
  { id: "06_DevOps_et_Cloud", label: "DevOps, Cloud, Conteneurs, SRE & Bureautique" },
  { id: "07_IA_et_Data_Science", label: "Intelligence Artificielle, Agents, RAG & LLM" },
  { id: "08_Tests_et_Qualite", label: "Tests Automatisés, QA, TDD & Évaluation" },
  { id: "09_Productivite_et_Outils", label: "Productivité, Git, Windmill, n8n & ERP" },
  { id: "10_Gestion_de_Projet_et_Docs", label: "Architecture, Specs, ADRs & Documentation" },
  { id: "11_Divers_et_Autres", label: "Méta-Skills, Ingénierie & Expertise Métier" },
] as const;

export type UnifiedSkillCategoryId = (typeof UNIFIED_SKILL_CATEGORIES)[number]["id"];

export const SkillAdvisorEngineSchema = z.enum(["omniroute", "openrouter"]);
export type SkillAdvisorEngine = z.infer<typeof SkillAdvisorEngineSchema>;

export const CatalogSkillSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  categoryId: z.string(),
  categoryLabel: z.string(),
  tags: z.array(z.string()),
  risk: z.enum(["safe", "offensive"]),
  requiresOptIn: z.boolean(),
  isStarter: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
});
export type CatalogSkillSummary = z.infer<typeof CatalogSkillSummarySchema>;

export const SearchSkillCatalogInputSchema = z.object({
  query: z.string().max(400).optional(),
  categoryId: z.string().max(80).optional(),
  includeOffensive: z.boolean().default(false).optional(),
  onlySlugs: z.array(z.string().max(160)).max(200).optional(),
  limit: z.number().int().min(1).max(200).default(48).optional(),
  offset: z.number().int().min(0).max(10000).default(0).optional(),
});
export type SearchSkillCatalogInput = z.infer<typeof SearchSkillCatalogInputSchema>;

export const SearchSkillCatalogOutputSchema = z.object({
  items: z.array(CatalogSkillSummarySchema),
  total: z.number().int().nonnegative(),
  totalCatalogSize: z.number().int().nonnegative(),
  categories: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type SearchSkillCatalogOutput = z.infer<typeof SearchSkillCatalogOutputSchema>;

export const RecommendedSkillItemSchema = CatalogSkillSummarySchema.extend({
  reasonFr: z.string(),
  groupFr: z.string(),
  score: z.number().optional(),
});
export type RecommendedSkillItem = z.infer<typeof RecommendedSkillItemSchema>;

export const RecommendSkillsForBotInputSchema = z.object({
  goal: z
    .string()
    .min(3, "Veuillez décrire la mission de l'agent (au moins 3 caractères).")
    .max(8000, "La description de mission ne peut pas dépasser 8000 caractères."),
  refinement: z.string().max(2000).optional(),
  botName: z.string().max(120).optional(),
  botTitle: z.string().max(200).optional(),
  botInstructions: z.string().max(16000).optional(),
  currentSkillSlugs: z.array(z.string().max(160)).max(100).optional(),
  maxSkills: z
    .number()
    .int()
    .min(1)
    .max(MAX_ACTIVE_SKILLS_PER_BOT)
    .default(16)
    .optional(),
  engine: SkillAdvisorEngineSchema.default("omniroute").optional(),
  includeOffensive: z.boolean().default(false).optional(),
});
export type RecommendSkillsForBotInput = z.infer<typeof RecommendSkillsForBotInputSchema>;

export const RecommendSkillsForBotOutputSchema = z.object({
  recommended: z.array(RecommendedSkillItemSchema).max(MAX_ACTIVE_SKILLS_PER_BOT),
  summaryFr: z.string(),
  facetsExplored: z.array(z.string()),
  totalCatalogScanned: z.number().int().nonnegative(),
  candidatesEvaluated: z.number().int().nonnegative(),
  engineUsed: z.enum(["omniroute", "openrouter", "deterministic_bm25"]),
  resolvedModel: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type RecommendSkillsForBotOutput = z.infer<typeof RecommendSkillsForBotOutputSchema>;

export const SKILL_ADVISOR_PRESETS_FR = [
  {
    id: "blog_seo",
    label: "Rédaction Blog & SEO",
    prompt:
      "Cet agent est spécialisé dans la rédaction d'articles de blog SEO longue traîne, l'optimisation AEO/GEO, le maillage interne, la recherche de mots-clés, le copywriting orienté conversion et la publication structurée sur WordPress.",
  },
  {
    id: "fullstack_web",
    label: "Développeur React / Next.js",
    prompt:
      "Cet agent conçoit et développe des applications web full-stack modernes avec React 19, Next.js App Router, TypeScript strict, Tailwind CSS, design mobile-first accessible WCAG et tests E2E Playwright/Vitest.",
  },
  {
    id: "automation_ops",
    label: "Automatisation n8n & Windmill",
    prompt:
      "Cet agent orchestre des workflows métiers autonomes avec Windmill, n8n, APIs REST/Webhooks, PostgreSQL, CRM et pipelines de données fiables avec gestion d'erreurs.",
  },
  {
    id: "ecommerce_copy",
    label: "E-Commerce & Fiches Produits",
    prompt:
      "Cet agent rédige et optimise des fiches produits e-commerce persuasives, pages catégories SEO, campagnes d'acquisition, visuels produits et parcours d'achat WooCommerce.",
  },
  {
    id: "cyber_audit",
    label: "Audit Sécurité & RGPD",
    prompt:
      "Cet agent audite la sécurité applicative (OWASP, APIs, JWT, secrets, conteneurs Docker), la conformité RGPD/HDS et la qualité du code avant mise en production.",
  },
] as const;
