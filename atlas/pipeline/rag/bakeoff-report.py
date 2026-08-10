#!/usr/bin/env python3
"""bakeoff-report.py — prints the two dumped battery runs side by side.
Presentation only: it computes nothing except overlap counts."""
import json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
S = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/-home-user-film-atlas/3a394c7e-a9b1-54c8-925e-faea85bfde9d/scratchpad/bake"
A = json.load(open(os.path.join(S, "atlas-corpus.json")))
D = json.load(open(os.path.join(S, "dense-corpus.json")))
which = sys.argv[2] if len(sys.argv) > 2 else "native256"
dq = {r["id"]: r for r in D["indexes"][which]["queries"]}
aq = {r["id"]: r for r in A["queries"]}
art = {r["id"]: r for r in D["indexes"]["article"]["queries"]}
only = sys.argv[3] if len(sys.argv) > 3 else None

def name(r): return f'{r["title"]} ({r["year"]})'
for qid in aq:
    if only and only != qid: continue
    a, d, ar = aq[qid], dq[qid], art[qid]
    print("=" * 108)
    print(f'[{qid}]  "{a["q"]}"')
    print(f'  probes: {a["probes"]}')
    print(f'  ATLAS reads {100-a["read"]["unreadFrac"]*100:.0f}% of the sentence · {a["read"]["clauses"]} clauses'
          f'{" · REFUSAL " + a["refusal"]["code"] if a["refusal"] else ""}'
          f'{" · top tie " + str(a["ties"]["atTop"]) if a["ties"]["atTop"] > 1 else ""}')
    print(f'  parsed as: ' + " | ".join(
        f'{r["said"]}->{r["label"] or r.get("film") or r["terms"]}{"(NEG)" if r["negate"] else ""}'
        for r in a["read"]["readings"]) or "  parsed as: nothing")
    if a["read"]["unread"]: print(f'  UNREAD: {a["read"]["unread"]}')
    if d["negationRisk"]: print("  dense: negationRisk=True")
    print(f'{"":3s} {"ATLAS (match.js + query-parse.js)":52s} | DENSE ({which})')
    at, dt = a["top"][:10], d["top"][:10]
    for i in range(10):
        L = f'{at[i]["score"]:.3f} {name(at[i])}' + (f' [tie {at[i]["tie"]["n"]}]' if at[i]["tie"]["n"] > 1 else '') if i < len(at) else ""
        R = f'{dt[i]["score"]:.3f} {name(dt[i])}' + (f' [{dt[i]["textTier"][:4]}]' if dt[i]["textTier"] != "plot" else '') if i < len(dt) else ""
        print(f'{i+1:2d}. {L:52.52s} | {R:52.52s}')
    ov = len({r["key"] for r in at} & {r["key"] for r in dt})
    print(f'  overlap top-10: {ov}/10')
    if a["rankOf"]:
        print("  WATCH FILMS      atlas rank        dense rank(" + which + ")   dense rank(article)")
        for w in a["rankOf"]:
            ra, rd, rr = a["rankOf"][w], d["rankOf"].get(w, {}), ar["rankOf"].get(w, {})
            ta = f'#{ra["rank"]}/{ra["of"]}' + (f' [tie {ra["tie"]["n"]}, {ra["tie"]["from"]}-{ra["tie"]["to"]}]' if ra.get("tie", {}).get("n", 1) > 1 else '') if ra.get("rank") else str(ra.get("note"))
            td = f'#{rd.get("rank")}/{rd.get("of")}' if rd.get("rank") else str(rd.get("note", "-"))
            tr = f'#{rr.get("rank")}/{rr.get("of")}' if rr.get("rank") else str(rr.get("note", "-"))
            print(f'   {w:28s} {ta:22s} {td:18s} {tr}')
    if "neighbours" in d:
        print(f'  DENSE, film-as-probe (neighbours of the exemplar, title string never embedded):')
        print("   " + " · ".join(f'{i+1}.{n["title"]} ({n["year"]})' for i, n in enumerate(d["neighbours"][:8])))
        if d.get("neighbourRankOf"):
            print("   " + " · ".join(f'{w}: #{v["rank"]}/{v["of"]}' for w, v in d["neighbourRankOf"].items()))
    print(f'  ms: atlas {a["ms"]} · dense {d["ms"]}')
