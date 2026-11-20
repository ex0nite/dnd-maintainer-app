---
status: final
stepsCompleted:
  ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-dnd-maintainer-app-2026-11-15/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-dnd-maintainer-app-2026-11-15/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/briefs/brief-dnd-maintainer-app-2026-11-15/brief.md
  - DECISIONS.md
---

# dnd-maintainer-app - Epic Breakdown

## Overview

Ce document découpe en epics et stories les exigences du PRD « Page joueur » et les décisions d'architecture (AD-1 à
AD-15). Pas de document UX : les exigences d'interface sont celles de FR-23 à FR-25 et NFR-8.

## Requirements Inventory

### Functional Requirements

FR1: Le MJ crée un compte joueur avec mot de passe temporaire et le rattache à sa campagne ; inscription libre désactivée ; aucune clé d'administration dans le navigateur ni le dépôt.
FR2: Connexion par pseudo et mot de passe ; message d'erreur générique ; visiteur redirigé ; blocage après 5 échecs en 15 min par identifiant et par IP réelle.
FR3: Changement obligatoire du mot de passe temporaire à la première connexion (la base refuse tout accès aux données tant qu'il n'est pas changé) ; changement possible à tout moment ; minimum 10 caractères.
FR4: Le MJ réinitialise un mot de passe (nouveau mot de passe temporaire) ; sessions du joueur révoquées ; pas d'e-mail.
FR5: Le MJ archive un compte (et ses personnages), sessions révoquées immédiatement, et le réactive ; retrait d'une seule campagne possible ; contenus d'un joueur archivé visibles.
FR6: Un compte est membre de plusieurs campagnes avec un rôle par campagne ; un joueur ne voit que ses campagnes ; MJ unique et global.
FR7: Les droits sont appliqués par la base ; tests automatiques par table × opération × identité ; anonyme sans accès.
FR8: Le joueur consulte et édite ses personnages ; propriétaire, campagne, type et activation réservés au MJ ; inventaires et niveaux suivent les mêmes droits.
FR9: Le joueur crée un PJ dans une campagne dont il est membre avec le constructeur existant ; pas de PNJ ; le MJ peut créer et assigner.
FR10: Le joueur monte son personnage de niveau lui-même, avec le constructeur de niveau existant.
FR11: Le joueur repasse une fiche finalisée en brouillon pour la reconstruire, avec avertissement.
FR12: Le MJ réassigne, désactive et supprime un personnage ; un joueur ne supprime pas.
FR13: Le joueur envoie ou remplace le portrait de ses propres personnages ; images ≤ 1 Mo ; portrait de PNJ illisible d'un joueur ; chemin de stockage seulement ; anonyme sans accès.
FR14: Le joueur consulte en lecture seule les PJ de sa campagne ; PNJ invisibles ; personnage archivé consultable.
FR15: `backstory` et `notes` d'une fiche sont visibles du seul propriétaire et du MJ, y compris avec une requête demandant toutes les colonnes.
FR16: Le joueur crée, modifie et supprime ses notes personnelles (par campagne), invisibles des autres joueurs ; écriture refusée hors de ses campagnes.
FR17: Le MJ lit les notes personnelles de tous les joueurs avec leur auteur, sans les modifier.
FR18: Tout membre crée et lit des notes communes (titre, catégorie, épinglage, auteur) ; épinglées en premier ; distinctes des notes du MJ.
FR19: Un joueur modifie et supprime ses notes communes seulement ; le MJ toutes ; pas d'édition simultanée.
FR20: Le MJ publie ou dépublie le récapitulatif d'une séance ; non publié invisible ; notes, butin et expérience jamais visibles d'un joueur.
FR21: Les membres lisent la liste (titre, date) et le contenu des récapitulatifs publiés de leurs campagnes.
FR22: Tout membre commente un récapitulatif publié et gère ses commentaires ; le MJ modère tous ; pas de commentaire sur non publié ou hors campagne.
FR23: Choix français / anglais mémorisé sur l'appareil ; toute clé existe dans les deux langues (détection automatique) ; défaut français.
FR24: Interface adaptative : UJ-1 à UJ-3 réalisables sur un écran de téléphone, sans défilement horizontal (360 px).
FR25: Un joueur ne voit pas dans l'interface ce qui est réservé au MJ ; pages MJ refusées ; masquage = commodité.
FR26: Le MJ crée une campagne et en est `dm` ; un joueur ne peut pas en créer, même par requête directe.
FR27: Les données existantes sont rattachées au compte MJ sans perte ; le MCP fonctionne avec un compte MJ dédié et passe sa suite de bout en bout ; `player_name` non converti automatiquement.
FR28: (après le MVP) Le MJ écrit un récapitulatif en syntaxe Homebrewery (sous-ensemble), rendu de type livre ; rien d actif rendu (script, style, formulaire, image externe) ; brew collé simplifié ; images envoyées dans l'app ; lisible à 360 px, 3 thèmes.
FR29: (après le MVP) Bibliothèque « Règles de la table » par campagne (sorts, objets, sous-classes, règles) en texte enrichi, publiée ou non ; lecture membres si publié, écriture MJ seul.

### NonFunctional Requirements

NFR1 Sécurité : la base fait autorité ; aucun secret dans le navigateur, le dépôt ou les journaux ; entrées validées, texte échappé, erreurs génériques.
NFR2 Performance : fiche affichée en moins de 3 s ; 5 joueurs simultanés.
NFR3 Disponibilité : usage de loisir, pas d'engagement.
NFR4 Ressources : l'ensemble tient dans la mémoire du QNAP, mesuré par essai de charge (≥ 500 Mo libres) ; repli Supabase cloud.
NFR5 Exposition : HTTPS seulement derrière le proxy existant, certificat valide, en-têtes de sécurité, ports 80/443 seuls.
NFR5b Installation auto-hébergée : secrets de démonstration tous régénérés ; seule la passerelle HTTP exposée ; vérifié par scan.
NFR6 Confidentialité : aucune donnée personnelle ni nom d'hôte du réseau du propriétaire dans le dépôt public.
NFR7 Testabilité : toute règle d'accès couverte par des tests automatiques en CI.
NFR8 Accessibilité : libellés, focus visible, contraste conforme aux trois thèmes clair/sombre.
NFR9 Fiabilité : pas de sauvegarde en v1 (risque assumé, à rappeler avant la mise en ligne).
NFR10 Contenu saisi : texte brut échappé, taille bornée (10 000 caractères), CSP déployée.

### Additional Requirements

