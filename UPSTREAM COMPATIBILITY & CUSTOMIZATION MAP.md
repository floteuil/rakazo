# UPSTREAM COMPATIBILITY & CUSTOMIZATION MAP

**Ecosystème**: Rakazo AI Autonomous Agent Platform  
**Dépôt Amont (Upstream)**: `https://github.com/elie222/rakazo.git` (branche `main`)  
**Dépôt Local / Production**: `https://github.com/floteuil/rakazo.git` (branche `main`)  
**Mécanisme de Synchronisation**: `.github/workflows/sync-upstream.yml` (Quotidien à 04:00 UTC)  
**Date d'actualisation**: 2026-08-26  
**Statut de Compatibilité**: 100% Additif — Zéro Conflit Destructif  

---

## 1. Principes Directeurs d'Architecture Additive

Pour assurer une coexistence harmonieuse et pérenne avec les développements continus du projet original `elie222/rakazo`, toutes nos personnalisations respectent strictement la **stratégie d'extension additive** :

1. **Isolation Modulaire dans de Nouveaux Fichiers** :
   Les nouveaux services métier, interfaces graphiques, schémas de validation et utilitaires de runtime sont créés dans des fichiers distincts et dédiés (`prompt-compiler.ts`, `prefix-caching.ts`, `tool-compacting.ts`, `PromptCompilerModal.tsx`).
2. **Points d'Injection Minimaux et Non-Invasifs** :
   Dans les fichiers amont partagés (tels que `Shell.tsx` ou `executor.ts`), les modifications se limitent à des appels de composants additifs ou à des réordonnancements de tableaux de chaînes (ordonnancement 4-blocs), sans jamais supprimer ou altérer la signature des fonctions existantes.
3. **Schémas Zod & Types Additifs dans `@rakazo/contracts`** :
   Toutes les nouvelles structures (`PromptCompileInput`, `PromptCompileOutput`, `Assembled4BlockPrompt`) enrichissent les types sans modifier les types préexistants (`Bot`, `Thread`, `Run`).
4. **Préservation Stricte des Schémas de Base de Données** :
   Toutes les migrations PostgreSQL et modèles Prisma sont additifs et rétrocompatibles.
5. **Résilience en Cas de Conflit Git** :
   Le workflow GitHub Actions `.github/workflows/sync-upstream.yml` détecte automatiquement les nouveaux commits amont, tente une fusion propre, et en cas de conflit rare, déclenche une Pull Request d'arbitrage (`upstream-sync-conflict`) sans jamais écraser le code local.

---

