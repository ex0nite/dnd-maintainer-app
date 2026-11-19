# TO-DO

Tâches à faire, par ordre de priorité. Cocher une tâche une fois commitée ; ajouter la référence du commit.
Chaque tâche suit le cycle de `DECISIONS.md` D-04 et se fait dans son propre worktree (D-05).
`⛔ A-NN` = dépend d'une ambiguïté de `AMBIGUITES.md` : la trancher avant de démarrer la tâche (ou la reprendre
si la réponse change le besoin). Les points marqués `BLOQUANT` là-bas bloquent toute la phase.

## 0. Mise en place (en cours)

- [x] Créer la branche `dev` sur le fork à partir de `main` (D-25), app et MCP
- [ ] Fusionner `ci-setup` et `chore/bmad-setup` dans `dev` (D-26 : fusion locale, `main` reste réservé au stable)
- [x] Déplacer les worktrees existants dans le dossier commun `.worktrees` (D-25)

- [x] CI GitHub Actions du dépôt MCP
- [x] CI GitHub Actions du dépôt app (branche `ci-setup`, non fusionnée)
- [x] Installer BMAD dans le dépôt app
- [x] Créer `TO-DO.md`, `CONVENTION-CODE.md`, `AGENTS.md`, `DECISIONS.md`, `AMBIGUITES.md`
- [x] Vérifier la CI app : entièrement verte sur `dev` (typecheck, lint, format, tests, BDD, build), commit `76e3102`
- [x] Fusionner `ci-setup` et `chore/bmad-setup` dans `dev` (D-26) ; `main` reste réservé au stable
- [x] Corriger les 6 erreurs de lint `no-console` (D-27, dans `dev`)
- [x] Corriger le format et les scénarios BDD en CI (stub de `VITE_SUPABASE_PUBLISHABLE_KEY` dans le chargeur BDD, exclusion
      Prettier des fichiers BMAD générés)
- [x] Ajouter un `.gitattributes` (`* text=auto eol=lf`) : fait en story 1.1 ; reste le BDD sous Windows (ci-dessous)
- [ ] Scénarios BDD sous Windows : `npm run test:bdd` échoue en local (variable `TSX_TSCONFIG_PATH` non reconnue par cmd, esmock et chemins Windows) alors que la CI Linux passe ; rendre le script portable (ex. `cross-env`) et corriger esmock
- [ ] Corriger la doc : `CLAUDE.md` dit « RLS sans policy » alors que les 7 policies sont `USING (true)` (et 4 policies
      publiques sur `storage.objects`), et « ESLint 9 » alors que `package.json` est en ESLint 10 ; le nom de
      variable est `VITE_SUPABASE_PUBLISHABLE_KEY` dans le code mais `VITE_SUPABASE_ANON_KEY` dans `CLAUDE.md`, `src/locales/en/common.json`,
      `README.md`, `SETUP.md`

## 1. Cadrage avec BMAD (terminé)

- [x] Trancher les ambiguïtés bloquantes (toutes réglées)
- [x] Brief produit, PRD, architecture (AD-1 à AD-22), brainstorm de design (2 tours) : `_bmad-output/`
- [x] Découpage en epics et stories : `_bmad-output/planning-artifacts/epics.md` (8 epics, 48 stories, statut final)
- [ ] Contexte projet pour les agents (`bmad-project-context`)

## 2. Développement : suivre `epics.md`

Une story = un worktree = le cycle D-04. L'ordre ci-dessous respecte les dépendances ; chaque story est détaillée avec ses
critères d'acceptation dans `epics.md`. Cocher une story une fois fusionnée dans `dev` (avec la référence du commit).

### Epic 1 : une app verrouillée où le MJ retrouve tout

- [x] 1.1 Banc d'essai pgTAP en CI et fins de ligne LF (`.gitattributes`), commit `333ab75`
- [x] 1.2 Le propriétaire crée le compte MJ hors de l'app (`profiles`, script d'amorçage)
- [x] 1.3 Le MJ se connecte avec son pseudo (app et MCP), contrôle 360 px / contraste en CI
- [x] 1.4 Campagnes et appartenance sous contrôle strict
- [x] 1.5 Les données privées quittent les tables lisibles (`character_private`, `session_dm`, `campaign_dm`)
- [x] 1.6 Les tables de personnages sont verrouillées
- [x] 1.7 Le reste du schéma et le stockage sont verrouillés
- [x] 1.8 Bascule transactionnelle des données existantes

### Epic 7, première partie (à lancer tôt, en parallèle de l'epic 1)

