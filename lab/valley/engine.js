'use strict';
// Shared engine for every view: session state, path-graph simulation, characters and SVG composition.
// A view registers itself in VIEWS (see VIEW_CONTRACT.md). The output is one script-free SVG,
// rebuilt only when the world changes (a few times a minute). Loops keep their phase with negative
// delays; walks are CSS keyframes (no SMIL: it keeps the animation clock busy and costs CPU).

// ---------- helpers ----------
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const f=n=>Math.round(n*10)/10;
const f2=n=>Math.round(n*100)/100;
const hx=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(c1,c2,t)=>{const a=hx(c1),b=hx(c2);return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*clamp(t)).toString(16).padStart(2,'0')).join('')};
const tone=(c,k)=>k<0?mix(c,'#000000',-k):mix(c,'#ffffff',k);
const rnd=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const loop=(name,dur,now,ease='ease-in-out',phase=0)=>`animation:${name} ${dur.toFixed(2)}s ${ease} infinite;animation-delay:-${(((now+phase)/1000)%dur).toFixed(2)}s`;
const once=(name,dur,since,stagger=0,ease='ease-out')=>`animation:${name} ${dur}s ${ease} 1 both;animation-delay:${(stagger-since/1000).toFixed(2)}s`;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const pick=(a,r=Math.random)=>a[Math.floor(r()*a.length)];
const INK='#2a2230';
const K='class="o"'; // outline: see .o in CSS
const FONT=`font-family="system-ui,-apple-system,'Segoe UI',sans-serif"`;

// ---------- session ----------
const MODELS={
  opus:{name:'Opus 5.5',cls:'Mage',a:'#8f62f5',b:'#ff7ac8'},
  sonnet:{name:'Sonnet 5.5',cls:'Chevalier',a:'#1fae97',b:'#52b6ff'},
  haiku:{name:'Haiku 5.5',cls:'Éclaireur',a:'#4fae3a',b:'#d9e85a'},
  fable:{name:'Fable 5.2',cls:'Barde',a:'#e8951a',b:'#ff7a52'},
};
const CLASS={opus:'mage',sonnet:'knight',haiku:'scout',fable:'bard'};
const EFFORT={low:.15,medium:.35,high:.6,xhigh:.82,max:1};
const EFFORT_KEYS=Object.keys(EFFORT);
// started: false until the first prompt of the session (the village sleeps).
const S={started:false,model:'opus',effort:'high',activity:'idle',context:0,rate:2,cost:0,subagents:0,
  wavesTotal:4,waveCurrent:2,todoDone:0,todoTotal:5,steps:{commit:true,push:false,pr:false,merged:false}};
function waveState(i){if(i<S.waveCurrent)return 'merged';if(i===S.waveCurrent)return S.steps.merged?'merged':'current';return 'todo'}
function progress(){const st=S.steps,t=S.todoTotal?Math.min(1,S.todoDone/S.todoTotal):0;return st.merged?1:Math.min(.96,.6*t+(st.commit?.14:0)+(st.push?.12:0)+(st.pr?.1:0))}

// One place per signal. Each view gives its own name, building and in-world sign.
const SIG={
  think:{col:null,what:'Réflexion, effort'},
  bash:{col:'#e0533f',what:'Bash'},
  edit:{col:'#e9a83a',what:'Edit, Write'},
  read:{col:'#4b93e0',what:'Read, Grep'},
  web:{col:'#2bb3a3',what:'Web, messages'},
  agents:{col:'#ee7d3c',what:'Sous-agents'},
  context:{col:'#8b63e0',what:'Contexte'},
  cost:{col:'#e2b63a',what:'Coût'},
  todo:{col:'#6dbb4c',what:'Tâches'},
  waves:{col:'#9aa3c7',what:'Waves, PR, merge'},
};
const ACT_SIG={thinking:'think',bash:'bash',edit:'edit',read:'read',web:'web'};
const sigCol=(id,D)=>SIG[id].col||D.m.a;
function sigActive(id,now){switch(id){
  case 'think':return S.activity==='thinking';
  case 'bash':case 'edit':case 'read':return ACT_SIG[S.activity]===id;
  case 'web':return S.activity==='web'||now<W.letterUntil;
  case 'agents':return S.subagents>0;
  case 'context':return S.context>=60;
  case 'cost':return now<W.costPulse;
  case 'todo':return now<W.todoPulse;
  case 'waves':return (S.steps.pr&&!S.steps.merged)||now<W.festUntil;}return false}
function sigValue(id){switch(id){
  case 'think':return S.activity==='thinking'?`Réflexion ${S.effort}`:`Effort ${S.effort}`;
  case 'bash':return 'Bash';case 'edit':return 'Edit';case 'read':return 'Read';case 'web':return 'Web';
  case 'agents':return `${S.subagents} sous-agent${S.subagents>1?'s':''}`;
  case 'context':return `${S.context} %`;
  case 'cost':return `$${S.cost.toFixed(2)}`;
  case 'todo':return `${S.todoDone}/${S.todoTotal}`;
  case 'waves':{const st=S.steps;return `Wave ${Math.min(S.waveCurrent,S.wavesTotal)}/${S.wavesTotal}`+(st.merged?' mergée':st.pr?' PR':st.push?' push':st.commit?' commit':'')}}return ''}

function derive(now){
  const m=MODELS[S.model],ctx=S.context/100,rate=S.rate/100,pre=!S.started;
  return {m,cls:CLASS[S.model],eff:EFFORT[S.effort],ctx,rate,now,pre,wake:now<W.wakeUntil,
    n:pre?.85:clamp((rate-.6)/.3),dusk:pre?0:clamp(1-Math.abs(rate-.62)/.14),dawn:pre?0:clamp(1-rate/.12),storm:pre?0:clamp((rate-.86)/.1),
    boss:ctx>=.85,prog:progress(),sig:pre?null:ACT_SIG[S.activity]||null,act:S.activity,
    waves:Array.from({length:S.wavesTotal},(_,i)=>waveState(i+1)),cur:Math.min(S.waveCurrent,S.wavesTotal),
    fest:now<W.festUntil,letter:now<W.letterUntil,fireOn:sig=>W.fires.some(x=>x.sig===sig&&now>=x.from&&now<x.until)};
}

// ---------- world ----------
const W={seed:(Math.random()*1e9)|0,ambNext:0,ents:[],fx:[],fires:[],nid:1,dirty:true,letterUntil:0,wakeUntil:0,costPulse:0,todoPulse:0,festUntil:0,nextSpawn:0,nextAdv:0,navKey:null,lastCost:S.cost,lastTodo:S.todoDone};
let VIEW='valley',LABELS=true,PIXEL=0,NAV={nodes:{},adj:{}};

function navFor(V){
  const key=VIEW+':'+(V.navKey?V.navKey():'');
  if(W.navKey===key)return;
  const nav=typeof V.nav==='function'?V.nav():V.nav,adj={};
  for(const id in nav.nodes)adj[id]=[];
  for(const[a,b]of nav.edges){if(!adj[a]||!adj[b])continue;const d=dist(nav.nodes[a],nav.nodes[b]);adj[a].push([b,d]);adj[b].push([a,d])}
  NAV={nodes:nav.nodes,adj};W.navKey=key;
  for(const e of W.ents)if(!NAV.nodes[e.node]){e.pts=null;e.node=V.home;e.until=0}
}
function route(a,b){
  if(a===b)return[a];const adj=NAV.adj;if(!adj[a]||!adj[b])return null;
  const d={[a]:0},p={},Q=new Set([a]),done=new Set();
  while(Q.size){let u=null,best=Infinity;for(const q of Q)if(d[q]<best){best=d[q];u=q}Q.delete(u);if(u===b)break;done.add(u);
    for(const[v,w]of adj[u]){if(done.has(v))continue;const nd=d[u]+w;if(nd<(d[v]??Infinity)){d[v]=nd;p[v]=u;Q.add(v)}}}
  if(d[b]===undefined)return null;const r=[b];while(r[0]!==a)r.unshift(p[r[0]]);return r;
}
function addEnt(kind,node,o={}){const r=Math.random;const e={id:W.nid++,kind,node,pts:null,t0:0,t1:0,state:'idle',until:0,dir:r()<.5?1:-1,jx:Math.round((r()-.5)*16/3)*3,jy:Math.round((r()-.5)*8/3)*3,speed:60,...o};W.ents.push(e);W.dirty=true;return e}
function segAt(e,now){
  if(!e.pts||now>=e.t1)return null;
  const t=clamp((now-e.t0)/(e.t1-e.t0))*e.len;let acc=0;
  for(let i=0;i<e.L.length;i++){const L=e.L[i];if(acc+L>=t||i===e.L.length-1){const k=L?clamp((t-acc)/L):1,a=e.pts[i],b=e.pts[i+1];return{p:[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k],i}}acc+=L}
  return null;
}
function pos(e,now){const s=segAt(e,now);if(s)return s.p;return NAV.nodes[e.node]||NAV.nodes[VIEWS[VIEW].home]||[800,500]}
const moving=(e,now)=>!!e.pts&&now<e.t1;
function goTo(e,target,now,speed){
  if(!NAV.nodes[target])return false;
  const s=segAt(e,now);let startPt,startId;
  if(s){startPt=s.p;startId=e.ids[s.i+1]}else{startId=e.node;startPt=NAV.nodes[startId]}
  if(!startPt){startPt=NAV.nodes[target];startId=target}
  const ids=route(startId,target)||[target];
  const pts=[startPt],idl=[null];
  for(const id of ids){const q=NAV.nodes[id];if(dist(pts[pts.length-1],q)<.5){idl[idl.length-1]=id;continue}pts.push(q);idl.push(id)}
  e.node=target;W.dirty=true;
  if(pts.length<2){e.pts=null;return false}
  e.pts=pts;e.ids=idl;e.L=[];let len=0;for(let i=1;i<pts.length;i++){const l=dist(pts[i-1],pts[i]);e.L.push(l);len+=l}
  e.len=len;e.t0=now;e.t1=now+len/(speed||e.speed)*1000;e.state='walk';return true;
}
function leave(e,now){
  e.leaving=true;e.until=0;const V=VIEWS[VIEW];
  if(e.kind==='enemy'){let best=null,bd=Infinity;const p=pos(e,now);for(const s of V.spawn){const d=dist(p,NAV.nodes[s]);if(d<bd){bd=d;best=s}}goTo(e,best,now,55)}
  else if(e.kind==='adv')goTo(e,V.places.agents.node,now,120);
}
function kill(e,now){const p=pos(e,now);fxAdd('puff',now,{at:[p[0]+e.jx,p[1]+e.jy-10],dur:900});e.state='gone';W.dirty=true}
function fxAdd(kind,now,o={}){W.fx.push({kind,t0:now,until:now+(o.dur||3000),...o});W.dirty=true}

