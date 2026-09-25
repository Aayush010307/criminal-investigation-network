// =====================================================================
// 05_indexes.cypher  -  Inspecting constraints/indexes and proving they are used
// Prefix a query with EXPLAIN (plan only) or PROFILE (plan + db hits) in Neo4j Browser.
// =====================================================================

// @name I1
// @title List all constraints
SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties
RETURN name, type, labelsOrTypes, properties ORDER BY name;

// @name I2
// @title List all indexes and their state
SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties, state
RETURN name, type, entityType, labelsOrTypes, properties, state ORDER BY name;

// @name I3
// @title Unique-key lookup -> expected operator NodeUniqueIndexSeek
PROFILE MATCH (s:Suspect {suspect_id: 'S001'}) RETURN s.alias;

// @name I4
// @title Equality on an indexed property -> expected operator NodeIndexSeek (crime_type_idx)
PROFILE MATCH (c:Crime) WHERE c.type = 'Fraud' RETURN count(c);

// @name I5
// @title Range predicate on a date -> expected operator NodeIndexSeekByRange (crime_date_idx)
PROFILE MATCH (c:Crime) WHERE c.date >= date('2026-01-01') RETURN count(c);

// @name I6
// @title Substring search -> expected operator NodeIndexContainsScan (suspect_alias_text)
PROFILE MATCH (s:Suspect) WHERE s.alias CONTAINS 'ho' RETURN s.suspect_id, s.alias;

// @name I7
// @title Relationship-property filter -> expected operator DirectedRelationshipIndexSeekByRange
PROFILE MATCH (s:Suspect)-[r:COMMITTED]->(c:Crime) WHERE r.certainty_score >= 0.9
RETURN s.suspect_id, c.crime_id, r.certainty_score;

// @name I8
// @title Control - property with NO index -> NodeByLabelScan followed by Filter
PROFILE MATCH (e:Evidence) WHERE e.custody_status = 'In Lab' RETURN count(e);

// @name I9
// @title Constraint enforcement - inserting a duplicate key is rejected
// Expected: Neo.ClientError.Schema.ConstraintValidationFailed
//   Node(..) already exists with label `Suspect` and property `suspect_id` = 'S001'
CREATE (:Suspect {suspect_id: 'S001', first_name: 'Duplicate', last_name: 'Entry'});