- [x] 7.1 Essai de charge de la pile allégée sur le QNAP : FAIT le 2026-11-17, auto-hébergement retenu (D-33, `docs/qnap-load-test.md`)

### Reste de la story 2.2 (revue)

- [ ] Masquer le lien et la route « Joueurs » pour un non-MJ (le service refuse déjà ; à faire avec le hook de profil, story 2.3)
- [ ] Nettoyage des comptes d'authentification sans profil (crash entre création et profil) : tâche manuelle ou job
- [ ] Story 7.2 : activer le hook `password_verification_attempt` côté QNAP APRÈS la migration (voir SETUP)
- [ ] Copier le mot de passe temporaire : effacer le presse-papiers après un délai (confort)

- [ ] Story 3.3 : les rollbacks du front (`useCharacters`, `useBuilderAutosave`) font un DELETE : un joueur n'a pas le droit de supprimer, ils laissent un personnage orphelin ; à remplacer (nettoyage côté MJ ou statut brouillon)

- [ ] Portraits : avant l'ouverture, vérifier sur la version de storage-api installée sur le QNAP que le listing (`storage.search`, `prefixes`) respecte la RLS (un joueur ne doit lister que les dossiers de personnages lisibles)

- [ ] Reconstruction d'une fiche : l'équipement de départ n'est pas recalculé si la classe ou l'historique change (la finalisation n'écrit des objets que s'il n'y en a aucun)
- [ ] Un joueur ne peut pas supprimer : « abandonner » un brouillon dans le constructeur le laisse en place (visible et reprenable dans « Mes personnages »)

- [ ] Reconstruction : l'étape Équipement du constructeur n'enregistre ni les objets équipés ni les achats d'une fiche déjà finalisée (et `armor_class` est calculée depuis l'équipement de départ tant que la fiche est en brouillon) ; à masquer ou à corriger
- [ ] Un joueur dont la fiche vient d'être réassignée voit la sienne éditable jusqu'à 5 minutes (pas de temps réel) : message dédié si une mise à jour touche 0 ligne

### Epics 2 à 6

- [x] Epic 2 : le MJ gère sa table (2.1 spike authentification FAIT, voir `docs/auth-spike.md` ; 2.2 création de compte FAIT, 2.3 mot de passe obligatoire FAIT,
      2.4 réinitialisation FAIT, 2.5 membres / archivage FAIT, 2.6 limitation des tentatives FAIT)
- [x] Epic 3 : fiche de personnage (3.1 FAIT ; 3.6, 3.7, 3.9 : base FAITE, interface à faire avec 3.2 ; 3.1 à 3.9 FAITES : policies, accueil joueur, fiches, création, niveaux, reconstruction, portraits, réassignation)
- [x] Epic 4 : notes de campagne (4.1 à 4.4 FAITES : carnet personnel, lecture MJ, notes communes, modération)
- [x] Epic 5 : récapitulatifs de séance (5.1 à 5.4) (5.1 à 5.4 FAITES : publication, lecture, commentaires, modération)
- [x] Epic 6 : page joueur bilingue et adaptée au téléphone (6.1 à 6.4), dont `src/locales/fr/common.json` (6.1 à 6.4 FAITES : accueil joueur, français/anglais, parcours 360 px, refus clair)

### Epic 7, suite : mise en ligne

