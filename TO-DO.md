# TO-DO

Tâches à faire, par ordre de priorité. Cocher une tâche une fois commitée ; ajouter la référence du commit.
Chaque tâche suit le cycle de `DECISIONS.md` D-04 et se fait dans son propre worktree (D-05).
`⛔ A-NN` = dépend d'une ambiguïté de `AMBIGUITES.md` : la trancher avant de démarrer la tâche (ou la reprendre
si la réponse change le besoin). Les points marqués `BLOQUANT` là-bas bloquent toute la phase.

## 0. Mise en place (en cours)

- [x] Créer la branche `dev` sur le fork à partir de `main` (D-25), app et MCP
- [ ] Fusionner `ci-setup` et `chore/bmad-setup` dans `dev` (D-26 : fusion locale, `main` reste réservé au stable)
- [x] Déplacer les worktrees existants dans le dossier commun `.worktrees` (D-25)

- [x] CI GitHub Actions du dépôt MCP
- [x] CI GitHub Actions du dépôt app (branche `ci-setup`, non fusionnée)
- [x] Installer BMAD dans le dépôt app
- [x] Créer `TO-DO.md`, `CONVENTION-CODE.md`, `AGENTS.md`, `DECISIONS.md`, `AMBIGUITES.md`
- [ ] Vérifier le résultat de la CI app après ajout des variables `VITE_SUPABASE_*` (commit `94075ee`)
- [ ] Fusionner `ci-setup` et `chore/bmad-setup` dans `main` du fork
- [x] Corriger les 6 erreurs de lint `no-console` (D-27, dans `dev`)
- [ ] Corriger le format (4 fichiers signalés par la CI) et les 42 scénarios BDD qui échouent encore en CI ; vérifier `npm run format:check` sur Linux (le local Windows signale 305 fichiers à cause des CRLF) ; ajouter un
      `.gitattributes` (`* text=auto eol=lf`) si besoin
- [ ] Corriger la doc : `CLAUDE.md` dit « RLS sans policy » alors que les 7 policies sont `USING (true)` (et 4 policies
      publiques sur `storage.objects`), et « ESLint 9 » alors que `package.json` est en ESLint 10 ; le nom de
      variable est `VITE_SUPABASE_PUBLISHABLE_KEY` dans le code mais `VITE_SUPABASE_ANON_KEY` dans `CLAUDE.md`, `src/locales/en/common.json`,
      `README.md`, `SETUP.md`

## 1. Cadrage avec BMAD

- [x] Trancher les ambiguïtés bloquantes (toutes réglées)
- [ ] Brief produit puis PRD de la « page joueur » (`bmad-product-brief`, `bmad-prd`)
- [ ] Architecture (auth, RLS, hébergement QNAP) (`bmad-architecture`)
- [ ] Découpage en epics et stories (`bmad-create-epics-and-stories`)
- [ ] Contexte projet pour les agents (`bmad-project-context`)

## 2. Identité et accès (fondation, avant toute exposition)

- [ ] Migration : `profiles`, `campaign_members` (rôle `dm`/`player`), `characters.owner_user_id` (D-16 : plusieurs personnages par joueur et par campagne),
      fonctions d'aide `SECURITY DEFINER`
- [ ] Rattacher les données existantes à un compte MJ (backfill) avant de fermer les policies
- [ ] Authentification dans le front : `AuthProvider`, page de connexion, garde de routes, déconnexion (D-19 : connexion e-mail + mot de passe, changement du mot de passe temporaire à la première connexion)
- [ ] Création des comptes joueurs par le MJ (D-19) : action réservée au MJ côté serveur (jamais `service_role` dans le
      navigateur), mot de passe temporaire, rattachement à la campagne, assignation de personnages, réinitialisation
- [ ] RLS stricte : supprimer les 7 policies `USING (true)`, retirer les droits de `anon`, policies par table selon D-02
- [ ] Sécuriser le stockage des portraits (policies `storage.objects`), valider le schéma des URL de portrait
- [ ] Retirer `GRANT EXECUTE` à `anon` sur `last_activity_at` (migration 20260607000000)
- [ ] Durcir la config Auth : inscription libre désactivée, longueur de mot de passe, limites de débit sur la connexion
- [ ] Déplacer `campaigns.dm_notes` dans une table réservée au MJ
- [ ] Tests pgTAP des policies (`supabase/tests/`), job CI `supabase test db`
- [ ] Adapter le MCP : connexion avec un compte MJ dédié, `create_campaign` ; adapter smoke test et CI (D-22)

## 3. Page joueur

- [ ] Route et page joueur (fiche + notes de campagne), masquage de l'interface réservée au MJ
- [ ] Fiche du joueur : consultation et édition de **son** personnage, bouton « Reconstruire ce personnage » (D-18) :
      repasser `ready` en `draft` en conservant inventaire et historique de niveaux
- [ ] Notes de campagne personnelles du joueur (D-10) : table, RLS (auteur + MJ en lecture), CRUD, interface
- [ ] Notes communes (D-11, D-12) : table (titre, catégorie, épinglage, auteur), RLS (lecture : membres ; modification et
      suppression : auteur ou MJ), CRUD, interface
- [ ] Consultation des fiches des autres personnages (D-15), lecture seule ; `backstory` et `notes` masqués
      (RLS par colonne ou vue dédiée)
- [ ] Récapitulatif des séances (D-14) : indicateur de publication par séance, consultation par les joueurs
- [ ] Commentaires sur les récapitulatifs (D-14) : table, RLS (lecture : membres ; modification et suppression : auteur ou MJ), interface
- [ ] Textes de la page joueur dans `src/locales` ⛔ A-18
- [ ] Réécrire les specs BDD `@draft` selon D-02 ⛔ A-09

## 4. Déploiement sur le QNAP

- [ ] Essai : monter Supabase allégé sur le QNAP (D-20), mesurer la RAM sous charge, libérer de la mémoire si besoin
      (arrêt de services inutiles) ; décider du repli cloud si cela ne tient pas
- [ ] Hôte dédié dans `nginx-proxy-manager` (D-21) : certificat Let's Encrypt, HTTP vers HTTPS, HSTS, CSP et en-têtes de
      sécurité, limitation de débit sur la connexion. Rediriger **uniquement** 80/443 depuis la Livebox (déjà fait),
      jamais NFS, SMB, portmap ni SSH
- [ ] Ne pas exposer Studio, Postgres ni Kong ; `service_role` jamais dans le front ; firmware du QNAP à jour
- [ ] En-têtes de sécurité et CSP, réécriture SPA
- [ ] Limites de débit et verrouillage progressif sur la connexion (pas d'e-mails, D-19)
- [ ] Revue de sécurité finale avant ouverture sur Internet (checklist de `docs/` à créer)

## Plus tard

- [ ] Sauvegardes de la base et des portraits, avec test de restauration (D-23 : écartées pour l'instant ; piste :
      export quotidien chiffré vers un autre volume puis copie vers un second QNAP)

- [x] BMAD dans le dépôt MCP : non (D-24), simple renvoi depuis son `CLAUDE.md`
- [ ] Création de personnage par les joueurs (D-17) : RLS `INSERT` (créateur = propriétaire, campagne dont il est membre), `DELETE` réservé au MJ
- [ ] Mettre à jour `docs/security-review-2026-06-01.md` (stockage des portraits désormais utilisé, policies de 2026-06)
