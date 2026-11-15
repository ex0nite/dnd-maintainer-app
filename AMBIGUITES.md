# AMBIGUITES

Points à régler avant ou pendant le développement. Chacun a un identifiant, une question, des options et, quand il y
en a une, une **proposition** (non validée). Une fois tranché : déplacer en `DECISIONS.md` et supprimer d'ici.

Statut : `OUVERT` · `BLOQUANT` (empêche de démarrer la tâche liée dans `TO-DO.md`).

## Authentification

### A-09 · OUVERT · Les specs BDD `@draft` (`features/auth`, `admin`, `collaboration`)

Elles décrivent un autre modèle (mot de passe, rôle admin, 403 plutôt que 404, joueurs limités à leurs seuls
personnages). Les réécrire selon D-02 ? Garder un rôle « admin » distinct du MJ ?

## Déploiement (QNAP + DynDNS Livebox)

### A-11 · OUVERT · Exposition réseau

- HTTPS et certificat : reverse proxy avec Let's Encrypt (nom DynDNS de la Livebox) ?
- Quels ports sont redirigés vers le QNAP ? La Livebox est-elle derrière un CGNAT ?
- Un accès joueur doit-il passer par un VPN plutôt que par Internet ? (exclu par D-09 tant que non confirmé.)
- Protection contre les abus : limitation de débit sur le proxy, fail2ban ou équivalent.

### A-12 · OUVERT · Le MCP sur le QNAP

Le serveur MCP actuel est en **stdio**, lancé en local par le client du MJ. « Tourner sur le QNAP » implique-t-il :
un transport HTTP exposé (alors il faut une authentification solide, il écrit dans toute la base) ou seulement qu'il
se connecte à la base du QNAP depuis le poste du MJ ?
Proposition : il reste local, connecté à la base du QNAP avec un compte MJ dédié, jamais exposé sur Internet.

### A-13 · OUVERT · Sauvegardes

Fréquence, destination hors QNAP, restauration testée. Base **et** bucket de portraits.

## Outillage et organisation

### A-14 · OUVERT · BMAD sur le dépôt MCP ?

BMAD est installé dans l'app (D-07). Faut-il l'installer aussi dans `dnd-maintainer-mcp`, ou piloter les deux depuis
l'app ? Les fichiers `TO-DO.md`, `DECISIONS.md`, etc. sont dans le dépôt app et couvrent aussi le MCP.

### A-15 · OUVERT · Emplacement des worktrees

Proposition : dossier frère du checkout (`../wt-<sujet>`), branche `<type>/<sujet>` (`feat/`, `fix/`, `chore/`, `docs/`).

### A-16 · OUVERT · Gestion de la branche `ci-setup` et du fork

`origin` est un fork de `drovani/dnd-maintainer`. Les branches de travail sont-elles fusionnées dans `main` du fork
(sans PR vers l'amont) ? Quand synchroniser avec `upstream` ?

### A-17 · OUVERT · Erreurs de lint existantes

6 erreurs `no-console` bloquent le lint (`LevelUpDialog.tsx`, `pdf-field-map.ts`, `use-all-choice-grants.ts`).
Les corriger (logger du projet) ou assouplir la règle ?

### A-18 · OUVERT · Langues de l'interface

Il n'existe que `src/locales/en`. Faut-il ajouter le français (les joueurs sont francophones) ? L'anglais reste-t-il ?
