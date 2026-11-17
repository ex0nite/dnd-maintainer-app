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

- [ ] 7.1 Essai de charge de la pile allégée sur le QNAP (sans `account-admin`, puis avec après la 2.2) : décision
      auto-hébergement ou repli cloud (D-20)

### Reste de la story 2.2 (revue)

- [ ] Masquer le lien et la route « Joueurs » pour un non-MJ (le service refuse déjà ; à faire avec le hook de profil, story 2.3)
- [ ] Nettoyage des comptes d'authentification sans profil (crash entre création et profil) : tâche manuelle ou job
- [ ] Story 7.3 : limite par adresse de GoTrue (`GOTRUE_RATE_LIMIT_HEADER` = en-tête que le proxy écrase) et test à deux adresses (AC 2.6)
- [ ] Story 7.2 : activer le hook `password_verification_attempt` côté QNAP APRÈS la migration (voir SETUP)
- [ ] Copier le mot de passe temporaire : effacer le presse-papiers après un délai (confort)

- [ ] Story 3.3 : les rollbacks du front (`useCharacters`, `useBuilderAutosave`) font un DELETE : un joueur n'a pas le droit de supprimer, ils laissent un personnage orphelin ; à remplacer (nettoyage côté MJ ou statut brouillon)

### Epics 2 à 6

- [x] Epic 2 : le MJ gère sa table (2.1 spike authentification FAIT, voir `docs/auth-spike.md` ; 2.2 création de compte FAIT, 2.3 mot de passe obligatoire FAIT,
      2.4 réinitialisation FAIT, 2.5 membres / archivage FAIT, 2.6 limitation des tentatives FAIT)
- [ ] Epic 3 : fiche de personnage (3.1 FAIT ; 3.6, 3.7, 3.9 : base FAITE, interface à faire avec 3.2 ; 3.8 FAIT (base et hook) ; 3.2 à 3.5 à faire)
- [ ] Epic 4 : notes de campagne (4.1 à 4.4)
- [ ] Epic 5 : récapitulatifs de séance (5.1 à 5.4)
- [ ] Epic 6 : page joueur bilingue et adaptée au téléphone (6.1 à 6.4), dont `src/locales/fr/common.json`

### Epic 7, suite : mise en ligne

- [ ] 7.2 Installation reproductible et secrets régénérés
- [ ] 7.3 Exposition HTTPS et vérification réseau
- [ ] 7.4 CSP stricte
- [ ] 7.5 Bascule vers la production (rappel : pas de sauvegarde, D-23)
- [ ] 7.6 Recette avec les cinq joueurs

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
