# Demonstration script

About 15 minutes. The story: _an investigator opens a narcotics case, inspects the main suspect, follows the
evidence and locations, finds how two suspects are connected, uncovers the syndicates and their brokers, records a new lead, and shows that only an administrator can delete._

## Before the presentation (T-30 min)

```bash
docker start cin-neo4j                  # or start the DBMS in Neo4j Desktop; wait ~30 s
python3 scripts/setup_db.py             # TOTAL: 140 nodes, 240 relationships -> SUCCESS
python3 scripts/verify.py               # 21 passed, 0 failed
cd web && npm run build && cd ..        # only if web/ changed since the last build
cd api && npm start                     # "Connected to Neo4j", "Listening on http://localhost:3000"
```

- Open http://localhost:3000 in a normal browser window, zoom 100 %.
- Have the admin password from `.env` ready (do not show `.env` on the projector).
- Prepare an **investigator** account for step 9: register `inspector1` on the sign-in page, then, as admin,
  set it to _investigator_ on **Users**.
- If the data was changed during rehearsal: `python3 scripts/setup_db.py --reset` (keeps user accounts).

## Live walkthrough

| #   | Do                                                                                                                                                      | Say / expected result                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Show the terminal with `npm start` running and the Neo4j container/DBMS                                                                                 | Three tiers: Neo4j (+GDS) ← Express API ← React UI, one origin                                                                                                                                                                              |
| 2   | Sign in with a **wrong** password, then as `admin`                                                                                                      | "Invalid username or password"; then the dashboard. Passwords are scrypt-hashed, and the token is HMAC-signed and expires after 8 h                                                                                                         |
| 3   | **Dashboard**                                                                                                                                           | Live counts 40 / 30 / 20 / 35 / 15 / 240, case status bar, open leads CR028–CR030 (A6), hotspots, repeat offenders, most connected                                                                                                          |
| 4   | _Graph explorer_: centre on `CR002`, depth **2 hops**, **Show**                                                                                         | The case context (query V1): suspects, evidence, location L001, officers                                                                                                                                                                    |
| 5   | Click suspect **S001 Ghost**, read the side panel, click **Expand neighbours**                                                                          | Properties plus 13 connections; the graph grows in place. Use Fit / zoom / filters (untick _Officer_)                                                                                                                                       |
| 6   | _Records → Suspects_, search `ghost`, filter risk = _High_, open **S001**                                                                               | Search over any property, enum filters, relationships list with properties                                                                                                                                                                  |
| 7   | _Analytics → Shortest path_: **S002 → S026** (KNOWS)                                                                                                    | Chain S002 → S001 → S009 → S027 → S020 → S026, **5 hops**, drawn as a path. Then **S001 → L005** with _any relationship_: S001 → CR009 → L005                                                                                               |
| 8   | _Analytics → Communities & centrality_: run **Louvain**, then **Betweenness**                                                                           | Louvain recovers the planted syndicates (S001–S010 always together). Betweenness top 3 = **S020, S011, S001**, the brokers the generator planted. The algorithms are real GDS procedures on an in-memory projection, dropped after each run |
| 9   | Sign out, sign in as **inspector1** (investigator). _Records → Suspects → New Suspect_: `S041`, `Varun`, `Kohli`, alias `Nomad`, risk `Medium` → Create | Record created (validated; an empty form shows the required fields). **Add relationship**: KNOWS → `S011`, strength `0.5`                                                                                                                   |
| 10  | Still as inspector1                                                                                                                                     | There is no Delete button. Say: the server refuses DELETE for this role (403). This is tested, and the UI only mirrors it                                                                                                                   |
| 11  | Sign in as **admin**, open S041 → **Delete**                                                                                                            | 409 "still has 1 relationship" → **Delete with relationships** removes it. Destructive operations are admin-only                                                                                                                            |
| 12  | _Analytics → Query library_: run **Q4**, **Q10** (CR002), **A5** (`bank`)                                                                               | Ten-plus investigative queries, each verified against a Python re-implementation                                                                                                                                                            |
| 13  | Terminal: `AUTO=1 bash demo/demo_api.sh` (or only steps 6 and 6b)                                                                                       | **Transactions**: a whole case registered atomically; one bad suspect id rolls the _entire_ case back (CR032 never exists); explicit begin → fail → rollback                                                                                |
| 14  | Terminal: `cd api && npm test` (≈10 s) and `python3 scripts/verify.py`                                                                                  | 41 unit tests, 21 database verifications. Optional: `npm run test:live` (16 integration tests on the real database)                                                                                                                         |

## Questions you may be asked

- **Why a graph database?** Multi-hop questions (paths, "within 3 degrees", brokers) are pattern traversals,
  not chains of joins. Compare Q3, or the shortest path, with the equivalent recursive SQL.
- **How do you prevent Cypher injection?** Values are always parameters. Labels, types and depth cannot be
  parameters, so they come only from whitelists in `schema.js`. The browser can only choose predefined queries.
- **How is authorisation enforced?** In one middleware for every `/api` request, by HTTP method and role. A
  forged or modified token fails the HMAC check.
- **Is the degree count PageRank?** No. A1 is degree centrality in plain Cypher; PageRank and betweenness are GDS
  procedures and are labelled as such.
- **Is Louvain deterministic?** Not completely; weakly tied suspects can switch communities between runs, while the
  dense syndicates stay stable.

## Fallbacks

| Problem                                              | What to do                                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neo4j will not start / port 7687 busy                | `docker ps -a`, `docker logs cin-neo4j`; stop another Neo4j using the port. Last resort: present the real screenshots in `docs/screenshots/` and run `cd api && npm test` (needs no database), and say clearly that the database is not running |
| GDS plugin missing (e.g. a fresh Neo4j Desktop DBMS) | The Analytics page shows "GDS not installed". Install it (Desktop → Plugins) and restart the DBMS, or demonstrate degree centrality (A1) and say that Louvain/PageRank/betweenness need the plugin. Do not present A1 as Louvain                |
| Forgot the admin password                            | It is in `.env` (`ADMIN_PASSWORD`). If it was changed after the account was created, remove the user in Neo4j Browser (`MATCH (u:User {username:'admin'}) DELETE u`) and restart the API to re-create it from `.env`                            |
| Signed out unexpectedly                              | Tokens expire after `TOKEN_TTL_HOURS`; the API restarting with a _missing_ `AUTH_SECRET` also signs everyone out. Sign in again                                                                                                                 |
| Port 3000 in use                                     | `PORT=3001` in `.env`, restart the API                                                                                                                                                                                                          |
| Data changed during the demo                         | `python3 scripts/setup_db.py --reset`                                                                                                                                                                                                           |
