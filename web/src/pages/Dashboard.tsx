import { api } from '../api';
import { DataTable, Loadable, Panel, href, navigate, useAsync, LABEL_COLORS } from '../components/common';

interface Health { nodes: Record<string, number>; relationships: number }
interface QueryResult { title: string; rows: Record<string, unknown>[] }
const run = (name: string) => api<QueryResult>(`/analytics/${name}`);

const TILES: [string, string, string][] = [
  ['Suspect', 'Suspects', 'suspects'], ['Crime', 'Crimes', 'crimes'], ['Location', 'Locations', 'locations'],
  ['Evidence', 'Evidence items', 'evidence'], ['Officer', 'Officers', 'officers'],
];

export default function Dashboard() {
  const health = useAsync(() => api<Health>('/health'), []);
  const crimes = useAsync(() => api<{ total: number; items: { status: string; severity: number }[] }>('/crimes', { query: { limit: 200 } }), []);
  const leads = useAsync(() => run('A6'), []);
  const hotspots = useAsync(() => run('Q6'), []);
  const repeat = useAsync(() => run('Q4'), []);
  const brokers = useAsync(() => run('A1'), []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Investigation dashboard</h1>
          <p className="muted">Live figures from the Neo4j database.</p>
        </div>
        <button className="btn" onClick={() => { health.reload(); crimes.reload(); leads.reload(); hotspots.reload(); repeat.reload(); brokers.reload(); }}>Refresh</button>
      </div>

      <Loadable s={health} label="Loading counts">
        {(h) => (
          <div className="tiles">
            {TILES.map(([label, title, path]) => (
              <a key={label} className="tile" href={href(`/records/${path}`)} style={{ borderTopColor: LABEL_COLORS[label] }}>
                <span className="tile-label">{title}</span>
                <span className="tile-value">{h.nodes[label] ?? 0}</span>
              </a>
            ))}
            <a className="tile" href={href('/graph?mode=overview')} style={{ borderTopColor: '#94a3b8' }}>
              <span className="tile-label">Relationships</span>
              <span className="tile-value">{h.relationships}</span>
            </a>
          </div>
        )}
      </Loadable>

      <Loadable s={crimes} label="Loading case status">
        {(c) => {
          const by = (s: string) => c.items.filter((x) => x.status === s).length;
          const open = by('Open'); const inv = by('Under Investigation'); const closed = by('Closed');
          const severe = c.items.filter((x) => x.severity >= 4 && x.status !== 'Closed').length;
          const pct = (n: number) => `${c.total ? (100 * n) / c.total : 0}%`;
          return (
            <Panel title="Case status">
              <div className="statusbar" role="img" aria-label={`${open} open, ${inv} under investigation, ${closed} closed`}>
                <span style={{ width: pct(open), background: 'var(--red)' }} />
                <span style={{ width: pct(inv), background: 'var(--amber)' }} />
                <span style={{ width: pct(closed), background: 'var(--green)' }} />
              </div>
              <div className="statusbar-legend">
                <span><i style={{ background: 'var(--red)' }} />Open <b>{open}</b></span>
                <span><i style={{ background: 'var(--amber)' }} />Under investigation <b>{inv}</b></span>
                <span><i style={{ background: 'var(--green)' }} />Closed <b>{closed}</b></span>
                <span className="alert-inline">{severe} unresolved case{severe === 1 ? '' : 's'} with severity ≥ 4</span>
              </div>
            </Panel>
          );
        }}
      </Loadable>

      <div className="grid-2">
        <Panel title="Open leads: crimes with no identified suspect" actions={<span className="tag tag-red">A6</span>}>
          <Loadable s={leads}>{(r) => <DataTable rows={r.rows} empty="Every crime has at least one suspect" onRow={(x) => navigate(`/graph?id=${x.id}`)} />}</Loadable>
        </Panel>
        <Panel title="Crime hotspots" actions={<span className="tag">Q6</span>}>
          <Loadable s={hotspots}>{(r) => <DataTable rows={r.rows} columns={['id', 'address', 'city', 'incidents', 'avg_severity']} />}</Loadable>
        </Panel>
        <Panel title="Repeat offenders" actions={<span className="tag">Q4</span>}>
          <Loadable s={repeat}>{(r) => <DataTable rows={r.rows.slice(0, 6)} columns={['id', 'alias', 'risk', 'crimes']} onRow={(x) => navigate(`/graph?id=${x.id}`)} />}</Loadable>
        </Panel>
        <Panel title="Most connected suspects (degree)" actions={<span className="tag">A1</span>}>
          <Loadable s={brokers}>{(r) => <DataTable rows={r.rows} onRow={(x) => navigate(`/graph?id=${x.id}`)} />}</Loadable>
        </Panel>
      </div>
    </div>
  );
}
