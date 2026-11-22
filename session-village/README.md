# Session Village

Un village de jeu de rôle en pixel art, derrière la conversation de Claude Code dans l'app Desktop. Le village vit au rythme de la session : le modèle, l'effort, le contexte, la limite 5 h, le coût, l'outil en cours, les tâches, les sous-agents et les waves de PR se lisent dans le décor. Le centre reste un pré calme sous la conversation.

## Installation

Dans Claude Code :

```
/plugin marketplace add DenisGuiraudet/claude-mods
/plugin install session-village@denis-claude-mods
```

Ou depuis un terminal :

```
claude plugin marketplace add DenisGuiraudet/claude-mods
claude plugin install session-village@denis-claude-mods
```

Le dépôt sert lui-même de marketplace (`denis-claude-mods`, dans `.claude-plugin/marketplace.json`) : le mod s'installe depuis sa branche par défaut, `main`. Pour passer à la dernière version, puis redémarrer l'app :

```
claude plugin marketplace update denis-claude-mods
claude plugin update session-village@denis-claude-mods
```

Il faut Claude Code v2.1.323 ou plus récent. Le fond s'affiche dans l'app Desktop. Le terminal, VS Code et l'app mobile gardent leur fond habituel. Le village se place de part et d'autre de la colonne de conversation, pour que ses bâtiments restent visibles, et suit le redimensionnement de la fenêtre aussitôt. Quand la place manque à côté de la colonne, il se réduit, centré en hauteur, jusqu'à 50 % de la hauteur de la fenêtre. Quand même cela ne suffit pas, il reprend toute la hauteur : le pré de part et d'autre de la rivière rétrécit d'abord, les bâtiments restent entiers, puis les bords passent sous les marges. Au-delà de la carte, l'herbe continue, un peu assombrie. Sur une fenêtre basse, les panneaux grossissent pour rester lisibles.

## Ce que montre chaque lieu

Sur chaque lieu, un panneau indique ce qu'il suit : l'outil (Bash, Edit, Write…) ou la mesure et sa valeur (« Context · 44% », « Cost · $3.00 »). Le panneau du lieu actif se balance.

À droite, la partie visible même avec la barre latérale ouverte :

| Lieu | Signal | Ce qui change |
|---|---|---|
| Château | Waves de PR | Une tour par wave : finie et pavoisée si mergée, chantier qui monte avec l'avancement, bannière quand la PR est ouverte |
| Tour du mage | Modèle, effort, limite 5 h | Le cristal prend la couleur du modèle et grossit quand Claude réfléchit, ses éclats tournent plus vite avec l'effort ; le sablier se vide avec la limite 5 h |
| Bois hanté et tour de guet | Contexte | La brume violette monte avec le contexte, les monstres la suivent, un démon géant au-delà de 85 % ; le brasier vire au violet au-delà de 60 % |
| Banque | Coût | Les pièces s'empilent, le coffre s'ouvre, puis devient un mimique au-delà de 5 $ |

À gauche :

