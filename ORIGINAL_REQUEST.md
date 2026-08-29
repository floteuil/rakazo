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

## 2026-08-29T13:00:30Z

# Itération Majeure Rakazo — Free Intelligence Gateway (OmniRoute)

> Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app  
> Integrity mode: development  

Intégration additive, isolée et réversible d'une passerelle d'inférence strictement gratuite et sécurisée basée sur OmniRoute, offrant aux utilisateurs le choix par agent entre l'intelligence **Premium (GPT-OSS-120B via OpenRouter)** et **Gratuite (Modèles gratuits adaptés par tags d'usage via OmniRoute)**, avec garantie absolue zéro coût (*fail-closed*, *never-paid fallback*) et sanctuarisation totale de l'architecture Rakazo.

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: development

## Requirements

### R1. Contrats, Schéma & Modèle de Données Additifs (`@rakazo/contracts` & `@rakazo/db`)
- Étendre contractuellement la configuration des agents (`BotInferenceConfig`) avec le mode d'inférence (`"premium" | "free"`, défaut `"premium"` pour rétrocompatibilité totale) et les tags d'usage stricts (`"coding" | "writing" | "reasoning" | "fast" | "analysis"`).
- Valider par schémas Zod stricts sans régression pour les agents existants (absence de nouveaux champs = comportement historique Premium).
- Étendre le modèle de télémétrie `PromptExecutionLog` pour historiser de manière non-bloquante le mode d'inférence, la catégorie demandée, le fournisseur résolu, le modèle résolu et le statut gratuit.

### R2. Passerelle d'Inférence Gratuite OmniRoute & Double Barrière Zéro-Coût (`@rakazo/adapters`)
- Créer l'adaptateur souverain et isolé `FreeOmniRouteAdapter` communiquant avec le service OmniRoute (API compatible OpenAI, streaming SSE, tool calling, timeout 30s, propagation AbortSignal).
- Implémenter la double barrière de sécurité locale Rakazo (*Rakazo Free Policy Engine*) : refus absolu de toute route à coût positif, de providers classifiés `avoid`/`unknown`/ToS non compatibles, ou de fallback vers des modèles payants.
- Politique de défaillance *Fail-Closed* stricte : si aucun modèle gratuit et compatible n'est disponible, retourner une erreur propre et explicite (*« Capacité gratuite temporairement indisponible »*) sans jamais basculer vers OpenRouter Premium.

### R3. Préservation des Invariants Runtime, Garde-fous, Sous-Agents & Cache 4 Blocs
- Sanctuariser le chemin historique Premium (`gpt-oss-120b` via OpenRouter) sans aucune régression.
- Assurer l'héritage du mode d'inférence par les sous-agents (un parent Free engendre un sous-agent Free avec budget strict de 8 192 tokens, profondeur 1, exclusion des outils de délégation et tracker anti-boucle).
- Garantir l'immutabilité contractuelle des connecteurs MCP, des skills et du Prompt Compiler.
- Préserver la structure et la byte-stabilité du préfixe en 4 blocs (Bloc A invariant, Bloc B durable, Bloc C compacté, Bloc D tour courant).

### R4. Intégration WebUI Responsive & Ergonomie Multi-Écrans (`apps/web`)
- Intégrer élégamment le sélecteur d'intelligence (Premium / Gratuit) et la sélection multi-tags d'usage dans `CreateBotForm.tsx` et `BotSettings.tsx` en respectant strictement le design system sombre et les tokens actuels.
- Valider le comportement tactile et l'absence de débordement sur 9 résolutions (320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px+), safe areas `env(safe-area-inset-bottom)` et cibles tactiles $\ge 44$px.
- Préserver l'expérience existante du chat composer, de `PromptCompilerModal` et de l'inspecteur MCP.

### R5. Déploiement Conteneurisé, Sécurité VPS Coolify & Traefik
- Rédiger la spécification de déploiement conteneurisé du service OmniRoute dédié sur réseau privé interne Docker, avec versionning pinné, isolation stricte, zéro socket Docker partagé et séparation hermétique des secrets.
- Invariant VPS Coolify strict : interdiction absolue de toucher, modifier, redémarrer ou altérer les autres applications ou volumes hébergés sur le serveur.

### R6. Suites de Tests Adversariaux, Baseline QA & Documentation Maîtresse
- Maintenir 0 erreur TypeScript sur les 19 packages (`pnpm exec turbo check --force`).
- Atteindre et dépasser le seuil de 1 764 tests passants avec ajout de suites dédiées : non-régression Premium, tests adversariaux anti-fuite de coûts payants, fallback free-to-free, isolation des sous-agents et mock OmniRoute.
- Produire et actualiser les livrables d'autorité de clôture :
  - `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`
  - `RAKAZO_ARCHITECT_HANDOFF_FREE_INTELLIGENCE_GATEWAY.md`
  - `docs/ENVIRONMENT_SETUP.md` et `AGENTS.md`.

## Acceptance Criteria

### Zéro-Coût & Fail-Closed
- [ ] Un bot configuré en mode Gratuit n'invoque JAMAIS l'adaptateur Premium OpenRouter ni de route payante.
- [ ] En cas d'indisponibilité de modèle gratuit, l'erreur retournée est propre sans aucun fallback silencieux vers le mode payant.
- [ ] Les sous-agents créés par un bot Gratuit héritent obligatoirement du mode Gratuit.

### Non-Régression Premium & Intégrité
- [ ] Les bots historiques (sans configuration d'inférence explicite) continuent de router vers `gpt-oss-120b` via OpenRouter sans altération.
- [ ] Les autorisations MCP et les skills restent 100 % sous le contrôle exclusif de l'utilisateur.
- [ ] Le Prompt Compiler, le compactage d'outils et le préfixe de cache 4 blocs restent intacts.

### Ergonomie WebUI
- [ ] Le choix Premium / Gratuit et les tags d'usage sont parfaitement intégrés et utilisables au pouce sur smartphone (320px à 430px) sans overflow.
- [ ] Les formulaires de création et de paramétrage de bot gèrent l'état sans collision ni régression.

### Qualité, Tests & Documentation
- [ ] `turbo check` valide 19/19 packages avec 0 erreur TypeScript.
- [ ] 100 % des tests passent avec succès (`≥ 1 764` tests passants sans faux vert).
- [ ] Les artefacts maîtres `RAKAZO_MASTER_BLUEPRINT_CURRENT.md` et `RAKAZO_ARCHITECT_HANDOFF_FREE_INTELLIGENCE_GATEWAY.md` sont publiés et complets.
