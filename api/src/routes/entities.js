/**
 * entities.js - generic CRUD for the five node labels.
 *   GET    /api/:entity              list (filters, ?q= text search, ?limit, ?skip)
 *   GET    /api/:entity/:id          one node + a summary of its relationships
 *   POST   /api/:entity              create
 *   PATCH  /api/:entity/:id          partial update (the key property is immutable)
 *   DELETE /api/:entity/:id          delete; refused with 409 if relationships exist unless ?detach=true
 * :entity is one of suspects | crimes | locations | evidence | officers
 */
const express = require('express');
const { ENTITIES } = require('../schema');
const { HttpError, validateProps, intParam } = require('../validate');
const { wrap } = require('./util');

const strip = (node) => { const { labels, ...props } = node; return props; };

module.exports = (db) => {
  const r = express.Router();
  const defOf = (req) => {
    const d = ENTITIES[req.params.entity];
    if (!d) throw new HttpError(404, `Unknown resource '${req.params.entity}'. Use one of: ${Object.keys(ENTITIES).join(', ')}`);
    return d;
  };

  // READ - list with optional filters
  r.get('/:entity', wrap(async (req, res) => {
    const d = defOf(req);
    const params = { skip: intParam(req.query.skip, 0, 0, 1e6), limit: intParam(req.query.limit, 25, 1, 200) };
    const filterInput = Object.fromEntries(d.filters.filter((f) => req.query[f] !== undefined).map((f) => [f, req.query[f]]));
    const filters = Object.keys(filterInput).length ? validateProps(filterInput, d, { partial: true }) : {};
    const where = Object.keys(filters).map((f) => `n.${f} = $f_${f}`);
    if (typeof req.query.q === 'string' && req.query.q.trim()) {         // case-insensitive match on any property
      where.push('any(k IN keys(n) WHERE toLower(toString(n[k])) CONTAINS $q)');
      params.q = req.query.q.trim().toLowerCase().slice(0, 100);
    }
    Object.entries(filters).forEach(([f, v]) => { params[`f_${f}`] = v; });
    const cypher =
      `MATCH (n:${d.label})${where.length ? ' WHERE ' + where.join(' AND ') : ''}\n` +
      `WITH n ORDER BY n.${d.key}\n` +
      'WITH collect(n) AS matched\n' +
      'RETURN size(matched) AS total, matched[toInteger($skip)..toInteger($skip) + toInteger($limit)] AS items';
    const [row] = await db.read(cypher, params);
    res.json({ total: row.total, skip: Number(params.skip), limit: Number(params.limit), items: row.items.map(strip) });
  }));

  // READ - one
  r.get('/:entity/:id', wrap(async (req, res) => {
    const d = defOf(req);
    const rows = await db.read(
      `MATCH (n:${d.label} {${d.key}: $id})\n` +
      'OPTIONAL MATCH (n)-[rel]-()\n' +
      'WITH n, type(rel) AS t, count(rel) AS c\n' +
      'RETURN n, collect(CASE WHEN t IS NULL THEN null ELSE {type: t, count: c} END) AS relationships',
      { id: req.params.id });
    if (!rows.length) throw new HttpError(404, `${d.label} '${req.params.id}' not found`);
    res.json({ ...strip(rows[0].n), relationships: rows[0].relationships });
  }));

  // CREATE
  r.post('/:entity', wrap(async (req, res) => {
    const d = defOf(req);
    const props = validateProps(req.body, d);
    const { rows, counters } = await db.write(`CREATE (n:${d.label}) SET n = $props RETURN n`, { props });
    res.status(201).json({ created: strip(rows[0].n), counters });
  }));

  // UPDATE (partial). A property sent as null is removed.
  r.patch('/:entity/:id', wrap(async (req, res) => {
    const d = defOf(req);
    const props = validateProps(req.body, d, { partial: true, immutable: [d.key] });
    const { rows, counters } = await db.write(`MATCH (n:${d.label} {${d.key}: $id}) SET n += $props RETURN n`, { id: req.params.id, props });
    if (!rows.length) throw new HttpError(404, `${d.label} '${req.params.id}' not found`);
    res.json({ updated: strip(rows[0].n), counters });
  }));

  // DELETE - check and delete inside one transaction so nothing can attach in between
  r.delete('/:entity/:id', wrap(async (req, res) => {
    const d = defOf(req);
    const detach = req.query.detach === 'true';
    const result = await db.writeTx(async (tx) => {
      const { rows } = await tx.run(`MATCH (n:${d.label} {${d.key}: $id}) RETURN COUNT { (n)--() } AS rels`, { id: req.params.id });
      if (!rows.length) throw new HttpError(404, `${d.label} '${req.params.id}' not found`);
      if (rows[0].rels > 0 && !detach) {
        throw new HttpError(409, `${d.label} '${req.params.id}' still has ${rows[0].rels} relationship(s). Delete them first or repeat with ?detach=true`);
      }
      const del = await tx.run(`MATCH (n:${d.label} {${d.key}: $id}) DETACH DELETE n`, { id: req.params.id });
      return { deleted: req.params.id, relationships_removed: rows[0].rels, counters: del.counters };
    });
    res.json(result);
  }));

  return r;
};
