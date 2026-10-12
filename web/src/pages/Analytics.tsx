import { useMemo, useState, type FormEvent } from 'react';
import { api, describe, LABEL_OF_ID, type GNode, type Graph } from '../api';
import { DataTable, ErrorBox, Empty, Loadable, Panel, Spinner, href, navigate, useAsync, useRoute } from '../components/common';
import GraphView from '../components/GraphView';

// ---------------------------------------------------------------- shortest path
interface PathResult extends Graph { found: boolean; hops: number | null; order?: string[]; via: string; from: string; to: string }

function ShortestPath() {
  const [from, setFrom] = useState('S002');
  const [to, setTo] = useState('S026');
  const [via, setVia] = useState<'knows' | 'any'>('knows');
  const [res, setRes] = useState<PathResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = from.trim().toUpperCase(); const b = to.trim().toUpperCase();
    setError(''); setRes(null);
    if (!LABEL_OF_ID(a) || !LABEL_OF_ID(b)) { setError('Enter two valid ids, e.g. S002 and S026 (or CR002, L003, E004, B1205 with "any relationship").'); return; }
    if (a === b) { setError('Choose two different nodes.'); return; }
    if (via === 'knows' && (LABEL_OF_ID(a) !== 'Suspect' || LABEL_OF_ID(b) !== 'Suspect')) { setError('Association ties (KNOWS) connect suspects only - pick "any relationship" for other nodes.'); return; }
    setBusy(true);
    try { setRes(await api<PathResult>('/graph/path', { query: { from: a, to: b, via } })); } catch (err) { setError(describe(err)); } finally { setBusy(false); }
  }
  const byId = useMemo(() => new Map((res?.nodes || []).map((n) => [n.id, n])), [res]);

  return (
    <Panel title="Shortest path between two people or records">
      <form className="row gap wrap" onSubmit={submit}>
        <label className="inline">From <input value={from} onChange={(e) => setFrom(e.target.value)} size={8} /></label>
        <label className="inline">To <input value={to} onChange={(e) => setTo(e.target.value)} size={8} /></label>
        <label className="inline">Through
          <select value={via} onChange={(e) => setVia(e.target.value as 'knows' | 'any')}>
            <option value="knows">association ties (KNOWS)</option>
            <option value="any">any relationship</option>
          </select>
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Searching…' : 'Find path'}</button>
      </form>
      <p className="muted small">Cypher <code>shortestPath()</code> over at most 10 hops. Try S003 → S019, or S001 → L005 through any relationship.</p>
      {error && <ErrorBox message={error} />}
      {busy && <Spinner label="Searching" />}
      {res && !res.found && <div className="alert alert-warn">No path between {res.from} and {res.to} within 10 hops - they are not connected.</div>}
      {res && res.found && (
        <>
          <div className="chain">
            {res.order!.map((id, i) => {
              const n = byId.get(id) as GNode;
              return <span key={id} className="chain-item">{i > 0 && <span className="chain-arrow">→</span>}<a className="idlink" href={href(`/graph?id=${id}`)}>{id}</a> <span className="muted">{n.caption}</span></span>;
            })}
            <span className="tag tag-amber">{res.hops} hop{res.hops === 1 ? '' : 's'}</span>
          </div>
          <GraphView graph={res} highlight={res.order} linear height={300} onSelect={(id) => id && navigate(`/graph?id=${id}`)} />
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- Graph Data Science
interface Member { id: string; alias: string; risk: string }
interface Louvain { communities: { community: number; size: number; members: Member[] }[]; projection: { nodes: number; relationships: number }; ms: number }
interface Ranking { title: string; rows: (Member & { score: number })[]; projection: { nodes: number; relationships: number }; ms: number }

function GdsPanel() {
  const status = useAsync(() => api<{ available: boolean; version?: string; reason?: string }>('/gds/status'), []);
  const [algo, setAlgo] = useState<'louvain' | 'pagerank' | 'betweenness'>('louvain');
  const [result, setResult] = useState<{ algo: string; louvain?: Louvain; ranking?: Ranking; graph: Graph } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setError('');
    try {
      const [r, graph] = await Promise.all([api(`/gds/${algo}`), api<Graph>('/graph', { query: { labels: 'Suspect', types: 'KNOWS' } })]);
      setResult(algo === 'louvain' ? { algo, louvain: r, graph } : { algo, ranking: r, graph });
    } catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }

  const groups = useMemo(() => {
    if (!result?.louvain) return undefined;
    const g: Record<string, number> = {};
    result.louvain.communities.forEach((c, i) => c.members.forEach((m) => { g[m.id] = i; }));
    return g;
  }, [result]);
  const sizes = useMemo(() => {
    if (!result?.ranking) return undefined;
    const max = Math.max(...result.ranking.rows.map((r) => r.score), 1e-9);
    return Object.fromEntries(result.ranking.rows.map((r) => [r.id, r.score / max]));
  }, [result]);

  return (
    <Panel title="Network analysis: Neo4j Graph Data Science" actions={
      <Loadable s={status}>{(s) => (s.available ? <span className="tag tag-green">GDS {s.version}</span> : <span className="tag tag-red">GDS not installed</span>)}</Loadable>}>
      <Loadable s={status}>
        {(s) => !s.available ? (
          <div className="alert alert-warn">{s.reason}. Community detection, PageRank and betweenness need the plugin. See the README ("Graph Data Science"). Degree centrality (query A1) still works without it.</div>
        ) : (
          <>
            <p className="muted small">Projection: every <b>Suspect</b> and their <b>KNOWS</b> ties (undirected; Louvain weights ties by <code>strength</code>). The projection is created for each run and dropped straight after.</p>
            <div className="row gap wrap">
              <div className="seg" role="tablist">
                {([['louvain', 'Louvain communities'], ['pagerank', 'PageRank'], ['betweenness', 'Betweenness']] as const).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={algo === k} className={algo === k ? 'on' : ''} onClick={() => setAlgo(k)}>{l}</button>))}
              </div>
              <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run algorithm'}</button>
            </div>
            <p className="small muted">
              {algo === 'louvain' && 'Louvain groups suspects into communities that are densely tied internally: likely syndicates or crews.'}
              {algo === 'pagerank' && 'PageRank scores a suspect higher when they are tied to other well-connected suspects: likely leaders.'}
              {algo === 'betweenness' && 'Betweenness counts how many shortest paths pass through a suspect: brokers or go-betweens linking groups.'}
            </p>
            {error && <ErrorBox message={error} />}
            {result?.louvain && (
              <>
                <p className="small">{result.louvain.communities.length} communities among {result.louvain.projection.nodes} suspects · {result.louvain.ms} ms</p>
                <GraphView graph={result.graph} groups={groups} height={420} onSelect={(id) => id && navigate(`/graph?id=${id}`)} />
                <div className="communities">
                  {result.louvain.communities.map((c, i) => (
                    <div key={c.community} className="community">
                      <h3>Community {i + 1} <span className="muted">({c.size})</span></h3>
                      <div className="chips">{c.members.map((m) => <a key={m.id} href={href(`/graph?id=${m.id}`)} className={`tag ${m.risk === 'High' ? 'tag-red' : ''}`}>{m.id} {m.alias}</a>)}</div>
                    </div>))}
                </div>
              </>
            )}
            {result?.ranking && (
              <div className="grid-2">
                <div>
                  <p className="small">{result.ranking.title} · {result.ranking.ms} ms</p>
                  <div className="table-wrap"><table>
                    <thead><tr><th>#</th><th>suspect</th><th>alias</th><th>risk</th><th>score</th></tr></thead>
                    <tbody>{result.ranking.rows.slice(0, 12).map((r, i) => (
                      <tr key={r.id} className="clickable" onClick={() => navigate(`/graph?id=${r.id}`)}>
                        <td>{i + 1}</td><td><a className="idlink" href={href(`/graph?id=${r.id}`)}>{r.id}</a></td><td>{r.alias}</td><td>{r.risk}</td>
                        <td><span className="bar"><i style={{ width: `${(100 * r.score) / (result.ranking!.rows[0].score || 1)}%` }} /></span>{r.score}</td>
                      </tr>))}
                    </tbody>
                  </table></div>
                </div>
                <GraphView graph={result.graph} sizes={sizes} height={420} onSelect={(id) => id && navigate(`/graph?id=${id}`)} />
              </div>
            )}
          </>
        )}
      </Loadable>
    </Panel>
  );
}

