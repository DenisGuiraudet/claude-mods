# View contract (lab2)

A view is `view-<id>.js`, loaded after `engine.js`, that sets `VIEWS.<id> = {...}`.
Canvas: viewBox `0 0 1600 1000`, `xMidYMid slice`. Desktop only for now. The chat column covers the middle (about x 400 to 1250 with the sidebar open), so buildings and signs sit on the two side wings and the centre stays calm.
Test page: `index.html` in the same folder (Playwright: `node check.js <view-id>` writes `shot-<id>-*.png`).

## Fields

- `order`, `tag` (genre line, FR), `name` (FR), `desc` (FR, 1 to 2 sentences), `game` (FR, "Inspiré de ..." naming the games).
- `places`: one entry per signal id: `think bash edit read web agents context cost todo waves`. Each entry:
  - `name` in-world name (FR, e.g. "Mine"), `note` legend line (FR, what you see when the signal moves),
  - `node` nav node at the door, `work` node where the worker (and the hero) stand, `work2` optional second worker,
  - `label: [x,y]` sign anchor (bottom of the sign), `fire: [x,y,scale]` flames on error, `fx: [x,y]` coins, sparkles, fireworks anchor.
  - Workers exist for bash (smith), edit (carpenter), read (scribe), web (courier), cost (banker), todo (farmer) when `work` is set.
  - `agents.node` is where adventurers (one per subagent) spawn and return. Hero goes to `places[sig].work` of the active tool, else `home`.
- `nav`: `{nodes:{id:[x,y]}, edges:[[a,b],...]}` or a function returning it (then add `navKey()` returning a string that changes when the graph changes).
- `home` plaza node (idle hero, festival). `wander` villager nodes. `houses` nodes where villagers vanish at night. `spawn` enemy entry nodes (edge or off screen). `front` nodes where enemies prowl and adventurers fight. `patrol` optional. `guards` optional fixed guard nodes. `villagers` count (default 6).
- `pushRoute: [from,to]` and `vehicle(D)` (svg, feet at 0,0, about 60 px wide) for the push convoy. `birdFrom: [x,y]` for the message bird.
- `charScale` (1 = about 36 px tall), `enemyCol: {slime,goblin,ogre}`, `night` multiply colour, `css` extra keyframes (prefix names with `v<id>-`).
- `draw(now,D)` returns `{ground, props:[[sortY,svg]], top, lights:[[x,y,w,h,col]], hud, defs}`. `ground` is everything flat, `props` is anything a character can walk behind (sorted with characters by base y), `top` is over characters (canopies, clouds, foreground framing), `lights` are windows that glow at night, `hud` is a diegetic dial drawn above the weather.
- `mist(D,now)` the context threat (fog, frost, storm, fog of war), drawn above the night tint.
- `sign(x,y,{id,act,col,text,name,value,now,D})` in-world sign renderer (default: wooden plank). Must look like part of the world: hanging shop sign, banner, brass plaque, flag, chalk board.
- `camp` node where the hero sleeps before the session (`D.pre`). `wanderOf(e)` optional per-entity wander list. `ambient`: random events `{id,name,w,when(D),run(now,D)}`, one every 40 to 100 s once the session started. `bake()` returns the static world `{svg,defs}` for `build/bake.js`, which writes `baked.js` (one PNG) and `atlas.js` (tiles still drawn per frame).
- `tick(now,D)` returns true when it needs a redraw. `reset(now)`. `onEvent(type,now)` with type in `prompt error compact merge commit push`.

## D

`m {name,cls,a,b}`, `cls`, `pre` (session not started yet), `wake` (first seconds after the first prompt), `eff` 0..1, `ctx` 0..1, `rate` 0..1, `n` night 0..1, `dusk`, `dawn`, `storm`, `boss` (ctx >= 85 %), `prog` 0..1, `sig` active signal or null, `act`, `waves` array of `merged|current|todo`, `cur`, `fest`, `letter`, `fireOn(sig)`, `now`.
Globals: `S`, `W`, `sigActive(id,now)`, `sigValue(id)`, `sigCol(id,D)`, helpers `clamp f f2 mix tone rnd loop once esc dist pick INK K FONT flames smoke bird`.

## Rules

- Immersive, diegetic: every signal reads inside the world (building state, light, smoke, crowd, weather, things that pile up, a dial on a tower). Signs only name things. No floating UI, no HUD pill.
- Composition like a real game level: no single straight road, use depth, terrain levels, water, landmarks, several paths, framing foreground on the edges, a calm area under the chat column.
- Animation: CSS keyframes through `loop()` and `once()` (negative delays keep the phase across rebuilds), always with `steps()` timing. No SMIL (it keeps Chrome's animation clock busy), no blur filters, no script in the SVG. Light sources that must stay bright at night go in `hud`, with a light flagged as a source (6th field) for a halo without a lit core.
- Budget: whole SVG under 60 000 characters at the busiest moment of the scenario (stats chip shows it); a redraw only when the world changed (`perf.js`, `steady.js` measure it).
