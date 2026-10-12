const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fakeDb, client, SECRET } = require('./fakeDb');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../src/auth');

const HASH = hashPassword('correct horse');
// answers the login lookup with one stored account; everything else gets an empty result
const users = (role = 'investigator') => fakeDb((c) => (c.startsWith('MATCH (u:User {username: $username}) RETURN')
  ? { rows: [{ username: 'asha', role, hash: HASH }] } : { rows: [] }));

describe('Passwords and tokens', () => {
  test('scrypt hashes are salted and verify only the right password', () => {
    const a = hashPassword('s3cret-pass');
    assert.match(a, /^scrypt\$[\w-]+\$[\w-]+$/);
    assert.notEqual(a, hashPassword('s3cret-pass'), 'random salt per hash');
    assert.ok(!a.includes('s3cret-pass'));
    assert.equal(verifyPassword('s3cret-pass', a), true);
    assert.equal(verifyPassword('s3cret-pasS', a), false);
  });
  test('tokens: valid, tampered, wrong secret and expired', () => {
    const t = signToken({ sub: 'asha', role: 'viewer' }, SECRET);
    assert.equal(verifyToken(t, SECRET).sub, 'asha');
    const [body, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'asha', role: 'admin', exp: 9e9 })).toString('base64url');
    assert.equal(verifyToken(`${forged}.${mac}`, SECRET), null, 'role cannot be changed without the secret');
    assert.equal(verifyToken(`${body}.${mac}`, 'another-secret'), null);
    assert.equal(verifyToken(signToken({ sub: 'asha', role: 'viewer' }, SECRET, -1), SECRET), null, 'expired');
  });
});

describe('Authentication endpoints', () => {
  test('login with valid credentials returns a working token and never the hash', async () => {
    const app = client(users(), null);
    const res = await app.post('/api/auth/login').send({ username: 'asha', password: 'correct horse' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user, { username: 'asha', role: 'investigator' });
    assert.ok(!JSON.stringify(res.body).includes('scrypt'));
    const me = await app.get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.role, 'investigator');
  });
  test('wrong password and unknown user are both 401 with the same message', async () => {
    const wrong = await client(users(), null).post('/api/auth/login').send({ username: 'asha', password: 'wrong horse' });
    const unknown = await client(fakeDb(), null).post('/api/auth/login').send({ username: 'nobody', password: 'correct horse' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error, unknown.body.error);
    assert.equal(wrong.body.token, undefined);
  });
  test('repeated failures are locked out with 429', async () => {
    const app = client(users(), null);
    const bad = { username: 'lockme', password: 'guess-guess' };   // own name: counters are per ip+username
    for (let i = 0; i < 10; i++) assert.equal((await app.post('/api/auth/login').send(bad)).status, 401);
    assert.equal((await app.post('/api/auth/login').send(bad)).status, 429);
    assert.equal((await app.post('/api/auth/login').send({ username: 'lockme', password: 'correct horse' })).status, 429);
  });
  test('invalid registration data -> 400 and nothing reaches the database', async () => {
    const db = fakeDb();
    const res = await client(db, null).post('/api/auth/register').send({ username: 'A!', password: 'short' });
    assert.equal(res.status, 400);
    assert.equal(res.body.details.length, 2);
    assert.equal(db.calls.length, 0);
  });
  test('registration stores only a hash and creates a viewer; a taken name is 409', async () => {
    const db = fakeDb((c, p) => ({ rows: [{ created: true, username: p.username, role: 'viewer', created_at: '2026-10-12' }] }));
    const res = await client(db, null).post('/api/auth/register').send({ username: 'ravi', password: 'long-enough' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'viewer');
    assert.match(db.calls[0].params.hash, /^scrypt\$/);
    assert.ok(!JSON.stringify(db.calls[0].params).includes('long-enough'), 'plain password never sent to the database');
    const taken = fakeDb(() => ({ rows: [{ created: false, username: 'ravi', role: 'viewer' }] }));
    assert.equal((await client(taken, null).post('/api/auth/register').send({ username: 'ravi', password: 'long-enough' })).status, 409);
  });
});

describe('Authorisation', () => {
  test('no token, malformed token or forged token -> 401', async () => {
    const db = fakeDb();
    assert.equal((await client(db, null).get('/api/suspects')).status, 401);
    assert.equal((await client(db, null).get('/api/health').set('Authorization', 'Bearer nonsense')).status, 401);
    const forged = signToken({ sub: 'x', role: 'admin' }, 'not-the-server-secret');
    assert.equal((await client(db, null).delete('/api/suspects/S001').set('Authorization', `Bearer ${forged}`)).status, 401);
    assert.equal(db.calls.length, 0);
  });
  test('viewer can read but not write', async () => {
    const db = fakeDb(() => ({ rows: [{ total: 0, items: [] }] }));
    assert.equal((await client(db, 'viewer').get('/api/suspects')).status, 200);
    const res = await client(db, 'viewer').post('/api/suspects').send({ suspect_id: 'S041', first_name: 'A', last_name: 'B' });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /investigator/);
    assert.equal(db.calls.length, 1, 'the refused write never reached the database');
  });
  test('investigator can create but not delete (destructive operation)', async () => {
    const db = fakeDb(() => ({ rows: [{ n: { labels: ['Suspect'], suspect_id: 'S041' }, rels: 0 }] }));
    assert.equal((await client(db, 'investigator').post('/api/suspects').send({ suspect_id: 'S041', first_name: 'A', last_name: 'B' })).status, 201);
    const calls = db.calls.length;
    for (const path of ['/api/suspects/S041?detach=true', '/api/relationships/KNOWS?from=S001&to=S004']) {
      assert.equal((await client(db, 'investigator').delete(path)).status, 403);
    }
    assert.equal(db.calls.length, calls, 'no delete statement was sent');
  });
  test('admin can delete', async () => {
    const db = fakeDb((c) => (c.includes('COUNT') ? { rows: [{ rels: 0 }] } : { rows: [], counters: { nodesDeleted: 1 } }));
    const res = await client(db, 'admin').delete('/api/suspects/S041');
    assert.equal(res.status, 200);
    assert.match(db.cyphers().at(-1), /DETACH DELETE/);
  });
  test('user management is admin-only and validates the role', async () => {
    const db = fakeDb(() => ({ rows: [{ username: 'ravi', role: 'investigator', created_at: 'x' }] }));
    assert.equal((await client(db, 'investigator').get('/api/auth/users')).status, 403);
    assert.equal((await client(db, 'admin').patch('/api/auth/users/ravi').send({ role: 'superuser' })).status, 400);
    const ok = await client(db, 'admin').patch('/api/auth/users/ravi').send({ role: 'investigator' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, 'investigator');
    assert.equal((await client(db, 'investigator').delete('/api/auth/users/ravi')).status, 403);
    assert.equal((await client(db, 'admin').delete('/api/auth/users/test-admin')).status, 400, 'cannot delete yourself');
    const gone = fakeDb(() => ({ rows: [{ deleted: 1 }] }));
    assert.equal((await client(gone, 'admin').delete('/api/auth/users/ravi')).status, 200);
    assert.match(gone.cyphers()[0], /DELETE u/);
    const list = await client(db, 'admin').get('/api/auth/users');
    assert.ok(!JSON.stringify(list.body).includes('hash'));
  });
});
