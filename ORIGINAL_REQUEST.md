# Original User Request

## 2026-08-26T15:58:30Z

# Itération Majeure Rakazo — Subagent Prompt Compilation, Sécurisation Upstream Sync, Télémétrie Caching & Standardisation AGENTS.md

> Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app  
> Integrity mode: development  

Itération majeure de consolidation, sécurisation et optimisation de Rakazo : intégration de la compilation déterministe Level 1 dans `executeSubagent`, sécurisation du pipeline de synchronisation amont `.github/workflows/sync-upstream.yml` avec gate de tests obligatoire, persistance et observabilité SQL des métriques de prefix caching, création du standard `AGENTS.md` et validation 100 % non-régression.

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: development

## Requirements

### R1. Intégration du Prompt Compiler dans l'Exécution des Sous-Agents (`executeSubagent`)
- Brancher `compilePromptLevel1Deterministic` dans `executeSubagent` (`packages/adapters/src/pi-runtime.ts`) pour formater et restructurer automatiquement les consignes du sous-agent (`extra` / `instructions`) sans latence réseau ni coût LLM.
- Garantir le respect des invariants existants : profondeur maximale 1, interdiction des outils de délégation (`DELEGATION_TOOL_NAMES`), et plafonnement à 8 192 tokens.

### R2. Sécurisation Critique du Workflow de Synchronisation Amont (`sync-upstream.yml`)
- Modifier `.github/workflows/sync-upstream.yml` pour ajouter impérativement une étape de validation stricte (`pnpm exec turbo check --force && pnpm test`) après le `git merge upstream/main` et AVANT tout `git push origin main`.
- En cas d'échec de la compilation TypeScript ou des tests automatisés, le merge automatique doit être immédiatement annulé (`git merge --abort`) et transformé en Pull Request d'alerte sur la branche `upstream-sync-conflict`.

### R3. Observabilité & Persistance SQL de la Télémétrie du Prefix Caching
- Ajouter dans le schéma Prisma (`packages/db/prisma/schema.prisma`) un modèle additif pour historiser les exécutions de prompts et la télémétrie de cache (`PromptExecutionLog` : `botId`, `threadId`, `sessionId`, `cachedTokens`, `promptTokens`, `completionTokens`, `cacheHitRatio`, `durationMs`, `levelUsed`).
- Enregistrer de manière asynchrone et non-bloquante ces métriques lors des appels de `PromptCompilerService` et du runtime Pi.

### R4. Standardisation & Reprise Autonome (`AGENTS.md` & `docs/ENVIRONMENT_SETUP.md`)
- Rédiger à la racine du monorepo le fichier `AGENTS.md` formalisant les règles d'architecture additive, les invariants MCP, la politique zéro-secret, les commandes de vérification de référence et la cartographie des modules.
- Documenter l'ensemble des variables d'environnement dans `docs/ENVIRONMENT_SETUP.md`.

### R5. Qualité, Zéro Régression & Déploiement
- Maintenir 0 erreur TypeScript sur l'ensemble des 19 packages (`pnpm exec turbo check --force`).
- Valider 100 % des suites de tests unitaires, E2E et adversariaux (`pnpm test`).
- Mettre à jour `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` et déployer automatiquement sur Coolify.

## Acceptance Criteria

### Sous-agents & Prompt Compiler
- [ ] Tout sous-agent instancié via `run_subagent` reçoit un prompt système structuré via `compilePromptLevel1Deterministic`.
- [ ] Les tests E2E confirment le bon fonctionnement et l'isolation des sous-agents.

### CI & Synchronisation Upstream
- [ ] Le workflow `sync-upstream.yml` valide `turbo check` et `pnpm test` avant de pousser sur `main`.
- [ ] Aucun commit cassant ne peut être poussé automatiquement en production.

### Télémétrie & Base de Données
- [ ] Les métriques de cache (`cached_tokens`, `cacheHitRatio`) sont persistées proprement sans dégrader la latence.

### Qualité & Documentation
- [ ] `pnpm check` passe avec 0 erreur TypeScript sur 19 packages.
- [ ] 100 % des tests passent avec succès.
- [ ] `AGENTS.md` et `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` sont à jour.
