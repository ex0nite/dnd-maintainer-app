# Brainstorm design, tour 2 : architecture du rendu « Homebrewery »

Animé par Winston (System Architect). Tour 2 sur 2 : vérification, arbitrage technique, projet de décisions
d'architecture. Regard volontairement sceptique : sécurité, maintenabilité, coût de possession.

Sources lues : compte rendu du tour 1 (`brainstorm-design-tour1-sally.md`), PRD (NFR-1, NFR-6, NFR-8, NFR-10, FR-20 à
FR-24, question ouverte 8), `ARCHITECTURE-SPINE.md` (AD-1 à AD-15), `DECISIONS.md`, `epics.md` (brouillon),
`index.html`, `package.json`, `src/pages/SessionDetail.tsx`, outils `dnd_create_session` / `dnd_update_session` du MCP
(lecture seule). Vérifications externes du 2026-11-15 : dépôt `naturalcrit/homebrewery` (fichiers bruts et API GitHub),
registre npm, paquets installés dans un dossier temporaire hors dépôt (preuve de concept, section 2).

Position de départ, en une phrase : **la valeur de Homebrewery pour nous est une syntaxe et un aspect, pas un logiciel ;
on n'achète que ce qui survit à l'assainissement.**

## 1. Vérification indépendante des affirmations du tour 1

| Affirmation du tour 1                                                                                | Verdict                  | Preuve et précision                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homebrewery sous licence MIT (copyright 2016 Scott Tolksdorf)                                        | **Confirmé**             | Fichier `license` brut du dépôt.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Application complète, pas une bibliothèque ; pas de `main` ni `exports` ; `engines.node` très récent | **Confirmé**             | `package.json` 3.24.2 : pas de `main`/`exports`, `engines.node >=26.4.0`, Express 5, mongoose 9, React 19.                                                                                                                                                                                                                                                                                                                                      |
| `marked-hbfm` 1.0.3, MIT, API `render(texte, page)` et `validate(texte)`                             | **Confirmé**             | Registre npm : versions 1.0.0 (2026-09-19) à 1.0.3 (2026-10-20). Entrées ESM `src/index.js`, CJS, UMD.                                                                                                                                                                                                                                                                                                                                          |
| Maintenance « en transfert », à surveiller                                                           | **À nuancer**            | Le README garde la tâche « Transfer ownership to naturalCrit project », mais les mainteneurs npm sont deux mainteneurs du cœur de Homebrewery, et **Homebrewery lui-même dépend de `marked-hbfm ^1.0.3`** : c'est le moteur réel de l'amont, pas un fork orphelin. Le vrai risque est ailleurs : 4 versions en un mois, aucun test dans le module (« Duplicate Homebrewery tests into module » est encore à faire).                             |
| Dépendances : `marked >=3 <19`, `lodash`, une dizaine de plugins `marked-*`                          | **Incomplet**            | 10 plugins, **versions épinglées exactes**. Deux erreurs d'empaquetage non signalées : `eslint-plugin-jest` et `eslint-plugin-react` sont en dépendances **d'exécution** et tirent `eslint` 9 (déprécié). Installer 3 paquets en a installé **269**. `marked-diagrams-markdeep` exige `marked >=15 <16` : la plage annoncée est en fait **figée sur marked 15** (15.0.12 résolu).                                                               |
| Rendu côté client injecté dans un iframe                                                             | **Incomplet**            | `brewRenderer.jsx` passe `sandbox='allow-same-origin allow-modals allow-top-navigation'` (sans `allow-scripts`) : Homebrewery compte sur l'iframe comme seconde barrière, ce que le tour 1 n'a pas dit. Sa conclusion reste juste pour nous : CSS utilisateur libre et navigation du haut de page autorisée.                                                                                                                                    |
| `safeHTML.js` est une liste noire (`script`, `noscript`, `noembed`, `on*`, `javascript:`)            | **Confirmé**             | Elle retire aussi `type` contenant « submit ». Ne traite ni `iframe`, `object`, `embed`, `style`, `form`, ni `srcdoc`.                                                                                                                                                                                                                                                                                                                          |
| Les blocs `{{...}}` produisent `class`, `id`, `style` en ligne                                       | **Sous-estimé**          | Ils produisent aussi des **attributs arbitraires** : `{{wide,onmouseover="alert(7)"` sort `onmouseover` tel quel (preuve en section 2). Le filtre interne n'écarte que `class=`, `style=`, `id=`.                                                                                                                                                                                                                                               |
| Images : `<img src=... style="--HB_src:url(...)">`, URL externe chargée                              | **Sous-estimé**          | `renderer.image` **n'échappe ni `src` ni `alt`** : `![a](<x" onerror="alert(2)>)` donne un `onerror` exécutable avec du Markdown pur, sans HTML. Le moteur est donc lui-même un générateur de XSS.                                                                                                                                                                                                                                              |
| Sauts `\page` et `\column`                                                                           | **Imprécis**             | `render()` traite `\column` ; le découpage en pages `\page` est fait par `brewRenderer`, pas par le paquet.                                                                                                                                                                                                                                                                                                                                     |
| Thèmes, polices et images : licence à vérifier                                                       | **Vérifié, défavorable** | `themes/fonts/5e` contient Bookinsanity, Scaly Sans, Nodesto Caps, Mr Eaves Small Caps, Solbera Imitation, Davek, Iokharic, Rellanic, WalterTurncoat, Martel Sans, Overpass. Les premières sont des **imitations communautaires** (Solbera) de polices commerciales, données sous CC BY-SA 4.0 par la plupart des sources, avec des mentions contradictoires ; aucun fichier de licence dans le dossier. Martel Sans et Overpass sont sous OFL. |
| `@naturalcrit/markdown` n'existe pas                                                                 | Non revérifié            | Sans effet sur la décision.                                                                                                                                                                                                                                                                                                                                                                                                                     |

