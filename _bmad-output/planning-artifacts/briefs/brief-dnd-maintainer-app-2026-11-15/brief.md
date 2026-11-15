---
title: "Product Brief : Page joueur de dnd-maintainer-app"
status: draft
created: 2026-11-15
updated: 2026-11-15
---

# Product Brief : Page joueur de dnd-maintainer-app

## Résumé

`dnd-maintainer-app` est un gestionnaire de campagnes D&D 5.5e (Manuel des joueurs 2024) : campagnes, personnages,
séances, rencontres et notes. Aujourd'hui il ne sert qu'au maître du jeu (MJ), sur une base locale, sans compte ni
droits : tout est lisible et modifiable par quiconque y accède.

Ce projet l'ouvre aux **joueurs**. Chaque joueur se connecte à l'app, publiée sur Internet depuis le QNAP du MJ, et y
retrouve **sa fiche de personnage** et **ses notes de campagne**, qu'il édite lui-même. Il consulte les fiches des
autres personnages, lit le récapitulatif des séances publié par le MJ et le commente. Le MJ garde la main sur tout.

L'enjeu n'est pas seulement une nouvelle page : c'est de passer d'un outil à usage unique à une application multi-
utilisateurs **exposée sur Internet**, où chacun ne voit que ce qui lui revient.

## Le problème

[ASSUMPTION] Le MJ tient seul les fiches, les notes et les récapitulatifs. Les joueurs n'ont pas d'accès direct : ils
demandent leur fiche au MJ, tiennent leurs notes sur leur côté, et le récapitulatif de séance se perd entre deux
parties. Chaque mise à jour passe par le MJ.

Rien ne permet aujourd'hui d'ouvrir l'app tel quel : toutes les règles d'accès de la base sont ouvertes
(`USING (true)`), et la clé publique suffit à tout lire, modifier et supprimer, notes secrètes du MJ comprises.

## La solution

Une page joueur, derrière une connexion :

- **Fiche de personnage** : le joueur consulte et édite la sienne. Il peut créer ses personnages avec le constructeur
  existant, monter lui-même de niveau, et reconstruire une fiche finalisée.
- **Notes de campagne** : un carnet **personnel** par joueur (lisible par le MJ) et un espace de **notes communes**
  (titre, catégorie, épinglage), où chacun écrit mais ne modifie que les siennes.
- **Autres personnages** : consultation en lecture seule des fiches des autres joueurs, sans leur historique ni leurs
  notes personnelles. Les PNJ restent cachés.
- **Récapitulatif des séances** : visible une fois **publié par le MJ**, avec des commentaires que chacun écrit,
  modifie et supprime pour lui-même. Le MJ modère.

Les comptes sont **créés par le MJ** avec un mot de passe temporaire : pas d'inscription libre, pas d'e-mails.

## Ce qui rend ce projet différent

Honnêtement, il n'y a pas de rempart technique : des outils de fiches D&D en ligne existent déjà. L'intérêt est ailleurs :

- il s'appuie sur une base de règles 2024 déjà construite (constructeur de personnage, montée de niveau) ;
- il est **hébergé chez le MJ**, sous son contrôle, sans abonnement ;
- il est **taillé pour une table précise**, avec des joueurs non techniques.

## Pour qui

- **Le MJ** (utilisateur principal, seul gestionnaire) : crée les comptes, assigne les personnages, publie les
  récapitulatifs, garde l'accès complet. Il pilote aussi l'app depuis un serveur MCP local.
- **Les joueurs** : profil **non technique**. Ils veulent retrouver leur fiche et leurs notes sans aide, depuis
  [ASSUMPTION] un téléphone ou un ordinateur, en français.

## Critères de réussite

[ASSUMPTION] Aucun indicateur chiffré n'a été fixé. Propositions, à corriger :

- Un joueur ouvre sa fiche et la modifie **sans l'aide du MJ**.
- Aucun joueur ne peut lire ou modifier les données d'un autre joueur ni les notes du MJ, **même par une requête
  directe à l'API** (vérifié par des tests automatiques de la base).
- Le MJ crée un compte joueur et lui assigne un personnage en quelques minutes.
- L'app tient sur le QNAP (mémoire mesurée) et la CI reste verte.

## Périmètre

**Dans la première version** : connexion (comptes créés par le MJ), fiche du joueur, notes personnelles et communes,
consultation des autres fiches, récapitulatifs publiés et commentés, interface en français et en anglais,
exposition sur Internet derrière HTTPS.

**Hors périmètre** :

- la **triche** n'est pas gérée : un joueur peut modifier librement les valeurs de son propre personnage ;
- inscription libre, connexion par un tiers (Discord, Google), envoi d'e-mails ;
- rôle administrateur distinct du MJ ;
- **sauvegardes** : écartées pour l'instant (risque assumé, seul le RAID du QNAP protège les données) ;
- traduction française des données de règles (sorts, aptitudes), à faire plus tard par lots ;
- VPN, application mobile native.

## Contraintes

- Hébergement sur un **QNAP** (x86, environ 4 Go de RAM, déjà chargé) : Supabase **allégé** auto-hébergé, validé par un
  **essai de charge** avant de s'engager, avec repli possible sur Supabase cloud.
- Exposition sur Internet par le DynDNS de la Livebox, derrière `nginx-proxy-manager` déjà en place.
- Dépôt **public** : aucune donnée personnelle ou propre au réseau dans le code ou la documentation.

## Vision

Si la table l'adopte, l'app devient son espace de campagne partagé : fiches, notes, récapitulatifs, puis les données
de règles traduites en français. D'autres tables pourraient l'utiliser, le modèle (un compte, plusieurs campagnes)
le permet déjà.

## Questions ouvertes

- [ASSUMPTION] Nombre de joueurs et d'appareils utilisés : le dimensionnement du QNAP en dépend.
- Que se passe-t-il quand un joueur quitte la table ? (désactivation du compte, devenir de ses personnages)
- Un MJ unique suffit-il à la gestion des comptes à long terme ?
