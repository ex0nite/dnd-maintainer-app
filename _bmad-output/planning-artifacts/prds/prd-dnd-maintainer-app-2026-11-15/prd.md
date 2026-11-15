---
title: 'PRD : Page joueur de dnd-maintainer-app'
status: draft
created: 2026-11-15
updated: 2026-11-15
---

# PRD : Page joueur de dnd-maintainer-app

_Titre de travail._

## 0. But du document

Ce PRD décrit l'ouverture de `dnd-maintainer-app` aux joueurs. Il s'adresse au propriétaire (MJ), aux agents de
développement BMAD et aux flux en aval (architecture, epics et stories). Il s'appuie sur le brief
(`_bmad-output/planning-artifacts/briefs/`) et sur `DECISIONS.md` (D-01 à D-30), dont il ne remet rien en cause.
Le vocabulaire est ancré dans le **Glossaire** (§3) ; les exigences fonctionnelles (FR) sont numérotées globalement ;
les hypothèses sont étiquetées `[ASSUMPTION]` en ligne et indexées en §9. Le « comment » technique vit dans
l'architecture, pas ici.

## 1. Vision

L'application est aujourd'hui un outil de MJ : campagnes, personnages, séances, rencontres, notes. Elle n'a ni compte
ni droits, et toutes les données y sont ouvertes. Ce projet y ajoute une **page joueur** : chaque joueur se connecte,
retrouve sa fiche et ses notes, les édite lui-même, consulte la table et lit les récapitulatifs de séance qu'il
commente. Le MJ garde la main sur tout.

L'enjeu est de passer d'un outil à usage unique à une application **multi-utilisateurs exposée sur Internet** depuis
le QNAP du MJ, où chacun ne voit que ce qui lui revient, sans rien demander d'avance aux joueurs, non techniques.

## 2. Utilisateurs cibles

### 2.1 Jobs To Be Done

- **Joueur** : « Je veux retrouver ma fiche et mes notes sans demander au MJ, et la mettre à jour moi-même. »
- **Joueur** : « Je veux relire ce qui s'est passé à la dernière séance et réagir. »
- **MJ** : « Je veux que mes joueurs soient autonomes, sans qu'ils puissent voir mes secrets ni toucher aux fiches des
  autres. »
- **MJ** : « Je veux gérer les accès de ma table (créer, archiver) sans administrer un système. »

### 2.2 Non-utilisateurs (v1)

- Le grand public : pas d'inscription libre, pas de comptes sans MJ.
- Un second MJ ou un administrateur distinct (D-29).

### 2.3 Parcours clés