function newWorld(now){
  const V=VIEWS[VIEW];if(!V)return;
  W.ents=[];W.fx=[];W.fires=[];W.nid=1;W.navKey=null;
  if(V.reset)V.reset(now);
  navFor(V);
  const P=V.places,r=rnd(W.seed);
  const pre=!S.started,zz=pre?{state:'sleep',until:now+60000}:{};
  addEnt('hero',pre?(V.camp||V.home):V.home,{skin:'hero',scale:4/3,speed:150,...zz});
  const jobs={bash:'smith',edit:'carpenter',read:'scribe',web:'courier',cost:'banker',todo:'farmer'};
  for(const sig in jobs){const p=P[sig];if(!p||!p.work)continue;addEnt('worker',p.work,{skin:jobs[sig],sig,speed:58,...zz});
    if(p.work2)addEnt('worker',p.work2,{skin:jobs[sig],sig,speed:52,alt:true,...zz})}
  const nv=V.villagers??6;for(let i=0;i<nv;i++){const h=pre&&V.houses?V.houses[i%V.houses.length]:null;addEnt('villager',h||V.wander[Math.floor(r()*V.wander.length)],{skin:'v'+(1+Math.floor(r()*4)),speed:42+r()*22,...(h?{state:'home',house:h,until:now+60000}:{})})}
  for(const g of V.guards||[])addEnt('guard',g,{skin:'guard',post:g,speed:50});
  W.dirty=true;
}
function heroTarget(D,V){const P=V.places;if(D.sig&&P[D.sig])return P[D.sig].work||P[D.sig].node;return V.home}
function retarget(now){
  const V=VIEWS[VIEW],D=derive(now);
  for(const e of W.ents){
    if(e.kind==='hero'){const t=heroTarget(D,V);if(e.node!==t)goTo(e,t,now,150);else e.until=0}
    else if(e.kind==='worker'||e.kind==='villager')e.until=Math.min(e.until,now+400);
  }
}
function think(e,now,D,V){
  const P=V.places,R=Math.random;
  const set=(st,ms)=>{if(e.state!==st){e.state=st;W.dirty=true}e.until=now+ms};
  const go=(n,sp)=>!!n&&n!==e.node&&goTo(e,n,now,sp);
  const wander=()=>pick(V.wanderOf?V.wanderOf(e):V.wander);
  switch(e.kind){
  case 'hero':{if(D.pre){if(!go(V.camp||V.home))set('sleep',60000);break}if(!go(heroTarget(D,V)))set(D.sig?'work':D.fest?'dance':'idle',D.sig?6000:4000);break}
  case 'worker':{
    const p=P[e.sig],active=sigActive(e.sig,now)||(e.sig==='todo'&&D.n<.8)||(e.sig==='cost'&&R()<.3);
    const spot=e.alt&&p.work2?p.work2:p.work;
    if(D.pre){if(!go(spot))set('sleep',60000);break}
    if(D.fireOn(e.sig)){if(!go(p.node))set('dance',1500);break}
    if(D.fest&&!active){if(!go(V.home))set('dance',3000);break}
    if(active){if(!go(spot))set('work',8000);break}
    if(e.node===spot&&R()<.6){set('idle',6000+R()*8000);break}
    if(!go(e.node===spot?wander():spot))set('idle',5000);break}
  case 'villager':{
    if(e.rushTo&&now<e.rushUntil){if(!go(e.rushTo,90))set('dance',1500);break}
    e.rushTo=null;
    if(D.fest){if(!go(V.home))set('dance',3000);break}
    if((D.pre||D.n>.78)&&V.houses){if(e.state==='home'){e.until=now+(D.pre?60000:6000);break}const h=e.house||(e.house=pick(V.houses));if(!go(h))set('home',6000);break}
    if(e.state==='home'){e.state='idle';W.dirty=true}
    if(R()<.5)set('idle',5000+R()*9000);else if(!go(wander()))set('idle',4000);break}
  case 'guard':{if(!go(e.post))set(W.ents.some(x=>x.kind==='enemy'&&!x.leaving)?'fight':'idle',6000);break}
  case 'enemy':{
    if(e.leaving){if(V.spawn.includes(e.node))e.state='gone';break}
    if(R()<.5)set('idle',5000+R()*6000);else if(!go(pick(V.front)))set('idle',4000);break}
  case 'adv':{
    if(e.leaving){if(e.node===P.agents.node)e.state='gone';else go(P.agents.node,120);break}
    const foes=W.ents.some(x=>x.kind==='enemy'&&!x.leaving);
    if(R()<.55)set(foes?'fight':'idle',5000+R()*5000);else if(!go(pick(foes?V.front:(V.patrol||V.wander)),115))set(foes?'fight':'idle',4000);break}
  case 'visitor':{
    if(e.stop&&!e.stayed){if(e.node!==e.stop){if(!go(e.stop,e.speed))e.stayed=true;break}e.stayed=true;set(e.act||'idle',e.stay||15000);break}
    if(e.node===e.dest){e.state='gone';break}
    if(!go(e.dest,e.speed))e.state='gone';break}
  case 'cart':{if(e.node===e.dest){e.state='gone';const q=NAV.nodes[e.dest];fxAdd('sparkle',now,{at:[q[0],q[1]-30],dur:1800})}else if(!go(e.dest,e.speed))e.state='gone';break}
  }
}
function ensure(now,D,V){
  const live=(k,fn=()=>true)=>W.ents.filter(e=>e.kind===k&&!e.leaving&&e.state!=='gone'&&fn(e));
  const en=live('enemy',e=>e.type!=='ogre'),want=D.pre||D.ctx<.2?0:Math.min(6,Math.round((D.ctx-.1)*7.5));
  if(en.length<want&&now>=W.nextSpawn){addEnt('enemy',pick(V.spawn),{type:['slime','slime','goblin'][en.length%3],speed:34});W.ents[W.ents.length-1].skin=W.ents[W.ents.length-1].type;W.nextSpawn=now+1100}
  else if(en.length>want)leave(en[en.length-1],now);
  const og=live('enemy',e=>e.type==='ogre');
  if(D.boss&&!D.pre&&!og.length)addEnt('enemy',pick(V.spawn),{type:'ogre',skin:'ogre',scale:2,speed:24});
  if((!D.boss||D.pre)&&og.length)leave(og[0],now);
  const ad=live('adv');
  if(ad.length<(D.pre?0:S.subagents)&&now>=W.nextAdv){addEnt('adv',V.places.agents.node,{skin:'adv',speed:115});W.nextAdv=now+700}
  else if(ad.length>(D.pre?0:S.subagents))leave(ad[ad.length-1],now);
}
function step(now){
  const V=VIEWS[VIEW];if(!V)return;navFor(V);const D=derive(now);
  if(S.cost>W.lastCost+.01){W.costPulse=now+2600;const p=V.places.cost;if(p&&p.fx)fxAdd('coin',now,{at:p.fx,dur:1400})}
  if(S.todoDone>W.lastTodo){W.todoPulse=now+2600;const p=V.places.todo;if(p&&p.fx)fxAdd('sparkle',now,{at:p.fx,dur:1600})}
  W.lastCost=S.cost;W.lastTodo=S.todoDone;
  ensure(now,D,V);
  if(!W.ambNext)W.ambNext=now+15000+Math.random()*20000;
  if(S.started&&now>=W.ambNext){ambient(now,D,V);W.ambNext=now+40000+Math.random()*60000}
  for(const e of W.ents)if(e.state!=='gone'&&!moving(e,now)&&now>=e.until)think(e,now,D,V);
  const n0=W.ents.length;W.ents=W.ents.filter(e=>e.state!=='gone');
  const f0=W.fx.length;W.fx=W.fx.filter(x=>now<x.until);
  const r0=W.fires.length;W.fires=W.fires.filter(x=>now<x.until);
  if(n0!==W.ents.length||f0!==W.fx.length||r0!==W.fires.length)W.dirty=true;
  if(V.tick&&V.tick(now,D))W.dirty=true;
}

