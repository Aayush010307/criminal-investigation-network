#!/usr/bin/env python3
"""
verify.py - runs every query in db/04_queries.cypher against the live database and compares
the result with scripts/expected/results.json (produced independently by reference.py), then
checks with EXPLAIN that each index query in db/05_indexes.cypher uses the index operator its title names.

    python scripts/verify.py          # PASS/FAIL per query
    python scripts/verify.py --show   # also print each result table
"""
import json, os, re, sys
from neo4j import GraphDatabase
from neo4j.time import Date, DateTime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cypherfile import ROOT, load_env, parse

def plain(v):
    if isinstance(v, (Date, DateTime)):
        return v.iso_format()
    if isinstance(v, list):
        return [plain(x) for x in v]
    return v

def same(a, b):
    if isinstance(a, float) or isinstance(b, float):
        return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) < 0.011
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return False
        try:                                   # list-valued cells: order-insensitive
            return all(same(x, y) for x, y in zip(sorted(a), sorted(b)))
        except TypeError:
            return all(same(x, y) for x, y in zip(a, b))
    return a == b

def operators(plan):
    out = [plan["operatorType"].split("@")[0]]
    for child in plan.get("children", []):
        out += operators(child)
    return out

def main():
    expected = json.load(open(os.path.join(ROOT, "scripts", "expected", "results.json")))
    uri, user, pwd, db = load_env()
    driver = GraphDatabase.driver(uri, auth=(user, pwd))
    passed = failed = 0
    with driver.session(database=db) as session:
        for q in parse("db/04_queries.cypher"):
            if q["name"] not in expected:
                continue                        # visual queries (V1, V2) are not compared
            exp = expected[q["name"]]
            res = session.run(q["cypher"], **q["params"])
            cols = res.keys()
            rows = [[plain(r[c]) for c in cols] for r in res]
            erows = exp["rows"]
            if exp["compare"] == "set":
                key = lambda r: json.dumps(r, sort_keys=True)
                rows, erows = sorted(rows, key=key), sorted(erows, key=key)
            ok = list(cols) == exp["columns"] and len(rows) == len(erows) and \
                 all(all(same(a, b) for a, b in zip(r, e)) for r, e in zip(rows, erows))
            passed += ok; failed += not ok
            print(f"[{'PASS' if ok else 'FAIL'}] {q['name']:<4} {q['title']}  ({len(rows)} rows)")
            if not ok or "--show" in sys.argv:
                print("       columns :", list(cols))
                for r in rows: print("       got     :", r)
                if not ok:
                    for r in erows: print("       expected:", r)
        print()
        for q in parse("db/05_indexes.cypher"):         # index usage, e.g. "-> expected operator NodeIndexSeek"
            m = re.search(r"expected operator (\w+)", q["title"])
            if not m:
                continue
            cy = re.sub(r"^(EXPLAIN|PROFILE)\s+", "", q["cypher"], flags=re.I)
            ops = operators(session.run("EXPLAIN " + cy, **q["params"]).consume().plan)
            ok = m.group(1) in ops
            passed += ok; failed += not ok
            print(f"[{'PASS' if ok else 'FAIL'}] {q['name']:<4} {q['title']}" + ("" if ok else f"  (plan: {', '.join(ops)})"))
    driver.close()
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
