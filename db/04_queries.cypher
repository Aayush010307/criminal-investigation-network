// =====================================================================
// 04_queries.cypher  -  Investigative queries (graph traversal + aggregation)
// In Neo4j Browser set the parameters first, e.g.
//   :param suspect_id => 'S001'
// scripts/verify.py runs every query below with the @params shown and checks
// the result against scripts/expected/results.json.
// =====================================================================

// @name Q1
// @title Full profile of a suspect with linked crimes, associates and evidence
// @params {"suspect_id": "S001"}
MATCH (s:Suspect {suspect_id: $suspect_id})
RETURN s.suspect_id AS id,
       s.first_name + ' ' + s.last_name AS name,
       s.alias AS alias,
       s.risk_level AS risk,
       [(s)-[c:COMMITTED]->(cr:Crime) | cr.crime_id + ' ' + cr.type + ' (' + c.role + ')'] AS crimes,
       [(s)-[:KNOWS]-(a:Suspect) | a.suspect_id] AS associates,
       COLLECT { MATCH (s)-[:COMMITTED]->(:Crime)<-[:LINKED_TO]-(e:Evidence)
                 RETURN DISTINCT e.evidence_id } AS evidence;

// @name Q2
// @title Shortest association path between two suspects
// @params {"from": "S002", "to": "S026"}
MATCH (a:Suspect {suspect_id: $from})
MATCH (b:Suspect {suspect_id: $to})
MATCH p = shortestPath((a)-[:KNOWS*..10]-(b))
RETURN [n IN nodes(p) | n.suspect_id + ' ' + n.alias] AS chain,
       length(p) AS hops;

// @name Q3
// @title Everyone within three degrees of a suspect, grouped by degree of separation
// @params {"suspect_id": "S001"}
MATCH p = (s:Suspect {suspect_id: $suspect_id})-[:KNOWS*1..3]-(o:Suspect)
WHERE o <> s
WITH o, min(length(p)) AS degree
RETURN degree, count(o) AS suspects, collect(o.suspect_id) AS ids
ORDER BY degree;

// @name Q4
// @title Repeat offenders - suspects implicated in two or more crimes
// @params {}
MATCH (s:Suspect)-[:COMMITTED]->(c:Crime)
WITH s, count(c) AS crimes, collect(c.crime_id) AS crime_ids
WHERE crimes >= 2
RETURN s.suspect_id AS id, s.alias AS alias, s.risk_level AS risk, crimes, crime_ids
ORDER BY crimes DESC, id;

// @name Q5
// @title Cross-case evidence - items linked to more than one crime
// @params {}
MATCH (e:Evidence)-[:LINKED_TO]->(c:Crime)
WITH e, collect(c.crime_id) AS crimes
WHERE size(crimes) > 1
RETURN e.evidence_id AS id, e.type AS type, e.description AS description, crimes
ORDER BY id;

// @name Q6
// @title Crime hotspots - locations ranked by number of incidents
// @params {}
MATCH (c:Crime)-[:OCCURRED_AT]->(l:Location)
RETURN l.location_id AS id, l.address AS address, l.city AS city,
       count(c) AS incidents, round(avg(c.severity), 2) AS avg_severity
ORDER BY incidents DESC, avg_severity DESC, id
LIMIT 5;

// @name Q7
// @title Chain of custody of an evidence item
// @params {"evidence_id": "E002"}
MATCH (e:Evidence {evidence_id: $evidence_id})
OPTIONAL MATCH (e)-[f:FOUND_AT]->(l:Location)
OPTIONAL MATCH (o:Officer {badge_number: f.found_by})
OPTIONAL MATCH (e)-[lk:LINKED_TO]->(c:Crime)
RETURN e.evidence_id AS id, e.description AS item,
       l.address + ', ' + l.city AS found_at, f.found_on AS found_on,
       o.name AS recovered_by, c.crime_id AS crime, c.type AS crime_type,
       lk.relevance_score AS relevance, lk.processing_status AS processing
ORDER BY relevance DESC;

// @name Q8
// @title Officer workload and case-closure rate by department
// @params {}
MATCH (o:Officer)-[i:INVESTIGATING]->(c:Crime)
WITH o.department AS department,
     count(DISTINCT o) AS officers,
     count(i) AS assignments,
     count(DISTINCT CASE WHEN i.lead_investigator THEN c END) AS cases_led,
     count(DISTINCT CASE WHEN i.lead_investigator AND c.status = 'Closed' THEN c END) AS closed
RETURN department, officers, assignments, cases_led, closed,
       round(100.0 * closed / cases_led, 1) AS closure_rate_pct
