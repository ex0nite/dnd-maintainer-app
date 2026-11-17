# CONVENTION-CODE

Conventions à respecter. Elles complètent `CLAUDE.md` (architecture et commandes) sans le remplacer ; en cas de
conflit, `CLAUDE.md` décrit l'existant et ce fichier décrit ce qu'on attend du nouveau code.

## Général

- TypeScript en mode strict. Pas de `any`, pas de `as` pour contourner un type : on rétrécit le type.
- Imports via l'alias `@/` (= `src/`), jamais de chemins relatifs qui remontent (`../../`).
- Application : pas de `console.*` (la règle ESLint `no-console` est active), utiliser le logger du projet.
- Aucun code mort, aucun commentaire qui redit le code. Un commentaire explique le **pourquoi**.
- Fichiers de nouvelle fonctionnalité : un composant par fichier, nom en `PascalCase.tsx`; hooks `useXxx.ts`.

## Format

- Prettier (config dans `.prettierrc.json` : guillemets simples, point-virgule, 120 colonnes) et ESLint se
  lancent automatiquement à l'écriture (hook `.claude/settings.json`). Ne pas formater à la main.
- Fins de ligne : LF, imposé par `.gitattributes` (`* text=auto eol=lf`). Dans une copie de travail existante, après avoir commité ou mis de côté son travail : `git rm --cached -r -q . && git reset --hard` (un nouveau clone est déjà en LF).
- Documentation et fichiers de pilotage (`*.md` racine) en **français** ; code, identifiants, commits et messages
  d'erreur techniques en **anglais**.

## Interface et i18n

- Aucun texte visible en dur : clés `react-i18next` (`common` pour l'interface, `gamedata` pour les règles D&D).
  Ajouter chaque clé dans les fichiers de `src/locales/`.
- Les valeurs D&D stockées sont des identifiants en minuscules (`dwarf`, `wizard`), traduits à l'affichage.
- Tailwind v4 (config dans `src/index.css`), composants `src/components/ui/` (shadcn). `size-*` plutôt que `w-* h-*`
  pour les éléments carrés.
- Accessibilité : libellés sur les champs, focus visible, contraste conforme aux trois thèmes en clair et sombre.
- Les joueurs sont non techniques : messages d'erreur clairs, actions explicites, pas de jargon.

## Données et hooks

- Lecture : hooks `useXxx()` avec TanStack Query. Écriture : hooks de mutation (`useXxxMutations()` ou hooks
  individuels), jamais d'appel Supabase directement dans un composant.
- Colonnes demandées listées dans `src/lib/query-columns.ts`; ne pas utiliser `select('*')` sur les tables sensibles.
- Entrées utilisateur validées avec Zod avant l'écriture. Les slugs passent par `validateSlug`.
- L'interface masque ce que le rôle ne peut pas faire, **mais la protection est la RLS**, pas l'interface.

## Base de données et sécurité

- Toute modification du schéma passe par une migration dans `supabase/migrations/`, nommée
  `AAAAMMJJHHMMSS_description.sql`. Jamais de modification d'une migration déjà appliquée ; après chaque migration,
  `npm run supabase:types`.
- Toute nouvelle table : `ENABLE ROW LEVEL SECURITY` **dans la même migration**, avec ses policies. Aucune policy
  `USING (true)` ; aucun droit accordé à `anon` sauf justification écrite dans `DECISIONS.md`.
- Fonctions `SECURITY DEFINER` : `SET search_path = ''`, références qualifiées (`public.table`),
  `REVOKE EXECUTE ... FROM PUBLIC, anon` puis `GRANT` ciblé.
- Dans les policies, `(select auth.uid())` plutôt que `auth.uid()` (performances). Index sur les colonnes de
  propriété (`owner_user_id`, `user_id`).
- Aucun secret dans le dépôt, le bundle ou les logs. Seules les variables `VITE_*` publiques vont au navigateur ;
  `service_role` ne quitte jamais le serveur.
- Pas de `dangerouslySetInnerHTML`. Les contenus saisis par les utilisateurs (notes, commentaires) sont rendus en
  texte échappé.
- Messages d'erreur affichés : génériques. Le détail Postgres/PostgREST ne s'affiche pas à l'écran.
- Dépendances : ajouter une dépendance se justifie dans la revue ; traiter `npm audit` à chaque montée de version.

## Tests

- Tests Vitest à côté du code (`foo.test.ts`), mock Supabase de `src/test/mocks/supabase.ts`, helpers de
  `src/test/hook-test-helpers.ts`.
- Toute nouvelle fonctionnalité : tests unitaires + scénarios BDD (`features/`). Fonctionnalité manquante : tag
  `@future`; on ne modifie pas `src/` ou les migrations pour faire passer un scénario (voir `docs/bdd.md`).
- Toute nouvelle policy RLS : tests SQL (pgTAP) pour **chaque** identité (anonyme, joueur propriétaire, autre joueur,
  joueur archivé, joueur au mot de passe temporaire, non-membre, MJ) et chaque opération (SELECT, INSERT, UPDATE,
  DELETE).
- Tests SQL dans `supabase/tests/database/` (`npm run test:sql`, pile locale démarrée). `00000-setup-test-helpers.sql` installe
  les aides du schéma `tests` (`tests.set_identity('dm')`, `tests.uid(...)`, `tests.rows_affected(...)`) ; chaque fichier de
  test est une transaction terminée par `rollback`. Une écriture bloquée par la RLS touche **0 ligne sans erreur** : on
  compte les lignes (`tests.rows_affected`) ; un `INSERT` ou `WITH CHECK` refusé lève `42501`.
- Règles des tests SQL : uniquement sur une base **locale ou de CI** (`test:sql` impose `--local` ; jamais `--linked` ni `--db-url`). Les aides sont retirées en fin de série (`99999-teardown-test-helpers.sql`) ; avant un `supabase db diff`, `supabase db reset` garantit une base propre. Les sept identités ne diffèrent que par leur UUID : leur statut réel (archivé, mot de passe temporaire, MJ) vient des lignes `profiles` et `campaign_members` insérées par chaque test, et `set_identity` exige une transaction (`begin;` ... `rollback;`). Chaque test d'accès porte un témoin positif (l'opération autorisée réussit) pour qu'un `42501` dû à un `GRANT` manquant ne passe pas pour un refus de la RLS.
- Avant la revue : `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bdd`, `npm run test:sql` (si SQL touché), `npm run format:check`, `npm run build` passent ; `npm run supabase:types` après une migration.

