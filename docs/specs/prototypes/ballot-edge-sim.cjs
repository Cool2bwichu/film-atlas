const c = require('/home/user/film-atlas/atlas/static/corpus.json');
const m = require('/home/user/film-atlas/atlas/pipeline/out/sightsound-2022/matched-director-edges.json');
const F = c.films, KEYS = Object.keys(F);
const keyById = {}; for (const [k,f] of Object.entries(F)) keyById[f.filmId]=k;
const byDir = {};
for (const [k,f] of Object.entries(F)) if (f.director)
  for (const d of f.director.split(/,| and /).map(s=>s.trim())) (byDir[d]=byDir[d]||[]).push(k);

// ── anchor rule: the voter's latest corpus film as of the ballot (year <= 2022), tie alpha
const hands = k => (F[k].director||'').split(/,| and /).length;
const anchorOf = v => {
  // a hand, not an omnibus: films with at most 3 credited directors
  const own = (byDir[v]||[]).filter(k => hands(k) <= 3);
  if (!own.length) return null;                    // ledger-only voter
  const before = own.filter(k => (F[k].year||0) <= 2022);
  const pool = before.length ? before : own;       // Haigh: All of Us Strangers, 2023
  pool.sort((a,b) => (F[b].year||0)-(F[a].year||0) || (a<b?-1:1));
  return pool[0];
};

const votersB = {};
for (const e of m.edges) (votersB[e.voter]=votersB[e.voter]||[]).push(e);

const pairKey = (a,b)=>[a,b].sort().join('||');
const existingPairs = new Map();
c.edges.forEach((e,i)=>existingPairs.set(pairKey(e.a,e.b), i));

const ballotEdges = []; let merged = 0, selfv = 0;
for (const [v, votes] of Object.entries(votersB)) {
  const anchor = anchorOf(v); if (!anchor) continue;
  for (const vote of votes) {
    const target = keyById[vote.filmId]; if (!target || target===anchor) { if(target===anchor) selfv++; continue; }
    const pk = pairKey(anchor, target);
    if (existingPairs.has(pk)) { merged++; continue; } // lands as `also` on the standing edge
    ballotEdges.push({ a:anchor, b:target, type:'hand', from:'a', strength:0.55, confidence:1,
      source:'record', signal:'ballot', attribution:v,
      claim:`${v} named ${F[target].title} among the ten films of ${v.includes('Chantal')?'her':'their'} 2022 Sight & Sound ballot.` });
  }
}
console.log('single-anchor ballot edges:', ballotEdges.length, '· merged into standing edges:', merged, '· self-votes skipped:', selfv);

// degree deltas
const deg = {}; KEYS.forEach(k=>deg[k]=0);
c.edges.forEach(e=>{ if(deg[e.a]!=null)deg[e.a]++; if(deg[e.b]!=null)deg[e.b]++; });
const deg2 = {...deg};
ballotEdges.forEach(e=>{deg2[e.a]++;deg2[e.b]++;});
const worst = KEYS.map(k=>[k,deg[k],deg2[k]]).sort((a,b)=>(b[2]-b[1])-(a[2]-a[1])).slice(0,6);
console.log('largest degree gains:', worst.map(x=>`${x[0]} ${x[1]}->${x[2]}`).join(' | '));
const all = KEYS.map(k=>deg2[k]); const mean = all.reduce((s,x)=>s+x,0)/all.length;
const sd = Math.sqrt(all.reduce((s,x)=>s+(x-mean)**2,0)/all.length);
console.log(`degree after: mean ${mean.toFixed(2)} max ${Math.max(...all)} CV ${(sd/mean).toFixed(3)} (was mean 20.16 max 41 CV 0.146)`);

// ── connections() replica
const SIGNAL_WEIGHT = { adaptation:1.00, sameAuthor:0.96, keyword:0.88, movement:0.80, setting:0.72,
  subject:0.66, crew:0.60, studio:0.50, genre:0.26, cast:0.24, countryEra:0.13, genreEra:0.12, ballot:0.62 };
const sigWeight = e => e.source && e.source!=='record' ? 1.0 : (SIGNAL_WEIGHT[e.signal] ?? 0.5);

const E2 = c.edges.concat(ballotEdges);
const ADJ = {}; KEYS.forEach(k=>ADJ[k]=[]);
E2.forEach((e,i)=>{ if(ADJ[e.a]&&ADJ[e.b]){ADJ[e.a].push(i);ADJ[e.b].push(i);} });

