// =====================================================================
// 03_crud.cypher  -  CRUD on every node label and every relationship type
// Run top-to-bottom in Neo4j Browser. The script creates its own test records
// (S041, CR031, L021, E036, B1216), exercises C-R-U-D on each and removes them,
// so the loaded dataset is unchanged afterwards.
// =====================================================================

// ------------------------------------------------------------- NODE CRUD
// @name C_suspect
CREATE (s:Suspect {suspect_id: 'S041', first_name: 'Varun', last_name: 'Kohli', alias: 'Nomad',
                   date_of_birth: date('1990-06-18'), gender: 'Male', risk_level: 'Medium', status: 'Active'})
RETURN s;

// @name R_suspect
MATCH (s:Suspect {suspect_id: 'S041'})
RETURN s.suspect_id, s.first_name + ' ' + s.last_name AS name, s.alias, s.risk_level, s.status;

// @name U_suspect
MATCH (s:Suspect {suspect_id: 'S041'})
SET s.risk_level = 'High', s.status = 'Detained'
RETURN s.suspect_id, s.risk_level, s.status;

// @name C_crime
CREATE (c:Crime {crime_id: 'CR031', type: 'Fraud', date: date('2026-09-10'), status: 'Open',
                 severity: 3, description: 'UPI payment fraud targeting senior citizens'})
RETURN c;

// @name R_crime
MATCH (c:Crime {crime_id: 'CR031'}) RETURN c.crime_id, c.type, c.date, c.status, c.severity;

// @name U_crime
MATCH (c:Crime {crime_id: 'CR031'})
SET c.status = 'Under Investigation', c.severity = 4
RETURN c.crime_id, c.status, c.severity;

// @name C_location
CREATE (l:Location {location_id: 'L021', address: '14 Residency Road', city: 'Bengaluru', zipcode: '560025',
                    latitude: 12.9667, longitude: 77.6080, area_type: 'Commercial'})
RETURN l;

// @name R_location
MATCH (l:Location {location_id: 'L021'}) RETURN l.location_id, l.address, l.city, l.area_type;

// @name U_location
MATCH (l:Location {location_id: 'L021'}) SET l.area_type = 'Public' RETURN l.location_id, l.area_type;

// @name C_evidence
CREATE (e:Evidence {evidence_id: 'E036', type: 'Digital', description: 'Mobile wallet transaction logs',
                    collection_date: date('2026-09-11'), custody_status: 'In Lab'})
RETURN e;

// @name R_evidence
MATCH (e:Evidence {evidence_id: 'E036'}) RETURN e.evidence_id, e.type, e.description, e.custody_status;

// @name U_evidence
MATCH (e:Evidence {evidence_id: 'E036'}) SET e.custody_status = 'Archived' RETURN e.evidence_id, e.custody_status;

// @name C_officer
CREATE (o:Officer {badge_number: 'B1216', name: 'SI. R. Kamath', rank: 'Sub-Inspector', department: 'Cyber Cell',
                   contact_info: 'r.kamath@police.example', years_of_service: 4})
RETURN o;

// @name R_officer
MATCH (o:Officer {badge_number: 'B1216'}) RETURN o.badge_number, o.name, o.rank, o.department;

// @name U_officer
MATCH (o:Officer {badge_number: 'B1216'}) SET o.rank = 'Inspector', o.years_of_service = 5
RETURN o.badge_number, o.rank, o.years_of_service;

// ------------------------------------------------------------- UPSERT (idempotent create-or-update)
// @name MERGE_upsert
MERGE (s:Suspect {suspect_id: 'S041'})
ON CREATE SET s.created_at = datetime()
ON MATCH  SET s.last_seen  = date('2026-09-12')
RETURN s.suspect_id, s.last_seen;

// ------------------------------------------------------------- RELATIONSHIP CRUD
// @name C_committed
MATCH (s:Suspect {suspect_id: 'S041'})
MATCH (c:Crime {crime_id: 'CR031'})
CREATE (s)-[r:COMMITTED {role: 'Principal', certainty_score: 0.64, charged: false}]->(c)
RETURN s.suspect_id, type(r), c.crime_id, r.role, r.certainty_score;

// @name R_committed
MATCH (s:Suspect {suspect_id: 'S041'})-[r:COMMITTED]->(c:Crime)
RETURN s.suspect_id, c.crime_id, r.role, r.certainty_score, r.charged;

// @name U_committed
MATCH (:Suspect {suspect_id: 'S041'})-[r:COMMITTED]->(:Crime {crime_id: 'CR031'})
SET r.certainty_score = 0.9, r.charged = true
RETURN r.certainty_score, r.charged;

// @name C_knows
MATCH (a:Suspect {suspect_id: 'S041'})
MATCH (b:Suspect {suspect_id: 'S011'})
CREATE (a)-[k:KNOWS {connection_type: 'Financial', since: date('2024-01-15'), strength: 0.5}]->(b)
RETURN a.suspect_id, type(k), b.suspect_id, k.connection_type;

// @name R_knows
MATCH (a:Suspect {suspect_id: 'S041'})-[k:KNOWS]-(b:Suspect)
RETURN a.suspect_id, b.suspect_id, b.alias, k.connection_type, k.strength;

// @name U_knows
MATCH (:Suspect {suspect_id: 'S041'})-[k:KNOWS]-(:Suspect {suspect_id: 'S011'})
SET k.strength = 0.7 RETURN k.strength;

