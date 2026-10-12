const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fakeDb, client } = require('./fakeDb');

const S = (id, alias) => ({ labels: ['Suspect'], suspect_id: id, alias, first_name: 'F', last_name: 'L' });

describe('Graph explorer endpoints', () => {
  test('neighbourhood: nodes are keyed by their id and edges keep direction', async () => {
    const db = fakeDb(() => ({ rows: [{ center: S('S001', 'Ghost'), edges: [{ type: 'COMMITTED', from: S('S001', 'Ghost'), to: { labels: ['Crime'], crime_id: 'CR002', type: 'Narcotics' }, props: { role: 'Principal' } }] }] }));
    const res = await client(db, 'viewer').get('/api/graph/node/S001?depth=2');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.nodes.map((n) => [n.id, n.label, n.caption]), [['S001', 'Suspect', 'Ghost'], ['CR002', 'Crime', 'Narcotics']]);
    assert.deepEqual(res.body.edges[0], { source: 'S001', target: 'CR002', type: 'COMMITTED', props: { role: 'Principal' } });
    assert.match(db.calls[0].cypher, /MATCH \(c:Suspect \{suspect_id: \$id\}\)[\s\S]*\[\*1\.\.2\]/);
  });
  test('neighbourhood: invalid id 400, depth out of range 400, missing node 404', async () => {
    const app = client(fakeDb(), 'viewer');
    assert.equal((await app.get("/api/graph/node/x' OR 1=1")).status, 400);
    assert.equal((await app.get('/api/graph/node/S001?depth=5')).status, 400);
    assert.equal((await app.get('/api/graph/node/S999')).status, 404);
  });
  test('overview rejects unknown labels and relationship types', async () => {
    const app = client(fakeDb(), 'viewer');
    assert.equal((await app.get('/api/graph?labels=User')).status, 400);
    assert.equal((await app.get('/api/graph?types=LIKES')).status, 400);
  });
  test('shortest path: input validation', async () => {
    const app = client(fakeDb(), 'viewer');
    assert.equal((await app.get('/api/graph/path?from=S001')).status, 400);
    assert.equal((await app.get('/api/graph/path?from=S001&to=S001')).status, 400);
    assert.equal((await app.get('/api/graph/path?from=S001&to=CR002')).status, 400, 'KNOWS paths connect suspects only');
    assert.equal((await app.get('/api/graph/path?from=S001&to=S002&via=magic')).status, 400);
  });
  test('shortest path: unknown end node 404; no path -> found:false', async () => {
    const missing = client(fakeDb(() => ({ rows: [{ hasFrom: true, hasTo: false }] })), 'viewer');
    assert.equal((await missing.get('/api/graph/path?from=S001&to=S099')).status, 404);
    const db = fakeDb((c) => (c.startsWith('OPTIONAL') ? { rows: [{ hasFrom: true, hasTo: true }] } : { rows: [] }));
    const res = await client(db, 'viewer').get('/api/graph/path?from=S001&to=S040');
    assert.equal(res.status, 200);
    assert.equal(res.body.found, false);
    assert.match(db.calls[1].cypher, /shortestPath\(\(a\)-\[:KNOWS\*\.\.10\]-\(b\)\)/);
  });
  test('shortest path: ordered chain and hop count', async () => {
    const db = fakeDb((c) => (c.startsWith('OPTIONAL') ? { rows: [{ hasFrom: true, hasTo: true }] } : { rows: [{
      nodes: [S('S002', 'A'), S('S007', 'B'), S('S026', 'C')],
      edges: [{ type: 'KNOWS', from: S('S007', 'B'), to: S('S002', 'A'), props: {} }, { type: 'KNOWS', from: S('S007', 'B'), to: S('S026', 'C'), props: {} }] }] }));
    const res = await client(db, 'viewer').get('/api/graph/path?from=S002&to=S026');
    assert.equal(res.body.found, true);
    assert.equal(res.body.hops, 2);
    assert.deepEqual(res.body.order, ['S002', 'S007', 'S026']);
  });
});

describe('Graph Data Science endpoints', () => {
  test('louvain groups members by community; the projection is always dropped', async () => {
    const db = fakeDb((c) => {
      if (c.includes('gds.graph.project')) return { rows: [{ nodes: 3, relationships: 2 }] };
      if (c.includes('gds.louvain')) return { rows: [{ community: 7, id: 'S001' }, { community: 7, id: 'S002' }, { community: 9, id: 'S003' }] };
      return { rows: [] };
    });
    const res = await client(db, 'viewer').get('/api/gds/louvain');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.communities.map((x) => [x.community, x.size]), [[7, 2], [9, 1]]);
    const graphs = db.calls.map((c) => c.params.graph);
    assert.ok(graphs.every((g) => g === graphs[0] && /^cin_/.test(g)), 'one uniquely named projection per request');
    assert.match(db.cyphers().at(-1), /gds\.graph\.drop/);
  });
  test('missing plugin -> 503 from algorithms, available:false from status; drop still attempted', async () => {
    const err = () => { throw new Error("Unknown function 'gds.version'"); };
    const db = fakeDb((c) => (c.includes('gds.graph.drop') ? { rows: [] } : err()));
    const res = await client(db, 'viewer').get('/api/gds/pagerank');
    assert.equal(res.status, 503);
    assert.match(db.cyphers().at(-1), /gds\.graph\.drop/);
    const st = await client(fakeDb(err), 'viewer').get('/api/gds/status');
    assert.deepEqual(st.body.available, false);
  });
  test('unknown algorithm -> 404, no database call', async () => {
    const db = fakeDb();
    assert.equal((await client(db, 'viewer').get('/api/gds/kmeans')).status, 404);
    assert.equal(db.calls.length, 0);
  });
});

describe('Error responses', () => {
  test('unexpected errors return a generic 500 without internal details', async () => {
    const db = fakeDb(() => { throw new Error('secret internal detail at bolt://10.0.0.5'); });
    const orig = console.error; console.error = () => {};
    const res = await client(db, 'viewer').get('/api/suspects');
    console.error = orig;
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Internal error' });
  });
});
