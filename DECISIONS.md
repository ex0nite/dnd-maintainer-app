# DECISIONS

Décisions retenues par le propriétaire du projet, et seulement elles. Une décision n'est ajoutée ici qu'une fois
confirmée. Les points non tranchés vivent dans `AMBIGUITES.md` ; quand l'un d'eux est réglé, il migre ici.
Les recommandations et conséquences déduites vont dans `AGENTS.md`, `CONVENTION-CODE.md` ou `TO-DO.md`.

Format : `D-NN` · date · décision.

## Produit

### D-01 · 2026-11-15 · Composition de la page joueur

Une page joueur est composée de :

- la **fiche de personnage** ;
- les **notes de campagne** : les notes personnelles du joueur (D-10) et l'espace de notes communes (D-11).

### D-02 · 2026-11-15 · Ce que voit et fait un joueur connecté

| Élément                           | Droit                               |
| --------------------------------- | ----------------------------------- |
| Sa fiche de personnage            | lecture + édition                   |
| Ses notes de campagne             | lecture + édition                   |
| Les fiches des autres personnages | **lecture seule**                   |
| Récapitulatif des séances         | lecture + **ajout de commentaires** |

### D-03 · 2026-11-15 · La triche n'est pas gérée

Les joueurs ont un profil non technique : on ne gère pas la triche.

### D-10 · 2026-11-15 · Notes de campagne personnelles

Les « notes de campagne » d'un joueur sont **personnelles** : un carnet par joueur et par campagne, que le joueur lit et
édite. Le **MJ peut les lire**. Les autres joueurs ne les voient pas.

### D-11 · 2026-11-15 · Espace de notes communes

Un espace de **notes communes** est ajouté en plus des notes personnelles. Ses droits précis sont à régler (A-19).

## Processus

### D-04 · 2026-11-15 · Cycle de développement d'une fonctionnalité

1. Développement de la fonctionnalité.
2. Revue de code par un agent (**modèle Opus, effort medium**).
3. Corrections.
4. Mise à jour de la documentation.
5. Commit.

### D-05 · 2026-11-15 · Toujours travailler dans un worktree dédié

### D-06 · 2026-11-15 · Toujours veiller à la sécurité du code

## Outillage

### D-07 · 2026-11-15 · Utiliser BMAD pour piloter le développement

Les skills BMAD sont installés dans ce dépôt (`dnd-maintainer-app`).

### D-08 · 2026-11-15 · Fichiers de pilotage à la racine

`TO-DO.md`, `CONVENTION-CODE.md`, `AGENTS.md`, `DECISIONS.md`, `AMBIGUITES.md`.

## Déploiement

### D-09 · 2026-11-15 · Cible d'exécution

L'app et le MCP sont destinés à tourner sur le QNAP du réseau personnel, exposé sur Internet via le DynDNS de la
Livebox.

## Faits d'outillage (constats, pas des décisions)

- BMAD : module `bmm`, outil `claude-code`, v6.12.4. Skills dans `.claude/skills/`, configuration dans `_bmad/`.
- Une CI GitHub Actions existe sur chaque dépôt (`.github/workflows/ci.yml`), lancée à chaque push.
- À la date du 2026-11-15, l'app n'est pas prête à être exposée : toutes les policies RLS sont `USING (true)`
  (voir `docs/security-review-2026-06-01.md`).
