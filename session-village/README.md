# Session Village

Un village de jeu de rôle en pixel art, derrière la conversation de Claude Code dans l'app Desktop. Le village vit au rythme de la session : le modèle, l'effort, le contexte, la limite 5 h, le coût, l'outil en cours, les tâches, les sous-agents et les waves de PR se lisent dans le décor. Le centre reste un pré calme sous la conversation.

## Installation

```
/plugin install session-village --marketplace DenisGuiraudet/claude-mods
```

Le fond s'affiche dans l'app Desktop. Le terminal, VS Code et l'app mobile gardent leur fond habituel.

## Ce que montre chaque lieu

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
| Poste | Web, outils MCP, message envoyé | Pigeons, drapeau de la boîte aux lettres |
| Ferme | Tâches (TodoWrite, TaskCreate, TaskUpdate) | Une parcelle par tâche, mûre une fois faite |
| Guilde | Sous-agents | Une bannière par sous-agent, des aventuriers qui traversent la carte pour combattre dans le bois |

Partout :

- **Héros** : le modèle choisit le héros (mage, chevalier, rôdeur, barde) ; il va au lieu de l'outil en cours.
- **Ciel** : la limite 5 h fait passer le jour, du matin à la nuit, puis la pluie au-delà de 90 %.
- **Avant le premier message** : le village dort, le héros près d'un feu de camp, une quête attend sur le panneau. Le premier message fait lever le soleil.
- **Événements** : une erreur d'outil met le feu au bâtiment concerné, une compaction chasse les monstres, un commit fait briller le château, un push envoie une charrette de la poste au château, un merge lance une fête et des feux d'artifice.
- **Au hasard** : un marchand, un barde, un pêcheur, un fantôme, une étoile filante, des oiseaux, l'ombre d'un nuage ou d'un dragon, toutes les 40 à 100 secondes.

Les waves suivent la branche git courante. Un titre de PR contenant `[2/4]` fixe la wave en cours et le nombre total. Un merge, par l'outil GitHub ou par un événement de PR suivi, passe à la wave suivante.

## Légende

`/village` ouvre ou ferme un panneau qui liste chaque lieu, sa valeur en direct et ce qu'il faut regarder. Le lieu actif est mis en avant.

## Performance

L'app Desktop n'affiche pas les images intégrées à une scène, donc tout le pixel art est en tracés vectoriels : chaque suite de pixels d'une même couleur sur une ligne est un trait. L'herbe est un motif répété, les cases du décor présentes plusieurs fois sont dessinées une seule fois, et un personnage n'envoie que ce qu'il montre (debout, la marche, l'attaque). Les animations sont en CSS, par paliers. Quand l'app Desktop fige le fond (réglage « Réduire les animations », rendu sans accélération matérielle), elle retire toutes les animations : chaque élément animé porte donc aussi sa position du moment, et la scène reste juste image par image. Le monde avance toutes les 5 à 8 secondes et une image n'est envoyée que si quelque chose a changé, ou toutes les 1,5 seconde tant que quelqu'un marche ou qu'un effet joue. Les villageois marchent à mi-vitesse, pour n'avancer que d'environ une case d'une image à l'autre. En simulation sur dix minutes : aucune image avant le premier message, environ 40 par minute ensuite, au repos comme en plein travail. Mesuré dans l'app avec `/village-test` : 36 images dessinées sur 37 demandées en une minute, une toutes les 1,7 seconde en moyenne. Une image fait environ 80 000 caractères au repos et jusqu'à 120 000 en plein travail, sous la limite de 131 072 : au-delà de 120 000, les personnages en marche glissent sur leur image debout.

## Crédits

- Tuiles : [Tiny Town](https://opengameart.org/content/tiny-town), [Tiny Dungeon](https://opengameart.org/content/tiny-dungeon) et [Tiny Farm](https://opengameart.org/content/tiny-farm) de Kenney, licence CC0.
- Personnages animés : [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) de Pixel-boy et AAA, licence CC0.
- Eau, pont, sablier, bannières, feu de camp, brume et effets : dessinés pour ce mod.

Le code est sous licence MIT (voir `LICENSE`).
