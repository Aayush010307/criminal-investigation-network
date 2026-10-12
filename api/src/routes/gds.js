/**
 * gds.js - Neo4j Graph Data Science algorithms (db/07_gds.cypher) on the suspect association network.
 *   GET /api/gds/status                  { available, version } - never fails, reports a missing plugin
 *   GET /api/gds/louvain                 communities (syndicates), largest first
 *   GET /api/gds/pagerank | betweenness  ranked suspects
 * Each request projects its own uniquely named in-memory graph and always drops it afterwards.
 */
const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { parseCypherFile } = require('../queries');
const { HttpError } = require('../validate');
const { wrap } = require('./util');

const Q = Object.fromEntries(parseCypherFile(path.join(__dirname, '..', '..', '..', 'db', '07_gds.cypher')).map((q) => [q.name, q]));
const ALGORITHMS = ['louvain', 'pagerank', 'betweenness'];
const missingPlugin = (e) => /Unknown function 'gds\.|no procedure with the name `gds\./i.test(e.message || '');

module.exports = (db) => {
  const r = express.Router();

  r.get('/status', wrap(async (req, res) => {
    try {
      const [row] = await db.read(Q.gds_version.cypher);
      res.json({ available: true, version: row.version });
    } catch (e) {
      if (!missingPlugin(e)) throw e;
      res.json({ available: false, reason: 'The Neo4j Graph Data Science plugin is not installed on this database' });
    }
  }));

  r.get('/:algorithm', wrap(async (req, res) => {
    const algorithm = req.params.algorithm.toLowerCase();
    if (!ALGORITHMS.includes(algorithm)) throw new HttpError(404, `Unknown algorithm '${req.params.algorithm}'. Use one of: ${ALGORITHMS.join(', ')}`);
    const graph = `cin_${crypto.randomUUID()}`;
    const t0 = Date.now();
    let projection;
    let rows;
    try {
      [projection] = (await db.write(Q.gds_project.cypher, { graph })).rows;
      rows = await db.read(Q[algorithm].cypher, { graph });
    } catch (e) {
      if (missingPlugin(e)) throw new HttpError(503, 'Graph Data Science plugin is not installed on this Neo4j database - see README, section "Graph Data Science"');
      throw e;
    } finally {
      await db.write(Q.gds_drop.cypher, { graph }).catch(() => {});
    }
    const out = { algorithm, title: Q[algorithm].title, engine: 'Neo4j Graph Data Science', projection, ms: Date.now() - t0 };
    if (algorithm === 'louvain') {
      const groups = new Map();
      for (const { community, ...member } of rows) groups.set(community, [...(groups.get(community) || []), member]);
      out.communities = [...groups].map(([community, members]) => ({ community, size: members.length, members }))
        .sort((a, b) => b.size - a.size || a.community - b.community);
    } else out.rows = rows;
    res.json(out);
  }));

  return r;
};
