// Usage: node perf.js [dir]  -> per state: SVG size, animations, CPU per second while idle, redraw time; plus redraws/min over the scenario.
const { chromium } = require('playwright');
const path = require('path');
const dir = process.argv[2] || __dirname;
const SETUPS = {
  pre: `if(typeof S.started!=='undefined'){S.started=false};S.activity='idle';S.context=0;S.rate=0;S.subagents=0;S.cost=0;S.todoDone=0;S.todoTotal=0;retarget(Date.now())`,
  day: `S.started=true;S.activity='bash';S.context=30;S.rate=25;S.subagents=1;S.cost=1.2;S.todoDone=3;S.todoTotal=7;S.steps={commit:true,push:false,pr:false,merged:false};retarget(Date.now())`,
  busy: `S.started=true;S.activity='edit';S.context=90;S.rate=55;S.subagents=3;S.cost=6;S.todoDone=5;S.todoTotal=7;S.steps={commit:true,push:true,pr:true,merged:false};retarget(Date.now());evError(Date.now());evPrompt(Date.now());evPush(Date.now())`,
  night: `S.started=true;S.activity='thinking';S.context=50;S.rate=95;S.subagents=0;S.cost=3;S.todoDone=7;S.todoTotal=7;S.steps={commit:true,push:true,pr:true,merged:false};retarget(Date.now());evMerge(Date.now())`,
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.join(dir, 'index.html'));
  await p.waitForTimeout(500);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  // stop the page loop so only the SVG's own animations run
  await p.evaluate(() => { window.__frame = frame; window.frame = () => {}; });
  for (const st of Object.keys(SETUPS)) {
    await p.evaluate(s => { eval(s); sync(); }, SETUPS[st]);
    // let the simulation settle, then draw once
    await p.evaluate(async () => { for (let i = 0; i < 12; i++) { step(Date.now()); await new Promise(r => setTimeout(r, 250)); } });
    const redraw = await p.evaluate(async () => {
      const t0 = performance.now();
      const svg = compose(Date.now());
      const t1 = performance.now();
      document.getElementById('scene').innerHTML = svg;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { size: svg.length, build: Math.round(t1 - t0), show: Math.round(performance.now() - t1) };
    });
    await p.waitForTimeout(1000);
    const a = await metric();
    await p.waitForTimeout(5000);
    const z = await metric();
    const info = await p.evaluate(() => ({ css: document.getAnimations().length, smil: document.querySelectorAll('#scene animate,#scene animateMotion,#scene animateTransform').length, nodes: document.querySelectorAll('#scene *').length }));
    const per = k => Math.round(((z[k] - a[k]) / 5) * 1000);
    console.log(st.padEnd(6), `svg ${(redraw.size / 1024).toFixed(1)} ko`, `| build ${redraw.build} ms, show ${redraw.show} ms`, `| ${info.nodes} nodes, ${info.css} css anims, ${info.smil} smil`, `| idle cpu ms/s: task ${per('TaskDuration')}, style ${per('RecalcStyleDuration')}, layout ${per('LayoutDuration')}`);
  }
  // redraw rate over the scenario with the normal loop
  await p.evaluate(() => { window.frame = window.__frame; });
  await p.click('#play');
  const sizes = [];
  for (let t = 0; t < 54; t++) { await p.waitForTimeout(1000); sizes.push(await p.evaluate(() => document.getElementById('scene').innerHTML.length)); }
  const n = await p.evaluate(() => renders.filter(x => x > Date.now() - 54000).length);
  console.log(`scenario: ${n} redraws in 54 s (${Math.round(n / 54 * 60)}/min), max svg ${(Math.max(...sizes) / 1024).toFixed(1)} ko`);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})();