Parcours courts (`[ASSUMPTION]` : narrés par l'agent à partir des décisions, à corriger par le propriétaire).

- **UJ-1. Léa se connecte pour la première fois.** Le MJ lui a créé un compte et donné un mot de passe temporaire.
  Léa ouvre l'adresse de l'app sur son téléphone, se connecte, doit choisir son propre mot de passe, puis arrive
  sur sa page : sa fiche et ses notes.
- **UJ-2. Léa corrige sa fiche avant la séance.** Elle monte son personnage de niveau avec le constructeur existant,
  change son équipement, et ajoute une note personnelle sur la quête en cours.
- **UJ-3. Léa relit la dernière séance.** Le MJ vient de publier le récapitulatif. Léa le lit, ajoute un commentaire,
  puis consulte la fiche d'un autre joueur pour préparer un échange.
- **UJ-4. Le MJ gère la table.** Il crée un compte pour un nouveau joueur, lui assigne un personnage, et archive le
  compte d'un joueur qui quitte la table.

## 3. Glossaire

- **MJ** — Maître du jeu. Compte **unique et global** (D-29, D-30) : seul gestionnaire de l'app, il crée les campagnes et
  les comptes, et est `dm` de toutes les campagnes. `[ASSUMPTION]`
- **Joueur** — Utilisateur non MJ d'une campagne. Rôle `player`.
- **Compte** — Identité de connexion, créée par le MJ. Peut être **archivé**.
- **Campagne** — Espace regroupant personnages, séances et notes. Un compte peut appartenir à plusieurs campagnes.
- **Membre** — Compte rattaché à une campagne avec un rôle.
- **Personnage** — Fiche de personnage. Type **PJ** (personnage joueur) ou **PNJ** (personnage non joueur, réservé
  au MJ). Un PJ appartient à un joueur ; un joueur peut en avoir plusieurs par campagne.
- **Fiche** — Données d'un personnage. Contient en particulier l'**historique** (`backstory`) et les **notes de
  fiche** (`notes`), privés.
- **Brouillon / finalisé** — États d'une fiche (`draft` / `ready`).
- **Notes de fiche** — Champ `notes` d'un personnage. Privé : propriétaire et MJ.
- **Notes du MJ** — Contenu secret du MJ : `dm_notes` de la campagne, table `notes` actuelle, notes et butin de
  séance, `combatants` des rencontres. Jamais visibles d'un joueur.
- **Notes personnelles** — Notes d'un joueur dans une campagne (plusieurs possibles). Lisibles par l'auteur et le MJ.
- **Notes communes** — Espace partagé de la campagne : plusieurs notes avec titre, catégorie et épinglage. Table
  **distincte** de la table `notes` actuelle, qui reste réservée au MJ. `[ASSUMPTION]`
- **Récapitulatif** — Résumé d'une séance (`sessions.summary`). Visible des joueurs une fois **publié** par le MJ.
- **Commentaire** — Message d'un membre sur un récapitulatif publié.
- **Archivage** — Mise de côté d'un **compte** et de ses personnages : conservés, non actifs, réactivables par le MJ
  (réactivation `[ASSUMPTION]`). C'est la notion unique ; « désactiver » un personnage seul (FR-12) en est la version
  par personnage.

## 4. Fonctionnalités

### 4.1 Comptes et connexion

**Description :** Le MJ crée les comptes. Un joueur se connecte avec un identifiant et un mot de passe temporaire, puis
choisit le sien. Il n'y a ni inscription libre, ni envoi d'e-mails, ni connexion par un tiers (D-19). Réalise UJ-1, UJ-4.

#### FR-1 : Création d'un compte par le MJ

Le MJ peut créer un compte joueur avec un mot de passe temporaire, et le rattacher à sa campagne.

**Conséquences (testables) :**

- Seul le MJ de la campagne peut créer un compte ; un joueur ou un visiteur reçoit un refus.
- L'action s'exécute dans un **composant serveur** (voir §11) : aucune clé d'administration n'existe dans le navigateur
  ni dans le dépôt.
- Le compte créé n'a accès à aucune donnée tant qu'il n'est pas rattaché à une campagne.
- L'inscription libre est **désactivée** : un appel direct à l'API d'inscription avec la clé publique est refusé.
- Le premier compte MJ est créé hors de l'application, lors de la mise en place (voir §8).

#### FR-2 : Connexion

Un joueur peut se connecter avec son identifiant et son mot de passe.

**Conséquences (testables) :**

- Un visiteur non connecté ne voit aucune donnée de campagne et est redirigé vers la connexion.
- Une erreur de connexion affiche un message générique (sans préciser si l'identifiant existe).
- Après 5 échecs en 15 minutes sur un même identifiant, la connexion est bloquée 15 minutes. `[ASSUMPTION]`
- La limitation se fait par identifiant **et** par adresse du client réelle (transmise de façon fiable par le proxy),
  pour qu'un attaquant ne puisse pas bloquer les 5 joueurs d'un coup.

#### FR-3 : Changement obligatoire du mot de passe temporaire

À la première connexion avec un mot de passe temporaire, le joueur doit en choisir un nouveau avant d'accéder à l'app.

**Conséquences (testables) :**

- Tant que le mot de passe n'est pas changé, aucune page de campagne n'est accessible **et la base refuse toute lecture
  ou écriture de données de campagne** (le marqueur « mot de passe temporaire » n'est pas modifiable par le joueur).
- Le mot de passe temporaire ne fonctionne plus après le changement.
- Un joueur peut changer son mot de passe quand il le souhaite, pas seulement à la première connexion. `[ASSUMPTION]`
- Le nouveau mot de passe respecte une longueur minimale. `[ASSUMPTION : 10 caractères]`

#### FR-4 : Réinitialisation du mot de passe par le MJ

Le MJ peut redonner un mot de passe temporaire à un joueur qui l'a oublié. Il n'y a pas de réinitialisation par e-mail.

**Conséquences (testables) :**

- Seul le MJ peut le faire ; l'ancien mot de passe cesse de fonctionner ; le joueur doit en choisir un nouveau
  (FR-3).
- Les sessions ouvertes du joueur sont révoquées au moment de la réinitialisation.

#### FR-5 : Archivage et réactivation d'un joueur

Le MJ peut archiver le compte d'un joueur, ce qui archive aussi ses personnages, et le réactiver plus tard.

**Conséquences (testables) :**

- Un compte archivé ne peut plus se connecter **et perd l'accès aux données immédiatement** : ses sessions ouvertes
  sont révoquées, sans attendre l'expiration de ses jetons.
- Ses personnages sont conservés mais inactifs.
- Rien n'est supprimé : une réactivation restaure l'accès et les personnages. `[ASSUMPTION]`
- Retirer un joueur d'**une seule** campagne (sans archiver son compte) est possible. `[ASSUMPTION]`
- Les commentaires et notes communes d'un joueur archivé restent visibles. `[ASSUMPTION]`

**Hors périmètre :** inscription libre, e-mails, connexion par un tiers, authentification à deux facteurs.

### 4.2 Appartenance et rôles

**Description :** Un compte peut appartenir à plusieurs campagnes, avec un rôle par campagne. Un joueur ne voit que les
campagnes dont il est membre (D-16). Réalise UJ-1, UJ-4.

#### FR-6 : Appartenance à plusieurs campagnes

Un compte peut être membre de plusieurs campagnes, avec un rôle `player` ou `dm` pour chacune.

**Conséquences (testables) :**

- Un joueur ne voit que les campagnes dont il est membre ; une campagne dont il n'est pas membre est invisible.
- Le MJ est unique et global : il est `dm` de toutes les campagnes ; un joueur n'est jamais MJ. `[ASSUMPTION]`

#### FR-26 : Créer une campagne (MJ)

Le MJ peut créer une campagne et en être automatiquement `dm`. Un joueur ne peut pas en créer.

**Conséquences (testables) :**

- Une campagne créée par le MJ est visible de lui seul, jusqu'à l'ajout de membres.
- Un joueur qui tente de créer une campagne reçoit un refus, même par requête directe.

#### FR-7 : Contrôle d'accès appliqué par la base

Les droits sont appliqués **côté base de données**, pas seulement dans l'interface.

**Conséquences (testables) :**

- Une requête directe à l'API avec le jeton d'un joueur ne renvoie jamais une donnée interdite (fiche d'un autre
  joueur, notes du MJ, rencontres, PNJ, `dm_notes`).
- Un visiteur anonyme n'a accès à aucune table.
- Pour chaque table, les droits de lecture, d'insertion, de modification et de suppression sont couverts par des tests
  automatiques pour chaque rôle : anonyme, joueur propriétaire, autre joueur, non-membre, MJ.

### 4.3 Fiche de personnage du joueur

**Description :** Le joueur consulte et édite ses personnages. Il les crée avec le constructeur existant et monte lui-même
de niveau, sans validation du MJ (D-17, D-03). Le MJ peut tout faire sur toutes les fiches. Réalise UJ-1, UJ-2.

#### FR-8 : Consulter et éditer sa fiche

Le joueur peut consulter et modifier les personnages dont il est propriétaire.

**Conséquences (testables) :**

- Les modifications sont enregistrées et visibles du MJ.
- Un joueur ne peut modifier aucun personnage dont il n'est pas propriétaire, même par requête directe.
- Un joueur ne peut ni changer le propriétaire, ni déplacer le personnage dans une autre campagne, ni changer son
  type (PJ ou PNJ), ni le désactiver : ces champs sont réservés au MJ, même par requête directe.
- Les inventaires (`character_items`) et les niveaux de construction (`character_build_levels`) d'un personnage
  suivent les mêmes droits que la fiche : écriture réservée au propriétaire et au MJ.

#### FR-9 : Créer un personnage

Le joueur peut créer un personnage dans une campagne dont il est membre, avec le constructeur existant.

**Conséquences (testables) :**

- Le personnage est automatiquement rattaché à son créateur ; le type est PJ.
- Un joueur ne peut pas créer de PNJ.
- Le MJ peut aussi créer un personnage et l'assigner à un joueur.

#### FR-10 : Monter de niveau

Le joueur peut monter son personnage de niveau lui-même, sans validation du MJ (D-17).

**Conséquences (testables) :**

- La montée de niveau utilise le constructeur de niveau existant.
- Aucune validation serveur du moteur de règles n'est exigée (D-03).

#### FR-11 : Reconstruire une fiche finalisée

Le joueur peut repasser une fiche finalisée en brouillon pour la reconstruire, sans passer par le MJ (D-18).

**Conséquences (testables) :**

- Un avertissement précise que les choix de la fiche seront à refaire avant de confirmer.
- L'inventaire et l'historique de niveaux sont conservés lors du passage en brouillon. `[ASSUMPTION : à vérifier
contre le comportement actuel du constructeur]`

#### FR-12 : Réassigner, désactiver et supprimer (MJ)

Le MJ peut réassigner un personnage à un autre joueur, le désactiver, et le supprimer. Un joueur ne peut pas supprimer.

**Conséquences (testables) :**

- Seul le MJ peut supprimer un personnage ; un joueur qui le tente reçoit un refus.
- Après réassignation, l'ancien propriétaire perd l'accès en écriture et le nouveau l'obtient.

#### FR-13 : Portrait

Le joueur peut envoyer ou remplacer le portrait de ses propres personnages seulement. `[ASSUMPTION]`

**Conséquences (testables) :**

- Il ne peut ni écrire ni supprimer le portrait d'un personnage dont il n'est pas propriétaire.
- Les fichiers acceptés restent limités à des images de taille bornée (règle existante : 1 Mo).
- Le portrait d'un PNJ n'est pas lisible d'un joueur ; l'adresse du portrait d'un personnage ne peut viser que le
  stockage de l'application (pas d'adresse externe ni de schéma exécutable).
- Un utilisateur non connecté ne peut ni lire, ni écrire, ni supprimer un portrait.

### 4.4 Consultation des autres personnages

**Description :** Un joueur consulte, en lecture seule, les fiches des autres personnages joueurs de sa campagne (D-15).
Réalise UJ-3.

#### FR-14 : Consulter les fiches des autres PJ

Le joueur peut consulter les fiches des PJ de sa campagne, sans les modifier.

**Conséquences (testables) :**

- Toute tentative de modification d'une fiche d'autrui est refusée.
- Les PNJ n'apparaissent pas dans les listes et sont inaccessibles aux joueurs, même par requête directe.
- Un personnage archivé reste consultable en lecture seule. `[ASSUMPTION]`
- Tout le reste de la fiche est visible (caractéristiques, compétences, sorts, inventaire, traits de personnalité,
  idéaux, liens, défauts, apparence, portrait), hors les champs privés de FR-15 (D-15).

#### FR-15 : Champs privés d'une fiche

L'historique (`backstory`) et les notes de fiche (`notes`) ne sont visibles que du propriétaire et du MJ.

**Conséquences (testables) :**

- Ces deux champs sont absents des réponses de l'API pour un autre joueur, y compris avec une requête demandant toutes
  les colonnes.

**Contrainte :** la sécurité de la base filtre les lignes, pas les colonnes. Les champs privés (ici, et ceux des
séances et des campagnes, FR-20) imposent de **changer le modèle de données** : les séparer dans des tables ou des
vues à part. Le choix revient à l'architecture (D-13).

### 4.5 Notes personnelles

**Description :** Chaque joueur a un carnet de notes personnel par campagne. Le MJ peut le lire (D-10). Réalise UJ-2.

#### FR-16 : Écrire et éditer ses notes personnelles

Le joueur peut créer, modifier et supprimer ses propres notes personnelles.

**Conséquences (testables) :**

- Les notes personnelles d'un joueur sont invisibles pour les autres joueurs, même par requête directe.
- Elles sont rattachées à une campagne : un joueur membre de plusieurs campagnes a ses notes par campagne.
- L'écriture est refusée si le joueur n'est pas membre de la campagne visée, même par requête directe.
- Quand un joueur quitte la campagne, ses notes personnelles sont conservées et restent lisibles du MJ. `[ASSUMPTION]`

#### FR-17 : Lecture par le MJ

Le MJ peut lire les notes personnelles de tous les joueurs de sa campagne. Il ne les modifie pas. `[ASSUMPTION]`

**Conséquences (testables) :**

- Le MJ voit les notes personnelles de chaque joueur, avec leur auteur.
- Toute tentative du MJ de modifier une note personnelle est refusée.

### 4.6 Notes communes

**Description :** Un espace de notes partagé par la campagne (D-11, D-12). Réalise UJ-2.

#### FR-18 : Créer et lire des notes communes

Tout membre peut créer une note commune, avec titre, catégorie et épinglage, et lire toutes les notes communes.

**Conséquences (testables) :**

- Une note a un auteur ; les notes épinglées apparaissent en premier.
- Une campagne dont on n'est pas membre est inaccessible ; l'insertion d'une note dans une campagne dont on n'est pas
  membre est refusée, même par requête directe.
- Les notes du MJ (table `notes` actuelle) ne sont jamais visibles dans cet espace.

#### FR-19 : Modifier et supprimer ses notes communes

Un joueur peut modifier et supprimer **ses propres** notes communes, jamais celles d'un autre. Le MJ peut modifier et
supprimer **toutes** les notes.

**Conséquences (testables) :**

- La modification ou suppression de la note d'un autre joueur est refusée, même par requête directe.
- Il n'y a pas de gestion d'édition simultanée (D-12).

### 4.7 Récapitulatifs de séance et commentaires

**Description :** Le MJ écrit le récapitulatif d'une séance et le publie. Les membres le lisent et le commentent
(D-14). Les autres données de séance (notes, butin, expérience) restent réservées au MJ. Réalise UJ-3.

#### FR-20 : Publier un récapitulatif

Le MJ peut publier ou dépublier le récapitulatif d'une séance.

**Conséquences (testables) :**

- Un joueur ne voit pas un récapitulatif non publié, ni son contenu, même par requête directe.
- Dépublier retire l'accès des joueurs. `[ASSUMPTION : les commentaires sont conservés]`
- Les notes, le butin et l'expérience d'une séance ne sont jamais visibles d'un joueur, y compris avec une requête
  demandant toutes les colonnes (même contrainte de modèle de données que FR-15).

#### FR-21 : Lire les récapitulatifs publiés

Les membres peuvent lire les récapitulatifs publiés de leur campagne.

**Conséquences (testables) :**

- Un joueur voit la liste des séances dont le récapitulatif est publié, avec leur titre et leur date, rien de plus.
  `[ASSUMPTION]`
- Un joueur ne peut lire que les récapitulatifs de ses propres campagnes.

#### FR-22 : Commenter un récapitulatif

Tout membre peut commenter un récapitulatif publié. Il peut modifier et supprimer **ses propres** commentaires. Le MJ
peut modifier et supprimer **tous** les commentaires.

**Conséquences (testables) :**

- Les commentaires sont visibles de tous les membres de la campagne.
- Un joueur ne peut ni modifier ni supprimer le commentaire d'un autre, même par requête directe.
- On ne peut pas commenter un récapitulatif non publié, ni celui d'une séance d'une autre campagne, même par requête
  directe.

### 4.8 Interface bilingue et adaptative

**Description :** L'interface s'utilise aussi bien sur téléphone que sur ordinateur, en français ou en anglais
(D-28). Les données de règles restent en anglais dans un premier temps.

#### FR-23 : Choix de la langue

Le joueur peut choisir le français ou l'anglais ; le choix est mémorisé sur son appareil.

**Conséquences (testables) :**

- Chaque texte de l'interface existe dans les deux langues ; une clé manquante est détectée automatiquement.
- La langue par défaut est le français. `[ASSUMPTION]`

#### FR-24 : Interface adaptative

La page joueur s'utilise sur petit écran comme sur grand écran.

**Conséquences (testables) :**

- Les parcours UJ-1 à UJ-3 (connexion, édition de la fiche, notes, lecture et commentaire d'un récapitulatif) se
  réalisent entièrement sur un écran de téléphone.
- Aucun défilement horizontal de page n'est nécessaire. `[ASSUMPTION : largeur de référence 360 px]`

### 4.9 Migration de l'existant et MCP

#### FR-27 : Rattacher les données existantes et garder le MCP fonctionnel

Les campagnes et personnages créés avant l'ouverture sont rattachés au compte MJ, et le serveur MCP du MJ continue de
fonctionner sous le contrôle d'accès strict.

**Conséquences (testables) :**

- Après migration, le MJ retrouve toutes ses campagnes, personnages, séances et notes, sans perte.
- Le MCP se connecte avec un compte MJ dédié (D-22) et ses outils de lecture et d'écriture passent la suite de test de
  bout en bout existante.
- Le nom de joueur en texte libre (`player_name`) des personnages existants est rapproché d'un compte lors de
  l'assignation par le MJ ; aucune conversion automatique. `[ASSUMPTION]`

### 4.10 Interface réservée au MJ

#### FR-25 : Masquer ce qui est réservé au MJ

Un joueur ne voit pas dans l'interface ce qu'il ne peut pas faire (rencontres, notes du MJ, export, réglages de
campagne, gestion des comptes).

**Conséquences (testables) :**

- Les pages réservées au MJ renvoient un refus clair à un joueur.
- Le masquage est une commodité : la protection reste celle de FR-7.

## 5. Non-objectifs

- Gestion de la **triche** : un joueur peut modifier librement les valeurs de son propre personnage (D-03).
- Inscription libre, e-mails, connexion par un tiers, rôle administrateur distinct du MJ (D-19, D-29).
- **Sauvegardes** : écartées pour l'instant, risque assumé (D-23).
- Traduction française des données de règles (sorts, aptitudes) : à faire plus tard par lots (D-28).
- Édition simultanée, temps réel (D-12).
- VPN, application mobile native.

## 6. Périmètre du MVP

### 6.1 Dans le périmètre

Comptes et connexion (FR-1 à FR-5), appartenance, campagnes et contrôle d'accès base (FR-6, FR-7, FR-26), fiche joueur
(FR-8 à FR-13), consultation des autres fiches (FR-14, FR-15), notes personnelles et communes (FR-16 à FR-19),
récapitulatifs et commentaires (FR-20 à FR-22), interface bilingue et adaptative (FR-23, FR-24), migration de
l'existant et MCP (FR-27), interface réservée au MJ (FR-25).

### 6.2 Hors périmètre du MVP

- Traduction des données de règles.
- Sauvegardes (`[NOTE FOR PM]` : à réexaminer avant d'accueillir des données irremplaçables).
- Notifications (aucun envoi d'e-mails).

## 7. Indicateurs de réussite

Hobby/outil interne : indicateurs simples, vérifiables.

**Primaires**

- **SM-1** : un joueur ouvre sa fiche et la modifie sans l'aide du MJ. Cible : les 5 joueurs y parviennent en une
  séance. Valide FR-2, FR-3, FR-8.
- **SM-2** : aucune donnée interdite n'est lisible ou modifiable par un joueur, y compris par requête directe. Cible :
  0 échec sur la suite de tests des droits. Valide FR-7, FR-8, FR-13 à FR-16, FR-19, FR-20, FR-22.
- **SM-3** : le MJ crée un compte et assigne un personnage en moins de 5 minutes. `[ASSUMPTION]` Valide FR-1, FR-9, FR-12.

**Secondaires**

- **SM-4** : l'app tient sur le QNAP avec 5 joueurs connectés : la mémoire disponible du QNAP ne descend pas sous
  500 Mo pendant l'essai de charge. `[ASSUMPTION]` Valide NFR-4.
- **SM-5** : la CI reste verte à chaque fusion dans `main`.

**Contre-indicateurs (à ne pas optimiser)**

- **SM-C1** : nombre de commentaires et de notes. Un indicateur d'usage ne doit pas dicter des fonctions
  d'engagement. Contrebalance SM-1.

## 8. Questions ouvertes

À régler avant ou pendant l'architecture. Les trois premières sont bloquantes pour elle.

1. **Identifiant de connexion** : l'authentification exige un format d'adresse même sans envoi d'e-mails. Le joueur se
   connecte-t-il avec un pseudo traduit en adresse interne, ou avec une vraie adresse e-mail ?
2. **Composant serveur pour les comptes** (FR-1, FR-4, FR-5) : créer, réinitialiser et archiver un compte demande les
   droits d'administration de l'authentification, qui ne peuvent pas être dans le navigateur. Quel petit composant
   serveur (service derrière le proxy ou fonction base de données) ? Cela peut amender D-20, qui écarte les fonctions
   serveur de la pile allégée.
3. **Modèle de données des champs privés** (FR-15, FR-20) : tables ou vues séparées. À trancher par l'architecture
   (D-13).
4. **Premier compte MJ et MJ unique** : le compte MJ est créé hors de l'app lors de la mise en place. Confirmer que le
   MJ est bien unique et global (`[ASSUMPTION]` du glossaire).
5. Dépublier un récapitulatif déjà commenté : les commentaires sont-ils conservés ? (supposé oui)
6. Un joueur archivé : ses contenus (commentaires, notes communes) restent-ils visibles ? (supposé oui)
7. Seuils de verrouillage et longueur minimale du mot de passe (supposés : 5 échecs en 15 min, 10 caractères).
8. Format des notes et commentaires : texte brut ou Markdown nettoyé, et taille maximale (voir NFR-10).

## 9. Index des hypothèses

- §2.3 : parcours UJ-1 à UJ-4 narrés par l'agent.
- Glossaire : MJ unique et global ; notes communes dans une table distincte de `notes` ; réactivation d'un compte.
- FR-2 : seuils de blocage (5 échecs en 15 minutes, 15 minutes).
- FR-3 : longueur minimale 10 caractères ; changement de mot de passe à tout moment.
- FR-5 : réactivation ; retrait d'une seule campagne ; contenus d'un joueur archivé visibles.
- FR-6 : MJ unique et global.
- FR-11 : conservation de l'inventaire et de l'historique de niveaux.
- FR-13 : le joueur gère le portrait de ses personnages.
- FR-14 : un personnage archivé reste consultable.
- FR-16, FR-17 : notes conservées au départ d'un joueur ; le MJ lit sans modifier.
- FR-20, FR-21 : dépublier conserve les commentaires ; liste des séances publiées avec titre et date.
- FR-23, FR-24 : langue par défaut français ; largeur de référence 360 px.
- FR-27 : pas de conversion automatique de `player_name`.
- SM-3, SM-4 : 5 minutes ; 500 Mo de mémoire disponible.
- NFR-2, NFR-3 : valeurs indicatives.

## 10. Exigences non fonctionnelles transversales

- **NFR-1 Sécurité** : la base est l'autorité d'accès (FR-7). Aucune clé d'administration ni secret dans le navigateur,
  le dépôt ou les journaux. Entrées validées, texte saisi rendu en texte échappé, messages d'erreur génériques.
- **NFR-2 Performance** `[ASSUMPTION]` : la fiche s'affiche en moins de 3 secondes sur le réseau local et sur une
  connexion mobile courante ; 5 joueurs connectés simultanément sans dégradation.
- **NFR-3 Disponibilité** `[ASSUMPTION]` : usage de loisir, pas d'engagement de disponibilité ; l'app reste accessible
  entre les séances.
- **NFR-4 Ressources** : l'ensemble (base, authentification, API, stockage, proxy) tient dans la mémoire disponible du
  QNAP, mesurée par un essai de charge (D-20). Repli sur Supabase cloud si ce n'est pas le cas.
- **NFR-5 Exposition** : accès par HTTPS uniquement, derrière le proxy existant, avec certificat valide et en-têtes
  de sécurité ; seuls les ports 80 et 443 sont redirigés (D-21).
- **NFR-5b Installation auto-hébergée** : les secrets et clés de démonstration livrés avec l'outil sont **tous
  régénérés** avant l'ouverture (secret de signature des jetons, clés publique et d'administration, mot de passe de la
  base). Seule la passerelle HTTP (API, authentification, stockage) est exposée par le proxy : ni la base, ni Studio,
  ni le service de métadonnées. Vérifié par un scan des ports et chemins exposés.
- **NFR-6 Confidentialité** : le dépôt est public ; aucune donnée personnelle, adresse ou nom d'hôte du réseau
  du propriétaire n'y figure.
- **NFR-7 Testabilité** : toute règle d'accès est couverte par des tests automatiques exécutés en CI.
- **NFR-8 Accessibilité** : libellés sur les champs, focus visible, contraste conforme aux trois thèmes en clair et
  sombre.
- **NFR-10 Contenu saisi par les utilisateurs** : les notes et commentaires sont du **texte brut** affiché échappé
  (`[ASSUMPTION]`), de taille maximale bornée (par exemple 10 000 caractères), pour éviter l'injection de script
  affichée aux autres joueurs et la saturation du stockage. Une politique de sécurité du contenu (CSP) est déployée
  avec NFR-5.
- **NFR-9 Fiabilité des données** : pas de sauvegarde en v1 (D-23) ; seul le RAID du QNAP protège les données.
  Risque assumé, à rappeler avant la mise en ligne.

## 11. Plateforme et contraintes

- **Plateforme** : application web (SPA), téléphone et ordinateur, servie depuis le QNAP, accessible par Internet.
- **Serveur MCP** : reste local sur le poste du MJ, avec un compte MJ dédié, jamais exposé (D-22).
- **Hébergement** : Supabase allégé auto-hébergé sur le QNAP, avec essai de charge (D-20).
- **Composant serveur** : la gestion des comptes (FR-1, FR-4, FR-5) exige un composant qui détient les droits
  d'administration de l'authentification, hors du navigateur et hors du dépôt. Son choix est une décision
  d'architecture (question ouverte 2) qui peut amender D-20.
- **Contrôle d'accès** : il repose sur la sécurité de la base, qui filtre les lignes et non les colonnes ; les champs
  privés imposent de changer le modèle de données (question ouverte 3).
