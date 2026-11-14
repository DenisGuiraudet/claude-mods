// La Vallée, pixel art: a 34 x 21 tile village (Kenney Tiny Town, Tiny Dungeon, Tiny Farm, CC0) plus
// hand-made pixel pieces in the same palette. Buildings sit on two wings, the key signals on the right; the centre (under the chat
// column) is a calm meadow with the river. Everything static is baked into one PNG (bake.js -> baked.js);
// only what moves or reads a signal is drawn per frame.
(()=>{
const X=c=>c*48,Y=r=>r*48,nd=(c,r)=>[c*48+24,r*48+40];
const hl=(c0,c1,r)=>{const a=[];for(let c=c0;c<=c1;c++)a.push([c,r]);return a},vl=(c,r0,r1)=>{const a=[];for(let r=r0;r<=r1;r++)a.push([c,r]);return a};

// ---------- map ----------
const RIVER_L={0:16,1:16,2:16,3:16,4:16,5:16,6:16,7:15,8:15,9:15,10:15,11:15,12:15,13:16,14:16,15:16,16:16,17:17,18:17,19:17,20:17};
const WATER=new Set();for(const r in RIVER_L){WATER.add(RIVER_L[r]+','+r);WATER.add((RIVER_L[r]+1)+','+r)}
const PLAZA=[25,11,29,14];// c0,r0,c1,r1
// Left wing (often under the app's sidebar): tool activity, tasks, the guild. Right wing, the last six
// columns always in view: waves (castle), model and effort (tower), context (woods, fog, monsters),
// the hero's home; cost sits just left of them.
const PATHS=[...hl(0,15,4),...hl(18,33,4),...vl(3,6,9),...hl(0,8,9),...vl(3,10,18),...hl(4,7,18),
  ...vl(29,6,10),...hl(25,33,10),...hl(26,28,9),...vl(32,11,14),...hl(27,32,15)];
const STAIRS=[3,29];
const CLIFF=c=>c<=8||c>=25;
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
const SIGNC='#3f2631';let HUD=[];

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
const LAMP=['.kkk.','kyyyk','kyyyk','.kkk.','..k..','..k..','..k..','..k..','..k..','.kkk.'];
const QUEST=['.kkkkkkkkkk.','kDDDDDDDDDDk','kDwwwDwwwwDk','kDwSwDwSSwDk','kDwwwDwwwwDk','kDwSwDwSwwDk','kDwwwDwwwwDk','kDDDDDDDDDDk','.kkkkkkkkkk.','...kD..kD...','..kkDk.kDkk.'];
const FIRE=[['....y.....','...yoy..y.','..yoey.yoy','.yoeeoyooy','.yoeeeooey','..yoeeeoy.'],['.....y....','.y..yoy...','yoy.yeoy..','yooyoeeoy.','yeooeeeoy.','.yoeeeoy..']];
const LOGS=['kDDkDDkDDk','.kDDkDDkk.'];
const BANG=['.kk.','kyyk','kyyk','kyyk','kyyk','.kk.','....','.kk.','kyyk','.kk.'];
const LAMPS=[[25,11],[29,11]];
const MAILBOX=['.kkkk.','kzzzzk','kzzzzk','.kkkk.','..kk..','..kk..','..kk..'];

// ---------- static world: drawn once, baked to a PNG ----------
function pxStairs(x,y){let s=`<rect x="${x}" y="${y}" width="48" height="48" fill="#8b9bb4"/>`;for(let i=0;i<4;i++)s+=`<rect x="${x}" y="${y+i*12}" width="48" height="9" fill="#c0cbdc"/><rect x="${x}" y="${y+i*12+9}" width="48" height="3" fill="#5a6988"/>`;return `<g shape-rendering="crispEdges">${s}<rect x="${x}" y="${y}" width="3" height="48" fill="#3f2631"/><rect x="${x+45}" y="${y}" width="3" height="48" fill="#3f2631"/></g>`}
function house(c,r,rows){let s='';rows.forEach((row,j)=>row.forEach((id,i)=>{if(id)s+=T(id,X(c+i),Y(r+j))}));return [Y(r+rows.length),s]}
const B={
  workshop:[0,6,[['t52','t53','t54'],['t64','t67','t66'],['t84','t86','t75']]],
  library:[4,6,[['t48','t49','t49','t50'],['t60','t61','t63','t62'],['t76','t88','t90','t88']]],
  post:[5,1,[['t52','t53','t54'],['t64','t67','t66'],['t72','t86','t75']]],
  barn:[0,10,[[null,'f82',null],['f93','f94','f95'],['f129','f130','f131'],['f102','f103','f104'],['f126','f127','f128']]],
  guild:[5,15,[['t52','t53','t53','t54'],['t64','t65','t67','t66'],['t72','t84','t86','t84']]],
  bank:[25,6,[['t52','t53','t54'],['t64','t67','t66'],['t76','t90','t88']]],
  tower:[30,6,[['t48','t49','t50'],['t60','t63','t62'],['t76','t77','t79'],['t76','t90','t79']]],
};
const WIN={workshop:[[0,8]],library:[[5,8],[7,8]],guild:[[6,17],[8,17]],bank:[[27,8]]};
let STATIC=null,STATIC_IDS=null,OCC=null;
function occ(){OCC=new Set();const add=(c0,r0,w,h)=>{for(let c=c0;c<c0+w;c++)for(let r=r0;r<r0+h;r++)OCC.add(c+','+r)};
  add(0,1,5,4);add(5,1,4,3);add(0,6,3,3);add(4,6,5,3);add(0,10,3,5);add(4,10,5,4);add(5,15,4,3);add(29,0,5,4);add(25,6,4,3);add(30,6,3,4);add(31,11,1,3);
  add(PLAZA[0],PLAZA[1],PLAZA[2]-PLAZA[0]+1,PLAZA[3]-PLAZA[1]+1);
  for(let c=0;c<34;c++)if(CLIFF(c))OCC.add(c+',5');for(const k of WATER)OCC.add(k);for(const[c,r]of PATHS)OCC.add(c+','+r)}
function staticWorld(){
  if(STATIC)return STATIC;occ();const r=rnd(3);
  let g=`<rect width="1632" height="1008" fill="url(#vgrass)"/>`;
  // flowers: denser on the wings, sparse in the calm centre
  for(let c=0;c<34;c++)for(let rr=0;rr<21;rr++){if(OCC.has(c+','+rr))continue;const v=r(),k=c>=9&&c<=24?.35:1;if(v<.14*k)g+=T('t1',X(c),Y(rr));else if(v<.19*k)g+=T('t2',X(c),Y(rr))}
  const[c0,r0,c1,r1]=PLAZA;for(let c=c0;c<=c1;c++)for(let rr=r0;rr<=r1;rr++){const top=rr===r0,bot=rr===r1,lef=c===c0,rig=c===c1;
    g+=T('t'+(top?(lef?12:rig?14:13):bot?(lef?36:rig?38:37):(lef?24:rig?26:25)),X(c),Y(rr))}
  for(const[c,rr]of PATHS)if(!WATER.has(c+','+rr))g+=T('t43',X(c),Y(rr));
  for(let c=0;c<34;c++){if(!CLIFF(c))continue;g+=STAIRS.includes(c)?pxStairs(X(c),Y(5)):T('t126',X(c),Y(5))}
  // river bed, light lip on the top-left edges, dark rim
  let wd='',rim='',lip='';
  for(const k of WATER){const[c,rr]=k.split(',').map(Number);const x=X(c),y=Y(rr);wd+=`M${x} ${y}h48v48h-48z`;
    if(rr>0&&!WATER.has(c+','+(rr-1))){rim+=`M${x} ${y}h48v3h-48z`;lip+=`M${x} ${y+3}h48v6h-48z`}
    if(rr<20&&!WATER.has(c+','+(rr+1)))rim+=`M${x} ${y+45}h48v3h-48z`;
    if(!WATER.has((c-1)+','+rr)){rim+=`M${x} ${y}h3v48h-3z`;lip+=`M${x+3} ${y}h6v48h-6z`}
    if(!WATER.has((c+1)+','+rr))rim+=`M${x+45} ${y}h3v48h-3z`}
  g+=`<path d="${wd}" fill="#2f8fd6" shape-rendering="crispEdges"/><path d="${lip}" fill="#76e4ff" opacity=".8" shape-rendering="crispEdges"/><path d="${rim}" fill="#3f2631" shape-rendering="crispEdges"/>`;
  // north bridge
  {const x=X(16)-6,w=108,y=Y(4)+3;g+=`<g shape-rendering="crispEdges"><rect x="${x}" y="${y}" width="${w}" height="42" fill="#cf8254"/>`;for(let xx=x+12;xx<x+w;xx+=12)g+=`<rect x="${xx}" y="${y}" width="3" height="42" fill="#bd6c4a"/>`;
    g+=`<rect x="${x}" y="${y-3}" width="${w}" height="6" fill="#763b36"/><rect x="${x}" y="${y+39}" width="${w}" height="6" fill="#763b36"/><rect x="${x}" y="${y-3}" width="${w}" height="48" fill="none" stroke="#3f2631" stroke-width="3"/></g>`}
  // props, painted back to front
  const P=[],add=(y,s)=>P.push([y,s]),tr=(id,c,rr)=>add(Y(rr+1),T(id,X(c),Y(rr)));
  for(const k in B)P.push(house(...B[k]));
  // mine: rock facade, rails, furnace, anvil
  {let s='';[['d40','d40','d40','d40'],['d41','d46','d28','d40']].forEach((row,j)=>row.forEach((id,i)=>s+=T(id,X(i),Y(2+j))));
    s+=pxArt(['....kkk....','...kSSSk...','..kSSzSSk..'],KP,X(0)+15,Y(2)-9,3)+pxArt(['.kkk.','kSzSk'],KP,X(3)+6,Y(2)-6,3);add(Y(4),s);
    let rl='';for(let c=0;c<4;c++)rl+=T(c%2?'d80':'d79',X(c),Y(4)-6);add(Y(4)+1,rl);tr('d55',4,3);add(Y(4)+36,T('d74',X(4),Y(4)-6))}
  // tower panel behind the hourglass
  add(Y(10)+1,`<rect x="${X(31)+3}" y="${Y(8)+3}" width="42" height="42" fill="#c0cbdc" shape-rendering="crispEdges"/>`);
  // castle walls and gate
  {let s='';for(let c=29;c<=33;c++){s+=T(c===29?'t99':c===33?'t101':'t100',X(c),Y(1));s+=T(c===31?'t111':c===32?'t112':(c%2?'t125':'t126'),X(c),Y(2));s+=T(c===31?'t123':c===32?'t124':'t126',X(c),Y(3))}add(Y(4),s)}
  // watchtower over the woods
  add(Y(14),T('t102',X(31),Y(11))+T('t125',X(31),Y(12))+T('t126',X(31),Y(13)));
  // plaza: fountain, well, lamps, quest board; mailbox by the post
  add(Y(13),T('d20',X(26),Y(11))+T('d32',X(26),Y(12)));tr('t104',25,13);
  for(const[c,rr]of LAMPS)add(Y(rr)+24,pxArt(LAMP,KP,X(c)+16,Y(rr)-6,3));
  add(Y(14),pxArt(QUEST,KP,X(29)+6,Y(13)+15,3));
  add(Y(4)-15,pxArt(MAILBOX,KP,X(8)+12,Y(3)+12,3));
  [[8,8,'d63'],[4,10,'t106'],[0,16,'f96'],[4,16,'f97']].forEach(([c,rr,id])=>tr(id,c,rr));
  for(let i=0;i<10;i++)tr('f51',4+i%5,i<5?11:13);
  // trees: framing, a few in the meadow, the haunted woods bottom right
  [[4,0,'t16'],[0,19,'t28'],[2,20,'t16'],[5,20,'t28'],[8,20,'t16'],[8,19,'t5'],[4,19,'t5'],
   [9,0,'t28'],[11,1,'t16'],[13,1,'t15'],[20,1,'t16'],[22,0,'t28'],[24,1,'t27'],[12,2,'t5'],[23,2,'t5'],[25,0,'t16'],[27,0,'t28'],[26,2,'t16'],[28,2,'t5'],
   [10,8,'t16'],[23,10,'t28'],[12,12,'t5'],[10,16,'t5'],[23,14,'t16'],[11,19,'t28'],[22,20,'t16'],[20,15,'t5'],[33,7,'t16'],[33,12,'t28'],[24,7,'t5']].forEach(([c,rr,id])=>tr(id,c,rr));
  [[25,16],[33,16],[25,18],[26,20],[29,20],[32,20],[24,19],[30,16],[33,20],[24,17]].forEach(([c,rr],i)=>tr(['t16','f2','t28','f14'][i%4],c,rr));
  [[28,18,'d64'],[31,18,'d65'],[26,19,'d64']].forEach(([c,rr,id])=>tr(id,c,rr));
  P.sort((a,b)=>a[0]-b[0]);
  STATIC=g+P.map(p=>p[1]).join('');
  STATIC_IDS=new Set(['t0',...[...STATIC.matchAll(/href="#([tdf]\d+)"/g)].map(m=>m[1])]);
  return STATIC;
}
const STATIC_DEFS=`<pattern id="vgrass" width="48" height="48" patternUnits="userSpaceOnUse"><use href="#t0"/></pattern>`;

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
function farm(D,now,L){const act=sigActive('todo',now),P=[];
  for(let i=0;i<10;i++){if(i>=S.todoTotal)continue;const c=4+i%5,r=i<5?11:13,cp=CROPS[i%6];P.push([Y(r)+40,T('f'+(i<S.todoDone?cp[1]:cp[0]),X(c),Y(r)-6)])}
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
  order:1,tag:'RPG pixel · vue de dessus',name:'La Vallée',
  desc:'Un village de jeu de rôle en tuiles 16 px, bâti sur les deux rives : les signaux clés à droite, le centre reste un pré calme sous la conversation.',
  game:'Inspiré des villages de Stardew Valley et des hubs de Zelda',
  sources:`village pensé comme un parc d'attractions qui fait passer devant chaque lieu (<a href="https://www.pcgamesn.com/stardew-valley/stardew-valley-map-design" target="_blank" rel="noopener">PCGamesN</a>), conseils de mise en page (<a href="https://stardewmodding.wiki.gg/wiki/Tael%27s_Guide_to_good_map_making" target="_blank" rel="noopener">wiki Stardew Modding</a>). Tuiles : packs Tiny Town, Tiny Dungeon et Tiny Farm de Kenney, licence CC0 (<a href="https://opengameart.org/content/tiny-town" target="_blank" rel="noopener">OpenGameArt</a>). Personnages animés : Ninja Adventure de Pixel-boy et AAA, licence CC0 (<a href="https://pixel-boy.itch.io/ninja-adventure-asset-pack" target="_blank" rel="noopener">itch.io</a>). Eau, pont, sablier, bannières, feu de camp et brume dessinés pour ce labo.`,
  night:'#3a4384',birdFrom:[1700,40],
  sprites:{hero:{opus:'d84',sonnet:'d96',haiku:'d112',fable:'d99'},v1:'d88',v2:'d100',v3:'f109',v4:'d85',smith:'d87',carpenter:'d98',scribe:'d111',courier:'d85',banker:'d86',farmer:'f108',guard:'d97',adv:'d96',slime:'d108',goblin:'d110',ogre:'d109',merchant:'d100',wagon:'t57',bard:'d88',fisher:'f109',ghost:'d121'},
  tools:{smith:'t128',carpenter:'t127',farmer:'t129'},
  // animated walk cycles (Ninja Adventure, CC0) when actors.js is loaded; the Kenney sprites above are the fallback
  actors:{hero:{opus:'hero_opus',sonnet:'hero_sonnet',haiku:'hero_haiku',fable:'hero_fable'},v1:'v1',v2:'v2',v3:'v3',v4:'v4',smith:'smith',carpenter:'carpenter',scribe:'scribe',courier:'courier',banker:'banker',farmer:'farmer',guard:'guard',adv:'adv',merchant:'merchant',bard:'bard',fisher:'fisher',ghost:'ghost',slime:'slime',goblin:'goblin',ogre:'ogre'},
  vehicle:()=>{TUSE.add('t57');return `<use href="#t57" x="-24" y="-46"/>`},
  places:{
    think:{look:'cristal = modèle, éclats = effort, sablier = limite 5 h',name:'Tour du mage',note:'Le cristal prend la couleur du modèle et grossit quand Claude réfléchit, ses éclats tournent plus vite avec l\'effort. Le sablier de la façade se vide avec la limite 5 h.',node:'tower',work:'towerW',label:[X(30)+12,Y(6)+12],fire:[X(31)+24,Y(8)+30,.9],fx:[X(31)+24,Y(5)+30]},
    bash:{look:'four allumé, wagonnet qui roule',name:'Mine',note:'Le four rougeoie, le wagonnet roule sur les rails, le forgeron frappe l\'enclume.',node:'mine',work:'anvil',label:[X(2),Y(1)+6],fire:[X(4)+24,Y(3)+40,1]},
    edit:{look:'copeaux qui volent, cheminée qui fume',name:'Atelier',note:'Le charpentier travaille à la hache, les copeaux volent, la cheminée fume.',node:'ws',work:'wsW',label:[X(1)+24,Y(8)-12],fire:[X(1)+24,Y(7)+40,1.1]},
    read:{look:'vitres bleues, pages qui tournent',name:'Bibliothèque',note:'Les vitres s\'éclairent en bleu, des pages tournent autour du toit, le scribe lit près des étagères.',node:'lib',work:'libW',label:[X(6),Y(8)-12],fire:[X(6),Y(7)+40,1.1]},
    web:{look:'pigeons, drapeau de la boîte aux lettres',name:'Poste',note:'Les pigeons tournent au-dessus du toit, le drapeau de la boîte aux lettres se lève quand tu envoies un message.',node:'post',work:'postW',label:[X(6)+24,Y(0)+6],fire:[X(6)+24,Y(2)+40,1]},
    agents:{look:'une bannière par sous-agent',name:'Guilde',note:'Une bannière par sous-agent sur la façade, et un chevalier qui part tenir la lisière du bois.',node:'guild',label:[X(7),Y(17)-12],fire:[X(7),Y(16)+40,1.1]},
    context:{look:'brume violette et monstres',name:'Brume',note:'La brume violette sort du bois hanté, en bas à droite, et monte avec le contexte ; les monstres la suivent. Au-delà de 60 %, le brasier de la tour de guet vire au violet.',node:'watch',label:[X(31)+24,Y(11)-54],fire:[X(31)+24,Y(13)+40,.8]},
    cost:{look:'piles de pièces, coffre puis mimique',name:'Banque',note:'Les piles de pièces grandissent avec la dépense, le coffre s\'ouvre, puis devient un mimique au-delà de 5 $.',node:'bank',work:'bankW',label:[X(26)+24,Y(8)-12],fire:[X(26)+24,Y(7)+40,1],fx:[X(28)+24,Y(8)]},
    todo:{look:'une parcelle par tâche, mûre si faite',name:'Ferme',note:'Une parcelle par tâche : pousse à faire, légume mûr une fois faite.',node:'farm',work:'farmW',work2:'farmW2',label:[X(1)+24,Y(12)-12],fire:[X(1)+24,Y(12)+40,1],fx:[X(6),Y(11)]},
    waves:{look:'une tour par wave, chantier = avancement',name:'Château',note:'Une tour par wave sur la muraille : finie et pavoisée si mergée, chantier qui monte avec l\'avancement, bannière quand la PR est ouverte.',node:'castle',label:[X(31),Y(2)+12],fire:[X(31),Y(2)+40,1],fx:[X(31),Y(1)]},
  },
  extraLook:[['Héros','modèle (classe) et effort (aura)','#8f62f5'],['Ciel','limite 5 h : jour, soir, nuit, pluie','#ffd27a'],['Village endormi','la session n\'a pas commencé','#5a6988'],['Visiteurs','événements au hasard','#84c669']],
  extraLegend:[['Héros','Le modèle choisit le héros (mage, chevalier, rôdeur, barde) et la couleur de son aura, qui bat plus vite avec l\'effort.','#8f62f5'],['Lumière','La limite 5 h fait passer le jour : matin à 0 %, soir vers 60 %, nuit et pluie au-delà de 90 %.','#ffd27a'],['Avant la session','Le village dort : nuit bleue, héros endormi près du feu de camp, quête qui attend sur le panneau. Le premier message fait lever le soleil.','#5a6988']],
  nav:{nodes:N,edges:EDGES},home:'pl',camp:'camp',
  wander:RIGHT,wanderOf:e=>(e.kind==='worker'&&e.sig!=='cost')||(e.kind==='villager'&&e.id%3===0)?LEFT:RIGHT,
  houses:['barn','lib','guild'],
  spawn:['spR','spR2','spB'],front:['fr1','fr2','fr3','fr4','fr5'],patrol:['gA','gB','watch','pl','j10R'],guards:['gA','gB'],villagers:5,
  pushRoute:['post','castle'],
  // random life, one event every 40 to 100 s (never before the session starts)
  ambient:[
    {id:'merchant',name:'Un marchand traverse',w:3,when:D=>D.n<.6,run(now){const l=Math.random()<.5,a=l?'roadL':'roadR',b=l?'roadR':'roadL';addEnt('visitor',a,{skin:'merchant',dest:b,speed:55});addEnt('visitor',a,{skin:'wagon',dest:b,speed:55,until:now+1100,jy:0})}},
    {id:'bard',name:'Un barde joue sur la place',w:2,run(now){const l=Math.random()<.5;addEnt('visitor',l?'roadL':'roadR',{skin:'bard',stop:'pl',stay:18000,act:'dance',notes:true,dest:l?'roadR':'roadL',speed:75})}},
    {id:'fisher',name:'Un pêcheur au bord de l\'eau',w:2,when:D=>D.n<.7,run(now){addEnt('visitor','roadL',{skin:'fisher',stop:'fish',stay:40000,act:'idle',dest:'roadL',speed:60,jx:0,jy:0})}},
    {id:'ghost',name:'Un fantôme sort du cimetière',w:2,when:D=>D.n>.4,run(now){addEnt('visitor','spB',{skin:'ghost',stop:'fr4',stay:14000,act:'idle',dest:'spR2',speed:28})}},
    {id:'star',name:'Une étoile filante',w:2,when:D=>D.n>.4,run(now){fxAdd('star',now,{dur:1600,x:Math.round(200+Math.random()*900),y:Math.round(30+Math.random()*220)})}},
    {id:'flock',name:'Des oiseaux passent',w:3,when:D=>D.n<.6,run(now){fxAdd('flock',now,{dur:15000,y:Math.round(120+Math.random()*560)})}},
    {id:'cloud',name:'L\'ombre d\'un nuage',w:2,when:D=>D.n<.8,run(now){fxAdd('cloud',now,{dur:45000,y:Math.round(Math.random()*600)})}},
    {id:'shadow',name:'Un dragon survole la vallée',w:1,when:D=>D.ctx>=.5,run(now){fxAdd('shadow',now,{dur:7000,y:Math.round(420+Math.random()*400)})}},
  ],
  css:`.vb{fill:#bd6c4a;stroke:#3f2631;stroke-width:2.5}.vb.va{fill:#e38628}.vl{fill:#cf8254}.vl.va{fill:#fdbe53}.vs,.vsp{stroke:#3f2631;stroke-width:3}.vsp{fill:#763b36}.vr{fill:none;stroke:#fee761;stroke-width:3}.vt{font:700 12.5px ui-monospace,Menlo,Consolas,monospace;fill:#fff4dc}
@keyframes vp-cart{0%,100%{transform:translateX(0)}50%{transform:translateX(96px)}}
@keyframes vp-spark{0%{transform:translate(0,0);opacity:1}100%{transform:translate(var(--vx,0),-36px);opacity:0}}
@keyframes vp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes vp-wave{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
@keyframes vp-graze{0%,100%{transform:translateX(0)}50%{transform:translateX(-36px)}}`,
  bake(){return {svg:staticWorld(),defs:STATIC_DEFS}},
  draw(now,D){
    const L=[];HUD=[];for(const k in WIN)for(const[c,r]of WIN[k])L.push([X(c)+15,Y(r)+12,18,18,'#ffcf6a']);
    const baked=typeof BAKED!=='undefined';
    let g=baked?`<image href="${BAKED}" width="1632" height="1008" style="image-rendering:pixelated"/>`:staticWorld();
    if(!baked)for(const id of STATIC_IDS)TUSE.add(id);
    g+=waterLife(now);
    const props=[mine(D,now,L),tower(D,now,L),castle(D,now,L),workshop(D,now,L),library(D,now,L),post(D,now,L),guild(D,now,L),watch(D,now,L),bank(D,now,L),...farm(D,now,L),...plaza(D,now,L)].filter(Boolean);
    props.push([Y(7),smoke(X(26)+24,Y(6)-6,now,1,'#e8e4ee',2,500)]);
    const top='';
    return {ground:g,props,top,lights:L,hud:HUD.join(''),defs:baked?'':STATIC_DEFS+`<pattern id="vfog1" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 0h3v3h-3zM3 3h3v3h-3z" fill="#7a2fb0"/></pattern><pattern id="vfog2" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0h3v3h-3zM6 6h3v3h-3z" fill="#9b4ca3"/></pattern>`};
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
