# Protocole Officiel de Tests & Certification Anti-Emballement IA (Rakazo Souverain)

Ce document constitue le référentiel technique et opérationnel du dépôt **Rakazo Souverain** (`floteuil/rakazo`). Il documente :
1. **L'architecture Anti-Emballement (Anti-Runaway) à 7 couches** qui protège intégralement contre toute dérive ou surconsommation de tokens.
2. **Les invariants du Sanctuaire Souverain** (Passerelle dynamique OmniRoute, OpenRouter `openai/gpt-oss-120b`, 18 Connecteurs MCP / 87 outils, Postiz MCP JSON-RPC 2.0 natif, règle stricte Zéro Stripe).
3. **Les améliorations amont v0.8.0+ portées chirurgicalement** sans impact sur l'architecture hybride.
4. **La batterie de tests automatisée (`pnpm verify:sanctuary`)** à exécuter systématiquement après chaque itération, mise à jour ou correction.

---

## 1. Exécution Automatique de la Batterie Complète de Tests

À chaque modification du code, ajout de fonctionnalité ou portage amont, lancez la commande unique suivante à la racine du dépôt :

```bash
pnpm verify:sanctuary
```

Ou directement via le script shell :

```bash
./scripts/verify-sovereign-sanctuary.sh
```

### Ce que vérifie automatiquement `pnpm verify:sanctuary` :
1. **Vérification statique TypeScript (`pnpm turbo check`) :** Compile et vérifie les types sur l'intégralité des 19 packages du monorepo (tolérance zéro erreur).
2. **Suite Maîtresse Sanctuaire & Anti-Emballement (`master-sanctuary-and-anti-runaway.test.ts`) :** Teste les 7 couches anti-emballement, la passerelle OmniRoute, le Prompt Compiler GPT-OSS 120B, le connecteur Postiz MCP JSON-RPC 2.0, l'absence totale de Stripe et les nouveautés v0.8.0+.
3. **Suite `@rakazo/contracts` & `@rakazo/core` :** Validation des schémas Zod, du parser YAML de Skills (avec préservation des blocs multilignes `|+`), de la détection des tâches bloquées (`stuck-work.ts`) et de la sécurité des commandes.
4. **Suite `@rakazo/chat-ui` :** Validation du rendu Markdown, de la sanitization anti-XSS et du moteur de rendu de diagrammes **Mermaid SVG** (`securityLevel: "strict"`).
5. **Suite `@rakazo/web` :** Tests E2E et composants WebUI (sélecteur des 18 connecteurs MCP et 87 outils, triple cohérence OmniRoute, modale Prompt Compiler, persistance des pièces jointes, raccourcis clavier).
6. **Suite `@rakazo/api` :** Vérification des routes oRPC, de l'isolation multi-workspace, des Skills et du bouton Stop instantané.

---

## 2. Architecture du Système Anti-Emballement IA (7 Couches de Protection)

Pour garantir qu'aucun agent, sous-agent ou boucle d'outil ne puisse s'emballer ni consommer excessivement des tokens, Rakazo applique **7 verrous cumulatifs** au niveau du runtime :

