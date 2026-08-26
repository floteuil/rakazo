# RAKAZO MASTER BLUEPRINT — CURRENT ARCHITECTURE & PLATFORM SPECIFICATION

**Version**: 2.2.0-enterprise  
**Dépôt**: `rakazo_app` (Monorepo Turborepo 2 + pnpm)  
**Date d'actualisation**: 2026-08-26  
**Statut Global**: En Production / Certifié Conforme (0 Erreur TS, 100% Tests Validés)  

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

### A. Modularité Additive & Compatibilité Amont (Milestone 4)
- **Coexistence Upstream** : Synchronisation quotidienne automatique via `.github/workflows/sync-upstream.yml` avec le dépôt original `elie222/rakazo`.
- **Zéro Régression** : Toutes les fonctionnalités personnalisées (Prompt Compiler, Prefix Caching, MCP d'entreprise, UI Responsive) sont développées sous forme de modules additifs dans de nouveaux fichiers dédiés.

### B. Connecteurs MCP Souverains & Moindre Privilège (Milestone 1)
- **Connecteurs d'Entreprise** : Support complet des MCPs souverains (`github`, `notion`, `adns`, `hubtowork`, `lepetitkp`, `veinart`, `handysunmonde`).
- **Isolation Stricte au Niveau Outil** : Sélection granulaire des outils autorisés par bot via `bot.metadata.mcp.tools[connectorId] = [allowedToolNames]`.
- **Politique Zéro-Secret** : Masquage automatique et systématique de tous les jetons d'authentification (`ghp_*`, `sk-or-v1-*`, `Bearer *`) via `sanitizeToolError`.
- **Suppression en Cascade Intègre** : Nettoyage atomique des tables dépendantes lors de la suppression d'un bot, sans blocage ni orphelinat en base de données.

### C. Optimisation du Contexte & 4-Block Prefix Caching (Milestone 2)
Pour maximiser l'efficacité de cache KV (KV Prefix Caching > 80% de hit ratio) sur OpenRouter et `gpt-oss-120b`, le prompt système et le contexte sont assemblés selon une structure stricte en 4 blocs :
1. **Bloc A (Token 0 — Invariant)** : Règles plateforme statiques, politiques anti-spéculation, disjoncteurs d'emballement, masquage de secrets. 100% byte-identique entre tous les bots et toutes les sessions.
2. **Bloc B (Durable — Spécifique Agent)** : Persona, instructions de rôle durables, compétences (skills) actives injectées ou indexées, configuration du poste de travail.
3. **Bloc C (Dynamique — Historique Compacté)** : Historique conversationnel compacté sémantiquement (`compactToolResult`) pour les sorties d'outils massives.
4. **Bloc D (Éphémère — Tour Courant)** : Requête utilisateur courante, liste des pièces jointes et variables contextuelles du tour.
- **Télémétrie & Session Affinity** : Extraction de `cachedTokens`, calcul de `cacheHitRatio`, et génération de clés d'affinité de session (`sess_<hash>`) pour le routage sticky OpenRouter.

### D. Interface WebUI Responsive & Compilateur de Prompts (Milestone 3)
- **Ergonomie Multi-Périphériques** : Adaptation fluide Desktop / Tablette / Mobile (<768px `max-w-[98%]`, `h-[96vh]`, safe-area insets `env(safe-area-inset-bottom)`, cibles tactiles minimales de 44px).
- **Modal `PromptCompilerModal`** :
  - Déclenchable depuis la création d'agent (`CreateBotForm`) et la configuration avancée (`BotSettings`).
  - **Double Niveau de Compilation** :
    - *Niveau 1* : Structuration déterministe ultra-rapide (Rôle, Tâches, Contraintes, Format).
    - *Niveau 2* : Compilation IA avancée via `gpt-oss-120b` sur OpenRouter.
  - **Prévisualisation Diff en Temps Réel** : Visualisation côte-à-côte du brouillon original (lecture seule) et du prompt compilé (modifiable).
  - **Invariant Strict d'Immutabilité MCP** : Le compilateur de prompts ne modifie, n'active ni n'injecte JAMAIS de connecteurs MCP.
  - **Sécurité Anti-Perte de Données** : Conservation du buffer `draftRollbackBuffer` pour annuler à tout moment sans perte.

---

## 3. Matrice de Qualité & Conformité

| Métrique / Domaine | Résultat Obtenu | Seuil Requis | Statut |
|---|---|---|---|
| **Erreurs TypeScript (19 packages)** | **0 erreur** | 0 erreur | CONFORME |
| **Suites de Tests Monorepo** | **144 fichiers validés (1620 tests passés)** | 100% passants | CONFORME |
| **Tests E2E Prefix Caching & Prompt Compiler** | **78 tests passés (36 backend + 42 frontend)** | 100% passants | CONFORME |
| **Tests E2E Master Suite (Tiers 1-4)** | **150 tests passés** | 100% passants | CONFORME |
| **Sanitisation des Secrets** | 100% des erreurs et prompts masqués | Zéro fuite | CONFORME |
| **Immutabilité MCP** | Aucun champ MCP altéré lors de la compilation | Immutabilité stricte | CONFORME |

---

## 4. Déploiement & Exploitation en Production

- **Hébergement & PaaS** : Déploiement conteneurisé sous Coolify PaaS avec reverse-proxy Traefik et certificats SSL Let's Encrypt automatiques.
- **Base de Données** : PostgreSQL avec Prisma ORM 7+ et contraintes relationnelles sécurisées.
- **Observabilité** : Télémétrie d'utilisation des tokens, taux de hit de cache OpenRouter, logs structurés sans credentials.
