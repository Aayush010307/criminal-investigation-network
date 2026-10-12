import { useEffect, useState, type FormEvent } from 'react';
import { api, can, describe, getSchema, ApiError, LABEL_OF_ID, ENTITY_OF, type EntityDef, type Graph, type RelDef, type Schema, type Spec } from '../api';
import { Confirm, DataTable, ErrorBox, LabelDot, Loadable, Panel, Value, href, navigate, useAsync, useRoute } from '../components/common';

const ENTITIES = ['suspects', 'crimes', 'locations', 'evidence', 'officers'];
const TITLES: Record<string, string> = { suspects: 'Suspects', crimes: 'Crimes', locations: 'Locations', evidence: 'Evidence', officers: 'Officers' };

// ---------------------------------------------------------------- property form (generated from the API schema)
type Values = Record<string, string>;
const isObj = (s: Spec): s is Exclude<Spec, string> => typeof s === 'object';

function Field({ name, spec, value, onChange, required, disabled }: { name: string; spec: Spec; value: string; onChange: (v: string) => void; required?: boolean; disabled?: boolean }) {
  const label = <span>{name.replace(/_/g, ' ')}{required && <b className="req" aria-hidden> *</b>}</span>;
  let input;
  if (isObj(spec) && spec.enum) input = <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}><option value="">—</option>{spec.enum.map((o) => <option key={o}>{o}</option>)}</select>;
  else if (spec === 'boolean') input = <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}><option value="">—</option><option value="true">yes</option><option value="false">no</option></select>;
  else if (spec === 'date') input = <input type="date" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  else if (isObj(spec) && (spec.int || spec.float)) {
    const [min, max] = (spec.int || spec.float) as [number, number];
    input = <input type="number" value={value} min={min} max={max} step={spec.int ? 1 : 'any'} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  } else input = <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  return <label className="field">{label}{input}</label>;
}

/** Converts form strings to JSON values and checks them; the API validates again on the server. */
function toBody(values: Values, def: { props: Record<string, Spec>; required?: string[]; key?: string; keyPattern?: string }, initial?: Values) {
  const body: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [k, spec] of Object.entries(def.props)) {
    const v = (values[k] ?? '').trim();
    if (initial && v === (initial[k] ?? '')) continue;                       // edit: only changed fields
    if (v === '') {
      if (def.required?.includes(k)) errors.push(`${k} is required`);
      else if (initial) body[k] = null;                                     // clearing a field removes the property
      continue;
    }
    if (isObj(spec) && (spec.int || spec.float)) {
      const n = Number(v); const [min, max] = (spec.int || spec.float) as [number, number];
      if (!Number.isFinite(n) || n < min || n > max || (spec.int && !Number.isInteger(n))) { errors.push(`${k} must be ${spec.int ? 'an integer' : 'a number'} between ${min} and ${max}`); continue; }
      body[k] = n;
    } else if (spec === 'boolean') body[k] = v === 'true';
    else body[k] = v;
  }
  if (!initial && def.key && def.keyPattern && typeof body[def.key] === 'string' && !new RegExp(def.keyPattern).test(body[def.key] as string)) errors.push(`${def.key} has an invalid format (pattern ${def.keyPattern})`);
  return { body, errors };
}
const asValues = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));

function EntityForm({ entity, def, initial, onDone, onCancel }: { entity: string; def: EntityDef; initial?: Values; onDone: (id: string) => void; onCancel: () => void }) {
  const [values, setValues] = useState<Values>(initial || {});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const { body, errors } = toBody(values, def, initial);
    if (errors.length) { setError(errors.join('; ')); return; }
    if (initial && !Object.keys(body).length) { setError('Nothing changed'); return; }
    setBusy(true); setError('');
    try {
      if (initial) { await api(`/${entity}/${encodeURIComponent(initial[def.key])}`, { method: 'PATCH', body }); onDone(initial[def.key]); }
      else { await api(`/${entity}`, { method: 'POST', body }); onDone(body[def.key] as string); }
    } catch (err) { setError(describe(err)); } finally { setBusy(false); }
  }
  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      {Object.entries(def.props).map(([k, spec]) => (
        <Field key={k} name={k} spec={spec} value={values[k] || ''} required={def.required.includes(k)} disabled={!!initial && k === def.key}
          onChange={(v) => setValues({ ...values, [k]: v })} />
      ))}
      {error && <div className="alert alert-error span-all" role="alert">{error}</div>}
      <div className="row gap span-all">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : `Create ${def.label}`}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- list
