# Brainstorm design, tour 1 : rendu côté joueur et Homebrewery

Animé par Sally (UX Designer). Tour 1 sur 2 : divergence puis convergence côté usage et design. Le tour 2 (architecte,
sécurité) tranchera les points techniques de la section 8.

Sources lues : PRD (§2.3, glossaire, FR-8 à FR-24, NFR-8, NFR-10), `ARCHITECTURE-SPINE.md` (AD-7, AD-8, AD-9),
`DECISIONS.md`, `src/index.css`, `src/pages/SessionDetail.tsx`, `src/lib/pdf-export.ts`, `package.json` de l'app.
Faits Homebrewery vérifiés le 2026-11-15 sur GitHub et le registre npm (lecture seule, aucun code de Homebrewery exécuté).

## 1. Faits vérifiés sur Homebrewery

| Fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Source                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Dépôt `naturalcrit/homebrewery`, « Create authentic looking D&D homebrews using only markdown », branche `master`, dernier push 2026-11-11, environ 1 370 étoiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | https://github.com/naturalcrit/homebrewery                                                               |
| **Licence MIT** (fichier `license`, copyright 2016 Scott Tolksdorf). Le README ajoute que qui vend du contenu doit avoir les droits sur les images et ressources utilisées.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | https://github.com/naturalcrit/homebrewery/blob/master/license                                           |
| C'est une **application complète**, pas une bibliothèque : Express 5, MongoDB (mongoose), React 19, Vite, CodeMirror 6, Less. `package.json` : version 3.24.2, aucun champ `main`, `exports` ni `workspaces` ; le README ne décrit aucune utilisation comme dépendance. `engines.node` est très récent (>=26).                                                                                                                                                                                                                                                                                                                                                                                                                                              | https://github.com/naturalcrit/homebrewery/blob/master/package.json                                      |
| Dossiers `client/`, `server/`, `shared/`, `themes/`, plus `phb.standalone.css` et `faq.md`. Le composant `client/homebrew/brewRenderer/brewRenderer.jsx` dépend de `react-frame-component`, `lodash`, `dedent`, d'une barre d'outils et de thèmes compilés par le serveur (`themeBundle`). Il n'est pas publié en paquet.                                                                                                                                                                                                                                                                                                                                                                                                                                   | https://github.com/naturalcrit/homebrewery/tree/master/client/homebrew/brewRenderer                      |
| **Le moteur Markdown est réutilisable séparément** : paquet npm `marked-hbfm` v1.0.3 (MIT, publié 2026-10-20), dépôt `naturalcrit/marked-hbfm`. API : `render(texte, numeroPage)` renvoie du HTML ; `validate(texte)` renvoie les erreurs (ex. balises HTML non fermées). Entrées ESM (`src/index.js`), CJS, UMD. Dépendances : `marked >=3 <19`, `lodash` et une dizaine de plugins `marked-*` (emoji, variables, tableaux étendus, listes de définitions, indices/exposants, etc.). Le README liste des extensions encore à extraire (blocs mustache, sauts de paragraphe) et dit que le transfert de propriété à NaturalCrit reste à faire : maintenance à surveiller. Le paquet `@naturalcrit/markdown` **n'existe pas** (introuvable au registre npm). | https://github.com/naturalcrit/marked-hbfm ; https://registry.npmjs.org/marked-hbfm                      |
| Le rendu est fait côté client : `marked-hbfm` produit le HTML, injecté par `dangerouslySetInnerHTML` dans un **iframe** (`react-frame-component`) pour qu'un brouillon cassé ne plante pas le site.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `brewRenderer.jsx`                                                                                       |
| **La sanitisation de Homebrewery est faible** : `safeHTML.js` est une **liste noire** (supprime `script`, `noscript`, `noembed`, les attributs `on*`, les valeurs `javascript:`), dérivée de `vue-html-secure`. DOMPurify n'est pas une dépendance. Le CSS utilisateur (`<style>` du brouillon et des thèmes) passe par ce même filtre puis est injecté. Le modèle de menace est un site où chacun lit ses propres pages, pas une table où un auteur écrit pour d'autres.                                                                                                                                                                                                                                                                                   | `client/homebrew/brewRenderer/safeHTML.js` ; `brewRenderer.jsx` (appels vers les lignes 47 et 166 à 168) |
| La syntaxe étendue génère des attributs **`style`, `class`, `id` en ligne** à partir des blocs `{{classe,--var:valeur}}` (blocs, spans, injecteurs `{...}`), et les images deviennent `<img src=... style="--HB_src:url(...)">` : une URL d'image arbitraire est chargée par le navigateur du lecteur (pistage, contenu externe).                                                                                                                                                                                                                                                                                                                                                                                                                           | `marked-hbfm/src/index.js`                                                                               |
| Thèmes V3 : `5ePHB`, `5eDMG`, `Blank`, `Journal`, `UnearthedArcana` (plus `Legacy`), en Less, compilés **côté serveur** ; `phb.standalone.css` à la racine (régénéré par `npm run phb`) ; polices et images dans `themes/V3`. Provenance et licence des polices et illustrations : **à vérifier**.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | https://github.com/naturalcrit/homebrewery/tree/master/themes                                            |
| Mise en page : pages de taille fixe, colonnes CSS, sauts `\page` et `\column` ; impression par le navigateur (touche P). Un paquet tiers voisin (`brewdown`) signale un rendu fiable surtout sous Chrome à cause des colonnes CSS. Lisibilité à 360 px : **à vérifier par prototype** (aucun mode adaptatif documenté).                                                                                                                                                                                                                                                                                                                                                                                                                                     | `brewRenderer.jsx` ; https://github.com/nathonius/brewdown                                               |