| Couche | Fichier Source | Mécanisme de Protection | Limite / Seuil Strict |
| :--- | :--- | :--- | :--- |
| **1. Disjoncteur d'itérations par tour** | `packages/adapters/src/loop-guards.ts` (`MAX_TOOL_ITERATIONS_PER_TURN`) | Coupe automatiquement la boucle d'outils d'un tour dès que le plafond d'appels est atteint et force la synthèse finale. | **25 appels d'outils max / tour** |
| **2. Détecteur d'appels redondants (Anti-Boucle)** | `packages/adapters/src/loop-guards.ts` (`evaluateToolCallGuard`) | Calcule une signature JSON canonique (`computeToolCallSignature`, insensible à l'ordre des clés) pour chaque appel d'outil. Si un outil est appelé de manière répétitive avec les mêmes arguments, l'exécution est stoppée immédiatement. | **3 appels identiques consécutifs max** |
| **3. Compacteur Sémantique de Sorties d'Outils** | `packages/adapters/src/tool-compacting.ts` (`compactToolResult`) | Compresse et tronque intelligemment les réponses volumineuses avant leur injection dans le contexte du LLM afin d'éviter l'explosion de la fenêtre de prompt. | Shell : **4 000 car.**<br>Générique : **12 000 car.**<br>Fichiers : **40 entrées** |
| **4. Plafond Strict des Sous-Agents (`run_subagent`)** | `packages/adapters/src/subagent-inheritance.ts` | Interdit toute récursion infinie (`depth = 1` max), retire les outils de délégation (`run_subagent`, `spawn_bot`, `archive_bot`) aux sous-agents et plafonne leur budget de sortie. | Profondeur max : **1**<br>Budget : **4 096 tokens**<br>Parallélisme : **4 max** |
| **5. Plafond de Tokens de Sortie & Raisonnement Maîtrisé** | `packages/adapters/src/pi-ai-transport.ts` & `prompt-compiler.ts` | Plafonne `maxTokens` à `16 384` tokens sur le flux principal et force `reasoning: "low"` (`thinkingLevel: "low"`) avec nettoyage des traces internes (`sanitizeOpenRouterReasoningResponse`) pour que l'historique ne soit jamais pollué par les chaînes de pensée. | **16 384 tokens max**<br>`reasoning: "low"` |
| **6. Prefix Caching 4-Blocs & Affinité FNV-1a** | `packages/adapters/src/prefix-caching.ts` | Structure les prompts du plus statique (Bloc A : Guardrails, Bloc B : Identité & Skills) au plus dynamique (Bloc C : Historique compacté, Bloc D : Tour courant) avec routage sticky `x-session-id` (`sess_<fnv1a>`) et respect de `cacheCapabilities.retentionMs`. | Réduction jusqu'à **80 %** des tokens facturés en lecture cache |
| **7. Moteur Gratuit Fail-Closed & Détecteur Stuck-Work** | `packages/adapters/src/free-policy-engine.ts` & `packages/core/src/stuck-work.ts` | En mode Gratuit (OmniRoute), bloque tout modèle payant (`vetoPaidFallback`) et coupe le flux si un coût `> 0` apparaît dans les headers ou chunks SSE (`assertZeroCostAndAllowed`). De plus, expire automatiquement toute tâche en attente abandonnée après 24h (`STUCK_WORK_EXPIRE_AFTER_MS`) et permet un arrêt utilisateur (`Stop`) en **< 1 seconde**. | Coût autorisé en mode Free : **0.00 €**<br>Arrêt Stop : **< 1s** |

---

## 3. Les Invariants du Sanctuaire Souverain

Ces composants constituent le cœur de l'application et sont vérifiés à chaque exécution de `pnpm verify:sanctuary` :

1. **Passerelle Dynamique OmniRoute (`combo/rakazo-*`) :**
   - Routage par intention (`combo/rakazo-coding`, `combo/rakazo-reasoning`, `combo/rakazo-fast`, `combo/rakazo-writing`, `combo/rakazo-analysis`).
   - Supporte les changements d'ordre des modèles dans OmniRoute de manière 100 % transparente.
2. **OpenRouter `openai/gpt-oss-120b` & Prompt Compiler (« Rendre les instructions professionnelles ») :**
   - Compilation à deux niveaux (Niveau 1 déterministe instantané + Niveau 2 LLM via `openai/gpt-oss-120b` à température `0.2`).
