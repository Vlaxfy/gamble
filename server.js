'use strict';
// High Flip - zero-dependency Node server (HTTP + Server-Sent Events). Node 18+.
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
if(v)Object.assign(DB,v);if(DB.escrow){for(const[tid,e]of Object.entries(DB.escrow))for(const id of e.ids){const x=DB.users[id];if(x)x.bal=r2(x.bal+e.buy)}DB.escrow={};console.log('refunded unfinished tables')}Object.values(DB.users).forEach(u=>byTok.set(u.tok,u));if(UR){try{const a=await ucmd(['LRANGE','casino:alog','-1000','-1']);(a||[]).forEach(x=>{try{ALOG.push(JSON.parse(x))}catch(e){}})}catch(e){}}else{try{fs.readFileSync(ALOGF,'utf8').trim().split('\n').slice(-1000).forEach(x=>{try{ALOG.push(JSON.parse(x))}catch(e){}})}catch(e){}}console.log('loaded',Object.keys(DB.users).length,'players'+(UR?' (cloud storage on)':''))}
const rid=n=>crypto.randomBytes(n).toString('hex'),rf=()=>crypto.randomInt(0,2**31)/2**31,r2=x=>Math.abs(x)>=1e12?Math.round(x):Math.round(x*100)/100,today=()=>new Date().toISOString().slice(0,10);
const byTok=new Map(),cl=new Map(),pubQ=new Set(),SES=new Map();
const ses=u=>{let s=SES.get(u.id);if(!s)SES.set(u.id,s={});return s};
const nk=s=>String(s).toLowerCase().replace(/\s+/g,'');
function freeName(){for(let i=0;i<60;i++){const n='Player'+(100+crypto.randomInt(9900));if(!Object.values(DB.users).some(o=>nk(o.name)===nk(n)))return n}return'Player'+rid(3)}
function mkUser(tok){const id=rid(6),u={id,tok:tok||rid(16),name:freeName(),color:PC[crypto.randomInt(PC.length)],bal:1000,day:today(),games:0,wag:0,big:0,pg:{},lost:0,rbc:0,lc:0};DB.users[id]=u;byTok.set(u.tok,u);save();return u}
const OWNER_HASH=process.env.OWNER_HASH||'30289eba1ec75555a81b660dca85863e3752cbaab54e714c829e8b9849399382',sha=s=>crypto.createHash('sha256').update(String(s)).digest('hex'),GT=25,MAXB=1e30,adminOn=u=>u.adm>Date.now();
const tagsOf=u=>{const t=[];if(u.own)t.push('OWNER');if(adminOn(u))t.push('ADMIN');for(const[g,n]of Object.entries(u.pg||{}))if(n>=GT)t.push('g:'+g);return t},topGame=u=>Object.entries(u.pg||{}).filter(e=>e[1]>=GT).sort((a,b)=>b[1]-a[1])[0];
const shownTag=u=>{if(u.own)return'OWNER';const t=tagsOf(u);if(u.tag==='none')return'';if(u.tag&&t.includes(u.tag))return u.tag;if(adminOn(u))return'ADMIN';const g=topGame(u);return g?'g:'+g[0]:''};
const pub=u=>({id:u.id,name:u.name,color:u.color,games:u.games,wag:u.wag,big:u.big,pg:u.pg,on:cl.has(u.id),own:!!u.own,bio:u.bio||'',tag:shownTag(u),adm:adminOn(u)}),me=u=>({...pub(u),bal:u.bal,lost:u.lost,rbc:u.rbc,admUntil:adminOn(u)?u.adm:0,tags:tagsOf(u),tagSel:u.tag||''});
const send=(r,ev,d)=>r.write(`event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`),bc=(ev,d)=>{for(const s of cl.values())for(const r of s)send(r,ev,d)},to=(u,ev,d)=>{const s=cl.get(u.id);if(s)for(const r of s)send(r,ev,d)},push=u=>to(u,'me',me(u));
setInterval(()=>{for(const id of pubQ){const u=DB.users[id];if(u)bc('player',pub(u))}pubQ.clear()},2000);
function take(u,a){a=r2(+a);if(a>u.bal&&a-u.bal<=Math.max(.011,u.bal*1e-9))a=u.bal;if(!(a>0)||a>u.bal||a>MAXB)throw'Invalid bet or not enough money';u.bal=r2(u.bal-a);return a}
function fin(u,g,bet,pay){pay=r2(pay);u.bal=Math.min(MAXB,r2(u.bal+pay));u.games++;u.wag=r2(u.wag+bet);if(pay-bet>u.big)u.big=r2(pay-bet);u.pg[g]=(u.pg[g]||0)+1;if(pay<bet){const l=bet-pay;u.lost=r2(u.lost+l);DB.house=r2(DB.house+l)}pubQ.add(u.id);save();return pay}
function ff(u,s){if(s.cr){fin(u,'Crash',s.cr.a,0);delete s.cr}if(s.mn){fin(u,'Mines',s.mn.a,0);delete s.mn}if(s.bj){fin(u,'Blackjack',s.bj.h.reduce((a,x)=>a+x.a,0),0);delete s.bj}}
const chatAdd=m=>{m.ts=Date.now();m.id=rid(3);DB.chat.push(m);if(DB.chat.length>200)DB.chat.shift();save();bc('chat',m)};
// ---- games
const CG=.16,mm=(n,m)=>{let x=1;for(let i=0;i<n;i++)x*=(25-i)/(25-m-i);return x},cd=()=>Math.floor(rf()*52),rk=c=>1+c%13,cv=c=>Math.min(10,rk(c));
const val=h=>{let t=0,a=0;for(const c of h){const r=rk(c);t+=r>10?10:r==1?(a++,11):r}while(t>21&&a>0){t-=10;a--}return t};
const bjv=(g,done,x)=>({hands:g.h.map(h=>({c:h.c,v:val(h.c),a:h.a,st:h.st||'',pay:h.pay})),i:g.i,d:done?g.d:[g.d[0]],dv:done?val(g.d):null,done:!!done,...x});
function bjnext(u,g,s){while(g.i<g.h.length&&g.h[g.i].st)g.i++;if(g.i<g.h.length)return bjv(g);if(g.h.some(h=>h.st!='bust'))while(val(g.d)<17)g.d.push(cd());const dv=val(g.d);let tot=0,bet=0;for(const h of g.h){bet+=h.a;let p=0;if(h.st!='bust'){const v=val(h.c);p=dv>21||v>dv?h.a*2:v==dv?h.a:0}h.pay=p;tot+=p}delete s.bj;const pay=fin(u,'Blackjack',bet,tot);return bjv(g,1,{pay,bet,msg:(dv>21?'Dealer busts':'Dealer has '+dv)+' · '+(tot>bet?'You win!':tot==bet?'Push':'You lose')})}
const G={
coin(u,b){if(b.side!='Heads'&&b.side!='Tails')throw'Bad side';const a=take(u,b.amt);let r=rf()<.5?'Heads':'Tails';if(RIGC&&(RIGC.to==='any'||RIGC.to===u.id)){r=RIGC.side;RIGC=null}return{r,pay:fin(u,'Coin Flip',a,r==b.side?a*2:0)}},
dice(u,b){const t=Math.floor(+b.t),o=!!b.over;if(!(t>=2&&t<=98))throw'Bad target';const a=take(u,b.amt),c=o?100-t:t,roll=rf()*100;return{roll,pay:fin(u,'Dice',a,(o?roll>t:roll<t)?a*100/c:0)}},
limbo(u,b){const t=+b.t;if(!(t>=1.01&&t<=1000))throw'Bad target';const a=take(u,b.amt),r=Math.min(1000,1/Math.max(rf(),1e-9));return{r,pay:fin(u,'Limbo',a,r>=t?a*t:0)}},
slots(u,b){const a=take(u,b.amt),r=[0,1,2].map(()=>Math.floor(rf()*6)),P=[4,6,10,15,30,75],[x,y,z]=r;return{r,pay:fin(u,'Slots',a,x==y&&y==z?a*P[x]:(x==y||y==z||x==z)?a*.5:0)}},
'crash/start'(u,b){const s=ses(u);ff(u,s);const a=take(u,b.amt);s.cr={a,cp:Math.min(100,Math.max(1,.94/Math.max(rf(),1e-9))),t:Date.now()};return{t0:s.cr.t}},
'crash/state'(u){const s=ses(u),c=s.cr;if(!c)return{on:0};const m=Math.exp(CG*(Date.now()-c.t)/1000);if(m>=c.cp){delete s.cr;fin(u,'Crash',c.a,0);return{on:0,crashed:1,cp:c.cp}}return{on:1,m}},
'crash/cash'(u,b){const s=ses(u),c=s.cr;if(!c)throw'No round';const now=Date.now(),tc=Math.max(c.t,Math.min(now,Math.max(+b.ct||now,now-500))),m=Math.exp(CG*(tc-c.t)/1000);delete s.cr;if(m>=c.cp){fin(u,'Crash',c.a,0);return{crashed:1,cp:c.cp,pay:0}}return{m,pay:fin(u,'Crash',c.a,c.a*m)}},
'mines/start'(u,b){const s=ses(u);ff(u,s);const m=Math.floor(+b.m);if(!(m>=1&&m<=24))throw'Bad mine count';const a=take(u,b.amt),k=[];while(k.length<m){const i=Math.floor(rf()*25);if(!k.includes(i))k.push(i)}s.mn={a,m,k,r:[]};return{}},
'mines/pick'(u,b){const s=ses(u),g=s.mn;if(!g)throw'No round';const i=Math.floor(+b.i);if(!(i>=0&&i<25)||g.r.includes(i))throw'Bad tile';if(g.k.includes(i)){delete s.mn;fin(u,'Mines',g.a,0);return{boom:1,k:g.k}}g.r.push(i);const x=mm(g.r.length,g.m);if(g.r.length==25-g.m){delete s.mn;return{safe:1,x,done:1,pay:fin(u,'Mines',g.a,g.a*x),k:g.k}}return{safe:1,x}},
'mines/cash'(u){const s=ses(u),g=s.mn;if(!g||!g.r.length)throw'Nothing to cash out';const x=mm(g.r.length,g.m);delete s.mn;return{x,pay:fin(u,'Mines',g.a,g.a*x),k:g.k}},
'bj/deal'(u,b){const s=ses(u);ff(u,s);const a=take(u,b.amt),g=s.bj={h:[{c:[cd(),cd()],a}],i:0,d:[cd(),cd()]},pv=val(g.h[0].c),dv=val(g.d);if(pv==21||dv==21){const p=pv==dv?a:pv==21?a*2.5:0;g.h[0].st='stand';g.h[0].pay=p;delete s.bj;const pay=fin(u,'Blackjack',a,p);return bjv(g,1,{pay,bet:a,msg:pv==21&&dv==21?'Both blackjack · Push':pv==21?'Blackjack! Pays 3:2':'Dealer has blackjack'})}return bjv(g)},
'bj/hit'(u){const s=ses(u),g=s.bj;if(!g)throw'No hand';const h=g.h[g.i];h.c.push(cd());const v=val(h.c);if(v>21)h.st='bust';else if(v==21)h.st='stand';return bjnext(u,g,s)},
'bj/stand'(u){const s=ses(u),g=s.bj;if(!g)throw'No hand';g.h[g.i].st='stand';return bjnext(u,g,s)},
'bj/double'(u){const s=ses(u),g=s.bj;if(!g)throw'No hand';const h=g.h[g.i];if(h.c.length!=2)throw'Cannot double now';const x=take(u,h.a);h.a+=x;h.c.push(cd());h.st=val(h.c)>21?'bust':'stand';return bjnext(u,g,s)},
'bj/split'(u){const s=ses(u),g=s.bj;if(!g)throw'No hand';const h=g.h[g.i];if(g.h.length!=1||h.c.length!=2||cv(h.c[0])!=cv(h.c[1]))throw'Cannot split';const a=take(u,h.a);g.h=[{c:[h.c[0],cd()],a},{c:[h.c[1],cd()],a}];g.i=0;g.h.forEach(q=>{if(val(q.c)==21)q.st='stand'});return bjnext(u,g,s)},
// ---- roulette
'r/bet'(u,b){tick();const c=b.c;if(!RM[c])throw'Bad color';if(Date.now()%CYC>=BET)throw'Betting is closed';const a=take(u,b.amt),x=Rd.bets[u.id]||(Rd.bets[u.id]={r:0,g:0,b:0});x[c]=r2(x[c]+a);rbc();return{}},
'r/clear'(u){tick();const x=Rd.bets[u.id];if(!x||Date.now()%CYC>=BET)throw'Cannot clear now';u.bal=r2(u.bal+x.r+x.g+x.b);delete Rd.bets[u.id];rbc();return{}},
// ---- social / economy
chat(u,b){const t=String(b.text||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,200),n=Date.now();if(u.mute>n)throw'You are timed out for '+Math.ceil((u.mute-n)/60000)+' more min';if(!t)throw'Empty';if(n-u.lc<1000)throw'Slow down';if(bad(t)){u.mute=n+600000;save();chatAdd({t:'sys',x:u.name+' was timed out for 10 minutes (language)'});throw'Watch your language! You are timed out for 10 minutes.'}u.lc=n;const msg={t:'m',u:u.id,x:t};if(b.reply){const o=DB.chat.find(m=>m.id===b.reply&&m.t==='m');if(o)msg.re={u:o.u,x:String(o.x).slice(0,80)}}chatAdd(msg);return{}},
tip(u,b){const t=DB.users[b.to],a=r2(+b.amt);if(!t||t.id==u.id)throw'Pick another player';if(!(a>0)||a>u.bal)throw'Invalid amount or not enough money';u.bal=r2(u.bal-a);t.bal=r2(t.bal+a);save();push(t);to(t,'note',{x:'🎁 '+u.name+' tipped you '+a.toLocaleString('en-US',{style:'currency',currency:'USD'})});chatAdd({t:'tip',u:u.id,to:t.id,amt:a});return{}},
profile(u,b){let n=u.name;if(b.name!==undefined){n=String(b.name||'').replace(/[\u0000-\u001f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,16);if(n.length<3)throw'Name must be at least 3 characters';if(Object.values(DB.users).some(o=>o.id!==u.id&&nk(o.name)===nk(n)))throw'That name is already taken'}if(bad(n)||strong(n)||(typeof b.bio=='string'&&(bad(b.bio)||strong(b.bio))))throw'Please keep your name and bio clean';if(b.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(b.color))throw'Bad color';if(typeof b.bio=='string')u.bio=b.bio.replace(/[\u0000-\u001f<>]/g,' ').trim().slice(0,120);if(b.tag!==undefined&&!u.own){if(b.tag==='')delete u.tag;else if(b.tag==='none'||tagsOf(u).includes(b.tag))u.tag=b.tag;else throw'That tag is not unlocked yet'}u.name=n;if(b.color)u.color=b.color;save();pubQ.add(u.id);return{p:me(u)}},
lb(u){const us=Object.values(DB.users),top=(k,min)=>us.filter(x=>x[k]>min).sort((a,b)=>b[k]-a[k]).slice(0,10).map(x=>({id:x.id,name:x.name,color:x.color,v:x[k],on:cl.has(x.id),own:!!x.own,tag:shownTag(x),w:x.wag})),rk=k=>us.filter(x=>x[k]>u[k]).length+1;return{rich:top('bal',-1),wag:top('wag',0),big:top('big',0),games:top('games',0),me:{rich:rk('bal'),wag:rk('wag'),big:rk('big'),games:rk('games')},n:us.length}},
rake(u){const r=Math.floor((u.lost-u.rbc)*15)/100;if(r<.01)throw'No rakeback available';u.bal=r2(u.bal+r);u.rbc=u.lost;save();return{got:r}},
bail(u){const s=ses(u);if(u.bal>=1||s.cr||s.mn||s.bj)throw'Not available';u.bal=r2(u.bal+100);save();return{}}
};
const Rd0={id:0,bets:{},spun:false,done:true,roll:null};let Rd=Rd0;
const rbc=()=>bc('rbets',{id:Rd.id,b:Object.entries(Rd.bets).map(([k,v])=>[k,v.r,v.g,v.b])});
function mkRoll(force){const q=rf(),res=force||(q<.02?'g':q<.51?'r':'b'),tiles=[];let k=0;for(let i=0;i<64;i++)tiles.push(rf()<.03?'g':(k++%2?'b':'r'));let idx=RT;if(res=='g')tiles.splice(RT,0,'g');else while(tiles[idx]!=res)idx++;return{res,tiles,idx,j:(rf()-.5)*50}}
function settle(){Rd.done=true;const res=Rd.roll.res;for(const[k,x]of Object.entries(Rd.bets)){const u=DB.users[k];if(!u)continue;fin(u,'Roulette',x.r+x.g+x.b,x[res]*RM[res]);push(u)}DB.rh.unshift(res);DB.rh.length=Math.min(DB.rh.length,100);save();bc('rres',{id:Rd.id,res})}
function tick(){const n=Date.now(),id=Math.floor(n/CYC),ph=n%CYC;if(id!==Rd.id){if(!Rd.done)settle();Rd={id,bets:{},spun:false,done:false,roll:mkRoll(RIG),forced:RIG};RIG=null;bc('rnew',{id});rbc()}if(ph>=BET&&!Rd.spun){Rd.spun=true;bc('rspin',{id,...Rd.roll})}if(ph>=BET+SPN&&!Rd.done)settle()}
// ---- tables: UNO + POOL (player vs player, winner takes the whole pot)
const TB={},nmu=id=>(DB.users[id]||{}).name||'Player';
const inT=(u,all)=>Object.values(TB).find(t=>t.ids.includes(u.id)&&(all||!t.done));
const tpubl=t=>({id:t.id,game:t.game,host:t.host,buy:t.buy,n:t.ids.length,max:t.max,started:!!t.started});
let tblQ=0;const tlist=()=>Object.values(TB).filter(t=>!t.done).map(tpubl),tbl=()=>{clearTimeout(tblQ);tblQ=setTimeout(()=>bc('tbl',{list:tlist()}),120)};
const escSet=t=>{DB.escrow=DB.escrow||{};DB.escrow[t.id]={buy:t.buy,ids:t.ids.slice()};save()},escDel=t=>{if(DB.escrow&&DB.escrow[t.id]){delete DB.escrow[t.id];save()}};
function finP(u,g,stake,pay){pay=r2(pay);u.bal=Math.min(MAXB,r2(u.bal+pay));u.games++;u.wag=r2(u.wag+stake);if(pay-stake>u.big)u.big=r2(pay-stake);u.pg[g]=(u.pg[g]||0)+1;pubQ.add(u.id);save();push(u)}
function shuf(a){for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function tview(t,u){if(!t.started)return{id:t.id,game:t.game,waiting:true,host:t.host,buy:t.buy,ids:t.ids,max:t.max};return t.game==='uno'?uview(t,u):pview(t)}
function tpush(t,extra){for(const id of t.ids){const x=DB.users[id];if(x)to(x,'g',{...tview(t,x),...(extra||{})})}}
function tdone(t){setTimeout(()=>{delete TB[t.id];tbl();for(const id of t.ids){const x=DB.users[id];x&&to(x,'g',{id:t.id,gone:true})}},25000)}
// ---- UNO
const UC=['R','Y','G','B'],UN={R:'Red',Y:'Yellow',G:'Green',B:'Blue'};
const uname=c=>c==='WW'?'Wild':c==='WF'?'Wild +4':UN[c[0]]+' '+({S:'Skip',R:'Reverse',D:'+2'}[c[1]]||c[1]);
function udeck(){const d=[];for(const c of UC){d.push(c+'0');for(let n=1;n<=9;n++)d.push(c+n,c+n);for(const s of['S','R','D'])d.push(c+s,c+s)}for(let i=0;i<4;i++)d.push('WW','WF');return d}
function udraw(g,p,n){for(let i=0;i<n;i++){if(!g.draw.length){const top=g.disc.pop();g.draw=shuf(g.disc);g.disc=[top]}if(!g.draw.length)return;p.hand.push(g.draw.pop())}}
const uplay=(g,c,h)=>c[0]==='W'?(c==='WW'||!h.some(x=>x[0]===g.color)):(c[0]===g.color||c[1]===g.top[1]);
const unext=(g,k)=>{g.turn=(g.turn+g.dir*(k||1)+g.p.length*4)%g.p.length;g.drew=null;g.deadline=Date.now()+30000};
function startUno(t){t.started=true;t.pot=r2(t.buy*t.ids.length);const g=t.g={p:t.ids.map(id=>({id,hand:[],miss:0})),draw:shuf(udeck()),disc:[],dir:1,turn:0,drew:null,winner:null,log:[]};
for(const p of g.p)for(let i=0;i<7;i++)p.hand.push(g.draw.pop());
let top;do{top=g.draw.pop();if(top==='WF'){g.draw.unshift(top);top=null}}while(!top);
g.disc.push(top);g.top=top;g.color=top[0]==='W'?UC[crypto.randomInt(4)]:top[0];g.turn=crypto.randomInt(g.p.length);g.log.push('First card: '+uname(top)+'. '+nmu(g.p[g.turn].id)+' starts.');
const v=top[1];if(v==='S')unext(g);else if(v==='R'){g.dir=-1;if(g.p.length===2)unext(g)}else if(v==='D'){udraw(g,g.p[g.turn],2);unext(g)}
g.deadline=Date.now()+30000}
function uview(t,u){const g=t.g,me=g.p.find(p=>p.id===u.id);return{id:t.id,game:'uno',started:true,buy:t.buy,pot:t.pot,players:g.p.map(p=>({id:p.id,n:p.hand.length,miss:p.miss})),hand:me?me.hand:[],top:g.top,color:g.color,dir:g.dir,turn:g.p[g.turn]&&g.p[g.turn].id,drew:g.drew?g.drew.i:null,deadline:g.deadline,winner:g.winner,log:g.log.slice(-6),dc:g.draw.length}}
function uwin(t,p){const g=t.g;g.winner=p.id;t.done=true;escDel(t);for(const id of t.ids){const x=DB.users[id];if(x)finP(x,'Uno',t.buy,id===p.id?t.pot:0)}g.log.push(nmu(p.id)+' wins the pot!');tpush(t);tbl();tdone(t)}
// ---- POOL (8-ball, server-side physics)
const PW=1000,PH=500,PR=11,PPK=[[0,0],[500,0],[1000,0],[0,500],[500,500],[1000,500]],pgrp=id=>id===0?null:id===8?'eight':id<8?'solid':'stripe';
function prack(){const solids=shuf([1,2,3,4,5,6,7]),stripes=shuf([9,10,11,12,13,14,15]),place={'2,1':8},c1=solids.pop(),c2=stripes.pop(),fl=crypto.randomInt(2);place['4,0']=fl?c1:c2;place['4,4']=fl?c2:c1;const rest=shuf(solids.concat(stripes)),B=[{x:250,y:250,out:false}],pos={};
for(let r=0;r<5;r++)for(let i=0;i<=r;i++){const id=place[r+','+i]||rest.pop();pos[id]=[750+r*PR*1.74,250+(i-r/2)*PR*2.02]}
for(let id=1;id<=15;id++)B[id]={x:pos[id][0],y:pos[id][1],out:false};return B}
const pfree=(B,x,y,skip)=>B.every((b,i)=>i===skip||b.out||Math.hypot(b.x-x,b.y-y)>=2*PR+.5);
function psim(B,v0){const N=16,dt=1/240,fr=[],vx=new Array(N).fill(0),vy=new Array(N).fill(0);let first=null,rail=false,step=0,moving=true;const pk=[];vx[0]=v0[0];vy[0]=v0[1];
const snap=()=>{const f=new Array(32);for(let i=0;i<N;i++){const b=B[i];f[2*i]=b.out?-1:Math.round(b.x*10);f[2*i+1]=b.out?-1:Math.round(b.y*10)}fr.push(f)};snap();
while(moving&&step<3360){step++;moving=false;
for(let i=0;i<N;i++){const b=B[i];if(b.out)continue;const s=Math.hypot(vx[i],vy[i]);if(s>0){const ns=s-(35+.55*s)*dt;if(ns<5){vx[i]=vy[i]=0}else{vx[i]=vx[i]/s*ns;vy[i]=vy[i]/s*ns;moving=true}}
b.x+=vx[i]*dt;b.y+=vy[i]*dt;
if(b.x<PR){b.x=PR;vx[i]=-vx[i]*.8;if(first!==null)rail=true}else if(b.x>PW-PR){b.x=PW-PR;vx[i]=-vx[i]*.8;if(first!==null)rail=true}
if(b.y<PR){b.y=PR;vy[i]=-vy[i]*.8;if(first!==null)rail=true}else if(b.y>PH-PR){b.y=PH-PR;vy[i]=-vy[i]*.8;if(first!==null)rail=true}
for(const[px,py]of PPK){if(Math.hypot(b.x-px,b.y-py)<(px===500?24:28)){b.out=true;vx[i]=vy[i]=0;pk.push(i);if(first!==null)rail=true;break}}}
for(let i=0;i<N;i++){if(B[i].out)continue;for(let j=i+1;j<N;j++){if(B[j].out)continue;const dx=B[j].x-B[i].x,dy=B[j].y-B[i].y,d=Math.hypot(dx,dy);if(d<2*PR&&d>0){const nx=dx/d,ny=dy/d,ov=2*PR-d;B[i].x-=nx*ov/2;B[i].y-=ny*ov/2;B[j].x+=nx*ov/2;B[j].y+=ny*ov/2;const vn=(vx[j]-vx[i])*nx+(vy[j]-vy[i])*ny;if(vn<0){const k=-(1+.96)*vn/2;vx[i]-=k*nx;vy[i]-=k*ny;vx[j]+=k*nx;vy[j]+=k*ny;moving=true;if(first===null&&(i===0||j===0))first=i===0?j:i}}}}
if(step%8===0)snap()}
for(let i=0;i<N;i++)if(!B[i].out){}snap();return{fr,first,pocketed:pk,rail}}
function startPool(t){t.started=true;t.pot=r2(t.buy*2);const first=crypto.randomInt(2);t.g={ids:t.ids.slice(),balls:prack(),groups:{[t.ids[0]]:null,[t.ids[1]]:null},shooter:first,bih:true,brk:true,deadline:Date.now()+60000,miss:{},winner:null,msg:nmu(t.ids[first])+' breaks (picked at random)'}}
function pview(t){const g=t.g;return{id:t.id,game:'pool',started:true,buy:t.buy,pot:t.pot,ids:g.ids,shooter:g.ids[g.shooter],groups:g.groups,bih:g.bih,brk:g.brk,balls:g.balls.map(b=>b.out?null:[Math.round(b.x*10)/10,Math.round(b.y*10)/10]),deadline:g.deadline,winner:g.winner,msg:g.msg}}
function respot8(g){let x=750;while(!pfree(g.balls,x,250,8)&&x<PW-PR)x+=2*PR;g.balls[8].x=x;g.balls[8].y=250;g.balls[8].out=false}
function pwin(t,wid,fr){const g=t.g;g.winner=wid;t.done=true;escDel(t);for(const id of g.ids){const x=DB.users[id];if(x)finP(x,'Pool',t.buy,id===wid?t.pot:0)}tpush(t,fr?{frames:fr}:{});tbl();tdone(t)}
function presolve(t,sim,me,opp){const g=t.g,sh=g.shooter,pk=sim.pocketed,cueOut=pk.includes(0);let eightOut=pk.includes(8);const others=pk.filter(i=>i!==0&&i!==8),owned=g.groups[me],fg=sim.first==null?null:pgrp(sim.first),notes=[],leftOwn=owned?g.before.filter(i=>pgrp(i)===owned).length:99;let foul=cueOut;
if(cueOut)notes.push('scratch');
if(sim.first==null){foul=true;notes.push('no ball hit')}else if(owned){const need=leftOwn>0?owned:'eight';if(fg!==need){foul=true;notes.push('wrong ball hit first')}}else if(fg==='eight'){foul=true;notes.push('8-ball hit first')}
if(sim.first!=null&&!sim.rail&&!pk.length){foul=true;notes.push('no rail after contact')}
let win=null;if(eightOut){if(g.brk){respot8(g);eightOut=false;notes.push('8-ball re-spotted')}else{win=(!foul&&owned&&leftOwn===0)?me:opp;g.msg=win===me?nmu(me)+' cleared the table and sank the 8-ball':nmu(me)+(foul?' fouled on the 8-ball':' sank the 8-ball too early')+', so '+nmu(opp)+' wins'}}
let keep=false;
if(win===null){if(g.brk){if(!foul&&others.length)keep=true}else if(!owned){if(!foul&&others.length){const gt=pgrp(others[0]);g.groups[me]=gt;g.groups[opp]=gt==='solid'?'stripe':'solid';keep=true;notes.push(nmu(me)+' has '+gt+'s')}}else if(!foul&&others.some(i=>pgrp(i)===owned))keep=true}
g.brk=false;if(win!==null)return pwin(t,win,sim.fr);
if(foul){g.shooter=1-sh;g.bih=true;g.balls[0].out=false;if(cueOut||!pfree(g.balls,g.balls[0].x,g.balls[0].y,0)){g.balls[0].x=250;g.balls[0].y=250}g.msg='Foul ('+notes.join(', ')+'). '+nmu(opp)+' has ball in hand.'}
else{g.bih=false;if(!keep)g.shooter=1-sh;g.msg=(others.length?nmu(me)+' pocketed '+others.join(', ')+'. ':'')+(notes.length?notes.join(', ')+'. ':'')+(keep?nmu(me)+' shoots again.':nmu(opp)+"'s turn.")}
g.miss[me]=0;g.deadline=Date.now()+60000;tpush(t,{frames:sim.fr})}
function forfeit(t,u){if(t.done)return;if(t.game==='pool'){const o=t.g.ids.find(i=>i!==u.id);t.g.msg=u.name+' forfeited the match';return pwin(t,o)}
const g=t.g,i=g.p.findIndex(p=>p.id===u.id);finP(u,'Uno',t.buy,0);t.ids=t.ids.filter(x=>x!==u.id);to(u,'g',{id:t.id,gone:true});if(i<0)return;
g.draw.unshift(...g.p[i].hand);g.p.splice(i,1);g.log.push(u.name+' left the game');if(g.p.length===1)return uwin(t,g.p[0]);
const n=g.p.length;if(i<g.turn)g.turn--;else if(i===g.turn){g.turn=g.dir===1?g.turn%n:(g.turn-1+n)%n;g.drew=null;g.deadline=Date.now()+30000}tpush(t);tbl()}
function leaveT(t,u){if(t.done)return;if(!t.started){u.bal=r2(u.bal+t.buy);t.ids=t.ids.filter(i=>i!==u.id);to(u,'g',{id:t.id,gone:true});
if(t.host===u.id||!t.ids.length){for(const i of t.ids){const x=DB.users[i];if(x){x.bal=r2(x.bal+t.buy);push(x);to(x,'g',{id:t.id,gone:true})}}t.ids=[];delete TB[t.id];escDel(t)}else{escSet(t);tpush(t)}push(u);tbl();return}forfeit(t,u)}
setInterval(()=>{const n=Date.now();for(const t of Object.values(TB)){if(!t.started||t.done)continue;const g=t.g;if(n<g.deadline)continue;
if(t.game==='uno'){const p=g.p[g.turn];p.miss++;g.log.push(nmu(p.id)+' ran out of time');if(p.miss>=3){forfeit(t,DB.users[p.id]);continue}if(!g.drew)udraw(g,p,1);unext(g);tpush(t)}
else{const me=g.ids[g.shooter];g.miss[me]=(g.miss[me]||0)+1;if(g.miss[me]>=3){forfeit(t,DB.users[me]);continue}g.shooter=1-g.shooter;g.bih=true;g.balls[0].out=false;if(!pfree(g.balls,g.balls[0].x,g.balls[0].y,0)){g.balls[0].x=250;g.balls[0].y=250}g.msg=nmu(me)+' ran out of time. '+nmu(g.ids[g.shooter])+' has ball in hand.';g.deadline=n+60000;tpush(t)}}},1000);
Object.assign(G,{
't/host'(u,b){const g=b.game;if(g!=='uno'&&g!=='pool')throw'Pick a game';if(inT(u))throw'You are already at a table';const a=take(u,b.amt),t={id:rid(4),game:g,host:u.id,buy:a,ids:[u.id],max:g==='pool'?2:6,started:false};TB[t.id]=t;escSet(t);tbl();tpush(t);return{id:t.id}},
't/join'(u,b){const t=TB[b.id];if(!t||t.done)throw'Table not found';if(t.started)throw'That game already started';if(inT(u))throw'You are already at a table';if(t.ids.length>=t.max)throw'Table is full';take(u,t.buy);t.ids.push(u.id);escSet(t);if(t.game==='pool'&&t.ids.length===2)startPool(t);tbl();tpush(t);return{id:t.id}},
't/leave'(u){const t=inT(u);if(!t)throw'You are not at a table';leaveT(t,u);return{}},
't/start'(u){const t=inT(u);if(!t||t.game!=='uno'||t.host!==u.id)throw'Only the host can start';if(t.started)throw'Already started';if(t.ids.length<2)throw'Need at least 2 players';startUno(t);tbl();tpush(t);return{}},
'uno/play'(u,b){const t=inT(u);if(!t||t.game!=='uno'||!t.started)throw'No game';const g=t.g,n=g.p.length,pi=g.p.findIndex(p=>p.id===u.id);if(pi!==g.turn)throw'Not your turn';const p=g.p[pi],i=+b.i,c=p.hand[i];if(!c)throw'Bad card';if(g.drew&&g.drew.i!==i)throw'You can only play the card you just drew';if(!uplay(g,c,p.hand))throw'You cannot play that card';let col=c[0];if(c[0]==='W'){col=b.color;if(!UC.includes(col))throw'Pick a color'}
p.hand.splice(i,1);g.disc.push(c);g.top=c;g.color=col;p.miss=0;g.drew=null;g.log.push(u.name+' played '+uname(c)+(c[0]==='W'?' ('+UN[col]+')':''));
if(!p.hand.length){uwin(t,p);return{}}
if(p.hand.length===1)g.log.push(u.name+' says UNO!');
let st=1;const v=c[1];if(v==='S')st=2;else if(v==='R'){g.dir*=-1;if(n===2)st=2}else if(v==='D'||c==='WF'){const q=g.p[(g.turn+g.dir+n)%n],k=c==='WF'?4:2;udraw(g,q,k);g.log.push(nmu(q.id)+' draws '+k);st=2}
unext(g,st);tpush(t);return{}},
'uno/draw'(u){const t=inT(u);if(!t||t.game!=='uno'||!t.started)throw'No game';const g=t.g,pi=g.p.findIndex(p=>p.id===u.id);if(pi!==g.turn)throw'Not your turn';if(g.drew)throw'You already drew a card';const p=g.p[pi];p.miss=0;udraw(g,p,1);const c=p.hand[p.hand.length-1];g.log.push(u.name+' drew a card');if(c&&uplay(g,c,p.hand)){g.drew={i:p.hand.length-1};g.deadline=Date.now()+30000}else unext(g);tpush(t);return{}},
'uno/pass'(u){const t=inT(u);if(!t||t.game!=='uno'||!t.started)throw'No game';const g=t.g,pi=g.p.findIndex(p=>p.id===u.id);if(pi!==g.turn)throw'Not your turn';if(!g.drew)throw'Draw a card first';g.log.push(u.name+' passed');unext(g);tpush(t);return{}},
'pool/shoot'(u,b){const t=inT(u);if(!t||t.game!=='pool'||!t.started)throw'No game';const g=t.g;if(g.winner)throw'Game over';if(g.ids[g.shooter]!==u.id)throw'Not your turn';const ang=+b.angle,pw=Math.max(.03,Math.min(1,+b.power));if(!isFinite(ang)||!isFinite(pw))throw'Bad shot';
if(g.bih){const c=b.cue||{x:g.balls[0].x,y:g.balls[0].y};if(!(c.x>=PR&&c.x<=PW-PR&&c.y>=PR&&c.y<=PH-PR))throw'Place the cue ball on the table';if(g.brk&&c.x>250)throw'Break from behind the head line';if(!pfree(g.balls,c.x,c.y,0))throw'The cue ball is touching another ball';g.balls[0].x=c.x;g.balls[0].y=c.y;g.balls[0].out=false}
const opp=g.ids.find(i=>i!==u.id);g.before=[];for(let i=1;i<16;i++)if(!g.balls[i].out)g.before.push(i);
const sim=psim(g.balls,[Math.cos(ang)*pw*1500,Math.sin(ang)*pw*1500]);presolve(t,sim,u.id,opp);return{}}
});
// ---- admin
let RIG=null,RIGC=null;const ALOG=[],ALOGF=FILE+'.alog';
function alog(u,op,d){const e={t:Date.now(),u:u.id,n:u.name,o:op,d:d||''};ALOG.push(e);if(ALOG.length>1000)ALOG.shift();fs.appendFile(ALOGF,JSON.stringify(e)+'\n',()=>{});if(UR&&canSave)ucmd(['RPUSH','casino:alog',JSON.stringify(e)]).catch(()=>{})}
const BADW=['fuck','fuk','fck','shit','bitch','cunt','asshole','arsehole','dick','dickhead','pussy','bastard','slut','whore','nigger','nigga','faggot','fag','retard','twat','wanker','motherfucker','cock','prick','bollocks'].map(w=>w.replace(/(.)\1+/g,'$1')),BADRE=new RegExp('\\b(?:'+BADW.join('|')+')(?:s|ed|er|ers|ing|in|y|head|z)?\\b');
const strong=t=>{const x=String(t).toLowerCase().replace(/[@4]/g,'a').replace(/[$5]/g,'s').replace(/0/g,'o').replace(/[1!|]/g,'i').replace(/3/g,'e').replace(/7/g,'t').replace(/[^a-z]/g,'');return['fuck','bitch','cunt','nigger','nigga','faggot','whore','pussy','asshole','motherfucker','shit','dickhead'].some(w=>x.includes(w))};
const bad=t=>BADRE.test(String(t).toLowerCase().replace(/[@4]/g,'a').replace(/[$5]/g,'s').replace(/0/g,'o').replace(/[1!|]/g,'i').replace(/3/g,'e').replace(/7/g,'t').replace(/[^a-z\s]/g,'').replace(/(.)\1+/g,'$1'));
function admin0(u,b){const k=String(b.key||''),own=!!KEY&&k.length===KEY.length&&crypto.timingSafeEqual(Buffer.from(k),Buffer.from(KEY)),tmp=u.adm>Date.now();if(!own&&!tmp)throw'Wrong admin key';
const targets=()=>b.to=='all'?Object.values(DB.users):[DB.users[b.to]];
switch(b.op){
case'info':return{owner:own,house:own?DB.house:null,rig:own?(RIG||(!Rd.spun&&!Rd.done&&Rd.forced)||null):null,rigc:own&&RIGC?{side:RIGC.side,who:RIGC.to==='any'?'anyone':nmu(RIGC.to)}:null,n:Object.keys(DB.users).length,on:cl.size,admins:own?Object.values(DB.users).filter(x=>x.adm>Date.now()).map(x=>({id:x.id,name:x.name,left:x.adm-Date.now()})):[]};
case'give':{const l=targets(),a=r2(+b.amt);if(!l[0]||!(a>0)||a>MAXB)throw'Pick a player and a valid amount';for(const t of l){t.bal=r2(t.bal+a);push(t);to(t,'note',{x:'🎁 Admin sent you $'+a.toLocaleString('en-US')})}save();return{}}
case'set':{const l=targets(),a=(b.amt===''||b.amt==null)?1000:r2(+b.amt);if(!l[0]||!isFinite(a)||!(a>=0)||a>MAXB)throw'Pick a player and a valid amount';for(const t of l){t.bal=a;push(t);to(t,'note',{x:'Your balance was set to $'+a.toLocaleString('en-US')})}save();return{}}
case'ann':{const x=String(b.text||'').trim().slice(0,200);if(!x)throw'Empty';chatAdd({t:'ann',x});return{}}
case'clear':DB.chat=[];save();bc('clear',{});return{};
case'rakereset':{const l=targets();if(!l[0])throw'Pick a player';for(const t of l){t.rbc=t.lost;push(t)}save();return{}}
case'code':{if(!own)throw'Owner only';const t=DB.users[b.to];if(!t)throw'No such player';return{name:t.name,code:t.tok}}
case'withdraw':{if(!own)throw'Owner only';u.bal=r2(u.bal+DB.house);const g=DB.house;DB.house=0;save();return{got:g}}
case'grant':{if(!own)throw'Owner only';const t=DB.users[b.to],ms=Math.min(30*864e5,Math.floor(+b.ms));if(!t||!(ms>=1000))throw'Pick a player and a time of at least 1 second';if(t.id===u.id)throw'Pick someone else';t.adm=Date.now()+ms;save();pubQ.add(t.id);push(t);to(t,'note',{x:'🛡 You were given admin for '+(ms<60000?Math.round(ms/1000)+' sec':Math.round(ms/60000)+' min')});return{}}
case'kick':{if(!own)throw'Owner only';const t=DB.users[b.to];if(!t)throw'No such player';t.adm=0;save();pubQ.add(t.id);push(t);to(t,'note',{x:'Your admin access was removed'});return{}}
case'rig':{if(!own)throw'Owner only';const c=b.color;if(c===''||c==null){RIG=null;if(!Rd.spun&&!Rd.done&&Rd.forced){Rd.roll=mkRoll();Rd.forced=null}return{rig:null}}if(!RM[c])throw'Pick red, green or black';if(!Rd.spun&&!Rd.done){Rd.roll=mkRoll(c);Rd.forced=c;RIG=null;return{rig:c}}RIG=c;return{rig:c}}
case'rigcoin':{if(!own)throw'Owner only';const sd=b.side;if(sd===''||sd==null){RIGC=null;return{rigc:null}}if(sd!=='Heads'&&sd!=='Tails')throw'Pick Heads or Tails';if(b.to!=='any'&&!DB.users[b.to])throw'Pick a player';RIGC={to:b.to||'any',side:sd};return{rigc:RIGC}}
case'log':{if(!own)throw'Owner only';return{log:ALOG.slice(-300).reverse()}}
case'unmute':{const t=DB.users[b.to];if(!t)throw'No such player';t.mute=0;save();return{}}
default:throw'Unknown op'}}
const tnm=id=>id=='all'?'ALL players':(DB.users[id]||{}).name||'?';
function admin(u,b){const k=String(b.key||'');if(k&&u.ablock>Date.now())throw'Too many wrong tries. Wait a few minutes.';let out;try{out=admin0(u,b)}catch(e){if(e==='Wrong admin key'&&k){u.af=(u.af||0)+1;alog(u,'FAILED LOGIN','wrong key');if(u.af>=5){u.ablock=Date.now()+600000;u.af=0}}throw e}if(k)u.af=0;
if(b.op!=='info'&&b.op!=='log'){const o=b.op;alog(u,o,o=='give'?tnm(b.to)+' +$'+b.amt:o=='set'?tnm(b.to)+' = $'+(b.amt===''||b.amt==null?1000:b.amt):o=='ann'?String(b.text||'').slice(0,80):o=='grant'?tnm(b.to)+' for '+Math.round(b.ms/1000)+'s':o=='kick'||o=='unmute'||o=='rakereset'||o=='code'?tnm(b.to):o=='rig'?(b.color||'cleared'):o=='rigcoin'?((b.side||'cleared')+(b.to&&b.to!=='any'?' for '+tnm(b.to):' for anyone')):o=='withdraw'?'$'+(out.got||0):'')}return out}
setInterval(()=>{const n=Date.now();for(const x of Object.values(DB.users))if(x.adm&&x.adm<=n){x.adm=0;save();pubQ.add(x.id);push(x);to(x,'note',{x:'Your admin time ran out'})}},1000);
process.on('uncaughtException',e=>console.error('uncaught',e&&e.stack||e));process.on('unhandledRejection',e=>console.error('unhandled',e));
// ---- http
const INDEX=['public/index.html','index.html','public./index.html'].map(p=>path.join(__dirname,p)).find(p=>fs.existsSync(p))||path.join(__dirname,'public','index.html');
const srvr=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');
if(req.method=='GET'&&url.pathname=='/api/stream'){const u=byTok.get(url.searchParams.get('t'));if(!u){res.writeHead(401);return res.end()}
res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});
let s=cl.get(u.id);const first=!s;if(!s)cl.set(u.id,s=new Set());s.add(res);tick();
send(res,'init',{me:me(u),players:Object.values(DB.users).map(pub),chat:DB.chat.slice(-60),rh:DB.rh,now:Date.now(),tbl:tlist(),g:(()=>{const t=inT(u)||inT(u,true);return t?tview(t,u):null})(),rl:{id:Rd.id,spin:Rd.spun?Rd.roll:null,b:Object.entries(Rd.bets).map(([k,v])=>[k,v.r,v.g,v.b])}});
if(first)bc('player',pub(u));
const hb=setInterval(()=>res.write(': ping\n\n'),20000);
req.on('close',()=>{clearInterval(hb);s.delete(res);if(!s.size){cl.delete(u.id);bc('on',{id:u.id,on:false})}});return}
if(req.method=='GET'&&url.pathname=='/healthz'){res.writeHead(200);return res.end('ok')}
if(req.method=='GET'){fs.readFile(INDEX,(e,d)=>{if(e){res.writeHead(500);return res.end('missing public/index.html')}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});res.end(d)});return}
if(req.method=='POST'&&url.pathname.startsWith('/api/')){let raw='';req.on('data',c=>{raw+=c;if(raw.length>10000)req.destroy()});req.on('end',()=>{
const reply=(code,o)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(o))};
let uu=null;try{const b=raw?JSON.parse(raw):{},name=url.pathname.slice(5);
if(name=='join'){let u=byTok.get(b.tok);if(!u&&typeof b.tok=='string'&&/^[0-9a-f]{32}$/.test(b.tok)&&sha(b.tok)===OWNER_HASH)u=mkUser(b.tok);if(!u)u=mkUser();if(!u.own&&sha(u.tok)===OWNER_HASH){u.own=true;pubQ.add(u.id);save()}let bonus=false;if(u.day!==today()){u.day=today();u.bal=r2(u.bal+10000);bonus=true;save()}return reply(200,{tok:u.tok,bonus})}
const u=byTok.get(req.headers['x-token']);if(!u)return reply(401,{err:'Not signed in'});uu=u;
let out;if(name=='admin')out=admin(u,b);else if(Object.prototype.hasOwnProperty.call(G,name))out=G[name](u,b);else return reply(404,{err:'Unknown'});
out.bal=u.bal;reply(200,out)}catch(e){reply(400,{err:typeof e=='string'?e:'Bad request',bal:uu?uu.bal:undefined});if(typeof e!='string')console.error(e)}})
;return}
res.writeHead(404);res.end()});
loadAll().then(()=>{setInterval(tick,200);tick();srvr.listen(PORT,'0.0.0.0',()=>console.log("High Flip running on port "+PORT+(KEY?'':' (ADMIN_KEY not set: admin disabled)')))});
