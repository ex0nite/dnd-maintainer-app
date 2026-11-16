# Revue adversaire et exactitude — ARCHITECTURE-SPINE.md

- **Date** : 2026-11-15
- **Objet** : `ARCHITECTURE-SPINE.md` (statut draft), confronté au PRD, à `DECISIONS.md`, aux migrations réelles
  (`supabase/migrations/`), à `docs/security-review-2026-06-01.md` et au MCP (`dnd-maintainer-mcp/src/`).
- **Mode** : lecture seule. Aucun fichier du dépôt n'a été modifié.

## Verdict

Le paradigme (la base fait autorité, RLS plus fonctions `SECURITY DEFINER`, tables privées séparées) est sain. Mais le
contrat laisse **sans propriétaire ni règle** plusieurs objets critiques : les policies de `profiles` et de
`campaign_members`, la levée du marqueur « mot de passe temporaire », la création des lignes privées 1:1, le
verrouillage par pseudo et l'archivage des personnages. Deux équipes peuvent respecter chaque AD à la lettre et livrer
une élévation de privilèges (un joueur qui se désarchive lui-même) ou un système qui ne fonctionne pas (le trigger
d'AD-6 bloque l'archivage et le renommage). Plusieurs affirmations techniques sont fausses ou non vérifiées : le bucket
public contredit FR-13 et AD-1, aucune API d'administration ne révoque les sessions par utilisateur, la limitation par IP
passe par Kong, et un `DELETE` bloqué renvoie lui aussi 0 ligne. **Le document n'est pas prêt pour la construction**
tant que les points C1 à C3 et H1 à H6 ne sont pas tranchés.

Gravités : **C** critique (faille exploitable ou blocage de la v1), **H** haute, **M** moyenne, **L** basse.

---

## Partie A — Revue adversaire

### C1 — `profiles` n'a aucune règle d'écriture : un joueur peut se désarchiver ou lever son marqueur (AD-3, AD-4, AD-11)

**Constat.** AD-3 définit les colonnes de `profiles` mais aucune policy. AD-4 fait reposer toute la sécurité des
joueurs sur `profiles.archived_at` et `profiles.must_change_password`. FR-3 exige que « le marqueur ne soit pas
modifiable par le joueur ». Rien n'interdit à une équipe d'écrire la policy courante « chacun modifie son profil »
(`USING (user_id = auth.uid())`), par exemple pour permettre de changer le pseudo.

**Scénario.** Le joueur archivé, dont le jeton est encore valide (jusqu'à 3600 s), ou le joueur au mot de passe
temporaire envoie :
`PATCH /rest/v1/profiles?user_id=eq.<moi>` `{"archived_at":null,"must_change_password":false}`.
`is_active_user()` renvoie alors `true` et tout l'accès revient. Avec la même policy, il peut aussi changer son `pseudo`,
ce qui désynchronise l'adresse dérivée (il ne peut plus se connecter) ou lui permet d'usurper un pseudo libéré.
`role='dm'` est bloqué par l'index unique, mais **seulement tant que le MJ existe**.

**Deuxième trou, fonctionnel.** Si `profiles` n'est pas modifiable par le joueur (la bonne réponse), **personne n'est
désigné pour lever `must_change_password`** après le changement de mot de passe. AD-2 limite `account-admin` à quatre
actions, et aucune n'est « confirmer le changement ». Le joueur change son mot de passe via GoTrue (`PUT /auth/v1/user`),
que la base ne voit pas.

**Troisième trou.** AD-12 dit que le front lit le rôle et l'état dans `profiles`. Or AD-4 impose `is_active_user()` à
« toute policy d'un joueur ». Si la lecture de son propre profil l'appelle aussi, le joueur au mot de passe temporaire ne
peut pas lire son marqueur. Le front ne sait alors pas qu'il doit afficher l'écran de changement de mot de passe : un
interblocage.

**Correction.**

- `profiles` : **aucun** `INSERT`, `UPDATE` ni `DELETE` pour `authenticated` (pas de policy et `REVOKE`). Écritures par
  `account-admin` seulement.
- Lecture de son propre profil **sans** `is_active_user()` (exception explicite à AD-4). Lecture des pseudos des autres
  membres limitée aux colonnes utiles : une vue `security_invoker` ou une fonction qui ne renvoie que `user_id` et
  `pseudo`, pour ne pas exposer `archived_at` ni `must_change_password` des autres.
- Levée du marqueur : un trigger `AFTER UPDATE OF encrypted_password ON auth.users` (`SECURITY DEFINER`,
  `search_path=''`) met `must_change_password=false`. `account-admin`, lors d'une réinitialisation, remet ensuite
  `true` **après** l'appel GoTrue (l'ordre est à documenter, car le trigger se déclencherait aussi sur la réinitialisation).
  Autre solution : une cinquième action d'`account-admin`. AD-2 doit alors le dire.
- Écrire ces règles dans AD-3, et ajouter `profiles` à la matrice de tests d'AD-14.

