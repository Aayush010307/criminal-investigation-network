/**
 * fakeDb.js - an in-memory stand-in for src/db.js used by the tests. It records every Cypher
 * statement the API sends and answers with rows chosen by the test, so routes, validation,
 * error handling and transaction boundaries can be tested without a running Neo4j server.
 */
function fakeDb(responder = () => ({ rows: [] })) {
  const calls = [];
  const exec = async (cypher, params = {}) => {
    calls.push({ cypher, params });
    const out = (await responder(cypher, params)) || {};
    return { rows: out.rows || [], counters: out.counters || {} };
  };
  const txHandle = () => {
    let open = true;
    return {
      run: async (c, p) => { try { return await exec(c, p); } catch (e) { open = false; throw e; } },
      commit: async () => { open = false; calls.push({ event: 'commit' }); },
      rollback: async () => { open = false; calls.push({ event: 'rollback' }); },
      isOpen: () => open,
    };
  };
  return {
    calls,
    cyphers: () => calls.filter((c) => c.cypher).map((c) => c.cypher),
    read: async (c, p) => (await exec(c, p)).rows,
    write: async (c, p) => exec(c, p),
    writeTx: async (work) => {
      const tx = txHandle();
      try { const r = await work(tx); calls.push({ event: 'commit' }); return r; } catch (e) { calls.push({ event: 'rollback' }); throw e; }
    },
    explicitTx: async (work) => {
      const tx = txHandle();
      try { return await work(tx); } finally { if (tx.isOpen()) await tx.rollback(); }
    },
  };
}

function neoError(code, message) { const e = new Error(message); e.code = code; return e; }

/** A supertest agent for the app backed by `db`, signed in with `role` (null = no token at all). */
const SECRET = 'test-secret-0123456789abcdef0123456789';
function client(db, role = 'admin') {
  const request = require('supertest');
  const { createApp } = require('../src/app');
  const { signToken } = require('../src/auth');
  const agent = request.agent(createApp(db, { secret: SECRET, webDist: null }));
  return role ? agent.set('Authorization', `Bearer ${signToken({ sub: `test-${role}`, role }, SECRET)}`) : agent;
}

module.exports = { fakeDb, neoError, client, SECRET };