- (D-32) MVP : récapitulatifs en texte brut ; epic « Contenu riche du MJ » juste après ; le MJ fournit 5 à 10 brews réels hors dépôt pour le corpus.
- Pas de starter template : projet existant (React 19 / Vite 8 / Supabase) ; brownfield.
- AD-1 : RLS sur chaque table dès sa création, aucune policy `USING (true)`, droits `anon` révoqués, vues `security_invoker`.
- AD-2 / AD-15 : service Node `services/account-admin/` (seul détenteur de la clé d'administration ; actions créer/réinitialiser/archiver/réactiver ; validation du jeton, refus `service_role`, relecture du rôle MJ, MJ non ciblable, regex pseudo) ; script d'amorçage du MJ qui appelle le même code.
- AD-3 : `profiles` (un seul `dm`, aucune écriture `authenticated`, trigger qui lève `must_change_password`), `campaign_members` (écriture MJ seul), adresse fictive dérivée du pseudo.
- AD-4 : fonctions `SECURITY DEFINER` durcies + policy RESTRICTIVE `is_dm() OR is_active_user()` sur chaque table et `storage.objects` ; colonnes de liaison immuables pour un non-MJ.
- AD-5 : tables privées `character_private`, `session_dm`, `campaign_dm` ; triggers de création ; vérification du nombre de lignes affectées dans le front et le MCP.
- AD-6 : `owner_user_id`, `archived_with_owner`, trigger de garde BEFORE UPDATE ordonné avant le trigger de slug, slug généré serveur.
- AD-7 : `notes_personal`, `notes_shared`, `session_comments`, `sessions.summary_published`, bornes de longueur.
- AD-8 : bucket portraits privé, policies ouvertes supprimées, URL signées, chemin stocké avec CHECK.
- AD-9 / AD-10 / AD-11 : proxy écrase l'IP réelle, Kong de confiance, pile Supabase allégée (db, auth, rest, storage, Kong) avec essai de charge, secrets régénérés, inscription désactivée, mot de passe 10, JWT 3600 s, changement d'adresse désactivé, verrouillage par pseudo à vérifier (hook).
- AD-12 : `AuthProvider` + garde de routes, hooks seuls appelants de Supabase, `src/lib/admin-api.ts`, i18n.
- AD-13 : migration unique transactionnelle déployée avec front et MCP ; pile non publiée avant ; MCP `signInWithPassword` + `autoRefreshToken`.
- AD-14 : tests pgTAP `supabase test db` en CI (7 identités × opérations × tables ; 0 ligne pour UPDATE/DELETE bloqués, 42501 pour INSERT/WITH CHECK) ; contrôles structurels.
- AD-16 à AD-22 (contenu riche, D-32) : Markdown source unique sans HTML stocké, `*_format` + CHECK 30 000 car. ; `src/lib/brew/` (renderBrew, validateBrew, sanitize DOMPurify liste blanche, `<BrewView>` seul `dangerouslySetInnerHTML`, règle ESLint) ; moteur `marked` isolé + extension `{{classe}}`, repli `marked-hbfm` en Worker ; feuille `brew.css` sur variables de thèmes, polices OFL ; bucket privé `campaign-assets` ; CSP stricte (script de thème sorti de `index.html`, empreinte `sonner`, Report-Only puis bloquant) ; table `campaign_rules`.
- Processus (AGENTS.md / D-04..D-06, D-25, D-26) : chaque story = worktree dédié, revue par agent Opus medium, corrections, mise à jour de la documentation, commit ; fusion locale dans `dev`, PR `dev` → `main` sur le fork ; sécurité surveillée à chaque story.
- Incertitudes à lever à l'installation : adresses `.invalid` acceptées par GoTrue, hook de verrouillage par pseudo, `auth.sessions` pour la révocation, chemin d'administration pour modifier un mot de passe, désactivation du changement d'e-mail, configuration IP réelle Kong/NPM.
- Reports : `.gitattributes` LF, corrections de documentation (CLAUDE.md : policies, ANON_KEY), `src/locales/fr/common.json`.

### UX Design Requirements

Aucun document UX. Les exigences d'interface sont portées par FR23, FR24, FR25 et NFR8.

### FR Coverage Map

FR1: Epic 2 - Création d'un compte joueur par le MJ
FR2: Epic 1 + Epic 2 - Connexion par pseudo (E1) ; verrouillage et limitation (E2)
FR3: Epic 2 - Changement obligatoire du mot de passe temporaire
FR4: Epic 2 - Réinitialisation par le MJ
FR5: Epic 2 - Archivage et réactivation
FR6: Epic 1 - Appartenance à plusieurs campagnes, rôle unique du MJ
FR7: Epic 1 - Contrôle d'accès par la base, socle de tests ; étendu par chaque epic (matrice par table)
FR8: Epic 3 - Consulter et éditer sa fiche
FR9: Epic 3 - Créer un personnage
FR10: Epic 3 - Monter de niveau
FR11: Epic 3 - Reconstruire une fiche finalisée
FR12: Epic 3 - Réassigner, désactiver, supprimer (MJ)
FR13: Epic 3 - Portrait
FR14: Epic 3 - Consulter les fiches des autres PJ
FR15: Epic 1 (séparation `character_private`) + Epic 3 (visibilité) - Champs privés d'une fiche
FR16: Epic 4 - Notes personnelles
FR17: Epic 4 - Lecture des notes personnelles par le MJ
FR18: Epic 4 - Notes communes : créer et lire
FR19: Epic 4 - Notes communes : modifier et supprimer les siennes
FR20: Epic 1 (séparation `session_dm`) + Epic 5 (publication) - Publier un récapitulatif
FR21: Epic 5 - Lire les récapitulatifs publiés
FR22: Epic 5 - Commenter un récapitulatif
FR23: Epic 6 - Choix de la langue
FR24: Epic 6 - Interface adaptative (critère transversal à chaque story d'interface)
FR25: Epic 6 - Masquer ce qui est réservé au MJ
FR26: Epic 1 - Créer une campagne (MJ)
FR27: Epic 1 - Rattacher les données existantes et garder le MCP fonctionnel
FR28: Epic 8 - Récapitulatifs en texte enrichi
FR29: Epic 8 - Bibliothèque « Règles de la table »

NFR1, NFR7 : transversaux, portés par chaque story (revue de sécurité D-06, tests pgTAP AD-14).
NFR4, NFR5, NFR5b, NFR9 : Epic 7. NFR10 : Epic 4 (bornes) et Epic 8 (CSP). NFR8 : Epic 6 et critère de chaque story d'interface.
NFR2, NFR3, NFR6 : critères de recette de l'Epic 7 et revue de chaque story (dépôt public).

## Epic List

### Epic 1 : Une app verrouillée où le MJ retrouve tout

Le MJ se connecte avec son pseudo à une app dont la base refuse tout à un visiteur ; ses campagnes, personnages et séances
existants sont rattachés à son compte, le MCP continue de fonctionner. C'est le socle de sécurité : identité,
fonctions d'accès, policy restrictive, séparation des données privées, tests pgTAP en CI.
**FRs covered:** FR2 (connexion), FR6, FR7, FR15 et FR20 (modèle de données), FR26, FR27
**Notes :** AD-1, AD-3 à AD-5, AD-13 à AD-15. Les fichiers de migration s'ajoutent story par story, mais le basculement
(production) applique l'ensemble d'un coup avant toute exposition (voir écart signalé).

### Epic 2 : Le MJ gère sa table

Le MJ crée les comptes joueurs avec un mot de passe temporaire, les rattache à ses campagnes, réinitialise un mot de
passe, archive et réactive un joueur ; le joueur choisit son mot de passe à la première connexion.
**FRs covered:** FR1, FR2 (verrouillage), FR3, FR4, FR5
**Notes :** AD-2, AD-3, AD-11 ; service `account-admin`. Incertitudes à lever en premier (adresses `.invalid`, hook de
verrouillage, révocation de sessions).

### Epic 3 : Les joueurs tiennent leur fiche de personnage

Un joueur crée, édite, monte de niveau et reconstruit ses personnages, gère leur portrait, et consulte en lecture seule
les fiches des autres PJ ; le MJ réassigne, désactive et supprime.
**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15
**Notes :** AD-6, AD-8 ; garde de colonnes ; portraits en bucket privé et URL signées.

### Epic 4 : Les notes de campagne

Chaque joueur tient un carnet personnel lisible du MJ et participe aux notes communes (titre, catégorie, épinglage) ; il ne
modifie que les siennes ; le MJ modère.
**FRs covered:** FR16, FR17, FR18, FR19
**Notes :** AD-7 ; texte brut, borné (NFR10).

### Epic 5 : Les récapitulatifs de séance

Le MJ publie le récapitulatif d'une séance ; les membres le lisent et le commentent ; le MJ modère.
**FRs covered:** FR20, FR21, FR22
**Notes :** AD-5, AD-7 ; récapitulatifs en texte brut (D-32) ; notes, butin et expérience restent au MJ.

### Epic 6 : Une page joueur bilingue et adaptée au téléphone

Le joueur arrive sur sa page (fiche, notes, séances), choisit français ou anglais, et accomplit tous les parcours
sur un téléphone ; il ne voit rien de ce qui est réservé au MJ.
**FRs covered:** FR23, FR24, FR25
**Notes :** AD-12 ; `src/locales/fr/common.json` ; chaque story des epics 2 à 5 porte déjà ses clés fr/en et son critère
360 px ; cet epic apporte la page d'accueil, le sélecteur de langue et l'audit transversal.

### Epic 7 : L'app est en ligne sur le QNAP, en sécurité

L'ensemble tourne sur le QNAP derrière HTTPS : essai de charge validé (ou repli cloud), secrets régénérés, seule la
passerelle exposée, CSP stricte, bascule des données, rappel de l'absence de sauvegarde.
**FRs covered:** (aucun FR ; porte NFR4, NFR5, NFR5b, NFR9 et les contrôles AD-9 à AD-11, AD-21)
**Notes :** livraison technique indispensable à l'objectif d'exposition. Son premier élément (essai de charge) est à
exécuter **tôt**, en parallèle de l'epic 1, car il peut faire basculer sur Supabase cloud.

### Epic 8 : Le contenu riche du MJ (après le MVP)

Le MJ écrit ses récapitulatifs et ses règles de table avec la syntaxe Homebrewery ; les membres les lisent avec un rendu
de type livre, sans risque pour la sécurité.
**FRs covered:** FR28, FR29
**Notes :** AD-16 à AD-22, D-32 ; démarre par un spike (corpus de brews, bundle, mobile) ; 8 stories proposées par le
brainstorm de design.

## Définition de terminé commune (chaque story)

Chaque story suit le cycle D-04 dans un worktree dédié (D-05) : développement, revue par un agent (Opus, effort moyen),
corrections, mise à jour de la documentation, commit, fusion locale dans `dev` (D-26). Elle ne se termine que si :

- la CI est verte (lint, types, tests unitaires, BDD, build, tests pgTAP) ;
- toute table ou policy touchée a sa matrice de tests opération × identité (AD-14) ;
- la revue de sécurité (D-06) n'a plus de point ouvert, et aucun secret, adresse ou nom d'hôte du réseau du propriétaire
  n'entre dans le dépôt public (NFR6) ;
- tout texte d'interface existe en français et en anglais, et le parcours tient sur 360 px sans défilement horizontal
  (FR23, FR24, NFR8) ;
- toute mutation du front et du MCP vérifie le nombre de lignes affectées (AD-5).

## Epic 1 : Une app verrouillée où le MJ retrouve tout

Le MJ se connecte avec son pseudo à une app dont la base refuse tout à un visiteur ; ses données existantes sont
conservées et le MCP fonctionne. Socle de sécurité de tout le projet.

### Story 1.1 : Banc d'essai SQL et normalisation des fins de ligne

As a développeur de l'app,
I want un banc de tests pgTAP lancé par la CI et des fins de ligne uniformes,
So that chaque règle d'accès soit vérifiée automatiquement avant fusion (AD-14, NFR7).

**Acceptance Criteria:**

**Given** le dépôt avec la CLI Supabase 2.x épinglée
**When** la CI s'exécute
**Then** un job démarre une base locale, applique les migrations et lance `supabase test db`
**And** un test d'exemple prouve qu'un `UPDATE` bloqué par la RLS touche 0 ligne sans erreur et qu'un `INSERT` refusé lève `42501`

**Given** un développeur sous Windows
**When** il clone le dépôt
**Then** un `.gitattributes` impose les fins de ligne LF
**And** prettier, la matrice de couverture et les tests BDD passent en local comme en CI

**Given** les helpers de test
**When** un test veut agir comme un utilisateur donné
**Then** un helper positionne le rôle et les claims pour les 7 identités (anonyme, joueur propriétaire, autre joueur, joueur archivé, joueur au mot de passe temporaire, non-membre, MJ)

### Story 1.2 : Le propriétaire crée le compte MJ hors de l'app

As a propriétaire,
I want créer mon compte MJ avec un script documenté,
So that je puisse me connecter sans route d'amorçage exploitable (AD-15, FR1).

**Acceptance Criteria:**

**Given** une pile Supabase locale
**When** la migration `profiles` est appliquée
**Then** `profiles(user_id, pseudo, role, must_change_password, archived_at)` existe avec un index unique partiel limitant à un seul `dm` et un pseudo unique en minuscules
**And** `authenticated` n'a aucun droit d'écriture sur `profiles` (`REVOKE INSERT, UPDATE, DELETE`)

**Given** le module partagé `services/account-admin/` (fonction de création de compte)
**When** le propriétaire lance le script d'amorçage avec un pseudo et un mot de passe saisis dans son terminal
**Then** le compte d'authentification est créé confirmé avec l'adresse dérivée `<pseudo>@<domaine>.invalid` et sa ligne `profiles` de rôle `dm`
**And** un pseudo hors `^[a-z0-9_-]{3,20}$` est refusé
**And** un second compte `dm` est refusé par l'index unique

**Given** la version installée de l'authentification
**When** le script crée le compte
**Then** l'acceptation d'une adresse en `.invalid` est vérifiée ; si elle est refusée, le domaine fictif de repli est consigné dans l'architecture

**Given** le dépôt
**When** on cherche une clé d'administration ou un mot de passe
**Then** il n'y en a aucun (variables d'environnement uniquement, documentation sans valeur réelle)

### Story 1.3 : Le MJ se connecte avec son pseudo (app et MCP)

As a MJ,
I want me connecter avec mon pseudo et mon mot de passe, depuis l'app comme depuis le MCP,
So that l'app n'affiche rien à un visiteur non connecté et que mon outil MCP reste utilisable (FR2, FR27).

**Acceptance Criteria:**

**Given** un visiteur non connecté
**When** il ouvre une page de l'app
**Then** il est redirigé vers la page de connexion et aucune donnée de campagne n'est chargée

**Given** la page de connexion
**When** le MJ saisit un pseudo et un mot de passe valides
**Then** le pseudo est traduit en adresse dérivée, la session s'ouvre et il arrive sur la liste de ses campagnes

**Given** un pseudo inexistant ou un mot de passe faux
**When** la connexion échoue
**Then** le message est le même dans les deux cas (« identifiants incorrects »)

**Given** un `AuthProvider` et une garde de routes
**When** la session expire ou la déconnexion est demandée
**Then** l'utilisateur revient à la connexion
**And** seul `src/hooks/` appelle Supabase (règle de lint)

**Given** le MCP (`dnd-maintainer-mcp`) démarré avec les identifiants du compte MJ en variables d'environnement
**When** il s'authentifie
**Then** il utilise `signInWithPassword` avec `autoRefreshToken: true` et reste connecté plus d'une heure

**Given** la page de connexion et la page d'accueil
**When** un contrôle automatique s'exécute en CI sur 360 px et sur les 3 thèmes clair/sombre
**Then** aucun défilement horizontal n'apparaît et le contraste respecte le niveau AA
**And** ce contrôle est réutilisé par les stories d'interface suivantes

### Story 1.4 : Campagnes et appartenance sous contrôle strict

As a MJ,
I want créer des campagnes et y rattacher des membres,
So that chacun ne voie que les campagnes dont il est membre (FR6, FR26).

**Acceptance Criteria:**

**Given** la migration d'accès
**When** elle est appliquée
**Then** `is_dm()`, `is_active_user()`, `is_member(campaign_id)` existent en `SECURITY DEFINER STABLE` avec `SET search_path = ''` et `REVOKE EXECUTE ... FROM PUBLIC, anon`
**And** `campaign_members(campaign_id, user_id)` n'accepte d'écriture que du MJ

**Given** les tables `campaigns`, `campaign_members` et `campaign_dm` (les notes du MJ sur la campagne, déplacées ici
depuis `campaigns.dm_notes` : un champ réservé au MJ ne peut pas rester dans une table lisible par les membres)
**When** un joueur actif membre lit `campaigns`
**Then** il ne voit que ses campagnes et ne lit jamais `campaign_dm`
**And** il reçoit un refus (`42501`) en créant une campagne, même par requête directe

**Given** le MJ
**When** il crée une campagne
**Then** il en est `dm` sans figurer dans `campaign_members` et elle n'est visible que de lui jusqu'à l'ajout d'un membre

**Given** chaque table de cette story
**When** la suite pgTAP s'exécute
**Then** la policy `AS RESTRICTIVE FOR ALL TO authenticated USING (is_dm() OR is_active_user())` est présente et la matrice des 7 identités passe

### Story 1.5 : Les données privées quittent les tables lisibles

As a MJ,
I want que l'historique, les notes de fiche et mes notes de séance et de campagne vivent dans des tables à part,
So that la base filtre ce qu'un joueur ne doit jamais lire (FR15, FR20, AD-5).

**Acceptance Criteria:**

**Given** des données existantes dans `characters.backstory`, `characters.notes`, `sessions.notes`, `sessions.loot` et `sessions.experience_awarded` (`campaigns.dm_notes` a déjà rejoint `campaign_dm` en story 1.4)
**When** la migration s'applique
**Then** `character_private` et `session_dm` les reçoivent sans perte et les anciennes colonnes disparaissent
**And** un trigger `AFTER INSERT` crée la ligne privée vide à la création d'un personnage ou d'une séance (celle de `campaign_dm` existe depuis la story 1.4)

**Given** la migration additive `characters.owner_user_id` (nullable, `ON DELETE SET NULL`) et `characters.archived_with_owner`, et la fonction `owns_character(character_id)` (`SECURITY DEFINER STABLE`, `SET search_path = ''`, `REVOKE` explicite)
**When** elle s'applique
**Then** les personnages existants ont un propriétaire nul (l'assignation à un compte se fait par le MJ, story 3.9) et le nom de joueur en texte libre est conservé

**Given** `session_dm` et `campaign_dm`
**When** un non-MJ les lit ou les modifie
**Then** il ne voit aucune ligne et ses écritures touchent 0 ligne
**And** `character_private` n'est lisible que du propriétaire et du MJ (testé pour les 7 identités)

**Given** le front et les types générés
**When** un écran affiche ou édite ces champs
**Then** il lit et écrit les nouvelles tables et vérifie le nombre de lignes affectées
**And** une requête `select=*` d'un joueur sur `characters` ou `sessions` ne renvoie aucun champ privé

**Given** le MCP
**When** ses outils de personnages, séances et campagnes lisent ou écrivent ces champs
**Then** ils utilisent les nouvelles tables et vérifient le nombre de lignes affectées
**And** la suite de test de bout en bout du MCP passe contre la pile locale

### Story 1.6 : Les tables de personnages sont verrouillées

As a MJ,
I want que les personnages, leur inventaire et leurs niveaux soient fermés à tout sauf à moi,
So that aucune policy ouverte ne subsiste sur les fiches (AD-1, AD-4, FR7).

**Acceptance Criteria:**

**Given** les tables `characters`, `character_items` et `character_build_levels`
**When** la migration s'applique
**Then** toutes les policies `USING (true)` sont supprimées, `ENABLE ROW LEVEL SECURITY` est actif, la policy restrictive d'AD-4 est posée et seul le MJ y accède (les accès joueurs arrivent avec l'epic 3)
**And** les droits de `anon` sont révoqués sur ces tables

**Given** la matrice pgTAP
**When** elle s'exécute pour les 7 identités sur ces trois tables
**Then** tous les cas passent

**Given** le MJ connecté
**When** il utilise l'app et le MCP (personnages, inventaire, montée de niveau)
**Then** tout fonctionne comme avant et la suite de test de bout en bout du MCP passe

### Story 1.7 : Le reste du schéma et le stockage sont verrouillés

As a MJ,
I want que les séances, rencontres, notes et le stockage soient fermés à tout sauf à moi,
So that l'app puisse être exposée sans qu'une policy ouverte subsiste (AD-1, AD-4, FR7).

**Acceptance Criteria:**

**Given** les tables `sessions`, `encounters`, `notes` et `storage.objects`
**When** la migration s'applique
**Then** toutes les policies `USING (true)` sont supprimées, `ENABLE ROW LEVEL SECURITY` est actif, la policy restrictive d'AD-4 est posée et seul le MJ y accède (les accès joueurs arrivent avec leurs epics)
**And** les droits de `anon` sont révoqués, y compris par défaut (`ALTER DEFAULT PRIVILEGES`)

**Given** la CI
**When** les contrôles de structure tournent
**Then** ils échouent s'il existe une policy `true`, une table de `public` sans RLS, une table ou `storage.objects` sans la policy restrictive d'AD-4, ou un droit de `anon`
**And** toute vue est `security_invoker = true`

**Given** les quatre policies ouvertes de `storage.objects` et le bucket de portraits
**When** la migration s'applique
**Then** les policies ouvertes sont supprimées et le bucket `character-portraits` devient privé

**Given** le MJ connecté
**When** il utilise l'app existante et le MCP (séances, rencontres, notes, portraits)
**Then** tout fonctionne comme avant et la suite de test de bout en bout du MCP passe

### Story 1.8 : Bascule transactionnelle des données existantes

As a MJ,
I want retrouver toutes mes données après le passage au contrôle d'accès,
So that rien ne soit perdu (FR27, AD-13).

**Acceptance Criteria:**

**Given** une base contenant des campagnes, personnages, séances et notes d'avant l'ouverture
**When** toutes les migrations s'appliquent en une transaction
**Then** le MJ retrouve l'intégralité de ses données, sans perte, et `player_name` reste du texte libre non converti

**Given** la suite de test de bout en bout du MCP
**When** elle s'exécute après la bascule
**Then** elle passe entièrement

**Given** la transaction de bascule
**When** une migration échoue
**Then** rien n'est appliqué (retour à l'état précédent)