Lacunes du tour 1, découvertes ici :

1. **État global** : `marked-hbfm` appelle `use()` sur l'instance **globale** de `marked` (preuve : `marked.parse('{{note...')`
   produit `class="block"` après import). Toute autre utilisation de `marked` dans l'app serait contaminée ; état de
   module (variables, identifiants de titres) non réentrant.
2. **Coût quadratique** des expressions des blocs mustache (section 2) : un texte hostile de 32 000 caractères bloque
   2 s sur un PC, bien plus sur un téléphone.
3. **SVG** : `marked-diagrams-markdeep` génère du SVG à partir d'art ASCII ; code issu de Markdeep sous **BSD-2**
   (mention obligatoire), et son `package.json` n'a pas de champ `license`.
4. **DOMPurify par défaut ne suffit pas** : il garde `style` (faux écran plein page, fuite par `url()`), `<form action>`
   externe et les images externes (section 2). Il faut une configuration explicite, pas « DOMPurify ou équivalent ».
5. **La CSP stricte voulue par le tour 1 casse déjà l'app actuelle** : `index.html` contient un script en ligne (thème) et
   `sonner` injecte une balise `<style>` à l'exécution (`__insertCSS`). Ni `script-src 'self'` ni `style-src 'self'` ne
   passent sans ajustement, indépendamment de Homebrewery.
6. **« Désactiver le HTML en ligne » contredit le copier-coller** : les brews réels utilisent beaucoup de HTML brut
   (`<div class='pageNumber'>`, `<img style=...>`). Mieux vaut laisser le HTML entrer et confier la frontière au seul
   assainisseur.
7. **Le MCP est une porte d'écriture pilotée par un LLM** : le contenu qu'il écrit peut venir d'une injection de prompt.
   Il doit être traité comme n'importe quel client non fiable (déjà limité à 20 000 caractères par Zod).

## 2. Preuve de concept

Dossier temporaire hors dépôt, `npm install --ignore-scripts marked-hbfm dompurify jsdom` (Node 24), un seul script de
test exécuté. Deux assainissements comparés : DOMPurify **par défaut**, et une **liste blanche stricte** (balises de
texte, tableaux, `a`, `img`, `div`, `span` ; attributs `class`, `id`, `href`, `src`, `alt`, `title`, `colspan`,
`rowspan` ; classes limitées à un jeu fermé ; `id` préfixé ; `href` en `https?:` ou `#` ; `src` seulement `asset:<uuid>` ;
liens forcés en `rel="noopener noreferrer nofollow"`).

| Entrée                                                 | Sortie brute de `marked-hbfm` | DOMPurify par défaut           | Liste blanche stricte                                                |
| ------------------------------------------------------ | ----------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `<script>`                                             | passe                         | retiré                         | retiré                                                               |
| `<img src=x onerror>`                                  | passe                         | `onerror` retiré, image gardée | image retirée                                                        |
| `![a](<x" onerror="...">)` (Markdown pur)              | **`onerror` injecté**         | retiré                         | image retirée                                                        |
| `![x" onerror="..."](url)` (texte alternatif)          | **`onerror` injecté**         | retiré                         | image retirée                                                        |
| Image externe (pistage)                                | passe, avec `--HB_src`        | **gardée**                     | retirée                                                              |
| `[clic](javascript:...)`, variante encodée, `data:`    | passe                         | `href` retiré                  | `href` retiré                                                        |
| `{{note,position:fixed,...,background:url(externe)`    | `style` en ligne              | **gardé** (faux écran, fuite)  | `style` retiré, classes gardées                                      |
| `{{wide,onmouseover="..."` et span `{{x,onclick=...}}` | **attribut injecté**          | retiré                         | retiré ; classe inconnue `x` retirée                                 |
| Injecteur `**gras**{onclick=...,color:red}`            | `style` + `onclick`           | `style` gardé                  | les deux retirés                                                     |
| `<style>` avec sélecteur d'exfiltration                | passe                         | retiré                         | retiré                                                               |
| `<iframe>`, `<object>`, `<form action=externe>`        | passe                         | **`form` gardé**               | tout retiré                                                          |
| Diagramme ASCII `asciiArt`                             | SVG                           | SVG gardé                      | retiré (SVG non autorisé)                                            |
| `<div class="note" style onclick>` + Markdown          | Markdown interne rendu        | `style` gardé                  | `div.note` propre                                                    |
| Texte normal (titre, `{{note}}`, liste, tableau)       | correct                       | identique                      | identique, `id` préfixés (à corriger : le filtre retire les accents) |

Mesures (PC de développement, Node 24) :

- 20 pages réalistes (65 000 caractères de HTML) : rendu **23 ms**, assainissement **72 ms** sous jsdom (un navigateur est
  nettement plus rapide que jsdom pour cette étape).
- Entrées pathologiques : le coût **double au carré** avec la taille. Blocs `{{` non fermés : 4 000 car. 80 ms,
  8 000 car. 142 ms, 16 000 car. 517 ms, 32 000 car. **1 963 ms**. Injecteurs répétés : 48 000 car. 915 ms. Sur un
  téléphone d'entrée de gamme, compter 5 à 10 fois plus.
- Taille (estimation, la mesure par bundler n'a pas été lancée : seul le script de test était autorisé) : `marked-hbfm`
  pèse environ 200 Ko non minifiés, dont **187 Ko de tables d'icônes** importées sans condition ; s'y ajoutent Markdeep
  (68 Ko), `lodash` complet (72 Ko minifié, importé en bloc), `marked` (39 Ko minifié), les plugins (environ 35 Ko) et
  DOMPurify (29 Ko minifié). Ordre de grandeur : **350 Ko minifiés, 100 à 130 Ko compressés** pour la chaîne hbfm,
  contre **environ 70 Ko minifiés, 25 Ko compressés** pour `marked` + DOMPurify seuls. À confirmer par
  `vite build` dans la story de spike.

Conclusion du POC : le moteur est **inutilisable sans assainissement strict** ; avec lui, il reste des balises de
texte, des tableaux et des `div`/`span` à classes connues. **Tout ce qui fait la mise en page libre de Homebrewery
(positions, couleurs, images externes, CSS du brew, SVG, icônes) disparaît.** Ce qui survit, un `marked` isolé plus une
petite extension `{{classe}}` le produit aussi.

## 3. Réponses aux 13 questions du tour 1

1. **Moteur : A, B ou C ?** Ni A ni C tels quels. Recommandation : **B renforcé, « dialecte HB-lite »** : une instance
   `new Marked()` isolée, `marked-extended-tables` et `marked-definition-lists` (MIT, sans dépendance), plus une
   extension maison d'environ 150 lignes pour `{{classe ... }}` (blocs et spans) qui n'accepte **que** des noms de
   classes, ignore les `key:valeur` et `key=valeur`, et traite `\page` et `\column` comme séparateurs. Raison : après
   assainissement, `marked-hbfm` n'apporte presque rien de plus (section 2), mais coûte 269 paquets, un état global, un
   coût quadratique, un générateur de XSS à neutraliser et une maintenance qui n'est pas la nôtre. Le moteur est caché
   derrière une seule fonction `renderBrew()` : on peut passer à `marked-hbfm` plus tard sans toucher au reste (plan de
   repli, section 5).
2. **Où assainir ?** **À la lecture, toujours, juste avant l'injection dans le DOM.** Le paradigme est « la base fait
   autorité » et il n'existe aucun code serveur de confiance pour le contenu (AD-2 limite `account-admin` aux comptes,
   AD-10 exclut les fonctions edge). Un HTML « assaini à la publication » par le client du MJ ne vaut rien comme
   frontière : un compte MJ compromis, ou le MCP, peut écrire ce qu'il veut. Donc : on **ne stocke pas de HTML** ; la
   base stocke la source Markdown, bornée par `CHECK` ; la validation à l'écriture (`validate`, longueur, liens
   d'images) est un confort pour le MJ, pas une sécurité. Garantie « un client ne peut pas écrire du HTML lu par d'autres » :
   inutile si le HTML stocké n'existe pas ; le seul HTML est celui produit et assaini dans le navigateur du lecteur.
3. **Liste blanche exacte** : celle du POC, consignée dans AD-17 : balises `p br hr h1-h6 strong em b i u s del sub sup
blockquote code pre ul ol li dl dt dd table thead tbody tr th td a img div span` ; attributs `class id href src alt
title colspan rowspan` ; aucun `style`, `data-*`, SVG, MathML, formulaire. Classes : jeu fermé `BREW_CLASSES`
   (`note`, `descriptive`, `monster`, `wide`, `frame`, `toc`, `classTable`, `artist`, `footnote`, `pageNumber`,
   `columnSplit`, `block`, `inline-block`, à finaliser sur le corpus). `id` préfixé `brew-` (contre le DOM clobbering)
   en gardant les lettres Unicode. **Nettoyage silencieux au rendu**, **avertissement à l'enregistrement** (l'éditeur
   montre ce qui sera retiré) ; pas de rejet en base, qui ne parse pas le Markdown. Non-régression : corpus de payloads
   du POC + payloads XSS classiques + fuite CSS/image, en Vitest sous jsdom, en CI.
