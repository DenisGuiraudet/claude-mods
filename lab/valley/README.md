# Labo de La Vallée

Le banc d'essai du mod `valley` : la même scène que le mod, pilotée à la main ou par un scénario, avec la maquette de l'app Desktop par-dessus.

Ouvrir `index.html` dans un navigateur. Le moteur (`engine.js`) et la carte (`view-valley.js`) sont les sources : le mod en est généré.

## Refaire les fichiers générés

Le décor fixe et l'atlas des tuiles animées, après un changement de la carte (Playwright et Python 3 avec Pillow) :

```bash
node build/bake.js .
```

Les personnages animés, depuis le pack [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) téléchargé et décompressé :

```bash
python3 -I build/actors.py "/chemin/vers/Ninja Adventure - Asset Pack" actors.js
```

Le module du mod, à partir du labo :

```bash
node build/mod.js . ../../valley/hooks
```

## Mesurer

```bash
node check.js valley pre day busy night
```

```bash
node perf.js
```

```bash
node steady.js
```

```bash
node scen.js
```

`check.js` fait des captures de chaque état, `perf.js` mesure le poids, le calcul au repos et les redessins, `steady.js` compte les redessins par minute, `scen.js` déroule le scénario complet. `VIEW_CONTRACT.md` décrit ce qu'une carte doit fournir au moteur.