## Epic 2 : Le MJ gère sa table

Le MJ crée, réinitialise, archive et réactive les comptes joueurs ; le joueur choisit son mot de passe à sa première
connexion.

### Story 2.1 : Spike : comportements réels de l'authentification installée

As a développeur de l'app,
I want vérifier sur la pile choisie les comportements dont dépend la conception,
So that les stories suivantes reposent sur des faits (AD-2, AD-11).

**Acceptance Criteria:**

**Given** la pile Supabase locale de la version retenue
**When** le spike s'exécute
**Then** il consigne, avec preuve de test : (1) adresses en `.invalid` acceptées ou non, (2) création d'un utilisateur confirmé par l'API d'administration, (3) existence de `auth.sessions` pour révoquer les sessions, (4) chemin d'administration pour changer un mot de passe, (5) désactivation du changement d'adresse par l'utilisateur, (6) disponibilité d'un hook de vérification de mot de passe, (7) inscription libre refusée avec la clé publique

**Given** un résultat qui contredit AD-2 ou AD-11
**When** le spike conclut
**Then** l'architecture et le PRD sont amendés (FR-2 si le hook n'existe pas) et la décision est soumise au propriétaire

### Story 2.2 : Le MJ crée un compte joueur

As a MJ,
I want créer un compte joueur avec un mot de passe temporaire et le rattacher à ma campagne,
So that un joueur puisse se connecter sans e-mail (FR1).

