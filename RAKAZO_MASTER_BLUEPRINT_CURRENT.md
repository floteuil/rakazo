# RAKAZO MASTER BLUEPRINT — CURRENT ARCHITECTURE & PLATFORM SPECIFICATION

**Version**: 2.3.0-enterprise  
**Dépôt**: [https://github.com/floteuil/rakazo](https://github.com/floteuil/rakazo) (Monorepo Turborepo 2 + pnpm)  
**Branche**: `main`  
**Dernier Commit**: Consolidé post-itération majeure  
**Date d'actualisation**: 26 Août 2026  
**Statut Global**: En Production / Certifié Conforme (0 Erreur TS sur 19 packages, 1 709 tests passés à 100 %)  

---

## 1. Vue d'Ensemble & Architecture du Monorepo

Rakazo est une plateforme souveraine et conteneurisée d'agents d'intelligence artificielle autonomes capables d'exécuter des workflows complexes, d'interagir avec des outils externes via le standard Model Context Protocol (MCP), de manipuler des environnements de bureau/sandbox sécurisés et de synthétiser ou compiler des instructions en langage naturel de niveau professionnel.

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   RAKAZO MONOREPO                                       │
├───────────────────────────────────────────┬─────────────────────────────────────────────┤
│ APPLICATIONS                              │ PACKAGES PARTAGÉS                           │
│ • apps/web      (React 18, Tailwind v4)   │ • @rakazo/contracts (Types, Zod, oRPC)      │
│ • apps/api      (Hono/Fastify, Node.js)   │ • @rakazo/adapters  (Runtime Pi, Outils)    │
│ • apps/mobile   (React Native Expo 57)    │ • @rakazo/adapter-kit (Interfaces runtime)  │
│ • apps/desktop  (Electron Desktop Shell)  │ • @rakazo/db        (Prisma 7, PostgreSQL)  │
│ • apps/worker   (BullMQ / Background Jobs)│ • @rakazo/core      (Auth, Cron, Événements)│
│ • apps/www      (Astro SSR Landing Page)  │ • @rakazo/chat-ui   (Rendu Markdown riche)  │
│ • infra/sandboxes/supervisor (Isolation)  │ • @rakazo/ui-tokens & ui-web (Design system)│
│                                           │ • @rakazo/testkit   (Suites E2E / Canaries) │
└───────────────────────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. Piliers d'Architecture & Fonctionnalités Clés

### A. Modularité Additive & Pipeline Amont Sécurisé (Upstream Security Gate)
- **Coexistence Upstream** : Synchronisation automatique avec `https://github.com/elie222/rakazo.git` via `.github/workflows/sync-upstream.yml`.
- **Barrière de Contrôle CI Obligatoire** : Le workflow exécute `pnpm exec turbo check --force && pnpm test` immédiatement après la fusion amont locale et **AVANT tout push sur `main`**.
  - Si les tests ou le typage échouent, le merge automatique est immédiatement annulé (`git merge --abort`) et transformé en Pull Request d'alerte (`upstream-sync-conflict`) avec notification sécurisée. Aucun commit régressif ne peut atteindre la production.
- **Cartographie des Customisations** : Documentée dans `UPSTREAM COMPATIBILITY & CUSTOMIZATION MAP.md` et `AGENTS.md`.

### B. Connecteurs MCP Souverains & Moindre Privilège
- **Connecteurs d'Entreprise** : Support complet des MCPs souverains (`github`, `notion`, `adns`, `hubtowork`, `lepetitkp`, `veinart`, `handysunmonde`).
- **Isolation Stricte au Niveau Outil** : Sélection granulaire des outils autorisés par bot via `bot.metadata.mcp.tools[connectorId] = [allowedToolNames]`.
- **Politique Zéro-Secret** : Masquage systématique de 15 motifs d'authentification (`ghp_*`, `sk-or-v1-*`, `Bearer *`, URLs DB) via `sanitizeToolError`.
- **Suppression en Cascade Intègre** : Nettoyage atomique des tables dépendantes lors de la suppression d'un bot.

### C. Optimisation du Contexte, Prefix Caching & Persistance SQL
Le contexte transmis à OpenRouter (`gpt-oss-120b`) respecte une organisation stricte en 4 blocs pour maximiser le KV cache hit (>80 %) :
1. **Bloc A (Token 0 — Invariant)** : Règles plateforme statiques, disjoncteurs anti-emballement (`MAX_TOOL_ITERATIONS_PER_TURN = 25`, `MAX_CONSECUTIVE_REDUNDANT_CALLS = 3`), directives zéro-chatter. 100% byte-identique entre tous les bots.
2. **Bloc B (Durable — Configuration Agent)** : Identité du bot, instructions durables, compétences actives (injection directe si <4 Ko, indexées au-delà de 32 Ko cumulés).
3. **Bloc C (Dynamique — Historique Compacté)** : Historique conversationnel compacté sémantiquement (`compactToolResult`) pour les sorties d'outils volumineuses.
4. **Bloc D (Éphémère — Tour Courant)** : Requête utilisateur courante et pièces jointes.
- **Télémétrie & Persistance SQL** : Nouveau modèle Prisma `PromptExecutionLog` historisant de façon asynchrone (`recordPromptExecutionLogAsync`) les métriques (`cachedTokens`, `promptTokens`, `completionTokens`, `cacheHitRatio`, `durationMs`, `provider`, `model`).
- **Session Affinity** : Génération déterministe de clés d'affinité FNV-1a (`sess_<hash>`) pour le routage sticky OpenRouter.

### D. Moteur « Prompt Compiler » & Sous-Agents Structurés
- **Interface Graphique « Rendre professionnelles »** : Intégrée dans `CreateBotForm` et `BotSettings` via `PromptCompilerModal.tsx`.
- **Architecture de Compilation en 2 Niveaux** :
  - *Niveau 1 (Déterministe)* : Structuration instantanée à coût zéro pour consignes courtes et micro-tâches.
  - *Niveau 2 (LLM)* : Compilation IA avancée via `gpt-oss-120b` sur OpenRouter pour intentions complexes, avec repli automatique sur le Niveau 1 en cas de panne réseau.
- **Intégration dans les Sous-Agents (`executeSubagent`)** : La fonction `buildSubagentPrompt` (`packages/adapters/src/pi-runtime.ts`) applique automatiquement la compilation Niveau 1 sur les consignes déléguées (`extra` / `task`), garantissant des sous-agents ultra-cadrés sans surcoût LLM.
- **Invariant Strict d'Immutabilité MCP** : Le Prompt Compiler ne modifie, n'active ni ne désactive JAMAIS de connecteurs MCP.
- **Protection Anti-Perte** : `draftRollbackBuffer` permet d'annuler à tout moment sans perte du brouillon d'origine.

### E. Standardisation & Reprise Autonome (`AGENTS.md`)
- Création du guide `AGENTS.md` à la racine du dépôt pour standardiser les règles d'ingénierie, les invariants de code, les commandes de validation et la politique de non-régression pour tous les agents de code et développeurs.

---

## 3. Matrice de Qualité & Validation Finale

| Métrique / Domaine | Résultat Obtenu | Seuil Requis | Statut |
|---|---|---|---|
| **Erreurs TypeScript (19 packages)** | **0 erreur** (`pnpm exec turbo check --force`) | 0 erreur | ✅ CONFORME |
| **Suites de Tests Monorepo** | **151 fichiers validés (1 709 tests passés)** | 100 % passants | ✅ CONFORME |
| **Tests E2E Sous-agents & Compilation** | **12 tests passés** | 100 % passants | ✅ CONFORME |
| **Tests CI Gate & Synchronisation** | **12 tests passés** | 100 % passants | ✅ CONFORME |
| **Tests Persistance SQL Télémétrie** | **5 tests passés** | 100 % passants | ✅ CONFORME |
| **Sanitisation des Secrets** | 100 % des erreurs masquées (15 regex) | Zéro fuite | ✅ CONFORME |
| **Immutabilité MCP** | 0 modification automatique des outils | Immutabilité stricte | ✅ CONFORME |

---

## 4. Déploiement & Exploitation

- **Hébergement** : VPS Coolify PaaS (`https://agents.workspacegroupefloteuil.eu`), Traefik reverse-proxy, SSL Let's Encrypt automatique.
- **Base de Données** : PostgreSQL 16 + Prisma ORM 7 (`prompt_execution_logs` indexée par `botId`, `createdAt`, `model`).
- **Observabilité** : Historique SQL des tokens, latence, logs structurés JSON sans secrets.
