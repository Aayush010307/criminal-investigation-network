// =====================================================================
// 01_schema.cypher  -  Constraints and indexes
// Criminal Investigation Network (BCSE302P - Review 2)
// Run once, before loading data. Every statement is idempotent.
// =====================================================================

// ---------- Uniqueness constraints (each one creates a backing RANGE index)
CREATE CONSTRAINT suspect_id_unique IF NOT EXISTS
FOR (s:Suspect) REQUIRE s.suspect_id IS UNIQUE;

CREATE CONSTRAINT crime_id_unique IF NOT EXISTS
FOR (c:Crime) REQUIRE c.crime_id IS UNIQUE;

CREATE CONSTRAINT location_id_unique IF NOT EXISTS
FOR (l:Location) REQUIRE l.location_id IS UNIQUE;

CREATE CONSTRAINT evidence_id_unique IF NOT EXISTS
FOR (e:Evidence) REQUIRE e.evidence_id IS UNIQUE;

CREATE CONSTRAINT officer_badge_unique IF NOT EXISTS
FOR (o:Officer) REQUIRE o.badge_number IS UNIQUE;

// ---------- Property-existence constraints
// NOTE: require Neo4j Enterprise Edition (bundled with Neo4j Desktop and used by Aura).
// On Community Edition setup_db.py skips them with a warning; the API still
// enforces the same rule through request validation.
CREATE CONSTRAINT crime_type_exists IF NOT EXISTS
FOR (c:Crime) REQUIRE c.type IS NOT NULL;

CREATE CONSTRAINT suspect_name_exists IF NOT EXISTS
FOR (s:Suspect) REQUIRE s.last_name IS NOT NULL;

// ---------- Range indexes on frequent filter predicates (planned in Review 1)
CREATE INDEX crime_type_idx IF NOT EXISTS FOR (c:Crime) ON (c.type);
CREATE INDEX crime_date_idx IF NOT EXISTS FOR (c:Crime) ON (c.date);
CREATE INDEX suspect_risk_idx IF NOT EXISTS FOR (s:Suspect) ON (s.risk_level);
CREATE INDEX location_city_idx IF NOT EXISTS FOR (l:Location) ON (l.city);

// ---------- Added in Review 2
// Relationship-property index: filter associations by confidence without scanning every COMMITTED edge
CREATE INDEX committed_certainty_idx IF NOT EXISTS
FOR ()-[r:COMMITTED]-() ON (r.certainty_score);

// Text index: fast CONTAINS / ENDS WITH search on aliases ("any alias containing 'ho'")
CREATE TEXT INDEX suspect_alias_text IF NOT EXISTS
FOR (s:Suspect) ON (s.alias);

// Full-text (Lucene) index across two labels for free-text case search
CREATE FULLTEXT INDEX case_text_search IF NOT EXISTS
FOR (n:Crime|Evidence) ON EACH [n.description];

// ---------- Added for the final review: application accounts (authentication)
// :User nodes are not part of the investigation graph; they are never linked to it.
CREATE CONSTRAINT user_username_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.username IS UNIQUE;