// Random life: the view lists events (merchant, bard, ghost, shooting star...), one fires every 40 to 100 s.
function ambient(now,D,V,id){const L=(V.ambient||[]).filter(a=>id?a.id===id:(!a.when||a.when(D)));if(!L.length)return null;
  let t=Math.random()*L.reduce((s,a)=>s+(a.w||1),0);for(const a of L){t-=a.w||1;if(t<=0){a.run(now,D);W.dirty=true;return a}}return null}

// ---------- events ----------
// The first prompt wakes the village: sunrise, an alert over the hero, everyone back to work.
function wake(now){S.started=true;W.wakeUntil=now+4000;fxAdd('sunrise',now,{dur:3600});fxAdd('alert',now,{dur:2600});for(const e of W.ents)e.until=0;W.dirty=true}
function evPrompt(now){if(!S.started)wake(now);W.letterUntil=now+5200;fxAdd('bird',now,{dur:5200});VIEWS[VIEW].onEvent?.('prompt',now)}
function evError(now){
  const V=VIEWS[VIEW],sig=ACT_SIG[S.activity]&&V.places[ACT_SIG[S.activity]]?.fire?ACT_SIG[S.activity]:'bash';
  W.fires.push({sig,from:now,until:now+10000});
  const vs=W.ents.filter(e=>e.kind==='villager').slice(0,3);for(const v of vs){v.rushTo=V.places[sig].node;v.rushUntil=now+9000;v.until=0;if(moving(v,now))goTo(v,v.rushTo,now,90)}
  V.onEvent?.('error',now);W.dirty=true;
}
function evCompact(now){
  for(const e of W.ents)if(e.kind==='enemy')kill(e,now);
  fxAdd('spell',now,{dur:2200});VIEWS[VIEW].onEvent?.('compact',now);
}
function evMerge(now){
  W.festUntil=now+9000;const V=VIEWS[VIEW],P=V.places.waves;
  for(let i=0;i<7;i++){const a=P.fx||P.label;fxAdd('firework',now+i*650,{x:a[0]-160+(i*97)%320,y:a[1]-120-(i*53)%110,col:pick(['#ffd04a','#ff7ac8','#7ee0ff','#b6ff7a',MODELS[S.model].a]),dur:3200+i*650})}
  for(const e of W.ents)if(e.kind==='villager'||e.kind==='worker')e.until=0;
  V.onEvent?.('merge',now);
}
function evCommit(now){const P=VIEWS[VIEW].places.waves;fxAdd('sparkle',now,{at:P.fx||P.label,dur:2600,big:true});VIEWS[VIEW].onEvent?.('commit',now)}
function evPush(now){
  const V=VIEWS[VIEW],r=V.pushRoute||[V.places.web.node,V.places.waves.node];
  const e=addEnt('cart',r[0],{skin:'cart',dest:r[1],speed:85,jx:0,jy:0});goTo(e,r[1],now,85);V.onEvent?.('push',now);
}

// ---------- characters ----------
const SKIN=['#f4cba8','#dba37c','#a8714f','#f7d9bf','#c98d65'];
const TOOLS={
  hammer:`<path d="M8.5 -11 L13 -21" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M8.5 -11 L13 -21" stroke="#8a5a32" stroke-width="2" stroke-linecap="round"/><path d="M9.5 -24 L17 -19.5" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M9.5 -24 L17 -19.5" stroke="#a9b0be" stroke-width="4.4" stroke-linecap="round"/>`,
  mallet:`<path d="M8.5 -11 L13 -21" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M8.5 -11 L13 -21" stroke="#8a5a32" stroke-width="2" stroke-linecap="round"/><rect x="9" y="-27" width="10" height="6" rx="1.5" fill="#c98a4a" ${K} transform="rotate(-28 14 -24)"/>`,
  book:`<path d="M5 -17 L11 -15 L17 -17 L17 -9 L11 -7 L5 -9 Z" fill="#f4ecd8" ${K}/><path d="M11 -15 L11 -7" stroke="${INK}" stroke-width="1.2"/><path d="M5 -17 L5 -9 L3.5 -9.5 L3.5 -17.5 Z" fill="#4b93e0" ${K}/>`,
  letter:`<rect x="7" y="-19" width="10" height="7" rx="1" fill="#fff8e6" ${K}/><path d="M7 -19 L12 -15 L17 -19" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="12" cy="-15" r="1.4" fill="#d9483b"/>`,
  coins:`<path d="M6 -14 Q11 -20 16 -14 Q17 -7 11 -7 Q5 -7 6 -14 Z" fill="#e2b63a" ${K}/><path d="M8.5 -15.5 L13.5 -15.5" stroke="${INK}" stroke-width="1.2"/>`,
  hoe:`<path d="M8.5 -6 L12 -31" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M8.5 -6 L12 -31" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round"/><path d="M11 -31 L18 -29" stroke="${INK}" stroke-width="4.6" stroke-linecap="round"/><path d="M11 -31 L18 -29" stroke="#b8bfcc" stroke-width="2.4" stroke-linecap="round"/>`,
  spear:`<path d="M9 -2 L11 -40" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M9 -2 L11 -40" stroke="#8a5a32" stroke-width="2" stroke-linecap="round"/><path d="M11 -48 L14 -39 L8 -39 Z" fill="#d6dbe6" ${K}/>`,
  sword:`<path d="M9 -13 L18 -30" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M9 -13 L18 -30" stroke="#e4e8f0" stroke-width="2.8" stroke-linecap="round"/><path d="M6.5 -15.5 L12.5 -10.5" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M6.5 -15.5 L12.5 -10.5" stroke="#c9962f" stroke-width="1.6" stroke-linecap="round"/>`,
  club:`<path d="M8.5 -11 L15 -26" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><path d="M8.5 -11 L15 -26" stroke="#7a5530" stroke-width="4.6" stroke-linecap="round"/><circle cx="15.5" cy="-27" r="4.2" fill="#7a5530" ${K}/>`,
  bow:`<path d="M12 -30 Q20 -16 12 -2" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M12 -30 Q20 -16 12 -2" fill="none" stroke="#9a6a3a" stroke-width="2" stroke-linecap="round"/><path d="M12 -30 L12 -2" stroke="#f4ecd8" stroke-width=".9"/>`,
  lute:`<path d="M10 -15 L17 -26" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/><path d="M10 -15 L17 -26" stroke="#7a5530" stroke-width="1.8"/><ellipse cx="9" cy="-11" rx="5" ry="6" fill="#d6964f" ${K} transform="rotate(-30 9 -11)"/><circle cx="9.6" cy="-11.6" r="1.4" fill="${INK}"/>`,
  staff:(b)=>`<path d="M9 -2 L11 -36" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M9 -2 L11 -36" stroke="#8a5a32" stroke-width="2" stroke-linecap="round"/><circle cx="11.2" cy="-39" r="6" fill="${b}" opacity=".35"/><circle cx="11.2" cy="-39" r="3.6" fill="${b}" ${K}/><circle cx="10" cy="-40" r="1.1" fill="#fff"/>`,
};
function hat(kind,a,b){switch(kind){
  case 'wizard':return `<path d="M-11 -31 Q0 -27.5 11 -31 Q10 -34.5 0 -35 Q-10 -34.5 -11 -31 Z" fill="${a}" ${K}/><path d="M-6.5 -33.5 Q-3 -42 2 -52 Q4.5 -53 4.5 -49 Q5.5 -41 6.5 -33.5 Z" fill="${a}" ${K}/><path d="M-6 -35.6 Q0 -34 6.2 -35.6" fill="none" stroke="${b}" stroke-width="2.6"/><path d="M1 -44 l1 -2 l1 2 l2 .3 l-1.5 1.4 l.4 2 l-1.9 -1 l-1.9 1 l.4 -2 l-1.5 -1.4 Z" fill="#fff3b0"/>`;
  case 'helm':return `<path d="M-8.6 -26 Q-9 -37 0 -37.5 Q9 -37 8.6 -26 L8.6 -24.5 L-8.6 -24.5 Z" fill="#c6ccd8" ${K}/><path d="M-6 -27.5 L6 -27.5" stroke="${INK}" stroke-width="1.6"/><path d="M0 -37.5 L0 -30" stroke="#8d95a6" stroke-width="1.4"/>`;
  case 'plume':return hat('helm')+`<path d="M0 -37 Q5 -46 12 -43" fill="none" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/><path d="M0 -37 Q5 -46 12 -43" fill="none" stroke="${a}" stroke-width="3.4" stroke-linecap="round"/>`;
  case 'hood':return `<path d="M-10 -21 Q-11 -38 0 -38.5 Q11 -38 10 -21 Q7 -31 0 -31.5 Q-7 -31 -10 -21 Z" fill="${a}" ${K}/><path d="M0 -38.5 Q3 -42 7 -40" fill="none" stroke="${INK}" stroke-width="1.4"/>`;
  case 'feather':return `<path d="M-10.5 -30 Q-6 -39 0 -39 Q8 -39 10.5 -30 Z" fill="${a}" ${K}/><path d="M-10.5 -30 L10.5 -30" stroke="${tone(a,-.3)}" stroke-width="2.4"/><path d="M4 -36 Q11 -48 17 -44 Q12 -40 6 -35" fill="${b}" ${K}/>`;
  case 'straw':return `<ellipse cx="0" cy="-31.5" rx="13" ry="3.8" fill="#e8c86a" ${K}/><path d="M-6.5 -32 Q-6.5 -38.5 0 -38.5 Q6.5 -38.5 6.5 -32 Z" fill="#e8c86a" ${K}/><path d="M-6.5 -33.2 L6.5 -33.2" stroke="#c0463b" stroke-width="1.6"/>`;
  case 'cap':return `<path d="M-8 -29 Q-7.5 -36.5 0 -36.5 Q7.5 -36.5 8 -29 Z" fill="#2a9d8f" ${K}/><path d="M4 -29.2 L12.5 -29.2" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>`;
  case 'beanie':return `<path d="M-8 -28.5 Q-8 -37.5 0 -37.5 Q8 -37.5 8 -28.5 Z" fill="#b34a3a" ${K}/><circle cx="0" cy="-38.5" r="2.2" fill="#f4ecd8" ${K}/>`;
  case 'tophat':return `<ellipse cx="0" cy="-32" rx="10" ry="2.6" fill="#2e2a33" ${K}/><rect x="-6" y="-43" width="12" height="11" rx="1.5" fill="#2e2a33" ${K}/><rect x="-6" y="-35.5" width="12" height="2.2" fill="#e2b63a"/>`;
  case 'horns':return `<path d="M-6 -32 Q-11 -38 -12 -44 Q-7 -40 -3 -34 Z" fill="#efe6cf" ${K}/><path d="M6 -32 Q11 -38 12 -44 Q7 -40 3 -34 Z" fill="#efe6cf" ${K}/>`;
  }return ''}
