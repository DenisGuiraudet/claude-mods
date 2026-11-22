// The engine and the map of the village, edited here (the lab that generated them is in the git history).
// Session Village: a pixel-art village that lives at the pace of the Claude Code session.
// Tiles: Kenney Tiny Town, Tiny Dungeon, Tiny Farm (CC0). Actors: Ninja Adventure by Pixel-boy and AAA (CC0).
// The desktop drops images embedded in a scene, so every pixel is a vector path (data/vector.js).
import { PIXEL_CSS, GROUND_DEFS, GROUND, TILES, ACTORS } from './data/vector.js';
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
const loop=(name,dur,now,ease='ease-in-out',phase=0)=>{const d=((now+phase)/1000)%dur;return `${still(name,dur,ease,phase)}animation:${name} ${dur.toFixed(2)}s ${ease} infinite;animation-delay:-${d.toFixed(2)}s`};
// Frozen, an effect shorter than LONG seconds holds its poses longer, to show on a few frames (fxAdd keeps it as long).
const LONG=3;
const once=(name,dur,since,stagger=0,ease='ease-out',long=LONG)=>{const k=Math.max(1,long/(dur+stagger));return `${pose(name,clamp((since/1000/k-stagger)/dur),ease)}animation:${name} ${dur}s ${ease} 1 both;animation-delay:${(stagger-since/1000).toFixed(2)}s`};
// Still poses. A desktop that draws the backdrop frozen (reduced motion, software compositing) strips every
// animation and draws each element as styled. So an animated element also carries, as plain style, the
// transform and opacity its keyframes give at this frame's time; a running animation overrides them.
const NUM=/(-?\d*\.?\d+)(px|deg)?/g,STOPS={};
function stopsOf(name){const k=keysOf(CSS).m[name]||keysOf(VIEWS[VIEW]?.css||'').m[name];if(!k)return null;
  if(!STOPS[k]){const o={};for(const[,at,body]of k.slice(k.indexOf('{')+1,-1).matchAll(/([^{}]+)\{([^{}]*)\}/g))
    for(const d of body.split(';')){const i=d.indexOf(':'),q=d.slice(0,i).trim();if(q!=='transform'&&q!=='opacity')continue;
      for(const a of at.split(',')){const t=a.trim();(o[q]||=[]).push([t==='from'?0:t==='to'?100:parseFloat(t),d.slice(i+1).trim()])}}
    for(const q in o){const L=o[q].sort((a,b)=>a[0]-b[0]);if(L[0][0]>0)L.unshift([0,bare(q,L[0][1])]);if(L[L.length-1][0]<100)L.push([100,bare(q,L[L.length-1][1])])}
    STOPS[k]=o}
  return STOPS[k]}
