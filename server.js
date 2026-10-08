'use strict';
// Will's Casino - zero-dependency Node server (HTTP + Server-Sent Events). Node 18+.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||3000,KEY=process.env.ADMIN_KEY||'',FILE=process.env.DATA_FILE||path.join(__dirname,'data.json');
const CYC=20000,BET=15000,SPN=4600,RT=48,RM={r:2,g:50,b:2};
const PC=['#e11d48','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#64748b'];
let DB={users:{},house:0,chat:[],rh:[]};
const UR=(process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,''),UT=process.env.UPSTASH_REDIS_REST_TOKEN||'';let canSave=!UR,dirty=false,saving=false,lastUp=0;
const save=()=>{dirty=true};
async function ucmd(a){const r=await fetch(UR,{method:'POST',headers:{authorization:'Bearer '+UT,'content-type':'application/json'},body:JSON.stringify(a)}),j=await r.json();if(j.error)throw new Error(j.error);return j.result}
async function flush(force){if(!dirty&&!force)return;dirty=false;const s=JSON.stringify(DB);try{fs.writeFileSync(FILE+'.tmp',s);fs.renameSync(FILE+'.tmp',FILE)}catch(e){}
if(UR&&canSave&&!saving&&(force||Date.now()-lastUp>12000)){saving=true;try{await ucmd(['SET','casino:db',s]);lastUp=Date.now()}catch(e){console.error('cloud save failed',e.message);dirty=true}saving=false}else if(UR&&!force)dirty=true}
setInterval(()=>flush(),3000);
for(const sg of['SIGTERM','SIGINT'])process.on(sg,async()=>{await flush(true);process.exit(0)});
async function loadAll(){let v=null;if(UR){let ok=false;for(let i=0;i<6&&!ok;i++){try{const r=await ucmd(['GET','casino:db']);v=r?JSON.parse(r):null;ok=true}catch(e){console.error('cloud load failed',e.message);await new Promise(r=>setTimeout(r,2000))}}if(!ok){console.error('Cannot reach cloud storage; exiting so saved data is never overwritten');process.exit(1)}canSave=true}
if(!v){try{v=JSON.parse(fs.readFileSync(FILE,'utf8'))}catch(e){}}
if(v)Object.assign(DB,v);Object.values(DB.users).forEach(u=>byTok.set(u.tok,u));console.log('loaded',Object.keys(DB.users).length,'players'+(UR?' (cloud storage on)':''))}
const rid=n=>crypto.randomBytes(n).toString('hex'),rf=()=>crypto.randomInt(0,2**31)/2**31,r2=x=>Math.round(x*100)/100,today=()=>new Date().toISOString().slice(0,10);
const byTok=new Map(),cl=new Map(),pubQ=new Set(),SES=new Map();
const ses=u=>{let s=SES.get(u.id);if(!s)SES.set(u.id,s={});return s};
const nk=s=>String(s).toLowerCase().replace(/\s+/g,'');
function freeName(){for(let i=0;i<60;i++){const n='Player'+(100+crypto.randomInt(9900));if(!Object.values(DB.users).some(o=>nk(o.name)===nk(n)))return n}return'Player'+rid(3)}
function mkUser(){const id=rid(6),u={id,tok:rid(16),name:freeName(),color:PC[crypto.randomInt(PC.length)],bal:1000,day:today(),games:0,wag:0,big:0,pg:{},lost:0,rbc:0,lc:0};DB.users[id]=u;byTok.set(u.tok,u);save();return u}
const pub=u=>({id:u.id,name:u.name,color:u.color,games:u.games,wag:u.wag,big:u.big,pg:u.pg,on:cl.has(u.id)}),me=u=>({...pub(u),bal:u.bal,lost:u.lost,rbc:u.rbc,admUntil:u.adm>Date.now()?u.adm:0});
const send=(r,ev,d)=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`),bc=(ev,d)=>{for(const s of cl.values())for(const r of s)send(r,ev,d)},to=(u,ev,d)=>{const s=cl.get(u.id);if(s)for(const r of s)send(r,ev,d)},push=u=>to(u,'me',me(u));
setInterval(()=>{for(const id of pubQ){const u=DB.users[id];if(u)bc('player',pub(u))}pubQ.clear()},2000);
function take(u,a){a=r2(+a);if(!(a>0)||a>u.bal||a>1e12)throw'Invalid bet or not enough money';u.bal=r2(u.bal-a);return a}
function fin(u,g,bet,pay){pay=r2(pay);u.bal=r2(u.bal+pay);u.games++;u.wag=r2(u.wag+bet);if(pay-bet>u.big)u.big=r2(pay-bet);u.pg[g]=(u.pg[g]||0)+1;if(pay<bet){const l=bet-pay;u.lost=r2(u.lost+l);DB.house=r2(DB.house+l)}pubQ.add(u.id);save();return pay}
function ff(u,s){if(s.cr){fin(u,'Crash',s.cr.a,0);delete s.cr}if(s.mn){fin(u,'Mines',s.mn.a,0);delete s.mn}if(s.bj){fin(u,'Blackjack',s.bj.a,0);delete s.bj}}
const chatAdd=m=>{m.ts=Date.now();DB.chat.push(m);if(DB.chat.length>200)DB.chat.shift();save();bc('chat',m)};
// ---- games
const mm=(n,m)=>{let x=.97;for(let i=0;i<n;i++)x*=(25-i)/(25-m-i);return x},cd=()=>1+Math.floor(rf()*13);
const val=h=>{let t=0,a=0;for(const c of h){t+=c>10?10:c==1?(a++,11):c}while(t>21&&a>0){t-=10;a--}return t};
const bjv=(g,done)=>({p:g.p,d:done?g.d:[g.d[0]],pv:val(g.p),dv:done?val(g.d):null,done:!!done});
function bjend(u,g,s,pay,msg){delete s.bj;pay=fin(u,'Blackjack',g.a,pay);return{...bjv(g,1),pay,msg}}
function bjstand(u,g,s){while(val(g.d)<17)g.d.push(cd());const p=val(g.p),d=val(g.d);return bjend(u,g,s,d>21||p>d?g.a*2:p==d?g.a:0,d>21?'Dealer bust':p+' vs '+d)}
const G={
coin(u,b){if(b.side!='Heads'&&b.side!='Tails')throw'Bad side';const a=take(u,b.amt),r=rf()<.5?'Heads':'Tails';return{r,pay:fin(u,'Coin Flip',a,r==b.side?a*1.96:0)}},
dice(u,b){const t=Math.floor(+b.t),o=!!b.over;if(!(t>=2&&t<=98))throw'Bad target';const a=take(u,b.amt),c=o?100-t:t,roll=rf()*100;return{roll,pay:fin(u,'Dice',a,(o?roll>t:roll<t)?a*98/c:0)}},
limbo(u,b){const t=+b.t;if(!(t>=1.01&&t<=1000))throw'Bad target';const a=take(u,b.amt),r=Math.min(1000,.99/Math.max(rf(),1e-9));return{r,pay:fin(u,'Limbo',a,r>=t?a*t:0)}},
slots(u,b){const a=take(u,b.amt),r=[0,1,2].map(()=>Math.floor(rf()*6)),P=[4,6,10,15,30,75],[x,y,z]=r;return{r,pay:fin(u,'Slots',a,x==y&&y==z?a*P[x]:(x==y||y==z||x==z)?a*.5:0)}},
'crash/start'(u,b){const s=ses(u);ff(u,s);const a=take(u,b.amt);s.cr={a,cp:Math.min(1000,Math.max(1,.99/Math.max(rf(),1e-9))),t:Date.now()};return{t0:s.cr.t}},
'crash/state'(u){const s=ses(u),c=s.cr;if(!c)return{on:0};const m=Math.exp(.12*(Date.now()-c.t)/1000);if(m>=c.cp){delete s.cr;fin(u,'Crash',c.a,0);return{on:0,crashed:1,cp:c.cp}}return{on:1,m}},
'crash/cash'(u){const s=ses(u),c=s.cr;if(!c)throw'No round';const m=Math.exp(.12*(Date.now()-c.t)/1000);delete s.cr;if(m>=c.cp){fin(u,'Crash',c.a,0);return{crashed:1,cp:c.cp,pay:0}}return{m,pay:fin(u,'Crash',c.a,c.a*m)}},
'mines/start'(u,b){const s=ses(u);ff(u,s);const m=Math.floor(+b.m);if(!(m>=1&&m<=24))throw'Bad mine count';const a=take(u,b.amt),k=[];while(k.length<m){const i=Math.floor(rf()*25);if(!k.includes(i))k.push(i)}s.mn={a,m,k,r:[]};return{}},
'mines/pick'(u,b){const s=ses(u),g=s.mn;if(!g)throw'No round';const i=Math.floor(+b.i);if(!(i>=0&&i<25)||g.r.includes(i))throw'Bad tile';if(g.k.includes(i)){delete s.mn;fin(u,'Mines',g.a,0);return{boom:1,k:g.k}}g.r.push(i);const x=mm(g.r.length,g.m);if(g.r.length==25-g.m){delete s.mn;return{safe:1,x,done:1,pay:fin(u,'Mines',g.a,g.a*x),k:g.k}}return{safe:1,x}},
'mines/cash'(u){const s=ses(u),g=s.mn;if(!g||!g.r.length)throw'Nothing to cash out';const x=mm(g.r.length,g.m);delete s.mn;return{x,pay:fin(u,'Mines',g.a,g.a*x),k:g.k}},
'bj/deal'(u,b){const s=ses(u);ff(u,s);const a=take(u,b.amt),g=s.bj={a,p:[cd(),cd()],d:[cd(),cd()]},pv=val(g.p),dv=val(g.d);if(pv==21||dv==21)return bjend(u,g,s,pv==dv?a:pv==21?a*2.5:0,pv==21&&dv==21?'Both blackjack':pv==21?'Blackjack!':'Dealer blackjack');return bjv(g)},
'bj/hit'(u){const s=ses(u),g=s.bj;if(!g)throw'No hand';g.p.push(cd());const v=val(g.p);if(v>21)return bjend(u,g,s,0,'Bust');if(v==21)return bjstand(u,g,s);return bjv(g)},
'bj/stand'(u){const s=ses(u);if(!s.bj)throw'No hand';return bjstand(u,s.bj,s)},
'bj/double'(u){const s=ses(u),g=s.bj;if(!g||g.p.length>2)throw'Cannot double';g.a+=take(u,g.a);g.p.push(cd());if(val(g.p)>21)return bjend(u,g,s,0,'Bust');return bjstand(u,g,s)},
// ---- roulette
'r/bet'(u,b){tick();const c=b.c;if(!RM[c])throw'Bad color';if(Date.now()%CYC>=BET)throw'Betting is closed';const a=take(u,b.amt),x=Rd.bets[u.id]||(Rd.bets[u.id]={r:0,g:0,b:0});x[c]=r2(x[c]+a);rbc();return{}},
'r/clear'(u){tick();const x=Rd.bets[u.id];if(!x||Date.now()%CYC>=BET)throw'Cannot clear now';u.bal=r2(u.bal+x.r+x.g+x.b);delete Rd.bets[u.id];rbc();return{}},
// ---- social / economy
chat(u,b){const t=String(b.text||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,200),n=Date.now();if(!t)throw'Empty';if(n-u.lc<1000)throw'Slow down';u.lc=n;chatAdd({t:'m',u:u.id,x:t});return{}},
tip(u,b){const t=DB.users[b.to],a=r2(+b.amt);if(!t||t.id==u.id)throw'Pick another player';if(!(a>0)||a>u.bal)throw'Invalid amount or not enough money';u.bal=r2(u.bal-a);t.bal=r2(t.bal+a);save();push(t);to(t,'note',{x:'🎁 '+u.name+' tipped you '+a.toLocaleString('en-US',{style:'currency',currency:'USD'})});chatAdd({t:'tip',u:u.id,to:t.id,amt:a});return{}},
profile(u,b){const n=String(b.name||'').replace(/[\u0000-\u001f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,16);if(n.length<3)throw'Name must be at least 3 characters';if(Object.values(DB.users).some(o=>o.id!==u.id&&nk(o.name)===nk(n)))throw'That name is already taken';if(!/^#[0-9a-f]{6}$/i.test(b.color))throw'Bad color';u.name=n;u.color=b.color;save();pubQ.add(u.id);return{}},
rake(u){const r=Math.floor((u.lost-u.rbc)*15)/100;if(r<.01)throw'No rakeback available';u.bal=r2(u.bal+r);u.rbc=u.lost;save();return{got:r}},
bail(u){const s=ses(u);if(u.bal>=1||s.cr||s.mn||s.bj)throw'Not available';u.bal=r2(u.bal+100);save();return{}}
};
const Rd0={id:0,bets:{},spun:false,done:true,roll:null};let Rd=Rd0;
const rbc=()=>bc('rbets',{id:Rd.id,b:Object.entries(Rd.bets).map(([k,v])=>[k,v.r,v.g,v.b])});
function mkRoll(){const q=rf(),res=q<.02?'g':q<.51?'r':'b',tiles=[];let k=0;for(let i=0;i<64;i++)tiles.push(rf()<.03?'g':(k++%2?'b':'r'));let idx=RT;if(res=='g')tiles.splice(RT,0,'g');else while(tiles[idx]!=res)idx++;return{res,tiles,idx,j:(rf()-.5)*50}}
function settle(){Rd.done=true;const res=Rd.roll.res;for(const[k,x]of Object.entries(Rd.bets)){const u=DB.users[k];if(!u)continue;fin(u,'Roulette',x.r+x.g+x.b,x[res]*RM[res]);push(u)}DB.rh.unshift(res);DB.rh.length=Math.min(DB.rh.length,100);save();bc('rres',{id:Rd.id,res})}
function tick(){const n=Date.now(),id=Math.floor(n/CYC),ph=n%CYC;if(id!==Rd.id){if(!Rd.done)settle();Rd={id,bets:{},spun:false,done:false,roll:mkRoll()};bc('rnew',{id});rbc()}if(ph>=BET&&!Rd.spun){Rd.spun=true;bc('rspin',{id,...Rd.roll})}if(ph>=BET+SPN&&!Rd.done)settle()}
// ---- admin
function admin(u,b){const k=String(b.key||''),own=!!KEY&&k.length===KEY.length&&crypto.timingSafeEqual(Buffer.from(k),Buffer.from(KEY)),tmp=u.adm>Date.now();if(!own&&!tmp)throw'Wrong admin key';
const targets=()=>b.to=='all'?Object.values(DB.users):[DB.users[b.to]];
switch(b.op){
case'info':return{owner:own,house:own?DB.house:null,n:Object.keys(DB.users).length,on:cl.size,admins:own?Object.values(DB.users).filter(x=>x.adm>Date.now()).map(x=>({id:x.id,name:x.name,left:x.adm-Date.now()})):[]};
case'give':{const l=targets(),a=r2(+b.amt);if(!l[0]||!(a>0)||a>1e15)throw'Pick a player and a valid amount';for(const t of l){t.bal=r2(t.bal+a);push(t);to(t,'note',{x:'🎁 Admin sent you $'+a.toLocaleString('en-US')})}save();return{}}
case'set':{const l=targets(),a=(b.amt===''||b.amt==null)?1000:r2(+b.amt);if(!l[0]||!(a>=0)||a>1e15)throw'Pick a player and a valid amount';for(const t of l){t.bal=a;push(t);to(t,'note',{x:'Your balance was set to $'+a.toLocaleString('en-US')})}save();return{}}
case'ann':{const x=String(b.text||'').trim().slice(0,200);if(!x)throw'Empty';chatAdd({t:'ann',x});return{}}
case'clear':DB.chat=[];save();bc('clear',{});return{};
case'withdraw':{if(!own)throw'Owner only';u.bal=r2(u.bal+DB.house);const g=DB.house;DB.house=0;save();return{got:g}}
case'grant':{if(!own)throw'Owner only';const t=DB.users[b.to],ms=Math.min(30*864e5,Math.floor(+b.ms));if(!t||!(ms>=6e4))throw'Pick a player and a time of at least 1 minute';if(t.id===u.id)throw'Pick someone else';t.adm=Date.now()+ms;save();push(t);to(t,'note',{x:'🛡 You were given admin for '+Math.round(ms/60000)+' min'});return{}}
case'kick':{if(!own)throw'Owner only';const t=DB.users[b.to];if(!t)throw'No such player';t.adm=0;save();push(t);to(t,'note',{x:'Your admin access was removed'});return{}}
default:throw'Unknown op'}}
setInterval(()=>{const n=Date.now();for(const x of Object.values(DB.users))if(x.adm&&x.adm<=n){x.adm=0;save();push(x);to(x,'note',{x:'Your admin time ran out'})}},10000);
// ---- http
const INDEX=['public/index.html','index.html','public./index.html'].map(p=>path.join(__dirname,p)).find(p=>fs.existsSync(p))||path.join(__dirname,'public','index.html');
const srvr=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');
if(req.method=='GET'&&url.pathname=='/api/stream'){const u=byTok.get(url.searchParams.get('t'));if(!u){res.writeHead(401);return res.end()}
res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});
let s=cl.get(u.id);const first=!s;if(!s)cl.set(u.id,s=new Set());s.add(res);tick();
send(res,'init',{me:me(u),players:Object.values(DB.users).map(pub),chat:DB.chat.slice(-60),rh:DB.rh,now:Date.now(),rl:{id:Rd.id,spin:Rd.spun?Rd.roll:null,b:Object.entries(Rd.bets).map(([k,v])=>[k,v.r,v.g,v.b])}});
if(first)bc('player',pub(u));
const hb=setInterval(()=>res.write(': ping\n\n'),20000);
req.on('close',()=>{clearInterval(hb);s.delete(res);if(!s.size){cl.delete(u.id);bc('on',{id:u.id,on:false})}});return}
if(req.method=='GET'&&url.pathname=='/healthz'){res.writeHead(200);return res.end('ok')}
if(req.method=='GET'){fs.readFile(INDEX,(e,d)=>{if(e){res.writeHead(500);return res.end('missing public/index.html')}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});res.end(d)});return}
if(req.method=='POST'&&url.pathname.startsWith('/api/')){let raw='';req.on('data',c=>{raw+=c;if(raw.length>10000)req.destroy()});req.on('end',()=>{
const reply=(code,o)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(o))};
let uu=null;try{const b=raw?JSON.parse(raw):{},name=url.pathname.slice(5);
if(name=='join'){let u=byTok.get(b.tok);if(!u)u=mkUser();let bonus=false;if(u.day!==today()){u.day=today();u.bal=r2(u.bal+10000);bonus=true;save()}return reply(200,{tok:u.tok,bonus})}
const u=byTok.get(req.headers['x-token']);if(!u)return reply(401,{err:'Not signed in'});uu=u;
let out;if(name=='admin')out=admin(u,b);else if(Object.prototype.hasOwnProperty.call(G,name))out=G[name](u,b);else return reply(404,{err:'Unknown'});
out.bal=u.bal;reply(200,out)}catch(e){reply(400,{err:typeof e=='string'?e:'Bad request',bal:uu?uu.bal:undefined});if(typeof e!='string')console.error(e)}})
;return}
res.writeHead(404);res.end()});
loadAll().then(()=>{setInterval(tick,200);tick();srvr.listen(PORT,'0.0.0.0',()=>console.log("Will's Casino running on port "+PORT+(KEY?'':' (ADMIN_KEY not set: admin disabled)')))});
