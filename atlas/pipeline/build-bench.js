#!/usr/bin/env node
/* Build the authoring bench — a single self-contained HTML file for writing
 * the interpretive layer.
 *
 *   node pipeline/build-bench.js        # -> bench.html
 *
 * Why a tool rather than a generation pass: the gap is ~94 edges. Building a
 * generate/refute/review pipeline to produce 94 arguments would cost more than
 * writing them, and would put a model's judgement where the project's whole
 * ethic says a person's should be. Records are derived; readings are authored.
 *
 * The bench inlines the corpus and the drafts so it runs from a file:// URL
 * with no server and no network.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "corpus.json"), "utf8"));
const drafts = JSON.parse(fs.readFileSync(path.join(__dirname, "drafts.json"), "utf8")).drafts;
const readings = JSON.parse(fs.readFileSync(path.join(ROOT, "static", "readings.json"), "utf8"));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ATLAS bench — writing the readings</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400&display=swap" rel="stylesheet">
<style>
:root{--base:#0D0B0A;--lift:#17130F;--panel:#1C1714;--safe:#C87A3C;--jade:#4F6E62;
      --ox:#7A2E2C;--ink:#E8DFD3;--muted:#8A7D70;--hair:#2B231D;}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--base);color:var(--ink);
  font-family:Inter,system-ui,sans-serif}
body{display:flex;flex-direction:column}
.slate{font-family:"IBM Plex Mono",monospace;text-transform:uppercase;
  letter-spacing:.16em;font-size:10px;color:var(--muted)}
header{display:flex;align-items:baseline;gap:18px;padding:16px 24px;
  border-bottom:1px solid var(--hair);flex-wrap:wrap}
h1{font-family:Fraunces,serif;font-weight:300;letter-spacing:.2em;font-size:19px;margin:0}
.meters{display:flex;gap:22px;margin-left:auto;align-items:baseline;flex-wrap:wrap}
.meter b{font-family:Fraunces,serif;font-weight:300;font-size:20px;color:var(--ink)}
.meter.good b{color:var(--jade)} .meter.warn b{color:var(--safe)}
main{flex:1;display:flex;gap:0;min-height:0}
.stage{flex:1;display:flex;flex-direction:column;justify-content:center;
  padding:26px 30px;overflow-y:auto}
.inner{width:100%;max-width:880px;margin:0 auto}
.pairline{display:flex;align-items:flex-start;justify-content:center;gap:12px;margin-bottom:6px}
.card{width:150px;flex:none}
.cell{width:150px;height:225px;border:1px solid var(--hair);position:relative;overflow:hidden}
.cell svg{width:150px;height:225px;display:block}
.card h2{font-family:Fraunces,serif;font-weight:300;font-size:16px;line-height:1.25;margin:9px 0 2px}
.rel{flex:0 0 230px;text-align:center;padding-top:96px}
.rel .arrow{font-family:"IBM Plex Mono",monospace;color:var(--safe);font-size:12px;
  letter-spacing:.2em;text-transform:uppercase}
.rel .hint{margin-top:6px}
.claimbox{width:100%;background:rgba(0,0,0,.45);border:1px solid var(--hair);
  color:var(--ink);font-family:Fraunces,serif;font-weight:300;font-size:19px;
  line-height:1.55;padding:15px 17px;outline:none;resize:vertical;min-height:88px;margin-top:20px}
.claimbox:focus{border-color:var(--safe)}
.counter{text-align:right;margin-top:5px}
.controls{display:flex;gap:26px;margin-top:20px;flex-wrap:wrap;align-items:flex-end}
.group{display:flex;flex-direction:column;gap:7px}
.chips{display:flex;gap:6px}
.chip{background:transparent;border:1px solid var(--hair);color:var(--muted);
  font-family:"IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.12em;
  font-size:9.5px;padding:7px 10px;cursor:pointer}
.chip.on{border-color:var(--safe);color:var(--safe)}
input[type=range]{width:132px;accent-color:var(--safe)}
.actions{display:flex;gap:10px;margin-top:26px;align-items:center;flex-wrap:wrap}
button.act{background:var(--safe);color:#120D08;border:none;font-family:"IBM Plex Mono",monospace;
  text-transform:uppercase;letter-spacing:.14em;font-size:10px;padding:11px 18px;cursor:pointer}
button.ghost{background:transparent;border:1px solid var(--hair);color:var(--muted);
  font-family:"IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.14em;
  font-size:10px;padding:11px 15px;cursor:pointer}
button.ghost:hover{border-color:var(--safe);color:var(--safe)}
aside{width:310px;border-left:1px solid var(--hair);padding:22px;overflow-y:auto;
  background:linear-gradient(180deg,rgba(28,23,20,.5),rgba(13,11,10,.9))}
aside h3{margin:0 0 12px}
.row{display:flex;justify-content:space-between;padding:7px 0;
  border-bottom:1px solid var(--hair);font-family:"IBM Plex Mono",monospace;font-size:10.5px}
.row span:first-child{color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.written{margin-top:18px;font-size:12px;line-height:1.6}
.written div{padding:7px 0;border-bottom:1px solid var(--hair);color:var(--muted)}
.written b{color:var(--ink);font-weight:400}
.done{text-align:center;padding:70px 20px}
.done h2{font-family:Fraunces,serif;font-weight:300;font-size:30px}
kbd{font-family:"IBM Plex Mono",monospace;font-size:9px;border:1px solid var(--hair);
  padding:1px 5px;color:var(--muted)}
.warnbar{background:rgba(200,122,60,.13);border-top:1px solid var(--hair);
  padding:9px 24px;display:none}
</style></head><body>

<header>
  <h1>ATLAS</h1><span class="slate">the bench &mdash; writing the readings</span>
  <div class="meters">
    <div class="meter" id="m1"><span class="slate">starved films</span> <b>–</b></div>
    <div class="meter" id="m2"><span class="slate">written</span> <b>0</b></div>
    <div class="meter" id="m3"><span class="slate">edges still needed</span> <b>–</b></div>
  </div>
</header>

<main>
  <section class="stage" id="stage"></section>
  <aside>
    <h3 class="slate">why this pair</h3>
    <div id="why"></div>
    <h3 class="slate" style="margin-top:24px">keys</h3>
    <div class="row"><span>accept</span><span><kbd>⌘/Ctrl + ↵</kbd></span></div>
    <div class="row"><span>skip</span><span><kbd>Esc</kbd></span></div>
    <div class="row"><span>type</span><span><kbd>1</kbd>–<kbd>5</kbd></span></div>
    <div class="row"><span>direction</span><span><kbd>←</kbd> <kbd>↓</kbd> <kbd>→</kbd></span></div>
    <h3 class="slate" style="margin-top:24px">written this session</h3>
    <div class="written" id="log"><div>nothing yet</div></div>
  </aside>
</main>

<div class="warnbar slate" id="warn"></div>

<script>
const CORPUS = ${JSON.stringify(corpus)};
const DRAFTS = ${JSON.stringify(drafts)};
const READINGS = ${JSON.stringify(readings)};

const TYPES=[["descent","descends from","var(--safe)"],["rebuttal","argues against","var(--jade)"],
  ["convergence","converges with","var(--muted)"],["rhyme","rhymes with","var(--ox)"],
  ["hand","shares a hand with","#4A4038"]];
const F=CORPUS.films;

/* ---- graph state, recomputed after every accept so the meters are live ---- */
let written = [];
try { const s=localStorage.getItem("atlas-bench"); if(s) written=JSON.parse(s); } catch(e){}
function persist(){ try{ localStorage.setItem("atlas-bench",JSON.stringify(written)); }catch(e){
  document.getElementById("warn").style.display="block";
  document.getElementById("warn").textContent="Browser storage unavailable — export before closing this tab."; } }