ORDER BY cases_led DESC, department;

// @name Q9
// @title Crime trend by quarter with a breakdown by crime type
// @params {}
MATCH (c:Crime)
WITH c.date.year AS year, (c.date.month + 2) / 3 AS q, c.type AS type, count(*) AS n
ORDER BY type
WITH year, q, sum(n) AS total, collect(type + ': ' + toString(n)) AS breakdown
RETURN year, 'Q' + toString(q) AS quarter, total, breakdown
ORDER BY year, quarter;

// @name Q10
// @title Suspects connected to a crime only indirectly, through a known associate
// @params {"crime_id": "CR002"}
MATCH (c:Crime {crime_id: $crime_id})<-[:COMMITTED]-(direct:Suspect)-[k:KNOWS]-(assoc:Suspect)
WHERE NOT EXISTS { (assoc)-[:COMMITTED]->(c) }
RETURN assoc.suspect_id AS id, assoc.alias AS alias, assoc.risk_level AS risk,
       collect(DISTINCT direct.suspect_id) AS linked_through,
       max(k.strength) AS strongest_tie
ORDER BY strongest_tie DESC, id;

// ---------------------------------------------------------------------
// Additional analytics (pure Cypher - no plugins required)
// ---------------------------------------------------------------------

// @name A1
// @title Degree centrality - the most connected suspects (probable brokers)
// @params {}
MATCH (s:Suspect)
RETURN s.suspect_id AS id, s.alias AS alias,
       COUNT { (s)-[:KNOWS]-() } AS associates,
       COUNT { (s)-[:COMMITTED]->() } AS crimes
ORDER BY associates DESC, crimes DESC, id
LIMIT 5;

// @name A2
// @title Co-offender pairs, and whether the pair is already recorded as associates
// @params {}
MATCH (a:Suspect)-[:COMMITTED]->(c:Crime)<-[:COMMITTED]-(b:Suspect)
WHERE a.suspect_id < b.suspect_id
WITH a, b, collect(c.crime_id) AS shared
RETURN a.suspect_id AS suspect_a, b.suspect_id AS suspect_b,
       size(shared) AS shared_crimes, shared,
       EXISTS { (a)-[:KNOWS]-(b) } AS known_associates
ORDER BY shared_crimes DESC, suspect_a, suspect_b
LIMIT 8;

// @name A3
// @title Strong-tie network - reachable only through ties of strength >= threshold
// @params {"suspect_id": "S001", "min_strength": 0.6}
MATCH p = (s:Suspect {suspect_id: $suspect_id})-[:KNOWS*1..3]-(o:Suspect)
WHERE o <> s AND all(r IN relationships(p) WHERE r.strength >= $min_strength)
WITH o, min(length(p)) AS hops
RETURN o.suspect_id AS id, o.alias AS alias, hops
ORDER BY hops, id;

// @name A4
// @title All equally short routes between two suspects
// @params {"from": "S003", "to": "S019"}
MATCH (a:Suspect {suspect_id: $from})
MATCH (b:Suspect {suspect_id: $to})
MATCH p = allShortestPaths((a)-[:KNOWS*..10]-(b))
RETURN [n IN nodes(p) | n.suspect_id] AS route, length(p) AS hops
ORDER BY route;

// @name A5
// @title Full-text case search across crime and evidence descriptions
// @params {"term": "bank"}
CALL db.index.fulltext.queryNodes('case_text_search', $term) YIELD node, score
RETURN labels(node)[0] AS label,
       coalesce(node.crime_id, node.evidence_id) AS id,
       node.description AS description
ORDER BY label, id;

// @name A6
// @title Open leads - crimes with no identified suspect, with their lead officer
// @params {}
MATCH (c:Crime)
WHERE NOT EXISTS { (:Suspect)-[:COMMITTED]->(c) }
MATCH (o:Officer)-[:INVESTIGATING {lead_investigator: true}]->(c)
RETURN c.crime_id AS id, c.type AS type, c.date AS date, c.status AS status, o.name AS lead_officer
ORDER BY id;

// ---------------------------------------------------------------------
// Visual queries - run in Neo4j Browser and switch to the Graph view
// ---------------------------------------------------------------------

// @name V1
// @title Case context - everything within two hops of a crime
// @params {"crime_id": "CR002"}
MATCH p = (c:Crime {crime_id: $crime_id})-[*1..2]-()
RETURN p;

// @name V2
// @title The whole association network (syndicates become visible clusters)
// @params {}
MATCH p = (:Suspect)-[:KNOWS]-(:Suspect)
RETURN p;
