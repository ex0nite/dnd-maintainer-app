# AMBIGUITES

Points à régler avant ou pendant le développement. Chacun a un identifiant, une question, des options et, quand il y
en a une, une **proposition** (non validée). Une fois tranché : déplacer en `DECISIONS.md` et supprimer d'ici.

Statut : `OUVERT` · `BLOQUANT` (empêche de démarrer la tâche liée dans `TO-DO.md`).

## Authentification

### A-09 · OUVERT · Les specs BDD `@draft` (`features/auth`, `admin`, `collaboration`)

Elles décrivent un autre modèle (mot de passe, rôle admin, 403 plutôt que 404, joueurs limités à leurs seuls
personnages). Les réécrire selon D-02 ? Garder un rôle « admin » distinct du MJ ?

## Déploiement (QNAP + DynDNS Livebox)

### A-16 · OUVERT · Gestion de la branche `ci-setup` et du fork

`origin` est un fork de `drovani/dnd-maintainer`. D-25 définit `main` (stable) et `dev` (travail). Restent à fixer :les fusions dans `dev` et `main` se font-elles par pull request sur le fork ou par fusion locale ? Quand synchroniseravec `upstream` ? La branche `dev` doit être créée sur le fork (voir `TO-DO.md`).

### A-17 · OUVERT · Erreurs de lint existantes

6 erreurs `no-console` bloquent le lint (`LevelUpDialog.tsx`, `pdf-field-map.ts`, `use-all-choice-grants.ts`).
Les corriger (logger du projet) ou assouplir la règle ?

### A-18 · OUVERT · Langues de l'interface

Il n'existe que `src/locales/en`. Faut-il ajouter le français (les joueurs sont francophones) ? L'anglais reste-t-il ?
