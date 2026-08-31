# Original User Request

## Initial Request — 2026-08-31T16:29:36Z

# RAKAZO — OmniRoute Coherence, Observability & Production Excellence

> Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app  
> Integrity mode: development  

Itération d'excellence post-intégration établissant la cohérence absolue entre l'intention utilisateur stable (`Gratuit · Coding`), la route logique (`combo/rakazo-coding`) et la résolution d'exécution dynamique réelle d'OmniRoute (`provider`, `model`, `response-cost`, `latency`, `cache`), avec découplage dynamique total, mesure rigoureuse du cache 2 niveaux, boucle MCP/sous-agents intacte, non-régression Premium et triple cohérence certifiée.

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: development

## Requirements

### R1. Découplage Dynamique Strict : Intention Stable vs Résolution Éphémère
- Établir une séparation architecturale nette entre les 3 niveaux d'abstraction :
  1. **Niveau 1 (Intention Produit / Utilisateur)** : Mode `free` + profil métier (`coding`, `reasoning`, `fast`, `writing`, `analysis`) persisté de manière durable dans la configuration du bot.
  2. **Niveau 2 (Route Logique Rakazo)** : Route canonique stable (`combo/rakazo-coding`, `combo/rakazo-fast`, etc.) transmise à OmniRoute comme contrat de capacité.
  3. **Niveau 3 (Résolution d'Exécution Réelle)** : Provider (`mistral`, `groq`, etc.) et modèle (`codestral-latest`, `qwen/...`) résolus dynamiquement par OmniRoute par tour d'exécution.
- Bannir tout couplage statique (pas d'enum de modèles/providers, pas de table fixe de mapping dans Rakazo) : le remplacement, l'ajout ou la suppression de modèles gratuits dans OmniRoute ne doit nécessiter aucun commit, aucune migration DB et aucun redéploiement de Rakazo.

### R2. Contrat de Métadonnées d'Inférence & Propagation des En-têtes OmniRoute
- Capturer et propager les en-têtes de réponse réels émis par OmniRoute : `x-omniroute-provider`, `x-omniroute-model`, `x-omniroute-latency-ms`, `x-omniroute-session-id`, `x-omniroute-version`, et le header canonique de coût `x-omniroute-response-cost` (avec fallback de compatibilité si nécessaire).
- Propager ces métadonnées de bout en bout : `OmniRouteInferenceTransport` $\rightarrow$ `CanonicalAgentRuntime` $\rightarrow$ `PromptExecutionLog` (télémétrie SQL non-bloquante) $\rightarrow$ Événements de streaming UI, sans jamais écraser l'intention demandée par le modèle résolu.

### R3. Cohérence UX & Transparence par Tour d'Exécution
- WebUI Bot Settings : Présenter clairement l'intention stable (*« Gratuit via OmniRoute · Profil : Coding »*) sans promettre de modèle figé dans le temps.
- WebUI Chat : Afficher discrètement pour chaque réponse les métadonnées réelles du tour (*« Modèle utilisé : Codestral · Mistral AI »*). En cas de basculement dynamique (*fallback* vers Groq / Qwen), mettre à jour les métadonnées de ce tour sans alerte d'erreur anxiogène.
- Conserver la simplicité utilisateur : zéro jargon envahissant, pas de sélecteur de provider manuel, interface responsive (320px à 1440px+).

### R4. Formule du Cache à Deux Niveaux & Affinité de Session Indépendante
- Niveau 1 (Rakazo) : Maintien du découpage 4 blocs (Blocs A+B invariants représentant ~1 500 à 3 500 tokens à Token 0).
- Niveau 2 (OmniRoute) : Transmission de l'en-tête `x-session-id` (dérivé par FNV-1a) sans injecter de nom de provider pour ne pas altérer l'identité de session en cas de basculement.
- Télémétrie Cache : Calcul mathématiquement strict du ratio de cache (`cachedTokens / promptTokens`, borné entre 0 et 1, sans double comptage, distinction nette entre 0% et `unknown`).

### R5. Boucle Agentique MCP, Confinement des Sous-Agents & Zéro-Coût Immuable
- Sanctuariser la boucle d'outils canonique partagée (`CanonicalAgentRuntime`, 25 itérations max, disjoncteur 3 répétitions, compactage sémantique `compactToolResult`).
- Maintenir l'héritage strict des sous-agents (parent Gratuit $\implies$ sous-agent Gratuit, plafond 8 192 tokens, profondeur 1, indépendance de provider avec le parent).
- Maintenir la double barrière zéro-coût : rejet de tout coût $> \$0.00$ et *fail-closed* immédiat (*« Capacité gratuite temporairement indisponible »*) sans jamais basculer sur OpenRouter Premium.

### R6. Non-Ingérence VPS, Test de Triple Cohérence & Documentation d'Autorité
- Sanctuariser les 15 autres applications du serveur VPS et la voie historique Premium (`gpt-oss-120b` via OpenRouter).
- Valider le test de **Triple Cohérence** : `En-têtes OmniRoute == PromptExecutionLog == Métadonnées affichées WebUI`.
- Produire l'artefact maître de passation : `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md`.
- Mettre à jour `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `AGENTS.md`, `docs/ENVIRONMENT_SETUP.md`, `docs/OMNIROUTE_DEPLOYMENT.md`.

## Acceptance Criteria

### Dynamisme & Observabilité
- [ ] L'intention utilisateur (`coding`, `reasoning`, etc.) et le modèle résolu (`codestral-latest`, etc.) sont distingués à tous les étages.
- [ ] La télémétrie SQL `PromptExecutionLog` enregistre fidèlement le provider et le modèle réels retournés par OmniRoute.
- [ ] La disparition ou l'ajout d'un modèle dans OmniRoute ne nécessite aucune modification de code dans Rakazo.

### Triple Cohérence & UX
- [ ] L'interface WebUI affiche l'intention dans les paramètres et le modèle réel résolu dans les détails du message.
- [ ] La triple cohérence (En-têtes $\leftrightarrow$ Base de Données $\leftrightarrow$ WebUI) est validée sur tous les profils.
- [ ] Les basculements dynamiques de modèles (failover) mettent à jour les métadonnées du tour sans alerte d'erreur.

### Qualité, Cache & Sécurité
- [ ] 0 erreur TypeScript sur les 19 packages et 100 % des tests unitaires/E2E passent avec succès.
- [ ] Le calcul du ratio de cache KV est strict, sans double comptage ni valeur erronée.
- [ ] L'artefact maître `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COHERENCE_AND_OBSERVABILITY.md` est généré et publié.
