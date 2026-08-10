#!/usr/bin/env node
/* Build the single-file app.
 *   node app/build.js [--corpus path] [--discovery path] [--films 0]
 *                     [--degree 12] [--out atlas.html] [--origin URL]
 * --films 0 keeps the whole corpus. Any other number packs a subset for a
 * size-limited target such as a publishable artifact.
 *
 * --origin bakes the canonical/OG absolute URLs in at BUILD time. The Cloudflare
 * worker substitutes __ATLAS_ORIGIN__ per request instead, because it knows the
 * origin it was reached on; a static host such as GitHub Pages has nothing that
 * can do that, so the placeholder would otherwise ship verbatim into the meta
 * tags. Omit the flag and the placeholder is left untouched, which is exactly
 * what the worker path wants.
 */
"use strict";

const fs=require("fs"), path=require("path"), os=require("os"), cp=require("child_process");
const {canonicalJson,contentVersion,layoutVersionFor,projectDiscovery,validateDiscovery}=
  require("../pipeline/discovery-contract.js");
const {LAYOUT_ALGORITHM_VERSION,layout}=require("./layout-sky.js");
const {STRATA_LAYOUT_VERSION,strataLayouts}=require("./layout-strata.js");
const {isTrivia}=require("../pipeline/claim-tiers.js");
const {packAttributes,RUNTIME_VERSION}=require("./query-runtime.js");
const ROOT=path.join(__dirname,"..");
const arg=(n,d)=>{
  const flag="--"+n,i=process.argv.indexOf(flag);
  if(i<0) return d;
  const value=process.argv[i+1];
  if(value===undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
};
const FILMS=arg("films","0"), DEG=arg("degree","12"), OUT=arg("out",path.join(ROOT,"atlas.html"));
const CORPUS_PATH=path.resolve(arg("corpus",path.join(ROOT,"static","corpus.json")));
const DISCOVERY_PATH=path.resolve(arg("discovery",path.join(ROOT,"static","discovery.json")));
const ORIGIN=arg("origin",null);
if(ORIGIN!==null && !/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(ORIGIN)){
  throw new Error(`--origin must be an absolute http(s) URL, received: ${ORIGIN}`);
}

const TYPES=new Set(["descent","rebuttal","convergence","rhyme","hand"]);
const SOURCES=new Set(["record","attested","reading"]);

function assertCorpus(corpus){
  if(!corpus || !corpus.films || !Array.isArray(corpus.edges)){
    throw new Error("Atlas corpus must contain a films object and an edges array");
  }
  if(corpus.meta?.schemaVersion!==2 || !/^identity-[0-9a-f]{16}$/.test(corpus.meta.identityVersion||"") ||
      !/^corpus-[0-9a-f]{16}$/.test(corpus.meta.corpusVersion||"")){
    throw new Error("Atlas corpus must contain valid schema 2 identity and corpus metadata");
  }
  const keys=new Set(Object.keys(corpus.films));
  if(!keys.size) throw new Error("Atlas corpus contains no films");
  const filmIds=new Set();
  for(const [key,film] of Object.entries(corpus.films)){
    if(!film.title) throw new Error(`${key}: missing title`);
    if(!/^film-[0-9a-f]{16}$/.test(film.filmId||"")) throw new Error(`${key}: invalid permanent film ID`);
    if(filmIds.has(film.filmId)) throw new Error(`${key}: duplicate permanent film ID ${film.filmId}`);
    filmIds.add(film.filmId);
    if(!/^Q\d+$/.test(film.qid||"")) throw new Error(`${key}: invalid canonical Wikidata QID`);
    for(const field of ["shadow","highlight"]){
      if(!/^#[0-9a-f]{6}$/i.test(film[field]||"")){
        throw new Error(`${key}: invalid ${field} colour`);
      }
    }
  }
  for(const [index,edge] of corpus.edges.entries()){
    if(!keys.has(edge.a)||!keys.has(edge.b)) throw new Error(`edge ${index}: unknown film endpoint`);
    if(edge.a===edge.b) throw new Error(`edge ${index}: self edge on ${edge.a}`);
    if(!TYPES.has(edge.type)) throw new Error(`edge ${index}: unknown type ${edge.type}`);
    if(edge.source && !SOURCES.has(edge.source)) throw new Error(`edge ${index}: unknown source ${edge.source}`);
    if(!edge.claim || edge.claim.trim().length<12) throw new Error(`edge ${index}: claim is missing or too thin`);
    if(!Number.isFinite(edge.strength)) throw new Error(`edge ${index}: invalid strength`);
  }
}

function assertCorpusDiscoveryAgreement(corpus,discovery){
  assertCorpus(corpus);
  validateDiscovery(discovery,{
    corpusVersion:corpus.meta.corpusVersion,
    corpusVersionContext:"the supplied corpus metadata",
  });
  if(discovery.identityVersion!==corpus.meta.identityVersion){
    throw new Error("Discovery identityVersion does not match the supplied corpus metadata");
  }
  const corpusFilmIds=Object.values(corpus.films).map(film=>film.filmId);
  if(canonicalJson(corpusFilmIds.slice().sort())!==canonicalJson(discovery.filmOrder.slice().sort())){
    throw new Error("Discovery filmOrder does not match the supplied corpus permanent film IDs");
  }
  for(const [key,film] of Object.entries(corpus.films)){
    if(discovery.keyByFilmId[film.filmId]!==key){
      throw new Error(`Discovery keyByFilmId does not match corpus for permanent film ID ${film.filmId}`);
    }
  }
  for(const filmId of discovery.filmOrder){
    const key=discovery.keyByFilmId[filmId];
    if(!corpus.films[key] || corpus.films[key].filmId!==filmId){
      throw new Error(`Discovery permanent film ID ${filmId} does not resolve to the supplied corpus`);
    }
  }
}

const sourceCorpus=JSON.parse(fs.readFileSync(CORPUS_PATH,"utf8"));
const sourceDiscovery=JSON.parse(fs.readFileSync(DISCOVERY_PATH,"utf8"));
assertCorpusDiscoveryAgreement(sourceCorpus,sourceDiscovery);

let corpus,discovery;
if(FILMS==="0"){
  const films={};
  for(const [k,f] of Object.entries(sourceCorpus.films)){
    films[k]={title:f.title,year:f.year,director:f.director,shadow:f.shadow,highlight:f.highlight,
      poster:f.poster||null,description:f.description||"",wikipedia:f.wikipedia||null,
      paletteSource:f.paletteSource,posterLicence:f.posterLicence||"unknown",
      filmId:f.filmId,qid:f.qid};
  }
  /* `signal` is what KIND of overlap produced the edge, and the app ranks by
     it — dropping it here silently made every edge weight the same, which is
     how genre-and-era trivia kept winning.

     `also` is the same class of mistake, one step further on. associate.js
     writes every runner-up claim for a pair; a pair that connects through crew
     often ALSO connects through keyword, setting or studio, and those claims
     are computed, written to corpus.json, and then dropped here. On a site
     whose whole thesis is that the connection is the product, that is the most
     expensive line in the build.

     A caveat that belongs next to the field, not in a commit message: these are
     by construction the claims that LOST the pair contest, and unlike the
     primary claim they have never been read. measure-claims.js scores only the
     primary, so anything that renders them can make what a reader sees worse
     while every published number holds flat. Read sampled alternates before
     showing them. `alsoRecord` is carried for the same reason: when a reading
     supersedes a record on a pair, the derived claim it displaced is still
     true and still worth being able to show.

     Measured before shipping them, which changed the design: of 22,949
     alternates, 69.3% are trivia — countryEra 29.3%, genre 24.2%, cast 9.5% —
     against 23.3% in what a reader sees today. Shipping the field whole would
     have roughly tripled a reader's trivia exposure and cost +23% gzip to do
     it. The informative 30.7% is the part worth carrying, so trivia alternates
     are dropped here rather than filtered in the app: an alternate nobody
     should render is weight in every download. */
  const edges=sourceCorpus.edges.map(e=>{
    const also=(e.also||[]).filter(x=>!isTrivia(x.signal));
    return {a:e.a,b:e.b,type:e.type,strength:e.strength,
      confidence:e.confidence,source:e.source,claim:e.claim,signal:e.signal||null,
      attribution:e.attribution||null,
      also:also.length?also:null,
      alsoRecord:e.alsoRecord||null};
  });
  corpus={meta:{...sourceCorpus.meta},films,edges};
  discovery=sourceDiscovery;
}else{
  const tmp=path.join(os.tmpdir(),`atlas-packed-${process.pid}-${Date.now()}.json`);
  /* execFileSync, not execSync: the shell form interpolated ROOT unquoted and
     broke outright whenever the checkout path contained a space. Passing argv
     directly means the path never goes through word splitting at all. */
  try{
    cp.execFileSync("node",[path.join(ROOT,"pipeline","pack-corpus.js"),
      "--corpus",CORPUS_PATH,"--films",FILMS,"--degree",DEG,"--desc","190","--out",tmp],
      {stdio:"inherit"});
  }catch(error){
    try{fs.rmSync(tmp,{force:true});}catch{/* best-effort cleanup */}
    throw error;
  }
  const p=JSON.parse(fs.readFileSync(tmp,"utf8"));
  fs.rmSync(tmp,{force:true});
  if(p.v!==2) throw new Error(`Packed corpus schema ${p.v} does not preserve discovery identity`);
  const films={},keys=[];
  for(const f of p.films){
    keys.push(f[0]);
    films[f[0]]={title:f[1],year:f[2]||null,director:f[3]>=0?p.directors[f[3]]:"",
      shadow:f[4],highlight:f[5],poster:f[6]?f[6].replace("~",p.posterPrefix):null,
      description:f[7]||"",wikipedia:null,
      paletteSource:f[8]===1?"poster":f[8]===2?"curated":"era",
      filmId:f[9],qid:f[10],posterLicence:f[11]||"unknown"};
  }
  const edges=p.edges.map(e=>({a:keys[e[0]],b:keys[e[1]],type:p.types[e[2]],
    strength:e[4],confidence:null,source:p.sources[e[6]],claim:e[7],
    signal:e[8]>=0?p.signals[e[8]]:null}));
  corpus={meta:{...p.meta},films,edges};
  const retainedFilmIds=Object.values(films).map(film=>film.filmId);
  const sampleLayoutBasis=contentVersion("sample",{
    solver:LAYOUT_ALGORITHM_VERSION,
    sourceLayoutVersion:sourceDiscovery.layoutVersion,
    retainedFilmIds:retainedFilmIds.slice().sort(),
    edges:edges.map(edge=>[edge.a,edge.b,edge.type,edge.strength]),
  });
  discovery=projectDiscovery(sourceDiscovery,retainedFilmIds,sampleLayoutBasis);
}

assertCorpusDiscoveryAgreement(corpus,discovery);

/* THE CONSTELLATION'S LAYOUT IS SOLVED HERE, ONCE.
 * A force solve over 803 films and 7,759 edges is a second of build and two
 * numbers per film on the wire; the same solve in the browser is a multi-second
 * freeze on a phone the first time anyone opens the view. It is also what makes
 * the constellation deterministic in the sense the rest of the project already
 * is — the same corpus draws the same sky twice, so "it is over on the left"
 * means something to a second person.
 *
 * app/layout-sky.js is Fruchterman-Reingold with global Barnes-Hut repulsion.
 * It is called with films and edges and NOTHING ELSE — no degree, no ranking,
 * no popularity — because AGENTS rule 1 makes rendered distance a statement
 * about bond strength alone. Both build paths below feed it the same shape,
 * so the packed subset gets a layout solved over its own edges rather than a
 * slice of the full-corpus one. */
const legacyPositions=layout(corpus.films,corpus.edges);
const positions={};
for(const filmId of discovery.filmOrder){
  const key=discovery.keyByFilmId[filmId],position=legacyPositions[key];
  if(!Array.isArray(position) || position.length!==2 || position.some(value=>!Number.isFinite(value))){
    throw new Error(`Layout is missing a valid position for permanent film ID ${filmId}`);
  }
  positions[filmId]=position;
}
if(Object.keys(positions).length!==Object.keys(corpus.films).length){
  throw new Error("Layout position count does not match the supplied corpus");
}
/* ONE MORE CONSTELLATION PER STRATUM, SO NARROWING RE-FORMS THE SKY.
 * Same solver, same rules, run again over each stratum's own films and only
 * the edges with both ends inside it. Costs ~9s of build and ~54 KB on the
 * wire; the alternative is a 1.9-second freeze on every click of the most-used
 * filter in the app, on a desktop, and worse on a phone. The full argument,
 * with the measurements, is at the top of layout-strata.js. */
const {strata,report:strataReport}=strataLayouts(corpus,discovery);

/* ══ THE TRANSPORT ═══════════════════════════════════════════════════════════
 * The atlas is a century laid out left to right and it has never been played.
 * The view now has a footage track and a playhead; running it draws films as
 * they were made and connections as they became makeable. Everything the run
 * needs that the shipped corpus does not already carry is computed here, once.
 *
 * WHAT IS BAKED AND WHAT IS NOT. Years are already on every film and the
 * ordering is a sort, so neither ships — app/template.html builds those index
 * arrays lazily, the first time somebody actually touches the track, which is
 * why the resting atlas pays nothing at all for this feature. What ships is
 * the four things the runtime cannot recompute or should not:
 *
 *   1. THE PEN DIRECTION. `edge.from` names which end of a typed argument the
 *      claim runs OUT OF, and it is dropped from the shipped corpus by both
 *      build paths above. It is 425 edges of 22,217 — descent and rebuttal —
 *      so it ships as two index lists rather than a mostly-zero array.
 *   2. THE YEAR'S MEASURED COLOUR, which needs every poster palette in the
 *      corpus and an adaptive window over them. See the block below.
 *   3. THE CENSUS, so the track can print the corpus's own rhythm without a
 *      pass over 2,204 films on the first paint.
 *   4. THE NEIGHBOURHOOD RESIDUAL — one float per film, the graft named in
 *      docs/specs/visual-architecture-decision.md.
 */

/* ── WHICH WAY A TYPED ARGUMENT TRAVELS, AND WHEN THE CORPUS DOES NOT SAY ────
 * `edge.from` names the end a claim runs OUT OF and it has THREE values, not
 * two: "a", "b" and **"none"**. 82 of the 315 descent edges carry "none" — the
 * associator produced the relationship without establishing which film is the
 * ancestor — and the prototype this was designed from read `from === "a" ? a :
 * b`, which silently turns every one of those into "b" and invents a direction
 * for a quarter of the descents. Its headline 80.6% is that mistake measured.
 *
 * So the rule here is the project's own: an argument is drawn in the direction
 * the corpus RECORDS it running, and drawn symmetrically — out from the middle
 * to both ends — when the corpus does not record one. Nothing is guessed from
 * the years, because guessing the direction from the years and then reporting
 * how often the direction agrees with the years would be a tautology printed as
 * a measurement.
 *
 * Measured over the edges that DO carry a direction, which is what the app's
 * key prints together with how many of them there are:
 *
 *     descent      233 of 315 directed, 94.0% of those run forward in time
 *     rebuttal     110 of 110 directed, 88.2% of those reach back
 *     convergence   22 of 7,584   rhyme 9 of 2,178   hand 0 of 12,030
 *
 * The three symmetric types are symmetric because the corpus almost never says
 * otherwise, which is a better reason than a coin flip and is the reason the
 * key gives. Only descent and rebuttal are treated as directed at all: a
 * `convergence` is two films arriving at the same place independently, and a
 * direction on twenty-two of seven thousand of them is noise, not a finding. */
const TRANSPORT_DIRECTED=new Set(["descent","rebuttal"]);
const transportFrom=new Map();
for(const e of sourceCorpus.edges) transportFrom.set(e.a+" "+e.b, e.from);
const penA=[],penB=[];
const tenseCount={},tenseDirected={},tenseFwd={};
for(const [index,e] of corpus.edges.entries()){
  const from=transportFrom.get(e.a+" "+e.b);
  const ya=corpus.films[e.a].year, yb=corpus.films[e.b].year;
  tenseCount[e.type]=(tenseCount[e.type]||0)+1;
  const directed = from==="a"||from==="b";
  if(directed && Number.isFinite(ya) && Number.isFinite(yb)){
    tenseDirected[e.type]=(tenseDirected[e.type]||0)+1;
    /* "Forward" means the pen ends on the LATER film. */
    if(from==="a" ? yb>ya : ya>yb) tenseFwd[e.type]=(tenseFwd[e.type]||0)+1;
  }
  if(!TRANSPORT_DIRECTED.has(e.type) || !directed) continue;
  if(from==="b") penB.push(index); else penA.push(index);
}
const tense={};
for(const type of ["descent","rebuttal","convergence","rhyme","hand"]){
  const n=tenseCount[type]||0, directed=tenseDirected[type]||0;
  tense[type]={
    n, directed,
    /* null rather than 0 when nothing is directed: "no recorded direction" and
       "never runs forward" are different sentences and the readout says the
       first one. */
    forward: directed ? +((tenseFwd[type]||0)/directed).toFixed(4) : null,
    /* Whether the app draws this type with an arrow at all. */
    drawn: TRANSPORT_DIRECTED.has(type),
  };
}

/* ── THE YEAR'S MEASURED COLOUR ──────────────────────────────────────────────
 * DESIGN.md, "Colour at field scale is a data channel": a film provides the
 * colour when a film is in hand, and at field scale colour must carry the
 * stratum. Under the transport the stratum is the YEAR, so the room takes the
 * year's colour and no disc ever does — AGENTS rule 5 is untouched, the disc
 * stays the film's own measured highlight.
 *
 * FOUR THINGS MAKE THIS A MEASUREMENT RATHER THAN A RAMP, and the readout
 * prints the numbers so it can be checked instead of believed:
 *
 *  - POSTER-MEASURED FILMS ONLY. 1,982 of 2,204. A film whose palette came
 *    from an era default cannot be evidence about its era; including them
 *    would be the interface measuring its own assumption.
 *  - AN ADAPTIVE WINDOW to at least 70 prints, so 1916 — one film — is not
 *    allowed to name a colour for 1916.
 *  - EMPIRICAL-BAYES SHRINK toward the corpus mean by n/(n+45), so a thin year
 *    is pulled back to the middle rather than shouting.
 *  - CHROMA AMPLIFIED, HUE NEVER ROTATED. This is the exact inverse of the
 *    mistake DESIGN.md records for the registers, and deliberately so. There,
 *    chroma gain clipped and collapsed four doors onto one hue, so the fix was
 *    to rotate an authored hue to a measured angle. Here there is nothing
 *    authored to rotate: the hue IS the measurement and the only authored
 *    quantity is how far the difference is pushed. The gain is stated on
 *    screen as authored, every time it is on screen.
 */
const OK_GAIN=3.6, OK_L=0.745, OK_CCAP=0.155, OK_NMIN=70, OK_SHRINK=45;
const srgbToLin=c=>{c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);};
const linToSrgb=c=>{c=c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055;
  return Math.max(0,Math.min(255,Math.round(c*255)));};
