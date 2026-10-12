// =====================================================================
// 99_reset.cypher  -  Remove all investigation nodes and relationships
// (constraints, indexes and :User accounts are kept). Use before re-loading for a clean demo.
// =====================================================================
MATCH (n) WHERE NOT n:User DETACH DELETE n;
