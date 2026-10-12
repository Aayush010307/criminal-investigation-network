/**
 * auth.js - user accounts, password hashing, signed access tokens and role-based authorisation.
 *
 *  Passwords  scrypt (Node's built-in crypto, N=2^14, r=8, p=1) with a random 16-byte salt per user.
 *             Only "scrypt$<salt>$<hash>" is stored, on a :User node; it is never returned by the API.
 *  Tokens     <base64url(JSON {sub, role, exp})>.<base64url(HMAC-SHA256)> signed with AUTH_SECRET,
 *             valid for TOKEN_TTL_HOURS (default 8). The client sends "Authorization: Bearer <token>".
 *  Roles      viewer       read everything (GET)
 *             investigator viewer + create / update (POST, PATCH)
 *             admin        investigator + DELETE + user management
 *  Self-registration creates a viewer; an admin promotes accounts.
 */
const crypto = require('crypto');
const express = require('express');
const { HttpError } = require('./validate');
const { wrap } = require('./routes/util');

const ROLES = ['viewer', 'investigator', 'admin'];
const USERNAME = /^[a-z0-9_.-]{3,32}$/;
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${b64(salt)}$${b64(crypto.scryptSync(password, salt, 32))}`;
}

function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function signToken({ sub, role }, secret, ttlHours = 8) {
  const body = b64(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + Math.round(ttlHours * 3600) }));
  return `${body}.${sign(body, secret)}`;
}

/** @returns {{sub, role, exp} | null} */
function verifyToken(token, secret) {
  const [body, mac] = String(token).split('.');
  if (!body || !mac) return null;
  const good = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    return claims.exp > Date.now() / 1000 && ROLES.includes(claims.role) ? claims : null;
  } catch { return null; }
}

/** Minimum role for a request: reads need viewer, deletes need admin, every other write needs investigator. */
const requiredRole = (method) => (method === 'GET' || method === 'HEAD' ? 'viewer' : method === 'DELETE' ? 'admin' : 'investigator');
const atLeast = (role, min) => ROLES.indexOf(role) >= ROLES.indexOf(min);

function authorize(secret) {
  return (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    const user = m && verifyToken(m[1], secret);
    if (!user) return res.status(401).json({ error: 'Sign in required (missing, invalid or expired token)' });
    req.user = user;
    const min = requiredRole(req.method);
    if (!atLeast(user.role, min)) return res.status(403).json({ error: `This action needs the '${min}' role; you are '${user.role}'` });
    return next();
  };
}

function credentials(body) {
  const { username, password } = body || {};
  const errors = [];
  if (typeof username !== 'string' || !USERNAME.test(username)) errors.push('username must be 3-32 characters: lower-case letters, digits, . _ -');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) errors.push('password must be 8-128 characters');
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);
  return { username, password };
}

const publicUser = (u) => ({ username: u.username, role: u.role, created_at: u.created_at });

/** Create the first administrator from ADMIN_USERNAME / ADMIN_PASSWORD if that account does not exist yet. */
async function ensureAdmin(db, username, password) {
  const c = credentials({ username, password });
  const { counters } = await db.write(
    'MERGE (u:User {username: $username})\n' +
    "ON CREATE SET u.password_hash = $hash, u.role = 'admin', u.created_at = datetime()",
    { username: c.username, hash: hashPassword(c.password) });
  return counters.nodesCreated > 0;
}

// ponytail: in-memory failed-login counter (per process); move to a shared store if the API is ever scaled out
const failures = new Map();
const LOCK_AFTER = 10;
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));   // same work for unknown users (no timing oracle)
const WINDOW_MS = 15 * 60 * 1000;

/** Routes under /api/auth. register and login are public; the rest are guarded by `guard` (authorize()). */
function authRoutes(db, { secret, ttlHours, guard }) {
  const r = express.Router();

  r.post('/register', wrap(async (req, res) => {
    const { username, password } = credentials(req.body);
    const { rows } = await db.write(
      'MERGE (u:User {username: $username})\n' +
      "ON CREATE SET u.password_hash = $hash, u.role = 'viewer', u.created_at = datetime(), u.new = true\n" +
      'WITH u, u.new IS NOT NULL AS created REMOVE u.new\n' +
      'RETURN created, u.username AS username, u.role AS role, u.created_at AS created_at',
      { username, hash: hashPassword(password) });
    if (!rows[0].created) throw new HttpError(409, `Username '${username}' is already taken`);
    res.status(201).json({ user: publicUser(rows[0]) });
  }));

  r.post('/login', wrap(async (req, res) => {
    const { username, password } = credentials(req.body);
    const key = `${req.ip}|${username}`;
    const f = failures.get(key);
    if (f && f.count >= LOCK_AFTER && Date.now() - f.since < WINDOW_MS) throw new HttpError(429, 'Too many failed sign-in attempts; try again in 15 minutes');
    const [u] = await db.read('MATCH (u:User {username: $username}) RETURN u.username AS username, u.role AS role, u.password_hash AS hash', { username });
    if (!verifyPassword(password, u ? u.hash : DUMMY_HASH) || !u) {
      const cur = f && Date.now() - f.since < WINDOW_MS ? f : { count: 0, since: Date.now() };
      failures.set(key, { ...cur, count: cur.count + 1 });
      throw new HttpError(401, 'Invalid username or password');
    }
    failures.delete(key);
    res.json({ token: signToken({ sub: u.username, role: u.role }, secret, ttlHours), user: { username: u.username, role: u.role }, expires_in_hours: ttlHours });
  }));

  r.get('/me', guard, (req, res) => res.json({ username: req.user.sub, role: req.user.role, expires_at: new Date(req.user.exp * 1000).toISOString() }));

  const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: "User management needs the 'admin' role" }));

  r.get('/users', guard, adminOnly, wrap(async (req, res) => {
    const rows = await db.read('MATCH (u:User) RETURN u.username AS username, u.role AS role, u.created_at AS created_at ORDER BY username');
    res.json({ items: rows.map(publicUser) });
  }));

  r.patch('/users/:username', guard, adminOnly, wrap(async (req, res) => {
    const role = req.body && req.body.role;
    if (!ROLES.includes(role)) throw new HttpError(400, 'Validation failed', [`role must be one of: ${ROLES.join(', ')}`]);
    if (req.params.username === req.user.sub) throw new HttpError(400, 'You cannot change your own role');
    const { rows } = await db.write('MATCH (u:User {username: $username}) SET u.role = $role RETURN u.username AS username, u.role AS role, u.created_at AS created_at',
      { username: req.params.username, role });
    if (!rows.length) throw new HttpError(404, `User '${req.params.username}' not found`);
    res.json({ user: publicUser(rows[0]) });
  }));

  r.delete('/users/:username', guard, adminOnly, wrap(async (req, res) => {
    if (req.params.username === req.user.sub) throw new HttpError(400, 'You cannot delete your own account');
    const { rows } = await db.write('MATCH (u:User {username: $username}) DELETE u RETURN count(*) AS deleted', { username: req.params.username });
    if (!rows.length || !rows[0].deleted) throw new HttpError(404, `User '${req.params.username}' not found`);
    res.json({ deleted: req.params.username });
  }));

  return r;
}

module.exports = { ROLES, hashPassword, verifyPassword, signToken, verifyToken, authorize, authRoutes, ensureAdmin, requiredRole };