function connections(key, limit, exclude, ballotCap=Infinity){
  const skip = new Set(exclude||[]);
  const seedYear = F[key].year||0, seedDir = F[key].director||'';
  const scored = ADJ[key].map(i=>{
    const e=E2[i], other = e.a===key?e.b:e.a;
    if (skip.has(other)||!F[other]) return null;
    let s=(e.strength||0)*sigWeight(e);
    const o=F[other];
    if (o.director && o.director===seedDir) s*=0.55;
    if (Math.abs((o.year||0)-seedYear)<8) s*=0.9;
    return {key:other,e,score:s};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  const out=[], dirCount={}, sigCount={}, claimCount={};
  const sigOf = c => (c.e.source&&c.e.source!=='record')?'authored':(c.e.signal||c.e.type);
  const dirOK = c => (dirCount[F[c.key].director]||0)<2;
  const capOK = c => c.e.signal!=='ballot' || out.filter(x=>x.e.signal==='ballot').length < ballotCap;
  const take = c => { out.push(c); const d=F[c.key].director; dirCount[d]=(dirCount[d]||0)+1;
    sigCount[sigOf(c)]=(sigCount[sigOf(c)]||0)+1; claimCount[c.e.claim]=(claimCount[c.e.claim]||0)+1; };
  const CLAIM_DECAY=1.0, SIGNAL_DECAY=0.2;
  const fill = test => { while(out.length<limit){ let best=null,bestScore=-1;
    for (const c of scored){ if (out.indexOf(c)>=0||!test(c)||!capOK(c)) continue;
      const nc=claimCount[c.e.claim]||0, ns=sigCount[sigOf(c)]||0;
      const s = sigOf(c)==='authored'? c.score/(1+nc*CLAIM_DECAY) : c.score/((1+nc*CLAIM_DECAY)*(1+ns*SIGNAL_DECAY));
      if (s>bestScore){bestScore=s;best=c;} }
    if(!best)break; take(best); } };
  fill(dirOK); fill(()=>true);
  return out;
}

const touched = new Set(); ballotEdges.forEach(e=>{touched.add(e.a);touched.add(e.b);});
let flood={}, capped={};
for (const k of touched){
  const n = connections(k,6,[k]).filter(x=>x.e.signal==='ballot').length;
  flood[n]=(flood[n]||0)+1;
  const nc = connections(k,6,[k],1).filter(x=>x.e.signal==='ballot').length;
  capped[nc]=(capped[nc]||0)+1;
}
console.log('ballot doors per touched map, uncapped:', flood, '· capped at 1:', capped);
for (const probe of ['citizen kane','vertigo','parasite','the irishman','memories of murder']) {
  if (!F[probe]) continue;
  const ring = connections(probe,6,[probe]);
  console.log(probe, '->', ring.map(x=>`${x.key}${x.e.signal==='ballot'?' [BALLOT '+x.e.attribution+']':''}`).join(' · '));
}

// ── wall negative control: what if ballots were source:"attested"
function claimScore(edges){
  const ADJx={}; KEYS.forEach(k=>ADJx[k]=[]);
  edges.forEach((e,i)=>{ if(ADJx[e.a]&&ADJx[e.b]){ADJx[e.a].push(i);ADJx[e.b].push(i);} });
  const CS={};
  for (const k of KEYS){ const q=[];
    for (const i of ADJx[k]){ const e=edges[i]; if(!e.source||e.source==='record')continue;
      const cf=Number.isFinite(e.confidence)?e.confidence:0.4; q.push((e.strength||0)*cf); }
    q.sort((x,y)=>y-x); let s=0; for(let i=0;i<q.length;i++)s+=q[i]/2**i; CS[k]=s; }
  return CS;
}
const base = claimScore(c.edges);
const attested = claimScore(c.edges.concat(ballotEdges.map(e=>({...e, source:'attested'}))));
const recordv = claimScore(E2);
let movedA=0, movedR=0;
for (const k of KEYS){ if (Math.abs(attested[k]-base[k])>1e-9) movedA++; if (Math.abs(recordv[k]-base[k])>1e-9) movedR++; }
const headOf = CS => KEYS.slice().sort((a,b)=>(CS[b]-CS[a])||(a<b?-1:1)).slice(0,120);
const h0=new Set(headOf(base)), hA=new Set(headOf(attested));
let headChurn=0; for (const k of hA) if(!h0.has(k)) headChurn++;
console.log(`wall control — as attested: ${movedA} films' CLAIM_SCORE moves, head churn ${headChurn}/120 · as record: ${movedR} films move (must be 0)`);
