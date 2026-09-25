# Criminal Investigation Network

A graph-based investigative intelligence system built on **Neo4j**.
Course project for **BCSE302P – Database Systems Lab** (Review 2: implementation and core functionality).

Suspects, crimes, locations, evidence and officers are stored as nodes; the associations between them are
stored as typed, directional relationships with properties, so questions such as *"how is suspect A connected
to suspect B?"* are answered by traversing the graph instead of joining tables.

| | |
|---|---|
| Node labels (5) | `Suspect` · `Crime` · `Location` · `Evidence` · `Officer` |
| Relationship types (6) | `KNOWS` · `COMMITTED` · `OCCURRED_AT` · `LINKED_TO` · `INVESTIGATING` · `FOUND_AT` |
| Dataset | 140 nodes · 240 relationships (synthetic, reproducible) |
| Constraints / indexes | 5 unique · 2 existence · 4 range · 1 relationship · 1 text · 1 full-text |
| Queries | 10 investigative queries + 6 analytics + 2 visual (`db/04_queries.cypher`) |

## Repository layout

```
data/                     generated CSV files (5 node files, 6 relationship files)
db/01_schema.cypher       constraints and indexes
db/02_load_unwind.cypher  batch loader used by scripts/setup_db.py
db/02_load_csv.cypher     same loader as LOAD CSV, for Neo4j Browser
db/03_crud.cypher         create / read / update / delete for every label and relationship type
db/04_queries.cypher      investigative queries Q1-Q10, analytics A1-A6, visual V1-V2
db/05_indexes.cypher      SHOW / PROFILE statements proving index use; constraint enforcement
db/06_transactions_cypher_shell.txt  explicit BEGIN / COMMIT / ROLLBACK in cypher-shell
db/99_reset.cypher        delete all data (keeps schema)
scripts/generate_data.py  seeded dataset generator (re-creates data/ byte-for-byte)
scripts/setup_db.py       applies the schema, loads the data, verifies the counts
scripts/reference.py      recomputes every query result from the CSVs in plain Python
scripts/verify.py         runs every query on Neo4j and compares with the reference results
api/                      Node.js + Express REST API (CRUD, analytics, transactions) + tests
demo/demo_api.sh          scripted live demonstration of the API
```

## Setup (about 10 minutes)

**Prerequisites:** [Neo4j Desktop](https://neo4j.com/download/) (any 5.x DBMS), Python 3.9+, Node.js 18+.

1. In Neo4j Desktop create a local DBMS (Neo4j 5.x), set a password and **Start** it.
2. Configure the connection:
   ```bash
   cp .env.example .env          # then put your DBMS password in NEO4J_PASSWORD
   ```
3. Create the schema and load the data:
   ```bash
   pip install -r requirements.txt
   python3 scripts/setup_db.py            # add --reset to wipe and reload
   ```
   Expected ending: `TOTAL: 140 nodes, 240 relationships  ->  SUCCESS`
4. Check every query against the independently computed results:
   ```bash
   python3 scripts/verify.py              # expected: 16 passed, 0 failed
   ```
5. Start the API and run the demonstration:
   ```bash
   cd api && npm install && npm start     # http://localhost:3000
   bash ../demo/demo_api.sh               # in a second terminal
   ```
6. Automated tests (no database needed – they use a test double and Neo4j's Cypher linter):
   ```bash
   cd api && npm test                     # 20 tests
   ```

> Property-existence constraints need Neo4j **Enterprise** Edition, which Neo4j Desktop and Aura provide.
> On Community Edition `setup_db.py` skips those two statements with a warning and everything else works.

## Using Neo4j Browser

* `db/03_crud.cypher` – run top to bottom; it creates, reads, updates and deletes its own test records.
* `db/04_queries.cypher` – set parameters first, e.g. `:param suspect_id => 'S001'`, then run a query.
  For V1/V2 switch the result pane to **Graph** to see the network.
* `db/05_indexes.cypher` – `PROFILE` shows which index each query uses.

## REST API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | node and relationship counts |
| GET | `/api/{entity}` | list, with filters `?risk_level=High`, `?type=Fraud`, `?limit=`, `?skip=` |
| GET | `/api/{entity}/{id}` | one node plus a summary of its relationships |
| POST | `/api/{entity}` | create (validated; duplicate key → 409) |
| PATCH | `/api/{entity}/{id}` | partial update (key is immutable) |
| DELETE | `/api/{entity}/{id}` | delete; 409 while relationships exist unless `?detach=true` |
| GET | `/api/relationships/{TYPE}?from=&to=` | list relationships |
| POST / PATCH | `/api/relationships/{TYPE}` | body `{ "from", "to", "properties" }` |
| DELETE | `/api/relationships/{TYPE}?from=&to=` | delete one relationship |
| GET | `/api/analytics` · `/api/analytics/{Q1..A6}` | run any named query; query-string overrides parameters |
| POST | `/api/cases` | register a whole case in **one ACID transaction** |
| PATCH | `/api/cases/{crime_id}/lead` | reassign the lead investigator atomically |
| POST | `/api/demo/rollback` | explicit transaction: begin → write → fail → rollback |

`{entity}` ∈ `suspects, crimes, locations, evidence, officers`.
`{TYPE}` ∈ `KNOWS, COMMITTED, OCCURRED_AT, LINKED_TO, INVESTIGATING, FOUND_AT`.

All data in this repository is fictitious.