4. **CSP sans `unsafe-inline`** : **oui pour le contenu**, puisque la liste blanche retire tout `style` et toute balise
   `<style>`. Colonnes : par classes CSS (`column-count`) dans notre feuille. Polices : auto-hébergées via
   `@fontsource` (déjà utilisé pour Geist), donc `font-src 'self'`. Mais **l'app actuelle** viole déjà une CSP stricte :
   script de thème en ligne dans `index.html` (à sortir dans un fichier ou à autoriser par empreinte) et `<style>`
   injecté par `sonner` (empreinte `sha256` épinglée par version, ou remplacement). Valeurs proposées en AD-21 ; AD-9
   n'en donne aucune et n'est pas modifié. Déploiement d'abord en `Content-Security-Policy-Report-Only`.
5. **Iframe `sandbox`, Shadow DOM ou rendu direct ?** **Rendu direct** dans un conteneur `.brew`, après assainissement.
   L'iframe `srcdoc` sans `allow-scripts` est une bonne seconde barrière mais coûte : hauteur à recalculer, ancres et
   focus cassés, lecteurs d'écran moins fluides, impression en deux documents, thèmes clair/sombre à recopier. Le
   Shadow DOM isole le CSS mais n'apporte aucune sécurité et complique l'impression et les thèmes. La sécurité vient de
   la liste blanche ; l'isolation CSS vient d'une feuille portée par `.brew` (cascade layers Tailwind 4). L'iframe
   `sandbox` reste l'option du plan de repli si l'on adopte `marked-hbfm` complet.
