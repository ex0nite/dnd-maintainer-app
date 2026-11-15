# TO-DO

Tâches à faire, par ordre de priorité. Cocher une tâche une fois commitée ; ajouter la référence du commit.
Chaque tâche suit le cycle de `DECISIONS.md` D-04 et se fait dans son propre worktree (D-05).
`⛔ A-NN` = dépend d'une ambiguïté de `AMBIGUITES.md` : la trancher avant de démarrer la tâche (ou la reprendre
si la réponse change le besoin). Les points marqués `BLOQUANT` là-bas bloquent toute la phase.

## 0. Mise en place (en cours)

- [x] CI GitHub Actions du dépôt MCP
- [x] CI GitHub Actions du dépôt app (branche `ci-setup`, non fusionnée)
- [x] Installer BMAD dans le dépôt app
- [x] Créer `TO-DO.md`, `CONVENTION-CODE.md`, `AGENTS.md`, `DECISIONS.md`, `AMBIGUITES.md`
- [ ] Vérifier le résultat de la CI app après ajout des variables `VITE_SUPABASE_*` (commit `94075ee`)
- [ ] Fusionner `ci-setup` et `chore/bmad-setup` dans `main` du fork
- [ ] Corriger les 6 erreurs de lint `no-console` ⛔ A-17
- [ ] Vérifier `npm run format:check` sur Linux (le local Windows signale 305 fichiers à cause des CRLF) ; ajouter un
      `.gitattributes` (`* text=auto eol=lf`) si besoin
- [ ] Corriger la doc : `CLAUDE.md` dit « RLS sans policy » alors que les 7 policies sont `USING (true)` (et 4 policies
      publiques sur `storage.objects`), et « ESLint 9 » alors que `package.json` est en ESLint 10 ; le nom de
      variable est `VITE_SUPABASE_PUBLISHABLE_KEY` dans le code mais `VITE_SUPABASE_ANON_KEY` dans `CLAUDE.md`, `src/locales/en/common.json`,
      `README.md`, `SETUP.md`

## 1. Cadrage avec BMAD

- [ ] Trancher les ambiguïtés bloquantes : A-02, A-07, A-10
- [ ] Brief produit puis PRD de la « page joueur » (`bmad-product-brief`, `bmad-prd`)
- [ ] Architecture (auth, RLS, hébergement QNAP) (`bmad-architecture`)
- [ ] Découpage en epics et stories (`bmad-create-epics-and-stories`)
- [ ] Contexte projet pour les agents (`bmad-project-context`)

## 2. Identité et accès (fondation, avant toute exposition)

- [ ] Migration : `profiles`, `campaign_members` (rôle `dm`/`player`), `characters.owner_user_id`,
      `campaign_invites`, fonctions d'aide `SECURITY DEFINER` ⛔ A-04, A-08
- [ ] Rattacher les données existantes à un compte MJ (backfill) avant de fermer les policies
- [ ] Authentification dans le front : `AuthProvider`, page de connexion, garde de routes, déconnexion ⛔ A-07
- [ ] Flux d'invitation (génération du lien par le MJ, acceptation, assignation d'un personnage) ⛔ A-08
- [ ] RLS stricte : supprimer les 7 policies `USING (true)`, retirer les droits de `anon`, policies par table selon D-02
- [ ] Sécuriser le stockage des portraits (policies `storage.objects`), valider le schéma des URL de portrait
- [ ] Retirer `GRANT EXECUTE` à `anon` sur `last_activity_at` (migration 20260607000000)
- [ ] Durcir la config Auth (confirmation e-mail, longueur de mot de passe) ⛔ A-07
- [ ] Déplacer `campaigns.dm_notes` dans une table réservée au MJ
- [ ] Tests pgTAP des policies (`supabase/tests/`), job CI `supabase test db`
- [ ] Adapter le MCP : connexion avec un compte MJ dédié, `create_campaign` ; adapter smoke test et CI ⛔ A-12

## 3. Page joueur

- [ ] Route et page joueur (fiche + notes de campagne), masquage de l'interface réservée au MJ
- [ ] Fiche du joueur : consultation et édition de **son** personnage ⛔ A-06
- [ ] Notes de campagne personnelles du joueur (D-10) : table, RLS (auteur + MJ en lecture), CRUD, interface
- [ ] Notes communes (D-11, D-12) : table (titre, catégorie, épinglage, auteur), RLS (lecture : membres ; modification et
      suppression : auteur ou MJ), CRUD, interface
- [ ] Consultation des fiches des autres personnages, lecture seule ⛔ A-03
- [ ] Récapitulatif des séances : consultation par les joueurs ⛔ A-02
- [ ] Commentaires sur les récapitulatifs : table, RLS, interface ⛔ A-02
- [ ] Textes de la page joueur dans `src/locales` ⛔ A-18
- [ ] Réécrire les specs BDD `@draft` selon D-02 ⛔ A-09

## 4. Déploiement sur le QNAP

- [ ] Choisir l'architecture : Supabase auto-hébergé ou cloud ⛔ A-10
- [ ] Reverse proxy, HTTPS, DynDNS, redirections de ports ⛔ A-11
- [ ] Ne pas exposer Studio, Postgres ni Kong ; `service_role` jamais dans le front ; firmware du QNAP à jour
- [ ] En-têtes de sécurité et CSP, réécriture SPA
- [ ] Envoi d'e-mails (si lien magique) et limites de débit Auth ⛔ A-07
- [ ] Sauvegardes base + bucket et test de restauration ⛔ A-13
- [ ] Revue de sécurité finale avant ouverture sur Internet (checklist de `docs/` à créer)

## Plus tard

- [ ] Installer BMAD dans le dépôt MCP ⛔ A-14
- [ ] Création de personnage par les joueurs ⛔ A-05
- [ ] Mettre à jour `docs/security-review-2026-06-01.md` (stockage des portraits désormais utilisé, policies de 2026-06)
