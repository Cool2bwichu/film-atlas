/* Probe for the evidence-language proposal (atlas/proposals/evidence-language.html).
   Screenshots desk + phone, then measures CONTRAST off the composited page:
   every text node inside the panel, computed color vs effective ancestor
   ground, WCAG ratio, floor 4.5:1 for type — the same discipline DESIGN.md's
   palette table is held to. Also measures graphical marks (meter notch, rail
   tick, aperture border, sparkline stroke) against the 3:1 graphics floor,
   and coarse-pointer target heights against 44px.
   Run from repo root:  node .claude/skills/run-film-atlas/evidence-probe.mjs */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const page_url = "file://" + path.join(root, "atlas/proposals/evidence-language.html");
const shots = process.env.EV_SHOTS || path.join(root, ".atlas-shots");

const lum = ([r, g, b]) => {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const l1 = lum(a), l2 = lum(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

const IN_PAGE = `(() => {
  const parse = c => { const m = c.match(/[\\d.]+/g); return m ? m.slice(0,4).map(Number) : null; };
  const ground = el => {           /* walk up for the first opaque background */
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && (c.length < 4 || c[3] >= 0.99)) return c.slice(0,3);
    }
    return [5,4,4];
  };
  const out = [];
  const walker = document.createTreeWalker(document.getElementById("panel"), NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const t = walker.currentNode.textContent.trim();
    if (!t) continue;
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;             /* folded receipts */
    out.push({
      cls: (el.className && String(el.className).slice(0,28)) || el.tagName,
      text: t.slice(0, 28),
      size: parseFloat(cs.fontSize),
      color: parse(cs.color).slice(0,3),
      ground: ground(el),
    });
  }
  /* graphical marks, 3:1 floor */
  const g = [];
  const mark = (sel, prop, name) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const cs = getComputedStyle(el);
    const c = parse(prop === "border" ? cs.borderTopColor : prop === "stroke" ? cs.stroke : cs.backgroundColor);
    if (c) g.push({ name, color: c.slice(0,3), ground: ground(el.parentElement || el) });
  };
  mark(".mtrack .notch", "bg", "meter notch (film accent)");
  mark(".mtrack .tick",  "bg", "meter tick");
  mark(".ap",            "border", "aperture border");
  mark(".spark polyline","stroke", "sparkline stroke");
  return { text: out, graphics: g };
})()`;

const run = async () => {
  const browser = await chromium.launch();
  let fail = 0;

  for (const [name, vp, coarse] of [["desk", { width: 1440, height: 900 }, false],
                                    ["phone", { width: 390, height: 780 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: coarse });
    const page = await ctx.newPage();
    await page.goto(page_url);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shots, `evidence-${name}.png`) });

    /* receipts open: the standing receipt + keep the cutting that opens by default */
    await page.click('[data-rc="rc-tspdt"]');
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(shots, `evidence-${name}-receipts.png`) });

    const m = await page.evaluate(IN_PAGE);
    let minType = Infinity, worstT = null;
    for (const t of m.text) {
      const r = ratio(t.color, t.ground);
      if (r < minType) { minType = r; worstT = t; }
      if (r < 4.5) { fail++; console.log(`  TYPE FAIL ${r.toFixed(2)}:1  .${t.cls} "${t.text}"`); }
    }
    console.log(`${name}  ${vp.width}x${vp.height} — ${m.text.length} text runs measured, ` +
      `min ${minType.toFixed(2)}:1 (.${worstT.cls} "${worstT.text}") — floor 4.5`);
    for (const gm of m.graphics) {
      const r = ratio(gm.color, gm.ground);
      const ok = r >= 3;
      if (!ok) fail++;
      console.log(`  graphic ${ok ? "ok " : "FAIL"} ${r.toFixed(2)}:1  ${gm.name}`);
    }

    if (coarse) { /* 44px targets on the phone */
      const t = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".panel .ev-st")].map(e => {
          const r = e.getBoundingClientRect(); return { h: r.height };
        });
        const words = [...document.querySelectorAll(".word")].map(w => {
          const s = getComputedStyle(w, "::after");
          return { h: parseFloat(s.height) || w.getBoundingClientRect().height };
        });
        return { rowMin: Math.min(...rows.map(r => r.h)), wordMin: Math.min(...words.map(w => w.h)) };
      });
      const okR = t.rowMin >= 44, okW = t.wordMin >= 44;
      if (!okR || !okW) fail++;
      console.log(`  targets ${okR && okW ? "ok " : "FAIL"} — statement rows min ${t.rowMin.toFixed(0)}px, word overlay min ${t.wordMin.toFixed(0)}px (floor 44)`);
    }

    /* the receipt actually unfolds: measure its box before and after */
    const h = await page.evaluate(() => {
      const rc = document.getElementById("rc-schol");
      const before = rc.getBoundingClientRect().height;
      document.querySelector('[data-rc="rc-schol"]').click();
      return new Promise(res => setTimeout(() =>
        res({ before, after: rc.getBoundingClientRect().height }), 600));
    });
    const opened = h.after - h.before > 40;
    if (!opened) fail++;
    console.log(`  receipt ${opened ? "ok " : "FAIL"} — scholarship unfolds ${h.before.toFixed(0)} -> ${h.after.toFixed(0)}px`);
    await ctx.close();
  }

  /* appendix shot */
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(page_url);
  await page.evaluate(() => document.getElementById("appendix").scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, "evidence-appendix.png") });
  await ctx.close();

  await browser.close();
  console.log(fail ? `EVIDENCE PROBE: ${fail} FAILURES` : "EVIDENCE PROBE PASS");
  process.exit(fail ? 1 : 0);
};
run();