function person(o){
  const pants=o.pants||'#4a3b5c';let s='';
  if(o.cape)s+=`<path d="M-8.5 -19 Q-12 -8 -10.5 -1.5 L10.5 -1.5 Q12 -8 8.5 -19 Z" fill="${o.cape}" ${K}/>`;
  if(!o.robe)s+=`<rect x="-6" y="-9.5" width="5" height="9.5" rx="2" fill="${pants}" ${K}/><rect x="1" y="-9.5" width="5" height="9.5" rx="2" fill="${pants}" ${K}/>`;
  s+=o.robe?`<path d="M-9 -.5 Q-10 -19.5 0 -20 Q10 -19.5 9 -.5 Q0 1.5 -9 -.5 Z" fill="${o.tunic}" ${K}/><path d="M-9 -3 Q0 -1 9 -3" fill="none" stroke="${tone(o.tunic,-.25)}" stroke-width="2"/>`
    :`<path d="M-8.5 -6.5 Q-10 -19.5 0 -20 Q10 -19.5 8.5 -6.5 Q0 -4 -8.5 -6.5 Z" fill="${o.tunic}" ${K}/><path d="M-8.4 -9.5 Q0 -7.5 8.4 -9.5" fill="none" stroke="${tone(o.tunic,-.3)}" stroke-width="2"/>`;
  if(o.apron)s+=`<path d="M-5 -16.5 L5 -16.5 L5.6 -5.5 L-5.6 -5.5 Z" fill="${o.apron}" ${K}/>`;
  if(o.bag)s+=`<path d="M-6 -19 L7 -8" stroke="${INK}" stroke-width="1.6"/><rect x="-11.5" y="-12" width="7" height="6" rx="1.5" fill="#a0703f" ${K}/>`;
  if(o.ears)s+=`<path d="M-7 -28 L-15 -32 L-7.5 -23 Z" fill="${o.skin}" ${K}/><path d="M7 -28 L15 -32 L7.5 -23 Z" fill="${o.skin}" ${K}/>`;
  s+=`<circle cx="-9" cy="-10.5" r="2.7" fill="${o.skin}" ${K}/>`;
  s+=`<circle cx="0" cy="-27" r="8.2" fill="${o.skin}" ${K}/>`;
  if(o.hair)s+=`<path d="M-8.2 -27 Q-9.2 -36.4 0 -36.4 Q9.2 -36.4 8.2 -27 Q6 -31.5 0 -32 Q-6 -31.5 -8.2 -27 Z" fill="${o.hair}" ${K}/>`;
  if(o.beard)s+=`<path d="M-7 -24 Q0 -14 7 -24 Q4 -21 0 -21 Q-4 -21 -7 -24 Z" fill="${o.beard}" ${K}/>`;
  const ey=o.eye||INK;s+=`<circle cx="-2.9" cy="-26" r="1.25" fill="${ey}"/><circle cx="2.9" cy="-26" r="1.25" fill="${ey}"/>`;
  if(!o.noblush)s+=`<circle cx="-5.3" cy="-23.2" r="1.6" fill="#ff8a7a" opacity=".45"/><circle cx="5.3" cy="-23.2" r="1.6" fill="#ff8a7a" opacity=".45"/>`;
  s+=o.hat||'';
  s+=`<g class="kt" style="animation:var(--ka,none) .55s ease-in-out infinite;animation-delay:var(--kd,0s);transform-origin:9px -10.5px">${o.tool||''}<circle cx="9" cy="-10.5" r="2.7" fill="${o.skin}" ${K}/></g>`;
  return s;
}
function charDefs(D,V,need){
  const a=D.m.a,b=D.m.b,ec=Object.assign({slime:'#8b63e0',goblin:'#7aa64a',ogre:'#7f8f6a'},V.enemyCol||{});
  const H={mage:{tunic:a,robe:true,hat:hat('wizard',a,b),tool:TOOLS.staff(b),skin:SKIN[3],hair:'#e9e4f2',beard:'#e9e4f2'},
    knight:{tunic:'#c6ccd8',cape:a,hat:hat('plume',a),tool:TOOLS.sword,skin:SKIN[0],pants:'#5a6478'},
    scout:{tunic:tone(a,-.2),cape:tone(a,-.35),hat:hat('hood',a),tool:TOOLS.bow,skin:SKIN[1],pants:'#5a4632'},
    bard:{tunic:a,hat:hat('feather',a,b),tool:TOOLS.lute,skin:SKIN[4],hair:'#3a2620',pants:tone(b,-.4)}}[D.cls];
  const all={
    hero:()=>person(H),
    v1:()=>person({tunic:'#d9765f',skin:SKIN[0],hair:'#7a4a2a'}),
    v2:()=>person({tunic:'#6aa6d6',skin:SKIN[2],hair:'#2e2a33'}),
    v3:()=>person({tunic:'#a586d6',skin:SKIN[3],hair:'#e0b04a',robe:true}),
    v4:()=>person({tunic:'#e8b04b',skin:SKIN[1],hair:'#3a2620',pants:'#5a4632'}),
    smith:()=>person({tunic:'#7a4e35',apron:'#3d3540',skin:SKIN[1],hair:'#2e2a33',beard:'#2e2a33',tool:TOOLS.hammer}),
    carpenter:()=>person({tunic:'#d08a3a',skin:SKIN[0],hat:hat('beanie'),tool:TOOLS.mallet,pants:'#5a4632'}),
    scribe:()=>person({tunic:'#4b6fb0',robe:true,skin:SKIN[3],hair:'#d9d2c5',beard:'#d9d2c5',tool:TOOLS.book}),
    courier:()=>person({tunic:'#2a9d8f',skin:SKIN[4],hat:hat('cap'),bag:true,tool:TOOLS.letter}),
    banker:()=>person({tunic:'#6b4ea0',skin:SKIN[0],hat:hat('tophat'),tool:TOOLS.coins}),
    farmer:()=>person({tunic:'#7aa95c',skin:SKIN[1],hat:hat('straw'),tool:TOOLS.hoe,pants:'#5a6478'}),
    guard:()=>person({tunic:'#4d5f99',skin:SKIN[0],hat:hat('helm'),tool:TOOLS.spear,pants:'#3a3550'}),
    adv:()=>person({tunic:tone(a,-.15),cape:b,skin:SKIN[2],hat:hat('helm'),tool:TOOLS.sword}),
    slime:()=>`<path d="M-12 0 Q-13.5 -16 0 -18 Q13.5 -16 12 0 Q0 2.5 -12 0 Z" fill="${ec.slime}" ${K}/><ellipse cx="-4.5" cy="-12" rx="3.4" ry="2.2" fill="#fff" opacity=".55"/><circle cx="-3.6" cy="-7.5" r="1.7" fill="${INK}"/><circle cx="3.6" cy="-7.5" r="1.7" fill="${INK}"/><path d="M-2 -4 Q0 -2.6 2 -4" fill="none" stroke="${INK}" stroke-width="1.2"/>`,
    goblin:()=>person({tunic:'#6d4c41',skin:ec.goblin,ears:true,eye:'#ff4b3a',noblush:true,tool:TOOLS.club,pants:'#3d3540'}),
    ogre:()=>person({tunic:'#5d4a3c',skin:ec.ogre,ears:true,eye:'#ff3b2a',noblush:true,hat:hat('horns'),tool:TOOLS.club,pants:'#3d3540',apron:'#7a5c44'}),
    cart:()=>V.vehicle?V.vehicle(D):`<rect x="-22" y="-24" width="34" height="15" rx="3" fill="#a0703f" ${K}/><rect x="-19" y="-33" width="11" height="10" rx="1.5" fill="#d6b06a" ${K}/><rect x="-7" y="-31" width="10" height="8" rx="1.5" fill="#c98a4a" ${K}/><path d="M12 -18 L20 -14" stroke="${INK}" stroke-width="2.4"/><circle cx="-14" cy="-7" r="6" fill="#6b4a2b" ${K}/><circle cx="5" cy="-7" r="6" fill="#6b4a2b" ${K}/><circle cx="-14" cy="-7" r="1.6" fill="${INK}"/><circle cx="5" cy="-7" r="1.6" fill="${INK}"/>`,
  };
  if(need.has('cart')&&!V.vehicle)need.add('courier');
  let o='';for(const k of need)if(all[k])o+=`<g id="kc-${k}">${all[k]()}</g>`;return o;
}
function drawEnt(e,now,D,V){
  if(e.state==='home')return '';
  const sc=(V.charScale||1)*(e.scale||1)*((V.px??PIXEL)?1.3:1),s=segAt(e,now);if(e.state==='home')return '';
  const ph=-(((now+e.id*137)/1000)%.6).toFixed(2);
  let body;
  const ak=actorKey(e,V);if(ak)return drawActor(e,now,D,V,s,sc,ak);
  const sp=V.sprites&&spriteOf(e,D,V);
  if(sp){
    const flipS=`<use href="#${sp}" x="-24" y="-46"/>`;TUSE.add(sp);
    let tool='';const tl=e.state==='work'&&!s&&V.tools&&V.tools[e.skin];if(tl){TUSE.add(tl);tool=`<g transform="translate(6,-40)"><g style="transform-box:fill-box;transform-origin:10% 90%;${loop('kworkp',.5,now,'steps(2)',e.id*90)}"><use href="#${tl}" x="0" y="0" width="30" height="30"/></g></g>`}
    if(e.state==='fight'&&!s){TUSE.add('d104');tool=`<g transform="translate(6,-40)"><g style="transform-box:fill-box;transform-origin:10% 90%;${loop('kworkp',.4,now,'steps(2)',e.id*90)}"><use href="#d104" width="30" height="30"/></g></g>`}
    const anim=s?loop('kbobp',.36,now,'steps(2)',e.id*97):e.state==='dance'?loop('khopp',.5,now,'steps(2)',e.id*97):e.kind==='enemy'?loop('kbobp',.8,now,'steps(2)',e.id*97):'';
    // asleep: lying on the side, a Z rising
    if(e.state==='sleep'&&!s)body=`<g transform="translate(22,-20) rotate(-90)">${flipS}</g><g style="${loop('kzz',2.4,now,'steps(4)',e.id*300)}">${pxArt(ZZ,{w:'#3f2631'},-3,-31,3)}${pxArt(ZZ,{w:'#ffffff'},-6,-34,3)}</g>`;
    else body=`<g style="${anim}">${flipS}${tool}</g>`;
    if(e.notes&&e.state==='dance'&&!s)for(let i=0;i<2;i++)body+=`<g style="${loop('kzz',1.8,now,'steps(4)',i*900)}">${pxArt(NOTE,{k:'#3f2631',y:'#fee761'},8-i*20,-60,3)}</g>`;
  }
  else if(e.kind==='enemy'&&e.type==='slime')body=`<g class="kb" style="${loop('kslime',.9,now,'ease-in-out',e.id*211)}"><use href="#kc-slime"/></g>`;
  else if(e.kind==='cart')body=`<use href="#kc-cart"/>${V.vehicle?'':'<use href="#kc-courier" transform="translate(-30,0)"/>'}`;
  else{
    const anim=s?'':e.state==='work'?`--ka:kwork;--kd:${ph}s`:e.state==='fight'?`--ka:kfight;--kd:${ph}s`:'';
    let u=`<use href="#kc-${e.skin}"${anim?` style="${anim}"`:''}/>`;
    if(s)u=`<g class="kb" style="${loop('kbob',.38,now,'ease-in-out',e.id*97)}">${u}</g>`;
    else if(e.state==='dance')u=`<g class="kb" style="${loop('khop',.5,now,'ease-in-out',e.id*97)}">${u}</g>`;
    body=u;
  }
  let aura='';
  if(e.kind==='hero'&&V.sprites){const a=D.m.a;aura=`<ellipse rx="22" ry="7" fill="${a}" opacity=".3" shape-rendering="crispEdges"/><rect x="-24" y="-3" width="48" height="6" fill="none" stroke="${a}" stroke-width="3" shape-rendering="crispEdges" class="kc" style="${loop('kaura',1.2+(1-D.eff)*1.4,now,'steps(4)')}"/>`}
  else if(e.kind==='hero'){const a=D.m.a;aura=`<ellipse rx="17" ry="6" fill="${a}" opacity=".28"/><ellipse rx="17" ry="6" fill="none" stroke="${a}" stroke-width="2.4" class="kc" style="${loop('kaura',1.2+(1-D.eff)*1.4,now,'ease-out')}"/>`}
  const shadow=V.sprites?`<use href="#ksh"${e.kind==='cart'?' transform="scale(2,1)"':''}/>`:`<ellipse rx="${f(11*(e.kind==='cart'?2:1))}" ry="3.6" fill="#000" opacity=".22"/>`;
  if(s){
    // Walking as a CSS animation (SMIL keeps Chrome's animation clock busy even once frozen).
    const rest=[s.p,...e.pts.slice(s.i+1)],v=e.len/(e.t1-e.t0),L=[];let tot=0;
    for(let i=1;i<rest.length;i++){const l=dist(rest[i-1],rest[i]);L.push(l);tot+=l}
    if(tot<1)return '';
    const dur=(tot/v/1000).toFixed(2);let acc=0;const kt=[0];for(const l of L){acc+=l;kt.push(acc/tot)}kt[kt.length-1]=1;
    const pc=kt.map(x=>+(x*100).toFixed(1)),id='w'+e.id;
    KF.push(`@keyframes ${id}{${rest.map((p,i)=>`${pc[i]}%{transform:translate(${f(p[0]+e.jx)}px,${f(p[1]+e.jy)}px)}`).join('')}}`);
    const dirs=L.map((_,i)=>rest[i+1][0]-rest[i][0]>=0?1:-1);e.dir=dirs[dirs.length-1];
    const same=dirs.every(d=>d===dirs[0]);
    if(!same)KF.push(`@keyframes ${id}f{${dirs.map((d,i)=>`${pc[i]}%{transform:scale(${d},1)}`).join('')}100%{transform:scale(${e.dir},1)}}`);
    const turn=same?`<g transform="scale(${dirs[0]},1)">${body}</g>`:`<g style="animation:${id}f ${dur}s step-end both">${body}</g>`;
    return `<g style="animation:${id} ${dur}s linear both"><g transform="scale(${f2(sc)})">${shadow}${aura}${turn}</g></g>`;
  }
  const p=pos(e,now);
  return `<g transform="translate(${f(p[0]+e.jx)},${f(p[1]+e.jy)})"><g transform="scale(${f2(sc)})">${shadow}${aura}</g><g transform="scale(${f2(e.dir*sc)},${f2(sc)})">${body}</g></g>`;
}