function hexToOklab(hex){
  const r=srgbToLin(parseInt(hex.slice(1,3),16)),g=srgbToLin(parseInt(hex.slice(3,5),16)),
        b=srgbToLin(parseInt(hex.slice(5,7),16));
  const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b),
        m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b),
        s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
  return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
          1.9779984951*l-2.4285922050*m+0.4505937099*s,
          0.0259040371*l+0.7827717662*m-0.8086757660*s];
}
function oklabToHex(L,A,B){
  const l=Math.pow(L+0.3963377774*A+0.2158037573*B,3),
        m=Math.pow(L-0.1055613458*A-0.0638541728*B,3),
        s=Math.pow(L-0.0894841775*A-1.2914855480*B,3);
  return "#"+[linToSrgb(4.0767416621*l-3.3077115913*m+0.2309699292*s),
              linToSrgb(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
              linToSrgb(-0.0041960863*l-0.7034186147*m+1.7076147010*s)]
    .map(v=>v.toString(16).padStart(2,"0")).join("");
}
const filmYears=Object.values(corpus.films).map(f=>f.year).filter(Number.isFinite);
if(!filmYears.length) throw new Error("The transport needs at least one dated film");
const TRANSPORT_Y0=Math.min(...filmYears), TRANSPORT_Y1=Math.max(...filmYears);
const measured=Object.values(corpus.films)
  .filter(f=>f.paletteSource==="poster"&&Number.isFinite(f.year))
  .map(f=>({y:f.year,ok:hexToOklab(f.highlight)}));
const meanA=measured.length?measured.reduce((s,r)=>s+r.ok[1],0)/measured.length:0;
const meanB=measured.length?measured.reduce((s,r)=>s+r.ok[2],0)/measured.length:0;
const meanC=Math.hypot(meanA,meanB);
const yearRaw=[];
for(let y=TRANSPORT_Y0;y<=TRANSPORT_Y1;y++){
  let w=2,pool;
  do{ pool=measured.filter(r=>Math.abs(r.y-y)<=w); w++; }while(pool.length<OK_NMIN&&w<=120);
  const n=pool.length;
  const a0=n?pool.reduce((s,r)=>s+r.ok[1],0)/n:meanA;
  const b0=n?pool.reduce((s,r)=>s+r.ok[2],0)/n:meanB;
  const k=n/(n+OK_SHRINK);
  yearRaw.push([meanA+(a0-meanA)*k, meanB+(b0-meanB)*k, n]);
}
/* One [.25 .5 .25] pass. Adjacent windows already overlap heavily, so this is
   not smoothing away a signal — it is stopping a one-film step at a window
   boundary from reading as a change in cinema. */
const yearSm=yearRaw.map((r,i)=>{
  const p=yearRaw[Math.max(0,i-1)], q=yearRaw[Math.min(yearRaw.length-1,i+1)];
  return [0.25*p[0]+0.5*r[0]+0.25*q[0], 0.25*p[1]+0.5*r[1]+0.25*q[1], r[2]];
});
const yearHex=yearSm.map(([a,b])=>{
  const c=Math.hypot(a,b), h=Math.atan2(b,a);
  const c2=Math.min(OK_CCAP,Math.max(0.010,meanC+(c-meanC)*OK_GAIN));
  return oklabToHex(OK_L,Math.cos(h)*c2,Math.sin(h)*c2);
});
const yearHue=yearSm.map(([a,b])=>+((Math.atan2(b,a)*180/Math.PI+360)%360).toFixed(1));
const yearN=yearSm.map(r=>r[2]);

/* The census: films per year, drawn once under the rail as the run's own
   rhythm. 1916 is one film and 1969 is fifty-three, and that lumpiness is a
   fact about this corpus that the track prints rather than smooths. */
const census=new Array(TRANSPORT_Y1-TRANSPORT_Y0+1).fill(0);
for(const f of Object.values(corpus.films)) if(Number.isFinite(f.year)) census[f.year-TRANSPORT_Y0]++;

/* ── THE NEIGHBOURHOOD RESIDUAL — the one graft ──────────────────────────────
 * A film's own year minus the MEAN year of its graph neighbours. Negative
 * means its company arrived after it — it was drawn on by what came later;
 * positive means it is reaching back. Snow White scores -38.3 and The Other
 * Side of the Wind +52.5, which is a 1970s film released in 2018 whose lineage
 * knows it.
 *
 * A mean and not a degree weighting, so rule 1 holds: a film with forty
 * neighbours and a film with four are read the same way. It IS noisy at low
 * degree, so it is floored at three neighbours and the count ships with it —
 * the readout prints n, and 4 films of 2,204 get no residual at all rather
 * than a number computed from one or two friends.
 *
 * Aligned to discovery.filmOrder, exactly as LAYOUT.positions is: a per-film
 * array indexed by anything else is an array that silently retargets the day
 * a slug moves (AGENTS 6c's argument, one field along). */
const transportAdj=Object.create(null);
for(const key of Object.keys(corpus.films)) transportAdj[key]=[];
for(const e of corpus.edges){ transportAdj[e.a].push(e.b); transportAdj[e.b].push(e.a); }
const RESID_FLOOR=3;
const resid=[], residN=[];
for(const filmId of discovery.filmOrder){
  const key=discovery.keyByFilmId[filmId], own=corpus.films[key].year;
  const years=transportAdj[key].map(k=>corpus.films[k].year).filter(Number.isFinite);
  if(!Number.isFinite(own)||years.length<RESID_FLOOR){ resid.push(null); residN.push(years.length); continue; }
  resid.push(+(own-years.reduce((s,v)=>s+v,0)/years.length).toFixed(2));
  residN.push(years.length);
}


/* ── WHAT TIER THE YEAR'S LIGHT IS, MEASURED HERE AND PRINTED ON SCREEN ──────
 * DESIGN.md's three tiers exist to stop a chosen quantity being dressed as a
 * measured one, and this light is exactly the kind of thing they were invented
 * for. Both halves are computed with build-registers.js's own instruments, so
 * the number in the readout is this corpus's number and not a number copied
 * out of a prototype:
 *
 *  - HOW FAR A DECADE SEPARATES: its poster-measured films' mean highlight
 *    against the corpus mean, in units of the null SD of the same statistic
 *    over same-size random samples. Seeded — a build that reports a different
 *    tier on Tuesday is not a build (rule 7).
 *  - HOW MUCH OF ONE FILM'S OWN COLOUR THE DECADE EXPLAINS: eta-squared of a
 *    one-way decomposition over the same Oklab triples.
 *
 * The prototype this was designed from printed "● RECORDED", and that is an
 * overclaim by one tier. `recorded` is reserved for a fact about the print —
 * the silver print's films ARE monochrome on the record. Here the DIRECTION is
 * measured and the INTENSITY is a x3.6 gain somebody chose, which is the
 * definition of `amplified` word for word. The interface says so.
 *
 * It is also why the light may touch the room and may never touch a disc: a
 * wash over a population IS a mean, and a disc is one film.
 */
const TIER_NULL_TRIALS=400, TIER_AMPLIFY_SIGMA=3.0;
function tierRandom(a){
  return function(){
    a|=0; a=(a+0x6d2b79f5)|0;
    let t=Math.imul(a^(a>>>15),1|a);
    t=(t+Math.imul(t^(t>>>7),61|t))^t;
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const tierAll=Object.values(corpus.films).map(f=>hexToOklab(f.highlight));
const tierN=tierAll.length;
const tierMean=tierAll.reduce((a,v)=>[a[0]+v[0]/tierN,a[1]+v[1]/tierN,a[2]+v[2]/tierN],[0,0,0]);
function tierSigma(labs){
  const n=labs.length;
  if(!n) return 0;
  const m=labs.reduce((a,v)=>[a[0]+v[0]/n,a[1]+v[1]/n,a[2]+v[2]/n],[0,0,0]);
  const d=Math.hypot(m[0]-tierMean[0],m[1]-tierMean[1],m[2]-tierMean[2]);
  const rnd=tierRandom(0x5eed^n), nulls=[];
  for(let t=0;t<TIER_NULL_TRIALS;t++){
    let L=0,A=0,B=0;
    for(let i=0;i<n;i++){ const v=tierAll[(rnd()*tierN)|0]; L+=v[0]/n; A+=v[1]/n; B+=v[2]/n; }
    nulls.push(Math.hypot(L-tierMean[0],A-tierMean[1],B-tierMean[2]));
  }
  const mu=nulls.reduce((a,b)=>a+b,0)/TIER_NULL_TRIALS;
  const sd=Math.sqrt(nulls.reduce((a,b)=>a+(b-mu)**2,0)/TIER_NULL_TRIALS)||1e-9;
  return (d-mu)/sd;
}
const decades=new Map();
for(const f of Object.values(corpus.films)){
  if(f.paletteSource!=="poster"||!Number.isFinite(f.year)) continue;
  const d=Math.floor(f.year/10)*10;
  if(!decades.has(d)) decades.set(d,[]);
  decades.get(d).push(hexToOklab(f.highlight));
}
let bestSigma=0,bestDecade=null;
for(const [d,labs] of decades){
  const s=tierSigma(labs);
  if(s>bestSigma){ bestSigma=s; bestDecade=d; }
}
let ssTotal=0,ssBetween=0;
{
  const pool=[...decades.values()].flat(), n=pool.length;
  const gm=pool.reduce((a,v)=>[a[0]+v[0]/n,a[1]+v[1]/n,a[2]+v[2]/n],[0,0,0]);
  for(const v of pool) ssTotal+=(v[0]-gm[0])**2+(v[1]-gm[1])**2+(v[2]-gm[2])**2;
  for(const labs of decades.values()){
    const g=labs.length;
    const m=labs.reduce((a,v)=>[a[0]+v[0]/g,a[1]+v[1]/g,a[2]+v[2]/g],[0,0,0]);
    ssBetween+=g*((m[0]-gm[0])**2+(m[1]-gm[1])**2+(m[2]-gm[2])**2);
  }
}
const tierSep={
  sigma:+bestSigma.toFixed(2),
  decade:bestDecade,
  share:+(ssTotal?ssBetween/ssTotal:0).toFixed(4),
  tier:bestSigma>=TIER_AMPLIFY_SIGMA?"amplified":"authored",
};

const TRANSPORT={
  y0:TRANSPORT_Y0, y1:TRANSPORT_Y1,
  yearHex, yearHue, yearN, census,
  penA, penB, tense,
  resid, residN, residFloor:RESID_FLOOR,
  /* The authored constants, printed by the readout in the same breath as the
     measurement they were applied to (AGENTS rule 8). */
  chromaGain:OK_GAIN, windowMin:OK_NMIN, shrink:OK_SHRINK,
  measuredPrints:measured.length, films:filmYears.length,
  sep:tierSep,
};


/* ── THE LIGHT ─────────────────────────────────────────────────────────────
 * WHAT A FILM LOOKS LIKE, WITHOUT SHOWING ONE FRAME OF IT.
 *
 * The panel had exactly one picture: the Wikipedia one-sheet, which is
 * advertising, and which 75 films do not have at all. The obvious upgrade is a
 * shelf of stills, and it is the one thing this project may not do.
 * docs/specs/film-grab-evaluation.md settled it — the frames were fetched once
 * at ~1 req/s, measured, and deleted: "derived numbers only in the repo ...
 * Nothing rehosted, no image URL served at runtime". IMDb forbids
 * redistribution, BFI forbids bulk copying, TMDB is barred as a runtime
 * dependency by AGENTS 6b, and there is no film still anywhere in this
 * repository — `git ls-files` returns four raster files and not one is a
 * frame. There is no lawful shelf of photographs to build.
 *
 * So the shelf is the MEASUREMENT the frames left behind: the seven OKLab
 * statistics per film in pipeline/out/frame-measures.json, drawn back out as
 * plates. The atlas may not show what it looked at, so it draws what it saw.
 * The plates are CSS gradients in `oklab()`, which is the space the numbers
 * were measured in — nothing is converted and nothing is invented between the
 * instrument and the screen.
 *
 * `provenance` IS STRIPPED HERE AND THE BUILD FAILS IF IT SURVIVES. 903 of the
 * 1,017 records carry a https://film-grab.com/... gallery URL. It is a page
 * and not an image, and it is still a film-grab URL inside a public artifact,
 * which the spec's own sentence refuses. The assertion below is why this is a
 * build step and not a file copy.
 *
 * COVERAGE IS 1,017 OF 2,204 AND THE SHAPE OF THAT GAP IS FAME — the file says
 * so in its own `caveat`: 9.7% of the quietest pageview quartile against 76.1%
 * of the loudest. That is exactly why the shelf's GEOMETRY must not depend on
 * it. Every film gets the same three slots at the same size; coverage changes
 * what is inside a slot and what its caption admits, never how much room the
 * shelf takes. A shelf that grew with coverage is a shelf that grew with fame,
 * which is AGENTS rule 1 drawn as a layout.
 *
 * THE TWO INSTRUMENTS ARE NOT THE SAME CLAIM (AGENTS rule 8). 903 films are
 * measured from curator-selected frames — the reference. 114 are measured from
 * promotional backdrops, up to 8 of them, "systematically brighter", pulled
 * onto the reference scale by an offset derived from 110 dual-measured films.
 * Advertising calibrated into a guess at projection is a reading, so those
 * plates ship marked as one and the app draws them dashed, in the same
 * solid/dashed grammar the edges already use. */
const LIGHT_PATH=path.join(ROOT,"pipeline","out","frame-measures.json");
const LIGHT_AXES=["glare","Lrange","hardness","chroma","chroma90","warmth","warmspread"];
const LIGHT_MONO_FLOOR=0.002;   /* frame-measures.json's own black-and-white anchor */
let LIGHT=null, LIGHT_QUOTED=[], LIGHT_COUNT=null;
if(fs.existsSync(LIGHT_PATH)){
  const src=JSON.parse(fs.readFileSync(LIGHT_PATH,"utf8"));
  if(!src.films||!src.measures||!src.bwAnchor||!src.calibration){
    throw new Error("frame-measures.json is missing films, measures, bwAnchor or calibration");
  }
  if(!src.bwAnchor.note.includes(String(LIGHT_MONO_FLOOR))){
    throw new Error("frame-measures.json no longer anchors monochrome at "+LIGHT_MONO_FLOOR);
  }
  const films={};
  let filmgrab=0,tmdb=0,mono=0,thin=0;
  for(const key of Object.keys(corpus.films)){
    const r=src.films[key];
    if(!r) continue;
    for(const axis of LIGHT_AXES){
      if(!Number.isFinite(r[axis])) throw new Error(`${key}: frame measure ${axis} is not a number`);
    }
    if(!Number.isFinite(r.n)||r.n<1) throw new Error(`${key}: frame measure carries no frame count`);
    if(r.source!=="film-grab"&&r.source!=="tmdb") throw new Error(`${key}: unknown frame source ${r.source}`);
    /* Positional and short on purpose: seven floats over a thousand films is
       the whole payload and a key per float would be most of it. The order is
       LIGHT_AXES, which the template names once and the probe re-checks. */
    films[key]=[r.source==="film-grab"?0:1,r.n,...LIGHT_AXES.map(a=>Math.round(r[a]*1e5)/1e5)];
    /* FIVE PLACES, NOT FOUR, AND THE REASON IS ONE FILM. At 4dp a chroma of
       0.001968 rounds to 0.00197 -> still under the floor, but 0.0019996 would
       not, and A Matter of Life and Death — a part-Technicolor film measured at
       0.001968, exactly the tinted-print case the file's bwAnchor note warns
       about — sat close enough that the page and the pipeline disagreed about
       whether it is monochrome. The verdict must not be a rounding artefact. */
    if((r.chroma<LIGHT_MONO_FLOOR)!==(films[key][2+LIGHT_AXES.indexOf("chroma")]<LIGHT_MONO_FLOOR)){
      throw new Error(`${key}: packing moved the monochrome verdict — chroma ${r.chroma} does not survive rounding`);
    }
    if(r.source==="film-grab") filmgrab++; else tmdb++;
    if(r.chroma<LIGHT_MONO_FLOOR) mono++;
    if(r.n<8) thin++;
  }
  /* ONLY WHAT THE PAGE DRAWS SHIPS. `measures`, `calibration` and `caveat` are
     read here and left behind: prose nobody renders is weight, and `caveat` is
     also the one field in the file that contains the string "film-grab". What
     the shelf DOES quote out of the caveat — the two percentages that make the
     coverage gap a fame gradient — is checked against the file below, so the
     sentence in the template cannot go stale while the measurement moves. */
  LIGHT={ axes:LIGHT_AXES, monoFloor:LIGHT_MONO_FLOOR, films };
  for(const quoted of ["9.7%","76.1%"]){
    if(!src.caveat.includes(quoted)){
      throw new Error(`the shelf quotes ${quoted} from the frame-measure caveat and the file no longer says it`);
    }
  }
  LIGHT_QUOTED=["9.7%","76.1%"];
  const packed=JSON.stringify(LIGHT);
  if(/film-?grab\.com|https?:\/\//i.test(packed)){
    throw new Error("the light payload carries a URL — frame provenance must never reach the artifact");
  }
  /* The census is for the build's own console and does NOT go into LIGHT: the
     packed object is greppable by two probes for the frame source's name, and
     a field called `filmgrab` in the artifact trips them for no reader's
     benefit. What ships is what the shelf draws. */
  LIGHT_COUNT={films:filmgrab+tmdb,filmgrab,tmdb,mono,thin};
}

/* ── THE REGISTERS ─────────────────────────────────────────────────────────
 * static/registers.json is DERIVED (pipeline/build-registers.js evaluates a
 * rule over themes), where discovery.json is RECORDED. They ship as separate
 * files for that reason and the interface labels them differently.
 *
 * Every register is baked down to eight films rather than the twenty a
 * recorded stratum needs, and the difference is not a double standard. A
 * genre with fifteen films is a thin slice of a taxonomy; a register with
 * fifteen films is the honest size of that region of cinema in this corpus,
 * and its constellation is the whole point of the door. Folk horror is ten
 * films here, and ten films is a real answer to "show me folk horror".
 *
 * Registers are optional: a checkout without the file builds an artifact with
 * no register layer rather than failing, because the file is regenerated from
 * a rule and is not part of the corpus contract. */
let REGISTERS=null;
const REGISTERS_PATH=path.join(ROOT,"static","registers.json");
let registerStrataCount=0;
if(fs.existsSync(REGISTERS_PATH)){
  REGISTERS=JSON.parse(fs.readFileSync(REGISTERS_PATH,"utf8"));
  if(REGISTERS.identityVersion!==discovery.identityVersion){
    throw new Error("registers.json was built against a different identity version than discovery.json — "+
      "re-run pipeline/build-registers.js");
  }
  /* Projected the same way discovery is when --films packs a subset: a posting
     that points outside the retained film order would place a film at another
     film's coordinates. */
  const retained=new Set(discovery.filmOrder);
  const sourceOrder=REGISTERS.filmOrder||null;
  if(sourceOrder&&sourceOrder.length!==discovery.filmOrder.length){
    throw new Error("registers.json film order disagrees with discovery.json");
  }
  const postings={};
  for(const [id,list] of Object.entries(REGISTERS.postings)){
    const kept=list.filter(i=>retained.has(discovery.filmOrder[i]));
    if(kept.length>=8) postings[id]=kept;
  }
  for(const id of Object.keys(REGISTERS.definitions)) if(!postings[id]) delete REGISTERS.definitions[id];
  REGISTERS.postings=postings;
  const {strata:regStrata,report:regReport}=
    strataLayouts(corpus,discovery,{register:postings},{minFilms:8,facets:[]});
  Object.assign(strata,regStrata);
  registerStrataCount=regReport.length;
  for(const r of regReport){
    if(REGISTERS.definitions[r.value]) REGISTERS.definitions[r.value].edges=r.edges;
  }
}

/* THE SHIPPED LAYOUT VERSION NAMES THE POSITIONS, NOT THE FILM ORDER.
 * This read `discovery.layoutVersion`, which is a hash of the corpus version,
 * the film order and discovery's OWN `layoutAlgorithmVersion` — a string about
 * how discovery.json was built (`atlas-layout-v1`) that has never had anything
 * to do with the constellation solver. So the one version stamped on 2,204
 * solved coordinates could not see the solver that solved them: commit e49de94
 * retuned restWeak, moved 2,204 of 2,204 positions, and `LAYOUT.version` came
 * out byte-identical on both sides of it.
 *
 * Same function, same three inputs, with the SKY solver's version in the
 * algorithm slot — and that version is now a fingerprint of the solver's own
 * tuned constants (app/layout-sky.js), so this hash moves whenever the picture
 * does. layoutVersionFor is imported rather than re-derived here for the reason
 * DESIGN.md gives about the palette table: a copy of a hashing rule is a copy
 * that goes stale the day the rule changes.
 *
 * It therefore no longer equals discovery.layoutVersion, and that inequality is
 * the point: they answer different questions. `DISCOVERY.layoutVersion` names
 * WHICH FILMS in what order; `LAYOUT.version` names WHERE THEY SIT. */
const layoutVersion=layoutVersionFor(LAYOUT_ALGORITHM_VERSION,discovery.corpusVersion,discovery.filmOrder);

const layoutManifest={
  version:layoutVersion,
  algorithmVersion:LAYOUT_ALGORITHM_VERSION,
  corpusVersion:discovery.corpusVersion,
  positions,
  strataAlgorithmVersion:STRATA_LAYOUT_VERSION,
  strata,
};

/* ══ THE TYPED SEARCH ════════════════════════════════════════════════════════
 * A reader types a sentence and the atlas re-forms into a constellation where
 * distance from the centre is how well each film answers it. That needs four
 * things in the artifact that were never in it: the consensus attributes, the
 * closed vocabulary, the reader-word lexicon, and the four modules that turn one
 * into the other. The page makes no network call, so all four ship.
 *
 * NOTHING IS PORTED. match.js, questioner.js, query-parse.js and
 * query-runtime.js are inlined VERBATIM under a small CommonJS shim with a
 * virtual filesystem, for the same reason layout-sky.js is embedded rather than
 * reimplemented: a second hand-written copy of a scorer is a copy that drifts,
 * and the day it drifts the sky stops being drawn by the rules the pipeline
 * measures. A shebang is the one thing that has to go — Node's loader strips it
 * and `new Function` does not, and `#!` is a syntax error in a browser with no
 * file and no line number attached to it.
 *
 * THE SHARD BOUNDARY SURVIVES THE PACKING, and that is the only hard constraint
 * on this payload. Only the known shard declares a vocabulary; that is what
 * makes silence there known-absent and silence in the outline shard unknown.
 * Merging the three converts 484 honest unknowns into confident zeros — films
 * above zero on the reference query drops from 1,090 to 606, same scorer, same
 * query, no error anywhere. packAttributes carries a tier byte per film for
 * exactly this reason and query-runtime.js refuses a payload where more than
 * one shard declares a vocabulary. */
const SHARD_DIR=path.join(ROOT,"pipeline","out");
const shardNames=["consensus.shard-known.json","consensus.shard-outline.json","consensus.shard-unknown.json"];
const shards=shardNames.map(n=>{
  const p=path.join(SHARD_DIR,n);
  if(!fs.existsSync(p)) throw new Error(`Atlas build needs ${n} for the typed search; run pipeline/consensus.js`);
  return JSON.parse(fs.readFileSync(p,"utf8"));
});
const findKeys=Object.keys(corpus.films);
const findAttrs=packAttributes(shards,findKeys);
if(findAttrs.unseen) throw new Error(`${findAttrs.unseen} films are in the corpus and in no consensus shard`);
/* Read as objects and handed to the virtual filesystem as objects: the parser
   does JSON.parse(readFileSync(...)), so the shim stringifies on read rather
   than the build shipping every quote twice escaped. */
const findFiles={
  "consensus-vocab.json":JSON.parse(fs.readFileSync(path.join(ROOT,"pipeline","consensus-vocab.json"),"utf8")),
  "query-lexicon.json":JSON.parse(fs.readFileSync(path.join(ROOT,"pipeline","query-lexicon.json"),"utf8")),
  "questioner-phrasings.json":JSON.parse(fs.readFileSync(path.join(ROOT,"pipeline","questioner-phrasings.json"),"utf8")),
};
if(findFiles["query-lexicon.json"].vocabVersion!==findFiles["consensus-vocab.json"].vocabVersion){
  throw new Error("query-lexicon.json and consensus-vocab.json disagree about the vocabulary version");
}
const FIND={
  version:RUNTIME_VERSION,
  vocabVersion:findFiles["consensus-vocab.json"].vocabVersion,
  attrs:findAttrs,
  files:findFiles,
};
const findModuleFiles=[
  ["match.js",path.join(ROOT,"pipeline","match.js")],
  ["query-parse.js",path.join(ROOT,"pipeline","query-parse.js")],
  ["query-runtime.js",path.join(__dirname,"query-runtime.js")],
  ["layout-match.js",path.join(__dirname,"layout-match.js")],
];
const findModules={};
for(const [name,file] of findModuleFiles){
  const src=fs.readFileSync(file,"utf8").replace(/^#![^\n]*\n/,"");
  if(/^#!/.test(src)) throw new Error(`${name} still carries a shebang after stripping`);
  findModules[name]=src;
}
/* QUESTIONER.JS IS THE ONE MODULE THAT DOES NOT SHIP WHOLE, and it is CUT
 * rather than copied. The runtime needs exactly one function out of it —
 * withComplements, which gives match.js a `not:<attr>` column without match.js
 * learning about negation, and whose one rule (an unknown never inverts) is the
 * difference between a reader's "no" being honoured and an unattributed film
 * quietly becoming evidence for it. The rest of the file is the wall's
 * question-picker, 28 KB of it, and the search uses none of it.
 *
 * Sliced out of the source at build time with a brace match, never transcribed:
 * a hand copy of a twenty-line rule is a copy that goes stale the day the rule
 * changes, and this build fails loudly if the function is renamed or moved. */
const questionerSource=fs.readFileSync(path.join(ROOT,"pipeline","questioner.js"),"utf8");
const wcAt=questionerSource.indexOf("function withComplements(table) {");
if(wcAt<0) throw new Error("questioner.js no longer declares withComplements(table) in the form the embed cuts");
let depth=0,wcEnd=-1;
for(let i=questionerSource.indexOf("{",wcAt);i<questionerSource.length;i++){
  const c=questionerSource[i];
  if(c==="{") depth++;
  else if(c==="}"){ depth--; if(!depth){ wcEnd=i+1; break; } }
}
if(wcEnd<0) throw new Error("questioner.js's withComplements does not close");
const wcSource=questionerSource.slice(wcAt,wcEnd);
if(!/table\.value\(filmKey, attr\.slice\(NOT\.length\)\)/.test(wcSource)){
  throw new Error("questioner.js's withComplements no longer reads the way the search depends on");
}
findModuleFiles.splice(1,0,["questioner.js",path.join(ROOT,"pipeline","questioner.js")]);
findModules["questioner.js"]=
  `/* cut from pipeline/questioner.js at build time; see app/build.js */\n`+
  `const NOT = "not:";\n${wcSource}\nmodule.exports = { withComplements };\n`;

/* Chunked, never one enormous line: a 250k-character line is valid JavaScript
   and a practical failure — editors, diff viewers and artifact renderers all
   choke on it, and the symptom is a blank screen rather than an error. */
/* Escape the opening character of a closing script tag. Descriptions and
   claims originate outside this template, so raw `</script>` text must never
   be able to terminate the embedded data block. */
const CH=200;
const pack=(name,value)=>{
  const json=JSON.stringify(value).replace(/</g,"\\u003c");
  const chunks=[];
  for(let i=0;i<json.length;i+=CH) chunks.push(JSON.stringify(json.slice(i,i+CH)));
  return `const ${name} = JSON.parse([\n`+chunks.join(",\n")+`\n].join(""));`;
};
/* Module sources are strings, not JSON values, so they get their own packer —
   same chunking discipline, one JSON.stringify instead of two. */
const packString=(expr,value)=>{
  const chunks=[];
  for(let i=0;i<value.length;i+=CH) chunks.push(JSON.stringify(value.slice(i,i+CH)));
  return `${expr} = [\n`+chunks.join(",\n")+`\n].join("");`;
};
const block=pack("CORPUS",corpus);
const discoveryBlock=pack("DISCOVERY",discovery);
const layoutBlock=pack("LAYOUT",layoutManifest);
const registerBlock=pack("REGISTERS",REGISTERS);
const transportBlock=pack("TRANSPORT",TRANSPORT);
const lightBlock=pack("LIGHT",LIGHT);
const findBlock=[
  pack("FIND_DATA",FIND),
  "const __FIND_SRC = Object.create(null);",
  ...findModuleFiles.map(([name])=>packString(`__FIND_SRC[${JSON.stringify(name)}]`,findModules[name])),
].join("\n");

let html=fs.readFileSync(path.join(__dirname,"template.html"),"utf8");
const marker="/* __CORPUS__ */";
if(!html.includes(marker)) throw new Error("Atlas template is missing its corpus marker");
html=html.replace(marker,block);
if(html.includes(marker)) throw new Error("Atlas template contains more than one corpus marker");
const discoveryMarker="/* __DISCOVERY__ */";
if(!html.includes(discoveryMarker)) throw new Error("Atlas template is missing its discovery marker");
html=html.replace(discoveryMarker,discoveryBlock);
if(html.includes(discoveryMarker)) throw new Error("Atlas template contains more than one discovery marker");
const layoutMarker="/* __LAYOUT__ */";
if(!html.includes(layoutMarker)) throw new Error("Atlas template is missing its layout marker");
html=html.replace(layoutMarker,layoutBlock);
if(html.includes(layoutMarker)) throw new Error("Atlas template contains more than one layout marker");
const registerMarker="/* __REGISTERS__ */";
if(!html.includes(registerMarker)) throw new Error("Atlas template is missing its registers marker");
html=html.replace(registerMarker,registerBlock);
if(html.includes(registerMarker)) throw new Error("Atlas template contains more than one registers marker");
const transportMarker="/* __TRANSPORT__ */";
if(!html.includes(transportMarker)) throw new Error("Atlas template is missing its transport marker");
html=html.replace(transportMarker,transportBlock);
if(html.includes(transportMarker)) throw new Error("Atlas template contains more than one transport marker");
const lightMarker="/* __LIGHT__ */";
if(!html.includes(lightMarker)) throw new Error("Atlas template is missing its light marker");
/* The other half of the caveat check: the numbers are still in the file AND
   the shelf still prints them. Either side going missing is a silent lie. */
for(const quoted of LIGHT_QUOTED){
  if(!html.includes(quoted)) throw new Error(`the template no longer prints ${quoted}, the coverage gradient the shelf is required to admit`);
}
html=html.replace(lightMarker,lightBlock);
if(html.includes(lightMarker)) throw new Error("Atlas template contains more than one light marker");
const findMarker="/* __FIND__ */";
if(!html.includes(findMarker)) throw new Error("Atlas template is missing its typed-search marker");
html=html.replace(findMarker,()=>findBlock);
if(html.includes(findMarker)) throw new Error("Atlas template contains more than one typed-search marker");
const inspectionMarker="/* __RADIAL_INSPECTION__ */";
if(!html.includes(inspectionMarker)) throw new Error("Atlas template is missing its radial inspection marker");
const inspectionSource=fs.readFileSync(path.join(__dirname,"radial-inspection.js"),"utf8");
html=html.replace(inspectionMarker,inspectionSource);
if(html.includes(inspectionMarker)) throw new Error("Atlas template contains more than one radial inspection marker");

/* THE SOLVER SHIPS, BECAUSE AN INTERSECTION HAS NO BAKED LAYOUT.
 * One selected value re-forms into a constellation solved here (see
 * layout-strata.js). Two or more is a different set every time and there are
 * combinatorially many of them, so those are solved in the browser. Measured
 * on this corpus, genre x era and genre x country intersections run median 31
 * films / 30 ms, p90 116 / 76 ms, worst 518 / 498 ms on a desktop — inside a
 * budget the 1,552-film single strata never could be.
 *
 * It is EMBEDDED FROM layout-sky.js rather than reimplemented in the template,
 * and that is the whole point: a second hand-written copy of a force solver is
 * a copy that drifts, and the day it drifts, an intersection stops being drawn
 * by the same rules as the stratum it sits inside. One algorithm, one file,
 * one set of tuned constants, embedded — the same discipline
 * radial-inspection.js is embedded under. Determinism (AGENTS rule 7) comes
 * for free: it is literally the code that baked the strata, seeded the same
 * way, and the app feeds it films in corpus order and edges in corpus order.
 *
 * The export line is rewritten into a return so the source can be wrapped in
 * one expression, which also keeps `layout` from colliding with the radial
 * map's own layout() at template scope. A rename in layout-sky.js fails the
 * build here rather than shipping a page whose filter silently cannot solve. */
const solverMarker="/* __SKY_SOLVER__ */";
if(!html.includes(solverMarker)) throw new Error("Atlas template is missing its sky solver marker");
const solverExport=/^module\.exports\s*=\s*\{[^}]*\};[ \t]*$/m;
let solverSource=fs.readFileSync(path.join(__dirname,"layout-sky.js"),"utf8").replace(/^#![^\n]*\n/,"");
if(!solverExport.test(solverSource)){
  throw new Error("layout-sky.js no longer ends in the module.exports form the template embed rewrites");
}
solverSource=solverSource.replace(solverExport,"return { LAYOUT_ALGORITHM_VERSION, layout };");
/* Function replacement, never a string: a `$&` anywhere in the embedded source
   would otherwise be expanded by String.replace as a capture reference. */
html=html.replace(solverMarker,()=>`const SKY_SOLVER = (function(){\n${solverSource}\n})();`);
if(html.includes(solverMarker)) throw new Error("Atlas template contains more than one sky solver marker");
if(ORIGIN!==null){
  /* Trailing slash trimmed because every template usage already supplies its
     own ("__ATLAS_ORIGIN__/", "__ATLAS_ORIGIN__/og.png"). */
  html=html.replaceAll("__ATLAS_ORIGIN__",ORIGIN.replace(/\/+$/,""));
}
/* The chunking above is only a discipline until something checks it. A
   regression that emits embedded data as one line produces valid HTML that
   renders as a blank page, so this is the assertion that turns a silent
   renderer failure into a build failure. The template's own longest line is
   360 characters and a pack() chunk is ~210, so the ceiling is slack enough
   never to fire on legitimate content. */
const LINE_MAX=4000;
let worstLine=0,worstAt=0;
html.split("\n").forEach((line,i)=>{ if(line.length>worstLine){worstLine=line.length;worstAt=i+1;} });
if(worstLine>LINE_MAX){
  throw new Error(`Atlas build emitted a ${worstLine}-character line at line ${worstAt} (max ${LINE_MAX}). `+
    "Embedded data must stay chunked — a single enormous line renders as a blank page.");
}

fs.mkdirSync(path.dirname(OUT),{recursive:true});
const staged=`${OUT}.${process.pid}.tmp`;
try{
  fs.writeFileSync(staged,html);
  fs.renameSync(staged,OUT);
}finally{
  fs.rmSync(staged,{force:true});
}
console.log(`${OUT}  ${(fs.statSync(OUT).size/1024).toFixed(0)} KB — ${Object.keys(corpus.films).length} films, ${corpus.edges.length} edges, ${Object.keys(positions).length} placed`);
/* Say what was baked. A stratum silently missing its layout is a filter
   that dims instead of re-forming, and that failure is invisible on screen
   unless you already know which strata were supposed to move. */
console.log(`${strataReport.length} strata re-formed — ${strataReport.reduce((n,r)=>n+r.films,0)} film placements, ${(JSON.stringify(strata).length/1024).toFixed(0)} KB`);
console.log(REGISTERS
  ? `${Object.keys(REGISTERS.definitions).length} registers, ${registerStrataCount} of them with their own baked constellation`
  : "no registers — static/registers.json absent, atlas builds without the register layer");
/* Say the coverage out loud, every build, including the part that is missing.
   A shelf that is present for 46% of the corpus and silent about it is the
   fame gradient shipping as an impression. */
console.log(LIGHT_COUNT
  ? `light ${LIGHT_COUNT.films} of ${Object.keys(corpus.films).length} films measured `+
    `(${(100*LIGHT_COUNT.films/Object.keys(corpus.films).length).toFixed(1)}%) — `+
    `${LIGHT_COUNT.filmgrab} from frames, ${LIGHT_COUNT.tmdb} from backdrops (drawn as readings), `+
    `${LIGHT_COUNT.mono} measured monochrome, `+
    `${Object.keys(corpus.films).length-LIGHT_COUNT.films} with no light at all, `+
    `${(JSON.stringify(LIGHT).length/1024).toFixed(0)} KB`
  : "no light — pipeline/out/frame-measures.json absent, every shelf falls back to the mark alone");
/* Say what the transport was baked from, in the same voice: a percentage the
   app prints in its own key is a percentage somebody should be able to see the
   build compute. */
console.log(`typed search ${FIND.vocabVersion} — ${FIND.attrs.a.length} attributes over `+
  `${findKeys.length} films, rungs ${FIND.attrs.rungsUsed.join("/")}, `+
  `${shards.filter(s=>s.vocabulary).length} of ${shards.length} shards declare a vocabulary, `+
  `attrs ${(JSON.stringify(FIND.attrs).length/1024).toFixed(0)} KB, `+
  `lexicon+vocab ${(JSON.stringify(FIND.files).length/1024).toFixed(0)} KB, `+
  `modules ${(Object.values(findModules).join("").length/1024).toFixed(0)} KB`);
console.log(`transport ${TRANSPORT.y0}-${TRANSPORT.y1} — ${TRANSPORT.measuredPrints} measured prints, `+
  `descent ${TRANSPORT.tense.descent.directed}/${TRANSPORT.tense.descent.n} directed at `+
  `${(TRANSPORT.tense.descent.forward*100).toFixed(1)}% forward, `+
  `rebuttal ${TRANSPORT.tense.rebuttal.directed}/${TRANSPORT.tense.rebuttal.n} at `+
  `${((1-TRANSPORT.tense.rebuttal.forward)*100).toFixed(1)}% back, `+
  `${TRANSPORT.penA.length+TRANSPORT.penB.length} pens, `+
  `${TRANSPORT.resid.filter(v=>v===null).length} films under the residual floor, `+
  `${(JSON.stringify(TRANSPORT).length/1024).toFixed(0)} KB`);
