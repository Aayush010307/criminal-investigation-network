#!/usr/bin/env python3
"""
reference.py - independent re-computation of every query result directly from the CSV files,
without Neo4j. Writes scripts/expected/results.json, which verify.py compares against the live
database. Two independent implementations (Cypher in Neo4j, plain Python here) agreeing on
every row is the project's correctness check for the query library.
"""
import csv, json, os
from collections import defaultdict, deque
from decimal import Decimal, ROUND_HALF_UP

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
def rd(name): return list(csv.DictReader(open(os.path.join(ROOT, "data", name), encoding="utf-8")))
def rhu(x, p): return float(Decimal(repr(x)).quantize(Decimal(1).scaleb(-p), rounding=ROUND_HALF_UP))

S = {r["suspect_id"]: r for r in rd("suspects.csv")}
C = {r["crime_id"]: r for r in rd("crimes.csv")}
L = {r["location_id"]: r for r in rd("locations.csv")}
E = {r["evidence_id"]: r for r in rd("evidence.csv")}
O = {r["badge_number"]: r for r in rd("officers.csv")}
KN, CO, OC = rd("rel_knows.csv"), rd("rel_committed.csv"), rd("rel_occurred_at.csv")
LT, IN, FA = rd("rel_linked_to.csv"), rd("rel_investigating.csv"), rd("rel_found_at.csv")

adj = defaultdict(list)                       # undirected KNOWS adjacency with strength
for k in KN:
    adj[k["from_id"]].append((k["to_id"], float(k["strength"])))
    adj[k["to_id"]].append((k["from_id"], float(k["strength"])))
committed_by = defaultdict(list)              # suspect -> [(crime, role)]
committers = defaultdict(set)                 # crime -> {suspect}
for r in CO:
    committed_by[r["suspect_id"]].append((r["crime_id"], r["role"]))
    committers[r["crime_id"]].add(r["suspect_id"])
links_into = defaultdict(list)                # crime -> [evidence]
links_from = defaultdict(list)                # evidence -> [LINKED_TO row]
for r in LT:
    links_into[r["crime_id"]].append(r["evidence_id"]); links_from[r["evidence_id"]].append(r)

def bfs(src, min_strength=None, maxd=None):
    dist, q = {src: 0}, deque([src])
    while q:
        u = q.popleft()
        if maxd is not None and dist[u] == maxd: continue
        for v, s in adj[u]:
            if min_strength is not None and s < min_strength: continue
            if v not in dist: dist[v] = dist[u] + 1; q.append(v)
    return dist

def all_shortest(a, b):
    dist = bfs(a)
    paths = []
    def back(v, acc):
        if v == a: paths.append([a] + acc[::-1]); return
        for u, _ in adj[v]:
            if dist.get(u) == dist[v] - 1: back(u, acc + [v])
    back(b, [])
    return sorted(paths)

R = {}
def put(name, cols, rows, compare="ordered"): R[name] = {"columns": cols, "rows": rows, "compare": compare}

# Q1
s = S["S001"]
put("Q1", ["id","name","alias","risk","crimes","associates","evidence"], [[
    "S001", s["first_name"] + " " + s["last_name"], s["alias"], s["risk_level"],
    [f"{c} {C[c]['type']} ({role})" for c, role in committed_by["S001"]],
    [v for v, _ in adj["S001"]],
    sorted({e for c, _ in committed_by["S001"] for e in links_into[c]})]])
# Q2
p = all_shortest("S002", "S026"); assert len(p) == 1, p
put("Q2", ["chain","hops"], [[[f"{x} {S[x]['alias']}" for x in p[0]], len(p[0]) - 1]])
# Q3
dist = bfs("S001", maxd=3); groups = defaultdict(list)
for v, dd in dist.items():
    if v != "S001": groups[dd].append(v)
put("Q3", ["degree","suspects","ids"], [[d, len(groups[d]), sorted(groups[d])] for d in sorted(groups)])
# Q4
rows = [[sid, S[sid]["alias"], S[sid]["risk_level"], len(v), [c for c, _ in v]] for sid, v in committed_by.items() if len(v) >= 2]
put("Q4", ["id","alias","risk","crimes","crime_ids"], sorted(rows, key=lambda r: (-r[3], r[0])))
# Q5
rows = [[e, E[e]["type"], E[e]["description"], [x["crime_id"] for x in v]] for e, v in links_from.items() if len(v) > 1]
put("Q5", ["id","type","description","crimes"], sorted(rows))
# Q6
byloc = defaultdict(list)
for r in OC: byloc[r["location_id"]].append(int(C[r["crime_id"]]["severity"]))
rows = [[l, L[l]["address"], L[l]["city"], len(v), rhu(sum(v) / len(v), 2)] for l, v in byloc.items()]
put("Q6", ["id","address","city","incidents","avg_severity"], sorted(rows, key=lambda r: (-r[3], -r[4], r[0]))[:5])
# Q7
f = next(x for x in FA if x["evidence_id"] == "E002"); loc = L[f["location_id"]]
rows = [["E002", E["E002"]["description"], f"{loc['address']}, {loc['city']}", f["found_on"], O[f["found_by"]]["name"],
         x["crime_id"], C[x["crime_id"]]["type"], float(x["relevance_score"]), x["processing_status"]] for x in links_from["E002"]]