// @name C_occurred_at
MATCH (c:Crime {crime_id: 'CR031'})
MATCH (l:Location {location_id: 'L021'})
CREATE (c)-[r:OCCURRED_AT {time_of_day: 'Afternoon', witness_count: 1}]->(l)
RETURN c.crime_id, type(r), l.location_id;

// @name R_occurred_at
MATCH (c:Crime {crime_id: 'CR031'})-[r:OCCURRED_AT]->(l:Location)
RETURN c.crime_id, l.address, r.time_of_day, r.witness_count;

// @name U_occurred_at
MATCH (:Crime {crime_id: 'CR031'})-[r:OCCURRED_AT]->(:Location)
SET r.witness_count = 3 RETURN r.witness_count;

// @name C_linked_to
MATCH (e:Evidence {evidence_id: 'E036'})
MATCH (c:Crime {crime_id: 'CR031'})
CREATE (e)-[r:LINKED_TO {relevance_score: 0.8, processing_status: 'Pending'}]->(c)
RETURN e.evidence_id, type(r), c.crime_id;

// @name R_linked_to
MATCH (e:Evidence {evidence_id: 'E036'})-[r:LINKED_TO]->(c:Crime)
RETURN e.evidence_id, c.crime_id, r.relevance_score, r.processing_status;

// @name U_linked_to
MATCH (:Evidence {evidence_id: 'E036'})-[r:LINKED_TO]->(:Crime {crime_id: 'CR031'})
SET r.processing_status = 'Analysed' RETURN r.processing_status;

// @name C_investigating
MATCH (o:Officer {badge_number: 'B1216'})
MATCH (c:Crime {crime_id: 'CR031'})
CREATE (o)-[r:INVESTIGATING {assigned_date: date('2026-09-11'), lead_investigator: true}]->(c)
RETURN o.badge_number, type(r), c.crime_id;

// @name R_investigating
MATCH (o:Officer)-[r:INVESTIGATING]->(c:Crime {crime_id: 'CR031'})
RETURN o.name, r.assigned_date, r.lead_investigator;

// @name U_investigating
MATCH (:Officer {badge_number: 'B1216'})-[r:INVESTIGATING]->(:Crime {crime_id: 'CR031'})
SET r.lead_investigator = false RETURN r.lead_investigator;

// @name C_found_at
MATCH (e:Evidence {evidence_id: 'E036'})
MATCH (l:Location {location_id: 'L021'})
CREATE (e)-[r:FOUND_AT {found_by: 'B1216', found_on: date('2026-09-11')}]->(l)
RETURN e.evidence_id, type(r), l.location_id;

// @name R_found_at
MATCH (e:Evidence {evidence_id: 'E036'})-[r:FOUND_AT]->(l:Location)
RETURN e.evidence_id, l.address, r.found_by, r.found_on;

// @name U_found_at
MATCH (:Evidence {evidence_id: 'E036'})-[r:FOUND_AT]->(:Location)
SET r.found_on = date('2026-09-12') RETURN r.found_on;

// ------------------------------------------------------------- RELATIONSHIP DELETE
// @name D_committed
MATCH (:Suspect {suspect_id: 'S041'})-[r:COMMITTED]->(:Crime {crime_id: 'CR031'}) DELETE r;
// @name D_knows
MATCH (:Suspect {suspect_id: 'S041'})-[k:KNOWS]-(:Suspect {suspect_id: 'S011'}) DELETE k;
// @name D_occurred_at
MATCH (:Crime {crime_id: 'CR031'})-[r:OCCURRED_AT]->(:Location {location_id: 'L021'}) DELETE r;
// @name D_linked_to
MATCH (:Evidence {evidence_id: 'E036'})-[r:LINKED_TO]->(:Crime {crime_id: 'CR031'}) DELETE r;
// @name D_investigating
MATCH (:Officer {badge_number: 'B1216'})-[r:INVESTIGATING]->(:Crime {crime_id: 'CR031'}) DELETE r;

// ------------------------------------------------------------- NODE DELETE
// A plain DELETE is refused while the node still has relationships (E036 is still FOUND_AT L021):
//   Neo.ClientError.Schema.ConstraintValidationFailed
//   "Cannot delete node<..>, because it still has relationships. To delete this node, you must
//    first delete its relationships."
// @name D_evidence_refused
MATCH (e:Evidence {evidence_id: 'E036'}) DELETE e;

// Remove the last relationship explicitly, after which the plain DELETE succeeds.
// @name D_found_at
MATCH (:Evidence {evidence_id: 'E036'})-[r:FOUND_AT]->(:Location {location_id: 'L021'}) DELETE r;
// @name D_evidence
MATCH (e:Evidence {evidence_id: 'E036'}) DELETE e;

// DETACH DELETE removes a node together with any relationships it still has
// (the safe choice from application code - see API route DELETE ?detach=true).
// @name D_suspect
MATCH (s:Suspect {suspect_id: 'S041'}) DETACH DELETE s;
// @name D_crime
MATCH (c:Crime {crime_id: 'CR031'}) DETACH DELETE c;
// @name D_location
MATCH (l:Location {location_id: 'L021'}) DETACH DELETE l;
// @name D_officer
MATCH (o:Officer {badge_number: 'B1216'}) DETACH DELETE o;

// @name check_clean
// Expected result: 140 (the dataset is back to its original state)
MATCH (n) RETURN count(n) AS nodes;
