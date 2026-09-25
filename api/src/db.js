/**
 * db.js - thin wrapper around the official Neo4j JavaScript driver.
 *  read()      auto-routed READ transaction (managed, retried on transient errors)
 *  write()     WRITE transaction for a single statement
 *  writeTx()   several statements in ONE managed transaction - all succeed or all roll back
 *  explicitTx() hand-controlled transaction (begin / commit / rollback) used for the rollback demo
 */
const neo4j = require('neo4j-driver');

function toPlain(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(toPlain);
  if (neo4j.isDate(v) || neo4j.isDateTime(v) || neo4j.isLocalDateTime(v) || neo4j.isTime(v) || neo4j.isDuration(v)) return v.toString();
  if (neo4j.isInt(v)) return v.toNumber();
  if (v instanceof neo4j.types.Node) return { labels: v.labels, ...toPlain(v.properties) };
  if (v instanceof neo4j.types.Relationship) return { type: v.type, ...toPlain(v.properties) };
  if (v instanceof neo4j.types.Path) return v.segments.map((s) => ({ start: toPlain(s.start), rel: toPlain(s.relationship), end: toPlain(s.end) }));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
}
const rows = (result) => result.records.map((r) => toPlain(r.toObject()));

function wrapTx(tx) {
  return { run: async (cypher, params = {}) => { const res = await tx.run(cypher, params); return { rows: rows(res), counters: res.summary.counters.updates() }; } };
}

function createDb({ uri, user, password, database }) {
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), { disableLosslessIntegers: true });
  const session = (mode) => driver.session({ database, defaultAccessMode: mode });
  return {
    driver,
    async read(cypher, params = {}) {
      const s = session(neo4j.session.READ);
      try { return rows(await s.executeRead((tx) => tx.run(cypher, params))); } finally { await s.close(); }
    },
    async write(cypher, params = {}) {
      const s = session(neo4j.session.WRITE);
      try {
        const res = await s.executeWrite((tx) => tx.run(cypher, params));
        return { rows: rows(res), counters: res.summary.counters.updates() };
      } finally { await s.close(); }
    },
    async writeTx(work) {
      const s = session(neo4j.session.WRITE);
      try { return await s.executeWrite((tx) => work(wrapTx(tx))); } finally { await s.close(); }
    },
    async explicitTx(work) {
      const s = session(neo4j.session.WRITE);
      const tx = s.beginTransaction();
      const handle = { ...wrapTx(tx), commit: () => tx.commit(), rollback: () => tx.rollback(), isOpen: () => tx.isOpen() };
      try { return await work(handle); } finally { if (tx.isOpen()) await tx.rollback(); await s.close(); }
    },
    async close() { await driver.close(); },
  };
}

module.exports = { createDb, toPlain };
