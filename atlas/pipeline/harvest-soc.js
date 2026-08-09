#!/usr/bin/env node
/* Senses of Cinema archive harvest — one file per page of the WordPress REST
 * index, cached in pipeline/.cache-soc/ so a re-run costs nothing and three
 * concurrent writers share one pass over the host.
 *
 *   node pipeline/harvest-soc.js
 *
 * 6,153 essays at per_page=100 is 62 requests. Content is requested inline
 * rather than per-post: 62 requests against the host instead of 6,153.
 * Resumable — a page already on disk is never re-fetched.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const CACHE = path.join(__dirname, ".cache-soc");
fs.mkdirSync(CACHE, { recursive: true });

const HOST = "www.sensesofcinema.com";
const PER_PAGE = 100;
const UA = "ATLAS-research/1.0 (non-commercial film lineage corpus; contact cool2bwichu@gmail.com)";
const POLITE_MS = 2500;      // between successful requests
const BACKOFF_MS = 45000;    // first retry wait; doubles, four tries

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: HOST, path: urlPath, method: "GET",
        headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "identity" } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (d) => { body += d; });
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
          resolve({ body, headers: res.headers });
        });
      }
    );
    req.setTimeout(120000, () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.end();
  });
}

async function fetchPage(page) {
  const file = path.join(CACHE, "posts-" + String(page).padStart(3, "0") + ".json");
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return { cached: true, file };
  const p = "/wp-json/wp/v2/posts?per_page=" + PER_PAGE + "&page=" + page +
            "&_fields=id,link,date,title,content";
  let wait = BACKOFF_MS;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { body, headers } = await get(p);
      JSON.parse(body); // fail loudly rather than cache a truncated page
      fs.writeFileSync(file, body);
      return { cached: false, file, total: headers["x-wp-total"], pages: headers["x-wp-totalpages"] };
    } catch (err) {
      process.stdout.write("  page " + page + " failed (" + err.message + "), backing off " + (wait / 1000) + "s\n");
      await sleep(wait);
      wait *= 2;
    }
  }
  throw new Error("page " + page + " unrecoverable");
}

(async () => {
  const head = await fetchPage(1);
  const first = JSON.parse(fs.readFileSync(path.join(CACHE, "posts-001.json"), "utf8"));
  if (!head.cached) await sleep(POLITE_MS);
  // total pages from a cheap probe if page 1 came from cache
  let totalPages = head.pages ? Number(head.pages) : null;
  if (!totalPages) {
    // Page 1 came from cache, so the header is gone. Probe cheaply; if the host
    // is throttling, fall back to the archive size recorded by the source audit
    // rather than aborting a resumable run over a missing integer.
    try {
      const probe = await get("/wp-json/wp/v2/posts?per_page=" + PER_PAGE + "&page=1&_fields=id");
      totalPages = Number(probe.headers["x-wp-totalpages"]);
      await sleep(POLITE_MS);
    } catch (err) {
      totalPages = Math.ceil(6153 / PER_PAGE);
      console.log("probe failed (" + err.message + "); assuming " + totalPages + " pages");
      await sleep(BACKOFF_MS);
    }
  }
  console.log("pages: " + totalPages + " (" + first.length + " posts on page 1)");
  let fetched = 0;
  for (let page = 2; page <= totalPages; page++) {
    const r = await fetchPage(page);
    if (!r.cached) { fetched++; process.stdout.write("."); await sleep(POLITE_MS); }
  }
  console.log("\nfetched " + fetched + " new pages; cache at " + CACHE);
})();