put("Q7", ["id","item","found_at","found_on","recovered_by","crime","crime_type","relevance","processing"], sorted(rows, key=lambda r: -r[7]))
# Q8
dep = defaultdict(lambda: {"off": set(), "asg": 0, "led": set(), "closed": set()})
for r in IN:
    d = dep[O[r["badge_number"]]["department"]]
    d["off"].add(r["badge_number"]); d["asg"] += 1
    if r["lead_investigator"] == "true":
        d["led"].add(r["crime_id"])
        if C[r["crime_id"]]["status"] == "Closed": d["closed"].add(r["crime_id"])
rows = [[k, len(v["off"]), v["asg"], len(v["led"]), len(v["closed"]), rhu(100.0 * len(v["closed"]) / len(v["led"]), 1)] for k, v in dep.items()]
put("Q8", ["department","officers","assignments","cases_led","closed","closure_rate_pct"], sorted(rows, key=lambda r: (-r[3], r[0])))
# Q9
tr = defaultdict(lambda: defaultdict(int))
for c in C.values():
    y, m = int(c["date"][:4]), int(c["date"][5:7]); tr[(y, (m + 2) // 3)][c["type"]] += 1
rows = [[y, f"Q{q}", sum(t.values()), [f"{k}: {t[k]}" for k in sorted(t)]] for (y, q), t in sorted(tr.items())]
put("Q9", ["year","quarter","total","breakdown"], rows)
# Q10
agg = {}
for d in committers["CR002"]:
    for a, st in adj[d]:
        if a in committers["CR002"]: continue
        g = agg.setdefault(a, {"via": set(), "max": 0.0}); g["via"].add(d); g["max"] = max(g["max"], st)
rows = [[a, S[a]["alias"], S[a]["risk_level"], sorted(g["via"]), g["max"]] for a, g in agg.items()]
put("Q10", ["id","alias","risk","linked_through","strongest_tie"], sorted(rows, key=lambda r: (-r[4], r[0])))
# A1
rows = [[sid, S[sid]["alias"], len(adj[sid]), len(committed_by[sid])] for sid in S]
put("A1", ["id","alias","associates","crimes"], sorted(rows, key=lambda r: (-r[2], -r[3], r[0]))[:5])
# A2
pairs = defaultdict(list)
for c, ss in committers.items():
    for a in ss:
        for b in ss:
            if a < b: pairs[(a, b)].append(c)
known = {frozenset((k["from_id"], k["to_id"])) for k in KN}
rows = [[a, b, len(v), v, frozenset((a, b)) in known] for (a, b), v in pairs.items()]
put("A2", ["suspect_a","suspect_b","shared_crimes","shared","known_associates"], sorted(rows, key=lambda r: (-r[2], r[0], r[1]))[:8])
# A3
dist = bfs("S001", min_strength=0.6, maxd=3)
put("A3", ["id","alias","hops"], sorted([[v, S[v]["alias"], dd] for v, dd in dist.items() if v != "S001"], key=lambda r: (r[2], r[0])))
# A4
put("A4", ["route","hops"], [[p, len(p) - 1] for p in all_shortest("S003", "S019")], compare="set")
# A5
rows = [["Crime", k, v["description"]] for k, v in C.items() if "bank" in v["description"].lower().split()] + \
       [["Evidence", k, v["description"]] for k, v in E.items() if "bank" in v["description"].lower().split()]
put("A5", ["label","id","description"], sorted(rows), compare="set")
# A6
lead = {r["crime_id"]: r["badge_number"] for r in IN if r["lead_investigator"] == "true"}
rows = [[c, C[c]["type"], C[c]["date"], C[c]["status"], O[lead[c]]["name"]] for c in sorted(C) if not committers[c]]
put("A6", ["id","type","date","status","lead_officer"], rows)

os.makedirs(os.path.join(ROOT, "scripts", "expected"), exist_ok=True)
json.dump(R, open(os.path.join(ROOT, "scripts", "expected", "results.json"), "w"), indent=1)
if __name__ == "__main__":
    for k, v in R.items():
        print(f"\n== {k}  {v['columns']}")
        for row in v["rows"]: print("  ", row)
