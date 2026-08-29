# Original User Request

## 2026-08-29T15:42:48Z

# Installation Production d'OmniRoute sur Coolify & Raccordement Sécurisé à Rakazo

> Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app  
> Integrity mode: development  

Déploiement et raccordement en production du véritable service OmniRoute sur son application Coolify dédiée (`https://omniroute.workspacegroupefloteuil.eu`), avec stockage persistant, authentification Dashboard/API, zéro impact sur le reste du VPS, isolation hermétique des clés d'API et maintien strict des garanties d'invariance et de zéro-coût de Rakazo.

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: development

## Requirements

### R1. Audit de Sécurité VPS / Coolify & Inspection du Dépôt OmniRoute
- Effectuer un audit initial non-intrusif en lecture seule du serveur VPS, des ressources disponibles (RAM, CPU, disque) et de l'état de l'application Coolify dédiée.
- Auditer le fork [`https://github.com/floteuil/OmniRoute`](https://github.com/floteuil/OmniRoute) (branche, commit pinné, Dockerfile, stockage `/app/data`, variables requises, ports et endpoints).
- Règle de non-ingérence absolue : interdiction formelle de modifier, arrêter, redémarrer ou altérer les autres conteneurs, bases ou volumes du VPS.

### R2. Déploiement Conteneurisé d'OmniRoute sur Coolify (`omniroute.workspacegroupefloteuil.eu`)
- Déployer l'application OmniRoute officielle via la ressource Coolify dédiée, avec build method validé et version/commit pinné.
- Configurer le stockage persistant isolé (`/app/data`), le port interne officiel (ex: 20128) et l'exposition HTTPS sécurisée via le domaine public `https://omniroute.workspacegroupefloteuil.eu`.
- Sécuriser l'accès au Dashboard par authentification forte et chiffrer le stockage local (`STORAGE_ENCRYPTION_KEY`).

### R3. Sécurité d'Endpoint & Raccordement Sécurisé à Rakazo
- Générer une clé d'API Endpoint dédiée pour Rakazo (`Authorization: Bearer <EndpointKey>`) sans jamais exposer la clé OpenRouter Premium de Rakazo à OmniRoute.
- Configurer les variables d'environnement de Rakazo sur Coolify : `OMNIROUTE_BASE_URL=https://omniroute.workspacegroupefloteuil.eu/v1` et `OMNIROUTE_API_KEY`.
- Invariant strict de zéro-clé provider : aucune clé fournisseur gratuite ou payante n'est configurée lors de cette mission d'infrastructure (les providers gratuits feront l'objet d'une itération d'onboarding séparée).

### R4. Validation Non-Régression Premium & Comportement Fail-Closed
- Valider que le chemin d'inférence historique Premium (`gpt-oss-120b` via OpenRouter) fonctionne sans aucune altération et ne dépend pas d'OmniRoute.
- Valider qu'un agent configuré en mode Gratuit échoue proprement (*« Capacité gratuite temporairement indisponible »*) sans jamais déclencher de bascule payante.
- Tester l'étanchéité, l'authentification et la persistance des données après redémarrage d'OmniRoute.

### R5. Non-Interférence VPS & Documentation Maîtresse sans Secret
- Vérifier passivement la santé et l'intégrité de toutes les autres applications hébergées sur le VPS.
- Mettre à jour la documentation du dépôt GitHub `floteuil/rakazo` (sans aucun secret ni identifiant d'administration privé Coolify) :
  - `RAKAZO_ARCHITECT_HANDOFF_OMNIROUTE_COOLIFY_DEPLOYMENT.md`
  - `docs/OMNIROUTE_DEPLOYMENT.md` (nouveau runbook)
  - `RAKAZO_MASTER_BLUEPRINT_CURRENT.md`, `AGENTS.md` et `docs/ENVIRONMENT_SETUP.md`.

## Acceptance Criteria

### Déploiement & Sécurité OmniRoute
- [ ] Le Dashboard OmniRoute est accessible en HTTPS sur `https://omniroute.workspacegroupefloteuil.eu` et protégé par authentification.
- [ ] L'API `/v1` est fonctionnelle, authentifiée par la clé endpoint Rakazo, et les données persistent après redémarrage du conteneur.
- [ ] Zéro provider payant ou gratuit n'est configuré (statut `PENDING PROVIDER CREDENTIALS`).

### Raccordement Rakazo & Zéro-Coût
- [ ] Rakazo est raccordé à OmniRoute via `OMNIROUTE_BASE_URL` et `OMNIROUTE_API_KEY` sans aucune erreur de connectivité.
- [ ] Les agents Premium fonctionnent parfaitement sans régression.
- [ ] Les agents Gratuits échouent proprement avec une erreur claire et sans aucun appel payant.

### Intégrité VPS & Documentation
- [ ] Aucune autre application, réseau ou volume du VPS n'a été altéré ou redémarré.
- [ ] Aucun secret ni identifiant privé n'est présent dans le code, les logs ou la documentation GitHub.
- [ ] Les artefacts maîtres de déploiement et de handoff sont générés et à jour.
