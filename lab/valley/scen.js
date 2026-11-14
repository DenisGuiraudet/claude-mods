const { chromium } = require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1500,height:1100}});const errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()!=='log')errs.push(m.text())});
await p.goto('file://'+path.join(__dirname,'index.html'));await p.waitForTimeout(400);await p.click('#play');let max=0;
for(let t=0;t<55;t++){await p.waitForTimeout(1000);const n=await p.evaluate(()=>document.getElementById('scene').innerHTML.length);max=Math.max(max,n);if([1,5,31,36,46].includes(t))await p.locator('#stage').screenshot({path:path.join(__dirname,`scen-${t}.png`)})}
console.log('max svg',max,'errors',JSON.stringify(errs));await b.close()})();
