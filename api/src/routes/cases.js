/**
 * cases.js - multi-statement operations that MUST be atomic (ACID transactions).
 *
 *   POST  /api/cases                    register a complete case in ONE transaction:
 *                                       Crime + OCCURRED_AT + lead INVESTIGATING + COMMITTED[] + LINKED_TO[]
 *                                       If any step fails (unknown suspect, duplicate crime_id ...)
 *                                       nothing at all is written.
 *   PATCH /api/cases/:crime_id/lead     hand the case to another lead investigator atomically
 *   POST  /api/demo/rollback            explicit transaction demo: begin -> write -> fail -> rollback
 */
const express = require('express');
const { ENTITIES, RELATIONSHIPS } = require('../schema');
const { HttpError, validateProps } = require('../validate');
const { wrap } = require('./util');

function parseCase(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Request body must be a JSON object');
  const crime = validateProps(body.crime, ENTITIES.crimes);
  if (typeof body.location_id !== 'string') throw new HttpError(400, "'location_id' is required");
  if (typeof body.lead_officer !== 'string') throw new HttpError(400, "'lead_officer' (badge_number) is required");
  const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
  const without = (obj, key) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => k !== key));
  const loose = { partial: true, allowEmpty: true };
  const occurred = validateProps(pick(body, ['time_of_day', 'witness_count']), RELATIONSHIPS.OCCURRED_AT, loose);
  const suspects = (body.suspects || []).map((s) => ({ id: s.suspect_id, props: validateProps(without(s, 'suspect_id'), RELATIONSHIPS.COMMITTED, loose) }));
  const evidence = (body.evidence || []).map((e) => ({ id: e.evidence_id, props: validateProps(without(e, 'evidence_id'), RELATIONSHIPS.LINKED_TO, loose) }));
  for (const x of [...suspects, ...evidence]) if (typeof x.id !== 'string') throw new HttpError(400, 'Every suspect/evidence entry needs its id');
  return { crime, location_id: body.location_id, lead_officer: body.lead_officer, occurred, suspects, evidence };
}

