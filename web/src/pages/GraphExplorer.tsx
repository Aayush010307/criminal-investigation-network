import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, describe, ENTITY_OF, LABEL_OF_ID, type GNode, type Graph } from '../api';
import { ErrorBox, Empty, LabelDot, Panel, Spinner, Value, href, navigate, useRoute } from '../components/common';
import GraphView, { Legend } from '../components/GraphView';

const LABELS = ['Suspect', 'Crime', 'Location', 'Evidence', 'Officer'];
const TYPES = ['KNOWS', 'COMMITTED', 'OCCURRED_AT', 'LINKED_TO', 'INVESTIGATING', 'FOUND_AT'];

function merge(a: Graph, b: Graph): Graph {
  const nodes = new Map(a.nodes.map((n) => [n.id, n]));
  b.nodes.forEach((n) => nodes.set(n.id, n));
  const key = (e: Graph['edges'][number]) => `${e.source}|${e.type}|${e.target}`;
  const edges = new Map(a.edges.map((e) => [key(e), e]));
  b.edges.forEach((e) => edges.set(key(e), e));
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export default function GraphExplorer() {
  const { query } = useRoute();
  const mode = query.get('mode') === 'overview' ? 'overview' : 'focus';
  const focusId = query.get('id') || 'S001';
  const depth = query.get('depth') === '2' ? 2 : 1;

  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [labels, setLabels] = useState<Set<string>>(new Set(LABELS));
  const [types, setTypes] = useState<Set<string>>(new Set(TYPES));
  const [input, setInput] = useState(focusId);

  async function load(p: Promise<Graph>, select: string | null) {
    setLoading(true); setError('');
    try { setGraph(await p); setSelected(select); } catch (e) { setError(describe(e)); } finally { setLoading(false); }
  }

  useEffect(() => {
    setInput(focusId);
    if (mode === 'overview') load(api<Graph>('/graph'), null);
    else load(api<Graph>(`/graph/node/${encodeURIComponent(focusId)}`, { query: { depth } }), focusId);
  }, [mode, focusId, depth]);

  async function expand(id: string) {
    setLoading(true); setError('');
    try { const g = await api<Graph>(`/graph/node/${encodeURIComponent(id)}`); setGraph((cur) => (cur ? merge(cur, g) : g)); }
    catch (e) { setError(describe(e)); } finally { setLoading(false); }
  }

  const shown = useMemo<Graph | null>(() => {
    if (!graph) return null;
    const nodes = graph.nodes.filter((n) => labels.has(n.label));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: graph.edges.filter((e) => types.has(e.type) && ids.has(e.source) && ids.has(e.target)) };
  }, [graph, labels, types]);

  const node = graph?.nodes.find((n) => n.id === selected) || null;
  const neighbours = useMemo(() => {
    if (!graph || !selected) return [];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return graph.edges.filter((e) => e.source === selected || e.target === selected).map((e) => {
      const other = e.source === selected ? e.target : e.source;
      return { edge: e, out: e.source === selected, node: byId.get(other) as GNode };
    });
  }, [graph, selected]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const id = input.trim().toUpperCase();
    if (!LABEL_OF_ID(id)) { setError(`'${input}' is not a valid id - use e.g. S001, CR002, L003, E004 or B1205`); return; }
    navigate(`/graph?id=${id}&depth=${depth}`);
  }
  const toggle = (set: Set<string>, v: string, fn: (s: Set<string>) => void) => { const s = new Set(set); if (s.has(v)) s.delete(v); else s.add(v); fn(s); };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Graph explorer</h1><p className="muted">Select a node to inspect it; expand to pull in its neighbours.</p></div>
        <div className="seg" role="tablist">
          <a role="tab" aria-selected={mode === 'focus'} className={mode === 'focus' ? 'on' : ''} href={href(`/graph?id=${focusId}`)}>Neighbourhood</a>
          <a role="tab" aria-selected={mode === 'overview'} className={mode === 'overview' ? 'on' : ''} href={href('/graph?mode=overview')}>Whole network</a>
        </div>
      </div>

      <div className="toolbar">
        {mode === 'focus' && (
          <form className="row gap" onSubmit={submit}>
            <label className="inline">Centre on <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="S001" size={8} aria-label="Node id" /></label>
            <label className="inline">Depth
              <select value={depth} onChange={(e) => navigate(`/graph?id=${focusId}&depth=${e.target.value}`)}><option value="1">1 hop</option><option value="2">2 hops</option></select>
            </label>
            <button className="btn btn-primary">Show</button>
          </form>
        )}
        <details className="filters">
          <summary>Filters ({labels.size}/{LABELS.length} labels, {types.size}/{TYPES.length} types)</summary>
          <div className="filter-groups">
            <fieldset><legend>Node labels</legend>{LABELS.map((l) => (
              <label key={l} className="check"><input type="checkbox" checked={labels.has(l)} onChange={() => toggle(labels, l, setLabels)} /><LabelDot label={l} />{l}</label>))}
            </fieldset>
            <fieldset><legend>Relationship types</legend>{TYPES.map((t) => (
              <label key={t} className="check"><input type="checkbox" checked={types.has(t)} onChange={() => toggle(types, t, setTypes)} />{t}</label>))}
            </fieldset>
          </div>
        </details>
        <Legend />
      </div>

      {error && <ErrorBox message={error} />}
      <div className="explorer">
        <div className="explorer-graph">
          {loading && <div className="overlay"><Spinner /></div>}
          {shown && (shown.nodes.length ? <GraphView graph={shown} selected={selected} onSelect={setSelected} height="calc(100vh - 250px)" />
            : <Empty>No nodes match the current filters.</Empty>)}
          {!shown && !loading && !error && <Empty>Nothing loaded.</Empty>}
        </div>
        <aside className="explorer-side">
          {node ? (
            <Panel title={<><LabelDot label={node.label} />{node.label} {node.id}</>}>
              <dl className="props">{Object.entries(node.props).map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd><Value v={v} /></dd></div>)}</dl>
              <div className="row gap wrap">
                <button className="btn btn-sm" onClick={() => expand(node.id)}>Expand neighbours</button>
                <a className="btn btn-sm" href={href(`/graph?id=${node.id}&depth=${depth}`)}>Centre here</a>
                <a className="btn btn-sm" href={href(`/records/${ENTITY_OF[node.label]}/${node.id}`)}>Open record</a>
              </div>
              <h3>Connections ({neighbours.length} loaded)</h3>
              {neighbours.length ? (
                <ul className="neighbours">
                  {neighbours.map(({ edge, out, node: o }, i) => (
                    <li key={i}>
                      <span className="reltype">{out ? `—${edge.type}→` : `←${edge.type}—`}</span>
                      <button className="linkbtn" onClick={() => setSelected(o.id)}><LabelDot label={o.label} />{o.id} <span className="muted">{o.caption}</span></button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No connections loaded. Try "Expand neighbours".</p>}
            </Panel>
          ) : <Panel title="Details"><p className="muted">Click a node to see its properties and connections.</p></Panel>}
        </aside>
      </div>
    </div>
  );
}