**Acceptance Criteria:**

**Given** le service `account-admin` derrière le proxy (`/admin-api/`)
**When** il reçoit une demande de création
**Then** il valide le jeton par `GET /auth/v1/user`, refuse tout jeton non `authenticated` (dont `service_role`), relit `profiles.role = 'dm'` et valide le pseudo par `^[a-z0-9_-]{3,20}$`
**And** il crée le compte confirmé, la ligne `profiles` (`player`, `must_change_password = true`) et l'appartenance à la campagne

**Given** un joueur, un visiteur, une session révoquée ou un jeton `service_role`
**When** ils appellent le service
**Then** l'appel est refusé

**Given** le MJ dans l'écran « Joueurs »
**When** il crée un compte
**Then** un mot de passe temporaire est généré et affiché une seule fois
**And** le compte n'a accès à aucune donnée tant qu'il n'est pas rattaché

**Given** un appel direct à l'API d'inscription avec la clé publique
**When** il est tenté
**Then** il est refusé (`GOTRUE_DISABLE_SIGNUP`)

**Given** le service
**When** on inspecte le dépôt, le bundle et les journaux
**Then** la clé d'administration n'y figure jamais et le débit est limité

### Story 2.3 : Le joueur choisit son mot de passe à sa première connexion

As a joueur,
I want être obligé de choisir mon mot de passe avant d'entrer,
So that le mot de passe temporaire ne serve qu'une fois (FR3).

**Acceptance Criteria:**

**Given** un joueur avec `must_change_password = true`
**When** il se connecte
**Then** seule la page de changement de mot de passe est accessible
**And** la base refuse toute lecture et écriture de données de campagne (`is_active_user()` faux), mais il lit son propre profil

**Given** le joueur sur la page de changement
**When** il saisit un mot de passe de moins de 10 caractères
**Then** il est refusé avec un message clair ; avec 10 caractères ou plus, il est accepté

**Given** le changement réussi
**When** le trigger `AFTER UPDATE OF encrypted_password ON auth.users` s'exécute
**Then** `must_change_password` passe à `false`, le mot de passe temporaire ne fonctionne plus et le joueur accède à sa page
**And** le joueur ne peut pas modifier lui-même `must_change_password`

**Given** un joueur connecté normalement
**When** il le souhaite
**Then** il peut changer son mot de passe à tout moment

