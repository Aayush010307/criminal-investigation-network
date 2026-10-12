/** server.js - entry point: npm start */
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { createDb } = require('./db');
const { createApp } = require('./app');
const { ensureAdmin } = require('./auth');

const env = process.env;
const db = createDb({
  uri: env.NEO4J_URI || 'neo4j://localhost:7687',
  user: env.NEO4J_USER || 'neo4j',
  password: env.NEO4J_PASSWORD || 'password',
  database: env.NEO4J_DATABASE || 'neo4j',
});
const port = Number(env.PORT || 3000);

let secret = env.AUTH_SECRET;
if (!secret || secret.length < 32) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: AUTH_SECRET is missing or shorter than 32 characters - using a random one; everyone must sign in again after a restart.');
}

db.driver.verifyConnectivity()
  .then(async () => {
    console.log(`Connected to Neo4j at ${env.NEO4J_URI || 'neo4j://localhost:7687'}`);
    if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
      const created = await ensureAdmin(db, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
      console.log(created ? `Administrator account '${env.ADMIN_USERNAME}' created` : `Administrator account '${env.ADMIN_USERNAME}' already exists`);
    } else console.warn('No ADMIN_USERNAME / ADMIN_PASSWORD in .env - no administrator account will be created.');
  })
  .catch((e) => console.warn(`WARNING: cannot reach Neo4j yet (${e.code || e.message}). Requests will fail until it is running.`));

const server = createApp(db, { secret, ttlHours: Number(env.TOKEN_TTL_HOURS || 8) })
  .listen(port, () => console.log(`Listening on http://localhost:${port}  (API under /api)`));

const stop = async () => { server.close(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
