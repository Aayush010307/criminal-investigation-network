const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const neo4j = require('neo4j-driver');
const { createApp } = require('../src/app');
const { fakeDb, neoError } = require('./fakeDb');

const suspect = { suspect_id: 'S041', first_name: 'Varun', last_name: 'Kohli', alias: 'Nomad',
  date_of_birth: '1990-06-18', gender: 'Male', risk_level: 'Medium', status: 'Active' };

describe('Node CRUD', () => {
  test('CREATE: valid suspect -> 201 and typed properties', async () => {
    const db = fakeDb(() => ({ rows: [{ n: { labels: ['Suspect'], ...suspect } }], counters: { nodesCreated: 1 } }));
    const res = await request(createApp(db)).post('/api/suspects').send(suspect);
    assert.equal(res.status, 201);
    assert.equal(res.body.created.suspect_id, 'S041');
    const { cypher, params } = db.calls[0];
    assert.match(cypher, /^CREATE \(n:Suspect\) SET n = \$props/);
    assert.ok(params.props.date_of_birth instanceof neo4j.types.Date, 'date stored as Neo4j Date');
  });

  test('CREATE: integer properties are sent as Neo4j Integers', async () => {
    const db = fakeDb(() => ({ rows: [{ n: { crime_id: 'CR031' } }] }));
    await request(createApp(db)).post('/api/crimes').send({ crime_id: 'CR031', type: 'Fraud', date: '2026-09-10', severity: 3 });
    assert.ok(neo4j.isInt(db.calls[0].params.props.severity));
  });

  test('CREATE: invalid body -> 400 with every problem listed', async () => {
    const db = fakeDb();
    const res = await request(createApp(db)).post('/api/suspects').send({ suspect_id: 'X1', risk_level: 'Extreme', date_of_birth: '1990-02-30', shoe: 9 });
    assert.equal(res.status, 400);
    assert.equal(db.calls.length, 0, 'nothing reaches the database');
    const d = res.body.details.join(' | ');
    for (const s of ['Unknown property', 'risk_level must be one of', 'date_of_birth must be a date', "'first_name' is required", 'invalid format']) assert.ok(d.includes(s), s);
  });

  test('CREATE: duplicate key -> 409 (uniqueness constraint)', async () => {
    const db = fakeDb(() => { throw neoError('Neo.ClientError.Schema.ConstraintValidationFailed', "Node(1) already exists with label `Suspect` and property `suspect_id` = 'S001'"); });
    const res = await request(createApp(db)).post('/api/suspects').send({ ...suspect, suspect_id: 'S001' });
    assert.equal(res.status, 409);
  });

  test('READ: list with filter builds a parameterised WHERE clause', async () => {
    const db = fakeDb(() => ({ rows: [{ total: 1, items: [{ labels: ['Suspect'], suspect_id: 'S001' }] }] }));
    const res = await request(createApp(db)).get('/api/suspects?risk_level=High&limit=5');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items, [{ suspect_id: 'S001' }]);
    assert.match(db.calls[0].cypher, /WHERE n\.risk_level = \$f_risk_level/);
    assert.equal(db.calls[0].params.f_risk_level, 'High');
  });

  test('READ: one node, 404 when absent, unknown resource rejected', async () => {
    const app = createApp(fakeDb(() => ({ rows: [] })));
    assert.equal((await request(app).get('/api/suspects/S999')).status, 404);
    assert.equal((await request(app).get('/api/weapons')).status, 404);
  });

  test('UPDATE: key is immutable, other fields are merged', async () => {
    const db = fakeDb(() => ({ rows: [{ n: { suspect_id: 'S041', risk_level: 'High' } }] }));
    const app = createApp(db);
    assert.equal((await request(app).patch('/api/suspects/S041').send({ suspect_id: 'S999' })).status, 400);
    const ok = await request(app).patch('/api/suspects/S041').send({ risk_level: 'High' });
    assert.equal(ok.status, 200);
    assert.match(db.calls[0].cypher, /SET n \+= \$props/);
  });

  test('DELETE: refused while relationships exist, allowed with ?detach=true', async () => {
    const db = fakeDb((c) => (c.includes('COUNT') ? { rows: [{ rels: 3 }] } : { rows: [], counters: { nodesDeleted: 1 } }));
    const app = createApp(db);
    const refused = await request(app).delete('/api/suspects/S041');
    assert.equal(refused.status, 409);
    assert.equal(db.calls.at(-1).event, 'rollback');
    const ok = await request(app).delete('/api/suspects/S041?detach=true');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.relationships_removed, 3);
    assert.match(db.cyphers().at(-1), /DETACH DELETE n/);
  });
});