| Lieu | Signal | Ce qui change |
|---|---|---|
| Mine | Bash | Le four rougeoie, le wagonnet roule |
| Atelier | Edit, Write | Copeaux et cheminée qui fume |
| Bibliothèque | Read, Grep, Glob | Vitres bleues, pages qui tournent |
| Poste | Web, outils MCP (sauf ceux de l'app elle-même), message envoyé | Pigeons, drapeau de la boîte aux lettres |
| Ferme | Tâches (TodoWrite, TaskCreate, TaskUpdate, liste de tâches de l'app Desktop) | Une parcelle par tâche, mûre une fois faite. Dix parcelles au plus : au-delà, elles gardent la proportion de tâches faites, et le panneau donne le vrai compte |
| Guilde | Sous-agents | Une bannière et un aventurier par sous-agent, quatre au plus : les aventuriers traversent la carte pour combattre dans le bois, le panneau donne le vrai compte |

Partout :

- **Héros** : le modèle choisit le héros (mage, chevalier, rôdeur, barde) ; il va au lieu de l'outil en cours.
- **Ciel** : la limite 5 h fait passer le jour, du matin à la nuit, puis la pluie au-delà de 90 %.
- **Avant le premier message** : le village dort, le héros près d'un feu de camp, une quête attend sur le panneau. Le premier message fait lever le soleil, tout comme un premier tour lancé par une commande ou un skill.
- **Après `/clear`** : les tâches, les sous-agents et le contexte repartent de zéro.
- **Événements** : une erreur d'outil met le feu au bâtiment concerné, une compaction chasse les monstres, un commit fait briller le château, un push envoie une charrette de la poste au château, un merge lance une fête et des feux d'artifice.
- **Au hasard** : un marchand, un barde, un pêcheur, un fantôme, une étoile filante, des oiseaux, l'ombre d'un nuage ou d'un dragon, toutes les 40 à 100 secondes.

Les waves suivent la branche git courante. Un titre de PR contenant `[2/4]` fixe la wave en cours et le nombre total. Une PR ouverte se lit dans l'outil GitHub, dans `gh pr create` ou dans un événement de PR suivi. Un merge, par l'outil GitHub, par `gh pr merge` (sans `--auto`) ou par un événement de PR suivi, passe à la wave suivante.

## Commandes

| Commande | Effet |
|---|---|
| `/village` | Ouvre ou ferme la légende : chaque lieu, sa valeur en direct et ce qu'il faut regarder. Le lieu actif est mis en avant. |
| `/village-margins` | Règle la place laissée à gauche et à droite du village, et la largeur de la colonne de conversation (voir plus bas). |
| `/village-sync` | Règle le temps entre deux images du décor, en secondes : `/village-sync 0.5`, `/village-sync 2`, `/village-sync 1` pour revenir au défaut. Entre 0,1 et 10 s (dix images par seconde, le plus que l'app accepte). Va dans le réglage `frame_interval`, ou reste gardé par le mod comme les marges. |
| `/village-test` | Indique combien d'images du fond l'app a dessinées pendant la dernière minute, et à quel rythme. |
| `/village-debug` | Fait le point en texte : version de Claude Code, décor dessiné ou non, images (nombre, rythme, taille), horloge, état de la session, personnages et effets, marges, taille que l'app donne au décor (en caractères) et ses changements, événements reçus (dont le dernier événement GitHub tel qu'il arrive), puis une série de vérifications sur la dernière image. |

## Marges

Le fond couvre toute la fenêtre, y compris sous la barre latérale et les panneaux. Pour que le village tienne dans la partie visible, il laisse par défaut 420 px à gauche et 320 px à droite, à peu près la barre latérale de l'app et un panneau ouvert. Une marge est entière à partir de 1 600 px de large, diminue en dessous et disparaît sous 700 px. Tu peux régler chaque marge séparément, en pixels :

```
/village-margins left 285
/village-margins right 410
```

`/village-margins 285 410` règle les deux d'un coup, `0` retire une marge, et la commande seule affiche les valeurs en cours. Le village se redessine aussitôt, et l'herbe assombrie continue sous les marges. Les valeurs vont dans les réglages du plugin (`margin_left` et `margin_right`, dans `pluginConfigs` de `settings.json`). Quand l'app ne propose pas ces réglages, par exemple pour un plugin chargé depuis un dossier local, le mod les garde lui-même pour les sessions suivantes. Si le réglage change ensuite dans l'app, c'est lui qui compte.

### Colonne de conversation

Les bâtiments restent en dehors de la colonne de conversation, que l'app centre entre la barre latérale et le panneau de droite. Le mod compte 768 px, la largeur par défaut de l'app (960 ou 1 280 px quand la conversation est réglée plus large), plus 16 px de chaque côté. Pour une autre largeur :

```
/village-margins column 960
```

`0` retire la colonne : seule la rivière sépare alors les deux parties du village, à toute la hauteur de la fenêtre. La valeur va dans le réglage `column_width`.

### Marges par clics

Tape `/village-margins click`, puis clique deux fois sur le village : juste à droite de la barre latérale, puis juste à gauche du panneau de droite (ou près du bord droit de la fenêtre quand aucun panneau n'est ouvert). Un trait blanc marque le premier clic. Les marges deviennent des parts de la largeur de la fenêtre, à 1/64 près (la précision des clics que l'app transmet), et suivent la fenêtre quand elle change de taille. La barre latérale garde pourtant sa largeur en pixels : après un gros redimensionnement, ou quand tu ouvres ou fermes un panneau, refais les deux clics. Le mod attend les clics deux minutes au plus. Régler une marge en pixels remplace les marges par clics.

## Comment le fond est dessiné

- **En tracés vectoriels** : l'app Desktop n'affiche pas les images intégrées à une scène. Chaque suite de pixels d'une même couleur sur une ligne est donc un trait. L'herbe est un motif répété, les cases du décor présentes plusieurs fois sont dessinées une seule fois, et un personnage n'envoie que ce qu'il montre (debout, la marche, l'attaque).
- **Dans un cadre isolé** : le fond est dessiné dans un cadre à part (sans script) plutôt que comme une image. Ses animations CSS y tournent entre deux images, même quand l'app tourne sans accélération matérielle : vu dans l'app Desktop sous Windows, pour environ un tiers d'un cœur de processeur à une image par seconde. Avec l'accélération, elles tournent en continu, pour environ deux cœurs en plein travail.
- **Image par image** : les animations sont en CSS, par paliers. Quand l'app fige malgré tout le fond (par exemple avec le réglage « Réduire les animations »), elle retire toutes les animations. Chaque élément animé porte donc aussi sa position du moment, et la scène reste juste image par image. Une boucle plus rapide que la seconde (pas de marche, clignements, flammes) avance alors d'un cran par image au lieu de sauter au hasard, et un effet court (fumée, pièces, sort) reste au moins 3 secondes pour se voir sur plusieurs images. Avec des images plus rapprochées (`/village-sync 0.25` ou `0.1`), une boucle garde sa vraie vitesse dès que les images suffisent à en montrer chaque cran.
- **Une seconde** : le monde avance chaque seconde (réglable avec `/village-sync`, pour essayer une autre machine). Une image part quand quelque chose a changé, ou tant que quelqu'un marche ou qu'un effet joue. Au repos (tour fini, aucun sous-agent), le village ralentit : après 2 minutes sans événement de la session, une image toutes les 5 secondes au plus, puis, après 10 minutes, le village laisse place à un fond d'herbe uni jusqu'au prochain signal. Même immobile, le village coûte à l'app environ 0,7 cœur de processeur avec l'accélération matérielle, car elle continue de le redessiner ; le fond uni ne coûte presque rien. Une image montre le monde à l'heure où elle a été demandée, pas à celle où l'app la dessine : les pas restent réguliers même quand l'app dessine avec un peu de retard. Les villageois marchent à mi-vitesse, pour avancer de moins d'une case d'une image à l'autre. En simulation sur dix minutes : aucune image avant le premier message, environ 60 par minute ensuite. Mesuré dans l'app avec `/village-test` : 60 images dessinées en une minute, une par seconde.
- **Mise en page** : l'app ne donne pas la taille de la fenêtre en pixels. Le décor se place donc en CSS, avec les unités `vw` et `vh` : le monde est dessiné trois fois, à la hauteur de la fenêtre ou moins, et chaque copie est découpée (partie gauche, rivière, partie droite). Pour réduire le village, le CSS divise une longueur par une autre. Un navigateur qui ne sait pas le faire garde le village à toute la hauteur. Chaque copie ne dessine que sa part du sol. Il suit la fenêtre sans attendre une nouvelle image.
- **Taille** : une image fait environ 85 000 caractères au repos et parfois plus de 120 000 en plein travail (six ou sept personnages en marche), sous la limite de 131 072. Au-delà de cette limite, les personnages en marche glissent sur leur image debout.

## Développer le mod

Pour charger le mod depuis un clone du dépôt plutôt que depuis le marketplace, désactive la version installée, puis ajoute dans `~/.claude/settings.json` :

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "<chemin du clone>/session-village",
  "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
}
```

Le mod se recharge à la fin de chaque tour. Pour vérifier une modification :

```
claude plugin test session-village
claude plugin validate session-village
```

Les tests tournent sans session ni réseau. Le code tient en trois fichiers : `hooks/register.tsx` (événements, commandes, réglages), `hooks/world.js` (le monde et son dessin) et `hooks/data/vector.js` (le décor, les tuiles et les personnages en tracés).

### Revenir à la version du marketplace

Retire `CLAUDE_CODE_PLUGIN_DIRS` et `CLAUDE_CODE_PLUGIN_DIR_WATCH` de `~/.claude/settings.json`, sinon le mod se charge aussi depuis le clone. Installe ensuite le plugin comme plus haut, ou réactive-le s'il est déjà installé :

```
claude plugin enable session-village@denis-claude-mods
```

Chargé depuis le clone, le mod s'appelle `session-village@inline` : ses réglages sont rangés sous ce nom dans `pluginConfigs`, et ses données dans `~/.claude/plugins/store/session-village_inline-….json`. La version du marketplace, `session-village@denis-claude-mods`, ne les reprend pas. Refais `/village-margins` et `/village-sync` si tu les avais changés, ou passe les réglages à l'installation :

```
claude plugin install session-village@denis-claude-mods --config frame_interval=0.1
```

## Crédits

- Tuiles : [Tiny Town](https://opengameart.org/content/tiny-town), [Tiny Dungeon](https://opengameart.org/content/tiny-dungeon) et [Tiny Farm](https://opengameart.org/content/tiny-farm) de Kenney, licence CC0.
- Personnages animés : [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) de Pixel-boy et AAA, licence CC0.
- Eau, pont, sablier, bannières, feu de camp, brume et effets : dessinés pour ce mod.

Le code est sous licence MIT (voir `LICENSE`).
