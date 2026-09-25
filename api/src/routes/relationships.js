/**
 * relationships.js - CRUD for the six relationship types.
 *   GET    /api/relationships/:type?from=&to=&limit=
 *   POST   /api/relationships/:type          { from, to, properties }
 *   PATCH  /api/relationships/:type          { from, to, properties }
 *   DELETE /api/relationships/:type?from=&to=
 * :type is one of COMMITTED | KNOWS | OCCURRED_AT | LINKED_TO | INVESTIGATING | FOUND_AT
 * KNOWS is symmetric, so it is matched without direction.
 */
const express = require('express');
const { ENTITIES, RELATIONSHIPS } = require('../schema');
const { HttpError, validateProps, intParam } = require('../validate');
const { wrap } = require('./util');

function resolve(type) {
  const rel = RELATIONSHIPS[String(type).toUpperCase()];
  if (!rel) throw new HttpError(404, `Unknown relationship type '${type}'. Use one of: ${Object.keys(RELATIONSHIPS).join(', ')}`);
  const A = ENTITIES[rel.from];
  const B = ENTITIES[rel.to];
  const T = String(type).toUpperCase();
  const arrow = (dir) => (dir ? `-[r:${T}]->` : `-[r:${T}]-`);
  return {
    rel, A, B, T,
    // pattern used when both ends are known
    pair: `(a:${A.label} {${A.key}: $from})${arrow(rel.directed)}(b:${B.label} {${B.key}: $to})`,
  };
}

function ends(body) {
  const { from, to } = body || {};
  if (typeof from !== 'string' || typeof to !== 'string') throw new HttpError(400, "'from' and 'to' (node keys) are required");
  return { from, to };
}

module.exports = (db) => {
  const r = express.Router();

  // READ
  r.get('/:type', wrap(async (req, res) => {
    const { rel, A, B, T } = resolve(req.params.type);
    const from = req.query.from ?? null;
    const to = req.query.to ?? null;
    const undirected = !rel.directed && (from !== null || to !== null);
    const cypher =
      `MATCH (a:${A.label})-[r:${T}]-${undirected ? '' : '>'}(b:${B.label})\n` +
      `WHERE ($from IS NULL OR a.${A.key} = $from) AND ($to IS NULL OR b.${B.key} = $to)\n` +
      `RETURN a.${A.key} AS from, b.${B.key} AS to, properties(r) AS properties\n` +
      'ORDER BY from, to LIMIT $limit';
    const rows = await db.read(cypher, { from, to, limit: intParam(req.query.limit, 100, 1, 500) });
    res.json({ type: T, count: rows.length, items: rows });
  }));

  // CREATE - both endpoints must exist and the pair must not already be linked
  r.post('/:type', wrap(async (req, res) => {
    const { rel, A, B, T, pair } = resolve(req.params.type);
    const { from, to } = ends(req.body);
    if (T === 'KNOWS' && from === to) throw new HttpError(400, 'A suspect cannot KNOW themselves');
    const props = validateProps(req.body.properties || {}, rel, { partial: true, allowEmpty: true });
    const out = await db.writeTx(async (tx) => {
      const { rows } = await tx.run(
        `OPTIONAL MATCH (a:${A.label} {${A.key}: $from})\n` +
        `OPTIONAL MATCH (b:${B.label} {${B.key}: $to})\n` +
        `RETURN a IS NOT NULL AS hasFrom, b IS NOT NULL AS hasTo,\n` +
        `       CASE WHEN a IS NULL OR b IS NULL THEN false ELSE EXISTS { (a)-[:${T}]-(b) } END AS linked`,
        { from, to });
      const chk = rows[0];
      if (!chk.hasFrom) throw new HttpError(404, `${A.label} '${from}' not found`);
      if (!chk.hasTo) throw new HttpError(404, `${B.label} '${to}' not found`);
      if (chk.linked) throw new HttpError(409, `${from} -[:${T}]- ${to} already exists; use PATCH to change it`);
      const created = await tx.run(
        `MATCH (a:${A.label} {${A.key}: $from}) MATCH (b:${B.label} {${B.key}: $to})\n` +
        `CREATE (a)-[r:${T}]->(b) SET r = $props\n` +
        'RETURN properties(r) AS properties', { from, to, props });
      return { type: T, from, to, properties: created.rows[0].properties, counters: created.counters };
    });
    res.status(201).json(out);
  }));

  // UPDATE
  r.patch('/:type', wrap(async (req, res) => {
    const { rel, T, pair } = resolve(req.params.type);
    const { from, to } = ends(req.body);
    const props = validateProps(req.body.properties, rel, { partial: true });
    const { rows, counters } = await db.write(`MATCH ${pair} SET r += $props RETURN properties(r) AS properties`, { from, to, props });
    if (!rows.length) throw new HttpError(404, `${from} -[:${T}]- ${to} not found`);
    res.json({ type: T, from, to, properties: rows[0].properties, counters });
  }));

  // DELETE
  r.delete('/:type', wrap(async (req, res) => {
    const { T, pair } = resolve(req.params.type);
    const { from, to } = ends(req.query);
    const { rows } = await db.write(`MATCH ${pair} DELETE r RETURN count(*) AS deleted`, { from, to });
    if (!rows.length || rows[0].deleted === 0) throw new HttpError(404, `${from} -[:${T}]- ${to} not found`);
    res.json({ type: T, from, to, deleted: rows[0].deleted });
  }));

  return r;
};
