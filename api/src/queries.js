/**
 * queries.js - loads the named queries from db/04_queries.cypher so that the API, the Neo4j
 * Browser scripts and scripts/verify.py all execute exactly the same Cypher text.
 */
const fs = require('fs');
const path = require('path');

function parseCypherFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const blocks = text.split(/^\/\/ @name /m).slice(1);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/); // db/04_queries.cypher is CRLF on Windows checkouts (autocrlf)
    const item = { name: lines[0].trim(), title: '', params: {} };
    const body = [];
    for (const ln of lines.slice(1)) {
      const m = /^\/\/ @(\w+) (.*)$/.exec(ln);
      if (m && body.length === 0) item[m[1]] = m[1] === 'params' ? JSON.parse(m[2]) : m[2].trim();
      else if (ln.startsWith('// ---') || ln.startsWith('// ====')) break;
      else body.push(ln);
    }
    item.cypher = body.join('\n').replace(/^\s*\/\/.*$\n?/gm, '').trim().replace(/;\s*$/, '');
    return item;
  });
}

const QUERY_FILE = path.join(__dirname, '..', '..', 'db', '04_queries.cypher');
const QUERIES = Object.fromEntries(parseCypherFile(QUERY_FILE).map((q) => [q.name, q]));

module.exports = { QUERIES, parseCypherFile };
