# 🚀 RAKAZO — GUIDE DE TRANSMISSION MAÎTRE & ARCHITECTURE COMPLÈTE
> **Document de référence pour le nouveau canal Antigravity dédié à Rakazo (Groupe Floteuil)**  
> **Date de référence :** Août 2026  
> **Statut :** Production Opérationnelle • Sécurisée • Souveraine • Multi-Agents  
> **URL de production :** [https://agents.workspacegroupefloteuil.eu](https://agents.workspacegroupefloteuil.eu)

---

## 📑 TABLE DES MATIÈRES
1. [Vue d'Ensemble & Rôle Stratégique](#1-vue-densemble--rôle-stratégique)
2. [Topologie Infrastructure & Environnement Coolify (VPS)](#2-topologie-infrastructure--environnement-coolify-vps)
3. [Identifiants, Tokens d'API & Gestion des Secrets](#3-identifiants-tokens-dapi--gestion-des-secrets)
4. [Historique Complet des Développements & Correctifs Réalisés](#4-historique-complet-des-développements--correctifs-réalisés)
5. [Architecture du Code Source & Découpage Monorepo](#5-architecture-du-code-source--découpage-monorepo)
6. [Catalogue Complet des Outils & Connecteurs MCP Actifs (30+ Outils)](#6-catalogue-complet-des-outils--connecteurs-mcp-actifs-30-outils)
7. [Gestion Git & Synchronisation Amont Automatique (Upstream Sync)](#7-gestion-git--synchronisation-amont-automatique-upstream-sync)
8. [Guide du Vibe Coding & Roadmap d'Évolution pour Antigravity](#8-guide-du-vibe-coding--roadmap-dévolution-pour-antigravity)
9. [Commandes DevOps & Procédures d'Exploitation Quotidiennes](#9-commandes-devops--procédures-dexploitation-quotidiennes)

---

## 1. VUE D'ENSEMBLE & RÔLE STRATÉGIQUE

### 1.1 Qu'est-ce que Rakazo pour le Groupe Floteuil ?
**Rakazo** est la plateforme souveraine et privée d'agents d'intelligence artificielle autonomes du Groupe Floteuil. Contrairement à des interfaces de chat classiques, chaque agent Rakazo est un **travailleur autonome multi-modal** doté :
- D'un espace de travail persistant (fichiers, scripts, documents dans `/data/desktop-computers/`).
- D'un terminal shell pour exécuter des calculs, des scripts et des commandes.
- D'une mémoire longue durée persistante (`remember`).
- De capacités multi-agents natives : délégation en parallèle à des sous-agents (`run_subagent`) et création dynamique d'agents pairs (`spawn_bot`).
- D'un accès direct aux moteurs de recherche web (SearXNG), de scraping (Scraperr) et à l'ensemble des serveurs MCP d'entreprise (Notion, GitHub, Postiz, WordPress/Novamira, n8n, Cloudflare).

---

## 2. TOPOLOGIE INFRASTRUCTURE & ENVIRONNEMENT COOLIFY (VPS)

### 2.1 Caractéristiques du Serveur VPS
- **IP Publique :** `62.164.214.145`
- **Utilisateur SSH :** `root`
- **Reverse Proxy :** Traefik v3.6 (`coolify-proxy`) gérant le routage, les certificats SSL Let's Encrypt automatiques, le middleware HSTS et la compression gzip/brotli.

### 2.2 Application Rakazo sous Coolify
- **UUID de la ressource Coolify :** `s1253nc0yc4uu89lp6692r1s`
- **Domaine public FQDN :** `https://agents.workspacegroupefloteuil.eu`
- **Réseau Docker interne :** `s1253nc0yc4uu89lp6692r1s`
- **Architecture Conteneurisée (4 conteneurs) :**
  1. `web-s1253nc0yc4uu89lp6692r1s` : Frontend React + Vite (port interne 5173 / servi via proxy).
  2. `api-s1253nc0yc4uu89lp6692r1s` : Backend API Fastify / oRPC (port interne 3100).
  3. `worker-s1253nc0yc4uu89lp6692r1s` : Moteur de jobs d'exécution d'agents asynchrones (Graphile Worker).
  4. `postgres-s1253nc0yc4uu89lp6692r1s` : Base de données relationnelle PostgreSQL 16 (port 5432 interne).

### 2.3 Services Partagés Connectés sur le Même VPS
- **SearXNG (Moteur de recherche web privé) :**
  - Conteneur : `searxng-qkcs0oo0owk4s8cw8wgk8ogc` (Port 8080).
  - Réseau : `qkcs0oo0owk4s8cw8wgk8ogc`.
  - Accessible en interne via : `http://searxng-qkcs0oo0owk4s8cw8wgk8ogc:8080` ou URL Coolify.
- **Scraperr (Moteur de scraping web et extraction HTML) :**
  - Conteneur : `scraperr_api-j4o4o4wc4wskog8g0scwkwsg` (Port 8000).
  - Réseau : `j4o4o4wc4wskog8g0scwkwsg`.
  - Accessible en interne via : `http://scraperr_api-j4o4o4wc4wskog8g0scwkwsg:8000`.
- **Postiz (Planification Réseaux Sociaux & LinkedIn) :**
  - URL : `https://postiz.workspacegroupefloteuil.eu`.
- **n8n (Workflows & Automatisations) :**
  - URL : `https://autogfn8n.fr`.

---

## 3. IDENTIFIANTS, TOKENS D'API & GESTION DES SECRETS

> [!IMPORTANT]
> Tous les tokens sont injectés via les variables d'environnement chiffrées de Coolify et automatiquement biffés/masqués par `sanitizeToolError` pour éviter toute fuite dans les logs ou les réponses des agents.

| Service / Clé | Variable Coolify / Référence | Rôle & Permissions |
| :--- | :--- | :--- |
| **Compte Administrateur Rakazo** | `floteuiloff@gmail.com` / `autonomietravaildigital` | Compte propriétaire de l'espace de travail. |
| **Coolify API Token** | Variable `COOLIFY_API_TOKEN` | Déclenchement des builds et gestion des variables. |
| **OpenRouter API Key** | Variable `OPENROUTER_API_KEY` | Fournisseur LLM principal (`openai/gpt-oss-120b`). |
| **GitHub Access Token** | Variable `GITHUB_TOKEN` | Gestion des dépôts, code, issues et PRs. |
| **Notion Integration Token** | Variable `NOTION_API_KEY` | Lecture et écriture des bases et pages Notion. |
| **WordPress / Novamira** | Variables `WORDPRESS_USERNAME` / `WORDPRESS_APP_PASSWORD` | Gestion de contenu WordPress (`adns.groupefloteuil.fr`). |
| **Cloudflare Account / Token** | Variables `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Gestion DNS, purge de cache et stockage R2. |
| **Postiz URL** | Variable `POSTIZ_API_URL` (`https://postiz.workspacegroupefloteuil.eu`) | Connecteur social media. |
| **n8n Webhook / API URL** | Variable `N8N_API_URL` (`https://autogfn8n.fr`) | Déclenchement de flux n8n. |

---

## 4. HISTORIQUE COMPLET DES DÉVELOPPEMENTS & CORRECTIFS RÉALISÉS

### 4.1 Traduction Intégrale de l'Interface en Français (100 %)
L'intégralité des fichiers de vue et composants a été traduite en français professionnel :
- `apps/web/src/pages/Auth.tsx` : Connexion, création de compte, règles de mot de passe, messages d'erreurs.
- `apps/web/src/pages/Welcome.tsx` : Écran d'accueil et présentation.
- `apps/web/src/pages/Onboarding.tsx` : Assistant de premier démarrage, choix de spécialité et modèle.
- `apps/web/src/pages/Shell.tsx` : Barre latérale, zone de saisie, statut de réflexion ("Réflexion en cours…"), modals.
- `apps/web/src/pages/BotContextMenu.tsx` : Actions contextuelles (Épingler, dupliquer, archiver, supprimer).
- `apps/web/src/pages/ModelSettingsOverlay.tsx` : Gestion des fournisseurs, clés API et modèles IA actifs.
- `apps/web/src/pages/VoiceSettingsOverlay.tsx` : Synthèse vocale TTS (voix, pitch, volume, test audio).
- `apps/web/src/pages/PluginsOverlay.tsx` : Catalogue des intégrations et connecteurs.
- `apps/web/src/pages/HostComputerPrompt.tsx` : Sélection de l'environnement d'exécution.

### 4.2 Champ Dédié "Instructions Personnalisées / Prompt Système"
- **Formulaire de création (`CreateBotForm`) :** Ajout d'un champ `<textarea>` ergonomique pour saisir les consignes, le ton et le rôle de l'agent.
- **Paramètres de profil (`BotSettings`) :** Champ éditable et sauvegardable à tout moment.
- **Injection Runtime :** Enregistré en base Prisma (`Bot.instructions`) et injecté dynamiquement dans le `systemPrompt` du runtime `pi-runtime.ts`.

### 4.3 Résolution Définitive du Bug "Working..." et Incompatibilités OpenRouter
- **Fix Sandbox :** Remplacement de `SANDBOX_PROVIDER=docker` (qui cherchait un superviseur TCP 7091 inexistant) par `SANDBOX_PROVIDER=desktop` (`DesktopSandboxProvider`), assurant une exécution locale sans dépendance réseau.
- **Fix OpenRouter Reasoning :** Le modèle `openai/gpt-oss-120b` exige obligatoirement le paramètre reasoning et rejetait les requêtes (`400: Reasoning is mandatory`).
  - Configuration du runtime pour injecter `reasoning: { effort: "low" }`.
  - Ajout d'un assainisseur `onPayload` qui supprime automatiquement `reasoning: { effort: "none" }` avant l'envoi de la requête HTTP.

### 4.4 Intégration Native des 28 Outils MCP d'Entreprise, SearXNG et Scraperr
- Création du module `packages/adapters/src/enterprise-tools.ts`.
- Intégration dans `packages/adapters/src/builtin-tools.ts` pour que **100 % des agents (anciens et futurs)** disposent nativement de tous les outils par défaut.
- Masquage et biffage automatique des tokens dans les logs via `sanitizeToolError`.

---

## 5. ARCHITECTURE DU CODE SOURCE & DÉCOUPAGE MONOREPO

```text
rakazo/
├── apps/
│   ├── api/             # Backend Fastify + oRPC (endpoints RPC, auth, routes)
│   ├── desktop/         # Client applicatif Desktop Electron
│   ├── mobile/          # Application mobile native Expo / React Native
│   ├── web/             # Frontend React + Vite + Tailwind (Interface web)
│   ├── worker/          # Worker de tâches asynchrones Graphile
│   └── www/             # Site vitrine
├── packages/
│   ├── adapter-kit/     # Interfaces de base pour les adaptateurs d'outils
│   ├── adapters/        # Runtime d'agents Pi, outils builtin & enterprise MCP
│   │   ├── src/
│   │   │   ├── builtin-tools.ts     # Déclaration de TOUS les outils actifs par défaut
│   │   │   ├── enterprise-tools.ts  # Implémentation des outils GitHub, Notion, Postiz, etc.
│   │   │   └── pi-runtime.ts        # Moteur d'exécution des agents LLM (@earendil-works/pi-ai)
│   ├── contracts/       # Schémas Zod et définitions d'API partagées
│   ├── core/            # Utilitaires métier et logique partagée
│   ├── db/              # Prisma ORM, migrations PostgreSQL et repositories
│   └── testkit/         # Émulateurs et suites de tests
├── .github/workflows/
│   └── sync-upstream.yml # Robot de synchronisation amont sécurisé
└── docker-compose.yaml  # Configuration de déploiement Coolify multi-conteneurs
```

---

## 6. CATALOGUE COMPLET DES OUTILS & CONNECTEURS MCP ACTIFS (30+ OUTILS)

Tous les outils ci-dessous sont chargés par défaut dans chaque agent :

### A. Recherche & Scraping Web
1. `web_search` : Recherche en ligne via SearXNG avec synthèse et citations de sources Markdown.
2. `web_scrape` : Extraction propre de texte et Markdown depuis n'importe quelle URL publique via Scraperr / parseur HTML sécurisé.

### B. GitHub MCP
3. `github_search_repos` : Recherche de dépôts GitHub publics et privés.
4. `github_get_file_contents` : Lecture du contenu d'un fichier source sur un dépôt.
5. `github_list_issues` : Liste des issues et Pull Requests.
6. `github_create_issue` : Création d'une nouvelle issue sur un dépôt.
7. `github_get_pull_request` : Consultation du détail d'une Pull Request.
8. `github_create_issue_comment` : Ajout d'un commentaire sur une issue ou PR.

### C. Notion MCP
9. `notion_search` : Recherche globale de pages et bases de données.
10. `notion_get_page` : Extraction du contenu d'une page Notion.
11. `notion_query_database` : Interrogation et filtrage d'une base de données Notion.
12. `notion_create_page` : Création d'une nouvelle page ou d'un enregistrement.
13. `notion_update_page` : Mise à jour des propriétés d'une page existante.

### D. Postiz (Social Media) MCP
14. `postiz_list_integrations` : Liste des réseaux sociaux et canaux connectés (LinkedIn, etc.).
15. `postiz_create_post` : Création et programmation de publications.
16. `postiz_list_posts` : Consultation de l'historique et des posts planifiés.

### E. WordPress / Novamira MCP
17. `wordpress_list_posts` : Liste des articles de blog.
18. `wordpress_get_post` : Lecture du contenu complet d'un article.
19. `wordpress_create_post` : Rédaction et publication d'un nouvel article (brouillon/publié).
20. `wordpress_update_post` : Modification d'un article existant.
21. `novamira_execute_ability` : Exécution d'actions CMS spécialisées Novamira.

### F. n8n (Workflows & Automatisations) MCP
22. `n8n_trigger_webhook` : Déclenchement d'un webhook d'automatisation n8n avec payload JSON.
23. `n8n_list_workflows` : Consultation des workflows existants.
24. `n8n_activate_workflow` : Activation / désactivation de workflows.

### G. Cloudflare MCP
25. `cloudflare_list_zones` : Liste des zones DNS du compte.
26. `cloudflare_list_dns_records` : Liste des enregistrements DNS.
27. `cloudflare_create_dns_record` : Ajout d'un enregistrement DNS.
28. `cloudflare_purge_cache` : Purge instantanée du cache CDN pour un domaine.

### H. Système de Fichiers, Terminal & Multi-Agents
29. `list_files`, `read_file`, `write_file`, `attach_file` : Gestion du système de fichiers persistant de l'agent.
30. `shell` : Exécution de commandes dans le terminal de l'agent.
31. `remember` : Sauvegarde de faits et préférences dans la mémoire durable `MEMORY.md`.
32. `run_subagent` : Instanciation de sous-agents éphémères en parallèle (jusqu'à 4 simultanés).
33. `spawn_bot` : Création autonome d'un nouvel agent complet avec son propre espace et prompt.

---

## 7. GESTION GIT & SYNCHRONISATION AMONT AUTOMATIQUE (UPSTREAM SYNC)

### 7.1 Architecture des Dépôts
- **Dépôt Personnel (Fork) :** `https://github.com/floteuil/rakazo.git` (Branche active : `main`).
- **Dépôt Amont (Auteur original) :** `https://github.com/elie222/rakazo.git`.

### 7.2 Le Workflow de Synchronisation Sécurisé (`sync-upstream.yml`)
Pour permettre de bénéficier des futures mises à jour de l'auteur original **sans jamais écraser vos traductions françaises, vos connecteurs MCP ou vos réglages Coolify**, le workflow `.github/workflows/sync-upstream.yml` est en place :
1. **Déclenchement automatique :** Tous les jours à 04:00 UTC (ou manuellement via GitHub Actions -> *Run workflow*).
2. **Fusion préservatrice :** Tente un `git merge upstream/main` dans `main`. Vos commits de fonctionnalités ont la priorité.
3. **Garde-fou anti-écrasement :** En cas de conflit sur un fichier personnalisé, le robot **annule la fusion destructrice** et génère une Pull Request dédiée (`upstream-sync-conflict`) pour validation humaine sans risque.
4. **Déploiement Coolify :** Dès que la branche `main` est mise à jour, Coolify déclenche automatiquement le rebuild.

---

## 8. GUIDE DU VIBE CODING & ROADMAP D'ÉVOLUTION POUR ANTIGRAVITY

Le nouveau canal Antigravity dispose de bases ultra-solides pour faire évoluer l'application avec de nouvelles fonctionnalités créatives (*Vibe Coding*) :

### 8.1 Comment ajouter un nouvel outil / connecteur ?
1. Déclarer la fonction et le schéma d'entrée dans `packages/adapters/src/enterprise-tools.ts`.
2. Ajouter la définition de l'outil dans le tableau `builtinAgentTools` de `packages/adapters/src/builtin-tools.ts`.
3. Câbler la logique d'exécution dans `prepareArguments` et `toAgentTool` de `packages/adapters/src/pi-runtime.ts`.
4. Tester la non-régression via `pnpm test`.
5. Commiter et pousser sur `main` -> Coolify redéploie automatiquement.

### 8.2 Idées d'Extensions et de Skills à développer
- **Intégration d'un Canvas Visuel Interactif :** Permettre aux agents de générer des diagrammes Mermaid interactifs ou des aperçus HTML/React en temps réel dans le chat.
- **Connecteur RAG / Base Vectorielle :** Raccorder les agents à une base vectorielle PostgreSQL (pgvector) pour interroger les bases de connaissances documentaires du Groupe Floteuil.
- **Tableau de Bord Multi-Agents Avancé :** Vue d'ensemble montrant en direct l'activité de tous les agents (qui travaille sur quoi, charge CPU, tokens consommés).
- **Workflows Programmés Avancés :** Déclenchement automatique de missions selon un calendrier (ex. : veille concurrentielle tous les lundis à 8h avec rapport PDF généré).

---

## 9. COMMANDES DEVOPS & PROCÉDURES D'EXPLOITATION QUOTIDIENNES

### 9.1 Déclencher un Redéploiement Coolify via API
```bash
curl -s -X POST -H "Authorization: Bearer 2|zi4OlniDWiPrZbZzqEb3UjOYjCMwUvcDoFm4mkBte89800f2" \
  "https://coolify.workspacegroupefloteuil.eu/api/v1/deploy?uuid=s1253nc0yc4uu89lp6692r1s&force=true"
```

### 9.2 Tester la Santé du Backend en Ligne
```bash
curl -s -X POST https://agents.workspacegroupefloteuil.eu/rpc/health \
  -H "Content-Type: application/json" \
  -H "Origin: rakazo://" \
  -d '{"json":{}}'
# Réponse attendue : {"json":{"ok":true,"version":"0.1.0"}}
```

### 9.3 Valider la Suite de Tests en Local
```bash
cd /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
pnpm check # Vérification des types TypeScript
pnpm test  # 845+ tests unitaires et d'intégration
pnpm build # Compilation de production des 4 packages
```

---

> **Message de passation pour le prochain agent Antigravity :**  
> *"L'application Rakazo est saine, stable, intégralement en français et dotée de plus de 30 outils de haut niveau. Travaille en toute confiance sur `floteuil/rakazo` (branche `main`), respecte l'isolation des conteneurs Coolify et continue de faire grandir l'écosystème IA du Groupe Floteuil !"*
