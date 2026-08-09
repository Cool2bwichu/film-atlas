import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
const A = process.argv[2] || "/home/user/film-atlas/public/atlas.html";
const b = await chromium.launch({args:["--disable-gpu","--no-sandbox"]});
const ctx = await b.newContext({viewport:{width:1024,height:660},reducedMotion:"no-preference"});
const page = await ctx.newPage();
await page.route("**/*", r=>r.request().resourceType()==="image"?r.abort():r.continue());
await page.goto(pathToFileURL(A).href,{waitUntil:"load",timeout:45000});
await page.waitForFunction("typeof KEYS!=='undefined'&&KEYS.length>0",null,{timeout:45000});
const seeds = await page.evaluate(`(()=>KEYS.filter(k=>(ADJ[k]||[]).length>=6).sort((a,b)=>F[b].title.length-F[a].title.length).slice(0,22))()`);
let tally={};
for (const k of seeds){
  await page.evaluate(`openMap(${JSON.stringify(k)})`); await page.waitForTimeout(80);
  await page.evaluate("layout()");
  const rows = await page.evaluate(`(()=>{
    const B=[...document.querySelectorAll("#stage .node")].map(n=>({i:+n.dataset.i,
      frame:n.querySelector(".frame").getBoundingClientRect(), cap:n.querySelector(".label").getBoundingClientRect()}));
    const hit=(a,b,p=1)=>a.left<b.right-p&&a.right>b.left+p&&a.top<b.bottom-p&&a.bottom>b.top+p;
    const out=[];
    for(let i=0;i<B.length;i++)for(let j=i+1;j<B.length;j++){
      if(hit(B[i].cap,B[j].frame)) out.push((B[i].i<0?"C":"R")+"cap on "+(B[j].i<0?"C":"R")+"frame");
      if(hit(B[j].cap,B[i].frame)) out.push((B[j].i<0?"C":"R")+"cap on "+(B[i].i<0?"C":"R")+"frame");
    } return out;})()`);
  for(const r of rows) tally[r]=(tally[r]||0)+1;
}
console.log(A.split("/").pop(), JSON.stringify(tally));
await b.close();