### Story 2.4 : Le MJ réinitialise un mot de passe

As a MJ,
I want redonner un mot de passe temporaire à un joueur qui l'a oublié,
So that il récupère l'accès sans e-mail (FR4).

**Acceptance Criteria:**

**Given** le MJ et un joueur actif
**When** il lance la réinitialisation
**Then** le service change le mot de passe, **puis** repose `must_change_password = true` et révoque les sessions du joueur
**And** le nouveau mot de passe temporaire est affiché une fois

**Given** l'ancien mot de passe
**When** le joueur l'utilise
**Then** il échoue

**Given** une demande visant le compte MJ, ou venant d'un non-MJ
**When** elle atteint le service
**Then** elle est refusée

### Story 2.5 : Le MJ gère les membres, archive et réactive un joueur

As a MJ,
I want voir mes joueurs et leur statut, les ajouter à une campagne, les retirer, archiver un compte qui quitte la table puis le réactiver,
So that rien ne soit perdu et que l'accès soit coupé immédiatement (FR5, FR6, D-30).

**Acceptance Criteria:**

**Given** l'écran « Joueurs » du MJ
**When** il l'ouvre
**Then** il voit chaque joueur avec son statut (actif, mot de passe temporaire, archivé) et ses campagnes

**Given** un joueur existant et une autre campagne du MJ
**When** le MJ l'y ajoute
**Then** le joueur voit cette campagne en plus des siennes (appartenance à plusieurs campagnes)
**And** un joueur ne peut ni s'ajouter lui-même ni ajouter un autre à une campagne

**Given** les colonnes `characters.owner_user_id` et `characters.archived_with_owner` (créées en story 1.5)
**When** le MJ archive un joueur
**Then** le service bannit le compte, supprime ses sessions, pose `archived_at` et désactive ses personnages en marquant `archived_with_owner = true`
**And** le joueur perd l'accès aux données immédiatement, sans attendre l'expiration du jeton (policy restrictive)

**Given** un joueur archivé
**When** il tente de se connecter
**Then** il est refusé ; ses notes communes et commentaires restent visibles des autres

**Given** la réactivation
**When** le MJ la lance
**Then** le bannissement est levé et **seuls** les personnages marqués `archived_with_owner` sont réactivés (un personnage désactivé à la main reste désactivé)

**Given** le MJ
**When** il retire un joueur d'une seule campagne
**Then** le compte reste actif et l'accès à cette campagne seule disparaît

**Given** une demande visant le compte MJ
**When** elle atteint le service
**Then** elle est refusée

### Story 2.6 : Limitation des tentatives de connexion

As a MJ,
I want que les essais de mot de passe soient limités sans bloquer toute la table,
So that un attaquant ne puisse ni deviner un mot de passe ni verrouiller les 5 joueurs (FR2, AD-9, AD-11).

**Acceptance Criteria:**

**Given** le résultat du spike 2.1
**When** un hook de vérification de mot de passe est disponible
**Then** 5 échecs en 15 minutes sur un même pseudo bloquent ce pseudo 15 minutes
**And** sinon, seule la limitation par adresse s'applique et le PRD (FR-2) est amendé avec l'accord du propriétaire

**Given** deux clients d'adresses distinctes derrière le proxy
**When** l'un dépasse la limite
**Then** l'autre n'est pas bloqué (compteurs distincts, en-tête de l'IP réelle écrasé par le proxy)

**Given** un blocage
**When** le joueur se reconnecte après le délai
**Then** la connexion fonctionne et le message d'erreur reste générique

## Epic 3 : Les joueurs tiennent leur fiche de personnage

Un joueur crée, édite, monte de niveau et reconstruit ses personnages, gère leurs portraits et consulte les fiches des
autres PJ en lecture seule ; le MJ réassigne, désactive et supprime.

### Story 3.1 : Un joueur modifie ses personnages, pas ceux des autres

As a joueur,
I want modifier mes personnages et eux seuls,
So that ma fiche soit à jour sans toucher à celle d'un autre (FR8, AD-6).

**Acceptance Criteria:**

**Given** `characters`, `character_items` et `character_build_levels`
**When** les policies de cette story sont appliquées
**Then** le propriétaire (`owner_user_id = auth.uid()`, membre actif) lit et écrit ses personnages, son inventaire et ses niveaux, et le MJ lit et écrit tout
**And** un autre joueur n'écrit rien sur ces lignes (0 ligne affectée), même par requête directe

**Given** un trigger `BEFORE UPDATE` nommé pour s'exécuter avant le trigger de slug
**When** un joueur modifie `owner_user_id`, `campaign_id`, `character_type`, `is_active`, `archived_with_owner`, `slug` ou `previous_slugs`
**Then** la modification est refusée
**And** le trigger ne s'applique qu'à un utilisateur `authenticated` non MJ : le MJ, la clé d'administration et les migrations le contournent (l'archivage de la story 2.5 fonctionne)

**Given** la matrice pgTAP
**When** elle s'exécute pour les 7 identités sur ces trois tables
**Then** tous les cas passent

**Given** un joueur propriétaire de personnages
**When** le MJ l'archive (story 2.5), puis le réactive
**Then** l'archivage et la réactivation réussissent malgré le trigger de garde, et seuls les personnages marqués `archived_with_owner` sont touchés (test de non-régression)
**And** le test échoue si le trigger de garde passe avant le contournement de la clé d'administration ou après le trigger de slug

### Story 3.2 : Le joueur consulte et édite sa fiche dans l'app

As a joueur,
I want ouvrir mes personnages et corriger ma fiche,
So that je n'aie plus besoin du MJ pour la mettre à jour (FR8, SM-1).

**Acceptance Criteria:**

**Given** un joueur connecté, au mot de passe définitif
**When** il arrive sur l'app
**Then** une page d'accueil minimale lui donne accès à « Mes personnages » et expose les emplacements des sections notes et séances (complétée par la story 6.1)
**And** un joueur sans campagne voit un message clair, sans erreur

**Given** un joueur connecté, membre d'une campagne
**When** il ouvre « Mes personnages »
**Then** il voit uniquement les personnages dont il est propriétaire

**Given** sa fiche
**When** il modifie des champs et enregistre
**Then** la modification est enregistrée, visible du MJ, et le front vérifie le nombre de lignes affectées
**And** une écriture refusée par la base affiche une erreur compréhensible, jamais l'erreur brute

**Given** les champs réservés au MJ (propriétaire, campagne, type, activation)
**When** le joueur ouvre sa fiche
**Then** ils ne sont pas modifiables dans l'interface

### Story 3.3 : Le joueur crée un personnage

As a joueur,
I want créer mon personnage avec le constructeur existant,
So that je prépare ma fiche moi-même (FR9).

**Acceptance Criteria:**

**Given** un joueur membre actif d'une campagne
**When** il crée un personnage
**Then** `owner_user_id = auth.uid()`, le type est PJ et le slug est généré par le serveur
**And** une insertion avec un autre propriétaire, un type PNJ, un slug choisi ou une campagne dont il n'est pas membre est refusée (`42501`), même par requête directe

**Given** le MJ
**When** il crée un personnage et l'assigne à un joueur
**Then** le joueur le voit dans « Mes personnages »

**Given** un joueur membre de plusieurs campagnes, avec plusieurs PJ dans une même campagne
**When** il liste ses personnages
**Then** tous apparaissent, groupés par campagne

### Story 3.4 : Le joueur monte son personnage de niveau

As a joueur,
I want monter mon personnage de niveau moi-même,
So that je n'attende pas le MJ (FR10, D-17).

**Acceptance Criteria:**

**Given** un personnage finalisé dont il est propriétaire
**When** il utilise le constructeur de niveau existant
**Then** le niveau, les choix et l'historique de niveaux sont enregistrés (écritures sur `character_build_levels` autorisées au propriétaire)

**Given** un personnage dont il n'est pas propriétaire
**When** il tente la montée de niveau, par l'interface ou par requête directe
**Then** l'action est refusée

**Given** D-03
**When** la montée de niveau s'effectue
**Then** aucune validation serveur du moteur de règles n'est exigée

### Story 3.5 : Le joueur reconstruit une fiche finalisée

As a joueur,
I want repasser ma fiche en brouillon pour la refaire,
So that je corrige mes choix sans passer par le MJ (FR11, D-18).

