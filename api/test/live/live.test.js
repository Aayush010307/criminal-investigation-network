/**
 * live.test.js - integration tests against a REAL Neo4j database (npm run test:live).
 * Needs Neo4j running with the dataset loaded (python3 scripts/setup_db.py) and the settings in ../.env.
 * It only touches its own temporary records (ids S9999, CR9999, E9999) and users named live_*,
 * and removes them at the end. The GDS tests need the Graph Data Science plugin.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const request = require('supertest');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });
const { createDb } = require('../../src/db');
const { createApp } = require('../../src/app');
const { ensureAdmin } = require('../../src/auth');

const db = createDb({ uri: process.env.NEO4J_URI || 'neo4j://localhost:7687', user: process.env.NEO4J_USER || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password', database: process.env.NEO4J_DATABASE || 'neo4j' });
const app = createApp(db, { secret: crypto.randomBytes(32).toString('hex'), webDist: null });
const tag = crypto.randomBytes(3).toString('hex');
const ADMIN = { username: `live_admin_${tag}`, password: crypto.randomBytes(12).toString('hex') };
const USER = { username: `live_user_${tag}`, password: crypto.randomBytes(12).toString('hex') };
const TEMP = { suspect: 'S9999', crime: 'CR9999', evidence: 'E9999' };
const tokens = {};
const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

async function cleanup() {
  await db.write('MATCH (n) WHERE n.suspect_id = $s OR n.crime_id = $c OR n.evidence_id = $e DETACH DELETE n', { s: TEMP.suspect, c: TEMP.crime, e: TEMP.evidence });
  await db.write("MATCH (u:User) WHERE u.username STARTS WITH 'live_' DELETE u");
}

before(async () => {
  await db.driver.verifyConnectivity();
  await cleanup();
  await ensureAdmin(db, ADMIN.username, ADMIN.password);
  tokens.admin = (await request(app).post('/api/auth/login').send(ADMIN)).body.token;
});
after(async () => { await cleanup(); await db.close(); });

describe('Database and schema', () => {
  test('dataset is loaded: 140 nodes, 240 relationships (users excluded)', async () => {
    const res = await request(app).get('/api/health').set(as('admin'));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.nodes, { Crime: 30, Evidence: 35, Location: 20, Officer: 15, Suspect: 40 });
    assert.equal(res.body.relationships, 240);
  });
  test('uniqueness constraints and indexes exist', async () => {
    const cons = (await db.read('SHOW CONSTRAINTS YIELD name, type RETURN name, type')).map((c) => c.name);
    for (const n of ['suspect_id_unique', 'crime_id_unique', 'location_id_unique', 'evidence_id_unique', 'officer_badge_unique', 'user_username_unique']) assert.ok(cons.includes(n), n);
    const idx = (await db.read("SHOW INDEXES YIELD name, type, state WHERE state = 'ONLINE' RETURN name, type")).map((i) => `${i.name}:${i.type}`);
    for (const n of ['crime_type_idx:RANGE', 'crime_date_idx:RANGE', 'suspect_risk_idx:RANGE', 'location_city_idx:RANGE',
      'committed_certainty_idx:RANGE', 'suspect_alias_text:TEXT', 'case_text_search:FULLTEXT']) assert.ok(idx.includes(n), n);
  });
});

describe('Authentication and authorisation (real database)', () => {
  test('register -> viewer, login, wrong password rejected, hash never returned', async () => {
    const reg = await request(app).post('/api/auth/register').send(USER);
    assert.equal(reg.status, 201);
    assert.equal(reg.body.user.role, 'viewer');
    assert.equal((await request(app).post('/api/auth/register').send(USER)).status, 409);
    assert.equal((await request(app).post('/api/auth/login').send({ ...USER, password: 'wrong-password' })).status, 401);
    const login = await request(app).post('/api/auth/login').send(USER);
    assert.equal(login.status, 200);
    tokens.user = login.body.token;
    const [stored] = await db.read('MATCH (u:User {username: $u}) RETURN u.password_hash AS h', { u: USER.username });
    assert.match(stored.h, /^scrypt\$/);
    assert.ok(!stored.h.includes(USER.password));
  });
  test('viewer cannot write; admin promotes to investigator; investigator still cannot delete', async () => {
    const body = { suspect_id: TEMP.suspect, first_name: 'Live', last_name: 'Test', alias: 'Probe', risk_level: 'Low' };
    assert.equal((await request(app).post('/api/suspects').set(as('user')).send(body)).status, 403);
    assert.equal((await request(app).patch(`/api/auth/users/${USER.username}`).set(as('admin')).send({ role: 'investigator' })).status, 200);
    tokens.user = (await request(app).post('/api/auth/login').send(USER)).body.token;   // new token carries the new role
    assert.equal((await request(app).post('/api/suspects').set(as('user')).send(body)).status, 201);
    assert.equal((await request(app).post('/api/suspects').set(as('user')).send(body)).status, 409, 'uniqueness constraint');
    assert.equal((await request(app).delete(`/api/suspects/${TEMP.suspect}`).set(as('user'))).status, 403);
    assert.equal((await request(app).get(`/api/suspects/${TEMP.suspect}`).set(as('user'))).body.alias, 'Probe');
  });
});

describe('CRUD, graph and shortest path (real database)', () => {
  test('relationship create / read / update / delete', async () => {
    const rel = { from: TEMP.suspect, to: 'S001', properties: { connection_type: 'Associate', strength: 0.3 } };
    assert.equal((await request(app).post('/api/relationships/KNOWS').set(as('user')).send(rel)).status, 201);
    assert.equal((await request(app).post('/api/relationships/KNOWS').set(as('user')).send(rel)).status, 409);
    const upd = await request(app).patch('/api/relationships/KNOWS').set(as('user')).send({ from: 'S001', to: TEMP.suspect, properties: { strength: 0.9 } });
    assert.equal(upd.body.properties.strength, 0.9, 'KNOWS matched in either direction');
    const list = await request(app).get(`/api/relationships/KNOWS?from=${TEMP.suspect}`).set(as('user'));
    assert.equal(list.body.count, 1);
    assert.equal((await request(app).delete(`/api/relationships/KNOWS?from=${TEMP.suspect}&to=S001`).set(as('admin'))).status, 200);
  });
  test('neighbourhood of S001 and text search', async () => {
    const g = await request(app).get('/api/graph/node/S001').set(as('user'));
    assert.equal(g.status, 200);
    assert.equal(g.body.center, 'S001');
    assert.ok(g.body.edges.every((e) => e.source === 'S001' || e.target === 'S001'));
    const [{ n }] = await db.read('MATCH (:Suspect {suspect_id: "S001"})--(m) RETURN count(DISTINCT m) AS n');
    assert.equal(g.body.nodes.length, n + 1);
    const search = await request(app).get('/api/suspects?q=probe').set(as('user'));
    assert.deepEqual(search.body.items.map((s) => s.suspect_id), [TEMP.suspect]);
  });
  test('shortest path agrees with query Q2, and an isolated suspect has no path', async () => {
    const path2 = await request(app).get('/api/graph/path?from=S002&to=S026').set(as('user'));
    const q2 = await request(app).get('/api/analytics/Q2?from=S002&to=S026').set(as('user'));
    assert.equal(path2.body.found, true);
    assert.equal(path2.body.hops, q2.body.rows[0].hops);
    assert.deepEqual(path2.body.order, q2.body.rows[0].chain.map((c) => c.split(' ')[0]));
    const none = await request(app).get(`/api/graph/path?from=S001&to=${TEMP.suspect}`).set(as('user'));
    assert.equal(none.status, 200);
    assert.equal(none.body.found, false);
    assert.equal((await request(app).get('/api/graph/path?from=S001&to=S0404').set(as('user'))).status, 404);
  });
  test('overview graph honours label and type filters', async () => {
    const g = await request(app).get('/api/graph?labels=Suspect&types=KNOWS').set(as('user'));
    assert.ok(g.body.nodes.every((n) => n.label === 'Suspect'));
    assert.ok(g.body.edges.every((e) => e.type === 'KNOWS'));
    assert.equal(g.body.edges.length, 60);
  });
});

describe('Transactions (real database)', () => {
  const kase = { crime: { crime_id: TEMP.crime, type: 'Fraud', date: '2026-10-01', status: 'Open', severity: 2, description: 'Live test case' },
    location_id: 'L001', lead_officer: 'B1202', suspects: [{ suspect_id: TEMP.suspect, role: 'Principal' }] };
  test('a case with an unknown suspect is rolled back completely', async () => {
    const res = await request(app).post('/api/cases').set(as('user')).send({ ...kase, suspects: [{ suspect_id: 'S0404' }] });
    assert.equal(res.status, 404);
    assert.equal((await db.read('MATCH (c:Crime {crime_id: $id}) RETURN c', { id: TEMP.crime })).length, 0);
  });
  test('a valid case is registered atomically; lead reassignment keeps one lead', async () => {
    assert.equal((await request(app).post('/api/cases').set(as('user')).send(kase)).status, 201);
    const lead = await request(app).patch(`/api/cases/${TEMP.crime}/lead`).set(as('user')).send({ badge_number: 'B1210' });
    assert.deepEqual([lead.body.previous_lead, lead.body.new_lead], [['B1202'], 'B1210']);
    const leads = await db.read('MATCH (o:Officer)-[:INVESTIGATING {lead_investigator: true}]->(:Crime {crime_id: $id}) RETURN o.badge_number AS b', { id: TEMP.crime });
    assert.deepEqual(leads.map((l) => l.b), ['B1210']);
  });
  test('explicit transaction demo rolls back', async () => {
    const res = await request(app).post('/api/demo/rollback').set(as('user'));
    assert.equal(res.body.rolled_back, true);
    assert.equal(res.body.crimes_inside_transaction, res.body.crimes_before + 1);
  });
});

describe('Graph Data Science (real plugin)', () => {
  test('GDS is installed', async () => {
    const st = await request(app).get('/api/gds/status').set(as('user'));
    assert.equal(st.body.available, true, 'install the GDS plugin - see README');
  });
  test('Louvain partitions every suspect exactly once', async () => {
    const res = await request(app).get('/api/gds/louvain').set(as('user'));
    assert.equal(res.status, 200);
    const ids = res.body.communities.flatMap((c) => c.members.map((m) => m.id));
    const [{ n }] = await db.read('MATCH (s:Suspect) RETURN count(s) AS n');
    assert.equal(ids.length, n);
    assert.equal(new Set(ids).size, n);
    assert.ok(res.body.communities.length > 1 && res.body.communities.length < n);
    assert.equal(res.body.projection.relationships, 120, '60 KNOWS ties, undirected = 120');
    // ground truth from scripts/generate_data.py: syndicate A (S001-S010) is a dense cluster
    const a = res.body.communities.find((c) => c.members.some((m) => m.id === 'S001'));
    assert.deepEqual(a.members.map((m) => m.id).sort(), ['S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S008', 'S009', 'S010']);
  });
  test('betweenness ranks the three planted syndicate brokers (S001, S011, S020) highest', async () => {
    const res = await request(app).get('/api/gds/betweenness').set(as('user'));
    assert.deepEqual(res.body.rows.slice(0, 3).map((r) => r.id).sort(), ['S001', 'S011', 'S020']);
  });
  test('PageRank and betweenness rank suspects; the projections are released', async () => {
    for (const algo of ['pagerank', 'betweenness']) {
      const res = await request(app).get(`/api/gds/${algo}`).set(as('user'));
      assert.equal(res.status, 200, algo);
      assert.ok(res.body.rows[0].score >= res.body.rows.at(-1).score);
    }
    const left = await db.read("CALL gds.graph.list() YIELD graphName WHERE graphName STARTS WITH 'cin_' RETURN graphName");
    assert.deepEqual(left, []);
  });
});

describe('Admin delete (real database)', () => {
  test('admin removes the temporary suspect with its relationships', async () => {
    assert.equal((await request(app).delete(`/api/suspects/${TEMP.suspect}`).set(as('admin'))).status, 409);
    const res = await request(app).delete(`/api/suspects/${TEMP.suspect}?detach=true`).set(as('admin'));
    assert.equal(res.status, 200);
    assert.equal((await request(app).get(`/api/suspects/${TEMP.suspect}`).set(as('admin'))).status, 404);
  });
});