// Animated actors (Ninja Adventure sheets): 4 columns down/up/left/right, rows 4 walk frames then attack.
// A nested 16x16 viewport shows one frame; CSS steps move the sheet under it. Sheets used by the frame only.
let AUSE=new Set();
function actorKey(e,V){const A=V.actors;if(!A||typeof ACTORS==='undefined')return null;const k=e.kind==='hero'?A.hero&&A.hero[S.model]:e.kind==='enemy'?A[e.type]:A[e.skin];return k&&ACTORS[k]?k:null}
const DIR4=(dx,dy)=>Math.abs(dx)>=Math.abs(dy)?(dx>=0?3:2):(dy>=0?0:1);
function drawActor(e,now,D,V,s,sc,k){
  AUSE.add(k);const img=`<use href="#a_${k}"/>`,box=(inner,face)=>`<svg x="-24" y="-46" width="48" height="48" viewBox="${face*16} 0 16 16">${inner}</svg>`;
  let aura='';if(e.kind==='hero'){const a=D.m.a;aura=`<ellipse rx="22" ry="7" fill="${a}" opacity=".3"/><rect x="-24" y="-3" width="48" height="6" fill="none" stroke="${a}" stroke-width="3" class="kc" style="${loop('kaura',1.2+(1-D.eff)*1.4,now,'steps(4)')}"/>`}
  const shadow='<use href="#ksh"/>';
  if(s){
    const rest=[s.p,...e.pts.slice(s.i+1)],v=e.len/(e.t1-e.t0),L=[];let tot=0;
    for(let i=1;i<rest.length;i++){const l=dist(rest[i-1],rest[i]);L.push(l);tot+=l}
    if(tot<1)return '';
    const sec=tot/v/1000,dur=sec.toFixed(2);let acc=0;const kt=[0];for(const l of L){acc+=l;kt.push(acc/tot)}kt[kt.length-1]=1;
    const pc=kt.map(x=>+(x*100).toFixed(1)),id='w'+e.id;
    KF.push(`@keyframes ${id}{${rest.map((p,i)=>`${pc[i]}%{transform:translate(${f(p[0]+e.jx)}px,${f(p[1]+e.jy)}px)}`).join('')}}`);
    const d4=L.map((_,i)=>DIR4(rest[i+1][0]-rest[i][0],rest[i+1][1]-rest[i][1]));e.face=d4[d4.length-1];e.dir=e.face===2?-1:1;
    const same=d4.every(d=>d===d4[0]);
    if(!same)KF.push(`@keyframes ${id}d{${d4.map((d,i)=>`${pc[i]}%{transform:translateX(${-16*d}px)}`).join('')}100%{transform:translateX(${-16*e.face}px)}}`);
    const legs=`<g style="animation:kw4 .6s steps(4) ${Math.max(1,Math.ceil(sec/.6))}">${img}</g>`;
    const turn=same?`<g transform="translate(${-16*d4[0]},0)">${legs}</g>`:`<g style="animation:${id}d ${dur}s step-end both">${legs}</g>`;
    return `<g style="animation:${id} ${dur}s linear both"><g transform="scale(${f2(sc)})">${shadow}${aura}${box(turn,0)}</g></g>`;
  }
  const face=e.face??0;let body;
  if(e.state==='sleep')body=`<g transform="translate(22,-20) rotate(-90)">${box(img,0)}</g><g style="${loop('kzz',2.4,now,'steps(4)',e.id*300)}">${pxArt(ZZ,{w:'#3f2631'},-3,-31,3)}${pxArt(ZZ,{w:'#ffffff'},-6,-34,3)}</g>`;
  else if(e.state==='work'||e.state==='fight'){
    const tl=e.state==='fight'?'d104':V.tools&&V.tools[e.skin];let tool='';
    if(tl){TUSE.add(tl);tool=`<g transform="translate(${face===2?-36:6},-40)"><g style="transform-box:fill-box;transform-origin:10% 90%;${loop('kworkp',.5,now,'steps(2)',e.id*90)}"><use href="#${tl}" width="30" height="30"/></g></g>`}
    body=box(`<g style="${loop('katk',.5,now,'step-end',e.id*90)}">${img}</g>`,face)+tool}
  else if(e.state==='dance'){body=`<g style="${loop('khopp',.5,now,'steps(2)',e.id*97)}">${box(`<g style="${loop('kw4',.6,now,'steps(4)',e.id*50)}">${img}</g>`,0)}</g>`;
    if(e.notes)for(let i=0;i<2;i++)body+=`<g style="${loop('kzz',1.8,now,'steps(4)',i*900)}">${pxArt(NOTE,{k:'#3f2631',y:'#fee761'},8-i*20,-60,3)}</g>`}
  else if(e.kind==='enemy')body=box(`<g style="${loop('kw4',1.2,now,'steps(4)',e.id*97)}">${img}</g>`,face);
  else body=box(img,face);
  const p=pos(e,now);
  return `<g transform="translate(${f(p[0]+e.jx)},${f(p[1]+e.jy)}) scale(${f2(sc)})">${shadow}${aura}${body}</g>`;
}
const NOTE=['..kk','..ky','kkky','kyy.','kk..'];
const ZZ=['www','..w','.w.','w..','www'];
function spriteOf(e,D,V){const S_=V.sprites;if(e.kind==='hero')return S_.hero[S.model];if(e.kind==='enemy')return S_[e.type];if(e.kind==='cart')return null;return S_[e.skin]||S_.v1}
// ---------- shared art ----------
const FLAME=[['...y....','..yoy.y.','.yoeoyoy','.yoeeooy','yoeeeeoy','.yoeeoy.'],['....y...','.y.yoy..','yoyoeoy.','yooeeoy.','yoeeeeoy','.yoeeoy.']];
function flames(x,y,s,now){
  const pal={y:'#fee761',o:'#feae34',e:'#e84537'},k=Math.round(4*s);
  let o=`<g transform="translate(${f(x-16*k*.75)},${f(y-6*k)})">`;
  for(let i=0;i<2;i++)o+=`<g style="${loop('kblink',.4,now,'step-end',i*200)}">${pxArt(FLAME[i],pal,0,0,k)}${pxArt(FLAME[1-i],pal,8*k,k,k)}</g>`;
  return o+`</g>`;
}
function smoke(x,y,now,k=1,col='#e8e4ee',n=3,phase=0){let o='';const z=Math.round(6*k);for(let i=0;i<n;i++)o+=`<rect x="${f(x-z/2)}" y="${f(y-z/2)}" width="${z}" height="${z}" fill="${col}" opacity=".7" shape-rendering="crispEdges" class="kc" style="${loop('ksmoke',3.2,now,'steps(8)',phase+i*1066)}"/>`;return o}
function bird(col=INK){return `<path d="M-9 0 Q-4.5 -6 0 0 Q4.5 -6 9 0" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round"/>`}

