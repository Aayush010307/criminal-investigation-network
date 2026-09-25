// =====================================================================
// 99_reset.cypher  -  Remove ALL nodes and relationships
// (constraints and indexes are kept). Use before re-loading for a clean demo.
// =====================================================================
MATCH (n) DETACH DELETE n;
