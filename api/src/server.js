/** server.js - entry point: npm start */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { createDb } = require('./db');
const { createApp } = require('./app');

const db = createDb({
  uri: process.env.NEO4J_URI || 'neo4j://localhost:7687',
  user: process.env.NEO4J_USER || 'neo4j',
  password: process.env.NEO4J_PASSWORD || 'password',
  database: process.env.NEO4J_DATABASE || 'neo4j',
});
const port = Number(process.env.PORT || 3000);

db.driver.verifyConnectivity()
  .then(() => console.log(`Connected to Neo4j at ${process.env.NEO4J_URI || 'neo4j://localhost:7687'}`))
  .catch((e) => console.warn(`WARNING: cannot reach Neo4j yet (${e.message}). Requests will fail until it is running.`));

const server = createApp(db, { apiKey: process.env.API_KEY || undefined })
  .listen(port, () => console.log(`API listening on http://localhost:${port}`));

const stop = async () => { server.close(); await db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
