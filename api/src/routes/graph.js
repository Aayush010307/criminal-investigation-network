/**
 * graph.js - node/edge data for the graph explorer.
 *   GET /api/graph?labels=Suspect,Crime&types=KNOWS,COMMITTED&limit=   overview, filtered by label and type
 *   GET /api/graph/node/:id?depth=1|2                                   a node and its neighbourhood
 *   GET /api/graph/path?from=&to=&via=knows|any                         shortest path between two nodes
 * Every response is { nodes: [{id, label, caption, props}], edges: [{source, target, type, props}] }.
 * The id of a node is its key property (S001, CR002, L003, E004, B1205), which is unique across labels.
 * Labels, types and depth come from whitelists; ids are always Cypher parameters.
 */
const express = require('express');
const { ENTITIES, RELATIONSHIPS } = require('../schema');
const { HttpError, intParam } = require('../validate');
const { wrap } = require('./util');

const DEFS = Object.values(ENTITIES);
const LABELS = DEFS.map((d) => d.label);
const CAPTION = { Suspect: (p) => p.alias || `${p.first_name} ${p.last_name}`, Crime: (p) => p.type, Location: (p) => p.address,
  Evidence: (p) => p.type, Officer: (p) => p.name };

function node(n) {
  const { labels, ...props } = n;
  const label = labels.find((l) => LABELS.includes(l));
  const def = DEFS.find((d) => d.label === label);
  return { id: props[def.key], label, caption: CAPTION[label](props), props };
}
const edge = (e) => ({ source: node(e.from).id, target: node(e.to).id, type: e.type, props: e.props });

function graphOf(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const e of edges) for (const n of [e.from, e.to]) { const x = node(n); byId.set(x.id, x); }
  return { nodes: [...byId.values()], edges: edges.map(edge) };
}

function list(value, allowed, name) {
  if (value === undefined || value === '') return allowed;
  const items = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = items.filter((i) => !allowed.includes(i));
  if (bad.length) throw new HttpError(400, `Unknown ${name}: ${bad.join(', ')}. Use: ${allowed.join(', ')}`);
  return items;
}

/** Which entity an id belongs to, from its key format (S001 -> Suspect ...). */
function entityOf(id) {
  const def = DEFS.find((d) => d.keyPattern.test(String(id)));
  if (!def) throw new HttpError(400, `'${id}' is not a valid id (expected e.g. S001, CR002, L003, E004 or B1205)`);
  return def;
}

const EDGE_PROJECTION = 'type: type(r), from: startNode(r), to: endNode(r), props: properties(r)';

module.exports = (db) => {
  const r = express.Router();

  r.get('/', wrap(async (req, res) => {
    const labels = list(req.query.labels, LABELS, 'label');
    const types = list(req.query.types, Object.keys(RELATIONSHIPS), 'relationship type');
    const limit = intParam(req.query.limit, 600, 1, 2000);
    const [row] = await db.read(
      'MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)\n' +
      'WITH collect(n) AS ns\n' +
      'OPTIONAL MATCH (a)-[r]->(b) WHERE type(r) IN $types AND a IN ns AND b IN ns\n' +
      `WITH ns, collect({${EDGE_PROJECTION}})[..$limit] AS es\n` +
      'RETURN ns[..$limit] AS nodes, [e IN es WHERE e.type IS NOT NULL] AS edges',
      { labels, types, limit });
    res.json({ ...graphOf(row.nodes.map(node), row.edges), truncated: row.nodes.length >= Number(limit) || row.edges.length >= Number(limit) });
  }));

  r.get('/node/:id', wrap(async (req, res) => {
    const def = entityOf(req.params.id);
    const depth = Number(intParam(req.query.depth, 1, 1, 2));
    const rows = await db.read(
      `MATCH (c:${def.label} {${def.key}: $id})\n` +
      `OPTIONAL MATCH p = (c)-[*1..${depth}]-()\n` +
      'UNWIND CASE WHEN p IS NULL THEN [null] ELSE relationships(p) END AS r\n' +
      'WITH c, collect(DISTINCT r) AS rels\n' +
      `RETURN c AS center, [r IN rels | {${EDGE_PROJECTION}}] AS edges`,
      { id: req.params.id });
    if (!rows.length) throw new HttpError(404, `${def.label} '${req.params.id}' not found`);
    const center = node(rows[0].center);
    res.json({ center: center.id, depth, ...graphOf([center], rows[0].edges) });
  }));

  r.get('/path', wrap(async (req, res) => {
    const { from, to } = req.query;
    if (typeof from !== 'string' || typeof to !== 'string') throw new HttpError(400, "'from' and 'to' are required");
    if (from === to) throw new HttpError(400, "'from' and 'to' must be different nodes");
    const via = (req.query.via || 'knows').toLowerCase();
    if (!['knows', 'any'].includes(via)) throw new HttpError(400, "'via' must be 'knows' (association ties only) or 'any' (every relationship type)");
    const A = entityOf(from);
    const B = entityOf(to);
    if (via === 'knows' && (A.label !== 'Suspect' || B.label !== 'Suspect')) throw new HttpError(400, "via=knows connects suspects only; use via=any for other nodes");

    const [chk] = await db.read(
      `OPTIONAL MATCH (a:${A.label} {${A.key}: $from}) OPTIONAL MATCH (b:${B.label} {${B.key}: $to})\n` +
      'RETURN a IS NOT NULL AS hasFrom, b IS NOT NULL AS hasTo', { from, to });
    if (!chk.hasFrom) throw new HttpError(404, `${A.label} '${from}' not found`);
    if (!chk.hasTo) throw new HttpError(404, `${B.label} '${to}' not found`);

    const rows = await db.read(
      `MATCH (a:${A.label} {${A.key}: $from}) MATCH (b:${B.label} {${B.key}: $to})\n` +
      `MATCH p = shortestPath((a)-[${via === 'knows' ? ':KNOWS' : ''}*..10]-(b))\n` +
      `RETURN nodes(p) AS nodes, [r IN relationships(p) | {${EDGE_PROJECTION}}] AS edges`,
      { from, to });
    if (!rows.length) return res.json({ found: false, from, to, via, hops: null, nodes: [], edges: [] });
    const nodes = rows[0].nodes.map(node);
    return res.json({ found: true, from, to, via, hops: rows[0].edges.length, order: nodes.map((n) => n.id), nodes, edges: rows[0].edges.map(edge) });
  }));

  return r;
};
