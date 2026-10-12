/**
 * app.js - assembles the Express application. The database handle is injected so the
 * same app can run against Neo4j (server.js) or against a test double (test/).
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { HttpError } = require('./validate');
const { ENTITIES, RELATIONSHIPS } = require('./schema');
const { wrap } = require('./routes/util');
const { authorize, authRoutes } = require('./auth');

const WEB_DIST = path.join(__dirname, '..', '..', 'web', 'dist');

/**
 * @param db       src/db.js handle (or the test double)
 * @param secret   AUTH_SECRET used to sign access tokens (required)
 * @param ttlHours token lifetime
 * @param webDist  folder with the built frontend to serve at / (optional)
 */
function createApp(db, { secret, ttlHours = 8, webDist = WEB_DIST } = {}) {
  if (!secret) throw new Error('createApp: an auth secret is required');
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" });
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  // authentication: /api/auth/register and /api/auth/login are public, everything else under /api needs a token
  // authorisation (by HTTP method): GET -> viewer, POST/PATCH -> investigator, DELETE -> admin  (see auth.js)
  const guard = authorize(secret);
  app.use('/api/auth', authRoutes(db, { secret, ttlHours, guard }));
  app.use('/api', guard);

  app.get('/api/health', wrap(async (req, res) => {
    const rows = await db.read('MATCH (n) WHERE NOT n:User UNWIND labels(n) AS label RETURN label, count(*) AS n ORDER BY label');
    const [rels] = await db.read('MATCH ()-[r]->() RETURN count(r) AS n');
    res.json({ status: 'ok', nodes: Object.fromEntries(rows.map((r) => [r.label, r.n])), relationships: rels.n });
  }));

  // the graph model (labels, keys, properties, enums) so the web forms are generated from the same definitions
  app.get('/api/schema', (req, res) => res.json({
    entities: Object.fromEntries(Object.entries(ENTITIES).map(([k, d]) => [k, { ...d, keyPattern: d.keyPattern.source }])),
    relationships: RELATIONSHIPS,
  }));

  app.use('/api/analytics', require('./routes/analytics')(db));
  app.use('/api/gds', require('./routes/gds')(db));
  app.use('/api/graph', require('./routes/graph')(db));
  app.use('/api/relationships', require('./routes/relationships')(db));
  app.use('/api', require('./routes/cases')(db));
  app.use('/api', require('./routes/entities')(db));

  app.get('/api', (req, res) => res.json({
    name: 'Criminal Investigation Network API',
    auth: ['POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/me', 'GET /api/auth/users', 'PATCH /api/auth/users/:username', 'DELETE /api/auth/users/:username'],
    resources: Object.keys(ENTITIES).map((e) => `/api/${e}`),
    relationships: '/api/relationships/:type',
    analytics: '/api/analytics',
    gds: ['/api/gds/status', '/api/gds/louvain', '/api/gds/pagerank', '/api/gds/betweenness'],
    graph: ['/api/graph', '/api/graph/node/:id', '/api/graph/path?from=&to='],
    transactions: ['POST /api/cases', 'PATCH /api/cases/:crime_id/lead', 'POST /api/demo/rollback'],
  }));
  app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl.split('?')[0]}` }));

  // the built web interface (npm run build in web/), with client-side routing falling back to index.html
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    app.get('*', (req, res) => res.sendFile(path.join(webDist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.json({ name: 'Criminal Investigation Network API', api: '/api', web: 'not built - run npm run build in web/' }));
  }
  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

  // central error handler: maps validation and Neo4j errors to HTTP status codes.
  // Internal error text is logged on the server only, never sent to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      const m = /property `(\w+)` = (.+)$/m.exec(err.message);
      return res.status(409).json({ error: 'Constraint violation', details: m ? `${m[1]} ${m[2]} already exists` : 'a unique value already exists' });
    }
    if (err.code === 'ServiceUnavailable' || err.code === 'SessionExpired' || err.code === 'Neo.ClientError.Security.Unauthorized') {
      console.error(`[db] ${err.code}: ${err.message}`);
      return res.status(503).json({ error: 'Database unavailable - check that Neo4j is running and the NEO4J_* settings in .env' });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal error' });
  });
  return app;
}

module.exports = { createApp };