**Acceptance Criteria:**

**Given** le début de la story (sous-tâche préalable, avant tout code)
**When** le développeur lit le constructeur et le flux de finalisation actuels
**Then** il consigne ce qui est effectivement conservé ou effacé au passage en brouillon (inventaire, historique de niveaux, choix) et les critères ci-dessous sont ajustés en conséquence avant de coder

**Given** une fiche finalisée dont il est propriétaire
**When** il demande la reconstruction
**Then** un avertissement précise que les choix seront à refaire et il doit confirmer

**Given** la confirmation
**When** la fiche passe en brouillon
**Then** l'inventaire et l'historique de niveaux sont conservés (hypothèse à vérifier contre le comportement actuel du constructeur ; écart documenté sinon)
**And** le joueur peut refinaliser

**Given** un autre joueur
**When** il tente le passage en brouillon
**Then** la base le refuse

### Story 3.6 : Historique et notes privés de la fiche

As a joueur,
I want écrire l'historique et les notes de mon personnage sans que les autres joueurs les lisent,
So that je garde mes secrets de personnage (FR15, D-15).

**Acceptance Criteria:**

**Given** `character_private`
**When** le propriétaire ou le MJ la lit ou l'écrit
**Then** l'accès est accordé ; pour un autre joueur, un non-membre, un archivé ou un visiteur, aucune ligne n'est visible et les écritures touchent 0 ligne

**Given** la fiche en édition
**When** le propriétaire modifie `backstory` ou `notes`
**Then** l'écriture va dans `character_private` et le front vérifie le nombre de lignes affectées

**Given** l'API d'un autre joueur
**When** il demande toutes les colonnes d'un personnage
**Then** ces deux champs sont absents de la réponse

### Story 3.7 : Le joueur consulte les fiches des autres PJ

As a joueur,
I want lire les fiches des autres personnages de ma campagne,
So that je prépare mes échanges avec la table (FR14, FR15, D-15).

**Acceptance Criteria:**

**Given** un joueur actif membre d'une campagne
**When** il liste les personnages
**Then** il voit les PJ de sa campagne, jamais les PNJ, même par requête directe

**Given** la fiche d'un autre PJ
**When** il l'ouvre
**Then** il la voit en lecture seule, avec caractéristiques, compétences, sorts, inventaire, traits, apparence et portrait, sans historique ni notes de fiche
**And** toute tentative de modification est refusée

**Given** un personnage archivé
**When** un joueur le consulte
**Then** il reste lisible en lecture seule

**Given** un personnage d'une campagne dont il n'est pas membre
**When** il le demande
**Then** il n'obtient rien

### Story 3.8 : Portraits privés

As a joueur,
I want envoyer ou remplacer le portrait de mes personnages,
So that ma fiche soit reconnaissable sans exposer d'images à Internet (FR13, AD-8).

**Acceptance Criteria:**

**Given** le bucket `character-portraits` privé et des objets nommés `<id-personnage>/<id-aléatoire>.<ext>`
**When** un propriétaire ou le MJ envoie, remplace ou supprime un portrait
**Then** l'opération réussit, dans la limite de 1 Mo et de types d'image
**And** un autre joueur ne peut ni écrire ni supprimer ce portrait

**Given** la lecture
**When** un membre lit le portrait d'un PJ de sa campagne, ou le propriétaire le sien, ou le MJ
**Then** il obtient une URL signée de courte durée ; le portrait d'un PNJ est illisible d'un joueur
**And** un visiteur non connecté ne peut ni lire, ni écrire, ni supprimer

**Given** la fiche
**When** le portrait est enregistré
**Then** elle stocke le chemin de l'objet (jamais une URL) avec un `CHECK` sur le format, et un segment non UUID est rejeté

### Story 3.9 : Le MJ réassigne, désactive et supprime

As a MJ,
I want réassigner, désactiver et supprimer un personnage,
So that je garde la main sur la table (FR12).

**Acceptance Criteria:**

**Given** un personnage
**When** le MJ le réassigne à un autre joueur
**Then** l'ancien propriétaire perd l'accès en écriture et le nouveau l'obtient, immédiatement

**Given** le MJ
**When** il désactive ou supprime un personnage
**Then** l'opération réussit (la suppression retire les lignes dépendantes)
**And** un joueur qui tente la suppression reçoit un refus (0 ligne), même par requête directe

**Given** l'interface
**When** un joueur ouvre sa fiche
**Then** aucune commande de réassignation, désactivation ou suppression n'est affichée

## Epic 4 : Les notes de campagne

Un carnet personnel lisible du MJ et un espace de notes communes, avec modération par le MJ.

### Story 4.1 : Le joueur tient ses notes personnelles

As a joueur,
I want écrire mes propres notes de campagne,
So that je garde mes pistes sans que les autres joueurs les lisent (FR16).

**Acceptance Criteria:**

**Given** `notes_personal(campaign_id, author_id, ...)` avec `author_id` par défaut `auth.uid()`
**When** un joueur membre actif crée, modifie et supprime ses notes
**Then** les opérations réussissent
**And** les notes d'un autre joueur sont invisibles et ses écritures touchent 0 ligne

**Given** une campagne dont il n'est pas membre
**When** il y insère une note
**Then** l'insertion est refusée (`42501`), de même pour un `author_id` falsifié ou un changement de `campaign_id` à la modification

**Given** un texte de plus de 10 000 caractères
**When** il est enregistré
**Then** il est refusé par `CHECK` ; le texte est du texte brut affiché échappé

**Given** un joueur membre de plusieurs campagnes
**When** il ouvre ses notes
**Then** il a un carnet par campagne

### Story 4.2 : Le MJ lit les notes personnelles

As a MJ,
I want lire les notes personnelles de mes joueurs,
So that je suive leurs pistes (FR17, D-10).

**Acceptance Criteria:**

**Given** la policy MJ de `notes_personal`
**When** le MJ lit
**Then** il voit les notes de chaque joueur avec leur auteur

**Given** le MJ
**When** il tente de modifier ou supprimer une note personnelle
**Then** la base le refuse (0 ligne) et l'interface n'offre aucune commande d'édition

**Given** un joueur qui quitte une campagne
**When** il est retiré
**Then** ses notes restent lisibles du MJ

### Story 4.3 : Notes communes : créer et lire

As a joueur,
I want créer et lire les notes communes de ma campagne,
So that la table partage ses informations (FR18, D-11).

**Acceptance Criteria:**

**Given** `notes_shared(campaign_id, author_id, title, category, pinned, body)`
**When** un membre actif crée une note
**Then** elle porte son auteur, son titre, sa catégorie et son épinglage ; les notes épinglées apparaissent en premier

**Given** une campagne dont il n'est pas membre
**When** il lit ou insère
**Then** il ne voit rien et l'insertion est refusée, même par requête directe

**Given** la table `notes` du MJ
**When** un joueur parcourt les notes communes
**Then** aucune note du MJ n'y figure

### Story 4.4 : Notes communes : modifier, supprimer, modérer

As a joueur,
I want corriger ou retirer mes notes communes,
So that elles restent justes, et le MJ modère toutes les notes (FR19, D-12).

**Acceptance Criteria:**

**Given** l'auteur membre actif
**When** il modifie ou supprime sa note
**Then** l'opération réussit, y compris l'épinglage

**Given** un autre joueur
**When** il modifie ou supprime la note d'autrui
**Then** la base refuse (0 ligne), même par requête directe

**Given** le MJ
**When** il modifie ou supprime n'importe quelle note commune
**Then** l'opération réussit (policy MJ distincte)

**Given** deux éditions successives
**When** la seconde écrase la première
**Then** aucune gestion d'édition simultanée n'est exigée (D-12) ; le comportement « dernier enregistrement gagne » est documenté

## Epic 5 : Les récapitulatifs de séance

Le MJ publie le récapitulatif d'une séance ; les membres le lisent et le commentent ; le MJ modère.

### Story 5.1 : Le MJ publie ou dépublie un récapitulatif

As a MJ,
I want publier le récapitulatif d'une séance quand il est prêt,
So that les joueurs ne lisent que ce que j'ai décidé (FR20, D-14).

**Acceptance Criteria:**

**Given** `sessions.summary_published` (écriture MJ seul)
**When** le MJ le publie
**Then** les membres actifs de la campagne peuvent lire titre, date et récapitulatif de cette séance

