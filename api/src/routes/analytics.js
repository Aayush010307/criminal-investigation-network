/**
 * analytics.js - exposes every named query of db/04_queries.cypher over HTTP.
 *   GET /api/analytics            catalogue (name, title, default parameters)
 *   GET /api/analytics/:name      run it; query-string values override the defaults,
 *                                 e.g. /api/analytics/Q2?from=S003&to=S019
 */
const express = require('express');
const neo4j = require('neo4j-driver');
const { QUERIES } = require('../queries');
const { HttpError } = require('../validate');
const { wrap } = require('./util');

function buildParams(q, query) {
  const params = { ...q.params };
  for (const [k, dflt] of Object.entries(q.params)) {
    if (query[k] === undefined) continue;
    if (typeof dflt === 'number') {
      const n = Number(query[k]);
      if (!Number.isFinite(n)) throw new HttpError(400, `Parameter '${k}' must be numeric`);
      params[k] = Number.isInteger(dflt) ? neo4j.int(n) : n;
    } else params[k] = String(query[k]);
  }
  return params;
}

module.exports = (db) => {
  const r = express.Router();
  r.get('/', (req, res) => {
    res.json(Object.values(QUERIES).map(({ name, title, params }) => ({ name, title, params, url: `/api/analytics/${name}` })));
  });
  r.get('/:name', wrap(async (req, res) => {
    const q = QUERIES[req.params.name.toUpperCase()];
    if (!q) throw new HttpError(404, `Unknown query '${req.params.name}'`);
    const params = buildParams(q, req.query);
    const t0 = Date.now();
    const rows = await db.read(q.cypher, params);
    res.json({ name: q.name, title: q.title, params, ms: Date.now() - t0, count: rows.length, rows });
  }));
  return r;
};
