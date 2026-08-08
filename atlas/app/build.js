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
const {canonicalJson,contentVersion,projectDiscovery,validateDiscovery}=
  require("../pipeline/discovery-contract.js");
const {LAYOUT_ALGORITHM_VERSION,layout}=require("./layout-sky.js");
const {isTrivia}=require("../pipeline/claim-tiers.js");
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
const layoutManifest={
  version:discovery.layoutVersion,
  algorithmVersion:LAYOUT_ALGORITHM_VERSION,
  corpusVersion:discovery.corpusVersion,
  positions,
};

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
const block=pack("CORPUS",corpus);
const discoveryBlock=pack("DISCOVERY",discovery);
const layoutBlock=pack("LAYOUT",layoutManifest);

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
const inspectionMarker="/* __RADIAL_INSPECTION__ */";
if(!html.includes(inspectionMarker)) throw new Error("Atlas template is missing its radial inspection marker");
const inspectionSource=fs.readFileSync(path.join(__dirname,"radial-inspection.js"),"utf8");
html=html.replace(inspectionMarker,inspectionSource);
if(html.includes(inspectionMarker)) throw new Error("Atlas template contains more than one radial inspection marker");
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
