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

Un espace de **notes communes** est ajouté en plus des notes personnelles (droits : voir D-12).

### D-12 · 2026-11-15 · Droits sur les notes communes

- **Plusieurs notes**, chacune avec un **titre**, une **catégorie** et un **épinglage**.
- **Joueur** : peut créer une note ; ne peut **ni modifier ni supprimer** la note d'un autre.
- **MJ** : peut créer, modifier et supprimer **toutes** les notes.
- **Pas d'édition simultanée** à gérer.

### D-14 · 2026-11-15 · Récapitulatifs de séance et commentaires

- Le récapitulatif d'une séance est `sessions.summary`. Les autres données de séance (notes, butin, expérience) restent
  réservées au MJ.
- Un récapitulatif est visible des joueurs **seulement quand le MJ le publie** (indicateur de publication par séance).
- Les **commentaires** sur un récapitulatif sont visibles de **tous les membres de la campagne**.
- Un joueur peut **modifier et supprimer ses propres commentaires**. Le MJ peut **modifier et supprimer tous** les
  commentaires.

### D-15 · 2026-11-15 · Consultation des fiches des autres personnages

- Un joueur consulte, en lecture seule, la fiche des **autres personnages joueurs** de sa campagne.
- Les champs `backstory` (historique) et `notes` d'une fiche sont visibles **uniquement du propriétaire et du MJ**.
  Tout le reste de la fiche est visible.
- Les fiches de **PNJ** ne sont **pas visibles** des joueurs.

### D-16 · 2026-11-15 · Joueurs, personnages et campagnes

- Un joueur peut avoir **plusieurs personnages** dans une même campagne (le MJ peut désactiver les anciens).
- Un compte peut appartenir à **plusieurs campagnes** ; un joueur ne voit que celles dont il est membre.
- Le **MJ peut réassigner** un personnage à un autre joueur.

### D-17 · 2026-11-15 · Création, suppression et montée de niveau

- Le **joueur crée ses personnages** avec le constructeur, dans une campagne dont il est membre ; le **MJ peut aussi en
  créer** et les assigner. Un personnage est rattaché automatiquement à son créateur.
- Seul le **MJ supprime** un personnage ; le MJ peut le désactiver pour le mettre de côté.
- Le **joueur monte lui-même** son personnage de niveau (sans validation du MJ).

## Processus

### D-04 · 2026-11-15 · Cycle de développement d'une fonctionnalité

1. Développement de la fonctionnalité.
2. Revue de code par un agent (**modèle Opus, effort medium**).
3. Corrections.
4. Mise à jour de la documentation.
5. Commit.

### D-05 · 2026-11-15 · Toujours travailler dans un worktree dédié

### D-06 · 2026-11-15 · Toujours veiller à la sécurité du code

### D-13 · 2026-11-15 · Choix techniques délégués

Le propriétaire délègue **tous les choix techniques** à l'agent de développement (schéma, nommage, bibliothèques,
architecture). Chaque choix important est consigné (`DECISIONS.md` ou `docs/`) et contrôlé en revue de code. Les
questions de produit restent au propriétaire.

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