- [x] 7.2 Installation reproductible et secrets régénérés (FAIT : `deploy/qnap/`, `docs/deploy-qnap.md`, job CI `stack` ; reste l'installation réelle sur le QNAP, avec le propriétaire)
- [x] 7.3 Exposition HTTPS et vérification réseau (FAIT le 2026-11-18 : hôte NPM avec certificat joker Let's Encrypt, redirection 80/443 de la box,
      smoke complet depuis le réseau public, en-têtes, limite par adresse avec `X-Real-IP` forgé (429 au bout de 33 essais), scan : seuls 80 et 443 ouverts ; téléphone en 5G connecté pendant que le PC était limité ; plages CDN de NPM : risque résiduel accepté par le propriétaire le 2026-11-18, le verrou par pseudo reste le frein principal)
- [x] 7.4 CSP stricte (FAIT : bloquante sous Playwright et vérifiée sur le site réel le 2026-11-18, aucune violation sur les écrans MJ)
- [ ] 7.5 Bascule vers la production (rappel : pas de sauvegarde, D-23)
- [ ] 7.6 Recette avec les cinq joueurs

- [x] 9.1 Choix des règles par campagne (FAIT et déployé le 2026-11-18 : migration appliquée sur le QNAP, front publié, MCP reconstruit ; copie manuelle de la base faite avant, `pre-9-1-*.sql` dans le dossier des secrets du QNAP, à supprimer quand plus utile)
- [x] 9.2 Spike et architecture des règles en données (FAIT le 2026-11-18 : `docs/rules-as-data.md`, D-35, FR-30 à FR-33 ; inventaire SRD 5.1 ; besoins d'une vraie table ; le paquet PyPI `dnd-5e-core` écarté) ; À CONFIRMER par le MJ : livres autorisés à la table (`phb-2014`, `xgte`, `tcoe` proposés)
- [x] 9.3 Les règles en base, validées et chargées par le moteur (FAIT le 2026-11-18 sur `feat/9-3-rules-store`, à fusionner : table `rule_entries` par édition et sa matrice pgTAP, `validate_rule_entry`, quota, révision, suppression refusée si utilisée ; schémas Zod des 8 types et des 29 `Grant` ; `RuleSet` à trois couches, `RuleSetProvider`, noms propres fr/en ; carte « Bibliothèque de règles » du MJ ; `docs/rules-as-data.md` §9). Restes : migration à appliquer sur le QNAP ; le MCP (9.4) doit construire son `RuleSet` depuis la base ; générateur de PNJ et constructions rapides limités aux règles intégrées ; identifiants de classe, langues et outils encore fermés (9.5) ; revue Opus du 2026-11-18 corrigée (plancher SQL des types de grant, révision interdite sur entrée utilisée, attente de la bibliothèque, sorts de bibliothèque, références entre entrées) ; le MCP devra définir `import.meta.env` absent (logger protégé) et utiliser `rule_entry_references`
- [x] 9.5 Espèces, sous-espèces et historiques 2014 (FAIT le 2026-11-18 sur `feat/9-5-species-backgrounds` et `feat/9-5-mcp`, à fusionner : générateur `npm run srd:generate` et couche SRD 2014 commitée (9 espèces, 4 sous-espèces, l'acolyte) avec son attribution ; sous-espèce = choix de lignée de l'espèce parente, octrois cumulés ; section « Licences » des paramètres ; colonne `rule_entries.overrides_builtin` écrite par le MCP, une surcharge utilisée se supprime ; `docs/rules-as-data.md` §10). Restes : migration à appliquer sur le QNAP (avec la 9.3) ; effets SRD gardés en texte (vision dans le noir, avantages aux jets de sauvegarde, sorts innés du tieffelin et sort mineur du haut-elfe jusqu'à la 9.8, dés du souffle selon le niveau) ; équipement d'historique en texte jusqu'à la 9.7 ; traits de personnalité de l'historique non convertis ; le constructeur n'affiche pas encore un 2e choix de lignée (sous-espèce d'une espèce qui a déjà sa lignée) : à traiter avec le constructeur 2014 (9.7) ; langues et outils restent fermés (le SRD n'en ajoute aucun)
- [x] 9.6 Classes et sous-classes 2014 (FAIT le 2026-11-19 sur `feat/9-6-classes-2014` (app) et `feat/9-6-classes-2014` (MCP), à fusionner : 12 classes et 12 sous-classes du SRD 5.1 générées (`class.json`, `subclass.json`), sous-classe au niveau de classe 1, 2 ou 3, augmentations de caractéristiques aux niveaux des tables du SRD, aucune maîtrise d'arme, tests niveau par niveau de 1 à 20 ; `docs/rules-as-data.md` §11). Restes : sorts, emplacements, magie de pacte, invocations et métamagie en texte jusqu'à la 9.8 ; réserves de ressources (rage, ki, points de sorcellerie, forme sauvage, action surge, Canalisation d'énergie divine) non suivies, sauf Second Souffle, Récupération arcanique et Récupération naturelle ; équipement de départ en texte jusqu'à la 9.7 (pas de choix en pièces d'or dans le SRD) ; vitesse (Mouvement rapide, Déplacement sans armure) et CA de la Lignée draconique (13 + Dex) en texte ; Dévotion et domaine : sorts de domaine ou de serment en texte ; l'engin ne vérifie pas qu'une sous-classe choisie appartient à la classe (le constructeur 2014 le fera) ; `alchemistssupplies` ajouté au vocabulaire des outils (code, gamedata)
- [x] 9.7 Constructeur de personnage 2014 (FAIT le 2026-11-19 sur `feat/9-7-builder-2014` (app) et `feat/9-7-builder-2014` (MCP), à fusionner : étapes dans l'ordre de 2014 (`builderSteps`), méthode de caractéristiques « saisie manuelle » et contrôle des valeurs par méthode (`validateBaseAbilities`, bloquant à la finalisation et côté MCP), bonus d'espèce affiché, second choix de lignée, équipement de départ des 12 classes en choix `bundle-choice` et équipement de l'acolyte en objets (SRD seul : packs et objets ajoutés au catalogue), richesse de départ saisie à la main (le SRD n'a pas de table), sous-classe filtrée par classe dans le moteur, `canBuildCharacters('2014')` vrai et `ruleset_has_engine('2014')` vrai (migration `20261122000000`), MCP : outils de personnage ouverts au 2014 (`manual`), PNJ aléatoire refusé en 2014 ; `docs/rules-as-data.md` section 12). Restes : migration `20261122000000` à appliquer sur le QNAP (avec la 9.1/9.3/9.5) ; sorts, emplacements, magie de pacte et invocations restent en texte jusqu'à la 9.8 (un lanceur de sorts 2014 se finalise sans sorts) ; « (si maîtrise) » du clerc en texte, non vérifié ; richesse de départ par classe (PHB, hors SRD) non fournie : saisie libre ; le générateur de PNJ aléatoire ne connaît que 2024 ; les valeurs de caractéristiques ne sont pas contrôlées par la base (colonne jsonb) ; la bibliothèque du MJ ne peut pas encore définir de nouveaux paquets ou objets (catalogue en code)
- [x] 9.8 Sorts et incantation 2014 (FAIT le 2026-11-19 sur `feat/9-8-spells-2014` (app) et `feat/9-8-spells-2014` (MCP), à fusionner : les 319 sorts du SRD 5.1 générés (`spell.json`) et rattachés à leurs classes ; emplacements, magie de pacte, sorts mineurs, sorts connus et livre de sorts, sorts préparés (nombre), sorts de domaine, de serment et de cercle, liste étendue du Fiélon, Arcanum mystique, invocations (32), don de pacte et métamagie (8) selon les tables du SRD (nouveaux octrois `spell-slots`, `pact-magic`, `spell-list-extension`, `feature-picks`, `maxSpellLevel`) ; fenêtre de montée de niveau lisant les règles de la campagne ; MCP : choix `feature-picks`, fiche avec emplacements et sorts ; `docs/rules-as-data.md` section 13, D-37). Restes : le jeu de données du SRD a des nombres faux (invocations aux niveaux 4 et 6, métamagie au niveau 16) : les nombres du SRD sont écrits dans le convertisseur ; sorts préparés = un nombre, pas une liste ; sorts d'espèce (sort mineur du haut-elfe, Héritage infernal du tieffelin) et sorts du don de pacte du Grimoire en texte ; prérequis des invocations autres que le niveau en texte ; noms français des sorts et des invocations à fournir ; texte des sorts non affiché sur la fiche ; emplacements de plusieurs classes non combinés (un seul lanceur de sorts, comme en 2024)
- [x] 9.9 Fiche PDF et export 2014 (FAIT le 2026-11-19 sur `feat/9-9-pdf-export-2014` (app), à fusionner : la fiche 2014 est dessinée par pdf-lib, sans modèle à fournir (`src/lib/pdf-sheet-2014.ts` : champs de la fiche 2014, mention CC-BY 4.0 du SRD 5.1 au pied de chaque page quand du contenu SRD y figure) ; l'export de données du MJ emporte `rule_entries` des éditions des campagnes choisies en plus de `campaigns.ruleset` ; MCP inchangé ; `docs/rules-as-data.md` section 14, D-38). Restes : dés de vie par niveau (le moteur n'en octroie qu'un par classe : multiclasse à dés différents imprimé tel quel) ; points de vie actuels, dés dépensés, emplacements dépensés et points d'expérience non portés par la fiche (cases laissées à remplir) ; mise en page non comparée à un tirage de la fiche officielle ; export 2024 toujours dépendant du formulaire officiel fourni par le joueur
- [ ] Epic 9 : règles 2014 par campagne et règles en données modifiables par le MCP (9.1 choix des règles, 9.2 spike et architecture, 9.3 règles en base, 9.4 outils MCP, 9.5 espèces et historiques, 9.6 classes, 9.7 constructeur, 9.8 sorts (fait), 9.9 PDF (fait), 9.10 recette) : voir `epics.md`

### Après le MVP

- [ ] Epic 8 : contenu riche du MJ (8.1 spike et corpus de brews, à partir de 5 à 10 brews fournis par le MJ, hors dépôt)

### Reprises transverses

- [ ] `storage.objects` appartient à `supabase_storage_admin` : la migration ne peut pas retirer les droits de table de `anon`
      (seule la RLS le protège, vérifiée par pgTAP : aucune policy pour anon/public, restrictive `access_active`). À revérifier
      sur la pile du QNAP (story 7.2). Les privilèges par défaut de `supabase_admin` (objets qu'il crée) ne sont pas modifiables
      non plus : nos migrations tournent en `postgres`, dont les défauts sont corrigés.
- [ ] Portraits : les lignes existantes sont converties en chemins de stockage par la migration 1.7 ; vérifier sur les
      vraies données à la bascule (story 1.8) que chaque portrait s'affiche via une URL signée

- [ ] Performance des policies : les policies appellent `public.is_dm()` / `is_active_user()` sans `(select ...)` (évaluation
      possible par ligne) ; sans enjeu pour 5 joueurs, à reprendre si une liste ralentit (adapter alors les tests de structure)
- [ ] Matrice pgTAP des tables de personnages : un personnage (niveau, objet) par identité pour distinguer propriétaire et
      autre joueur, à faire en epic 3 quand ces accès s'ouvrent

- [ ] Epic 3 : le trigger `characters_guard_ownership` (story 1.5) refuse le changement de `owner_user_id` et de
      `archived_with_owner` par un non-MJ ; à étendre en trigger de garde complet d'AD-6 (colonnes de liaison, statut) quand
      les joueurs obtiendront une policy d'écriture sur `characters`. Il est testé par une policy temporaire dans le pgTAP.
      La 1.6 a fermé `characters`, `character_items` et `character_build_levels` au MJ seul.
- [x] Story 1.8 : bascule en une transaction faite (`scripts/cutover/`, `docs/cutover.md`), testée en CI
- [ ] Écriture non atomique entre table principale et table privée (compensation par suppression en cas d'échec) :
      envisager une RPC `SECURITY INVOKER` quand l'epic 3 ouvrira les écritures aux joueurs

- [ ] Export SQL (`src/lib/export-sql.ts`) : `campaign_dm` y figure depuis la story 1.4 (conflit `DO UPDATE`, car le trigger
      crée déjà la ligne vide) ; ajouter `character_private` et `session_dm` en story 1.5
- [ ] Tant que les stories 1.6 et 1.7 ne sont pas faites, `characters`, `sessions`, `encounters`, `notes` et le stockage
      restent ouverts à `anon` : ne pas exposer l'app avant la 1.7

- [ ] Réécrire les specs BDD `@draft` (D-29), en `@future`, au fil de chaque epic
- [x] Retirer `GRANT EXECUTE` à `anon` sur `last_activity_at` : fait en story 1.7 (et sur toutes les fonctions de `public`)
- [ ] Mettre à jour `docs/security-review-2026-06-01.md` avant la mise en ligne

## Plus tard

- [ ] Sauvegardes de la base et des portraits, avec test de restauration (D-23 : écartées pour l'instant ; piste :
      export quotidien chiffré vers un autre volume puis copie vers un second QNAP)

- [x] BMAD dans le dépôt MCP : non (D-24), simple renvoi depuis son `CLAUDE.md`
- [ ] Traduire les données de règles (`gamedata`, 1 728 clés) en français, par lots (D-28)

- [ ] Export du MJ (`ExportData`, `generateSeedSql`) : n'inclut pas encore `notes_personal`, `notes_shared`, `session_comments` ni `sessions.summary_published` (epics 4 et 5) ; à ajouter avant le basculement (sauvegarde).
- [ ] Récapitulatif de séance : `summary` sert à la fois de brouillon et de texte publié (chaque autosave est visible des joueurs tant que la séance est publiée) ; envisager `summary_draft`.
- [ ] Parcours « édition de fiche » de l'e2e 360 px : couvre le début du constructeur (saisie du nom), pas encore la fiche complète d'un personnage existant (fixtures à écrire).
- [ ] Traduction française de `common.json` produite par un modèle : à faire relire par un francophone de la table (vocabulaire).
- [ ] Pages du MJ (`SessionList`, `SessionDetail`, `NotesPage`, `CampaignDashboard`) : dates en `toLocaleDateString(undefined, ...)` (langue du navigateur) au lieu de `i18n.language`.
- [ ] Accueil joueur : la campagne choisie n'est pas mémorisée (retour sur la première campagne après un aller-retour) ; sélecteur de langue masqué quand le menu est replié.
- [ ] Traduction : « Feature » rendu par « trait » (PHB : « aptitude »), « weapon mastery » par « spécialisation d'arme » (PHB 2024 : « botte d'arme » ?) à valider à la relecture.