6. **Images** : bucket privé dédié `campaign-assets`, même patron qu'AD-8. Objets `<campaign_id>/<uuid>.<ext>` ; PNG,
   JPEG, WebP seulement (**pas de SVG**), 2 Mo ; lecture membres de la campagne et MJ ; écriture et suppression MJ.
   Référence dans le Markdown par `asset:<uuid>` ; après assainissement, `<BrewView>` remplace la référence par une URL
   signée courte (chemin servi par `/storage/v1`, donc `img-src 'self' blob:`). Pas de redimensionnement serveur
   (imgproxy est différé) : compression côté navigateur du MJ avant envoi. Quota par campagne : non natif ; surveillé
   par la taille du bucket, pas d'automatisme en v1.
7. **Modèle de données** : `sessions.summary` reste la source du récapitulatif ; ajout de
   `sessions.summary_format text not null default 'plain' check (summary_format in ('plain','brew'))` et d'un `CHECK
(char_length(summary) <= 30000)`. Nouvelle table `campaign_rules(id, campaign_id, kind, title, body, body_format,
published, sort_order, created_at, updated_at)` : lecture membres si `published`, écriture MJ seul, policy
   restrictive d'AD-4, matrice pgTAP d'AD-14. **Pas de colonne `html`.** Attention à la règle de colonnes d'AD-5 : la
   source Markdown est lisible par quiconque lit la ligne, **commentaires HTML et variables inutilisées compris** ; tout
   secret va dans `session_dm` ou `campaign_dm`, jamais en commentaire du récapitulatif (à écrire dans l'aide de
   l'éditeur). Versionnage : différé.
8. **MCP** : il continue d'écrire du **Markdown source**, jamais du HTML, et gagne un paramètre `format` (`plain` ou
   `brew`) sur `dnd_create_session` / `dnd_update_session` ; la description de l'outil documente le dialecte HB-lite.
   Validation : longueur (déjà 20 000, sous la borne base de 30 000) et vérification du nombre de lignes affectées (AD-5).
   La sécurité ne dépend pas du MCP : ce qu'il écrit est assaini à la lecture comme le reste. Outils `campaign_rules` :
   plus tard, si le MJ le demande.
9. **Migration de `sessions.summary`** : aucune conversion. Les lignes existantes prennent `summary_format = 'plain'` et
   s'affichent comme aujourd'hui (texte échappé, sauts de ligne respectés). Le MJ bascule une séance en `brew` quand il
   le veut. Cette migration vient **après** la bascule unique d'AD-13 (qui ne concerne que l'ouverture) ; elle est
   additive et sans risque.
10. **Impression/PDF** : `@media print` du navigateur, à partir du « mode page ». `pdf-lib` ne rend pas de HTML : il
    reste réservé à la fiche de personnage (`pdf-export.ts`). Un seul mécanisme par usage.
11. **Licences** : fichier `THIRD-PARTY-NOTICES.md` à la racine, généré à partir des dépendances embarquées dans le
    bundle (MIT de `marked` et plugins, Apache-2.0 retenu pour DOMPurify qui est en double licence, OFL des polices),
    vérifié en revue. **Aucune police ni image de Homebrewery** dans le dépôt (provenance des imitations incertaine,
    CC BY-SA). Polices OFL proches de l'esprit des livres via `@fontsource` (choix en story de style). Aucun texte ni art
    officiel de Wizards dans le dépôt public ; le contenu de règles écrit par le MJ vit en base, pas dans le dépôt.
    Si `marked-hbfm` est adopté (repli) : mention MIT de hbfm et **BSD-2 de Markdeep**.
12. **Maintenance de `marked-hbfm`** : ne pas le vendoriser (on hériterait de 187 Ko d'icônes, d'un code sans tests et de
    la charge de suivre l'amont). Ne pas l'adopter en v1. S'il l'est un jour : version **exacte** épinglée, `overrides`
    pour écarter `eslint-plugin-*` de l'arbre installé si possible, chargement différé (`import()`), rendu dans un Web
    Worker avec délai maximal, et liste blanche inchangée.
13. **À porter au propriétaire** : voir section 6 (cinq décisions). Le point clé : « utiliser Homebrewery » signifie
    « écrire avec la syntaxe et obtenir l'aspect d'un livre », pas « héberger Homebrewery » ni « reproduire au pixel un
    brew existant ». Et NFR-10 reste inchangé pour les joueurs.

## 4. Évaluation des pistes

Échelle : ++ très bon, + bon, = neutre, - mauvais, -- très mauvais. « Fidélité » = copier-coller d'un brew existant.

| Critère                   | A : HB strict                                   | B : Markdown maison                           | C : HB à l'écriture, HTML stocké                                       | D : trois niveaux                  | E : lecture d'abord |
| ------------------------- | ----------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- | ------------------- |
| Sécurité                  | -- (XSS natif, `style`, iframe à ajouter)       | ++ (liste blanche, CSP stricte)               | - (HTML stocké écrit par un client : frontière illusoire sans serveur) | + (réduit la surface côté joueurs) | = (orthogonal)      |
| Coût de maintenance       | -- (269 paquets, état global, amont sans tests) | + (~150 lignes à nous, 3 dépendances stables) | - (deux représentations, régénération au changement de thème)          | - (trois comportements à tester)   | - (deux rendus CSS) |
| Poids du bundle joueur    | -- (~100 à 130 Ko compressés)                   | ++ (~25 Ko compressés)                        | ++ (DOMPurify seul côté joueur)                                        | =                                  | =                   |
| Effort en stories         | - (assainissement + iframe + worker + CSP)      | = (extension + CSS + tests)                   | -- (pipeline de publication, cohérence)                                | - (+1 à 2 stories)                 | = (+1 story)        |
| Fidélité au copier-coller | ++ avant assainissement, + après                | + (sous-ensemble ; le reste dégradé en texte) | + après assainissement                                                 | =                                  | =                   |
| Lisibilité mobile         | -- (pages fixes)                                | ++ (flux)                                     | = (dépend du CSS)                                                      | =                                  | ++                  |

Lecture : D et E ne sont pas des moteurs mais des politiques ; elles se combinent avec B. La fidélité de A s'effondre
dès qu'on assainit correctement : c'est l'argument décisif contre son coût.

## 5. Architecture cible et plan de repli

**Cible : B renforcé + D restreint + E.** Dialecte HB-lite rendu dans le navigateur du lecteur, assaini par liste
blanche au seul point d'injection, feuille « livre » maison sur les variables des thèmes, lecture en flux par défaut,
mode page à partir de 768 px et à l'impression. Contenu riche écrit **par le MJ seulement** (récapitulatifs, règles de la
table) ; joueurs en texte brut (NFR-10 inchangé).

**Repli (si le corpus de brews réels du propriétaire montre une divergence inacceptable) :** remplacer le moteur derrière
`renderBrew()` par `marked-hbfm` en version exacte, chargé à la demande, exécuté dans un Web Worker avec délai de 2 s
(repli sur texte échappé), **même** liste blanche, **même** CSS, **même** modèle de données. Si l'on veut un jour
autoriser le CSS du brew : iframe `srcdoc` `sandbox` sans `allow-scripts` ni `allow-same-origin`, avec sa propre CSP —
décision séparée, non recommandée.

### Projet de décisions d'architecture (compatibles AD-1 à AD-15, sans les modifier)

#### AD-16 — Le contenu riche est une source Markdown unique, rendue et assainie à la lecture

- **Binds:** FR-20, FR-21, NFR-1, NFR-10, AD-1, AD-5
- **Prevents:** un HTML stocké jugé sûr parce qu'un client l'a « assaini » ; deux représentations divergentes ; un
  secret du MJ caché dans un commentaire lisible par les joueurs ; un texte démesuré qui fige un téléphone.
- **Rule:** la base ne stocke **jamais** de HTML de contenu. Une colonne de contenu riche est accompagnée d'une colonne
  `*_format` (`plain` | `brew`, défaut `plain`) et d'un `CHECK` de longueur (30 000 caractères). `plain` s'affiche en
  texte échappé ; `brew` passe par `renderBrew()` puis l'assainisseur d'AD-17, dans le navigateur du lecteur. La
  validation à l'écriture (éditeur, MCP) est un confort, jamais une frontière. Tout ce qui est dans la source est réputé
  lisible par les lecteurs de la ligne ; les secrets restent dans les tables privées d'AD-5. Seul le MJ écrit du
  `brew` ; les contenus des joueurs restent en texte brut (NFR-10) sauf décision contraire consignée dans
  `DECISIONS.md`.

#### AD-17 — Assainissement par liste blanche, un seul point d'injection

- **Binds:** NFR-1, NFR-10, AD-9
- **Prevents:** un XSS via Markdown pur, `{{...}}` ou HTML brut ; une fuite par `url()` ou image externe ; un faux écran
  de connexion en `position: fixed` ; un formulaire de hameçonnage ; un `id` qui écrase une variable globale.
- **Rule:** `src/lib/brew/sanitize.ts` est la seule configuration DOMPurify (version épinglée), et `<BrewView>` le seul
  composant autorisé à utiliser `dangerouslySetInnerHTML` (règle ESLint `react/no-danger` avec cette seule exception).
  Balises et attributs : liste de la section 3, question 3. Aucun `style`, `<style>`, `data-*`, SVG, MathML, `form`,
  `iframe`, `object`. Classes filtrées sur `BREW_CLASSES`. `id` préfixés `brew-`. `href` limité à `https:`, `http:` et
  `#`, liens externes en `rel="noopener noreferrer nofollow"`. `src` limité à `asset:<uuid>`, résolu après
  assainissement (AD-20). Un corpus de payloads (dont ceux du POC) tourne en CI ; toute évolution de la liste blanche
  passe par revue de sécurité.

