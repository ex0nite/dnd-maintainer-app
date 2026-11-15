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
- Fins de ligne : cible LF (`.gitattributes` à ajouter, voir `TO-DO.md`).
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
- Toute nouvelle policy RLS : tests SQL (pgTAP) pour **chaque** rôle (anonyme, joueur propriétaire, autre joueur,
  non-membre, MJ) et chaque opération (SELECT, INSERT, UPDATE, DELETE).
- Avant la revue : `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bdd`, `npm run format:check`, `npm run build` passent ; `npm run supabase:types` après une migration.

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

## Dépôt MCP

- Le MCP importe le moteur de règles de l'app (`@/lib/...`) mais ne la modifie pas. Toute évolution de la façon dont
  l'app range les choix des lignes de build se reporte dans `dnd-maintainer-mcp/src/engine/engine.ts`
  (voir son `CLAUDE.md`).
- Rien n'écrit sur stdout dans le MCP (il porte le protocole) : `console.error` uniquement.
