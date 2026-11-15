---
status: draft
stepsCompleted: ['step-01-validate-prerequisites']
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

{{requirements_coverage_map}}

## Epic List

{{epics_list}}