**Given** un récapitulatif non publié
**When** un joueur le lit, par l'interface ou par requête directe
**Then** il n'obtient ni la ligne ni le contenu

**Given** une requête `select=*` d'un joueur sur `sessions`
**When** elle s'exécute
**Then** aucune note, butin ni expérience n'est renvoyé (ils vivent dans `session_dm`, MJ seul)

**Given** le MJ qui dépublie
**When** l'accès des joueurs est retiré
**Then** les commentaires existants sont conservés

### Story 5.2 : Les joueurs lisent les récapitulatifs publiés

As a joueur,
I want relire ce qui s'est passé aux séances précédentes,
So that je retrouve le fil de la campagne (FR21, UJ-3).

**Acceptance Criteria:**

**Given** des séances dont certaines publiées
**When** un joueur ouvre « Séances »
**Then** il voit la liste des séances publiées de ses campagnes, avec titre et date, rien de plus

**Given** une séance publiée
**When** il l'ouvre
**Then** le récapitulatif s'affiche en texte brut échappé, lisible sur 360 px

**Given** une séance d'une autre campagne
**When** il la demande
**Then** il n'obtient rien

### Story 5.3 : Les membres commentent un récapitulatif

As a joueur,
I want réagir à un récapitulatif et gérer mes commentaires,
So that la table échange après la séance (FR22, D-14).

**Acceptance Criteria:**

**Given** `session_comments(campaign_id, session_id, author_id, body)`
**When** un membre actif commente un récapitulatif publié de sa campagne
**Then** le commentaire est visible de tous les membres

**Given** un récapitulatif non publié ou une séance d'une autre campagne
**When** il tente de commenter, même par requête directe
**Then** l'insertion est refusée

**Given** l'auteur
**When** il modifie ou supprime son commentaire
**Then** l'opération réussit ; sur le commentaire d'autrui, elle touche 0 ligne

### Story 5.4 : Le MJ modère les commentaires

As a MJ,
I want modifier ou supprimer n'importe quel commentaire,
So that je garde un espace sain (FR22).

**Acceptance Criteria:**

**Given** la policy MJ de `session_comments`
**When** le MJ modifie ou supprime un commentaire
**Then** l'opération réussit

**Given** un commentaire d'un joueur archivé
**When** les membres consultent le récapitulatif
**Then** il reste visible

**Given** la matrice pgTAP
**When** elle s'exécute pour les 7 identités
**Then** tous les cas passent

## Epic 6 : Une page joueur bilingue et adaptée au téléphone

### Story 6.1 : La page d'accueil du joueur

As a joueur,
I want arriver sur une page qui réunit ma fiche, mes notes et les séances,
So that je retrouve tout sans chercher (UJ-1, UJ-2, UJ-3).

**Acceptance Criteria:**

**Given** un joueur connecté dont le mot de passe est définitif
**When** il arrive sur l'app
**Then** la page d'accueil minimale posée en story 3.2 est complétée : elle liste ses campagnes et, pour la campagne choisie, ses personnages, ses notes et les séances publiées
**And** un joueur sans campagne voit un message clair, sans erreur

**Given** un joueur membre de plusieurs campagnes
**When** il change de campagne
**Then** le contenu affiché change en conséquence

### Story 6.2 : Choix de la langue français / anglais

As a joueur,
I want choisir ma langue,
So that l'interface soit dans ma langue (FR23, D-28).

**Acceptance Criteria:**

**Given** un nouvel appareil
**When** l'app s'ouvre
**Then** la langue par défaut est le français

**Given** le sélecteur de langue
**When** le joueur choisit l'anglais
**Then** l'interface change et le choix est mémorisé sur l'appareil

**Given** `src/locales/fr/common.json` et l'anglais
**When** la CI s'exécute
**Then** une clé présente dans une langue et absente de l'autre fait échouer un test
**And** les données de règles restent en anglais

### Story 6.3 : Audit mobile et accessibilité des parcours joueur

As a joueur sur téléphone,
I want accomplir mes parcours sans zoom ni défilement horizontal,
So that l'app soit utilisable à la table (FR24, NFR8).

**Acceptance Criteria:**

**Given** une largeur de 360 px
**When** un test automatique parcourt connexion, changement de mot de passe, édition de fiche, notes, lecture et commentaire d'un récapitulatif
**Then** chaque parcours se termine et aucune page ne défile horizontalement

**Given** les trois thèmes en clair et sombre
**When** l'audit de contraste s'exécute
**Then** les pages joueur respectent le niveau AA
**And** les champs ont des libellés et le focus est visible

### Story 6.4 : Ce qui est réservé au MJ reste hors de vue

As a joueur,
I want ne voir que ce que je peux faire,
So that l'interface ne me propose rien d'interdit (FR25).

**Acceptance Criteria:**

**Given** un joueur connecté
**When** il parcourt l'app
**Then** les rencontres, notes du MJ, export, réglages de campagne et gestion des comptes n'apparaissent pas dans les menus

**Given** l'adresse d'une page réservée au MJ saisie à la main
**When** un joueur l'ouvre
**Then** il reçoit un refus clair
**And** la protection réelle reste celle de la base (FR-7) : une requête directe est refusée

## Epic 7 : L'app est en ligne sur le QNAP, en sécurité

### Story 7.1 : Essai de charge de la pile allégée

As a propriétaire,
I want savoir si la pile Supabase allégée tient sur mon QNAP,
So that je choisisse l'auto-hébergement ou le repli cloud en connaissance de cause (NFR4, D-20, SM-4).

**Acceptance Criteria:**

**Given** la pile (base, authentification, PostgREST, stockage, passerelle) sur le QNAP, hors Internet, sans `account-admin` : cette première mesure est lancée tôt, en parallèle de l'epic 1
**When** 5 utilisateurs simulés se connectent, lisent et écrivent pendant 30 minutes
**Then** la mémoire disponible du QNAP ne descend pas sous 500 Mo et les autres services (proxy, etc.) restent sains

**Given** le service `account-admin` (disponible après la story 2.2)
**When** il est ajouté à la pile et la mesure est refaite
**Then** son empreinte mémoire est consignée et le seuil de 500 Mo reste respecté

**Given** le résultat
**When** il est inférieur au seuil
**Then** la décision de repli sur Supabase cloud est soumise au propriétaire et l'architecture amendée

**Given** le rapport
**When** il est écrit dans le dépôt
**Then** il ne contient ni adresse, ni nom d'hôte du réseau

### Story 7.2 : Installation reproductible et secrets régénérés

As a propriétaire,
I want installer la pile avec une procédure documentée,
So that aucune clé de démonstration ne subsiste (NFR5b, AD-10).

**Acceptance Criteria:**

**Given** un `docker-compose` épinglé dérivé de la version officielle retenue
**When** la procédure est suivie
**Then** seuls les services de la liste sont démarrés (ni Studio, ni temps réel, ni métadonnées, ni analytics, ni vector, ni edge)
**And** le secret de signature des jetons, les clés publique et d'administration, le mot de passe de la base et les clés d'`account-admin` sont tous régénérés, hors dépôt

**Given** un script de vérification
**When** il s'exécute
**Then** il échoue si une valeur de démonstration connue est détectée

### Story 7.3 : Exposition en HTTPS et vérification réseau

As a propriétaire,
I want publier l'app derrière le proxy existant,
So that les joueurs y accèdent depuis Internet sans exposer le reste (NFR5, AD-9, D-21).

**Acceptance Criteria:**

**Given** le proxy existant
**When** le site est publié
**Then** il sert le site statique, `/auth/v1`, `/rest/v1`, `/storage/v1` et `/admin-api/` en HTTPS avec certificat valide, HSTS, `nosniff` et `frame-ancestors 'none'`
**And** seuls les ports 80 et 443 sont ouverts

**Given** un scan depuis l'extérieur
**When** il vise la base, Studio et le service de métadonnées
**Then** aucun n'est joignable

**Given** l'en-tête de l'IP réelle
**When** deux clients distincts se connectent
**Then** leurs compteurs de limitation sont distincts et un en-tête forgé est écrasé

### Story 7.4 : Politique de sécurité du contenu stricte

