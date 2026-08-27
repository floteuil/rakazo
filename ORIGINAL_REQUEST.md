# Original User Request

## 2026-08-27T09:00:06Z

# Itération d'Excellence, Hardening, Performance, QA & Documentation de Rakazo

> Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app  
> Integrity mode: development  

Itération majeure d'excellence, de durcissement, d'optimisation des performances, de renforcement de la sécurité, de fiabilisation de l'UX/responsive multi-écrans, d'enrichissement des tests et de perfectionnement documentaire sans ajout de nouvelle fonctionnalité produit (zéro feature creep).

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: development

## Requirements

### R1. Durcissement du Runtime IA, Prompt Compiler & Sous-Agents
- Optimiser et fiabiliser la robustesse de `PromptCompilerService` (gestion des timeouts, fallbacks déterministes, validation Zod stricte, masquage des erreurs sans secrets).
- Renforcer les garde-fous des sous-agents dans `buildSubagentPrompt` et `executeSubagent` (anti-boucle, budget de 8 192 tokens, profondeur 1 stricte, exclusion des outils de délégation).
- Nettoyer et stabiliser l'assemblage en 4 blocs (`assemble4BlockCachePrompt`) pour éliminer toute donnée volatile du préfixe stable (Bloc A + Bloc B).

### R2. Durcissement du Workflow Upstream (`sync-upstream.yml`)
- Sécuriser l'idempotence, la gestion des erreurs lockfile (`pnpm install --frozen-lockfile`) et fiabiliser la création de Pull Request d'alerte en cas d'échec de la gate CI (`turbo check --force && pnpm test`).
- Garantir qu'aucune mise à jour amont instable ne puisse atteindre la branche `main` et la production.

### R3. Robustesse & Sécurité de la Télémétrie SQL & des Connecteurs MCP
- Fiabiliser l'enregistrement asynchrone non-bloquant des logs de télémétrie (`PromptExecutionLog`) et vérifier la résilience face aux pannes ou lenteurs de base de données.
- Auditer et étendre la sanitisation des secrets (`sanitizeToolError`) pour couvrir sans faux positifs tous les motifs de tokens sensibles.
- Maintenir l'invariant strict de moindre privilège et d'immutabilité des connecteurs MCP configurés manuellement.

### R4. Perfectionnement Ergonomique Responsive WebUI (Mobile / Tablette / Desktop)
- Vérifier et peaufiner les dimensions et l'accessibilité sur smartphones (320px, 360px, 375px, 390px, 430px), tablettes (768px, 1024px) et desktop (1280px, 1440px+).
- Optimiser le chat composer (croissance fluide, safe areas `env(safe-area-inset-bottom)`, targets tactiles ≥ 44px, boutons d'envoi et d'annulation non rognés).
- Fiabiliser l'expérience utilisateur du comparatif Avant/Après dans `PromptCompilerModal.tsx` sur petits et grands écrans.

### R5. Couverture de Tests, Zero-Regression & Documentation Maîtresse
- Maintenir 0 erreur TypeScript sur les 19 packages du monorepo (`pnpm exec turbo check --force`).
- Atteindre et dépasser le seuil de 1 709 tests passants sans aucun faux vert (`pnpm test`).
- Produire les artefacts d'autorité finaux : `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` actualisé, `RAKAZO_ARCHITECT_HANDOFF_POST_EXCELLENCE_ITERATION.md` et `ITERATION_EXCELLENCE_REPORT.md`.

## Acceptance Criteria

### Runtime & AI Safety
- [ ] Le Prompt Compiler et les sous-agents appliquent strictement leurs garde-fous sans régression ni fuite de secrets.
- [ ] L'ordonnancement en 4 blocs garantit la byte-stabilité du préfixe invariant.

### CI & Upstream Sync
- [ ] Le workflow `.github/workflows/sync-upstream.yml` est 100 % résilient face aux conflits et aux erreurs de validation.

### UI & Responsive
- [ ] La WebUI est parfaitement accessible et sans aucun débordement sur 320px, 375px, 768px, 1024px et 1440px.
- [ ] Le composer et les modales gèrent de manière fluide le clavier mobile et les safe areas.

### Qualité & Documentation
- [ ] `turbo check` passe avec 0 erreur sur l'ensemble des 19 packages.
- [ ] 100 % des suites de tests réussissent (`≥ 1 709` tests passés).
- [ ] Les 3 artefacts documentaires maîtres de clôture sont rédigés de façon exhaustive.
