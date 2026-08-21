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

## Follow-up — 2026-08-21T16:34:04Z

# Implémentation Complète du Système de Skills pour Rakazo (Groupe Floteuil)

> Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app  
> Integrity mode: development  

Développement et intégration d'un système complet et souverain de gestion de Skills (Bibliothèque globale, interface WebUI moderne en français pour l'upload/gestion/suppression, association dynamique par agent, injection runtime hybride avec contrôle strict de la consommation de tokens, synchronisation modulaire amont et suite de tests automatisés exhaustive).

Working directory: /Users/floteuilteletravail/.gemini/antigravity/scratch/rakazo_app
Integrity mode: development

## Requirements

### R1. Modèle de Données & Persistance Prisma
- Ajouter les modèles `Skill` et `BotSkill` dans le schéma Prisma (`packages/db/prisma/schema.prisma`) pour gérer la bibliothèque globale et la relation plusieurs-à-plusieurs (Many-to-Many) avec les agents (`Bot`).
- Champs du modèle `Skill` : `id`, `name`, `slug`, `description`, `content` (Markdown), `tags` (liste/JSON), `metadata` (JSON), `createdAt`, `updatedAt`.
- Garantir la suppression propre (cascade ou détachement sécurisé) sans laisser d'enregistrements orphelins et sans saturer l'espace disque du VPS.
- Générer des migrations SQL PostgreSQL standard, additives et non-destructives pour assurer la compatibilité lors des redéploiements Coolify.

### R2. Backend & Contrats API oRPC (Fastify)
- Définir les contrats Zod dans `packages/contracts/src/` pour les opérations CRUD sur les Skills (`listSkills`, `getSkill`, `createSkill`, `updateSkill`, `deleteSkill`, `uploadSkillMarkdown`, `assignSkillsToBot`, `getBotSkills`).
- Implémenter les handlers d'API dans `apps/api/src/` avec validation stricte, assainissement contre les injections de code/scripts et gestion d'erreurs robuste.
- Supporter le format hybride intelligent : parsing du YAML Frontmatter (métadonnées `name`, `description`, `tags`) ou extraction automatique depuis les titres H1 / paragraphes pour les fichiers Markdown bruts.

### R3. Interface WebUI Moderne & Ergonomique (React + Tailwind)
- Créer une vue / overlay dédiée "Bibliothèque de Skills" accessible depuis la barre latérale ou les paramètres :
  - Upload de fichiers `.md` par glisser-déposer (Drag & Drop) et bouton de téléversement.
  - Catalogue visuel sous forme de cartes avec filtres de recherche instantanée par nom ou tags.
  - Visualiseur / Éditeur Markdown intégré avec coloration syntaxique et prévisualisation.
  - Boutons d'édition et de suppression sécurisée avec confirmation.
- Intégrer la sélection des Skills dans les écrans de création et de configuration des agents (`CreateBotForm`, `BotSettings`) sous forme de sélecteur multi-badges / cases à cocher avec prévisualisation des compétences activées.
- Traduction intégrale en français professionnel et respect du design système existant de Rakazo.

### R4. Injection Runtime Optimisée & Contrôle de Consommation de Tokens
- Dans le moteur d'exécution d'agent (`packages/adapters/src/pi-runtime.ts`), intégrer dynamiquement les compétences actives de l'agent.
- Architecture hybride pour la gestion du contexte :
  - Injection directe et structurée dans le prompt système pour les skills légers (< 4 Ko).
  - Mode indexé / condensé pour les skills plus volumineux afin de protéger la fenêtre de contexte et éviter la surconsommation de tokens OpenRouter (`openai/gpt-oss-120b`).
- Mettre à disposition de l'agent un outil builtin `read_skill` pour consulter à la demande le contenu détaillé d'un skill indexé si nécessaire.

### R5. Cybersécurité, Garde-fous IA & Robustesse
- Assainissement strict des fichiers uploadés (limitation de taille max 2 Mo par skill, interdiction d'exécution de scripts exécutables non autorisés).
- Préservation du mécanisme de masquage des secrets (`sanitizeToolError`) pour éviter toute fuite d'informations sensibles.
- Protection contre les boucles infinies et limitation de la charge CPU/RAM pour garantir la pérennité des ressources du VPS.

### R6. Coexistence Modulaire & Intégration Amont (Upstream)
- Isoler les nouveaux modules et composants pour minimiser les modifications au cœur du code hérité.
- Intégrer sans conflit les derniers commits amont (groupes de bots épinglés et correctifs de requêtes E2E).
- Assurer que le workflow GitHub Actions (`sync-upstream.yml`) continue de fonctionner sans conflit.

### R7. Batterie de Tests Exhaustive & Documentation
- Écrire des tests unitaires et d'intégration complets couvrant :
  - Le parsing et la validation des fichiers Markdown/YAML de skills.
  - Les routes API oRPC et les opérations en base Prisma.
  - L'injection et le formatage des skills dans le runtime Pi.
  - La sélection et l'affichage dans les composants React.
- Mettre à jour la documentation (`PROJECT.md`, `README.md`, guide de transmission) avec les explications techniques complètes.

## Acceptance Criteria

### Base de données & API
- [ ] Le schéma Prisma est enrichi des modèles `Skill` et `BotSkill` et passe la validation (`prisma validate`).
- [ ] Les endpoints oRPC permettent d'ajouter, lister, modifier, supprimer des skills et de les attacher/détacher d'un agent.
- [ ] L'importation d'un fichier `.md` (avec ou sans frontmatter YAML) crée immédiatement le skill avec les bonnes métadonnées.

### Interface WebUI
- [ ] L'utilisateur peut uploader un ou plusieurs fichiers Markdown de skills en quelques clics.
- [ ] La bibliothèque de skills affiche clairement tous les skills disponibles avec recherche et prévisualisation.
- [ ] Dans le profil d'un agent, l'utilisateur peut associer ou retirer des skills d'un simple clic.
- [ ] L'intégralité des nouveaux écrans et messages est en français.

### Runtime & Intelligence Artificielle
- [ ] Un agent équipé de skills spécifiques respecte fidèlement les consignes et connaissances de ces skills lors de ses réponses et exécutions d'outils.
- [ ] Les compétences de plus de 30 outils MCP historiques restent 100 % opérationnelles en parallèle des skills.
- [ ] Les gardes-fous de tokens empêchent l'épuisement de la fenêtre de contexte.

### Intégrité & Qualité Technique
- [ ] `pnpm check` (vérification TypeScript stricte) s'exécute avec 0 erreur.
- [ ] `pnpm test` s'exécute avec 100 % de réussite (tests existants + nouveaux tests de la suite Skills).
- [ ] `pnpm build` compile l'ensemble des packages sans avertissement critique.
- [ ] Le dépôt Git est documenté et prêt pour le redéploiement Coolify.