### C2 — `is_active_user()` est une convention, pas une garantie : une seule policy permissive l'oublie et tout est ouvert (AD-4, AD-6, AD-8)

**Constat.** Les policies permissives se combinent par **OU**. AD-4 dit « toute policy d'un joueur l'appelle », mais
les AD qui détaillent les policies ne le répètent pas. AD-6 dit « le propriétaire ses personnages » ; AD-8 dit
« `owns_character()` sur le premier segment, ou MJ ».

**Scénario.** Une équipe écrit `characters_owner_select USING (owner_user_id = (select auth.uid()))` sans
`is_active_user()`, ce qui suit AD-6 à la lettre. Une autre équipe écrit la policy de stockage d'AD-8 avec
`owns_character()` seul. Le joueur archivé garde la lecture et l'écriture de ses fiches et peut téléverser des
portraits. Son jeton reste valable jusqu'à une heure, et indéfiniment si la révocation de session échoue (voir H5). Il
en va de même pour `character_items` et `character_build_levels`, qui « suivent `owns_character()` ».

**Correction.** Rendre l'invariant structurel :

- sur **chaque** table de `public` et sur `storage.objects` (pour le bucket), une policy
  `AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_dm() OR public.is_active_user())` avec le même `WITH CHECK`.
  Une restrictive se combine par **ET** : un oubli dans une policy permissive ne rouvre plus l'accès ;
- ou bien intégrer `is_active_user()` **dans** `owns_character()` et `is_member()`, pour qu'on ne puisse pas l'oublier ;
- un test de CI qui vérifie dans `pg_policies` la présence de la policy restrictive sur chaque table.

### C3 — Le portrait public contredit FR-13 et AD-1, et la policy actuelle permet d'énumérer les PNJ (AD-8, AD-1)

**Constat.** FR-13 : « Le portrait d'un PNJ n'est pas lisible d'un joueur » et « un utilisateur non connecté ne peut ni
lire, ni écrire, ni supprimer un portrait ». AD-1 : « `anon` n'a aucun droit sur le stockage ». AD-8 : « bucket public
en lecture ». Ces trois exigences sont incompatibles. Un bucket `public = true` sert
`/storage/v1/object/public/character-portraits/...` **sans aucune vérification RLS ni clé**. AD-8 ne porte pas de
marqueur `[PRÉCISE]` qui signalerait l'écart au propriétaire.

**Scénario.** La migration `20260606000000_add_portrait_storage.sql` contient la policy
`"character-portraits: public select"` (`USING (bucket_id = 'character-portraits')`, sans restriction de rôle). Si elle
n'est pas explicitement supprimée (AD-8 n'en parle pas), un visiteur appelle
`POST /storage/v1/object/list/character-portraits` avec la clé publique. Il obtient tous les préfixes `{character_id}`,
y compris ceux des PNJ que les joueurs ne doivent pas voir, puis télécharge les images par l'URL publique. Les
identifiants des personnages fuient eux aussi, alors que la RLS d'AD-6 les cache. « URL à capacité » ne vaut que si
l'énumération est impossible, ce qu'AD-8 ne garantit pas.

**Correction.**

- Soit bucket **privé** (`public=false`) : `SELECT` sur `storage.objects` réservé à `is_dm()` ou à « le premier segment
  désigne un personnage que l'appelant peut lire » (fonction `can_read_character(uuid)`). L'affichage passe par
  `createSignedUrl` (TTL court, mis en cache par TanStack Query). `portrait_url` stocke le **chemin**, pas l'URL.
- Soit garder le bucket public, mais en marquant l'écart à FR-13 `[PRÉCISE]` pour validation par le propriétaire,
  **et** supprimer toute policy `SELECT` sur le bucket (aucune liste possible). Les ajouts côté MJ des portraits de PNJ
  restent alors des URL à capacité.
- Dans les deux cas, supprimer les quatre policies permissives existantes dans la migration de temps 2, et le tester.

### H1 — Le trigger `BEFORE UPDATE` d'AD-6 bloque l'archivage par `account-admin`, les migrations et, selon son nom, le renommage (AD-6, AD-2, AD-13)

**Scénario 1 : appelant sans `auth.uid()`.** Le trigger refuse « à un non-MJ » toute modification de `is_active`. Si
`account-admin` archive les personnages (FR-5) avec la clé d'administration via PostgREST, ou par une connexion directe,
`auth.uid()` vaut `NULL`, donc `is_dm()` renvoie `false` et le trigger lève une exception : l'archivage échoue. Le
remplissage du temps 1 (affectation de `owner_user_id`) ou une correction manuelle par `psql` échouent de même.

**Scénario 2 : ordre des triggers.** Postgres exécute les triggers `BEFORE` d'une même table **par ordre alphabétique
de nom**. `trigger_manage_slug` (`characters_manage_slug`) réécrit `slug` et `previous_slugs` quand le nom change. Si le
nouveau trigger s'appelle par exemple `characters_protect_columns` (`p` > `m`), il s'exécute **après**, voit
`NEW.slug <> OLD.slug` et refuse : **un joueur ne peut plus renommer son personnage**. S'il s'appelle
`characters_guard_columns`, ça fonctionne. Deux équipes conformes à l'AD obtiennent deux comportements opposés.

