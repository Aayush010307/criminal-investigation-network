#!/usr/bin/env python3
"""
setup_db.py - creates the schema and loads the CSV dataset into Neo4j.

    python scripts/setup_db.py            # schema + data (idempotent, safe to re-run)
    python scripts/setup_db.py --reset    # wipe all nodes first, then schema + data

Connection settings are read from .env (see .env.example).
"""
import csv, os, sys, time
from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cypherfile import ROOT, load_env, parse, statements

EXPECTED_NODES = {"Suspect": 40, "Crime": 30, "Location": 20, "Evidence": 35, "Officer": 15}
EXPECTED_RELS = {"KNOWS": 60, "COMMITTED": 45, "LINKED_TO": 40, "INVESTIGATING": 35,
                 "OCCURRED_AT": 30, "FOUND_AT": 30}

def read_csv(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return list(csv.DictReader(f))

def main():
    uri, user, pwd, db = load_env()
    driver = GraphDatabase.driver(uri, auth=(user, pwd))
    driver.verify_connectivity()
    print(f"Connected to {uri} (database '{db}')")

    with driver.session(database=db) as session:
        if "--reset" in sys.argv:
            session.run("MATCH (n) DETACH DELETE n").consume()
            print("Reset: all nodes and relationships removed")

        # 1. constraints and indexes
        for stmt in statements("db/01_schema.cypher"):
            first = stmt.split("\n")[0]
            try:
                session.run(stmt).consume()
                print(f"  [schema] ok   {first}")
            except Neo4jError as e:
                if "enterprise" in str(e).lower():
                    print(f"  [schema] SKIP {first}  (requires Enterprise Edition)")
                else:
                    raise
        session.run("CALL db.awaitIndexes(300)").consume()

        # 2. data - nodes first, then relationships (order of the file)
        t0 = time.time()
        for item in parse("db/02_load_unwind.cypher"):
            rows = read_csv(item["file"])
            summary = session.execute_write(lambda tx: tx.run(item["cypher"], rows=rows).consume())
            c = summary.counters
            print(f"  [load]   {item['name']:<20} rows={len(rows):>3}  nodes+{c.nodes_created:<3} "
                  f"rels+{c.relationships_created:<3} props={c.properties_set}")
        print(f"Load finished in {time.time() - t0:.2f}s")

        # 3. verification of volumes
        ok = True
        print("\nNode counts")
        for label, exp in EXPECTED_NODES.items():
            n = session.run(f"MATCH (n:{label}) RETURN count(n) AS n").single()["n"]
            ok &= n == exp
            print(f"  {label:<14}{n:>5}   expected {exp:<4}{'OK' if n == exp else 'MISMATCH'}")
        print("Relationship counts")
        for rtype, exp in EXPECTED_RELS.items():
            n = session.run(f"MATCH ()-[r:{rtype}]->() RETURN count(r) AS n").single()["n"]
            ok &= n == exp
            print(f"  {rtype:<14}{n:>5}   expected {exp:<4}{'OK' if n == exp else 'MISMATCH'}")
        tot_n = session.run("MATCH (n) RETURN count(n) AS n").single()["n"]
        tot_r = session.run("MATCH ()-[r]->() RETURN count(r) AS n").single()["n"]
        print(f"\nTOTAL: {tot_n} nodes, {tot_r} relationships  ->  {'SUCCESS' if ok else 'CHECK ABOVE'}")
    driver.close()
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
