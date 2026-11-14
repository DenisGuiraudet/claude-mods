// Usage: node check.js <view-id> [state...]  -> shot-<view>-<state>.png + errors + SVG sizes
const { chromium } = require('playwright');
const path = require('path');
const view = process.argv[2];
const states = process.argv.slice(3).length ? process.argv.slice(3) : ['day', 'busy', 'night'];
const SETUPS = {
  pre: `S.started=false;S.activity='idle';S.context=0;S.rate=2;S.subagents=0;S.cost=0;S.todoDone=0;S.todoTotal=5;for(const e of W.ents)e.until=0`,
  day: `S.started=true;S.activity='bash';S.context=30;S.rate=25;S.subagents=1;S.cost=1.2;S.todoDone=3;S.todoTotal=7;S.steps={commit:true,push:false,pr:false,merged:false};retarget(Date.now())`,
  busy: `S.started=true;S.activity='edit';S.context=90;S.rate=55;S.subagents=3;S.cost=6;S.todoDone=5;S.todoTotal=7;S.steps={commit:true,push:true,pr:true,merged:false};retarget(Date.now());evError(Date.now());evPrompt(Date.now());evPush(Date.now())`,
  night: `S.started=true;S.activity='thinking';S.context=50;S.rate=95;S.subagents=0;S.cost=3;S.todoDone=7;S.todoTotal=7;S.steps={commit:true,push:true,pr:true,merged:false};retarget(Date.now());evMerge(Date.now())`,
  read: `S.started=true;S.activity='read';S.context=10;S.rate=8;S.subagents=0;S.cost=.3;S.todoDone=0;S.todoTotal=4;S.steps={commit:false,push:false,pr:false,merged:false};retarget(Date.now())`,
  web: `S.started=true;S.activity='web';S.context=65;S.rate=70;S.subagents=2;S.cost=4;S.todoDone=2;S.todoTotal=5;retarget(Date.now());evCompact(Date.now())`,
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, 'index.html'));
  await p.waitForTimeout(500);
  if (view) await p.click(`.view[data-view="${view}"]`);
  for (const st of states) {
    await p.evaluate(s => { eval(s); sync(); frame(true); }, SETUPS[st]);
    for (let i = 0; i < 6; i++) { await p.waitForTimeout(400); await p.evaluate(() => frame(true)); }
    await p.waitForTimeout(st === 'busy' ? 2600 : 2200);
    await p.evaluate(() => frame(true));
    await p.waitForTimeout(700);
    const size = await p.evaluate(() => document.getElementById('scene').innerHTML.length);
    await p.locator('#stage').screenshot({ path: path.join(__dirname, `shot-${view}-${st}.png`) });
    console.log(st, 'svg chars', size);
  }
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