**Correction.** Préciser dans AD-6 :

- (a) le trigger ne s'applique que si `current_user = 'authenticated'` (ou `auth.role() = 'authenticated'`) et
  `NOT public.is_dm()`. `service_role`, `postgres` et `supabase_auth_admin` sont exemptés ;
- (b) son nom force une exécution **avant** `characters_manage_slug` (par exemple `characters_a_guard`), ou bien il ne
  contrôle pas `slug` ni `previous_slugs`, puisque `trigger_manage_slug` les recalcule de toute façon (voir M3 pour
  l'`INSERT`) ;
- (c) un test pgTAP « le joueur renomme son personnage » et un test « `account-admin` archive ».

### H2 — Appartenance : l'écriture sur `campaign_members` n'est pas réglée, et les droits survivent au départ d'une campagne (AD-3, AD-6, AD-7)

**Scénario 1.** AD-3 crée `campaign_members` sans policy. Une équipe ajoute
`INSERT WITH CHECK (user_id = auth.uid())`, par exemple pour un futur « rejoindre une campagne ». Un joueur s'inscrit
alors dans n'importe quelle campagne dont il connaît ou devine l'identifiant (les slugs sont devinables, d'après H1 de la
revue de sécurité) et lit tout.

**Scénario 2.** FR-5 permet de retirer un joueur d'**une seule** campagne. AD-6 donne la lecture et l'écriture au
« propriétaire » sans condition d'appartenance, et AD-7 donne la modification et la suppression à « l'auteur ».
Retiré de la campagne X, le joueur continue de lire et modifier ses personnages de X (et leur inventaire, leurs
niveaux, leur portrait), ses notes communes et ses commentaires de X. Pire : `owns_character()` seul suffit pour
`character_items`, si bien que la règle de lecture « d'un PJ de la campagne » n'est même pas nécessaire.

**Correction.** `campaign_members` : `SELECT` sur ses propres lignes (et les lignes des campagnes dont on est membre,
pour afficher les membres) ; `INSERT`, `UPDATE` et `DELETE` par `is_dm()` seulement. Toute policy de propriétaire ou
d'auteur ajoute `AND public.is_member(campaign_id)`, ou `owns_character()` le vérifie lui-même. Le retrait d'une
campagne fait l'objet d'un test explicite.

### H3 — Les contrôles d'`INSERT` se contournent par `UPDATE`, et la règle d'auteur contredit FR-19 et FR-17 (AD-7, AD-6)

**Scénario 1 : changement de clé étrangère par `UPDATE`.**

- `session_comments` : AD-7 n'exige « séance publiée et même campagne » qu'à l'insertion. Le joueur publie un
  commentaire, puis `PATCH session_comments?id=eq.<c> {"session_id":"<séance non publiée>"}`, ou une séance d'une autre
  campagne. Si la policy `UPDATE` ne vérifie que l'auteur, ça passe. On obtient au minimum un oracle d'existence et une
  pollution de données, alors que FR-22 interdit justement ce cas.
- `notes_personal` et `notes_shared` : `PATCH ... {"campaign_id":"<campagne non membre>"}` déplace une note hors de sa
  campagne si le `WITH CHECK` de l'`UPDATE` ne refait pas `is_member()`.
- `character_items` et `character_build_levels` : `PATCH character_items?id=eq.<mon objet> {"character_id":"<PJ d'autrui>"}`.
  AD-6 dit « suivent `owns_character()` en écriture » sans préciser `USING` **et** `WITH CHECK`. Avec un `USING` seul,
  Postgres réutilise le `USING` comme `WITH CHECK` pour une policy `FOR UPDATE`, ce qui protège. Mais une policy
  `FOR ALL USING (...) WITH CHECK (true)`, ou deux policies distinctes, ne protège pas. Il faut l'écrire.

**Scénario 2 : contradiction interne.** AD-7 dit « modification et suppression : auteur ou MJ » et
`WITH CHECK (author_id = auth.uid())`. Quand le MJ modifie la note commune d'un joueur (droit donné par FR-19 et FR-22),
`author_id` reste celui du joueur, le `WITH CHECK` échoue et le MJ reçoit une erreur 42501. Une équipe qui suit la
formule à la lettre casse FR-19. À l'inverse, AD-7 donne au MJ la modification de `notes_personal` par la règle
générale, alors que la même phrase et FR-17 la lui refusent. La suppression par le MJ des notes personnelles n'est pas
tranchée.

**Correction.** Pour chaque table d'AD-7, donner un tableau « opération × identité » avec `USING` et `WITH CHECK`
explicites :

- `WITH CHECK` de l'`UPDATE` = mêmes conditions que l'`INSERT` (appartenance, séance publiée de la même campagne) ;
- `author_id` et `campaign_id` (et `session_id`) **immuables**, par trigger ou par absence de `GRANT UPDATE` sur ces
  colonnes (`GRANT UPDATE (title, body, ...)`, ce que PostgREST respecte) ;
- `WITH CHECK (author_id = auth.uid() OR is_dm())` pour `notes_shared` et `session_comments` ; aucune policy
  `UPDATE` du MJ sur `notes_personal` ;
- `session_comments` en lecture : seulement si la séance est **publiée** (FR-20 « dépublier retire l'accès »). AD-7
  ne dit rien de la lecture des commentaires.

### H4 — Migration en deux temps : fenêtre d'exposition, divergence des données et MCP non prêt (AD-13, AD-5)

**Faits vérifiés dans le schéma.** Toutes les colonnes citées existent :

| Colonne                                                                             | Table        | Source                                        |
| ----------------------------------------------------------------------------------- | ------------ | --------------------------------------------- |
| `backstory`, `notes`                                                                | `characters` | `00001_initial_schema.sql`, lignes 206 et 212 |
| `notes`, `experience_awarded` (`NOT NULL DEFAULT 0`), `loot` (`jsonb DEFAULT '[]'`) | `sessions`   | lignes 247 à 249                              |
| `dm_notes`                                                                          | `campaigns`  | ligne 138                                     |

La copie est donc faisable par `INSERT ... SELECT`.

**Problèmes.**

1. **Quand les colonnes sont-elles supprimées ?** AD-5 dit « suppression de ces colonnes » sans dire à quel temps.
   Supprimées au temps 1, elles cassent le MCP actuel : `tools/read.ts` lit `c.backstory`, `c.notes`, `s.notes`,
   `s.loot`, `c.dm_notes` ; `tools/write.ts` écrit `dm_notes` (l. 55), `sessions.notes` et `experience_awarded`
   (l. 149-150, 191-192) et `characters.notes` (l. 282) ; `tools/character.ts` écrit `backstory` et `notes` (l. 229-230).
   L'export SQL du front (liste blanche `TABLE_COLUMNS`) casse aussi. Supprimées au temps 2, elles ont reçu entre
   les deux temps des écritures du MCP et du front qui ne sont **pas** dans les tables privées : la copie du temps 1 est
   un instantané, et ces écritures sont perdues à la suppression.
2. **Exposition pendant le temps 1.** Le temps 1 garde les policies `USING (true)` et les `GRANT ... TO anon`. Si la pile
   est déjà publiée sur Internet (AD-9), toute la base (dont `dm_notes` et les colonnes privées d'origine) est lisible et
   modifiable avec la clé publique. AD-13 ne l'interdit pas.
3. **Ordre « compte MJ, puis remplissage ».** Une migration SQL ne peut pas créer l'utilisateur GoTrue. Le
   « rattachement » dépend donc du script d'AD-15, exécuté entre deux migrations. Ce séquencement n'est pas décrit. Par
   ailleurs, AD-3 dit que le MJ « ne figure pas » dans `campaign_members` : « rattacher toutes les campagnes » au MJ
   ne correspond à aucune écriture. Il faut le reformuler.
4. **Le MCP actuel ne peut pas suivre tel quel.** `src/db.ts` crée le client avec
   `auth: { persistSession: false, autoRefreshToken: false }` et sans aucun `signInWithPassword`. Une fois connecté, le
   jeton expire après 3600 s (AD-11) et le serveur stdio, qui vit longtemps, reçoit `401 JWT expired` sur tout appel.
   Il faut `autoRefreshToken: true` (en mémoire) ou une reconnexion sur 401. Sa clé par défaut est la clé de démo
   locale. `updateCampaign` (`write.ts` l. 63) ne vérifie pas le nombre de lignes, et `deleteCharacter`
   (`store.ts`) ignore l'erreur : sous RLS, ces appels échoueront en silence (voir M1). Les personnages créés par le
   MCP auront `owner_user_id = NULL`, et aucun outil ne permet de l'assigner (FR-9 « le MJ … l'assigne »).

**Correction.**

- Temps 1 : uniquement des ajouts (tables, fonctions, policies strictes sur les nouvelles tables), **pas de copie**, et
  la pile **non publiée sur Internet** tant que le temps 2 n'est pas appliqué (à écrire en règle dans AD-9 et AD-13).
- Temps 2 : **une seule migration transactionnelle** (copie, suppression des colonnes, remplacement des policies,
  `REVOKE anon`), déployée en même temps que les nouvelles versions du front et du MCP. Autre solution : des triggers de
  synchronisation pendant la transition.
- Tâche MCP explicite : connexion, rafraîchissement, lecture et écriture des tables privées, contrôle du nombre de
  lignes, champ `owner` à la création.

### H5 — `account-admin` : vérification du jeton, cibles autorisées, écritures et révocation sous-spécifiées (AD-2, AD-11, AD-15)

1. **Jeton.** « Vérifie la signature » localement ne suffit pas. Un jeton d'une session révoquée reste valide par sa
   signature jusqu'à son expiration. Il faut aussi épingler l'algorithme (HS256 avec l'ancien secret, ou ES256 avec les
   clés asymétriques et le JWKS des versions récentes de GoTrue : à confirmer à l'installation), vérifier `exp`,
   `aud = authenticated` et `role = authenticated`, et refuser un jeton `service_role` (pas de `sub`). Le plus simple :
   appeler `GET /auth/v1/user` avec le jeton reçu, puis lire `profiles` (`role='dm' AND archived_at IS NULL`).
2. **Cibles.** Rien n'interdit d'archiver le MJ lui-même ou de réinitialiser son mot de passe, ce qui enferme tout le
   monde dehors, puisque l'index n'empêche pas d'avoir zéro MJ. Il faut n'accepter comme cible qu'un `user_id` dont
   `profiles.role = 'player'`.
3. **Entrées.** Le pseudo devient une adresse e-mail. Il faut une expression régulière stricte (par exemple
   `^[a-z0-9_-]{3,32}$`, avec `CHECK` identique en base) pour éviter l'injection dans l'adresse (`a@b`, `+`, espaces) et
   les collisions de casse.
4. **Écritures.** Le diagramme dit « lecture du rôle », mais créer, archiver et réinitialiser **écrivent** `profiles`
   (création de la ligne, `archived_at`, `must_change_password`) et, pour FR-5, `characters.is_active`. Il faut
   nommer l'identifiant de base utilisé (rôle Postgres dédié aux droits minimaux, plutôt que la clé d'administration
   via PostgREST qui contourne toute la RLS) et l'exemption du trigger (H1).
5. **Deux propriétaires de la création de profil.** Le script d'AD-15 et `account-admin` créent chacun un compte. Si
   seul `account-admin` crée la ligne `profiles`, le MJ n'en a pas, et inversement. Une solution unique : un trigger
   `AFTER INSERT ON auth.users` qui ne crée **pas** de profil actif par défaut, ou une fonction SQL partagée appelée par
   les deux.
6. **Révocation.** AD-11 : « réinitialisation et archivage révoquent les sessions ». GoTrue n'offre **pas** d'API
   d'administration « déconnecter l'utilisateur X » (`auth.admin.signOut` prend le **jeton** de l'utilisateur, pas son
   identifiant). `updateUserById({password})` ne révoque pas les jetons de rafraîchissement. Il faut écrire le moyen :
   `DELETE FROM auth.sessions WHERE user_id = $1` (ce qui supprime aussi les jetons de rafraîchissement liés) par
   `account-admin`, plus `ban_duration` pour l'archivage. Sans cela, le scénario suivant est possible : après une
   réinitialisation, un attaquant qui détient encore un jeton d'accès valide appelle `PUT /auth/v1/user {password}`.
   Si le marqueur est levé par trigger (C1), il prend le compte. À tester.
7. **Réactivation (FR-5).** Archiver met `is_active=false` sur les personnages. Réactiver les remet tous à `true`,
   y compris ceux que le MJ avait désactivés un par un (FR-12). Il faut une colonne distincte (par exemple
   `archived_with_account`) ou une règle explicite.

### H6 — Limitation de débit : l'IP réelle passe par Kong, et le verrouillage par pseudo n'a pas de propriétaire (AD-9, FR-2)

- La chaîne est NPM, puis Kong, puis GoTrue. Par défaut, Kong remplace `X-Real-IP` par l'adresse qu'il voit (celle de
  NPM) et ajoute une entrée à `X-Forwarded-For`, sauf configuration `KONG_TRUSTED_IPS` et `KONG_REAL_IP_HEADER`. Sans
  cela, `GOTRUE_RATE_LIMIT_HEADER` limite sur l'IP du proxy, et c'est exactement le blocage collectif qu'AD-9 veut
  éviter.
- Inversement, si l'en-tête retenu est un `X-Forwarded-For` **ajouté** par NPM (`$proxy_add_x_forwarded_for`), le
  client contrôle la première valeur. Il peut alors faire varier la clé de limitation à chaque requête et contourner la
  limite. Il faut que NPM **écrase** l'en-tête (`X-Real-IP $remote_addr`) et que Kong lui fasse confiance.
- Le « verrouillage par pseudo » (5 échecs en 15 min, FR-2) n'existe pas nativement dans GoTrue, dont les limites sont
  par IP. Aucun AD ne le porte. La solution réaliste est le hook `password_verification_attempt` de GoTrue (variables
  `GOTRUE_HOOK_PASSWORD_VERIFICATION_ATTEMPT_*`, fonction Postgres). Sa disponibilité dans la version auto-hébergée
  retenue est à vérifier. Sinon, FR-2 n'est pas tenu.

### M1 — Lignes privées 1:1 sans créateur désigné, et `UPDATE` ou `DELETE` à 0 ligne silencieux (AD-5, AD-14)

**Scénario.** AD-5 crée `character_private`, `session_dm` et `campaign_dm` sans dire qui insère la ligne. Équipe front :
`insert characters` puis `insert character_private` (deux requêtes non atomiques). Équipe MCP :
`update character_private ... eq(character_id)`. Une troisième équipe ajoute un trigger `AFTER INSERT`, et l'insertion
explicite du front échoue alors sur la clé primaire. Si personne ne crée la ligne, le `PATCH` du MCP ou du front touche
**0 ligne, renvoie 204 ou 200 sans erreur**, et l'historique saisi est perdu sans message.

**Exactitude.** AD-14 ne mentionne que l'`UPDATE`. Or un `DELETE` dont le `USING` exclut la ligne renvoie **aussi**
0 ligne sans erreur. Un `UPDATE` dont le `USING` passe mais dont le `WITH CHECK` échoue renvoie en revanche **une erreur**
(42501). Un `INSERT` refusé renvoie une erreur. Les tests doivent distinguer ces trois cas.

**Correction.**

- Trigger `AFTER INSERT` (`SECURITY DEFINER`) sur `characters`, `sessions` et `campaigns` qui crée la ligne privée.
  Côté clients : `UPDATE` seulement, jamais `INSERT`. Sinon, `upsert` avec la clé primaire égale à l'identifiant parent,
  ce qui exige des policies `INSERT`, `UPDATE` **et** `SELECT`.
- Convention transverse : toute mutation passe par `.select()` et vérifie `data.length` (le MCP le fait déjà pour
  `notes`, `encounters` et `characters`, mais pas pour `campaigns`).
- AD-14 : vérifier le nombre de lignes pour `DELETE` aussi.

### M2 — `GRANT` par défaut de Supabase : « `anon` n'a aucun droit » n'est pas automatique (AD-1)

- Les privilèges par défaut de Supabase (`ALTER DEFAULT PRIVILEGES ... GRANT ALL ... TO anon, authenticated, service_role`
  sur `public`) donnent automatiquement à `anon` les tables **et** l'`EXECUTE` des fonctions créées par chaque nouvelle
  migration. Il faut un `REVOKE` explicite dans chaque migration (ou une modification des privilèges par défaut), plus
  un test de CI sur `information_schema.role_table_grants` et `routine_privileges`, et pas seulement sur `pg_policies`.
- Existant à corriger au temps 2 : `GRANT ... TO anon` (`00001`, l. 404-405) ;
  `GRANT EXECUTE ON FUNCTION last_activity_at TO anon` (`20260607…`) ; `generate_slug`, `trigger_manage_slug` et
  `update_updated_at_column` gardent l'`EXECUTE` de `PUBLIC` (donc appelables par `/rpc/generate_slug`).
- `REVOKE EXECUTE ... FROM PUBLIC, anon` sur les fonctions d'aide est correct. `authenticated` doit **garder**
  `EXECUTE`, car les policies évaluées sous ce rôle les appellent. Elles restent donc appelables par
  `/rest/v1/rpc/is_member`, mais sans fuite tant que les signatures ne prennent pas de `user_id` en paramètre. Il faut
  écrire cette règle : aucune fonction d'aide ne prend l'identité en paramètre.
- Toute **vue** doit être `WITH (security_invoker = true)` (Postgres 15 et plus). Une vue ordinaire s'exécute avec les
  droits de son propriétaire et contourne la RLS, ce qui fait fuir des données par jointure. Aucune règle de l'AD ne
  l'interdit aujourd'hui.

### M3 — `INSERT` de personnage : `slug` et `previous_slugs` choisis par le joueur (AD-6)

**Constat.** Le trigger d'AD-6 protège `slug` et `previous_slugs` en `UPDATE` seulement. `trigger_manage_slug` ne génère
le slug que s'il est vide, et ne touche pas `previous_slugs` à l'`INSERT`.

**Scénario.** Un joueur crée un PJ (visible des autres membres) avec `previous_slugs = '{<slug du PJ d'un autre>}'`. Les
hooks du front résolvent par `.or(slug.eq.X, previous_slugs.cs.{X})` : selon `limit(1)` ou `maybeSingle()`, le lien
vers le PJ de la victime ouvre la fiche de l'attaquant, ou échoue. Par ailleurs, l'index unique **global** sur `slug`
transforme un `INSERT` avec un slug choisi en oracle d'existence (« duplicate key ») pour des slugs de PNJ invisibles.
Le risque est faible, car le slug contient 8 caractères hexadécimaux, mais il est réel.

**Correction.** Pour un non-MJ, à l'`INSERT` : forcer `slug := generate_slug(...)`, `previous_slugs := '{}'`,
`is_active := true`, et ignorer l'`id` fourni.

### L1 — `portrait_url` : un `CHECK` de préfixe ne suffit pas (AD-8)

Un préfixe `https://<hôte>/storage/v1/object/public/character-portraits/` accepte `…/character-portraits/../../../…`, que
le navigateur normalise vers une autre ressource du même domaine. L'impact est faible (balise `img`, CSP), mais FR-13
demande « que le stockage de l'application ». Il faut un `CHECK` par expression régulière complète :
`^<préfixe>[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp)$`, ou bien stocker seulement le chemin.

### L2 — Divers

- Les `CHECK` de longueur (10 000 caractères) protègent la base, mais un `jsonb` comme `choices` ou `combatants` reste
  sans borne. C'est un risque mémoire sur un NAS de 4 Go, car le joueur écrit `character_build_levels.choices`. Il faut
  un `CHECK (pg_column_size(choices) < 64000)` ou équivalent.
- La connexion par OTP ou lien magique avec la clé publique (`/auth/v1/otp`) et les connexions anonymes doivent être
  désactivées explicitement (`GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=false`, téléphone désactivé). Un utilisateur
  anonyme reçoit le rôle `authenticated`. `is_active_user()` le bloque, mais seulement si C2 est corrigé.
- `PUT /auth/v1/user` permet au joueur de changer son **e-mail** et ses `user_metadata`. Changer l'e-mail casse la
  dérivation pseudo → adresse, ou réserve l'adresse d'un futur pseudo, ce qui fait échouer `createUser`. À vérifier
  selon `GOTRUE_MAILER_AUTOCONFIRM` et le changement d'e-mail sécurisé. Une parade : un trigger sur `auth.users` qui
  refuse un e-mail différent de `<pseudo>@<domaine>.invalid`.
- Le `kong.yml` officiel publie aussi `/pg/` (métadonnées), `/realtime/v1` et `/functions/v1`. NPM ne transmet que trois
  préfixes, ce qui protège, mais il vaut mieux élaguer `kong.yml` pour la défense en profondeur et pour la mémoire.

---

## Partie B — Exactitude des affirmations techniques

| Affirmation (AD)                                                                                                    | Jugement                              | Détail                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Index unique partiel pour un seul `dm` (AD-3, AD-15)                                                                | **Exact**                             | `CREATE UNIQUE INDEX ON profiles (role) WHERE role = 'dm'` fonctionne. Il n'empêche pas d'avoir **zéro** MJ (voir H5-2).                                                                                                                                                                                                                                                                                                                                                         |
| `SECURITY DEFINER STABLE` et `search_path=''` (AD-4)                                                                | **Exact**                             | C'est la bonne pratique. Le propriétaire de la table (`postgres`) contourne la RLS de `profiles` dans la fonction, ce qui évite la récursion. Envelopper l'appel dans les policies (`(select public.is_dm())`) pour l'évaluer une fois par requête, et pas par ligne : c'est important sur le Celeron.                                                                                                                                                                           |
| `REVOKE EXECUTE … FROM PUBLIC, anon` (AD-4)                                                                         | **Exact mais incomplet**              | `authenticated` doit garder `EXECUTE`. Les privilèges par défaut de Supabase redonnent `anon` à chaque nouvelle fonction (voir M2).                                                                                                                                                                                                                                                                                                                                              |
| « `is_active_user()` dans toute policy de joueur » (AD-4)                                                           | **Fragile**                           | Policies permissives combinées par OU. Il faut une policy restrictive (C2). La lecture de son propre profil doit faire exception (C1).                                                                                                                                                                                                                                                                                                                                           |
| Trigger `BEFORE UPDATE` refusant des colonnes (AD-6)                                                                | **Faisable, conflits non traités**    | Ordre alphabétique avec `characters_manage_slug` ; appelant sans `auth.uid()` (H1). Rien n'est prévu pour l'`INSERT` (M3).                                                                                                                                                                                                                                                                                                                                                       |
| « Un `UPDATE` bloqué touche 0 ligne sans erreur » (AD-14)                                                           | **Partiellement exact**               | Vrai si le `USING` exclut la ligne. Faux si le `WITH CHECK` échoue (erreur 42501). Vrai aussi pour `DELETE`, qu'AD-14 omet (M1).                                                                                                                                                                                                                                                                                                                                                 |
| Bucket public plus policies sur `storage.objects` (AD-8)                                                            | **Inexact par rapport aux exigences** | Le téléchargement public ne passe pas par la RLS : il contredit FR-13 et AD-1. La policy `SELECT` existante permet de lister tout le bucket (C3). La « garde contre un segment non UUID » ne doit pas reposer sur `a AND b::uuid`, car Postgres ne garantit pas l'ordre d'évaluation d'un `AND` : il faut un `CASE` ou une fonction qui prend du texte et valide en interne. Les policies de stockage s'exécutent sous `authenticated` : `owns_character` doit lui être accordé. |
| `GOTRUE_DISABLE_SIGNUP=true` (AD-11)                                                                                | **Exact**                             | Il faut garder le fournisseur e-mail **actif** (`GOTRUE_EXTERNAL_EMAIL_ENABLED=true`), sinon la connexion par mot de passe échoue. Confirmer aussi que les connexions anonymes sont bloquées (L2).                                                                                                                                                                                                                                                                               |
| Mot de passe ≥ 10, jeton 3600 s, rotation (AD-11)                                                                   | **Exact**                             | `GOTRUE_PASSWORD_MIN_LENGTH`, `GOTRUE_JWT_EXP`, `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED`.                                                                                                                                                                                                                                                                                                                                                                                |
| « Réinitialisation et archivage révoquent les sessions » (AD-11)                                                    | **Non réalisable tel quel**           | Aucune API d'administration GoTrue ne révoque par identifiant d'utilisateur. Il faut supprimer dans `auth.sessions` ou utiliser `ban_duration`, dont l'effet sur les jetons de rafraîchissement existants est à vérifier (H5-6).                                                                                                                                                                                                                                                 |
| Adresse `<pseudo>@<domaine>.invalid` (AD-3)                                                                         | **Non vérifié**                       | Le validateur d'e-mail de GoTrue (selon la version) peut refuser certains domaines. À tester avec `admin.createUser({ email_confirm: true })` **et** `signInWithPassword` sur la version épinglée, avant de figer la convention.                                                                                                                                                                                                                                                 |
| `GOTRUE_RATE_LIMIT_HEADER` (AD-9)                                                                                   | **Incomplet**                         | Il faut aussi configurer Kong (`KONG_TRUSTED_IPS`, `KONG_REAL_IP_HEADER`) et faire écraser l'en-tête par NPM (H6). Le verrouillage par pseudo n'est pas natif.                                                                                                                                                                                                                                                                                                                   |
| « `account-admin` : lecture du rôle » (diagramme, AD-2)                                                             | **Inexact**                           | Le service doit aussi écrire `profiles` et `characters` (H5-4).                                                                                                                                                                                                                                                                                                                                                                                                                  |
| « Le MCP utilise `signInWithPassword` » (AD-13)                                                                     | **Écart avec le code**                | Le client actuel n'a ni connexion ni rafraîchissement (`autoRefreshToken:false`) : il tombe après une heure (H4-4).                                                                                                                                                                                                                                                                                                                                                              |
| Colonnes à déplacer (AD-5, AD-13)                                                                                   | **Exact**                             | Les six colonnes existent (tableau en H4). Le moment de leur suppression n'est pas fixé (H4-1).                                                                                                                                                                                                                                                                                                                                                                                  |
| « Le MJ est `dm` de toutes les campagnes sans y figurer » et « rattachement de toutes les campagnes » (AD-3, AD-13) | **Incohérent**                        | Rien à rattacher si le MJ est global. Seuls les personnages existants (`owner_user_id`, laissé `NULL`) et éventuellement les membres sont concernés.                                                                                                                                                                                                                                                                                                                             |
| `last_activity_at` (existant)                                                                                       | **À noter**                           | `SECURITY INVOKER` : sous RLS, un joueur obtient une date calculée seulement sur les séances **publiées**. Ce comportement est acceptable, mais il faut retirer le `GRANT … TO anon`.                                                                                                                                                                                                                                                                                            |
| AD-10 « environ 2 Go de RAM disponibles »                                                                           | **Cohérent**                          | Conforme au relevé de `DECISIONS.md`. Seuil de 500 Mo libres conforme au SM-4 du PRD.                                                                                                                                                                                                                                                                                                                                                                                            |

---

## Corrections à apporter au document (synthèse)

1. AD-3 : policies de `profiles` (aucune écriture par un joueur, lecture de son propre profil sans
   `is_active_user()`, vue limitée aux pseudos) et de `campaign_members` (écriture MJ seul).
2. AD-4 : `is_active_user()` imposé par une policy **restrictive** sur chaque table et sur `storage.objects`. Mécanisme
   de levée de `must_change_password` désigné.
3. AD-6 : exemptions du trigger (`service_role`, migrations), nom qui fixe l'ordre, règles d'`INSERT` (slug,
   `previous_slugs`), condition d'appartenance pour le propriétaire.
4. AD-7 : tableau opération × identité, `WITH CHECK` des `UPDATE` égal à celui des `INSERT`, colonnes de liaison
   immuables, droits du MJ conformes à FR-17, FR-19 et FR-22, lecture des commentaires seulement sur une séance publiée.
5. AD-8 : bucket privé et URL signées, ou écart à FR-13 marqué et validé. Suppression des policies permissives
   existantes. `CHECK` par expression régulière.
6. AD-2, AD-11, AD-15 : vérification du jeton par GoTrue, cibles limitées aux joueurs, identifiant de base dédié,
   création de profil unique, révocation par `auth.sessions`, réactivation qui distingue les personnages désactivés
   un par un.
7. AD-9 : configuration Kong et NPM pour l'IP réelle. Propriétaire du verrouillage par pseudo (hook GoTrue).
8. AD-13 : temps 1 non exposé sur Internet et sans copie ; temps 2 transactionnel et synchronisé avec le front et le
   MCP ; tâche MCP détaillée (rafraîchissement, tables privées, vérification du nombre de lignes, `owner`).
9. AD-1, AD-14 : `REVOKE` explicites contre les privilèges par défaut, vues `security_invoker`, tests sur
   `role_table_grants`, tests des `DELETE` à 0 ligne, tests de renommage et d'archivage.