module.exports = (db) => {
  const r = express.Router();

  // ---- register a whole case atomically
  r.post('/cases', wrap(async (req, res) => {
    const c = parseCase(req.body);
    const result = await db.writeTx(async (tx) => {
      await tx.run('CREATE (c:Crime) SET c = $crime', { crime: c.crime });          // duplicate id -> constraint error -> rollback

      const loc = await tx.run(
        'MATCH (c:Crime {crime_id: $cid}) MATCH (l:Location {location_id: $lid})\n' +
        'CREATE (c)-[r:OCCURRED_AT]->(l) SET r = $props RETURN count(r) AS n',
        { cid: c.crime.crime_id, lid: c.location_id, props: c.occurred });
      if (loc.rows[0].n !== 1) throw new HttpError(404, `Location '${c.location_id}' not found - case NOT registered`);

      const lead = await tx.run(
        'MATCH (o:Officer {badge_number: $bn}) MATCH (c:Crime {crime_id: $cid})\n' +
        'CREATE (o)-[r:INVESTIGATING {assigned_date: date(), lead_investigator: true}]->(c) RETURN count(r) AS n',
        { bn: c.lead_officer, cid: c.crime.crime_id });
      if (lead.rows[0].n !== 1) throw new HttpError(404, `Officer '${c.lead_officer}' not found - case NOT registered`);

      const sus = await tx.run(
        'MATCH (c:Crime {crime_id: $cid})\n' +
        'UNWIND $suspects AS row\n' +
        'MATCH (s:Suspect {suspect_id: row.id})\n' +
        'CREATE (s)-[r:COMMITTED]->(c) SET r = row.props\n' +
        'RETURN collect(s.suspect_id) AS linked',
        { cid: c.crime.crime_id, suspects: c.suspects });
      const missingS = c.suspects.map((s) => s.id).filter((id) => !sus.rows[0].linked.includes(id));
      if (missingS.length) throw new HttpError(404, `Unknown suspect(s) ${missingS.join(', ')} - case NOT registered`);

      const ev = await tx.run(
        'MATCH (c:Crime {crime_id: $cid})\n' +
        'UNWIND $evidence AS row\n' +
        'MATCH (e:Evidence {evidence_id: row.id})\n' +
        'CREATE (e)-[r:LINKED_TO]->(c) SET r = row.props\n' +
        'RETURN collect(e.evidence_id) AS linked',
        { cid: c.crime.crime_id, evidence: c.evidence });
      const missingE = c.evidence.map((e) => e.id).filter((id) => !ev.rows[0].linked.includes(id));
      if (missingE.length) throw new HttpError(404, `Unknown evidence ${missingE.join(', ')} - case NOT registered`);

      return { crime_id: c.crime.crime_id, location: c.location_id, lead_officer: c.lead_officer,
        suspects_linked: sus.rows[0].linked, evidence_linked: ev.rows[0].linked };
    });
    res.status(201).json({ registered: result, atomic: true });
  }));

  // ---- reassign lead investigator atomically
  r.patch('/cases/:crime_id/lead', wrap(async (req, res) => {
    const bn = req.body && req.body.badge_number;
    if (typeof bn !== 'string') throw new HttpError(400, "'badge_number' is required");
    const out = await db.writeTx(async (tx) => {
      const chk = await tx.run(
        'OPTIONAL MATCH (c:Crime {crime_id: $cid}) OPTIONAL MATCH (o:Officer {badge_number: $bn})\n' +
        'RETURN c IS NOT NULL AS hasCrime, o IS NOT NULL AS hasOfficer', { cid: req.params.crime_id, bn });
      if (!chk.rows[0].hasCrime) throw new HttpError(404, `Crime '${req.params.crime_id}' not found`);
      if (!chk.rows[0].hasOfficer) throw new HttpError(404, `Officer '${bn}' not found`);
      const prev = await tx.run(
        'MATCH (old:Officer)-[r:INVESTIGATING {lead_investigator: true}]->(:Crime {crime_id: $cid})\n' +
        'SET r.lead_investigator = false RETURN collect(old.badge_number) AS previous', { cid: req.params.crime_id });
      await tx.run(
        'MATCH (o:Officer {badge_number: $bn}) MATCH (c:Crime {crime_id: $cid})\n' +
        'MERGE (o)-[r:INVESTIGATING]->(c)\n' +
        'ON CREATE SET r.assigned_date = date()\n' +
        'SET r.lead_investigator = true', { bn, cid: req.params.crime_id });
      return { crime_id: req.params.crime_id, previous_lead: prev.rows[0].previous, new_lead: bn };
    });
    res.json(out);
  }));

  // ---- explicit transaction + rollback demonstration (leaves the database unchanged)
  r.post('/demo/rollback', wrap(async (req, res) => {
    const count = 'MATCH (c:Crime) RETURN count(c) AS n';
    const [{ n: before }] = await db.read(count);
    const report = await db.explicitTx(async (tx) => {
      await tx.run("CREATE (:Crime {crime_id: 'CR999', type: 'Theft', date: date(), status: 'Open', severity: 1, description: 'Rollback demo'})");
      const inside = (await tx.run(count)).rows[0].n;
      let error = null;
      try {
        await tx.run("CREATE (:Suspect {suspect_id: 'S001', first_name: 'Duplicate', last_name: 'Key'})");   // violates suspect_id_unique
      } catch (e) {
        error = { code: e.code, message: e.message.split('\n')[0] };
      }
      if (tx.isOpen()) await tx.rollback();
      return { inside, error };
    });
    const [{ n: after }] = await db.read(count);
    res.json({
      crimes_before: before,
      crimes_inside_transaction: report.inside,
      failing_statement_error: report.error,
      crimes_after_rollback: after,
      rolled_back: after === before,
    });
  }));

  return r;
};
