// =====================================================================
// 02_load_csv.cypher  -  Alternative loader for Neo4j Browser / cypher-shell
// 1. Copy every file from data/ into the DBMS "import" folder
//    (Neo4j Desktop: DBMS  ...  > Open folder > Import).
// 2. Run 01_schema.cypher, then run this file statement by statement.
// (scripts/setup_db.py does the same thing without copying files.)
// =====================================================================

// SUSPECTS  <-  suspects.csv
LOAD CSV WITH HEADERS FROM 'file:///suspects.csv' AS row
MERGE (s:Suspect {suspect_id: row.suspect_id})
SET s.first_name    = row.first_name,
    s.last_name     = row.last_name,
    s.alias         = row.alias,
    s.date_of_birth = date(row.date_of_birth),
    s.gender        = row.gender,
    s.risk_level    = row.risk_level,
    s.status        = row.status;

// CRIMES  <-  crimes.csv
LOAD CSV WITH HEADERS FROM 'file:///crimes.csv' AS row
MERGE (c:Crime {crime_id: row.crime_id})
SET c.type        = row.type,
    c.date        = date(row.date),
    c.status      = row.status,
    c.severity    = toInteger(row.severity),
    c.description = row.description;

// LOCATIONS  <-  locations.csv
LOAD CSV WITH HEADERS FROM 'file:///locations.csv' AS row
MERGE (l:Location {location_id: row.location_id})
SET l.address   = row.address,
    l.city      = row.city,
    l.zipcode   = row.zipcode,
    l.latitude  = toFloat(row.latitude),
    l.longitude = toFloat(row.longitude),
    l.area_type = row.area_type;

// EVIDENCE  <-  evidence.csv
LOAD CSV WITH HEADERS FROM 'file:///evidence.csv' AS row
MERGE (e:Evidence {evidence_id: row.evidence_id})
SET e.type            = row.type,
    e.description     = row.description,
    e.collection_date = date(row.collection_date),
    e.custody_status  = row.custody_status;

// OFFICERS  <-  officers.csv
LOAD CSV WITH HEADERS FROM 'file:///officers.csv' AS row
MERGE (o:Officer {badge_number: row.badge_number})
SET o.name             = row.name,
    o.rank             = row.rank,
    o.department       = row.department,
    o.contact_info     = row.contact_info,
    o.years_of_service = toInteger(row.years_of_service);

// KNOWS  <-  rel_knows.csv
LOAD CSV WITH HEADERS FROM 'file:///rel_knows.csv' AS row
MATCH (a:Suspect {suspect_id: row.from_id})
MATCH (b:Suspect {suspect_id: row.to_id})
MERGE (a)-[k:KNOWS]->(b)
SET k.connection_type = row.connection_type,
    k.since           = date(row.since),
    k.strength        = toFloat(row.strength);

// COMMITTED  <-  rel_committed.csv
LOAD CSV WITH HEADERS FROM 'file:///rel_committed.csv' AS row
MATCH (s:Suspect {suspect_id: row.suspect_id})
MATCH (c:Crime {crime_id: row.crime_id})
MERGE (s)-[r:COMMITTED]->(c)
SET r.role            = row.role,
    r.certainty_score = toFloat(row.certainty_score),
    r.charged         = toBoolean(row.charged);

// OCCURRED_AT  <-  rel_occurred_at.csv
LOAD CSV WITH HEADERS FROM 'file:///rel_occurred_at.csv' AS row
MATCH (c:Crime {crime_id: row.crime_id})
MATCH (l:Location {location_id: row.location_id})
MERGE (c)-[r:OCCURRED_AT]->(l)
SET r.time_of_day   = row.time_of_day,
    r.witness_count = toInteger(row.witness_count);

// LINKED_TO  <-  rel_linked_to.csv
LOAD CSV WITH HEADERS FROM 'file:///rel_linked_to.csv' AS row
MATCH (e:Evidence {evidence_id: row.evidence_id})
MATCH (c:Crime {crime_id: row.crime_id})
MERGE (e)-[r:LINKED_TO]->(c)
SET r.relevance_score   = toFloat(row.relevance_score),
    r.processing_status = row.processing_status;

// INVESTIGATING  <-  rel_investigating.csv
LOAD CSV WITH HEADERS FROM 'file:///rel_investigating.csv' AS row
MATCH (o:Officer {badge_number: row.badge_number})
MATCH (c:Crime {crime_id: row.crime_id})
MERGE (o)-[r:INVESTIGATING]->(c)
SET r.assigned_date     = date(row.assigned_date),
    r.lead_investigator = toBoolean(row.lead_investigator);

// FOUND_AT  <-  rel_found_at.csv
LOAD CSV WITH HEADERS FROM 'file:///rel_found_at.csv' AS row
MATCH (e:Evidence {evidence_id: row.evidence_id})
MATCH (l:Location {location_id: row.location_id})
MERGE (e)-[r:FOUND_AT]->(l)
SET r.found_by = row.found_by,
    r.found_on = date(row.found_on);