## Git

- Un worktree et une branche par tâche, dans le dossier commun `.worktrees` : sous-dossier `wt-<sujet>`, branche
  `<type>/<sujet>` avec `feat/`, `fix/`, `chore/` ou `docs/` (D-25).
- `main` = stable : on y fusionne seulement une version vérifiée et testée. `dev` = branche de travail principale : les
  branches ponctuelles partent de `origin/dev` et y sont fusionnées.
- Après fusion : supprimer le worktree (`git worktree remove`) et la branche locale.
- Commits petits et ciblés, message en anglais à l'impératif (`Add player notes table`), un sujet par commit.
  Le contenu d'un commit correspond à son message.
- Pas de `--no-verify`, pas de force-push sur `main` ni sur `dev`, pas de commit de `.env*`, `node_modules/`, `dist/`.
- Pas de pull request vers `drovani/dnd-maintainer` (dépôt amont) sans accord explicite. Les PR visent le fork :
  `gh pr create --repo ex0nite/dnd-maintainer-app --base <branche>` (sans `--repo`, `gh` cible l'amont).
- `dev` vers `main` : par pull request sur le fork, une fois la CI verte (D-26). Branche ponctuelle vers `dev` : fusion
  locale puis push. Synchronisation avec l'amont : seulement sur demande.

## Accès aux données (SQL)

- Chaque table de `public` et `storage.objects` porte `access_active` : policy `AS RESTRICTIVE FOR ALL TO authenticated
USING (is_dm() OR is_active_user())` (AD-4). Les droits des rôles sont retirés explicitement (`REVOKE ... FROM public,
anon`), les `GRANT` par défaut de Supabase ne sont jamais une protection.
- Les fonctions d'aide (`is_dm`, `is_active_user`, `is_member`, `owns_character`) sont `SECURITY DEFINER STABLE`,
  `SET search_path = ''`, `REVOKE EXECUTE ... FROM public, anon`. Une fonction SQL qui lit une table créée plus bas dans
  la même migration demande `set local check_function_bodies = off`.
- Une donnée réservée au MJ ne reste jamais dans une table lisible par les membres : table à part (`campaign_dm`, puis
  `session_dm`, `character_private`), créée par un trigger `AFTER INSERT`.
- Une migration qui déplace des données (copie, puis suppression de colonnes) est enveloppée dans `begin; ... commit;` et
  verrouille les tables touchées (`lock table ... in access exclusive mode`) : aucune écriture ne doit passer entre la
  copie et la pose des triggers.
- `supabase/tests/database/00900-structure.test.sql` est le filet de la CI : il échoue si une table de `public` n'a pas la
  RLS ou la policy `access_active` (hors `profiles`), s'il existe une policy `true` ou applicable à `anon`/`public` (schémas
  `public` et `storage`), un droit de `anon` sur une table, une séquence ou une fonction de `public`, une vue qui n'est pas
  `security_invoker`, ou un bucket public. Une nouvelle table se crée donc fermée, avec ses policies et sa matrice.