#### AD-18 — Moteur : dialecte HB-lite sur une instance `marked` isolée, derrière une seule interface

- **Binds:** FR-20, FR-21, NFR-2, NFR-7
- **Prevents:** une configuration globale de `marked` contaminée ; une dépendance lourde et non testée dans le bundle des
  joueurs ; un moteur impossible à remplacer.
- **Rule:** `src/lib/brew/render.ts` exporte `renderBrew(source): string` (HTML non sûr, à passer par AD-17) et
  `validateBrew(source): Problem[]`. Implémentation : `new Marked()` local (jamais l'instance globale),
  `marked-extended-tables`, `marked-definition-lists`, extension maison `{{classe[,classe]` / `}}` (blocs et spans) qui
  ne retient que des noms de classes ; `\page` et `\column` deviennent des séparateurs. Le HTML brut est laissé passer
  jusqu'à l'assainisseur. Chargement différé (`import()`) sur les pages qui affichent du `brew`. Un corpus de brews de
  référence (fournis par le MJ, hors dépôt s'ils contiennent du contenu tiers) mesure la compatibilité ; remplacer
  l'implémentation par `marked-hbfm` exige version exacte, Web Worker avec délai et repli texte, et une nouvelle mesure
  du bundle.

#### AD-19 — Style « livre » : feuille maison portée par `.brew`, polices libres auto-hébergées

- **Binds:** FR-24, NFR-8, NFR-6
- **Prevents:** un mode sombre ou un thème cassé par des couleurs en dur ; une police à la licence douteuse dans un dépôt
  public ; un défilement horizontal à 360 px.
- **Rule:** `src/styles/brew.css`, dans une cascade layer, portée par `.brew`, n'utilise que les variables des thèmes
  existants (`--background`, `--foreground`, `--primary`...), testée sur 3 thèmes × clair/sombre (contraste AA). Mode
  **lecture** (une colonne) par défaut ; mode **page** (colonnes, habillage parchemin) à partir de 768 px et en
  `@media print`. Tableaux larges défilants dans leur conteneur. Polices sous licence OFL via `@fontsource`, déclarées
  dans `THIRD-PARTY-NOTICES.md` ; aucune police, image ni feuille de Homebrewery copiée.

#### AD-20 — Images de contenu : bucket privé de campagne, référence par identifiant

- **Binds:** FR-20, FR-21, NFR-1, AD-8
- **Prevents:** le pistage des joueurs par une image externe ; un SVG actif ; la lecture d'images d'une autre campagne.
- **Rule:** bucket privé `campaign-assets` ; objets `<campaign_id>/<uuid>.<ext>` ; PNG, JPEG, WebP, 2 Mo au plus ; lecture
  par les membres de la campagne (premier segment, garde contre un segment non UUID) et le MJ ; écriture et suppression
  MJ seul ; policy restrictive d'AD-4 et tests pgTAP d'AD-14. Le Markdown référence `asset:<uuid>` ; `<BrewView>`
  obtient des URL signées courtes par un hook (AD-12). Aucune URL d'image externe n'est rendue.

#### AD-21 — Valeurs de la CSP

- **Binds:** NFR-5, NFR-10, AD-9
- **Prevents:** une CSP déclarée mais affaiblie par `unsafe-inline` ; une CSP qui casse l'app au déploiement.
- **Rule:** `default-src 'self'; script-src 'self'; style-src 'self' <empreinte de la feuille injectée par sonner>;
img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none';
form-action 'self'; frame-ancestors 'none'`. Le script de thème de `index.html` passe dans un fichier statique (ou une
  empreinte). Mise en service en `Report-Only` sur l'environnement d'essai, puis en mode bloquant ; l'empreinte est
  revérifiée à chaque mise à jour de `sonner`.

#### AD-22 — Bibliothèque « Règles de la table »

- **Binds:** AD-1, AD-4, AD-14, AD-16
- **Prevents:** un homebrew non publié lu par un joueur ; une écriture joueur dans les règles.
- **Rule:** `campaign_rules(id, campaign_id, kind, title, body, body_format, published, sort_order, created_at,
updated_at)`, `kind` ∈ {`spell`, `item`, `subclass`, `rule`, `other`}. Lecture : MJ, et membres si `published`.
  Écriture : MJ seul. RLS activée dans la migration qui crée la table, droits explicites à `authenticated`, matrice
  pgTAP complète.

## 6. Décisions à soumettre au propriétaire

1. **Que veut dire « utiliser Homebrewery » ?** Recommandation par défaut : écrire avec la syntaxe Homebrewery
   (sous-ensemble) et obtenir un rendu « livre » dans l'app ; ni héberger Homebrewery, ni reprendre ses polices.
2. **Accepter qu'un brew collé soit simplifié ?** Positions libres, couleurs, CSS du brew, images externes et diagrammes
   disparaissent à l'affichage ; le texte, les encadrés, les tableaux et les titres restent. Défaut : oui (c'est le prix de
   la sécurité sur Internet).
3. **Qui écrit en texte enrichi ?** Défaut : le MJ seul (récapitulatifs, règles de la table) ; les joueurs gardent le
   texte brut pour notes et commentaires (NFR-10 inchangé, question ouverte 8 close dans ce sens).
4. **Images** : défaut : uniquement des images envoyées dans l'app (pas de lien vers une image d'un autre site).
5. **Calendrier** : défaut : le MVP sort avec des récapitulatifs en texte brut comme prévu ; l'epic « contenu riche »
   suit immédiatement, récapitulatifs d'abord, bibliothèque de règles ensuite. Et : fournir 5 à 10 brews réels pour le
   corpus de compatibilité.

