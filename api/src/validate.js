/**
 * validate.js - checks request bodies against schema.js and converts values to Neo4j types
 * (e.g. '2025-04-27' -> neo4j Date), so the database always stores correctly typed properties.
 */
const neo4j = require('neo4j-driver');

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

function toDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  const dt = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!m || dt.getUTCMonth() !== +m[2] - 1) return undefined;
  return new neo4j.types.Date(+m[1], +m[2], +m[3]);
}

function coerce(name, spec, value) {
  if (value === null) return { value: null };
  if (spec === 'string') return typeof value === 'string' && value.trim() ? { value: value.trim() } : { error: `${name} must be a non-empty string` };
  if (spec === 'date') { const d = toDate(value); return d ? { value: d } : { error: `${name} must be a date in YYYY-MM-DD format` }; }
  if (spec === 'boolean') {
    if (typeof value === 'boolean') return { value };
    if (value === 'true' || value === 'false') return { value: value === 'true' };
    return { error: `${name} must be true or false` };
  }
  if (spec.enum) return spec.enum.includes(value) ? { value } : { error: `${name} must be one of: ${spec.enum.join(', ')}` };
  if (spec.int) {
    const n = Number(value);
    return Number.isInteger(n) && n >= spec.int[0] && n <= spec.int[1] ? { value: neo4j.int(n) } : { error: `${name} must be an integer between ${spec.int[0]} and ${spec.int[1]}` };
  }
  if (spec.float) {
    const n = Number(value);
    return Number.isFinite(n) && n >= spec.float[0] && n <= spec.float[1] ? { value: n } : { error: `${name} must be a number between ${spec.float[0]} and ${spec.float[1]}` };
  }
  return { error: `${name}: unsupported type` };
}

/**
 * @param {object} body     request body
 * @param {object} def      entity or relationship definition from schema.js
 * @param {object} opts     { partial, immutable: [propertyNames], allowEmpty }
 * @returns {object}        properties ready to be passed as a Cypher parameter
 */
function validateProps(body, def, { partial = false, immutable = [], allowEmpty = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object');
  const errors = [];
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!(k in def.props)) { errors.push(`Unknown property '${k}'`); continue; }
    if (immutable.includes(k)) { errors.push(`'${k}' cannot be changed`); continue; }
    if (v === null && (def.required || []).includes(k)) { errors.push(`'${k}' is required and cannot be null`); continue; }
    const r = coerce(k, def.props[k], v);
    if (r.error) errors.push(r.error); else out[k] = r.value;
  }
  if (!partial) for (const k of def.required || []) if (out[k] === undefined) errors.push(`'${k}' is required`);
  if (def.keyPattern && typeof out[def.key] === 'string' && !def.keyPattern.test(out[def.key])) errors.push(`${def.key} has an invalid format`);
  if (partial && !allowEmpty && Object.keys(out).length === 0 && errors.length === 0) errors.push('No properties to update');
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);
  return out;
}

/** Parse an optional integer query-string value (returned as a Neo4j Integer for SKIP/LIMIT). */
function intParam(value, dflt, min, max) {
  if (value === undefined) return neo4j.int(dflt);
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Expected an integer between ${min} and ${max}, got '${value}'`);
  return neo4j.int(n);
}

module.exports = { HttpError, validateProps, toDate, intParam };
