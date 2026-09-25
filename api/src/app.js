/**
 * app.js - assembles the Express application. The database handle is injected so the
 * same app can run against Neo4j (server.js) or against a test double (test/).
 */
const express = require('express');
const { HttpError } = require('./validate');
const { ENTITIES } = require('./schema');
const { wrap } = require('./routes/util');

function createApp(db, { apiKey } = {}) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  // optional shared-secret protection (full user authentication is planned for Review 3)
  if (apiKey) {
    app.use('/api', (req, res, next) => (req.get('x-api-key') === apiKey ? next() : res.status(401).json({ error: 'Missing or invalid x-api-key header' })));
  }

  app.get('/api/health', wrap(async (req, res) => {
    const rows = await db.read('MATCH (n) UNWIND labels(n) AS label RETURN label, count(*) AS n ORDER BY label');
    const [rels] = await db.read('MATCH ()-[r]->() RETURN count(r) AS n');
    res.json({ status: 'ok', nodes: Object.fromEntries(rows.map((r) => [r.label, r.n])), relationships: rels.n });
  }));

  app.use('/api/analytics', require('./routes/analytics')(db));
  app.use('/api/relationships', require('./routes/relationships')(db));
  app.use('/api', require('./routes/cases')(db));
  app.use('/api', require('./routes/entities')(db));

  app.get('/', (req, res) => res.json({
    name: 'Criminal Investigation Network API',
    resources: Object.keys(ENTITIES).map((e) => `/api/${e}`),
    relationships: '/api/relationships/:type',
    analytics: '/api/analytics',
    transactions: ['POST /api/cases', 'PATCH /api/cases/:crime_id/lead', 'POST /api/demo/rollback'],
  }));

  app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.path}` }));

  // central error handler: maps validation and Neo4j errors to HTTP status codes
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
      return res.status(409).json({ error: 'Constraint violation', details: err.message.split('\n')[0] });
    }
    if (err.code === 'ServiceUnavailable' || err.code === 'Neo.ClientError.Security.Unauthorized') {
      return res.status(503).json({ error: 'Database unavailable - check NEO4J_* settings in .env', details: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal error', details: err.message });
  });
  return app;
}

module.exports = { createApp };