## 7. Découpage proposé pour `epics.md`

Nouvel epic à placer après les epics du MVP (comptes, droits, fiche, notes, récapitulatifs, exposition), sauf la story
CSP qui rejoint l'epic d'exposition.

**Epic « Exposition » (existant ou à créer) — story ajoutée**

- **CSP stricte (AD-21)** : script de thème sorti de `index.html`, empreinte `sonner`, en-tête en `Report-Only` puis
  bloquant ; test qui vérifie l'absence de violation sur les parcours UJ-1 à UJ-3.

**Epic « Contenu riche du MJ (dialecte Homebrewery) »**

1. **Spike et corpus** : corpus de brews réels et de payloads ; `vite build` comparé HB-lite / `marked-hbfm` ; mesure sur
   un téléphone d'entrée de gamme ; décision moteur consignée (AD-18 confirmé ou repli).
2. **Moteur et assainisseur** (AD-17, AD-18) : `src/lib/brew/`, extension `{{classe}}`, configuration DOMPurify, règle
   ESLint `no-danger`, tests Vitest (corpus de payloads, compatibilité).
3. **`<BrewView>` et feuille « livre »** (AD-19) : mode lecture, 3 thèmes × clair/sombre, contraste AA, 360 px sans
   défilement horizontal, polices OFL et `THIRD-PARTY-NOTICES.md`.