- Les portraits sont dans un bucket privé : la base garde le chemin (`<id>/portrait.jpg`), le navigateur demande une URL
  signée (`usePortraitSrc`, `PortraitImage`), jamais d'URL publique.
- Personnages (story 3.1, AD-6) : le propriétaire (`owner_user_id = auth.uid()` et membre de la campagne) lit, crée et
  modifie ses `characters`, et écrit son inventaire et ses niveaux (`owns_character`) ; jamais de DELETE pour un joueur.
  Les colonnes qu'un joueur ne doit pas fixer (propriétaire, campagne, type, activation, `archived_with_owner`, slug,
  `previous_slugs`, id) sont gardées par le trigger `characters_guard_ownership` (INSERT et UPDATE), pas par des policies :
  il échoue fermé : seuls le MJ, `service_role`, `postgres`/`supabase_admin` (migrations, fonctions `SECURITY DEFINER` comme `archive_player`) et le serveur d'authentification passent. Un joueur ne choisit pas l'`id` d'un nouveau personnage (le serveur le remplace : le slug en dépend). Un personnage désactivé par le MJ est gelé pour son propriétaire (lecture seule, `owns_active_character` pour les écritures sur inventaire et niveaux). L'ordre alphabétique
  des triggers compte (`guard` avant `manage_slug` avant `zz_clear_archive_mark`) et il est testé.
- Lecture des personnages (stories 3.6, 3.7, 3.9) : `can_read_character(id)` est la définition unique de « visible pour
  moi » (le propriétaire membre, ou n'importe quel membre quand c'est un PJ) ; les PJ de ma campagne sont lisibles (fiche,
  inventaire, niveaux), jamais les PNJ ni une autre campagne, un PJ archivé avec son propriétaire reste lisible en lecture seule, un PJ désactivé à la main par le MJ est retiré de la table (seuls son propriétaire, gelé, et le MJ le lisent).
  `character_private` (historique, notes) : propriétaire et MJ seulement, le propriétaire modifie mais ne crée ni ne supprime
  la ligne. Une réassignation par le MJ est immédiate (les policies relisent `owner_user_id` à chaque requête) ; la partie privée suit la fiche chez le nouveau propriétaire (le MJ la vide avant si besoin). Les autres joueurs lisent toutes les colonnes d'un PJ lisible, `owner_user_id` et `player_name` compris (accepté).
- Tests pgTAP : les sept identités (anonyme, propriétaire, autre joueur, archivé, mot de passe temporaire, non-membre,
  MJ) sur chaque table ; une écriture bloquée par la RLS touche 0 ligne (`tests.rows_affected`), une écriture refusée
  par `WITH CHECK` ou par absence de droit lève `42501`.

## Dépôt MCP

- Le MCP importe le moteur de règles de l'app (`@/lib/...`) mais ne la modifie pas. Toute évolution de la façon dont
  l'app range les choix des lignes de build se reporte dans `dnd-maintainer-mcp/src/engine/engine.ts`
  (voir son `CLAUDE.md`).
- Rien n'écrit sur stdout dans le MCP (il porte le protocole) : `console.error` uniquement.