3. **Catalogue de 18 Connecteurs Souverains MCP & 87 Outils (Zéro Stripe) :**
   - Exactement **18 connecteurs** et **87 outils** exposés dans `packages/contracts/src/mcp-catalog.ts` et `packages/adapters/src/enterprise-tools.ts`.
   - **Connecteur Postiz MCP natif :** Utilise le protocole JSON-RPC 2.0 Streamable HTTP (`/api/mcp/:apiKey` avec cache de session `mcp-session-id`) pour `postiz_list_integrations` et `postiz_create_post`, et l'API publique `/api/public/v1/posts` pour `postiz_list_posts`.
   - **Exclusion stricte de Stripe :** Aucun connecteur ni outil Stripe n'est présent dans Rakazo.

---

## 4. Fonctionnalités Upstream v0.8.0+ Intégrées Chirurgicalement

| Fonctionnalité | Référence Upstream | Fichiers Clés |
| :--- | :--- | :--- |
| **Diagrammes Mermaid SVG dans le chat** | `050ce8a59` (#1423) | `packages/chat-ui/src/mermaid.ts`, `markdown.web.tsx`, `markdown.web.css` |
| **Préservation des métadonnées multilignes (`|+`) des Skills** | `4d5b1a5b9` (#1534) | `packages/contracts/src/skill-parser.ts` (`formatYamlBlockScalar`, `buildSkillMarkdown`) |
| **Politique de rétention du cache de prompt** | `aa3866888` (#1536) | `packages/adapters/src/prefix-caching.ts` (`resolvePromptCacheStrategy`) |
| **Timeouts de modèles étendus & Idle Watchdog configurable** | `515ac02fa` (#3228) | `packages/adapters/src/pi-runtime.ts` (`modelStreamTimeoutMs`, `modelStreamIdleWatchdog`) |
| **Cloisonnement Description Publique vs Instructions Privées** | `81640fa3e` (#1504) | `packages/adapters/src/executor.ts` (`runIdentityInstruction`), `builtin-tools.ts`, `child-bots.ts` |
| **Avertissement sur les modèles texte-uniquement (sans vision)** | `7d9cef3c6` | `packages/adapters/src/pi-models.ts`, `apps/web/src/pages/ModelSettingsOverlay.tsx` |
| **Bouton Stop ultra-réactif (< 1 seconde)** | `v0.8.0` | `packages/adapters/src/executor.ts` (`cancelPoll`), `apps/api/src/router.ts` (`threads.stop`) |
| **Persistance des fichiers joints & Recherche dans la discussion** | `ed6715893` / `v0.8.0` | `apps/web/src/pages/Shell.tsx`, `apps/web/src/lib/pending-attachments.ts` |

---

## 5. Contrat Opérationnel d'Agent (P2) & Économie de Tokens Avancée (P3 & P4 — Écosystème `awesome-grok-bot`)

| Module | Inspiration | Fichiers Clés | Description & Impact |
| :--- | :--- | :--- | :--- |
| **P2 — Contrat Opérationnel d'Agent (FR)** | `DevvGwardo/agent-roster-playbook` & `PramodDutta/botskills` | `packages/adapters/src/prompt-compiler.ts` | Injecte systématiquement en français dans les prompts compilés (Niveaux 1 & 2) : **1.** la *Matrice d'Autonomie Contractuelle* (`ACT ALONE < 1 min` vs `PARK FOR ME` approbation humaine), **2.** l'*Obligation de Preuve (`Show the tape`)*, et **3.** le *Bouclier Anti-Injection de Prompt*. |
| **P3 — Remasterisation du Fil (« Handoff 5 lignes »)** | `Chakhdz/grok-bot-token-saver` (`REVIVE.md`) | `apps/web/src/lib/thread-remaster.ts`, `apps/web/src/pages/Shell.tsx` | Bouton & Modale responsive (téléphone, tablette, ordinateur) permettant de compacter un fil long en un **Handoff structuré de 5 lignes en français** (0 appel LLM), de nettoyer le fil et de repartir à **0 token d'historique traîné** (jusqu'à **-70 %** de tokens). |
| **P4 — Garde-Fou « Routine Silencieuse (`NO_SIGNAL`) »** | `DevvGwardo/agent-roster-playbook` (`06-watcher-lanes.md`) | `packages/adapters/src/executor.ts`, `apps/web/src/pages/Shell.tsx` | Lorsqu'une routine planifiée ne détecte aucune nouveauté dès le 1er tour, l'agent répond immédiatement `NO_SIGNAL — Aucun élément nouveau à signaler aujourd'hui.`, coupe sa boucle d'outils et supprime les notifications superflues. |

---

## 6. Bibliothèque Souveraine de 379 Compétences (100 % FR, 51 Packs $\le 10$ Skills), Routines `Europe/Paris` 24h & Fonctionnalités Avancées (Idées 1 à 5)

| Module | Fichiers Clés | Description & Garanties de Sobriété |
| :--- | :--- | :--- |
| **Bibliothèque de 379 Compétences Souveraines 100 % Français (51 Packs Métier)** | `packages/contracts/src/sovereign-skills-catalog.ts`, `packages/adapters/src/sovereign-skills-content.json`, `apps/web/src/pages/BotSkillSelector.tsx`, `apps/web/src/pages/SkillLibraryOverlay.tsx` | **0 compétence activée par défaut.** Les **379 compétences** sont intégralement localisées en français (noms, descriptions, tags et en-têtes opérationnels Markdown) et réparties en **51 Packs Métier** plafonnés à **maximum 10 skills par pack** (`MAX_SKILLS_PER_PACK = 10`) pour protéger le contexte de Gemini 3.1. Activation à la demande par agent (création et modification). |
| **Planification des Routines au Standard Français (`Europe/Paris` • `24h`)** | `packages/core/src/cron.ts`, `apps/web/src/pages/RoutineSchedule.tsx`, `apps/api/src/router.ts`, `apps/worker/src/index.ts` | Fuseau par défaut ancré sur `Europe/Paris` (gestion automatique heure d'été CEST / heure d'hiver CET), sélecteur et affichage au format français `24h` (`09:00`), exécution autonome côté serveur même lorsque l'ordinateur de l'utilisateur est éteint. |
| **Idée n°1 — Blueprints d'Agents Clé en Main en 1 Clic** | `packages/contracts/src/sovereign-agent-blueprints.ts`, `apps/web/src/pages/Shell.tsx` (`CreateBotForm`) | Galerie de **6 profils d'agents pré-câblés** (*Atlas SEO*, *Plume Sociale*, *Mercure CRM*, *Flux n8n*, *Bastion DevOps*, *Scribe Souverain*) qui pré-remplissent en 1 clic le prompt contractuel, les connecteurs MCP adaptés et un pack de compétences ($\le 10$ skills). |
| **Idée n°2 — Passage de Relais Inter-Agents en 1 Clic** | `packages/contracts/src/sovereign-agent-blueprints.ts` (`buildInterAgentRelayBriefFr`), `apps/web/src/pages/Shell.tsx` | Permet de transférer les conclusions d'un Agent A vers un Agent B sous forme d'un **Dossier de Transmission synthétique de 5 lignes** validé par l'utilisateur en 1 clic (**0 boucle autonome inter-agents**). |
| **Idée n°3 — Cockpit de Sobriété IA & Météo des 18 Connecteurs MCP** | `apps/web/src/pages/SovereignCockpitOverlay.tsx`, `apps/web/src/pages/Shell.tsx` | Tableau de bord centralisé affichant en temps réel l'état des **7 couches anti-emballement**, la consommation hebdomadaire de tokens, l'état de la passerelle **OmniRoute** et la météo des **18 connecteurs MCP Souverains (87 outils)**. |
| **Idée n°4 — Modèles de Routines Quotidiennes Prêts à l'Emploi** | `packages/contracts/src/sovereign-agent-blueprints.ts` (`SOVEREIGN_ROUTINE_TEMPLATES`), `apps/web/src/pages/Shell.tsx` | **5 modèles de routines** en 1 clic calés sur `Europe/Paris` (`24h`) avec garde-fou `NO_SIGNAL` intégré (*Briefing CRM 08:30*, *Opportunités SEO Lundi 09:00*, *Brouillons Postiz Mar/Jeu 09:00*, *Sentinelle Infrastructure 07:30*, *Bilan Hebdo Vendredi 17:00*). |
| **Idée n°5 — Bouton « Mémoriser en Skill » depuis le Chat** | `apps/web/src/pages/Shell.tsx` (`MessageView`), `apps/web/src/pages/SkillLibraryOverlay.tsx` | Bouton d'action directe sous chaque réponse d'agent permettant d'ouvrir l'éditeur de la Bibliothèque de Compétences pré-rempli avec la méthodologie de la réponse pour la capitaliser en 1 clic. |
| **Épuration UI & Ergonomie Multi-Support (Android, iOS, Tablette, PC)** | `apps/web/src/pages/Shell.tsx`, `apps/web/src/tests/shell-integration.test.tsx` | Suppression complète des interfaces de synthèse vocale, dictée micro et raccourcis clavier. Remplacement du bouton d'ordinateur par l'icône explicite `CalendarClock` (**« Routines programmées & Automatisation de l'agent »** avec infobulle au survol et compteur de routines actives) et agrandissement de la loupe de recherche (`<Search size={18} />`). Adaptation plein écran fluide des tiroirs latéraux sur smartphone Android/iOS. |

---

## 7. Innovations Architecturales Écosystème OpenMausBot (19k+ Stars) : Déduplication `same-request`, Plafonds Mémoire Dynamiques & Sentinel Zéro-LLM

Issu de la rétro-ingénierie du dépôt amont de référence `OpenMausBot` (19 200+ étoiles), ce volet d'innovations renforce la frugalité et la résilience de Rakazo sans le moindre surcoût d'inférence.

| Module d'Innovation | Fichiers Clés | Spécifications Techniques & Garanties |
| :--- | :--- | :--- |
| **1. Déduplication sémantique `same-request`** | `packages/contracts/src/same-request.ts`, `apps/api/src/router.ts` (`threads.send`) | Élimine les doubles requêtes accidentelles et les clics répétés : lorsque l'utilisateur envoie une requête de $\ge 40$ caractères rigoureusement équivalente (mots et ponctuation normalisés) à une tâche déjà en cours sur le même fil, Rakazo réutilise le run actif au lieu d'en déclencher un second. **Économie de tokens : 100 % sur les doubles envois.** |
| **2. Plafonds Mémoire Dynamiques & Archivage LRU Automatique** | `packages/contracts/src/memory-budget.ts`, `packages/adapters/src/memory-context.ts`, `packages/adapters/src/executor.ts` | Remplace les plafonds mémoires statiques par des profils dynamiques calibrés par famille de LLM :<br>• **Famille Gemini 3.1 & 1.5 :** 250 lignes / 32 Ko (alerte 80 %)<br>• **Famille GPT-OSS 120B / ChatGPT :** 200 lignes / 24 Ko<br>• **Famille Mistral :** 150 lignes / 16 Ko<br>• **Défaut :** 200 lignes / 24 Ko.<br>Dès dépassement, les mémoires les plus anciennes sont automatiquement migrées dans `memory/archive.md`, conservant un fichier `MEMORY.md` toujours ultra-léger dans le prompt système actif. |
| **3. Scanner de Santé Sentinel Zéro-LLM ($0.00)** | `packages/contracts/src/sentinel.ts`, `apps/api/src/router.ts` (`sentinel.report`), `apps/web/src/pages/SovereignCockpitOverlay.tsx` | Diagnostic en temps réel de l'état des 18 connecteurs MCP et catégorisation normalisée des signatures d'erreurs (codes normalisés, nettoyages regex des messages). Fonctionne en pure analyse déterministe en mémoire (**coût garanti : 0.00 € / 0 token LLM**). Intégré dans l'onglet 3 du Cockpit Souverain (*Sentinel & Sobriété Mémoire*). |


