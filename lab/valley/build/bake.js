// Bakes the static world of the Valley into one palette PNG (baked.js) and packs every tile that is
// still drawn per frame into a small atlas (atlas.js). Usage: node bake.js <lab dir>
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const lab = path.resolve(process.argv[2]);
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const page = src => `<!doctype html><meta charset=utf-8><style>html,body{margin:0;background:#000}</style><body>${src}<script src="file://${lab}/sheets.js"></script><script src="file://${lab}/actors.js"></script><script src="file://${lab}/engine.js"></script><script src="file://${lab}/view-valley.js"></script>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1632, height: 1008 }, deviceScaleFactor: 1 });
  fs.writeFileSync(path.join(out, 'bake.html'), page(''));
  await p.goto('file://' + path.join(out, 'bake.html'));
  // 1. static world at 3x, then sampled down to 1x in Python
  const svg = await p.evaluate(() => {
    const B = VIEWS.valley.bake();
    TUSE = new Set(['t0', ...[...B.svg.matchAll(/href="#([tdf]\d+)"/g)].map(m => m[1])]);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1632" height="1008" viewBox="0 0 1632 1008"><defs>${B.defs}${tileDefs()}</defs>${B.svg}</svg>`;
  });
  await p.setContent(`<style>html,body{margin:0}</style>${svg}`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(out, 'static3x.png'), clip: { x: 0, y: 0, width: 1632, height: 1008 } });
  // 2. every tile a frame can still ask for: sprites, tools, plus what the scenario draws
  await p.goto('file://' + path.join(out, 'bake.html'));
  const ids = await p.evaluate(async () => {
    const all = new Set(), V = VIEWS.valley;
    window.BAKED = 'x';
    const grab = () => { compose(Date.now()); const stat = new Set(['t0', ...[...V.bake().svg.matchAll(/href="#([tdf]\d+)"/g)].map(m => m[1])]); for (const id of TUSE) if (!stat.has(id)) all.add(id); };
    for (const [k, v] of Object.entries(V.sprites)) if (!(V.actors && V.actors[k])) typeof v === 'string' ? all.add(v) : Object.values(v).forEach(x => all.add(x));
    Object.values(V.tools).forEach(x => all.add(x));
    ['d104', 't57', 'd89', 'd91', 'd92', 't102', 'd54', 'f120', 'f121', 'f122'].forEach(x => all.add(x));
    [64, 66, 4, 6, 16, 18, 28, 30, 40, 42, 52, 54].forEach(i => all.add('f' + i));
    newWorld(Date.now());
    for (const st of [{ started: false }, { started: true, activity: 'bash', context: 90, cost: 7, subagents: 3, todoDone: 4, todoTotal: 10 }, { activity: 'edit' }, { activity: 'read' }, { activity: 'web' }, { activity: 'thinking' }]) {
      Object.assign(S, st); for (let i = 0; i < 6; i++) { step(Date.now() + i * 4000); grab(); }
    }
    return [...all].sort();
  });
  fs.writeFileSync(path.join(out, 'atlas-ids.json'), JSON.stringify(ids));
  // 3. atlas: 8 tiles per row, cut from the sheets
  const cols = 8, rows = Math.ceil(ids.length / cols);
  const shot = await p.evaluate(async ({ ids, cols, rows }) => {
    const c = document.createElement('canvas'); c.width = cols * 16; c.height = rows * 16; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    const img = {};
    for (const k of ['t', 'd', 'f']) { img[k] = new Image(); img[k].src = SHEETS[k]; await img[k].decode(); }
    ids.forEach((id, n) => { const k = id[0], i = +id.slice(1); x.drawImage(img[k], (i % 12) * 16, Math.floor(i / 12) * 16, 16, 16, (n % cols) * 16, Math.floor(n / cols) * 16, 16, 16); });
    return c.toDataURL('image/png');
  }, { ids, cols, rows });
  fs.writeFileSync(path.join(out, 'atlas-raw.png'), Buffer.from(shot.split(',')[1], 'base64'));
  await b.close();
  execFileSync('python3', ['-I', path.join(__dirname, 'pack.py'), out], { stdio: 'inherit' });
  const b64 = f => fs.readFileSync(path.join(out, f)).toString('base64');
  fs.writeFileSync(path.join(lab, 'baked.js'), `// Static world of the Valley, baked by build/bake.js (Kenney CC0 tiles + hand-made pixels).\nconst BAKED='data:image/png;base64,${b64('static.png')}';\n`);
  fs.writeFileSync(path.join(lab, 'atlas.js'), `// Tiles still drawn per frame, packed by build/bake.js from Kenney Tiny Town, Tiny Dungeon, Tiny Farm (CC0).\nconst ATLAS={cols:${cols},ids:${JSON.stringify(ids)},src:'data:image/png;base64,${b64('atlas.png')}'};\n`);
  console.log('atlas tiles', ids.length, '| baked.js', fs.statSync(path.join(lab, 'baked.js')).size, 'B | atlas.js', fs.statSync(path.join(lab, 'atlas.js')).size, 'B');
})();
