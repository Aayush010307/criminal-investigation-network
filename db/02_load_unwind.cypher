// =====================================================================
// 02_load_unwind.cypher  -  Parameterised batch loaders used by scripts/setup_db.py
// Each statement receives $rows (a list of maps read from the matching CSV file)
// and uses UNWIND + MERGE, so re-running the loader never creates duplicates.
// =====================================================================

// @name load_suspects
// @file suspects.csv
UNWIND $rows AS row
MERGE (s:Suspect {suspect_id: row.suspect_id})
SET s.first_name    = row.first_name,
    s.last_name     = row.last_name,
    s.alias         = row.alias,
    s.date_of_birth = date(row.date_of_birth),
    s.gender        = row.gender,
    s.risk_level    = row.risk_level,
    s.status        = row.status;

// @name load_crimes
// @file crimes.csv
UNWIND $rows AS row
MERGE (c:Crime {crime_id: row.crime_id})
SET c.type        = row.type,
    c.date        = date(row.date),
    c.status      = row.status,
    c.severity    = toInteger(row.severity),
    c.description = row.description;

// @name load_locations
// @file locations.csv
UNWIND $rows AS row
MERGE (l:Location {location_id: row.location_id})
SET l.address   = row.address,
    l.city      = row.city,
    l.zipcode   = row.zipcode,
    l.latitude  = toFloat(row.latitude),
    l.longitude = toFloat(row.longitude),
    l.area_type = row.area_type;

// @name load_evidence
// @file evidence.csv
UNWIND $rows AS row
MERGE (e:Evidence {evidence_id: row.evidence_id})
SET e.type            = row.type,
    e.description     = row.description,
    e.collection_date = date(row.collection_date),
    e.custody_status  = row.custody_status;

// @name load_officers
// @file officers.csv
UNWIND $rows AS row
MERGE (o:Officer {badge_number: row.badge_number})
SET o.name             = row.name,
    o.rank             = row.rank,
    o.department       = row.department,
    o.contact_info     = row.contact_info,
    o.years_of_service = toInteger(row.years_of_service);

// @name load_knows
// @file rel_knows.csv
UNWIND $rows AS row
MATCH (a:Suspect {suspect_id: row.from_id})
MATCH (b:Suspect {suspect_id: row.to_id})
MERGE (a)-[k:KNOWS]->(b)
SET k.connection_type = row.connection_type,
    k.since           = date(row.since),
    k.strength        = toFloat(row.strength);

// @name load_committed
// @file rel_committed.csv
UNWIND $rows AS row
MATCH (s:Suspect {suspect_id: row.suspect_id})
MATCH (c:Crime {crime_id: row.crime_id})
MERGE (s)-[r:COMMITTED]->(c)
SET r.role            = row.role,
    r.certainty_score = toFloat(row.certainty_score),
    r.charged         = toBoolean(row.charged);

// @name load_occurred_at
// @file rel_occurred_at.csv
UNWIND $rows AS row
MATCH (c:Crime {crime_id: row.crime_id})
MATCH (l:Location {location_id: row.location_id})
MERGE (c)-[r:OCCURRED_AT]->(l)
SET r.time_of_day   = row.time_of_day,
    r.witness_count = toInteger(row.witness_count);

// @name load_linked_to
// @file rel_linked_to.csv
UNWIND $rows AS row
MATCH (e:Evidence {evidence_id: row.evidence_id})
MATCH (c:Crime {crime_id: row.crime_id})
MERGE (e)-[r:LINKED_TO]->(c)
SET r.relevance_score   = toFloat(row.relevance_score),
    r.processing_status = row.processing_status;

// @name load_investigating
// @file rel_investigating.csv
UNWIND $rows AS row
MATCH (o:Officer {badge_number: row.badge_number})
MATCH (c:Crime {crime_id: row.crime_id})
MERGE (o)-[r:INVESTIGATING]->(c)
SET r.assigned_date     = date(row.assigned_date),
    r.lead_investigator = toBoolean(row.lead_investigator);

// @name load_found_at
// @file rel_found_at.csv
UNWIND $rows AS row
MATCH (e:Evidence {evidence_id: row.evidence_id})
MATCH (l:Location {location_id: row.location_id})
MERGE (e)-[r:FOUND_AT]->(l)
SET r.found_by = row.found_by,
    r.found_on = date(row.found_on);