const CSS=`
.o{stroke:${INK};stroke-width:2.6px;stroke-linejoin:round;stroke-linecap:round}
.kb{transform-box:fill-box;transform-origin:50% 100%}
.kc{transform-box:fill-box;transform-origin:50% 50%}
.kt{transform-box:view-box}
@keyframes kbobp{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes khopp{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes kworkp{0%,100%{transform:rotate(0)}50%{transform:rotate(-40deg)}}
@keyframes kbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}
@keyframes khop{0%,100%{transform:translateY(0)}45%{transform:translateY(-9px)}}
@keyframes kwork{0%,100%{transform:rotate(0)}45%{transform:rotate(-55deg)}60%{transform:rotate(8deg)}}
@keyframes kfight{0%,100%{transform:rotate(10deg)}40%{transform:rotate(-70deg)}55%{transform:rotate(35deg)}}
@keyframes kslime{0%,100%{transform:scale(1,1)}50%{transform:scale(1.14,.82)}}
@keyframes kaura{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.6);opacity:0}}
@keyframes kflame{0%,100%{transform:scale(1,1)}50%{transform:scale(.86,1.18)}}
@keyframes ksmoke{0%{transform:translate(0,0) scale(.5);opacity:0}15%{opacity:.75}100%{transform:translate(14px,-70px) scale(2.2);opacity:0}}
@keyframes kpuff{0%{transform:scale(.2);opacity:1}100%{transform:scale(2);opacity:0}}
@keyframes kburst{0%{transform:translate(0,0);opacity:0}8%{opacity:1}100%{transform:translate(0,-110px);opacity:0}}
@keyframes klaunch{0%{transform:scaleY(0);opacity:1}100%{transform:scaleY(1);opacity:0}}
@keyframes kspell{0%{transform:scale(.1);opacity:1}100%{transform:scale(40);opacity:0}}
@keyframes kflash{0%{opacity:0}12%{opacity:.55}100%{opacity:0}}
@keyframes klate{0%,99%{opacity:1}100%{opacity:0}}
@keyframes kflap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(-.6)}}
@keyframes kcoin{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-60px);opacity:0}}
@keyframes kspk{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(0,-46px) scale(.2);opacity:0}}
@keyframes kpulse{0%,100%{opacity:.35}50%{opacity:1}}
@keyframes kring{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.8);opacity:0}}
@keyframes krainp{0%{transform:translate(0,0)}100%{transform:translate(-20px,120px)}}
@keyframes kspin{to{transform:rotate(360deg)}}
@keyframes ksway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes kdrift{0%{transform:translateX(-300px)}100%{transform:translateX(1900px)}}
@keyframes kbobw{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
@keyframes kconf{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx,20px),220px) rotate(540deg);opacity:0}}
@keyframes kfly{0%{transform:translate(0,0)}100%{transform:translate(-2000px,-160px)}}
@keyframes kstar{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(420px,160px);opacity:0}}
@keyframes kflyo{to{transform:translate(-2000px,-160px)}}
@keyframes kcloud{from{transform:translate(-300px,0)}to{transform:translate(1800px,0)}}
@keyframes kdrag{from{transform:translate(-200px,0)}to{transform:translate(1900px,-260px)}}
@keyframes kw4{to{transform:translateY(-64px)}}
@keyframes katk{0%,49.9%{transform:translateY(0)}50%,100%{transform:translateY(-64px)}}
@keyframes kblink{0%,49.9%{opacity:1}50%,100%{opacity:0}}
@keyframes kzz{0%{transform:translate(0,0);opacity:0}25%{opacity:1}100%{transform:translate(9px,-27px);opacity:0}}
@keyframes kfade{from{opacity:1}to{opacity:0}}
@keyframes kalert{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
`;