À vérifier : taille réelle du bundle `marked-hbfm` + plugins + lodash ; comportement de `render()` hors navigateur (tests
jsdom) ; liste exacte des polices et images avec leur licence ; accessibilité des thèmes (contrastes, hiérarchie de
titres) ; comportement des blocs `{{...}}` face à des entrées hostiles ; coût CPU des expressions régulières du moteur.

Contexte de l'app (vérifié dans le dépôt) : React 19, Tailwind 4, shadcn, i18next, `pdf-lib` déjà présent ; trois
thèmes (défaut, `sylvan`, `arcane`) en variables OKLCH avec variante `.dark` ; `sessions.summary` est aujourd'hui une
`textarea` ; aucun rendu Markdown ni DOMPurify dans `src/`. NFR-10 : notes et commentaires en **texte brut échappé**,
10 000 caractères, CSP déployée (AD-9 : HSTS, CSP, `nosniff`, `frame-ancestors 'none'`). Question ouverte n°8 du PRD :
« texte brut ou Markdown nettoyé ».

## 2. Divergence : 24 idées (sans filtre)

Rendu et intégration

1. Embarquer `marked-hbfm` seul (pas l'application) dans un composant React `<BrewView>`.
2. Héberger l'application Homebrewery complète à côté et l'afficher en iframe (MongoDB en plus sur un QNAP à 2 Go : écarté d'avance).
3. Reprendre seulement le CSS du thème PHB (`phb.standalone.css`) et l'appliquer à un conteneur de rendu.
4. `marked` + DOMPurify avec une **feuille de style maison** inspirée des livres, sans Homebrewery.
5. Rendre dans un **iframe `sandbox` sans `allow-scripts`** avec le CSS du thème en `srcdoc`.
6. Rendre dans un **Shadow DOM** pour isoler le CSS du livre du CSS Tailwind.
7. Précalculer le HTML **à la publication** (MJ) et stocker le HTML assaini en plus du Markdown : le joueur ne rend jamais rien.
8. Rendu serveur (fonction edge) : le client ne reçoit que du HTML déjà assaini.

Expérience téléphone 9. Mode « lecture » : une colonne fluide, polices de l'app, sans fond parchemin ; mode « page » : fond et colonnes du livre. 10. Bascule « Lecture / Page livre » mémorisée par appareil, comme le thème. 11. Les blocs spéciaux (encadré de sort, bloc de stats) se **replient en cartes** sous 480 px. 12. Table des matières (en-têtes) en tiroir pour les longs comptes rendus. 13. Impression/PDF via le mode page (`@media print`), en complément du PDF de fiche existant (`pdf-lib`). 14. Zoom pincer pour lire une « page » entière, comme un PDF, pour les homebrews denses.

Contenus 15. Comptes rendus de séance (`sessions.summary`) en Markdown étendu écrit par le MJ : récit, encadrés « Butin », citations de PNJ. 16. Bibliothèque **« Règles de la table »** par campagne : sorts, objets, sous-classes, règles maison, écrits par le MJ. 17. Homebrew **structuré** (formulaire : nom, niveau, école) qui génère le Markdown plutôt que de le laisser écrire à la main. 18. Historique de personnage (`backstory`) : Markdown léger (gras, listes), pas la syntaxe étendue. 19. Notes communes : Markdown minimal (gras, italique, listes), pas de HTML, pas de `{{...}}`. 20. Notes personnelles et commentaires : **texte brut** (NFR-10), avec simple respect des sauts de ligne. 21. Fiche de personnage : pas de Homebrewery ; une « page imprimable » de la fiche au style livre, en mise en page maison. 22. Renvois `[[Fireball]]` ouvrant une carte du sort (donnée de l'app) ou du homebrew de la campagne.

Édition et gouvernance 23. Éditeur MJ en deux volets (texte | aperçu 360 px) avec `validate()` et liste blanche affichée ; bouton « Publier ». 24. Versionnage léger : conserver les N dernières versions d'un homebrew ou d'un compte rendu publié, sans diff fin.

## 3. Regroupement en pistes

### Piste A : « Homebrewery strict » (moteur hbfm + thème PHB, rendu dans la page ou un iframe)

Embarque `marked-hbfm` et le CSS du thème tels quels pour tout contenu Markdown du MJ.

- Avantages : fidélité maximale au style des livres ; syntaxe connue de la communauté (copier-coller depuis Homebrewery) ; rien à inventer côté rendu.
- Risques : sortie HTML avec `style`, `class`, `id` et URL d'images libres, donc CSP `style-src 'unsafe-inline'` et filtre à écrire (la liste noire amont est insuffisante) ; bundle lourd (lodash et une dizaine de plugins) à mesurer ; licences des thèmes et polices à vérifier ; lisibilité 360 px non démontrée ; module à maintenance en transition.

### Piste B : « Cœur Markdown maison, habillage livre » (marked ou markdown-it + DOMPurify)

Syntaxe réduite (GFM + quelques blocs : encadré, citation, bloc de stats via de petites extensions maison), assainie par **liste blanche**, avec une feuille de style écrite pour les trois thèmes.

- Avantages : sécurité maîtrisée ; contrastes et thèmes conformes à NFR-8 ; responsive natif ; pas de dépendance incertaine ; CSP stricte possible (classes, pas de styles en ligne).
- Risques : on perd la promesse « Homebrewery » (pas de copier-coller direct de contenus existants) ; travail de CSS plus long ; fidélité visuelle moindre au départ.

### Piste C : « Homebrewery pour écrire, l'app ne sert que du HTML assaini » (hybride)

Le MJ rédige (dans un éditeur de l'app avec hbfm, ou dans Homebrewery puis colle le Markdown) ; l'app **assainit à la publication** (côté MJ ou fonction serveur, idées 7 et 8), stocke Markdown source + HTML assaini ; les joueurs ne chargent que le HTML et le CSS livre figé de l'app.

- Avantages : surface d'attaque côté joueur minimale (pas de moteur dans le bundle joueur, un seul point de filtrage) ; compatible CSP stricte ; peu de CPU sur téléphone ; style « livre » conservé.
- Risques : deux représentations à garder cohérentes (source et HTML) ; l'assainissement devient une pièce critique à tester (jeu de payloads) ; étape de publication ou rendu serveur à concevoir ; régénération des contenus quand le thème change.

### Piste D : « Trois niveaux de langage » (texte brut / Markdown léger / Markdown livre)

Quel que soit le moteur : joueurs = texte brut (NFR-10) ; membres pour notes communes et historique = Markdown léger sans HTML ni `{{}}` ; MJ = Markdown étendu livre pour récapitulatifs et homebrew.

- Avantages : respecte NFR-10 pour les joueurs ; étend la richesse là où l'auteur est le MJ unique (D-29, D-30) ; livraison par incréments.
- Risques : trois comportements à expliquer et tester ; frustration d'un joueur qui veut formater ses notes ; un compte MJ compromis reste possible, donc l'assainissement reste nécessaire même pour lui.

### Piste E : « Lecture d'abord, page livre en bonus »

Quel que soit le moteur, le rendu par défaut sur téléphone est un flux simple (une colonne, polices de l'app, thèmes existants) ; le « mode page » (colonnes, fond parchemin, pagination) n'est proposé qu'à partir d'environ 768 px ou à l'impression.

- Avantages : lisible dès 360 px (FR-24, NFR-8) ; cohérent avec les trois thèmes et le mode sombre ; la page livre sert à imprimer ou projeter à la table.
- Risques : deux rendus à maintenir ; le MJ peut mal prévoir ce que voit le joueur (aperçu « téléphone » nécessaire).

## 4. Réponses aux questions du propriétaire (convergence)

1. **Réutilisable** : seul le moteur `marked-hbfm` (MIT) est réutilisable proprement ; le reste est une application serveur + base non conçue comme dépendance. MIT est compatible avec un dépôt public, avec l'obligation de conserver mention de copyright et texte de licence. La MIT couvre le code, pas forcément polices et illustrations : **à vérifier** ; aucun art officiel de Wizards dans le dépôt.
2. **Contenus gagnants** : récapitulatifs de séance (fort), règles et homebrew de la table (fort), historique de personnage (moyen, Markdown léger), notes communes (moyen, Markdown léger). **Non** : notes personnelles et commentaires (NFR-10), fiche de personnage (données structurées, PDF via `pdf-lib`), notes du MJ (secrètes, hors périmètre joueur).
3. **Téléphone** : une page de livre à largeur fixe n'est pas lisible à 360 px sans zoom ; recommandation : flux adaptatif par défaut (piste E), page livre en option, impression en `@media print`.
4. **Qui édite** : MJ = Markdown étendu ; membres = Markdown léger si le propriétaire tranche ainsi la question ouverte n°8, sinon texte brut ; commentaires et notes personnelles = texte brut.
5. **Thèmes et accessibilité** : ne pas importer le thème PHB sans le re-mapper sur les variables de l'app (`--background`, `--foreground`, `--primary`...), sinon le mode sombre et NFR-8 cassent ; vérifier le contraste par thème et par mode ; pas de couleurs en dur dans le contenu (donc restreindre `{{--couleur}}`).
6. **Sécurité** : section 6.
7. **Données** : section 5.

## 5. Modèle de données (propositions, à trancher au tour 2)

- Colonnes `text` avec `CHECK (char_length <= N)` : récapitulatif et homebrew (ex. 50 000), notes communes, notes personnelles et commentaires (10 000, NFR-10).
- Nouvelle table `campaign_rules` (ou `homebrew_entries`) : `campaign_id`, `kind` (`spell|item|subclass|rule|other`), `title`, `markdown`, `published`, `updated_at` ; lecture membres si publié, écriture MJ seul, par campagne ; même patron de policies que AD-7.
- Piste C : colonne `html_sanitized` en lecture seule côté client, écrite par un chemin contrôlé ; **ne jamais faire confiance à un HTML envoyé par un client** sans contrôle serveur.
- Versionnage : table `*_versions` (parent, markdown, auteur, date), 20 dernières versions, pas de diff.
- Images : aucune URL externe ; assets dans un **bucket privé** comme AD-8 (chemin et non URL, URL signées courtes), taille et types bornés ; le Markdown référence un identifiant d'asset.
- Le homebrew vit **par campagne** (une table, un univers) ; des « modèles » du MJ réutilisables entre campagnes viendront plus tard.

## 6. Sécurité : garanties exigées

Constat : Homebrewery suppose un auteur qui lit ses propres pages ; chez nous, le contenu d'un auteur est lu par d'autres sur Internet. Garanties minimales :

- Assainissement par **liste blanche** (DOMPurify ou équivalent) de balises, attributs, classes et schémas d'URL ; jamais la liste noire de `safeHTML.js`. Interdits : `script`, `style`, `link`, `iframe`, `object`, `form`, attributs `on*`, `style`, `srcset`, URL `javascript:` et `data:`.
- Aucun attribut `style` issu du contenu (`{{--var:...}}`), donc pas de `style-src 'unsafe-inline'` ; les variantes visuelles passent par un **jeu fermé de classes** fournies par l'app.
- Pas d'image ni de CSS externe : CSP `script-src 'self'`, `style-src 'self'`, `img-src 'self'` + origine de stockage de l'app, `frame-ancestors 'none'` ; une URL externe est refusée à l'enregistrement et ignorée au rendu.
- Pas de HTML brut dans le Markdown (désactiver le HTML en ligne), liens externes en `rel="noopener noreferrer"`.
- Bornage de taille et de complexité (les regex des blocs mustache peuvent coûter cher : déni de service sur le téléphone d'un joueur) ; test avec un jeu de payloads (XSS, `url()` externe, fuite via `--HB_src`, balises mal fermées).
- NFR-10 respecté : le texte brut des joueurs reste échappé ; toute ouverture au Markdown du contenu des joueurs est une décision explicite du propriétaire, consignée dans `DECISIONS.md`.
- Le contenu du MJ est de confiance **limitée** (compte compromis, contenu tiers collé) : même assainissement que les autres.

## 7. Recommandations de Sally

1. **Retenir D + E** (trois niveaux de langage, lecture d'abord), et tenir la ligne de sécurité de la section 6 quel que soit le moteur.
2. **Moteur** : pour la v1, privilégier la piste B (cœur Markdown à syntaxe réduite, feuille de style « livre » maison avec jeu fermé de classes). La promesse de Homebrewery est surtout visuelle (encadrés, colonnes, titres calligraphiques), atteignable sans attributs `style` libres. Si le propriétaire tient à la compatibilité de copier-coller, adopter la piste C : `marked-hbfm` à la **publication** seulement, sortie assainie par liste blanche, rendu joueur sur HTML propre. Éviter la piste A telle quelle.
3. **Incréments** : (a) récapitulatifs de séance en Markdown étendu, lecture adaptative ; (b) bibliothèque « Règles de la table » ; (c) impression du mode page ; (d) Markdown léger pour notes communes et historique **uniquement si** la question ouverte n°8 le permet.
4. **Mobile** : aperçu 360 px dans l'éditeur du MJ ; tableaux larges défilant dans leur conteneur, jamais la page (FR-24) ; table des matières en tiroir.
5. **Thèmes** : un seul fichier de style « livre » écrit avec les variables de l'app, testé sur 3 thèmes × clair/sombre (contraste AA, NFR-8) ; le parchemin est un habillage, pas un quatrième thème.
6. **i18n** : contenus du MJ en français ; libellés d'interface dans les deux langues (FR-23) ; données de règles en anglais (D-28).
7. **Licences** : fichier de mentions pour toute dépendance MIT embarquée ; rien de Homebrewery (polices, images) sans licence vérifiée ; aucun art ni texte sous licence tierce dans le dépôt public (NFR-6).

## 8. Questions pour le tour 2 (architecte)

1. **Moteur** : A, B ou C ? Mesurer le bundle de `marked-hbfm` + plugins + lodash en production Vite, sa compatibilité React 19 / jsdom (tests), et le temps de rendu sur un téléphone d'entrée de gamme pour 20 pages.
2. **Où assainir** : au rendu (client), à la publication (client MJ) ou en fonction serveur ? Comment garantir qu'un client ne peut pas écrire du HTML dans une colonne lue par d'autres (AD-7 : bornes, `CHECK`, colonnes de lien immuables) ?
3. **Liste blanche** exacte (balises, attributs, classes, schémas d'URL) ; rejet à l'enregistrement ou nettoyage silencieux ; tests de non-régression avec payloads XSS et exfiltration CSS/image.
4. **CSP** : peut-on interdire `style-src 'unsafe-inline'` et les images externes en gardant colonnes et polices ? Polices servies localement (`@fontsource`) ? Valeurs à inscrire dans AD-9.
5. **Iframe `sandbox`, Shadow DOM ou rendu direct** : lequel convient à la CSP, à l'accessibilité (lecteurs d'écran, focus, ancres) et à l'impression ?
6. **Images** : bucket privé dédié (AD-8), référence par identifiant, quota par campagne, types autorisés, redimensionnement.
7. **Modèle de données** : `campaign_rules`, colonnes `markdown` et éventuellement `html_sanitized`, bornes, versions ; impact sur les policies RLS et sur la règle « colonnes privées jamais exposées par `select *` » (FR-15, FR-20).
8. **MCP** : le serveur MCP existant (`dnd_create_note`, `dnd_update_session`...) écrit des notes et récapitulatifs : doit-il écrire du Markdown, sous quelle validation ? C'est une porte d'écriture vers du contenu lu par les joueurs.
9. **Migration** : que devient `sessions.summary` existant (texte brut) ? Traiter comme Markdown léger sans migration, ou ajouter un indicateur de format ?
10. **Impression/PDF** : `@media print` du navigateur ou génération `pdf-lib` (voir `pdf-export.ts`) ? Les deux sont-ils nécessaires ?
11. **Licences** : processus de mentions tierces dans un dépôt public ; provenance de toute police ou image reprise du thème PHB ; politique sur le contenu officiel D&D.
12. **Maintenance** : `marked-hbfm` a un propriétaire en transition et de nombreux plugins à versions épinglées : accepter la dépendance, la « vendoriser » (copie figée avec mention MIT) ou la remplacer ?
13. **À porter au propriétaire** : confirmer que « utiliser Homebrewery » signifie « rendu et style Homebrewery » et non « héberger l'application Homebrewery » ; arbitrer le périmètre de Markdown pour les joueurs (question ouverte n°8 du PRD, NFR-10).