function List({ entity, schema }: { entity: string; schema: Schema }) {
  const def = schema.entities[entity];
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState(0);
  const [creating, setCreating] = useState(false);
  useEffect(() => { setQ(''); setSearch(''); setFilters({}); setSkip(0); setCreating(false); }, [entity]);
  const limit = 15;
  const list = useAsync(() => api<{ total: number; items: Record<string, unknown>[] }>(`/${entity}`, { query: { q: search, skip, limit, ...filters } }), [entity, search, skip, JSON.stringify(filters)]);
  const cols = [def.key, ...Object.keys(def.props).filter((k) => k !== def.key && !['description', 'contact_info', 'latitude', 'longitude', 'zipcode'].includes(k)).slice(0, 5)];

  return (
    <>
      <div className="toolbar">
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); setSkip(0); setSearch(q.trim()); }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${TITLES[entity].toLowerCase()}…`} aria-label="Search" maxLength={100} />
          <button className="btn">Search</button>
        </form>
        {def.filters.map((f) => {
          const spec = def.props[f];
          if (!isObj(spec) || !spec.enum) return null;
          return (
            <label key={f} className="inline">{f.replace(/_/g, ' ')}
              <select value={filters[f] || ''} onChange={(e) => { setSkip(0); setFilters({ ...filters, [f]: e.target.value }); }}>
                <option value="">all</option>{spec.enum.map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
          );
        })}
        <span className="grow" />
        {can('investigator') && <button className="btn btn-primary" onClick={() => setCreating(!creating)}>{creating ? 'Close form' : `New ${def.label}`}</button>}
      </div>
      {creating && (
        <Panel title={`New ${def.label}`}>
          <EntityForm entity={entity} def={def} onCancel={() => setCreating(false)} onDone={(id) => navigate(`/records/${entity}/${id}`)} />
        </Panel>
      )}
      <Panel>
        <Loadable s={list}>
          {(r) => (
            <>
              <DataTable rows={r.items} columns={cols} empty={search || Object.values(filters).some(Boolean) ? 'No records match.' : 'No records yet.'}
                onRow={(row) => navigate(`/records/${entity}/${row[def.key]}`)} />
              <div className="pager">
                <span className="muted">{r.total ? `${skip + 1}–${Math.min(skip + limit, r.total)} of ${r.total}` : '0 records'}</span>
                <button className="btn btn-sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - limit))}>Previous</button>
                <button className="btn btn-sm" disabled={skip + limit >= r.total} onClick={() => setSkip(skip + limit)}>Next</button>
              </div>
            </>
          )}
        </Loadable>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- relationships of one record
function AddRelationship({ entity, id, schema, onDone }: { entity: string; id: string; schema: Schema; onDone: () => void }) {
  const options = Object.entries(schema.relationships).filter(([, r]) => r.from === entity || r.to === entity);
  const [type, setType] = useState(options[0]?.[0] || '');
  const [other, setOther] = useState('');
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const rel: RelDef | undefined = schema.relationships[type];
  if (!rel) return null;
  const relDef: RelDef = rel;
  const outgoing = rel.from === entity;
  const otherEntity = outgoing ? rel.to : rel.from;
  const otherDef = schema.entities[otherEntity];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const o = other.trim().toUpperCase();
    if (!new RegExp(otherDef.keyPattern).test(o)) { setError(`Enter a ${otherDef.label} id such as ${otherDef.keyPattern.includes('CR') ? 'CR002' : otherDef.label === 'Officer' ? 'B1205' : `${otherDef.label[0]}001`}`); return; }
    const { body, errors } = toBody(values, relDef);
    if (errors.length) { setError(errors.join('; ')); return; }
    setBusy(true); setError('');
    try {
      await api(`/relationships/${type}`, { method: 'POST', body: { from: outgoing ? id : o, to: outgoing ? o : id, properties: body } });
      setOther(''); setValues({}); onDone();
    } catch (err) { setError(describe(err)); } finally { setBusy(false); }
  }
  return (
    <form className="form-grid" onSubmit={submit} noValidate>
      <label className="field"><span>type</span>
        <select value={type} onChange={(e) => { setType(e.target.value); setValues({}); }}>
          {options.map(([t, r]) => <option key={t} value={t}>{r.from === entity ? `${t} → ${schema.entities[r.to].label}` : `${schema.entities[r.from].label} → ${t}`}</option>)}
        </select>
      </label>
      <label className="field"><span>{outgoing ? 'to' : 'from'} ({otherDef.label} id)<b className="req"> *</b></span><input value={other} onChange={(e) => setOther(e.target.value)} /></label>
      {Object.entries(rel.props).map(([k, spec]) => <Field key={k} name={k} spec={spec} value={values[k] || ''} onChange={(v) => setValues({ ...values, [k]: v })} />)}
      {error && <div className="alert alert-error span-all" role="alert">{error}</div>}
      <div className="span-all"><button className="btn btn-primary" disabled={busy}>{busy ? 'Linking…' : 'Create relationship'}</button></div>
    </form>
  );
}

function Relationships({ entity, id, schema }: { entity: string; id: string; schema: Schema }) {
  const g = useAsync(() => api<Graph>(`/graph/node/${encodeURIComponent(id)}`), [id]);
  const [pending, setPending] = useState<Graph['edges'][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  async function remove() {
    if (!pending) return;
    setBusy(true); setError('');
    try { await api(`/relationships/${pending.type}`, { method: 'DELETE', query: { from: pending.source, to: pending.target } }); setPending(null); g.reload(); }
    catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }
  return (
    <Panel title="Relationships" actions={can('investigator') && <button className="btn btn-sm" onClick={() => setAdding(!adding)}>{adding ? 'Close' : 'Add relationship'}</button>}>
      {adding && <AddRelationship entity={entity} id={id} schema={schema} onDone={() => { setAdding(false); g.reload(); }} />}
      {error && <ErrorBox message={error} />}
      {pending && <Confirm text={<>Delete <b>{pending.source} —{pending.type}→ {pending.target}</b>?</>} onConfirm={remove} onCancel={() => setPending(null)} busy={busy} />}
      <Loadable s={g}>
        {(graph) => {
          const byId = new Map(graph.nodes.map((n) => [n.id, n]));
          const rows = graph.edges.map((e) => ({ e, other: byId.get(e.source === id ? e.target : e.source)! }));
          return rows.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>relationship</th><th>node</th><th>properties</th>{can('admin') && <th />}</tr></thead>
              <tbody>{rows.map(({ e, other }, i) => (
                <tr key={i}>
                  <td className="reltype">{e.source === id ? `—${e.type}→` : `←${e.type}—`}</td>
                  <td><a className="idlink" href={href(`/records/${ENTITY_OF[other.label]}/${other.id}`)}><LabelDot label={other.label} />{other.id}</a> <span className="muted">{other.caption}</span></td>
                  <td className="small">{Object.entries(e.props).map(([k, v]) => <span key={k} className="kv">{k}: <Value v={v} /></span>)}</td>
                  {can('admin') && <td><button className="btn btn-sm btn-danger-ghost" onClick={() => setPending(e)}>Delete</button></td>}
                </tr>))}
              </tbody>
            </table></div>
          ) : <p className="muted">No relationships.</p>;
        }}
      </Loadable>
    </Panel>
  );
}

// ---------------------------------------------------------------- detail
function Detail({ entity, id, schema }: { entity: string; id: string; schema: Schema }) {
  const def = schema.entities[entity];
  const rec = useAsync(() => api<Record<string, unknown> & { relationships: { type: string; count: number }[] }>(`/${entity}/${encodeURIComponent(id)}`), [entity, id]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | 'plain' | 'detach'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function del() {
    setBusy(true); setError('');
    try {
      await api(`/${entity}/${encodeURIComponent(id)}`, { method: 'DELETE', query: { detach: confirm === 'detach' ? 'true' : undefined } });
      navigate(`/records/${entity}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConfirm('detach');
      setError(describe(e));
    } finally { setBusy(false); }
  }

  return (
    <>
      <p><a href={href(`/records/${entity}`)}>← All {TITLES[entity].toLowerCase()}</a></p>
      <Loadable s={rec} label={`Loading ${id}`}>
        {(r) => {
          const { relationships, ...props } = r;
          return (
            <>
              <Panel title={<><LabelDot label={def.label} />{def.label} {id}</>} actions={<>
                <a className="btn btn-sm" href={href(`/graph?id=${id}`)}>View in graph</a>
                {can('investigator') && <button className="btn btn-sm" onClick={() => setEditing(!editing)}>{editing ? 'Cancel edit' : 'Edit'}</button>}
                {can('admin') && <button className="btn btn-sm btn-danger-ghost" onClick={() => { setError(''); setConfirm('plain'); }}>Delete</button>}
              </>}>
                {error && <ErrorBox message={error} />}
                {confirm && (
                  <Confirm busy={busy} onCancel={() => { setConfirm(null); setError(''); }} onConfirm={del}
                    confirmLabel={confirm === 'detach' ? 'Delete with relationships' : 'Delete'}
                    text={confirm === 'detach' ? <>Also delete all relationships of <b>{id}</b>? This cannot be undone.</> : <>Delete <b>{id}</b>? This cannot be undone.</>} />
                )}
                {editing ? (
                  <EntityForm entity={entity} def={def} initial={asValues(props)} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); rec.reload(); }} />
                ) : (
                  <dl className="props props-wide">
                    {Object.keys(def.props).map((k) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd><Value v={props[k]} /></dd></div>)}
                  </dl>
                )}
                <div className="chips">{relationships.map((x) => <span key={x.type} className="tag">{x.type} × {x.count}</span>)}</div>
              </Panel>
              <Relationships entity={entity} id={id} schema={schema} />
            </>
          );
        }}
      </Loadable>
    </>
  );
}

export default function Records() {
  const { parts } = useRoute();
  const entity = ENTITIES.includes(parts[1]) ? parts[1] : 'suspects';
  const id = parts[2];
  const schema = useAsync(getSchema, []);
  useEffect(() => { if (id && LABEL_OF_ID(id) && ENTITY_OF[LABEL_OF_ID(id)!] !== entity) navigate(`/records/${ENTITY_OF[LABEL_OF_ID(id)!]}/${id}`); }, [id, entity]);
  return (
    <div className="page">
      <div className="page-head"><div><h1>Records</h1><p className="muted">Browse, search and manage the investigation records.</p></div></div>
      <nav className="tabs" aria-label="Record types">
        {ENTITIES.map((e) => <a key={e} href={href(`/records/${e}`)} className={e === entity ? 'on' : ''} aria-current={e === entity ? 'page' : undefined}>{TITLES[e]}</a>)}
      </nav>
      <Loadable s={schema}>{(s) => (id ? <Detail entity={entity} id={id} schema={s} /> : <List entity={entity} schema={s} />)}</Loadable>
    </div>
  );
}