4. **Récapitulatif riche** (AD-16) : migration `summary_format` + `CHECK`, éditeur MJ à deux volets avec aperçu 360 px
   et avertissements de `validateBrew`, affichage joueur ; mise à jour du MCP (paramètre `format`, description,
   test de bout en bout).
5. **Images de campagne** (AD-20) : bucket, policies, tests pgTAP, envoi et compression dans l'éditeur, résolution
   `asset:<uuid>` en URL signées.
6. **Bibliothèque « Règles de la table »** (AD-22) : table, RLS, pgTAP, liste et détail côté joueur, édition MJ.
7. **Mode page et impression** : colonnes à partir de 768 px, `@media print`, bascule mémorisée par appareil.
8. _(Conditionnelle, décision 3)_ **Markdown léger pour les notes communes** : sans `{{}}` ni HTML ni images, même
   assainisseur avec une liste plus courte.

Chaque story suit D-04 (revue Opus, corrections, documentation) et porte un contrôle de sécurité explicite (D-06).

## 8. Points restant à vérifier

- Taille réelle du bundle des deux options (`vite build`), non mesurée ici.
- Temps de rendu et d'assainissement sur un téléphone d'entrée de gamme, avec le corpus réel.
- Empreinte CSP de `sonner` stable selon la version, ou alternative sans injection de style.
- Licence exacte des polices OFL retenues, et choix de polices « esprit livre » lisibles à 360 px.
- Correction du préfixage des `id` pour garder les lettres accentuées (défaut du POC, sans effet sécurité).