As a propriétaire,
I want une CSP qui bloque tout script ou style non prévu,
So that une faille d'injection n'ait aucun effet (NFR10, AD-21).

**Acceptance Criteria:**

**Given** `index.html`
**When** la story est terminée
**Then** le script de thème est un fichier statique (ou une empreinte) et la CSP d'AD-21 est servie sans `unsafe-inline`

**Given** la mise en service
**When** la CSP est d'abord en `Report-Only`
**Then** les parcours UJ-1 à UJ-3 s'exécutent sans violation, y compris la balise de style injectée par `sonner` (empreinte vérifiée)
**And** elle passe ensuite en mode bloquant

**Given** une mise à jour de `sonner`
**When** l'empreinte change
**Then** un test le signale

### Story 7.5 : Bascule vers la production

As a propriétaire,
I want déployer base, front et MCP ensemble,
So that l'app ne soit jamais ouverte avant d'être verrouillée (AD-13, NFR9).

**Acceptance Criteria:**

**Given** la pile prête et non publiée
**When** les migrations s'appliquent en une transaction puis le front est publié
**Then** l'exposition (story 7.3) n'est activée qu'après la réussite complète

**Given** le compte MJ créé hors de l'app (story 1.2)
**When** le MCP se reconnecte
**Then** ses outils fonctionnent contre la production

**Given** la documentation
**When** elle est mise à jour
**Then** elle rappelle qu'il n'y a pas de sauvegarde (D-23) et que seul le RAID protège les données, avec confirmation du propriétaire avant l'ouverture

### Story 7.6 : Recette avec les cinq joueurs

As a propriétaire,
I want vérifier les parcours réels avec ma table,
So that les indicateurs de réussite soient mesurés (SM-1 à SM-5).

**Acceptance Criteria:**

**Given** les 5 comptes créés par le MJ
**When** chaque joueur se connecte, change son mot de passe, ouvre et modifie sa fiche sans aide
**Then** SM-1 est atteint

**Given** la suite pgTAP complète
**When** elle s'exécute en CI
**Then** SM-2 est atteint (0 échec)

**Given** la création d'un compte et l'assignation d'un personnage
**When** le MJ les réalise chronomètre en main
**Then** SM-3 est atteint (moins de 5 minutes)

**Given** la charge réelle
**When** 5 joueurs sont connectés
**Then** SM-4 est confirmé et la CI sur `main` est verte (SM-5)

## Epic 8 : Le contenu riche du MJ (après le MVP)

### Story 8.1 : Spike et corpus de brews

As a développeur de l'app,
I want mesurer le moteur et le corpus réel avant de m'engager,
So that le choix du moteur repose sur des mesures (AD-18, D-32).

**Acceptance Criteria:**

**Given** 5 à 10 brews réels fournis par le MJ, conservés hors du dépôt, et un corpus de payloads malveillants
**When** le spike s'exécute
**Then** il consigne la taille du bundle (`vite build`) pour le moteur maison et pour `marked-hbfm`, les temps de rendu et d'assainissement sur un téléphone d'entrée de gamme, et le taux de compatibilité du corpus

**Given** le résultat
**When** la compatibilité est inacceptable
**Then** le repli d'AD-18 est retenu et la décision consignée

### Story 8.2 : Moteur de rendu et assainisseur

As a MJ,
I want que mon texte enrichi soit rendu sans jamais exécuter de code,
So that l'app reste sûre sur Internet (AD-17, AD-18).

**Acceptance Criteria:**

**Given** `src/lib/brew/` avec `renderBrew`, `validateBrew` et la configuration DOMPurify épinglée
**When** le corpus de payloads s'exécute en CI (script, `onerror`, attributs d'événement, `{{ style }}`, image externe, `javascript:`, formulaire, `position: fixed`)
**Then** aucun élément actif ne survit à l'assainissement

**Given** une instance `marked` locale
**When** le moteur s'initialise
**Then** l'instance globale de `marked` n'est pas modifiée et le moteur se charge à la demande

**Given** la règle ESLint `react/no-danger`
**When** le code est analysé
**Then** seule `<BrewView>` peut utiliser `dangerouslySetInnerHTML`

**Given** un texte de la taille maximale
**When** il est rendu
**Then** le délai reste borné (repli sur texte échappé au-delà)

### Story 8.3 : Composant de lecture « livre »

As a joueur,
I want lire un texte enrichi avec un rendu de type livre,
So that les récapitulatifs et règles soient agréables à lire (AD-19, FR24).

**Acceptance Criteria:**

**Given** `<BrewView>` et `brew.css` portée par `.brew`
**When** un texte est affiché sur les 3 thèmes en clair et sombre
**Then** le contraste respecte le niveau AA et seules les variables des thèmes sont utilisées

**Given** un écran de 360 px
**When** une page est affichée en mode lecture
**Then** il n'y a aucun défilement horizontal de page ; les tableaux larges défilent dans leur conteneur

**Given** les polices
**When** elles sont ajoutées
**Then** elles sont sous licence OFL, auto-hébergées et déclarées dans `THIRD-PARTY-NOTICES.md` ; rien de Homebrewery n'est copié

### Story 8.4 : Récapitulatifs en texte enrichi

As a MJ,
I want écrire mes récapitulatifs en syntaxe Homebrewery avec aperçu,
So that mes comptes rendus ressemblent à un livre (FR28).

**Acceptance Criteria:**

**Given** `sessions.summary_format` (`plain` | `brew`, défaut `plain`) avec `CHECK` de longueur de 30 000 caractères
**When** le MJ choisit `brew`
**Then** l'éditeur affiche deux volets avec aperçu à 360 px et les avertissements de `validateBrew`

**Given** un joueur
**When** il lit un récapitulatif `brew` publié
**Then** il le voit rendu et assaini ; un récapitulatif `plain` reste affiché en texte échappé

**Given** le MCP
**When** il écrit un récapitulatif
**Then** il accepte un paramètre `format` et son test de bout en bout passe
**And** aucun HTML n'est jamais stocké en base

### Story 8.5 : Images de campagne

As a MJ,
I want illustrer mes textes avec des images envoyées dans l'app,
So that les joueurs voient mes cartes et portraits sans fuite vers l'extérieur (AD-20).

**Acceptance Criteria:**

**Given** le bucket privé `campaign-assets` et des objets `<campaign_id>/<uuid>.<ext>` (PNG, JPEG, WebP, 2 Mo)
**When** le MJ envoie ou supprime une image
**Then** l'opération réussit ; un joueur ne peut ni écrire ni supprimer

**Given** un membre de la campagne
**When** il lit une image de sa campagne
**Then** il obtient une URL signée courte ; il ne lit rien d'une autre campagne

**Given** le texte
**When** il référence `asset:<uuid>`
**Then** `<BrewView>` résout la référence après assainissement ; une URL d'image externe n'est jamais rendue

**Given** la matrice pgTAP
**When** elle s'exécute
**Then** les 7 identités passent sur ce bucket

### Story 8.6 : Bibliothèque « Règles de la table »

As a MJ,
I want tenir les mécaniques homebrew de ma campagne,
So that mes joueurs les consultent au même endroit (FR29, AD-22).

**Acceptance Criteria:**

**Given** `campaign_rules(id, campaign_id, kind, title, body, body_format, published, sort_order, ...)`
**When** le MJ crée, modifie, publie et supprime des éléments
**Then** les opérations réussissent (sort, objet, sous-classe, règle, autre)

**Given** un joueur membre actif
**When** il liste la bibliothèque
**Then** il ne voit que les éléments publiés de sa campagne, rendus en `brew` ou en texte
**And** un élément non publié est invisible, même par requête directe, et ses écritures sont refusées

**Given** la matrice pgTAP
**When** elle s'exécute
**Then** les 7 identités passent

### Story 8.7 : Mode page et impression

As a joueur,
I want afficher un texte en pages et l'imprimer,
So that j'aie le rendu d'un livre à la table (AD-19).

**Acceptance Criteria:**

**Given** un écran d'au moins 768 px
**When** le joueur active le mode page
**Then** le texte s'affiche en colonnes avec habillage parchemin, et le choix est mémorisé par appareil

**Given** l'impression
**When** le joueur imprime
**Then** `@media print` rend les pages sans éléments d'interface

**Given** un écran étroit
**When** le mode page est demandé
**Then** le mode lecture reste appliqué