const dirOf=k=>((F[k]&&F[k].director)||"?").toLowerCase();
function adjacency(){
  const a={}; Object.keys(F).forEach(k=>a[k]=new Set());
  CORPUS.edges.concat(written).forEach(e=>{ if(a[e.a])a[e.a].add(e.b); if(a[e.b])a[e.b].add(e.a); });
  return a;
}
function crossCount(a,k){ let n=0; a[k].forEach(o=>{ if(dirOf(o)!==dirOf(k)) n++; }); return n; }
function starved(){ const a=adjacency(); return Object.keys(F).filter(k=>crossCount(a,k)<4); }

/* graph distance, used to rank unproposed pairs — films three hops apart are
   far likelier to have something to say to each other than films nine apart */
function distances(from,a){
  const d={}; d[from]=0; const q=[from];
  while(q.length){ const n=q.shift();
    for(const m of a[n]) if(d[m]===undefined){ d[m]=d[n]+1; q.push(m); } }
  return d;
}

function buildQueue(){
  const a=adjacency();
  const have=new Set(CORPUS.edges.concat(written).map(e=>[e.a,e.b].sort().join("|")));
  const starve=new Set(starved());
  const out=[];

  /* 1. drafts first — an edit beats a blank field */
  DRAFTS.forEach(d=>{
    const sig=[d.a,d.b].sort().join("|");
    if(have.has(sig)) return;
    if(!F[d.a]||!F[d.b]) return;
    const value=(starve.has(d.a)?1:0)+(starve.has(d.b)?1:0);
    out.push(Object.assign({},d,{draft:true,value:value,reason:"drafted proposal"}));
  });

  /* 2. then computed pairs touching a starved film, nearest in the graph first */
  const seen=new Set(out.map(o=>[o.a,o.b].sort().join("|")));
  const cand=[];
  starve.forEach(k=>{
    const dist=distances(k,a);
    Object.keys(F).forEach(o=>{
      if(o===k||dirOf(o)===dirOf(k)) return;
      const sig=[k,o].sort().join("|");
      if(have.has(sig)||seen.has(sig)) return;
      seen.add(sig);
      const dd=dist[o]===undefined?9:dist[o];
      cand.push({a:k,b:o,type:"convergence",from:"none",strength:0.6,confidence:0.4,claim:"",
        draft:false,value:(starve.has(k)?1:0)+(starve.has(o)?1:0),dist:dd,
        reason:dd>=8?"different regions of the map":"about "+dd+" hops apart"});
    });
  });
  cand.sort((x,y)=> (y.value-x.value) || (x.dist-y.dist));
  out.sort((x,y)=> y.value-x.value);
  return out.concat(cand);
}

