// Redraws per minute in a steady session (no events), and asleep before the session.
const { chromium } = require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:1100}});const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()!=='log')errs.push(m.text())});
await p.goto('file://'+path.join(__dirname,'index.html'));await p.waitForTimeout(300);
for(const [name,setup] of [['asleep',"S.started=false;S.activity='idle'"],['working',"wake(Date.now());S.activity='bash';S.context=40;S.subagents=1;W.ambNext=Date.now()+1e9"],['idle',"S.activity='idle';S.context=20;S.subagents=0"]]){
 await p.evaluate(s=>{eval(s);retarget(Date.now());sync();frame(true)},setup);await p.waitForTimeout(name==="asleep"?30000:8000);
 const t0=await p.evaluate(()=>Date.now());await p.waitForTimeout(58000);const n=await p.evaluate(t=>renders.filter(x=>x>=t).length,t0);
 console.log(name,"redraws/min",n);}
console.log('errors',JSON.stringify(errs));await b.close()})();