const CLOUD=['....kkkkk.......','..kkkkkkkkk.kkk.','.kkkkkkkkkkkkkkk','kkkkkkkkkkkkkkkk','.kkkkkkkkkkkkkk.','...kkkkkk.kkk...'];
const DRAGON=['..........kk............','.........kkkk...........','kk.......kkkk.......kk..','.kkk....kkkkkk....kkk...','..kkkkk.kkkkkk.kkkkk....','...kkkkkkkkkkkkkkkk.....','....kkkkkkkkkkkkkk......','.....kk..kkkkkk..kk.....','.........kkkkkk.........','..........kkkk..........','..........kkkk..........','...........kk...........','............kk..........','.............kk.........'];
const BANG=['.kk.','kyyk','kyyk','kyyk','kyyk','.kk.','....','.kk.','kyyk','.kk.'];
const COIN=['.kkk.','kyyyk','kywyk','kyyyk','.kkk.'];
function effects(now,D,V){
  let o='';const P=V.places,hero=W.ents.find(e=>e.kind==='hero'),hp=hero?pos(hero,now):[800,500];
  for(const x of W.fires){if(now<x.from)continue;const a=P[x.sig]&&P[x.sig].fire;if(!a)continue;
    const op=f2(clamp(Math.min((now-x.from)/1000,(x.until-now)/2500)));o+=`<g opacity="${op}">${flames(a[0],a[1],a[2]||1,now)}</g>`}
  for(const x of W.fx){const since=now-x.t0;if(since<0)continue;
    if(x.kind==='puff'){let s='';for(let j=0;j<6;j++){const a=j/6*Math.PI*2;s+=`<circle cx="${f(Math.cos(a)*12)}" cy="${f(Math.sin(a)*9)}" r="11" fill="#efeaf6" class="kc" style="${once('kpuff',.9,since,j*.02)}"/>`}o+=`<g transform="translate(${f(x.at[0])},${f(x.at[1])})">${s}</g>`}
    else if(x.kind==='coin'){let s='';for(let j=0;j<4;j++)s+=`<g transform="translate(${(j-1.5)*15},0)"><g style="${once('kcoin',1.2,since,j*.12)}">${pxArt(COIN,KP,-6,-6,3)}</g></g>`;o+=`<g transform="translate(${f(x.at[0])},${f(x.at[1])})">${s}</g>`}
    else if(x.kind==='sparkle'){let s='';const n=x.big?12:8;for(let j=0;j<n;j++){const a=-90+(j-(n-1)/2)*(x.big?16:20);s+=`<g transform="rotate(${a+90}) translate(0,-6)"><rect x="-2.5" y="-2.5" width="5" height="5" fill="${j%2?'#ffe27a':'#ffffff'}" transform="rotate(45)" style="${once('kspk',1,since,(j%4)*.18)}"/></g>`}o+=`<g transform="translate(${f(x.at[0])},${f(x.at[1])})"><g style="${once('klate',x.big?2.6:1.6,since,0,'linear')}">${s}</g></g>`}
    else if(x.kind==='firework'){o+=`<g transform="translate(${f(x.x)},${f(x.y)})"><line x1="0" y1="0" x2="0" y2="300" stroke="${x.col}" stroke-width="3" class="kc" style="transform-origin:50% 100%;${once('klaunch',.5,since)}"/><use href="#kfw" style="color:${x.col};--fd:${(.5-since/1000).toFixed(2)}s"/></g>`}
    else if(x.kind==='spell'){const c=D.m.a;o+=`<circle cx="${f(hp[0])}" cy="${f(hp[1]-20)}" r="20" fill="none" stroke="${c}" stroke-width="10" vector-effect="non-scaling-stroke" class="kc" style="${once('kspell',1.8,since)}"/><circle cx="${f(hp[0])}" cy="${f(hp[1]-20)}" r="20" fill="none" stroke="#fff" stroke-width="3" vector-effect="non-scaling-stroke" class="kc" style="${once('kspell',1.8,since,.15)}"/><rect width="1600" height="1000" fill="#ffffff" style="${once('kflash',1.2,since)}"/>`}
    else if(x.kind==='bird'){const a=V.birdFrom||[1700,60],tx=hp[0]+8,ty=hp[1]-48,cx=(a[0]+tx)/2,cy=Math.min(a[1],ty)-120,id='kq'+x.t0%1e6;
      KF.push(`@keyframes ${id}{${[0,1,2,3,4,5,6].map(i=>{const t=i/6,u=1-t;return `${f(t*100)}%{transform:translate(${f(u*u*a[0]+2*u*t*cx+t*t*tx)}px,${f(u*u*a[1]+2*u*t*cy+t*t*ty)}px)}`}).join('')}}`);
      o+=`<g style="animation:${id} 3s linear both;animation-delay:${(-since/1000).toFixed(2)}s"><g style="${once('klate',5,since,0,'linear')}"><g transform="scale(1.4)"><g class="kc" style="${loop('kflap',.32,now,'steps(2)')}">${bird('#f4f1fa')}</g><rect x="-5" y="3" width="10" height="7" fill="#fff8e6" stroke="${INK}" stroke-width="1.2"/><rect x="-1" y="5" width="2" height="3" fill="#d9483b"/></g></g></g>`}
    else if(x.kind==='star')o+=`<g transform="translate(${x.x},${x.y})"><g style="${once('kstar',1.2,since,0,'steps(10)')}">${pxArt(['w.......','.wC.....','..CCw...','....CCCw'],{w:'#ffffff',C:'#c6f2ff'},0,0,3)}</g></g>`;
    else if(x.kind==='flock')o+=`<g transform="translate(1700,${x.y})"><g style="${once('kflyo',14,since,0,'steps(140)')}">${[[0,0],[30,12],[-24,15],[54,27]].map(([a,b],i)=>`<g style="${loop('kpulse',.4,now,'steps(2)',i*120)}">${pxArt(['k...k','.k.k.','..k..'],KP,a,b,3)}</g>`).join('')}</g></g>`;
    else if(x.kind==='cloud')o+=`<g transform="translate(0,${x.y})" opacity=".13"><g style="${once('kcloud',45,since,0,'steps(90)')}">${pxArt(CLOUD,{k:'#1d2a4a'},0,0,15)}</g></g>`;
    else if(x.kind==='shadow')o+=`<g transform="translate(0,${x.y})" opacity=".3"><g style="${once('kdrag',7,since,0,'steps(56)')}"><g transform="rotate(90)">${pxArt(DRAGON,{k:'#140c24'},-72,-84,6)}</g></g></g>`;
    else if(x.kind==='sunrise'){o+=`<rect width="1600" height="1000" fill="${V.night||'#3b4380'}" opacity="${f2(.85*.72)}" style="${once('kfade',3.4,since,0,'steps(8)')};mix-blend-mode:multiply"/><rect width="1600" height="1000" fill="#ffb98a" opacity=".25" style="${once('kfade',3.4,since,.6,'steps(8)')}"/>`}
    else if(x.kind==='alert'){o+=`<g transform="translate(${f(hp[0]-6)},${f(hp[1]-96)})"><g style="${once('klate',2.6,since,0,'linear')}"><g style="${loop('kalert',.5,now,'steps(2)')}">${pxArt(BANG,KP,0,0,3)}</g></g></g>`}
  }
  if(D.fest){for(let j=0;j<26;j++){const r=rnd(j+3),x0=(P.waves.fx||P.waves.label)[0]-260+r()*520,y0=(P.waves.fx||P.waves.label)[1]-200+r()*60;o+=`<rect x="${f(x0)}" y="${f(y0)}" width="6" height="9" fill="${pick(['#ffd04a','#ff7ac8','#7ee0ff','#b6ff7a','#ffffff'],r)}" class="kc" style="--dx:${f((r()-.5)*90)}px;${loop('kconf',2.4+r()*1.4,now,'steps(12)',j*170)}"/>`}}
  return o;
}
function atmosphere(now,D,V,R){
  let o='';
  if(D.dawn>0)o+=`<rect width="1600" height="1000" fill="#ffb98a" opacity="${f2(D.dawn*.16)}" style="mix-blend-mode:soft-light"/>`;
  if(D.dusk>0)o+=`<rect width="1600" height="1000" fill="#ff8a3a" opacity="${f2(D.dusk*.22)}" style="mix-blend-mode:soft-light"/>`;
  if(D.n>0)o+=`<rect width="1600" height="1000" fill="${V.night||'#3b4380'}" opacity="${f2(D.n*.72)}" style="mix-blend-mode:multiply"/>`;
  if(V.mist)o+=V.mist(D,now);
  const Ls=R.lights||[];
  if(Ls.length&&D.n>.05){const by={};for(const[x,y,w,h,c,src]of Ls){const k=c||'#ffcf6a';(by[k]=by[k]||[]).push([x,y,w,h,src])}
    // a light with a 6th flag is a source drawn by the view itself: halo only, no lit core over it
    const ring=(L,g,core)=>L.filter(q=>!core||!q[4]).map(([x,y,w,h])=>`M${x-g} ${y-g}h${w+2*g}v${h+2*g}h${-w-2*g}z`).join('');
    let gl='';for(const c in by){const k=ring(by[c],0,1);gl+=`<path d="${ring(by[c],9)}" fill="${c}" opacity=".16"/><path d="${ring(by[c],3)}" fill="${c}" opacity=".4"/>${k?`<path d="${k}" fill="${mix(c,'#ffffff',.3)}"/>`:''}`}
    o+=`<g opacity="${f2(clamp(D.n*1.5))}" shape-rendering="crispEdges">${gl}</g>`}
  if(D.storm>0)o+=`<g opacity="${f2(D.storm)}"><rect x="-100" y="-240" width="1800" height="1300" fill="url(#krainp)" style="${loop('krainp',.45,now,'steps(4)')}"/><g transform="translate(37,55)"><rect x="-100" y="-240" width="1800" height="1300" fill="url(#krainp)" opacity=".6" style="${loop('krainp',.6,now,'steps(4)',200)}"/></g></g>`;
  return o;
}
// In-world signs: each view draws its own (V.sign). Engine falls back to a wooden plank.
function signs(now,D,V){
  let o='';
  for(const id in V.places){const P=V.places[id];if(!P.label)continue;
    const act=sigActive(id,now),col=sigCol(id,D),text=`${P.name} · ${sigValue(id)}`;
    o+=(V.sign||woodSign)(P.label[0],P.label[1],{id,act,col,text,name:P.name,value:sigValue(id),now,D});
  }
  return o;
}
const MONO=`font-family="ui-monospace,Menlo,Consolas,monospace"`;
// Pixel UI board with notched corners, drawn crisp outside the pixel filter.
function pxBoard(x,y,w,h,fill,edge,n=3){return `<path d="M${x+n} ${y}h${w-2*n}v${n}h${n}v${h-2*n}h${-n}v${n}h${-(w-2*n)}v${-n}h${-n}v${-(h-2*n)}h${n}z" fill="${fill}" stroke="${edge}" stroke-width="2.5" shape-rendering="crispEdges"/>`}
function woodSign(x,y,{act,col,text,now}){
  const w=Math.round(text.length*7.25+30);
  return `<g transform="translate(${f(x)},${f(y)})" shape-rendering="crispEdges"><rect x="-3" y="-16" width="6" height="16" fill="#5a3a20"/><g class="kb" style="${act?loop('ksway',2.4,now):''}">${pxBoard(-w/2,-40,w,25,act?'#c98a4a':'#9a6a3a','#2b1a0e')}<rect x="${-w/2+7}" y="-32" width="9" height="9" fill="${col}" stroke="#2b1a0e" stroke-width="2"/>${act?`<rect x="${-w/2+4}" y="-35" width="15" height="15" fill="none" stroke="${col}" stroke-width="2" style="${loop('kpulse',1,now)}"/>`:''}<text x="${-w/2+22}" y="-23" ${MONO} font-size="12" font-weight="700" fill="#fff4dc">${esc(text)}</text></g></g>`;
}