// ---------------------------------------------------------------- named queries Q1..A6
interface Catalogue { name: string; title: string; params: Record<string, string | number> }
const PARAM_RULES: Record<string, (v: string) => string | null> = {
  suspect_id: (v) => (/^S\d{3,}$/.test(v) ? null : 'a suspect id such as S001'),
  from: (v) => (/^S\d{3,}$/.test(v) ? null : 'a suspect id such as S002'),
  to: (v) => (/^S\d{3,}$/.test(v) ? null : 'a suspect id such as S026'),
  crime_id: (v) => (/^CR\d{3,}$/.test(v) ? null : 'a crime id such as CR002'),
  evidence_id: (v) => (/^E\d{3,}$/.test(v) ? null : 'an evidence id such as E002'),
  min_strength: (v) => (v !== '' && Number(v) >= 0 && Number(v) <= 1 ? null : 'a number between 0 and 1'),
  term: (v) => (/^[\w\s-]{2,40}$/.test(v) ? null : '2-40 letters, digits or spaces'),
};

const TEXT_PARAMS = { term: 1, min_strength: 1 };   // everything else is an id: upper-cased

function Queries() {
  const cat = useAsync(() => api<Catalogue[]>('/analytics'), []);
  const { query } = useRoute();
  const [name, setName] = useState(query.get('q') || 'Q1');
  const [params, setParams] = useState<Record<string, string>>({});
  const [res, setRes] = useState<{ title: string; rows: Record<string, unknown>[]; ms: number; params: Record<string, unknown> } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(q: Catalogue) {
    const raw = (k: string, d: string | number) => (params[k] ?? String(d)).trim();
    const values = Object.fromEntries(Object.entries(q.params).map(([k, d]) => [k, k in TEXT_PARAMS ? raw(k, d) : raw(k, d).toUpperCase()]));
    const problems = Object.entries(values).map(([k, v]) => { const msg = PARAM_RULES[k]?.(v); return msg && `${k} must be ${msg}`; }).filter(Boolean);
    setError(''); setRes(null);
    if (problems.length) { setError(problems.join('; ')); return; }
    setBusy(true);
    try {
      setRes(await api(`/analytics/${q.name}`, { query: values }));
    } catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }

  return (
    <Panel title="Investigation query library">
      <Loadable s={cat}>
        {(list) => {
          const tabular = list.filter((q) => !q.name.startsWith('V'));
          const q = tabular.find((x) => x.name === name) || tabular[0];
          return (
            <div className="queries">
              <ul className="query-list" role="listbox" aria-label="Queries">
                {tabular.map((x) => (
                  <li key={x.name}><button role="option" aria-selected={x.name === q.name} className={x.name === q.name ? 'on' : ''}
                    onClick={() => { setName(x.name); setParams({}); setRes(null); setError(''); }}><b>{x.name}</b> {x.title}</button></li>))}
                <li className="muted small">V1/V2 (visual queries) are in the Graph explorer: neighbourhood depth 2 and Whole network.</li>
              </ul>
              <div className="query-run">
                <h3>{q.name} · {q.title}</h3>
                <form className="row gap wrap" onSubmit={(e) => { e.preventDefault(); run(q); }}>
                  {Object.entries(q.params).map(([k, d]) => (
                    <label key={k} className="inline">{k.replace(/_/g, ' ')}<input value={params[k] ?? String(d)} onChange={(e) => setParams({ ...params, [k]: e.target.value })} size={10} /></label>))}
                  {!Object.keys(q.params).length && <span className="muted small">No parameters.</span>}
                  <button className="btn btn-primary" disabled={busy}>{busy ? 'Running…' : 'Run query'}</button>
                </form>
                {error && <ErrorBox message={error} />}
                {busy && <Spinner label="Running" />}
                {res && <><p className="small muted">{res.rows.length} row{res.rows.length === 1 ? '' : 's'} · {res.ms} ms</p><DataTable rows={res.rows} empty="The query returned no rows." /></>}
                {!res && !busy && !error && <Empty>Set the parameters and run the query.</Empty>}
              </div>
            </div>
          );
        }}
      </Loadable>
    </Panel>
  );
}

export default function Analytics() {
  const { query } = useRoute();
  const tab = query.get('tab') || 'path';
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Investigation analytics</h1><p className="muted">Shortest paths, graph algorithms and the Cypher query library. Only predefined, parameterised queries run; the browser never sends Cypher.</p></div>
      </div>
      <nav className="tabs">
        <a href={href('/analytics?tab=path')} className={tab === 'path' ? 'on' : ''}>Shortest path</a>
        <a href={href('/analytics?tab=gds')} className={tab === 'gds' ? 'on' : ''}>Communities &amp; centrality</a>
        <a href={href('/analytics?tab=queries')} className={tab === 'queries' ? 'on' : ''}>Query library</a>
      </nav>
      {tab === 'path' && <ShortestPath />}
      {tab === 'gds' && <GdsPanel />}
      {tab === 'queries' && <Queries />}
    </div>
  );
}