let queue=buildQueue(), idx=0, cur=null, skipped=new Set();

/* ---- generated cell, same grammar as the map ---- */
function h32(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function cellSVG(k){
  const f=F[k], W=104,H=156, r=h32(k)%4;
  const s=f.shadow||"#1B1512", l=f.highlight||"#D8C4A8";
  let inner="";
  if(r===0){ inner='<circle cx="52" cy="58" r="27" fill="'+l+'" opacity=".85"/><rect y="86" width="104" height="70" fill="'+s+'" opacity=".92"/><rect y="86" width="104" height="1.5" fill="'+l+'" opacity=".7"/>'; }
  else if(r===1){ for(let i=0;i<4;i++) inner+='<circle cx="52" cy="66" r="'+(13+i*12)+'" fill="none" stroke="'+l+'" stroke-width="'+(i===1?2.2:.9)+'" opacity="'+(0.72-i*0.14)+'"/>'; inner+='<rect y="115" width="104" height="41" fill="'+s+'" opacity=".85"/>'; }
  else if(r===2){ for(let i=1;i<7;i+=2) inner+='<rect x="'+(i*15)+'" y="'+(30+i*4)+'" width="11" height="126" fill="'+l+'" opacity=".3"/>'; inner+='<rect y="122" width="104" height="34" fill="'+s+'" opacity=".7"/>'; }
  else { inner='<circle cx="46" cy="62" r="31" fill="'+l+'" opacity=".8"/><circle cx="59" cy="68" r="31" fill="'+s+'"/><rect y="104" width="104" height="52" fill="'+s+'" opacity=".9"/><rect y="104" width="104" height="1.2" fill="'+l+'" opacity=".5"/>'; }
  for(let i=0;i<4;i++) inner+='<rect x="8" y="'+(140-i*5)+'" width="'+(30+i*13)+'" height="1.2" fill="'+l+'" opacity=".2"/>';
  return '<svg width="'+W+'" height="'+H+'" viewBox="0 0 104 156"><defs><linearGradient id="g'+h32(k)+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+s+'"/><stop offset="1" stop-color="#0D0B0A"/></linearGradient></defs><rect width="104" height="156" fill="url(#g'+h32(k)+')"/>'+inner+'</svg>';
}

function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function render(){
  const stage=document.getElementById("stage");
  const st=starved();
  document.querySelector("#m1 b").textContent=st.length;
  document.querySelector("#m1").className="meter "+(st.length===0?"good":"warn");
  document.querySelector("#m2 b").textContent=written.length;
  const a0=adjacency();
  const deficit=Object.keys(F).reduce((n,k)=>n+Math.max(0,4-crossCount(a0,k)),0);
  document.querySelector("#m3 b").textContent=Math.ceil(deficit/2);
  document.querySelector("#m3").className="meter "+(deficit===0?"good":"warn");

  while(idx<queue.length && skipped.has([queue[idx].a,queue[idx].b].sort().join("|"))) idx++;
  cur=queue[idx];

  if(!cur){ stage.innerHTML='<div class="done"><h2>Queue empty.</h2><p class="slate">'+written.length+' readings written.</p><button class="act" onclick="exportJSON()">Export readings.json</button></div>'; return; }

  const A=F[cur.a], B=F[cur.b];
  stage.innerHTML='<div class="inner">'+
   '<div class="pairline">'+
     '<div class="card"><div class="cell">'+cellSVG(cur.a)+'</div><h2>'+esc(A.title)+'</h2>'+
       '<div class="slate">'+A.year+' &middot; '+esc((A.director||"").split(",")[0])+'</div></div>'+
     '<div class="rel"><div class="arrow" id="arrow">—</div>'+
       '<div class="slate hint" id="typelabel"></div></div>'+
     '<div class="card"><div class="cell">'+cellSVG(cur.b)+'</div><h2>'+esc(B.title)+'</h2>'+
       '<div class="slate">'+B.year+' &middot; '+esc((B.director||"").split(",")[0])+'</div></div>'+
   '</div>'+
   '<textarea class="claimbox" id="claim" maxlength="150" placeholder="Name the specific formal link. A technique, a structural device, a recurring motif, a stated influence. Not a mood.">'+esc(cur.claim||"")+'</textarea>'+
   '<div class="slate counter" id="count"></div>'+
   '<div class="controls">'+
     '<div class="group"><span class="slate">relationship</span><div class="chips" id="types"></div></div>'+
     '<div class="group"><span class="slate">direction</span><div class="chips" id="dirs"></div></div>'+
     '<div class="group"><span class="slate">formal bond <b id="sv"></b></span><input type="range" id="strength" min="20" max="95" value="'+Math.round(cur.strength*100)+'"></div>'+
     '<div class="group"><span class="slate">confidence <b id="cv"></b></span><input type="range" id="confidence" min="10" max="95" value="'+Math.round(cur.confidence*100)+'"></div>'+
   '</div>'+
   '<div class="actions">'+
     '<button class="act" onclick="accept()">Accept</button>'+
     '<button class="ghost" onclick="skip()">Skip</button>'+
     '<button class="ghost" onclick="never()">Never pair these</button>'+
     '<button class="ghost" style="margin-left:auto" onclick="exportJSON()">Export</button>'+
   '</div></div>';

  const tw=document.getElementById("types");
  TYPES.forEach(([id,label],i)=>{ const b=document.createElement("button");
    b.className="chip"+(cur.type===id?" on":""); b.textContent=(i+1)+" "+label;
    b.onclick=()=>{cur.type=id;paint();}; tw.appendChild(b); });
  const dw=document.getElementById("dirs");
  [["in","← shaped by"],["none","↓ neither"],["out","→ shaped it"]].forEach(([id,label])=>{
    const b=document.createElement("button"); b.className="chip"+(dirFor()===id?" on":"");
    b.textContent=label; b.onclick=()=>{setDir(id);paint();}; dw.appendChild(b); });

  document.getElementById("strength").oninput=e=>{cur.strength=e.target.value/100;paint();};
  document.getElementById("confidence").oninput=e=>{cur.confidence=e.target.value/100;paint();};
  document.getElementById("claim").oninput=e=>{cur.claim=e.target.value;paint();};

  document.getElementById("why").innerHTML=
    '<div class="row"><span>reason queued</span><span>'+cur.reason+'</span></div>'+
    '<div class="row"><span>'+esc(A.title.slice(0,17))+'</span><span>'+crossCount(adjacency(),cur.a)+' / 4 cross</span></div>'+
    '<div class="row"><span>'+esc(B.title.slice(0,17))+'</span><span>'+crossCount(adjacency(),cur.b)+' / 4 cross</span></div>'+
    '<div class="row"><span>gap</span><span>'+Math.abs((A.year||0)-(B.year||0))+' years</span></div>'+
    (cur.draft?'<div class="row"><span>origin</span><span style="color:var(--safe)">drafted — edit or reject</span></div>':'');

  paint();
  document.getElementById("claim").focus();
  renderLog();
}

function dirFor(){ return cur.from==="a"?(cur.aIsSeed===false?"in":"out"):cur.from==="b"?"in":"none"; }
function setDir(d){ cur.from = d==="none"?"none":(d==="out"?"a":"b"); }

function paint(){
  const t=TYPES.find(t=>t[0]===cur.type)||TYPES[2];
  document.getElementById("arrow").textContent =
    cur.from==="a"?"———▶":cur.from==="b"?"◀———":"———";
  document.getElementById("arrow").style.color=t[2];
  document.getElementById("typelabel").textContent=t[1];
  document.getElementById("sv").textContent=Math.round(cur.strength*100)+"%";
  document.getElementById("cv").textContent=Math.round(cur.confidence*100)+"%"+(cur.confidence<0.5?" · reading":"");
  const n=(cur.claim||"").length;
  document.getElementById("count").textContent=n+" / 150"+(n>0&&n<25?"  — too thin to be a claim":"");
  [...document.querySelectorAll("#types .chip")].forEach((b,i)=>b.classList.toggle("on",TYPES[i][0]===cur.type));
  [...document.querySelectorAll("#dirs .chip")].forEach((b,i)=>
    b.classList.toggle("on",["in","none","out"][i]===(cur.from==="a"?"out":cur.from==="b"?"in":"none")));
}

function accept(){
  const c=(cur.claim||"").trim();
  if(c.length<25){ document.getElementById("claim").focus();
    document.getElementById("warn").style.display="block";
    document.getElementById("warn").textContent="A claim under 25 characters is not naming anything. Write it or skip the pair.";
    setTimeout(()=>document.getElementById("warn").style.display="none",2600); return; }
  written.push({a:cur.a,b:cur.b,type:cur.type,from:cur.from,
    strength:+cur.strength.toFixed(2),confidence:+cur.confidence.toFixed(2),claim:c});
  persist(); idx++; queue=buildQueue().filter(q=>!written.some(w=>[w.a,w.b].sort().join("|")===[q.a,q.b].sort().join("|")));
  idx=0; render();
}
function skip(){ idx++; render(); }
function never(){ skipped.add([cur.a,cur.b].sort().join("|")); idx++; render(); }

function renderLog(){
  const l=document.getElementById("log");
  if(!written.length){ l.innerHTML="<div>nothing yet</div>"; return; }
  l.innerHTML=written.slice().reverse().slice(0,14).map(w=>
    '<div><b>'+esc(F[w.a].title)+'</b> '+w.type+' <b>'+esc(F[w.b].title)+'</b></div>').join("");
}

function exportJSON(){
  const merged=JSON.parse(JSON.stringify(READINGS));
  const have=new Set(merged.edges.map(e=>[e.a,e.b].sort().join("|")+e.type));
  written.forEach(w=>{ const k=[w.a,w.b].sort().join("|")+w.type; if(!have.has(k)){merged.edges.push(w);have.add(k);} });
  const blob=new Blob([JSON.stringify(merged,null,1)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="readings.json"; a.click();
}

document.addEventListener("keydown",e=>{
  if(!cur) return;
  const inBox=document.activeElement&&document.activeElement.id==="claim";
  if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){ e.preventDefault(); accept(); return; }
  if(e.key==="Escape"){ e.preventDefault(); skip(); return; }
  if(inBox) return;
  if(e.key>="1"&&e.key<="5"){ cur.type=TYPES[+e.key-1][0]; paint(); }
  if(e.key==="ArrowLeft"){ setDir("in"); paint(); }
  if(e.key==="ArrowRight"){ setDir("out"); paint(); }
  if(e.key==="ArrowDown"){ setDir("none"); paint(); }
});

render();
</script></body></html>`;

fs.writeFileSync(path.join(ROOT, "bench.html"), html);
console.log("wrote bench.html (" + Math.round(html.length / 1024) + " kB)");
console.log("drafts queued : " + drafts.length);
console.log("open it directly in a browser — no server, no network, no key");