## 2. Cartographie Complète des Personnalisations par Package

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MONOREPO RAKAZO (TURBO 2 + PNPM)                   │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ APPLICATIONS                  │ PACKAGES PARTAGÉS                           │
│ • apps/web    (React 18 + Vite│ • @rakazo/contracts (Schémas Zod, MCP)      │
│ • apps/api    (Hono / Fastify)│ • @rakazo/adapters  (Runtime Pi, Outils)    │
│ • apps/worker (Jobs & Queues) │ • @rakazo/db        (Prisma 7 + PostgreSQL) │
│ • apps/mobile (React Native)  │ • @rakazo/core      (Logique métier, auth)  │
│ • apps/desktop(Electron)      │ • @rakazo/chat-ui   (Composants Markdown)   │
│ • apps/www    (Astro landing) │ • @rakazo/ui-web    (Tokens, primitives UI) │
└───────────────────────────────┴─────────────────────────────────────────────┘
```

### Tableau Détaillé des Fichiers Personnalisés

| Package | Fichier | Type de Modification | Description & Rôle | Statut Upstream |
|---|---|---|---|---|
| **@rakazo/contracts** | `src/prompt-compiler.ts` | **NOUVEAU FICHIER** | Schémas Zod `PromptCompileInputSchema`, `PromptCompileOutputSchema`, types de compilation niveau 1 et 2, télémétrie | 100% Additif |
| **@rakazo/contracts** | `src/rpc.ts` | **MODIFICATION MINEURE** | Enregistrement de la route `prompts.compile` dans `appContract` | Point d'injection propre |
| **@rakazo/contracts** | `src/index.ts` | **MODIFICATION MINEURE** | Re-export de `prompt-compiler.js` | 100% Additif |
| **@rakazo/adapter-kit** | `src/types.ts` | **MODIFICATION MINEURE** | Ajout de `cachedTokens?` et `cacheHitRatio?` à l'événement `usage` | Rétrocompatible |
| **@rakazo/adapters** | `src/prompt-compiler.ts` | **NOUVEAU FICHIER** | Implémentation du service `PromptCompilerService` (Niveau 1 déterministe + Niveau 2 `gpt-oss-120b` via OpenRouter) avec `sanitizeToolError` | 100% Additif |
| **@rakazo/adapters** | `src/prefix-caching.ts` | **NOUVEAU FICHIER** | Moteur d'assemblage 4-blocs (`assemble4BlockCachePrompt`), calcul de télémétrie (`extractCacheTelemetry`), clé de session affinity (`computeSessionAffinityKey`) | 100% Additif |
| **@rakazo/adapters** | `src/tool-compacting.ts` | **NOUVEAU FICHIER** | Compactage sémantique des retours d'outils volumineux (shell, GitHub, Notion, Cloudflare) avec protection mémoire | 100% Additif |
| **@rakazo/adapters** | `src/loop-guards.ts` | **FICHIER ENRICHI** | Disjoncteurs anti-emballement (`MAX_TOOL_ITERATIONS_PER_TURN = 25`, `MAX_CONSECUTIVE_REDUNDANT_CALLS = 3`) | 100% Additif |
| **@rakazo/adapters** | `src/enterprise-tools.ts` | **FICHIER ENRICHI** | Connecteurs souverains et fonction de masquage `sanitizeToolError` | 100% Additif |
| **@rakazo/adapters** | `src/executor.ts` | **MODIFICATION MINEURE** | Réordonnancement du prompt système en 4 blocs (Bloc A invariant -> Bloc B persona/skills -> Bloc C historique -> Bloc D tour courant) | Non-destructif |
| **@rakazo/adapters** | `src/pi-runtime.ts` | **MODIFICATION MINEURE** | Extraction de `cached_tokens`, calcul de `cacheHitRatio` dans les événements de télémétrie de consommation de tokens | Non-destructif |
| **@rakazo/adapters** | `src/index.ts` | **MODIFICATION MINEURE** | Re-exports de `prompt-compiler.js` et `prefix-caching.js` | 100% Additif |
| **apps/web** | `src/pages/PromptCompilerModal.tsx` | **NOUVEAU FICHIER** | Composant modal de prévisualisation de diff, édition manuelle, double-lock de soumission, badge de télémétrie et rollback de brouillon | 100% Additif |
| **apps/web** | `src/pages/Shell.tsx` | **MODIFICATION MINEURE** | Injection du bouton « Rendre professionnelles » dans `CreateBotForm` et `BotSettings` | Point d'injection propre |
| **apps/web** | `src/styles.css` / Tailwind | **MODIFICATION MINEURE** | Classes ergonomiques responsives (`max-w-[98%]`, safe-area insets `env(safe-area-inset-bottom)`, cibles tactiles ≥ 44px) | Rétrocompatible |
| **apps/api** | `src/routes/prompts.ts` | **NOUVEAU FICHIER** | Procédure oRPC `prompts.compile` reliant le frontend au `PromptCompilerService` | 100% Additif |
| **packages/testkit** | `src/e2e-master-suite.ts` | **NOUVEAU FICHIER** | Suite de tests E2E opaque-box (150 tests couvrant Tiers 1-4) | 100% Additif |

---

## 3. Matrice des Invariants de Sécurité & Non-Régression

| Invariant | Description | Mécanisme de Garantie | Fichiers de Vérification |
|---|---|---|---|
| **Strict MCP Immutability** | Le Prompt Compiler ne modifie, n'active et n'injecte JAMAIS de connecteurs MCP automatiquement | Exclusion stricte des champs MCP dans `PromptCompileInputSchema` et découplage total de `mcpConfig` dans l'UI | `packages/contracts/src/prompt-compiler.ts`, `apps/web/src/pages/prompt-compiler-responsive.e2e.test.tsx` |
| **Zero-Secret Policy** | Aucune clé d'API, token Bearer ou credential ne peut fuiter dans les réponses ou les erreurs | Utilisation systématique de `sanitizeToolError` sur tous les flux d'erreur et retours de compilation | `packages/adapters/src/enterprise-tools.ts`, `packages/adapters/src/prompt-compiler.ts` |
| **Prefix Caching Stability** | Le Bloc A du prompt système est 100% byte-identique entre tous les bots pour maximiser le cache KV OpenRouter | Constante `STATIC_PLATFORM_GUARDRAILS_BLOC_A` sans timestamp ni ID dynamique en position Token 0 | `packages/adapters/src/prefix-caching.ts`, `packages/adapters/src/executor.ts` |
| **Draft Rollback Safety** | Zéro perte de données en cas d'annulation ou d'erreur réseau lors de la compilation de prompt | Conservation du brouillon utilisateur dans le buffer `draftRollbackBuffer` jusqu'à validation explicite | `apps/web/src/pages/PromptCompilerModal.tsx`, `apps/web/src/pages/Shell.tsx` |
| **0 TypeScript Error** | Aucune erreur de compilation sur l'ensemble des 19 packages du monorepo | Typage strict TypeScript 5.8 sans `any` sauvage | `turbo check`, `pnpm check` |
| **100% Test Pass Rate** | Toutes les suites de tests unitaires, d'intégration et E2E réussissent | Vitest runner sur les 19 packages | `turbo test`, `pnpm test` |

---

## 4. Analyse des Risques de Fusion et Stratégie d'Atténuation

| Zone de Code | Risque de Conflit Upstream | Probabilité | Stratégie d'Atténuation Prise |
|---|---|---|---|
| **Nouveaux fichiers (`prompt-compiler.ts`, etc.)** | **NUL** | 0% | Les nouveaux fichiers n'existent pas dans l'amont ; git effectue un ajout trivial sans conflit. |
| **`Shell.tsx` (UI principale)** | **FAIBLE** | 5% | L'ajout du bouton et de la modal est localisé à l'intérieur des formulaires `CreateBotForm` et `BotSettings`. En cas de mise à jour amont de `Shell.tsx`, git merge applique les blocs contextuellement sans heurts. |
| **`executor.ts` (Runtime agent)** | **FAIBLE** | 5% | La restructuration du tableau `instructions` réutilise les constantes existantes en tête de tableau. |
| **`schema.prisma`** | **NUL** | 0% | Aucune modification destructive. Les relations bénéficient du mode `onDelete: Cascade` natif. |
| **Workflow GitHub Actions** | **NUL** | 0% | `sync-upstream.yml` isole la gestion des branches et produit une PR sécurisée en cas de doute. |

---

## 5. Guide de Maintenance pour les Développeurs

Lorsqu'une synchronisation amont déclenche une Pull Request `upstream-sync-conflict` :
1. Cloner la branche de conflit : `git checkout upstream-sync-conflict`
2. Résoudre les éventuels conflits textuels en vérifiant que nos imports additifs (`PromptCompilerModal`, `prefix-caching`) restent intacts.
3. Exécuter la vérification globale :
   ```bash
   pnpm check
   pnpm test
   ```
4. Fusionner sur `main` une fois les 19 packages validés avec 0 erreur.