// A keyframe left out holds the element's own value: no move or turn, scale 1, full opacity.
const bare=(q,v)=>q==='opacity'?'1':v.replace(/([a-zA-Z]+)\(([^)]*)\)/g,(m,fn,args)=>`${fn}(${args.replace(NUM,(n,x,u)=>(/^scale/.test(fn)?'1':'0')+(u||''))})`);
// Between two values of the same shape, number by number; otherwise the nearer one.
function lerpCss(a,b,k){const sa=a.replace(NUM,'#');if(k<=0||sa!==b.replace(NUM,'#'))return k<.5?a:b;const x=[...a.matchAll(NUM)],y=[...b.matchAll(NUM)];let i=0;
  return sa.replace(/#/g,()=>{const m=x[i],n=y[i++];return f2(+m[1]+(n[1]-m[1])*k)+(m[2]||n[2]||'')})}
// The timing function applies to each interval between two keyframes, as CSS does.
const ez=(k,ease)=>{const st=/steps\((\d+)/.exec(ease);return st?Math.floor(k*st[1]+1e-6)/st[1]:ease==='step-end'?0:ease==='ease-out'?1-(1-k)**2:ease==='ease-in'?k*k:/ease/.test(ease)?k*k*(3-2*k):k};
function pose(name,p,ease=''){const o=stopsOf(name);if(!o)return '';const x=clamp(p)*100;
  let s='';for(const q in o){const L=o[q];let j=0;while(j<L.length-2&&L[j+1][0]<=x)j++;const a=L[j],b=L[j+1];
    s+=`${q}:${!b||x>=100?L[L.length-1][1]:b[0]<=a[0]?b[1]:lerpCss(a[1],b[1],ez(clamp((x-a[0])/(b[0]-a[0])),ease))};`}
  return s}
// Frozen, the desktop shows a frame a beat (W.frame counts them, W.beat seconds apart). A loop's still pose goes
// one step a frame, a smooth loop four frames a cycle: a faster loop sampled once a beat would jump back and
// forth at random. With frames close enough to show each step in time, the loop keeps its own pace.
function still(name,dur,ease,phase=0){const o=stopsOf(name);if(!o)return '';
  const seg=Math.max(1,...Object.values(o).map(L=>L.filter((x,i)=>i&&x[0]-L[i-1][0]>1).length)),st=/steps\((\d+)/.exec(ease);
  const n=Math.max(dur/W.beat,st?st[1]*seg:ease==='step-end'?seg:4);
  return pose(name,((W.frame+.5+phase/1000/dur*n)%n)/n,ease)}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
// The scene fits the window whole (meet). Past its 1600x1000 the grass goes on, shaded (FRAME), and the
// layers over the whole scene (night, dawn, flash, rain) cover that margin too (BLEED).
const BLEED='x="-1600" y="-1000" width="4800" height="3000"';
const FRAME='<path d="M-1600 -1000h4800v3000h-4800zM0 0v1000h1600v-1000z" fill="#14210f" fill-rule="evenodd" opacity=".35"/>';
// Only CSS knows the window's size (vw, vh). The world (#kw) is drawn three times at the window's height (or
// less, see layoutCss), each copy clipped: the left part up to x 690, the river (690-940), the right part from
// 940. When the window is too narrow for the whole village, the meadow on each side of the river goes first (the
// buildings stay, 0-432 and 1200-1600), then the edges pass under the margins. A margin grows with the window:
// none under 700 px wide, all of it from 1600 px; one set by two clicks (fracLeft, fracRight) is a share of the
// window's width instead. On a short window the signs grow to stay readable. The buildings stay
// up to a line between two columns of tiles, which nothing on the ground crosses: a line inside a column
// left slivers of a tree, a bush or the road at the edge of a part.
const CUT={l:690,r:940,keepL:432,keepR:1200};
// The static ground cut in three at the cuts, once: each clipped copy draws its own part, not the whole map, which
// the app would otherwise paint three times over. In ground units (a third of the world's); a run of pixels or a
// tile across a cut goes in both parts. Each part keeps the whole grass underneath: cut to the part, the grass
// left the art blurred in Chromium at scales below one.
const GROUND_PARTS=(()=>{
  const cl=CUT.l/3,cr=CUT.r/3,span={l:[-1e9,cl],c:[cl,cr],r:[cr,1e9]},keys=['l','c','r'];
  const hit=(a,b)=>keys.filter(k=>a<span[k][1]&&b>span[k][0]);
  const runs={l:{},c:{},r:{}},rows={l:'',c:'',r:''};
  const body=GROUND.slice(GROUND.indexOf('<g transform="translate(0 .5)">'));
  for(const[,cls,d]of body.matchAll(/<path class="(\w+)" d="([^"]*)"\/>/g)){
    let x=0,y=0;
    for(const[,c,a,b]of d.matchAll(/([Mmh])(-?[\d.]+)(?:[ ,](-?[\d.]+))?/g)){
      if(c==='M'){x=+a;y=+b}else if(c==='m'){x+=+a;y+=+b}
      else{const n=+a;for(const k of hit(x,x+n))(runs[k][cls]=runs[k][cls]||[]).push([x,y,n]);x+=n}
    }
  }
  // the first row's tiles sit loose in the group, the others each in a row of their own
  const tiles=(uses,wrap)=>{
    const by={l:'',c:'',r:''};
    for(const[u,x]of uses.matchAll(/<use href="#\w+"(?: x="(-?[\d.]+)")?\/>/g))for(const k of hit(+(x||0),+(x||0)+16))by[k]+=u;
    for(const k of keys)if(by[k])rows[k]+=wrap(by[k]);
  };
  const ROW=/<g transform="translate\(0 (\d+)\)">(.*?)<\/g>/g;
  tiles(body.replace(ROW,'').replace(/<path [^>]*\/>/g,''),u=>u);
  for(const[,y,uses]of body.matchAll(ROW))tiles(uses,u=>`<g transform="translate(0 ${y})">${u}</g>`);
  const path=list=>{let o='',cx=null,cy=0;for(const[x,y,n]of list){o+=cx===null?`M${x} ${y}h${n}`:`m${x-cx} ${y-cy}h${n}`;cx=x+n;cy=y}return o};
  return keys.map(k=>`<g id="kg${k}" transform="scale(3)"><rect x="-544" y="-336" width="1632" height="1008" fill="url(#vg)"/>`
    +`<g transform="translate(0 .5)">${Object.entries(runs[k]).map(([cls,l])=>`<path class="${cls}" d="${path(l)}"/>`).join('')}${rows[k]}</g></g>`).join('');
})();
// The conversation column, `column` px wide (768 in the desktop app by default, 960 or 1280 when set wider) and
// centred between the margins as the app lays it out, frosts what is under it. Each part's buildings stay out
// of it, COL_PAD from its edge, as close to the river as that allows, with the meadow under the column. When a
// side is too narrow for its buildings, the world shrinks, centred, and its signs less than it. Where it would
// take less than MIN_H of the window's height, the room is too small for that to help: the world keeps the
// window's height and the meadow goes first, as without a column. Shrinking takes CSS dividing a length by a
// length, which @supports checks: where it cannot, the world keeps the window's height. With no column (0), the
// river alone parts the village.
const COL_PAD=16,MIN_H=60;
function layoutCss({left=0,right=0,column=0,fracLeft,fracRight}={}){
  const m=(v,fr)=>fr!=null?`calc(100vw * ${+fr.toFixed(4)})`:v>0?`clamp(0px,calc((100vw - 700px) / 900 * ${v}),${v}px)`:'0px';
  const C=CUT,river=C.r-C.l,u=n=>`var(--H) * ${n/1000}`;
  return `.kv{--ml:${m(left,fracLeft)};--mr:${m(right,fracRight)};--H:100vh;--cx:calc((var(--ml) + 100vw - var(--mr)) / 2);`
    +`--g0:${column>0?`calc(min(${column+2*COL_PAD}px,100vw - var(--ml) - var(--mr)) / 2)`:'0px'};--g:max(var(--g0),calc(${u(river/2)}));--xc:calc(var(--cx) - ${u(river/2)});`
    +`--x0:max(min(calc(var(--xc) - ${u(C.l)}),calc(var(--cx) - var(--g) - ${u(C.keepL)})),min(var(--ml),calc(var(--xc) - ${u(C.keepL)})));`
    +`--x1:min(max(calc(var(--xc) + ${u(1600-C.l)}),calc(var(--cx) + var(--g) + ${u(1600-C.keepR)})),max(calc(100vw - var(--mr)),calc(var(--xc) + ${u(river+1600-C.keepR)})));--y0:calc((100vh - var(--H)) / 2)}.ksg{transform:scale(var(--sg,1))}`
    // the height that fits the buildings beside the column (--a), or the window's when under MIN_H of it
    +(column>0?`@supports (scale:calc(2px / 1px)){.kv{--a:calc((var(--cx) - var(--g0) - var(--ml)) * ${f2(1000/C.keepL)});`
      +`--H:max(min(var(--a),100vh),min(100vh,calc((${MIN_H}vh - var(--a)) * 1000)));--s:calc(var(--H) / 100vh)}.ksg{transform:scale(calc(var(--sg,1) / sqrt(var(--s))))}}`:'')
    +`.kml{transform:translate(var(--x0),var(--y0)) scale(var(--s,1))}.kmc{transform:translate(calc(var(--xc) - ${u(C.l)}),var(--y0)) scale(var(--s,1))}.kmr{transform:translate(calc(var(--x1) - ${u(1600)}),var(--y0)) scale(var(--s,1))}`
    +`.kvl{width:calc(var(--xc) + 1px)}.kvc{transform:translate(var(--xc),0);width:calc(${u(river)} + 1px)}.kvr{transform:translate(calc(var(--xc) + ${u(river)}),0);width:100vw}`
    +`@media (max-height:900px){.kv{--sg:1.12}}@media (max-height:780px){.kv{--sg:1.28}}@media (max-height:660px){.kv{--sg:1.5}}`}
// The world at the window's height (meet in a box ten windows wide), and the three clipped copies.
const LAYOUT_DEFS=GROUND_PARTS+['l','c','r'].map(k=>`<svg id="kws${k}" width="1000%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMinYMid meet" overflow="visible"><use href="#kg${k}"/><use href="#kw"/></svg>`).join('')
  +['l','c','r'].map(k=>`<clipPath id="kv${k}"><rect class="kv${k}" height="100%"/></clipPath>`).join('');
const LAYOUT=['l','c','r'].map(k=>`<g clip-path="url(#kv${k})"><g class="km${k}"><use href="#kws${k}"/></g></g>`).join('');
const pick=(a,r=Math.random)=>a[Math.floor(r()*a.length)];
const INK='#2a2230';
const K='class="o"'; // outline: see .o in CSS

// ---------- session ----------
const MODELS={
  opus:{name:'Opus 5.5',cls:'Mage',a:'#8f62f5',b:'#ff7ac8'},
  sonnet:{name:'Sonnet 5.5',cls:'Knight',a:'#1fae97',b:'#52b6ff'},
  haiku:{name:'Haiku 5.5',cls:'Scout',a:'#4fae3a',b:'#d9e85a'},
  fable:{name:'Fable 5.2',cls:'Bard',a:'#e8951a',b:'#ff7a52'},
};
const CLASS={opus:'mage',sonnet:'knight',haiku:'scout',fable:'bard'};
const EFFORT={low:.15,medium:.35,high:.6,xhigh:.82,max:1};
// started: false until the first prompt of the session (the village sleeps).
const S={started:false,model:'opus',effort:'high',activity:'idle',context:0,rate:2,cost:0,subagents:0,
  wavesTotal:4,waveCurrent:2,todoDone:0,todoTotal:5,steps:{commit:true,push:false,pr:false,merged:false}};
function waveState(i){if(i<S.waveCurrent)return 'merged';if(i===S.waveCurrent)return S.steps.merged?'merged':'current';return 'todo'}
function progress(){const st=S.steps,t=S.todoTotal?Math.min(1,S.todoDone/S.todoTotal):0;return st.merged?1:Math.min(.96,.6*t+(st.commit?.14:0)+(st.push?.12:0)+(st.pr?.1:0))}

// One place per signal. Each view gives its own name, building and in-world sign.
const SIG={
  think:{col:null,what:'Thinking, effort'},
  bash:{col:'#e0533f',what:'Bash'},
  edit:{col:'#e9a83a',what:'Edit, Write'},
  read:{col:'#4b93e0',what:'Read, Grep'},
  web:{col:'#2bb3a3',what:'Web, messages'},
  agents:{col:'#ee7d3c',what:'Sub-agents'},
  context:{col:'#8b63e0',what:'Context'},
  cost:{col:'#e2b63a',what:'Cost'},
  todo:{col:'#6dbb4c',what:'Tasks'},
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
  case 'think':return S.activity==='thinking'?`Thinking ${S.effort}`:`Effort ${S.effort}`;
  case 'bash':return 'Bash';case 'edit':return 'Edit';case 'read':return 'Read';case 'web':return 'Web';
  case 'agents':return `${S.subagents} sub-agent${S.subagents===1?'':'s'}`;
  case 'context':return `${S.context}%`;
  case 'cost':return `$${S.cost.toFixed(2)}`;
  case 'todo':return `${S.todoDone}/${S.todoTotal}`;
  case 'waves':{const st=S.steps;return `Wave ${Math.min(S.waveCurrent,S.wavesTotal)}/${S.wavesTotal}`+(st.merged?' merged':st.pr?' PR':st.push?' push':st.commit?' commit':'')}}return ''}

// A sign tells what its place shows: the tool, or the measure and its value.
const SIGN={context:'Context',cost:'Cost',todo:'Tasks'};
const signText=id=>SIGN[id]?`${SIGN[id]} · ${sigValue(id)}`:/^(bash|edit|read|web)$/.test(id)?SIG[id].what:sigValue(id);

function derive(now){
  const m=MODELS[S.model],ctx=S.context/100,rate=S.rate/100,pre=!S.started;
  return {m,cls:CLASS[S.model],eff:EFFORT[S.effort],ctx,rate,now,pre,wake:now<W.wakeUntil,
    n:pre?.85:clamp((rate-.6)/.3),dusk:pre?0:clamp(1-Math.abs(rate-.62)/.14),dawn:pre?0:clamp(1-rate/.12),storm:pre?0:clamp((rate-.86)/.1),
    boss:ctx>=.85,prog:progress(),sig:pre?null:ACT_SIG[S.activity]||null,act:S.activity,
    waves:Array.from({length:S.wavesTotal},(_,i)=>waveState(i+1)),cur:Math.min(S.waveCurrent,S.wavesTotal),
    fest:now<W.festUntil,letter:now<W.letterUntil,fireOn:sig=>W.fires.some(x=>x.sig===sig&&now>=x.from&&now<x.until)};
}

// ---------- world ----------
const W={seed:(Math.random()*1e9)|0,frame:0,beat:1,lite:0,ambNext:0,ents:[],fx:[],fires:[],nid:1,dirty:true,letterUntil:0,wakeUntil:0,costPulse:0,todoPulse:0,festUntil:0,nextSpawn:0,nextAdv:0,navKey:null,lastCost:S.cost,lastTodo:S.todoDone};
let VIEW='valley',LABELS=true,NAV={nodes:{},adj:{}};

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
// Whether the scene moved on its own since a frame drawn at `since`: someone walked, or an effect played.
function busy(since){return W.ents.some(e=>e.pts&&e.t1>since)||W.fx.some(x=>x.until>since)}
// Everyone walks at half the pace of their speed: a desktop that freezes the backdrop moves walkers only
// from one frame to the next, a second apart, and at full pace a villager would skip more than a tile.
const PACE=.5;
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
  e.len=len;e.t0=now;e.t1=now+len/((speed||e.speed)*PACE)*1000;e.state='walk';return true;
}
function leave(e,now){
  e.leaving=true;e.until=0;const V=VIEWS[VIEW];
  if(e.kind==='enemy'){let best=null,bd=Infinity;const p=pos(e,now);for(const s of V.spawn){const d=dist(p,NAV.nodes[s]);if(d<bd){bd=d;best=s}}goTo(e,best,now,55)}
  else if(e.kind==='adv')goTo(e,V.places.agents.node,now,120);
}
function kill(e,now){const p=pos(e,now);fxAdd('puff',now,{at:[p[0]+e.jx,p[1]+e.jy-10],dur:900});e.state='gone';W.dirty=true}
function fxAdd(kind,now,o={}){W.fx.push({kind,t0:now,until:now+Math.max(o.dur||3000,LONG*1000),...o});W.dirty=true}

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
  // four adventurers at most, as the guild's banners: its sign tells how many sub-agents run
  const ad=live('adv'),advs=D.pre?0:Math.min(4,S.subagents);
  if(ad.length<advs&&now>=W.nextAdv){addEnt('adv',V.places.agents.node,{skin:'adv',speed:115});W.nextAdv=now+700}
  else if(ad.length>advs)leave(ad[ad.length-1],now);
}
function step(now){
  W.frame++;
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
  const sc=(V.charScale||1)*(e.scale||1),s=segAt(e,now);if(e.state==='home')return '';
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
    const turn=same?`<g transform="scale(${dirs[0]},1)">${body}</g>`:`<g transform="scale(${dirs[0]},1)" style="animation:${id}f ${dur}s step-end both">${body}</g>`;
    return `<g transform="translate(${f(rest[0][0]+e.jx)},${f(rest[0][1]+e.jy)})" style="animation:${id} ${dur}s linear both"><g transform="scale(${f2(sc)})">${shadow}${aura}${turn}</g></g>`;
  }
  const p=pos(e,now);
  return `<g transform="translate(${f(p[0]+e.jx)},${f(p[1]+e.jy)})"><g transform="scale(${f2(sc)})">${shadow}${aura}</g><g transform="scale(${f2(e.dir*sc)},${f2(sc)})">${body}</g></g>`;
}