describe('Relationship CRUD', () => {
  const chk = (hasFrom, hasTo, linked) => (c) => (c.startsWith('OPTIONAL MATCH') ? { rows: [{ hasFrom, hasTo, linked }] } : { rows: [{ properties: { role: 'Principal' } }] });

  test('CREATE: 201 when both ends exist', async () => {
    const db = fakeDb(chk(true, true, false));
    const res = await request(createApp(db)).post('/api/relationships/committed')
      .send({ from: 'S041', to: 'CR031', properties: { role: 'Principal', certainty_score: 0.64, charged: false } });
    assert.equal(res.status, 201);
    assert.match(db.cyphers()[1], /CREATE \(a\)-\[r:COMMITTED\]->\(b\)/);
  });
  test('CREATE: 404 for a missing end node, 409 for a duplicate link', async () => {
    assert.equal((await request(createApp(fakeDb(chk(true, false, false)))).post('/api/relationships/COMMITTED').send({ from: 'S041', to: 'CR999' })).status, 404);
    assert.equal((await request(createApp(fakeDb(chk(true, true, true)))).post('/api/relationships/COMMITTED').send({ from: 'S001', to: 'CR002' })).status, 409);
  });
  test('CREATE: KNOWS with itself is rejected; bad property rejected', async () => {
    const app = createApp(fakeDb(chk(true, true, false)));
    assert.equal((await request(app).post('/api/relationships/KNOWS').send({ from: 'S001', to: 'S001' })).status, 400);
    assert.equal((await request(app).post('/api/relationships/KNOWS').send({ from: 'S001', to: 'S002', properties: { strength: 7 } })).status, 400);
  });
  test('KNOWS is matched without direction; COMMITTED with direction', async () => {
    const db = fakeDb(() => ({ rows: [{ properties: {} , deleted: 1 }] }));
    const app = createApp(db);
    await request(app).patch('/api/relationships/KNOWS').send({ from: 'S001', to: 'S004', properties: { strength: 0.8 } });
    await request(app).delete('/api/relationships/COMMITTED?from=S001&to=CR002');
    assert.match(db.cyphers()[0], /-\[r:KNOWS\]-\(b:Suspect/);
    assert.match(db.cyphers()[1], /-\[r:COMMITTED\]->\(b:Crime/);
  });
  test('unknown relationship type -> 404', async () => {
    assert.equal((await request(createApp(fakeDb())).get('/api/relationships/LIKES')).status, 404);
  });
});

describe('Analytics and transactions', () => {
  test('catalogue lists every named query; parameters can be overridden', async () => {
    const db = fakeDb(() => ({ rows: [{ hops: 4 }] }));
    const app = createApp(db);
    const cat = await request(app).get('/api/analytics');
    assert.ok(cat.body.length >= 16);
    const run = await request(app).get('/api/analytics/Q2?from=S003&to=S019');
    assert.equal(run.status, 200);
    assert.deepEqual(db.calls[0].params, { from: 'S003', to: 'S019' });
  });

  test('POST /api/cases writes everything in one transaction', async () => {
    const db = fakeDb((c, p) => {
      if (c.includes('UNWIND $suspects')) return { rows: [{ linked: p.suspects.map((s) => s.id) }] };
      if (c.includes('UNWIND $evidence')) return { rows: [{ linked: p.evidence.map((e) => e.id) }] };
      return { rows: [{ n: 1 }] };
    });
    const res = await request(createApp(db)).post('/api/cases').send({
      crime: { crime_id: 'CR031', type: 'Fraud', date: '2026-09-10', status: 'Open', severity: 3, description: 'UPI fraud' },
      location_id: 'L014', lead_officer: 'B1202', time_of_day: 'Evening', witness_count: 0,
      suspects: [{ suspect_id: 'S011', role: 'Principal', certainty_score: 0.7 }],
      evidence: [{ evidence_id: 'E017', relevance_score: 0.6, processing_status: 'Pending' }],
    });
    assert.equal(res.status, 201);
    assert.equal(db.cyphers().length, 5);
    assert.equal(db.calls.at(-1).event, 'commit');
  });

  test('POST /api/cases with an unknown suspect rolls the whole case back', async () => {
    const db = fakeDb((c) => (c.includes('UNWIND $suspects') ? { rows: [{ linked: [] }] } : { rows: [{ n: 1, linked: [] }] }));
    const res = await request(createApp(db)).post('/api/cases').send({
      crime: { crime_id: 'CR031', type: 'Fraud', date: '2026-09-10' }, location_id: 'L014', lead_officer: 'B1202',
      suspects: [{ suspect_id: 'S404' }],
    });
    assert.equal(res.status, 404);
    assert.match(res.body.error, /NOT registered/);
    assert.equal(db.calls.at(-1).event, 'rollback');
  });

  test('POST /api/demo/rollback reports counts and rolls back', async () => {
    let created = false;
    const db = fakeDb((c) => {
      if (c.startsWith("CREATE (:Crime")) { created = true; return {}; }
      if (c.startsWith("CREATE (:Suspect")) throw neoError('Neo.ClientError.Schema.ConstraintValidationFailed', 'already exists');
      return { rows: [{ n: created ? 31 : 30 }] };
    });
    const res = await request(createApp(db)).post('/api/demo/rollback');
    assert.equal(res.status, 200);
    assert.equal(res.body.crimes_inside_transaction, 31);
    assert.equal(res.body.failing_statement_error.code, 'Neo.ClientError.Schema.ConstraintValidationFailed');
  });

  test('x-api-key is enforced when configured', async () => {
    const app = createApp(fakeDb(), { apiKey: 'secret' });
    assert.equal((await request(app).get('/api/suspects')).status, 401);
  });
});