// Keyframes are sent only when the frame uses them; KF holds this frame's own (walks, birds).
let KF=[];const KEYS={};const KRE=/@keyframes ([\w-]+)\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
function keysOf(css){if(!KEYS[css]){const m={};css.replace(KRE,(r,n)=>{m[n]=r;return ''});KEYS[css]={m,base:css.replace(KRE,'').replace(/\s*\n\s*/g,'')}}return KEYS[css]}
function styleFor(svg,V){const A=keysOf(CSS),B=keysOf(V.css||''),used=new Set([...svg.matchAll(/animation:\s*([\w-]+)/g)].map(m=>m[1]));
  let o=A.base+B.base;for(const n of used)o+=A.m[n]||B.m[n]||'';return o+KF.join('')}
function compose(now){
  const V=VIEWS[VIEW],D=derive(now);navFor(V);TUSE=new Set();KF=[];AUSE=new Set();
  const R=V.draw(now,D);
  const items=(R.props||[]).slice(),need=new Set();
  for(const e of W.ents){if(e.state==='gone'||e.state==='home')continue;need.add(e.skin);const p=pos(e,now);items.push([p[1]+e.jy+(e.zs||0),drawEnt(e,now,D,V)])}
  items.sort((a,b)=>a[0]-b[0]);
  let o=R.ground+items.map(i=>i[1]).join('')+(R.top||'');
  o+=atmosphere(now,D,V,R);
  o+=effects(now,D,V);
  o+=(R.hud||'');
  // Pixel art: the whole world is resampled on a PX grid (one sample per block, then dilated).
  const PX=V.px??PIXEL;
  if(PX)o=`<g filter="url(#kpx)">${o}</g>`;
  if(LABELS)o+=signs(now,D,V);
  const pxf=PX?`<filter id="kpx" x="0" y="0" width="1600" height="1000" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"><feFlood x="${PX/2-1}" y="${PX/2-1}" width="2" height="2"/><feComposite x="0" y="0" width="${PX}" height="${PX}"/><feTile result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/><feMorphology operator="dilate" radius="${(PX-2)/2}"/></filter>`:'';
  let fw='';if(W.fx.some(x=>x.kind==='firework')){for(let j=0;j<18;j++)fw+=`<g transform="rotate(${j*20})"><circle r="4" fill="${j%2?'#fff':'currentColor'}" style="animation:kburst 1.5s ease-out 1 both;animation-delay:var(--fd,0s)"/></g>`;fw=`<g id="kfw">${fw}</g>`}
  if(V.sprites)need.clear();if(W.ents.some(e=>e.kind==='cart'))need.add('cart');
  const defs=`<defs>${pxf}${fw}${charDefs(D,V,need)}${D.storm>0?`<pattern id="krainp" width="80" height="120" patternUnits="userSpaceOnUse"><path d="M20 0 l-6 22 M62 40 l-6 22 M40 84 l-6 22" stroke="#d4dcff" stroke-opacity=".6" stroke-width="1.8"/></pattern>`:''}${V.sprites?'<ellipse id="ksh" rx="15" ry="5" fill="#3f2631" opacity=".28"/>':''}${[...AUSE].map(k=>`<image id="a_${k}" href="${ACTORS[k]}" width="64" height="80" style="image-rendering:pixelated"/>`).join('')}${R.defs||''}${tileDefs()}</defs>`;
  const body=(defs+o).replace(/ shape-rendering="crispEdges"/g,'');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges" role="img" aria-label="${esc(V.name)}"><style>${styleFor(body,V)}</style>${body}</svg>`;
}
const VIEWS={};

// ---------- pixel assets ----------
// T('t43',x,y) places tile 43 of the town sheet (t town, d dungeon, f farm) at 3x (48 units).
const TS=48;let TUSE=new Set();
function T(id,x,y,o=''){TUSE.add(id);return `<use href="#${id}" x="${x}" y="${y}"${o}/>`}
function TF(id,x,y){TUSE.add(id);return `<use href="#${id}" transform="translate(${x+TS},${y}) scale(-1,1)"/>`}
function tileDefs(){const used=new Set();let s='',atl=false;const A=typeof ATLAS!=='undefined'?ATLAS:null;
  for(const id of TUSE){const a=A?A.ids.indexOf(id):-1;
    if(a>=0){atl=true;s+=`<symbol id="${id}" viewBox="${(a%A.cols)*16} ${Math.floor(a/A.cols)*16} 16 16" width="48" height="48"><use href="#SA"/></symbol>`}
    else{if(A&&!tileDefs.miss?.has(id)){(tileDefs.miss??=new Set()).add(id);console.warn('tile not in atlas',id)}const k=id[0],i=+id.slice(1);used.add(k);s+=`<symbol id="${id}" viewBox="${(i%12)*16} ${Math.floor(i/12)*16} 16 16" width="48" height="48"><use href="#S${k}"/></symbol>`}}
  let im=atl?`<image id="SA" href="${A.src}" width="${A.cols*16}" height="${Math.ceil(A.ids.length/A.cols)*16}" style="image-rendering:pixelated"/>`:'';
  for(const k of used)im+=`<image id="S${k}" href="${SHEETS[k]}" width="192" height="176" style="image-rendering:pixelated"/>`;return im+s}
// Pixel art from strings: one char per pixel, pal maps chars to colours, '.' is empty. s = units per pixel.
function pxArt(rows,pal,x=0,y=0,s=3,extra=''){
  const by={};rows.forEach((row,j)=>{let i=0;while(i<row.length){const ch=row[i];if(ch==='.'||!pal[ch]){i++;continue}let k=i;while(k<row.length&&row[k]===ch)k++;(by[ch]=by[ch]||[]).push(`M${x+i*s} ${y+j*s}h${(k-i)*s}v${s}h${-(k-i)*s}z`);i=k}});
  return `<g shape-rendering="crispEdges"${extra}>${Object.entries(by).map(([ch,d])=>`<path d="${d.join('')}" fill="${pal[ch]}"/>`).join('')}</g>`;
}
const KP={k:'#3f2631',K:'#262b44',w:'#ffffff',g:'#84c669',G:'#479f4a',l:'#8bd87d',d:'#eaa56c',D:'#bd6c4a',b:'#cf8254',s:'#c0cbdc',S:'#8b9bb4',z:'#5a6988',Z:'#52607c',r:'#c34b35',R:'#763b36',p:'#f28462',o:'#e38628',y:'#fdbe53',c:'#009adc',C:'#76e4ff',f:'#fcbc8f',v:'#9b4ca3',V:'#d176d0',t:'#43e1b3',T:'#25956a',e:'#e84537'};