// Animated actors (Ninja Adventure sheets): 4 columns down/up/left/right, rows 4 walk frames then attack.
// A nested 16x16 viewport shows one frame; CSS steps move the sheet under it. Only what the frame shows is sent:
// AUSE maps each sheet to its faces, each with the rows it needs (1 standing, 2 walking, 4 attack).
// LITE, for a frame over budget: the walk cycles stand still, so only standing frames are sent.
let AUSE=new Map(),LITE=false;
function actorKey(e,V){const A=V.actors;if(!A||typeof ACTORS==='undefined')return null;const k=e.kind==='hero'?A.hero&&A.hero[S.model]:e.kind==='enemy'?A[e.type]:A[e.skin];return k&&ACTORS[k]?k:null}
const DIR4=(dx,dy)=>Math.abs(dx)>=Math.abs(dy)?(dx>=0?3:2):(dy>=0?0:1);
function drawActor(e,now,D,V,s,sc,k){
  const faces=AUSE.get(k)||new Map(),need=(f,b)=>faces.set(f,(faces.get(f)||0)|(LITE&&b===2?1:b));AUSE.set(k,faces);
  const walk=(d,n)=>LITE?img:`<g style="${loop('kw4',d,now,'steps(4)',n)}">${img}</g>`;const img=`<use href="#a_${k}"/>`,box=(inner,face)=>`<svg x="-24" y="-46" width="48" height="48" viewBox="${face*16} 0 16 16">${inner}</svg>`;
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
    const same=d4.every(d=>d===d4[0]);for(const d of d4)need(d,2);
    if(!same)KF.push(`@keyframes ${id}d{${d4.map((d,i)=>`${pc[i]}%{transform:translateX(${-16*d}px)}`).join('')}100%{transform:translateX(${-16*e.face}px)}}`);
    const legs=LITE?img:`<g style="${still('kw4',.6,'steps(4)')}animation:kw4 .6s steps(4) ${Math.max(1,Math.ceil(sec/.6))}">${img}</g>`;
    const turn=same?`<g transform="translate(${-16*d4[0]},0)">${legs}</g>`:`<g transform="translate(${-16*d4[0]},0)" style="animation:${id}d ${dur}s step-end both">${legs}</g>`;
    return `<g transform="translate(${f(rest[0][0]+e.jx)},${f(rest[0][1]+e.jy)})" style="animation:${id} ${dur}s linear both"><g transform="scale(${f2(sc)})">${shadow}${aura}${box(turn,0)}</g></g>`;
  }
  const face=e.face??0;let body;
  if(e.state==='sleep')need(0,1);else if(e.state==='dance')need(0,2);else if(e.state==='work'||e.state==='fight')need(face,5);else need(face,e.kind==='enemy'?2:1);
  if(e.state==='sleep')body=`<g transform="translate(22,-20) rotate(-90)">${box(img,0)}</g><g style="${loop('kzz',2.4,now,'steps(4)',e.id*300)}">${pxArt(ZZ,{w:'#3f2631'},-3,-31,3)}${pxArt(ZZ,{w:'#ffffff'},-6,-34,3)}</g>`;
  else if(e.state==='work'||e.state==='fight'){
    const tl=e.state==='fight'?'d104':V.tools&&V.tools[e.skin];let tool='';
    if(tl){TUSE.add(tl);tool=`<g transform="translate(${face===2?-36:6},-40)"><g style="transform-box:fill-box;transform-origin:10% 90%;${loop('kworkp',.5,now,'steps(2)',e.id*90)}"><use href="#${tl}" width="30" height="30"/></g></g>`}
    body=box(`<g style="${loop('katk',.5,now,'step-end',e.id*90)}">${img}</g>`,face)+tool}
  else if(e.state==='dance'){body=`<g style="${loop('khopp',.5,now,'steps(2)',e.id*97)}">${box(walk(.6,e.id*50),0)}</g>`;
    if(e.notes)for(let i=0;i<2;i++)body+=`<g style="${loop('kzz',1.8,now,'steps(4)',i*900)}">${pxArt(NOTE,{k:'#3f2631',y:'#fee761'},8-i*20,-60,3)}</g>`}
  else if(e.kind==='enemy')body=box(walk(1.2,e.id*97),face);
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
@keyframes kspin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes ksway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes kdrift{0%{transform:translateX(-300px)}100%{transform:translateX(1900px)}}
@keyframes kbobw{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
@keyframes kconf{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx,20px),220px) rotate(540deg);opacity:0}}
@keyframes kfly{0%{transform:translate(0,0)}100%{transform:translate(-2000px,-160px)}}
@keyframes kstar{0%{transform:translate(0,0);opacity:0}15%{opacity:1}100%{transform:translate(420px,160px);opacity:0}}
@keyframes kflyo{from{transform:translate(0px,0px)}to{transform:translate(-2000px,-160px)}}
@keyframes kcloud{from{transform:translate(-300px,0)}to{transform:translate(1800px,0)}}
@keyframes kdrag{from{transform:translate(-200px,0)}to{transform:translate(1900px,-260px)}}
@keyframes kw4{from{transform:translateY(0px)}to{transform:translateY(-64px)}}
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
    else if(x.kind==='firework'){o+=`<g transform="translate(${f(x.x)},${f(x.y)})"><line x1="0" y1="0" x2="0" y2="300" stroke="${x.col}" stroke-width="3" class="kc" style="transform-origin:50% 100%;${once('klaunch',.5,since,0,'ease-out',0)}"/><use href="#kfw" style="color:${x.col};--fd:${(.5-since/1000).toFixed(2)}s;${pose('kburst',clamp((since/1000-.5)/1.5)).replace(/(^|;)(t|o)[a-z]+:/g,'$1--f$2:')}"/></g>`}
    else if(x.kind==='spell'){const c=D.m.a;o+=`<circle cx="${f(hp[0])}" cy="${f(hp[1]-20)}" r="20" fill="none" stroke="${c}" stroke-width="10" vector-effect="non-scaling-stroke" class="kc" style="${once('kspell',1.8,since)}"/><circle cx="${f(hp[0])}" cy="${f(hp[1]-20)}" r="20" fill="none" stroke="#fff" stroke-width="3" vector-effect="non-scaling-stroke" class="kc" style="${once('kspell',1.8,since,.15)}"/><rect ${BLEED} fill="#ffffff" style="${once('kflash',1.2,since)}"/>`}
    else if(x.kind==='bird'){const a=V.birdFrom||[1700,60],tx=hp[0]+8,ty=hp[1]-48,cx=(a[0]+tx)/2,cy=Math.min(a[1],ty)-120,id='kq'+x.t0%1e6,bz=t=>{const u=1-t;return[f(u*u*a[0]+2*u*t*cx+t*t*tx),f(u*u*a[1]+2*u*t*cy+t*t*ty)]};
      KF.push(`@keyframes ${id}{${[0,1,2,3,4,5,6].map(i=>{const[x,y]=bz(i/6);return `${f(i/6*100)}%{transform:translate(${x}px,${y}px)}`}).join('')}}`);
      o+=`<g transform="translate(${bz(clamp(since/3000)).join(',')})" style="animation:${id} 3s linear both;animation-delay:${(-since/1000).toFixed(2)}s"><g style="${once('klate',5,since,0,'linear')}"><g transform="scale(1.4)"><g class="kc" style="${loop('kflap',.32,now,'steps(2)')}">${bird('#f4f1fa')}</g><rect x="-5" y="3" width="10" height="7" fill="#fff8e6" stroke="${INK}" stroke-width="1.2"/><rect x="-1" y="5" width="2" height="3" fill="#d9483b"/></g></g></g>`}
    else if(x.kind==='star')o+=`<g transform="translate(${x.x},${x.y})"><g style="${once('kstar',1.2,since,0,'steps(10)')}">${pxArt(['w.......','.wC.....','..CCw...','....CCCw'],{w:'#ffffff',C:'#c6f2ff'},0,0,3)}</g></g>`;
    else if(x.kind==='flock')o+=`<g transform="translate(1700,${x.y})"><g style="${once('kflyo',14,since,0,'steps(140)')}">${[[0,0],[30,12],[-24,15],[54,27]].map(([a,b],i)=>`<g style="${loop('kpulse',.4,now,'steps(2)',i*120)}">${pxArt(['k...k','.k.k.','..k..'],KP,a,b,3)}</g>`).join('')}</g></g>`;
    else if(x.kind==='cloud')o+=`<g transform="translate(0,${x.y})" opacity=".13"><g style="${once('kcloud',45,since,0,'steps(90)')}">${pxArt(CLOUD,{k:'#1d2a4a'},0,0,15)}</g></g>`;
    else if(x.kind==='shadow')o+=`<g transform="translate(0,${x.y})" opacity=".3"><g style="${once('kdrag',7,since,0,'steps(56)')}"><g transform="rotate(90)">${pxArt(DRAGON,{k:'#140c24'},-72,-84,6)}</g></g></g>`;
    else if(x.kind==='sunrise'){o+=`<rect ${BLEED} fill="${V.night||'#3b4380'}" opacity="${f2(.85*.72)}" style="${once('kfade',3.4,since,0,'steps(8)')};mix-blend-mode:multiply"/><rect ${BLEED} fill="#ffb98a" opacity=".25" style="${once('kfade',3.4,since,.6,'steps(8)')}"/>`}
    else if(x.kind==='alert'){o+=`<g transform="translate(${f(hp[0]-6)},${f(hp[1]-96)})"><g style="${once('klate',2.6,since,0,'linear')}"><g style="${loop('kalert',.5,now,'steps(2)')}">${pxArt(BANG,KP,0,0,3)}</g></g></g>`}
  }
  if(D.fest){for(let j=0;j<26;j++){const r=rnd(j+3),x0=(P.waves.fx||P.waves.label)[0]-260+r()*520,y0=(P.waves.fx||P.waves.label)[1]-200+r()*60;o+=`<rect x="${f(x0)}" y="${f(y0)}" width="6" height="9" fill="${pick(['#ffd04a','#ff7ac8','#7ee0ff','#b6ff7a','#ffffff'],r)}" class="kc" style="--dx:${f((r()-.5)*90)}px;${loop('kconf',2.4+r()*1.4,now,'steps(12)',j*170)}"/>`}}
  return o;
}
function atmosphere(now,D,V,R){
  let o='';
  if(D.dawn>0)o+=`<rect ${BLEED} fill="#ffb98a" opacity="${f2(D.dawn*.16)}" style="mix-blend-mode:soft-light"/>`;
  if(D.dusk>0)o+=`<rect ${BLEED} fill="#ff8a3a" opacity="${f2(D.dusk*.22)}" style="mix-blend-mode:soft-light"/>`;
  if(D.n>0)o+=`<rect ${BLEED} fill="${V.night||'#3b4380'}" opacity="${f2(D.n*.72)}" style="mix-blend-mode:multiply"/>`;
  if(V.mist)o+=V.mist(D,now);
  const Ls=R.lights||[];
  if(Ls.length&&D.n>.05){const by={};for(const[x,y,w,h,c,src]of Ls){const k=c||'#ffcf6a';(by[k]=by[k]||[]).push([x,y,w,h,src])}
    // a light with a 6th flag is a source drawn by the view itself: halo only, no lit core over it
    const ring=(L,g,core)=>L.filter(q=>!core||!q[4]).map(([x,y,w,h])=>`M${x-g} ${y-g}h${w+2*g}v${h+2*g}h${-w-2*g}z`).join('');
    let gl='';for(const c in by){const k=ring(by[c],0,1);gl+=`<path d="${ring(by[c],9)}" fill="${c}" opacity=".16"/><path d="${ring(by[c],3)}" fill="${c}" opacity=".4"/>${k?`<path d="${k}" fill="${mix(c,'#ffffff',.3)}"/>`:''}`}
    o+=`<g opacity="${f2(clamp(D.n*1.5))}" shape-rendering="crispEdges">${gl}</g>`}
  if(D.storm>0)o+=`<g opacity="${f2(D.storm)}"><rect x="-1700" y="-1240" width="5000" height="3500" fill="url(#krainp)" style="${loop('krainp',.45,now,'steps(4)')}"/><g transform="translate(37,55)"><rect x="-1700" y="-1240" width="5000" height="3500" fill="url(#krainp)" opacity=".6" style="${loop('krainp',.6,now,'steps(4)',200)}"/></g></g>`;
  return o;
}
// In-world signs: each view draws its own (V.sign). Engine falls back to a wooden plank.
function signs(now,D,V){
  let o='';
  for(const id in V.places){const P=V.places[id];if(!P.label)continue;
    const act=sigActive(id,now),col=sigCol(id,D),text=signText(id);
    o+=`<g class="ksg" style="transform-origin:${f(P.label[0])}px ${f(P.label[1])}px">${(V.sign||woodSign)(P.label[0],P.label[1],{id,act,col,text,name:P.name,value:sigValue(id),now,D})}</g>`;
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
// The colour classes of the vector pixels, only those the frame uses.
const PCSS=Object.fromEntries(PIXEL_CSS.split('}').filter(Boolean).map(r=>[r.slice(1,r.indexOf('{')),r+'}']));
function pixelCss(svg){let o='';for(const c of new Set([...svg.matchAll(/class="(p[a-zA-Z]{1,2})"/g)].map(m=>m[1])))o+=PCSS[c]||'';return o}
function styleFor(svg,V){const A=keysOf(CSS),B=keysOf(V.css||''),used=new Set([...svg.matchAll(/animation:\s*([\w-]+)/g)].map(m=>m[1]));
  let o=A.base+B.base;for(const n of used)o+=A.m[n]||B.m[n]||'';return o+KF.join('')}
// The desktop refuses a scene over 131072 characters: a frame over it is drawn again with LITE. Six or seven
// walkers at once take a frame past 120000, where a lower budget left them gliding for seconds.
const BUDGET=131072;
// Two clicks on the village at the edges of the room the app's panels leave, each a share of its width (0 to
// 1, in either order): the margins as shares of the width, or null for clicks too close to leave the room.
const clickShares=(a,b)=>{const l=Math.min(a,b),r=Math.max(a,b);return r-l<.2?null:{left:+l.toFixed(4),right:+(1-r).toFixed(4)}};
// Where the first of two clicks setting the margins landed, a share of the window's width: a line across it.
const mark=x=>`<rect width="4" height="100%" fill="#fff" opacity=".85" style="transform:translateX(calc(100vw * ${+x.toFixed(4)} - 2px))"/>`;
function compose(now,margins){let s=composeOnce(now,margins);if(s.length>BUDGET){W.lite++;LITE=true;try{s=composeOnce(now,margins)}finally{LITE=false}}return s}
function composeOnce(now,margins){
  const V=VIEWS[VIEW],D=derive(now);navFor(V);TUSE=new Set();KF=[];AUSE=new Map();
  const R=V.draw(now,D);
  const items=(R.props||[]).slice(),need=new Set();
  for(const e of W.ents){if(e.state==='gone'||e.state==='home')continue;need.add(e.skin);const p=pos(e,now);items.push([p[1]+e.jy+(e.zs||0),drawEnt(e,now,D,V)])}
  items.sort((a,b)=>a[0]-b[0]);
  let o=R.ground+items.map(i=>i[1]).join('')+(R.top||'');
  o+=atmosphere(now,D,V,R);
  o+=effects(now,D,V);
  o+=(R.hud||'');
  if(LABELS)o+=signs(now,D,V);
  let fw='';if(W.fx.some(x=>x.kind==='firework')){for(let j=0;j<18;j++)fw+=`<g transform="rotate(${j*20})"><circle r="4" fill="${j%2?'#fff':'currentColor'}" style="transform:var(--ft);opacity:var(--fo);animation:kburst 1.5s ease-out 1 both;animation-delay:var(--fd,0s)"/></g>`;fw=`<g id="kfw">${fw}</g>`}
  if(V.sprites)need.clear();if(W.ents.some(e=>e.kind==='cart'))need.add('cart');
  const defs=`<defs>${fw}${charDefs(D,V,need)}${D.storm>0?`<pattern id="krainp" width="80" height="120" patternUnits="userSpaceOnUse"><path d="M20 0 l-6 22 M62 40 l-6 22 M40 84 l-6 22" stroke="#d4dcff" stroke-opacity=".6" stroke-width="1.8"/></pattern>`:''}${V.sprites?'<ellipse id="ksh" rx="15" ry="5" fill="#3f2631" opacity=".28"/>':''}${[...AUSE].map(([k,fs])=>`<g id="a_${k}" transform="translate(0 .5)">${[...fs].map(([c,b])=>{const A=ACTORS[k][c];return (b&2?A[1]:b&1?A[0]:'')+(b&4?A[2]:'')}).join('')}</g>`).join('')}${R.defs||''}${tileDefs()}<g id="kw">${o}${FRAME}</g>${LAYOUT_DEFS}</defs>`;
  const body=defs.replace(/ shape-rendering="crispEdges"/g,'');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="kv" width="100%" height="100%" shape-rendering="crispEdges" role="img" aria-label="${esc(V.name)}"><style>${pixelCss(body)}${styleFor(body,V)}${layoutCss(margins)}</style>${body}${LAYOUT}${margins&&margins.mark!=null?mark(margins.mark):''}</svg>`;
}
const VIEWS={};

// ---------- pixel assets ----------
// T('t43',x,y) places tile 43 of the town sheet (t town, d dungeon, f farm) at 3x (48 units).
const TS=48;let TUSE=new Set();
function T(id,x,y,o=''){TUSE.add(id);return `<use href="#${id}" x="${x}" y="${y}"${o}/>`}
function TF(id,x,y){TUSE.add(id);return `<use href="#${id}" transform="translate(${x+TS},${y}) scale(-1,1)"/>`}
// A tile's strokes sit on whole rows, so its viewBox starts half a pixel up.
function tileDefs(){let s='';for(const id of TUSE)if(TILES[id])s+=`<symbol id="${id}" viewBox="0 -.5 16 16" width="48" height="48">${TILES[id]}</symbol>`;return s}
// Pixel art from strings: one char per pixel, pal maps chars to colours, '.' is empty. s = units per pixel.
function pxArt(rows,pal,x=0,y=0,s=3,extra=''){
  const by={};rows.forEach((row,j)=>{let i=0;while(i<row.length){const ch=row[i];if(ch==='.'||!pal[ch]){i++;continue}let k=i;while(k<row.length&&row[k]===ch)k++;(by[ch]=by[ch]||[]).push(`M${x+i*s} ${y+j*s}h${(k-i)*s}v${s}h${-(k-i)*s}z`);i=k}});
  return `<g shape-rendering="crispEdges"${extra}>${Object.entries(by).map(([ch,d])=>`<path d="${d.join('')}" fill="${pal[ch]}"/>`).join('')}</g>`;
}
const KP={k:'#3f2631',K:'#262b44',w:'#ffffff',g:'#84c669',G:'#479f4a',l:'#8bd87d',d:'#eaa56c',D:'#bd6c4a',b:'#cf8254',s:'#c0cbdc',S:'#8b9bb4',z:'#5a6988',Z:'#52607c',r:'#c34b35',R:'#763b36',p:'#f28462',o:'#e38628',y:'#fdbe53',c:'#009adc',C:'#76e4ff',f:'#fcbc8f',v:'#9b4ca3',V:'#d176d0',t:'#43e1b3',T:'#25956a',e:'#e84537'};

// Session Village, pixel art: a 34 x 21 tile village (Kenney Tiny Town, Tiny Dungeon, Tiny Farm, CC0) plus
// hand-made pixel pieces in the same palette. Buildings sit on two wings, the key signals on the right; the centre (under the chat
// column) is a calm meadow with the river. Everything static is drawn once, as vector paths (data/vector.js);
// only what moves or reads a signal is drawn per frame.
(()=>{
const X=c=>c*48,Y=r=>r*48,nd=(c,r)=>[c*48+24,r*48+40];

// ---------- map ----------
const RIVER_L={0:16,1:16,2:16,3:16,4:16,5:16,6:16,7:15,8:15,9:15,10:15,11:15,12:15,13:16,14:16,15:16,16:16,17:17,18:17,19:17,20:17};
const WATER=new Set();for(const r in RIVER_L){WATER.add(RIVER_L[r]+','+r);WATER.add((RIVER_L[r]+1)+','+r)}
// Left wing (often under the app's sidebar): tool activity, tasks, the guild. Right wing, the last six
// columns always in view: waves (castle), model and effort (tower), context (woods, fog, monsters),
// the hero's home; cost sits just left of them.
const N={
  roadL:nd(-2,4),mine:nd(1,4),anvil:[X(4)+36,Y(4)+40],post:nd(6,4),postW:nd(8,4),
  stL:nd(3,6),j9L:nd(3,9),ws:nd(1,9),wsW:nd(2,9),lib:nd(6,9),libW:nd(8,9),farm:nd(3,12),farmW:nd(5,12),farmW2:nd(7,12),bY:nd(3,15),barn:nd(1,15),gL:nd(3,18),guild:nd(7,18),
  cW:nd(10,4),brW:nd(15,4),brE:nd(18,4),cE:nd(24,4),fish:nd(14,10),
  rd27:nd(27,4),rd29:nd(29,4),castle:[X(32),Y(4)+40],roadR:nd(35,4),
  stR:nd(29,6),j10R:nd(29,10),bank:nd(26,9),bankW:nd(28,9),towerW:nd(30,10),tower:nd(31,10),tw32:nd(32,10),watch:nd(32,14),
  pl:nd(28,13),camp:nd(26,13),gA:nd(28,15),gB:nd(31,15),
  fr1:nd(26,17),fr2:nd(29,17),fr3:nd(32,17),fr4:nd(27,19),fr5:nd(30,19),fr6:nd(33,19),spR:nd(35,17),spR2:nd(35,20),spB:nd(28,22),
};
const EDGES=[['roadL','mine'],['mine','anvil'],['anvil','post'],['post','postW'],['postW','cW'],['cW','brW'],['brW','brE'],['brE','cE'],['brW','fish'],['cE','rd27'],['rd27','rd29'],['rd29','castle'],['castle','roadR'],
  ['anvil','stL'],['stL','j9L'],['j9L','wsW'],['wsW','ws'],['j9L','lib'],['lib','libW'],['j9L','farm'],['farm','farmW'],['farmW','farmW2'],['farm','bY'],['bY','barn'],['bY','gL'],['gL','guild'],
  ['rd29','stR'],['stR','j10R'],['j10R','bankW'],['bankW','bank'],['j10R','towerW'],['towerW','tower'],['tower','tw32'],['tw32','watch'],['j10R','pl'],['pl','camp'],['pl','gA'],['gA','gB'],['gB','watch'],
  ['gA','fr1'],['gA','fr2'],['gB','fr2'],['gB','fr3'],['fr1','fr2'],['fr2','fr3'],['fr1','fr4'],['fr4','fr5'],['fr5','fr6'],['fr2','fr5'],['fr3','fr6'],['spR','fr3'],['spR2','fr6'],['spB','fr4']];
const LEFT=['j9L','ws','lib','stL','farm','mine','post','guild'],RIGHT=['pl','j10R','bank','camp','towerW','gA','tw32'];
let HUD=[];

// ---------- pixel pieces ----------
function HOURGLASS(rate){const top=Math.round((1-rate)*4),bot=4-top,rows=['kkkkkkkkkkkk','.kSSSSSSSSk.'];
  for(let i=0;i<4;i++)rows.push('.'.repeat(i+1)+'k'+(i>=4-top?'y':'C').repeat(8-2*i)+'k'+'.'.repeat(i+1));
  rows.push('.....kk.....');
  for(let i=3;i>=0;i--)rows.push('.'.repeat(i+1)+'k'+(i<bot?'y':'C').repeat(8-2*i)+'k'+'.'.repeat(i+1));
  rows.push('.kSSSSSSSSk.','kkkkkkkkkkkk');return rows}
const BANNER=['kkkkk','kaaak','kabak','kaaak','kaaak','kak.k','kk..k'];
const FLAG=['k.....','kaaaa.','kabaak','kaaaa.','k.....','k.....','k.....'];
const COINS=['.kkkk.','kyyyyk','kkkkkk','kyyyyk','kkkkkk'];
const PIGEON=['.ww..','wwwww','..ww.'];
const CRYSTAL=['...k...','..kbk..','.kbwak.','kbbaaak','.kaaak.','..kak..','...k...'];
const FIRE=[['....y.....','...yoy..y.','..yoey.yoy','.yoeeoyooy','.yoeeeooey','..yoeeeoy.'],['.....y....','.y..yoy...','yoy.yeoy..','yooyoeeoy.','yeooeeeoy.','.yoeeeoy..']];
const LOGS=['kDDkDDkDDk','.kDDkDDkk.'];
const BANG=['.kk.','kyyk','kyyk','kyyk','kyyk','.kk.','....','.kk.','kyyk','.kk.'];
const LAMPS=[[25,11],[29,11]];

const WIN={workshop:[[0,8]],library:[[5,8],[7,8]],guild:[[6,17],[8,17]],bank:[[27,8]]};
// ---------- dynamic pieces: only what moves or reads a signal ----------
function mine(D,now,L){const act=sigActive('bash',now);let s=`<g style="${act?loop('vp-cart',3.4,now,'steps(8)'):''}">${T('d54',X(1),Y(4)-18)}</g>`;
  if(act){s+=`<rect x="${X(4)+12}" y="${Y(3)+18}" width="24" height="18" fill="#fdbe53" style="${loop('kpulse',.6,now,'steps(2)')}"/>`;
    for(let i=0;i<4;i++)s+=`<rect x="${X(4)+36}" y="${Y(4)+12}" width="6" height="6" fill="#fdbe53" style="${loop('vp-spark',.6,now,'steps(3)',i*150)};--vx:${(i-1.5)*12}px"/>`;L.push([X(4)+9,Y(3)+15,30,24,'#ff9a4a'])}
  return [Y(4)+10,s]}
function tower(D,now,L){const act=sigActive('think',now),a=D.m.a,b=D.m.b;
  let s=pxArt(HOURGLASS(S.rate/100),KP,X(31)+6,Y(8)+3,3);
  const big=act&&!D.pre;
  s+=`<g style="${D.pre?'':loop('vp-float',1.6,now,'steps(2)')}"${D.pre?' opacity=".45"':''}>${pxArt(CRYSTAL,{k:'#3f2631',a,b,w:'#ffffff'},X(31)+(big?3:8),Y(5)+(big?0:9),big?6:4.5)}</g>`;
  if(big){const sp=4-D.eff*2.8;for(let i=0;i<6;i++){const ang=i/6*Math.PI*2;s+=`<g transform="translate(${X(31)+24},${Y(5)+21})"><g style="${loop('kspin',sp,now,'steps(12)')}"><rect x="${Math.round(Math.cos(ang)*20)*3-4}" y="${Math.round(Math.sin(ang)*9)*3-4}" width="9" height="9" fill="${b}"/></g></g>`}
    L.push([X(31)+9,Y(5)+6,30,30,b])}
  s+=pxArt(FLAG,{k:'#3f2631',a,b},X(30)+6,Y(6)+3,3)+pxArt(FLAG,{k:'#3f2631',a,b},X(32)+24,Y(6)+3,3);
  return [Y(10),s]}
function castle(D,now,L){const a=D.m.a,b=D.m.b;let s='';const slots=[29,30,31,32,33];
  D.waves.forEach((st,i)=>{const c=slots[i];if(c===undefined)return;const x=X(c);
    if(st==='merged'){s+=T('t102',x,Y(0))+pxArt(FLAG,{k:'#3f2631',a,b},x+18,Y(0)-15,3);L.push([x+15,Y(0)+18,18,15,'#ffcf6a'])}
    else if(st==='current'){const h=Math.max(1,Math.round(D.prog*5));s+=`<rect x="${x+6}" y="${Y(1)-h*9}" width="36" height="${h*9+3}" fill="#c0cbdc" stroke="#3f2631" stroke-width="3"/><path d="M${x+3} ${Y(1)+3}V${Y(0)-9}M${x+45} ${Y(1)+3}V${Y(0)-9}M${x} ${Y(0)+6}h48M${x} ${Y(0)+27}h48" stroke="#bd6c4a" stroke-width="4"/>`;
      if(S.steps.pr)s+=`<g style="${loop('vp-wave',1.2,now,'steps(2)')}">${pxArt(BANNER,{k:'#3f2631',a,b},x+16,Y(1)+6,3)}</g>`}
    else s+=pxArt(['....kkk.....','...kSSSk.kk.','.kkSzSSkkSSk','kSSSSzSkSSzk','kkkkkkkkkkkk'],KP,x+6,Y(1)-15,3)});
  return [Y(4)-6,s]}
function workshop(D,now,L){if(!sigActive('edit',now))return null;let o='';
  for(let i=0;i<5;i++)o+=`<rect x="${X(2)+12}" y="${Y(9)}" width="6" height="6" fill="#fec99c" style="${loop('vp-spark',.8,now,'steps(3)',i*160)};--vx:${(i-2)*12}px"/>`;
  return [Y(9),o+smoke(X(1)+24,Y(6)-6,now,1,'#e8e4ee',3)]}
function library(D,now,L){if(!sigActive('read',now))return null;
  let o=`<g style="${loop('kpulse',1.2,now,'steps(2)')}"><path d="M${X(5)+12} ${Y(8)+9}h24v24h-24zM${X(7)+12} ${Y(8)+9}h24v24h-24z" fill="#76e4ff" opacity=".7"/></g>`;
  for(let i=0;i<4;i++)o+=`<g transform="translate(${X(6)},${Y(6)})"><g style="${loop('kspin',4,now,'steps(16)',i*1000)}"><g transform="translate(84,0)">${pxArt(['wwww','wkkw','wwww'],KP,-6,-4,3)}</g></g></g>`;
  return [Y(9),o]}
function post(D,now,L){const act=sigActive('web',now);
  let o=D.letter?pxArt(['kee','kee','k..','k..'],KP,X(8)+30,Y(3)+3,3):pxArt(['keek'],KP,X(8)+30,Y(3)+21,3);
  if(act||D.letter)for(let i=0;i<3;i++)o+=`<g transform="translate(${X(6)+24},${Y(1)})"><g style="${loop('kspin',3,now,'steps(12)',i*1000)}"><g transform="translate(70,0)"><g style="${loop('kpulse',.4,now,'steps(2)',i*100)}">${pxArt(PIGEON,KP,-7,-4,3)}</g></g></g></g>`;
  return [Y(4)-14,o]}
function guild(D,now,L){const n=Math.min(4,S.subagents);if(!n)return null;let o='';
  for(let i=0;i<n;i++)o+=`<g style="${loop('vp-wave',1.4,now,'steps(2)',i*200)}">${pxArt(BANNER,{k:'#3f2631',a:D.m.b,b:'#ffffff'},X(5)+6+i*45,Y(16)+21,3)}</g>`;
  return [Y(18),o]}
function watch(D,now,L){const hi=S.context>=60,c=hi?'#d176d0':'#fdbe53',c2=hi?'#9b4ca3':'#e38628';
  L.push([X(31)+9,Y(11)-21,30,24,c,1]);
  HUD.push(`<g style="${loop('kpulse',hi?.4:.9,now,'steps(2)')}">${pxArt(['..y..','.yoy.','yoooy','.kkk.'],{y:c,o:c2,k:'#3f2631'},X(31)+9,Y(11)-21,6)}</g>`);return null}
function bank(D,now,L){const act=sigActive('cost',now);let o='';const k=Math.min(12,Math.round(S.cost*1.6));
  for(let i=0;i<k;i++){const col=i%3,row=Math.floor(i/3);o+=pxArt(COINS,KP,X(28)-3+col*12+row*3,Y(7)+12-row*9,3)}
  o+=T(S.cost>5?'d92':S.cost>2?'d91':'d89',X(28),Y(8)-3);
  if(act)o+=`<rect x="${X(28)-6}" y="${Y(6)}" width="60" height="96" fill="#fdbe53" opacity=".35" style="${loop('kpulse',.6,now,'steps(2)')}"/>`;
  return [Y(9)+20,o]}
const CROPS=[[64,66],[4,6],[16,18],[28,30],[40,42],[52,54]];
// Ten plots at most: past ten tasks, the ripe plots keep the share of the tasks done, all ripe only once all are.
function farm(D,now,L){const act=sigActive('todo',now),P=[],n=Math.min(10,S.todoTotal),ripe=n?Math.floor(S.todoDone*n/S.todoTotal):0;
  for(let i=0;i<n;i++){const c=4+i%5,r=i<5?11:13,cp=CROPS[i%6];P.push([Y(r)+40,T('f'+(i<ripe?cp[1]:cp[0]),X(c),Y(r)-6)])}
  if(act)P.push([Y(14),`<rect x="${X(4)}" y="${Y(11)}" width="240" height="144" fill="#c6e58d" opacity=".3" style="${loop('kpulse',.6,now,'steps(2)')}"/>`]);
  P.push([Y(17)+30,`<g style="${loop('vp-graze',7,now,'steps(14)')}">${T('f122',X(1),Y(16)+12)}</g>`],[Y(18)+40,`<g style="${loop('vp-graze',9,now,'steps(9)',3000)}">${TF('f121',X(2),Y(18))}</g>`],[Y(19)+30,`<g style="${loop('vp-graze',8,now,'steps(8)',1500)}">${T('f120',X(6),Y(19))}</g>`]);
  return P}
function plaza(D,now,L){const P=[];
  for(const[c,r]of LAMPS)L.push([X(c)+19,Y(r)-3,9,6,'#ffcf6a']);
  if(D.fest){let s='';const cols=['#e84537','#fdbe53','#009adc','#84c669',D.m.a];for(let i=0;i<12;i++){const x=X(25)+12+i*18,y=Y(11)-12+Math.round(Math.sin(i/11*Math.PI)*6)*3;s+=`<rect x="${x}" y="${y}" width="12" height="12" fill="${cols[i%5]}"/>`}P.push([Y(15),`<path d="M${X(25)+12} ${Y(11)-6}h210" stroke="#3f2631" stroke-width="3"/>`+s])}
  // before the session: a camp fire by the sleeping hero, a quest waiting on the board
  if(D.pre||D.wake){const x=X(27)+9,y=Y(12)+18;let s=pxArt(LOGS,{k:'#3f2631',D:'#bd6c4a'},x,y+18,3);
    let fl='';for(let i=0;i<2;i++)fl+=`<g style="${loop('kblink',.5,now,'step-end',i*250)}">${pxArt(FIRE[i],{y:'#fee761',o:'#feae34',e:'#e84537'},x,y,3)}</g>`;
    P.push([Y(13),s]);HUD.push(fl);L.push([x,y+3,30,18,'#ff9a4a',1]);
    if(D.pre)HUD.push(`<g style="${loop('kalert',.8,now,'steps(2)')}">${pxArt(BANG,KP,X(29)+16,Y(13)-30,4)}</g>`)}
  // a fisherman sitting on the bank keeps a line in the river
  if(W.ents.some(e=>e.skin==='fisher'&&e.node==='fish'&&e.state==='idle'))P.push([Y(11)+1,`<path d="M${X(14)+30} ${Y(10)+6}l30 -12" stroke="#763b36" stroke-width="3"/><path d="M${X(15)+12} ${Y(10)-6}v24" stroke="#ffffff" stroke-width="1.5"/><rect x="${X(15)+9}" y="${Y(10)+18}" width="6" height="6" fill="#e84537" style="${loop('kbobw',1.4,now,'steps(2)')}"/>`]);
  return P}
function waterLife(now){let s='';const r=rnd(8);const cells=[...WATER].map(k=>k.split(',').map(Number)).filter(([c,rr])=>rr>=6);
  for(let i=0;i<6;i++){const[c,rr]=cells[Math.floor(r()*cells.length)];s+=`<rect x="${X(c)+6+Math.round(r()*10)*3}" y="${Y(rr)+12+Math.round(r()*8)*3}" width="${r()<.5?9:6}" height="3" fill="#ffffff" shape-rendering="crispEdges" style="${loop('kpulse',2+r()*1.5,now,'steps(2)',i*400)}"/>`}
  return s}

VIEWS.valley={
  order:1,tag:'Pixel RPG · top-down view',name:'Session Village',
  desc:'An RPG village in 16 px tiles, built on both banks: the key signals on the right, the middle stays a calm meadow under the conversation.',
  game:'Inspired by the villages of Stardew Valley and the hubs of Zelda',
  sources:`a village laid out like a theme park that walks you past every place (<a href="https://www.pcgamesn.com/stardew-valley/stardew-valley-map-design" target="_blank" rel="noopener">PCGamesN</a>), layout tips (<a href="https://stardewmodding.wiki.gg/wiki/Tael%27s_Guide_to_good_map_making" target="_blank" rel="noopener">Stardew Modding wiki</a>). Tiles: Kenney's Tiny Town, Tiny Dungeon and Tiny Farm packs, CC0 license (<a href="https://opengameart.org/content/tiny-town" target="_blank" rel="noopener">OpenGameArt</a>). Animated characters: Ninja Adventure by Pixel-boy and AAA, CC0 license (<a href="https://pixel-boy.itch.io/ninja-adventure-asset-pack" target="_blank" rel="noopener">itch.io</a>). Water, bridge, hourglass, banners, campfire and mist drawn for this lab.`,
  night:'#3a4384',birdFrom:[1700,40],
  sprites:{hero:{opus:'d84',sonnet:'d96',haiku:'d112',fable:'d99'},v1:'d88',v2:'d100',v3:'f109',v4:'d85',smith:'d87',carpenter:'d98',scribe:'d111',courier:'d85',banker:'d86',farmer:'f108',guard:'d97',adv:'d96',slime:'d108',goblin:'d110',ogre:'d109',merchant:'d100',wagon:'t57',bard:'d88',fisher:'f109',ghost:'d121'},
  tools:{smith:'t128',carpenter:'t127',farmer:'t129'},
  // animated walk cycles (Ninja Adventure, CC0) when actors.js is loaded; the Kenney sprites above are the fallback
  actors:{hero:{opus:'hero_opus',sonnet:'hero_sonnet',haiku:'hero_haiku',fable:'hero_fable'},v1:'v1',v2:'v2',v3:'v3',v4:'v4',smith:'smith',carpenter:'carpenter',scribe:'scribe',courier:'courier',banker:'banker',farmer:'farmer',guard:'guard',adv:'adv',merchant:'merchant',bard:'bard',fisher:'fisher',ghost:'ghost',slime:'slime',goblin:'goblin',ogre:'ogre'},
  vehicle:()=>{TUSE.add('t57');return `<use href="#t57" x="-24" y="-46"/>`},
  places:{
    think:{look:'crystal = model, shards = effort, hourglass = 5-hour limit',name:'Mage tower',note:'The crystal takes the model\'s color and grows when Claude thinks, its shards spin faster with the effort. The hourglass on the front empties with the 5-hour limit.',node:'tower',work:'towerW',label:[X(30)+12,Y(6)+12],fire:[X(31)+24,Y(8)+30,.9],fx:[X(31)+24,Y(5)+30]},
    bash:{look:'lit furnace, rolling mine cart',name:'Mine',note:'The furnace glows, the mine cart rolls on the rails, the smith strikes the anvil.',node:'mine',work:'anvil',label:[X(2),Y(1)+6],fire:[X(4)+24,Y(3)+40,1]},
    edit:{look:'flying wood chips, smoking chimney',name:'Workshop',note:'The carpenter works with the axe, wood chips fly, the chimney smokes.',node:'ws',work:'wsW',label:[X(1)+24,Y(8)-12],fire:[X(1)+24,Y(7)+40,1.1]},
    read:{look:'blue windows, turning pages',name:'Library',note:'The windows light up blue, pages turn around the roof, the scribe reads by the shelves.',node:'lib',work:'libW',label:[X(6),Y(8)-12],fire:[X(6),Y(7)+40,1.1]},
    web:{look:'pigeons, mailbox flag',name:'Post office',note:'Pigeons circle above the roof, the mailbox flag goes up when you send a message.',node:'post',work:'postW',label:[X(6)+24,Y(3)-12],fire:[X(6)+24,Y(2)+40,1]},
    agents:{look:'one banner per sub-agent',name:'Guild',note:'One banner per sub-agent on the front, and a knight who sets off to hold the edge of the woods.',node:'guild',label:[X(7),Y(17)-12],fire:[X(7),Y(16)+40,1.1]},
    context:{look:'purple mist and monsters',name:'Mist',note:'The purple mist comes out of the haunted woods, bottom right, and rises with the context; the monsters follow it. Past 60%, the watchtower brazier turns purple.',node:'watch',label:[X(31)+24,Y(11)-54],fire:[X(31)+24,Y(13)+40,.8]},
    cost:{look:'coin piles, chest then mimic',name:'Bank',note:'The coin piles grow with the spending, the chest opens, then turns into a mimic past $5.',node:'bank',work:'bankW',label:[X(26)+24,Y(8)-12],fire:[X(26)+24,Y(7)+40,1],fx:[X(28)+24,Y(8)]},
    todo:{look:'one plot per task, ripe when done',name:'Farm',note:'One plot per task: a sprout to do, a ripe vegetable once done.',node:'farm',work:'farmW',work2:'farmW2',label:[X(1)+24,Y(12)-12],fire:[X(1)+24,Y(12)+40,1],fx:[X(6),Y(11)]},
    waves:{look:'one tower per wave, scaffolding = progress',name:'Castle',note:'One tower per wave on the wall: finished and flagged once merged, scaffolding that rises with the progress, a banner while the PR is open.',node:'castle',label:[X(31),Y(2)+12],fire:[X(31),Y(2)+40,1],fx:[X(31),Y(1)]},
  },
  extraLook:[['Hero','model (class) and effort (aura)','#8f62f5'],['Sky','5-hour limit: day, evening, night, rain','#ffd27a'],['Sleeping village','the session has not started','#5a6988'],['Visitors','random events','#84c669']],
  extraLegend:[['Hero','The model picks the hero (mage, knight, ranger, bard) and the color of its aura, which pulses faster with the effort.','#8f62f5'],['Light','The 5-hour limit moves the day along: morning at 0%, evening around 60%, night and rain past 90%.','#ffd27a'],['Before the session','The village sleeps: blue night, the hero asleep by the campfire, a quest waiting on the board. The first message makes the sun rise.','#5a6988']],
  nav:{nodes:N,edges:EDGES},home:'pl',camp:'camp',
  wander:RIGHT,wanderOf:e=>(e.kind==='worker'&&e.sig!=='cost')||(e.kind==='villager'&&e.id%3===0)?LEFT:RIGHT,
  houses:['barn','lib','guild'],
  spawn:['spR','spR2','spB'],front:['fr1','fr2','fr3','fr4','fr5'],patrol:['gA','gB','watch','pl','j10R'],guards:['gA','gB'],villagers:5,
  pushRoute:['post','castle'],
  // random life, one event every 40 to 100 s (never before the session starts)
  ambient:[
    {id:'merchant',name:'A merchant passes through',w:3,when:D=>D.n<.6,run(now){const l=Math.random()<.5,a=l?'roadL':'roadR',b=l?'roadR':'roadL';addEnt('visitor',a,{skin:'merchant',dest:b,speed:55});addEnt('visitor',a,{skin:'wagon',dest:b,speed:55,until:now+1100,jy:0})}},
    {id:'bard',name:'A bard plays on the square',w:2,run(now){const l=Math.random()<.5;addEnt('visitor',l?'roadL':'roadR',{skin:'bard',stop:'pl',stay:18000,act:'dance',notes:true,dest:l?'roadR':'roadL',speed:75})}},
    {id:'fisher',name:'A fisher by the water',w:2,when:D=>D.n<.7,run(now){addEnt('visitor','roadL',{skin:'fisher',stop:'fish',stay:40000,act:'idle',dest:'roadL',speed:60,jx:0,jy:0})}},
    {id:'ghost',name:'A ghost comes out of the graveyard',w:2,when:D=>D.n>.4,run(now){addEnt('visitor','spB',{skin:'ghost',stop:'fr4',stay:14000,act:'idle',dest:'spR2',speed:28})}},
    {id:'star',name:'A shooting star',w:2,when:D=>D.n>.4,run(now){fxAdd('star',now,{dur:1600,x:Math.round(200+Math.random()*900),y:Math.round(30+Math.random()*220)})}},
    {id:'flock',name:'Birds fly by',w:3,when:D=>D.n<.6,run(now){fxAdd('flock',now,{dur:15000,y:Math.round(120+Math.random()*560)})}},
    {id:'cloud',name:'The shadow of a cloud',w:2,when:D=>D.n<.8,run(now){fxAdd('cloud',now,{dur:45000,y:Math.round(Math.random()*600)})}},
    {id:'shadow',name:'A dragon flies over the village',w:1,when:D=>D.ctx>=.5,run(now){fxAdd('shadow',now,{dur:7000,y:Math.round(420+Math.random()*400)})}},
  ],
  css:`.vb{fill:#bd6c4a;stroke:#3f2631;stroke-width:2.5}.vb.va{fill:#e38628}.vl{fill:#cf8254}.vl.va{fill:#fdbe53}.vs,.vsp{stroke:#3f2631;stroke-width:3}.vsp{fill:#763b36}.vr{fill:none;stroke:#fee761;stroke-width:3}.vt{font:700 12.5px ui-monospace,Menlo,Consolas,monospace;fill:#fff4dc}
@keyframes vp-cart{0%,100%{transform:translateX(0)}50%{transform:translateX(96px)}}
@keyframes vp-spark{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--vx,0),-36px);opacity:0}}
@keyframes vp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes vp-wave{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
@keyframes vp-graze{0%,100%{transform:translateX(0)}50%{transform:translateX(-36px)}}`,
  draw(now,D){
    const L=[];HUD=[];for(const k in WIN)for(const[c,r]of WIN[k])L.push([X(c)+15,Y(r)+12,18,18,'#ffcf6a']);
    let g=waterLife(now);
    const props=[mine(D,now,L),tower(D,now,L),castle(D,now,L),workshop(D,now,L),library(D,now,L),post(D,now,L),guild(D,now,L),watch(D,now,L),bank(D,now,L),...farm(D,now,L),...plaza(D,now,L)].filter(Boolean);
    props.push([Y(7),smoke(X(26)+24,Y(6)-6,now,1,'#e8e4ee',2,500)]);
    const top='';
    return {ground:g,props,top,lights:L,hud:HUD.join(''),defs:GROUND_DEFS};
  },
  mist(D,now){
    if(D.ctx<.04)return '';
    const R=2+D.ctx*13,run={1:'',2:'',3:''};
    for(let r=0;r<21;r++){let c=0;while(c<34){const lv=c2=>{const d=Math.hypot(35-c2,(r-21)*1.25);return d<R-3?1:d<R-1.2?2:d<R?3:0},v=lv(c);if(!v){c++;continue}let k=c;while(k<34&&lv(k)===v)k++;run[v]+=`M${X(c)} ${Y(r)}h${(k-c)*48}v48h${-(k-c)*48}z`;c=k}}
    let s=`<g shape-rendering="crispEdges" style="${loop('kpulse',4,now,'steps(4)')}"><path d="${run[1]}" fill="#3a0f6a" opacity=".55"/><path d="${run[2]}" fill="#4a1a80" opacity=".3"/><path d="${run[1]}${run[2]}" fill="url(#vfog1)" opacity=".55"/><path d="${run[3]}" fill="url(#vfog2)" opacity=".8"/></g>`;
    if(D.ctx>.45){const r=rnd(4);for(let i=0;i<Math.round((D.ctx-.3)*10);i++){const c=25+Math.floor(r()*9),rr=16+Math.floor(r()*5);s+=`<path d="M${X(c)+12} ${Y(rr)+18}h6v6h-6zM${X(c)+27} ${Y(rr)+18}h6v6h-6z" fill="#fee761" shape-rendering="crispEdges" style="${loop('kpulse',2+r()*2,now,'steps(2)',i*400)}"/>`}}
    return s;
  },
  sign(x,y,{act,col,text,now,id}){
    const P=VIEWS.valley.places[id],w=Math.round(text.length*7.6+34),h=w/2;
    let s=`<g transform="translate(${f(x)},${f(y)})">`;
    if(P.post)s+=`<rect x="-4" width="8" height="120" class="vsp"/>`;
    s+=`<g class="kb" style="transform-origin:50% 0;${act?loop('ksway',2.2,now,'steps(4)'):''}">`;
    s+=`<path d="M${3-h} 0h${w-6}v3h3v21h-3v3h${6-w}v-3h-3v-21h3z" class="vb${act?' va':''}"/><rect x="${4-h}" y="3" width="${w-8}" height="3" class="vl${act?' va':''}"/>`;
    s+=`<rect x="${8-h}" y="8" width="11" height="11" fill="${col}" class="vs"/>`;
    if(act)s+=`<rect x="${3-h}" y="3" width="21" height="21" class="vr" style="${loop('kpulse',.8,now,'steps(2)')}"/>`;
    s+=`<text x="${26-h}" y="18.5" class="vt">${esc(text)}</text></g></g>`;
    return s;
  },

};
})();

export { S, W, MODELS, EFFORT, SIG, VIEWS, derive, newWorld, step, retarget, wake, compose, busy, ambient,
  evPrompt, evError, evCompact, evMerge, evCommit, evPush, sigActive, sigValue, sigCol, progress, clickShares };
