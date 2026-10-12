// =====================================================================
// 07_gds.cypher  -  Graph Data Science (GDS plugin) algorithms on the suspect association network
// Requires the Neo4j Graph Data Science plugin (tested with GDS 2.13 on Neo4j 5.26).
// The API (GET /api/gds/:algorithm) runs gds_project -> algorithm -> gds_drop with a unique
// $graph name per request. In Neo4j Browser:  :param graph => 'suspects'  then run top to bottom.
// =====================================================================

// @name gds_version
// @title Installed GDS version (fails with "Unknown function" when the plugin is missing)
// @params {}
RETURN gds.version() AS version;

// @name gds_project
// @title In-memory projection: Suspect nodes + KNOWS ties (undirected, weighted by strength)
// @params {"graph": "suspects"}
MATCH (a:Suspect)
OPTIONAL MATCH (a)-[r:KNOWS]->(b:Suspect)
WITH gds.graph.project($graph, a, b, {relationshipProperties: r {.strength}},
                       {undirectedRelationshipTypes: ['*']}) AS g
RETURN g.nodeCount AS nodes, g.relationshipCount AS relationships;

// @name louvain
// @title Louvain community detection - criminal syndicates (weighted by tie strength)
// @params {"graph": "suspects"}
CALL gds.louvain.stream($graph, {relationshipWeightProperty: 'strength'})
YIELD nodeId, communityId
WITH gds.util.asNode(nodeId) AS s, communityId
RETURN communityId AS community, s.suspect_id AS id, s.alias AS alias, s.risk_level AS risk
ORDER BY community, id;

// @name pagerank
// @title PageRank - suspects that are tied to other well-connected suspects
// @params {"graph": "suspects"}
CALL gds.pageRank.stream($graph)
YIELD nodeId, score
WITH gds.util.asNode(nodeId) AS s, score
RETURN s.suspect_id AS id, s.alias AS alias, s.risk_level AS risk, round(score, 4) AS score
ORDER BY score DESC, id;

// @name betweenness
// @title Betweenness centrality - brokers that sit on the shortest paths between other suspects
// @params {"graph": "suspects"}
CALL gds.betweenness.stream($graph)
YIELD nodeId, score
WITH gds.util.asNode(nodeId) AS s, score
RETURN s.suspect_id AS id, s.alias AS alias, s.risk_level AS risk, round(score, 2) AS score
ORDER BY score DESC, id;

// @name gds_drop
// @title Release the in-memory projection
// @params {"graph": "suspects"}
CALL gds.graph.drop($graph, false) YIELD graphName
RETURN graphName;
