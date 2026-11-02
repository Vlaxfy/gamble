'use strict';
// TRAVERSER - online 3D obby. Zero-dependency Node 18+ server (HTTP + Server-Sent Events).
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||3000,KEY=process.env.ADMIN_KEY||'',FILE=process.env.DATA_FILE||path.join(__dirname,'data.json');
const UR=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,''),UT=process.env.UPSTASH_REDIS_REST_TOKEN||'',DBKEY='traverser:db';
const PC=['#e11d48','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#a3e635','#f472b6','#94a3b8'];
let DB={users:{}};let canSave=!UR,dirty=false,saving=false,lastUp=0;
const save=()=>{dirty=true};
async function ucmd(a){const r=await fetch(UR,{method:'POST',headers:{authorization:'Bearer '+UT,'content-type':'application/json'},body:JSON.stringify(a)}),j=await r.json();if(j.error)throw new Error(j.error);return j.result}
async function flush(force){if(!dirty&&!force)return;dirty=false;const s=JSON.stringify(DB);try{fs.writeFileSync(FILE+'.tmp',s);fs.renameSync(FILE+'.tmp',FILE)}catch(e){}
if(UR&&canSave&&!saving&&(force||Date.now()-lastUp>12000)){saving=true;try{await ucmd(['SET',DBKEY,s]);lastUp=Date.now()}catch(e){console.error('cloud save failed',e.message);dirty=true}saving=false}else if(UR&&!force)dirty=true}
setInterval(()=>flush(),3000);
for(const sg of['SIGTERM','SIGINT'])process.on(sg,async()=>{await flush(true);process.exit(0)});
const byTok=new Map(),cl=new Map();
async function loadAll(){let v=null;if(UR){let ok=false;for(let i=0;i<6&&!ok;i++){try{const r=await ucmd(['GET',DBKEY]);v=r?JSON.parse(r):null;ok=true}catch(e){console.error('cloud load failed',e.message);await new Promise(r=>setTimeout(r,2000))}}if(!ok){console.error('Cannot reach cloud storage; exiting so saved data is never overwritten');process.exit(1)}canSave=true}
if(!v){try{v=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}}if(v)Object.assign(DB,v);DB.users=DB.users||{};Object.values(DB.users).forEach(u=>byTok.set(u.tok,u));console.log('loaded',Object.keys(DB.users).length,'players'+(UR?' (cloud storage on)':''))}
const rid=n=>crypto.randomBytes(n).toString('hex'),nk=s=>String(s).toLowerCase().replace(/\s+/g,'');
function freeName(){for(let i=0;i<60;i++){const n='Traveller'+(100+crypto.randomInt(9900));if(!Object.values(DB.users).some(o=>nk(o.name)===nk(n)))return n}return'Traveller'+rid(3)}
function mkUser(){const id=rid(6),u={id,tok:rid(16),name:freeName(),color:PC[crypto.randomInt(PC.length)],coins:0,tv:{fin:0,win:0,best:{}},ts:Date.now()};DB.users[id]=u;byTok.set(u.tok,u);save();return u}
const send=(r,ev,d)=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`),to=(u,ev,d)=>{const s=cl.get(u.id);if(s)for(const r of s)send(r,ev,d)};
const me=u=>({id:u.id,name:u.name,color:u.color,coins:u.coins||0,tv:u.tv||{fin:0,win:0,best:{}},adm:!!u.adm}),push=u=>to(u,'me',me(u)),nmu=id=>(DB.users[id]||{}).name||'Player';
const BADW=['fuck','fuk','fck','shit','bitch','cunt','asshole','arsehole','dick','dickhead','pussy','bastard','slut','whore','nigger','nigga','faggot','fag','retard','twat','wanker','motherfucker','cock','prick','bollocks'].map(w=>w.replace(/(.)\1+/g,'$1')),BADRE=new RegExp('\\b(?:'+BADW.join('|')+')(?:s|ed|er|ers|ing|in|y|head|z)?\\b');
const strong=t=>{const x=String(t).toLowerCase().replace(/[@4]/g,'a').replace(/[$5]/g,'s').replace(/0/g,'o').replace(/[1!|]/g,'i').replace(/3/g,'e').replace(/7/g,'t').replace(/[^a-z]/g,'');return['fuck','bitch','cunt','nigger','nigga','faggot','whore','pussy','asshole','motherfucker','shit','dickhead'].some(w=>x.includes(w))};
const bad=t=>BADRE.test(String(t).toLowerCase().replace(/[@4]/g,'a').replace(/[$5]/g,'s').replace(/0/g,'o').replace(/[1!|]/g,'i').replace(/3/g,'e').replace(/7/g,'t').replace(/[^a-z\s]/g,'').replace(/(.)\1+/g,'$1'));

function muteUser(u,ms){u.mute=Date.now()+ms;save()}
const G={};
G.me=u=>({me:me(u)});
G.profile=(u,b)=>{if(b.name!==undefined){const n=String(b.name||'').replace(/[\u0000-\u001f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,16);if(n.length<3)throw'Name must be at least 3 characters';if(bad(n)||strong(n))throw'Please pick a clean name';if(Object.values(DB.users).some(o=>o.id!==u.id&&nk(o.name)===nk(n)))throw'That name is taken';u.name=n}
if(b.color!==undefined){if(!PC.includes(b.color))throw'Pick one of the colours';u.color=b.color}save();return{me:me(u)}};
G.info=u=>({st:TV.st,n:TV.P.size,map:TV.st==='idle'?null:TVMAPS[TV.map].name,maps:TVMAPS.length,me:me(u),pc:PC});
G.admin=(u,b)=>{const k=String(b.key||'');if(!KEY||k.length!==KEY.length||!crypto.timingSafeEqual(Buffer.from(k),Buffer.from(KEY)))throw'Wrong admin key';const t=b.to?Object.values(DB.users).find(o=>nk(o.name)===nk(b.to)):null;
switch(b.op){case'login':u.adm=true;save();push(u);return{nm:'Admin mode on'}
case'ann':{const x=String(b.text||'').slice(0,160);if(!x)throw'Type a message';tvSys('📢 '+x);return{nm:'Announced'}}
case'kick':{if(!t)throw'No player with that name';TV.P.delete(t.id);to(t,'tvkick',{});tvSys(t.name+' was kicked');tvState();return{nm:t.name+' kicked'}}
case'mute':{if(!t)throw'No player with that name';const m=Math.max(1,Math.min(10080,+b.min||10));muteUser(t,m*60000);return{nm:t.name+' muted for '+m+' min'}}
case'unmute':{if(!t)throw'No player with that name';t.mute=0;save();return{nm:t.name+' unmuted'}}
case'give':{if(!t)throw'No player with that name';const n=Math.round(+b.n||0);if(!Number.isFinite(n)||Math.abs(n)>1e9)throw'Bad amount';t.coins=Math.max(0,(t.coins||0)+n);save();push(t);return{nm:t.name+' now has '+t.coins+' coins'}}
case'skip':{if(TV.st==='race')tvEndRound();else if(TV.st==='lobby')TV.t1=Date.now();return{nm:'Skipped'}}
default:throw'Unknown command'}};
// ---- ROUNDS: lobby island -> countdown -> race -> results
const TVSEG={gap:18,beam:16,zig:18,mover:20,lift:16,spin:16,tiles:16,stairs:16,pend:18,conv:16,bounce:20,pillars:18,walls:18};
const TVPOOL=[['gap','zig','stairs','mover','conv','bounce','beam'],['spin','lift','pillars'],['pend','tiles','walls']];
const TVNAMES=['Sunny Steps','Jelly Jump','Coral Crossing','Breezy Bridges','Pebble Path','Tidal Twist','Spin City','Lagoon Leap','Bouncy Bay','Seagull Sprint','Driftwood Dash','Hammer Harbour','Whirlpool Way','Cliffhanger Cove','Thunder Tiles','Typhoon Tower','Kraken Kingdom','Lighthouse Lunge','Storm Surge','Abyss Run','Volcano Vault','Tsunami Trial','Maelstrom Mile','The Gauntlet'];
const TVREW=[0,10,20,35,55,80],TVPM=[3,2,1.5];
const tvRng=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const TVMAPS=TVNAMES.map((name,i)=>{const d=1+Math.floor(i/5),seed=1000+i*7919,r=tvRng(seed),pool=TVPOOL.slice(0,Math.min(3,d)).flat(),n=4+d+(r()<.5?1:0),segs=[];let cur=6,prev='';for(let k=0;k<n;k++){let t;do t=pool[Math.floor(r()*pool.length)];while(t===prev&&pool.length>1);prev=t;segs.push({k:t,z:cur,L:TVSEG[t],sd:seed*31+k});cur+=TVSEG[t]}return{id:i,name,d,th:i%8,segs,fin:cur,minT:cur/11}});
const TV={st:'idle',map:0,t0:0,t1:0,rn:0,last:-1,P:new Map(),fin:[],chat:[],res:null,racers:0};
const tvPub=()=>({st:TV.st,map:TV.st==='idle'?null:TVMAPS[TV.map],t0:TV.t0,t1:TV.t1,rn:TV.rn,fin:TV.fin.map(f=>({id:f.id,ms:f.ms,rw:f.rw})),res:TV.res,now:Date.now(),pl:[...TV.P.values()].map(p=>{const u=DB.users[p.id]||{};return{id:p.id,m:p.mode,n:u.name||'Player',c:u.color||'#38bdf8'}})});
const tvTo=(ev,d)=>{for(const p of TV.P.values()){const u=DB.users[p.id];if(u)to(u,ev,d)}};
const tvState=()=>tvTo('tvs',tvPub());
function tvPhase(st,ms){TV.st=st;TV.t0=Date.now();TV.t1=ms?TV.t0+ms:0;tvState()}
function tvStartRound(){let m;do m=crypto.randomInt(TVMAPS.length);while(m===TV.last&&TVMAPS.length>1);TV.map=m;TV.last=m;TV.rn++;TV.fin=[];TV.res=null;let n=0;for(const p of TV.P.values()){p.mode='play';p.fin=null;p.ok=true;p.sv=0;p.lx=null;n++}TV.racers=n;tvPhase('count',4000)}
function tvEndRound(){const M=TVMAPS[TV.map];TV.res={map:M.name,list:TV.fin.map((f,i)=>({id:f.id,ms:f.ms,rw:f.rw,pl:i+1}))};tvPhase('end',6000);tvSys(TV.fin.length?'🏁 Round over! '+TV.fin.length+' finished. Winner: '+nmu(TV.fin[0].id):'🏁 Round over! Nobody made it this time.')}
function tvSys(x){const m={u:'',x,ts:Date.now(),sys:1};TV.chat.push(m);if(TV.chat.length>40)TV.chat.shift();tvTo('tvc',m)}
function tvTick(){const n=Date.now();for(const p of [...TV.P.values()])if(n-p.seen>8000){TV.P.delete(p.id);tvSys((nmu(p.id)||'Someone')+' left')}
if(!TV.P.size){if(TV.st!=='idle'){TV.st='idle';TV.fin=[];TV.res=null}return}
const act=[...TV.P.values()].filter(p=>p.mode==='play'&&!p.fin);
if(TV.st==='idle')tvStartRound();
else if(TV.st==='lobby'&&n>=TV.t1)tvStartRound();
else if(TV.st==='count'&&n>=TV.t1)tvPhase('race',Math.round((40+TVMAPS[TV.map].segs.length*12)*1000));
else if(TV.st==='race'&&(n>=TV.t1||!act.length))tvEndRound();
else if(TV.st==='end'&&n>=TV.t1){for(const p of TV.P.values()){p.mode='play';p.fin=null}tvPhase('lobby',12000)}
const pl=[];for(const p of TV.P.values())if(p.x!=null&&p.mode!=='spec')pl.push([p.id,r1(p.x),r1(p.y),r1(p.z),Math.round((p.ry||0)*100)/100,p.s|0,p.fin?1:0]);tvTo('tvp',{t:n,p:pl})}
const r1=x=>Math.round(x*100)/100;
setInterval(tvTick,100);
function tvMe(u){const p=TV.P.get(u.id);if(!p)throw'Join Traverser first';p.seen=Date.now();return p}
Object.assign(G,{
'tv/join'(u){let p=TV.P.get(u.id);const n=Date.now(),hist=TV.chat.slice(-30);if(!p){const act=[...TV.P.values()].filter(q=>q.mode==='play'&&!q.fin).length;p={id:u.id,mode:'play',x:null,seen:n,fin:null,ok:true,pt:0,kt:0};
if((TV.st==='race'||TV.st==='end')&&act>0)p.mode='spec';
TV.P.set(u.id,p);if(TV.st==='race'&&act===0){TV.P.set(u.id,p);tvStartRound()}else{if(TV.st==='count')TV.racers++;tvSys(u.name+' joined')}tvState()}
p.seen=n;u.tv=u.tv||{fin:0,win:0,best:{}};return{s:tvPub(),chat:hist,me:p.mode,stats:u.tv}},
'tv/info'(u){const p=TV.P.get(u.id);return{st:TV.st,n:TV.P.size,map:TV.st==='idle'?null:TVMAPS[TV.map].name,maps:TVMAPS.length,stats:u.tv||{fin:0,win:0,best:{}},names:TVMAPS.map(m=>[m.name,m.d])}},
'tv/leave'(u){if(TV.P.delete(u.id))tvSys(u.name+' left');return{ok:1}},
'tv/pos'(u,b){const p=tvMe(u);if(p.mode==='spec')return{ok:1};const x=+b.x,y=+b.y,z=+b.z,n=Date.now();if(![x,y,z].every(Number.isFinite))throw'Bad position';
if(TV.st==='race'&&p.lx!=null&&!p.fin){const dt=Math.max(.05,(n-p.lt)/1000),h=Math.hypot(x-p.lx,z-p.lz)/dt,lim=n-p.kt<2500?60:32,resp=(b.s&4)&&Math.abs(z)<8&&Math.abs(x)<8;if(h>lim&&!resp){p.sv=(p.sv||0)+(h>lim*2.5?3:1);if(p.sv>=3)p.ok=false;if(process.env.TVDBG)console.log('tv speed flag',u.name,h.toFixed(1),lim,dt,x,z,p.lx,p.lz)}}
p.x=Math.max(-500,Math.min(500,x));p.y=Math.max(-50,Math.min(200,y));p.z=Math.max(-500,Math.min(800,z));p.ry=+b.ry||0;p.s=b.s|0;p.lx=x;p.lz=z;p.lt=n;return{ok:1}},
'tv/push'(u,b){const p=tvMe(u),t=TV.P.get(b.to),n=Date.now();if(!t||t.id===u.id||p.mode==='spec'||t.mode==='spec'||p.x==null||t.x==null)throw'Nobody to push';if(TV.st==='count')throw'Wait for GO';if(n-p.pt<800)throw'Too fast';
const dx=t.x-p.x,dz=t.z-p.z,d=Math.hypot(dx,dz);if(d>3.2||Math.abs(t.y-p.y)>2.5)throw'Too far away';p.pt=n;t.kt=n;const nx=d>.01?dx/d:Math.sin(p.ry||0),nz=d>.01?dz/d:Math.cos(p.ry||0);const tu=DB.users[t.id];if(tu)to(tu,'tvk',{from:u.id,dx:nx,dz:nz});return{ok:1}},
'tv/fin'(u){const p=tvMe(u),M=TVMAPS[TV.map],n=Date.now();if(TV.st!=='race'||p.mode!=='play')throw'Not racing';if(p.fin)return{place:TV.fin.findIndex(f=>f.id===u.id)+1};if(p.z==null||p.z<M.fin-3)throw'Reach the finish first';const ms=n-TV.t0;if(ms<M.minT*1000)p.ok=false;
const place=TV.fin.length+1;let rw=0;if(p.ok){rw=Math.round(TVREW[M.d]*(TVPM[place-1]||1));u.coins=(u.coins||0)+rw;u.tv=u.tv||{fin:0,win:0,best:{}};u.tv.fin++;if(place===1&&TV.racers>1)u.tv.win++;const b0=u.tv.best[M.id];if(!b0||ms<b0)u.tv.best[M.id]=ms;save();push(u)}
p.fin=ms;TV.fin.push({id:u.id,ms,rw});tvSys('🏁 '+u.name+' finished #'+place+' in '+(ms/1000).toFixed(1)+'s');tvState();return{place,ms,rw,stats:u.tv,coins:u.coins}},
'tv/chat'(u,b){tvMe(u);const x=String(b.text||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,160),n=Date.now();if(!x)throw'Empty';if(u.mute>n)throw'You are timed out for '+Math.ceil((u.mute-n)/60000)+' more min';if(n-(u.tvct||0)<700)throw'Slow down';if(bad(x)){muteUser(u,600000,'Language (auto filter)','Auto filter',x);throw'Watch your language! You are timed out for 10 minutes.'}u.tvct=n;const m={u:u.id,x,ts:n};TV.chat.push(m);if(TV.chat.length>40)TV.chat.shift();tvTo('tvc',m);return{ok:1}}
});

// ---- http
const INDEX=path.join(__dirname,'public','index.html');
const srvr=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');
if(req.method=='GET'&&url.pathname=='/api/stream'){const u=byTok.get(url.searchParams.get('t'));if(!u){res.writeHead(401);return res.end()}
res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});let s=cl.get(u.id);if(!s)cl.set(u.id,s=new Set());s.add(res);send(res,'me',me(u));
const hb=setInterval(()=>res.write(': ping\n\n'),20000);req.on('close',()=>{clearInterval(hb);s.delete(res);if(!s.size)cl.delete(u.id)});return}
if(req.method=='GET'&&url.pathname=='/healthz'){res.writeHead(200);return res.end('ok')}
if(req.method=='GET'){fs.readFile(INDEX,(e,d)=>{if(e){res.writeHead(500);return res.end('missing public/index.html')}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});res.end(d)});return}
if(req.method=='POST'&&url.pathname.startsWith('/api/')){let raw='';req.on('data',c=>{raw+=c;if(raw.length>20000)req.destroy()});req.on('end',()=>{const reply=(code,o)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(o))};
try{const b=raw?JSON.parse(raw):{},name=url.pathname.slice(5);if(name=='join'){let u=byTok.get(b.tok);if(!u)u=mkUser();u.seen=Date.now();save();return reply(200,{tok:u.tok,me:me(u),pc:PC,now:Date.now()})}
const u=byTok.get(req.headers['x-token']);if(!u)return reply(401,{err:'Not signed in'});if(!Object.prototype.hasOwnProperty.call(G,name))return reply(404,{err:'Unknown'});reply(200,G[name](u,b)||{})}catch(e){reply(400,{err:typeof e=='string'?e:'Bad request'});if(typeof e!='string')console.error(e)}});return}
res.writeHead(404);res.end()});
loadAll().then(()=>srvr.listen(PORT,'0.0.0.0',()=>console.log('Traverser running on port '+PORT+(KEY?'':' (ADMIN_KEY not set: admin commands disabled)'))));
