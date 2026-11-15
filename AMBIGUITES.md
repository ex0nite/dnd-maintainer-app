# AMBIGUITES

Points à régler avant ou pendant le développement. Chacun a un identifiant, une question, des options et, quand il y
en a une, une **proposition** (non validée). Une fois tranché : déplacer en `DECISIONS.md` et supprimer d'ici.

Statut : `OUVERT` · `BLOQUANT` (empêche de démarrer la tâche liée dans `TO-DO.md`).

## Produit

### A-02 · BLOQUANT · Commentaires sur les récapitulatifs de séance

- Quel texte constitue le « récapitulatif » : `sessions.summary` (le MJ décide de le publier ?) ou une autre colonne ?
  `sessions.notes` et `sessions.loot` restent-ils réservés au MJ ?
- Un récapitulatif est-il visible dès sa saisie, ou seulement quand le MJ le « publie » ?
- Un joueur peut-il modifier ou supprimer **son** commentaire ? Le MJ peut-il modérer ?
- Les commentaires sont-ils visibles de tous les joueurs de la campagne ?

### A-03 · OUVERT · Étendue de la « consultation » des fiches des autres personnages

Fiche complète (inventaire, historique, notes du personnage) ou vue réduite (nom, classe, niveau, portrait, PV…) ?
Les PNJ sont-ils exclus ? Le champ `characters.notes` est-il une note du MJ sur le personnage ?
Proposition : fiche complète des **PJ** en lecture seule, PNJ cachés, `characters.notes` caché.

### A-04 · OUVERT · Cardinalité joueur / personnage / campagne

Un joueur a-t-il un seul personnage par campagne, ou plusieurs ? Peut-il être dans plusieurs campagnes ?
Un personnage peut-il changer de joueur ?

### A-05 · OUVERT · Qui crée les personnages ?

Le joueur peut-il créer sa fiche lui-même (builder `/campaign/:id/character/new`) ou le MJ crée-t-il les fiches et les
assigne-t-il ? Le joueur peut-il supprimer son personnage ?
Proposition : le MJ crée et assigne ; le joueur édite. Création par le joueur plus tard.

### A-06 · OUVERT · Modifications que le joueur peut faire après finalisation

Avec D-03 (pas de gestion de la triche), le joueur peut tout éditer sur sa fiche. À confirmer : y compris le niveau
et le statut `draft`/`ready` ? Le MJ veut-il valider les montées de niveau ?

## Authentification

### A-07 · BLOQUANT · Mode de connexion des joueurs

Le rapport de sécurité du 2026-06-01 et les specs BDD `features/auth/*` supposent un mot de passe. Une analyse
recommande un lien magique par e-mail, ce qui exige un envoi d'e-mails fiable (SMTP) depuis le QNAP ou un service tiers.
Options : lien magique · mot de passe · OAuth Discord/Google · lien d'invitation + mot de passe.
Les joueurs étant non techniques, un lien magique ou OAuth évite les mots de passe oubliés.

### A-08 · OUVERT · Comment un joueur rejoint une campagne

Lien d'invitation à usage unique généré par le MJ (proposé), ou comptes créés à la main par le MJ ?
L'inscription libre est-elle exclue ?

### A-09 · OUVERT · Les specs BDD `@draft` (`features/auth`, `admin`, `collaboration`)

Elles décrivent un autre modèle (mot de passe, rôle admin, 403 plutôt que 404, joueurs limités à leurs seuls
personnages). Les réécrire selon D-02 ? Garder un rôle « admin » distinct du MJ ?

## Déploiement (QNAP + DynDNS Livebox)

### A-10 · BLOQUANT · Supabase sur le QNAP ou hébergé

Supabase auto-hébergé = une dizaine de conteneurs (Postgres, Auth, REST, Storage, Kong…) à faire tourner et à mettre à
jour sur le QNAP. Alternative : Supabase cloud avec seulement le front sur le QNAP. À vérifier : modèle exact et
architecture CPU du QNAP, RAM disponible, Container Station disponible. Je n'ai pas ces informations.

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

### A-19 · BLOQUANT · Espace de « notes communes »

Décidé (D-11) : un espace de notes communes existe en plus des notes personnelles. Reste à préciser :

- Qui peut **écrire** : tous les joueurs et le MJ, ou le MJ seul avec lecture pour les joueurs ?
- Un joueur peut-il modifier ou supprimer la note d'un autre joueur ? Seulement les siennes ?
- Une seule page partagée par campagne, ou plusieurs notes (titre, catégorie, épinglage comme la table `notes` du MJ) ?
- Sont-elles distinctes de la table `notes` actuelle du MJ ? (Proposition : oui, nouvelle table, pour ne pas
  mélanger avec les notes secrètes du MJ.)
- Édition simultanée : dernier enregistrement gagnant, ou avertissement en cas de conflit ?
