# Original User Request

## Initial Request — 2026-08-21T14:19:18Z

Intégrer de façon native et pérenne l'accès aux serveurs MCP d'entreprise (Notion, GitHub, Postiz, WordPress/Novamira, n8n, Cloudflare) ainsi qu'aux services de recherche web (SearXNG) et de scraping (Scraperr) à l'ensemble des agents de l'instance Rakazo sur Coolify, sans régression ni conflit avec les applications existantes du VPS.

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: demo

## Requirements

### R1. Outils de Recherche Web (SearXNG) et Scraping (Scraperr) Nouveaux & Actifs par Défaut
- Intégrer l'outil `web_search` dans le runtime Rakazo (`packages/adapters/src/builtin-tools.ts` et `pi-runtime.ts`), raccordé directement au conteneur SearXNG du VPS (`http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080` ou réseau interne) avec formatage propre des résultats et sources.
- Intégrer l'outil `web_scrape` dans le runtime Rakazo, permettant d'extraire le texte propre et structuré de n'importe quelle page web via Scraperr / parseur HTML sécurisé.
- Rendre ces deux outils immédiatement disponibles par défaut pour tous les agents (anciens et nouveaux) sans action manuelle requise de l'utilisateur.

### R2. Intégration Native des Outils MCP d'Entreprise
- Intégrer les connecteurs d'outils pour l'écosystème Groupe Floteuil :
  - **GitHub** : lecture de repos, gestion d'issues, consultation de code.
  - **Notion** : lecture et modification de bases de données et pages.
  - **Postiz** : planification et consultation des posts sociaux.
  - **WordPress / Novamira** : gestion d'articles et contenus.
  - **n8n** : déclenchement de workflows.
- Stocker les identifiants et tokens de façon chiffrée et sécurisée dans les variables d'environnement du projet Coolify sans aucune exposition publique.

### R3. Pérennité, Résistance aux Redéploiements et Non-Régression
- Versionner tous les ajouts de code sur la branche `main` du dépôt GitHub `floteuil/rakazo` afin que chaque futur redéploiement Coolify conserve l'intégralité des fonctionnalités, des traductions françaises et des connecteurs.
- Préserver l'isolation stricte et le fonctionnement des autres conteneurs et applications hébergés sur le VPS (Traefik, Postiz, Odoo, n8n, etc.).

## Acceptance Criteria

### Vérification Recherche Web (SearXNG)
- [ ] L'envoi d'une requête nécessitant une information récente du web déclenche l'outil `web_search` et retourne une réponse pertinente et à jour.

### Vérification Scraping Web (Scraperr)
- [ ] L'envoi d'une URL à analyser déclenche l'outil `web_scrape` et extrait fidèlement le contenu textuel principal sans blocage.

### Vérification Connecteurs MCP
- [ ] Un test direct sur GitHub permet à un agent de lister ou inspecter un dépôt.
- [ ] Un test direct sur Notion permet à un agent d'interagir avec l'espace de travail.
- [ ] Les agents reconnaissent explicitement leurs nouveaux outils lors des requêtes en langage naturel.

### Stabilité & Déploiement
- [ ] Le build `pnpm build` et le déploiement sur `https://agents.workspacegroupefloteuil.eu` s'exécutent avec succès.
- [ ] L'instance reste sécurisée (headers HSTS, rate-limiting, sandboxing persistant).
