# AGENTS

Cadre pour les agents (Claude Code, agents BMAD, sous-agents de revue) qui travaillent sur ce dépôt.

## À lire avant de commencer

1. `CLAUDE.md` : architecture et commandes.
2. `CONVENTION-CODE.md` : règles de code.
3. `DECISIONS.md` : ce qui est tranché. **Ne pas remettre en cause** une décision ; la respecter.
4. `AMBIGUITES.md` : ce qui n'est pas tranché. Si la tâche dépend d'un point ouvert (`BLOQUANT`), **s'arrêter et
   poser la question** au lieu de choisir. Toute nouvelle ambiguïté découverte y est ajoutée.
5. `TO-DO.md` : la tâche à réaliser et son contexte.

## Règles absolues

- **Un worktree par tâche**, dans le dossier commun `.worktrees` (hors des dépôts), un sous-dossier `wt-<sujet>` par
  tâche : `git worktree add <chemin> -b <type>/<sujet> origin/dev`. Jamais de modification dans le checkout principal.
  Une fois la branche fusionnée : supprimer le worktree et la branche locale (D-25).
- **Sécurité d'abord** : l'app sera exposée sur Internet depuis un QNAP. La RLS est la seule barrière côté serveur.
  Pas de nouvelle table sans RLS, pas de policy `USING (true)`, pas de secret commité, pas de `service_role` dans le
  navigateur. Détail dans `CONVENTION-CODE.md`.
- **Pas de gestion de la triche** (D-03) : ne pas ajouter de validation serveur du moteur de règles. Mais ne pas
  confondre : le contrôle d'accès entre joueurs reste obligatoire.
- **Périmètre** : ne modifier que ce que la tâche demande. Pas de refactoring opportuniste, pas de dépendance ajoutée
  sans la justifier. Ne pas modifier `dnd-maintainer-mcp` depuis ce dépôt (et inversement) sans que la tâche le dise.
- **Le dépôt est public** : aucun nom de personne, chemin local, adresse e-mail, IP, nom DynDNS ou identifiant dans
  le code, les documents ou les commits.
- **Actions sortantes** (push, pull request, déploiement, accès à des services externes) : seulement sur demande
  explicite. Pas de PR vers `drovani/dnd-maintainer` sans accord explicite.
- Répondre à l'utilisateur en **français**.

## Cycle d'une fonctionnalité (D-04)

1. **Développer** dans le worktree, avec ses tests (unitaires, BDD, pgTAP si RLS).
2. **Contrôles locaux** : `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bdd`, `npm run format:check`, `npm run build` (et `npm run supabase:types` après une
   migration). Tant que A-17 est ouvert, le lint échoue sur 6 erreurs existantes : signaler lesquelles sont
   pré-existantes, ne pas les masquer.
3. **Revue de code** par un **sous-agent dédié, modèle Opus, effort medium**, qui ne reçoit que le diff et les fichiers
   concernés, pas la conclusion de l'auteur. Il vérifie : exactitude, sécurité (accès, injection, secrets, RLS),
   conventions, tests, régression. Il rend des constats classés par gravité, chacun avec un scénario d'échec concret.
4. **Corriger** les constats retenus ; justifier par écrit ceux qu'on écarte.
5. **Mettre à jour la documentation** : `TO-DO.md` (cocher), `DECISIONS.md` / `AMBIGUITES.md` si concernés,
   `CLAUDE.md` et `docs/` si l'architecture ou les commandes changent.
6. **Commit** (messages : voir `CONVENTION-CODE.md`), puis fusion dans `origin/dev` ; `main` ne reçoit que du code
   vérifié et testé comme stable. Une tâche terminée = un commit propre dans son worktree, puis nettoyage.

Une tâche n'est pas « faite » tant que l'étape 3 n'a pas eu lieu et que les contrôles de l'étape 2 ne passent pas.
Si un contrôle échoue, le dire clairement avec la sortie ; ne pas le contourner.

## BMAD

Les skills BMAD sont dans `.claude/skills/` (préfixe `bmad-`), la configuration dans `_bmad/`.

- Sorties (PRD, architecture, stories) dans `_bmad-output/`.
- Ne pas éditer `_bmad/config.toml` à la main (régénéré à l'installation) ; surcharges dans `_bmad/custom/`.
- Les artefacts BMAD servent de cadrage ; en cas de désaccord avec `DECISIONS.md`, `DECISIONS.md` l'emporte.

## Agent de revue : consignes

- Lecture seule : il ne modifie rien.
- Il ne s'arrête pas à ce que l'auteur annonce : il lit le code.
- Il contrôle en particulier :
  - toute table touchée a la RLS activée et des policies par rôle conformes à D-02 ;
  - aucun accès `anon` ajouté ; fonctions `SECURITY DEFINER` avec `search_path = ''` ;
  - aucune fuite de contenu MJ vers un joueur (`dm_notes`, `notes`, rencontres, notes de session, PNJ) ;
  - entrées validées, texte utilisateur échappé, erreurs génériques ;
  - textes via i18n, accessibilité, conventions de `CONVENTION-CODE.md` ;
  - tests présents et qui échouent si le comportement est cassé.
