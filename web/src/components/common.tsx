import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { describe } from '../api';

// ---------- hash router: #/records/suspects/S001?x=1  ->  { parts: ['records','suspects','S001'], query }
const subscribe = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const [p, q = ''] = hash.replace(/^#\/?/, '').split('?');
  return { parts: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}
export const navigate = (to: string) => { window.location.hash = to; };
export const href = (to: string) => `#${to}`;

// ---------- async data with loading / error / reload
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: true });
  const seq = useRef(0);
  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ loading: true, data: s.data }));
    fn().then((data) => { if (id === seq.current) setState({ loading: false, data }); },
      (e) => { if (id === seq.current) setState({ loading: false, error: describe(e) }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

// ---------- states
export const Spinner = ({ label = 'Loading' }: { label?: string }) => <div className="state" role="status"><span className="spinner" aria-hidden /> {label}…</div>;
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="alert alert-error" role="alert"><span>{message}</span>{onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}</div>
);
export const Empty = ({ children }: { children: ReactNode }) => <div className="state empty">{children}</div>;
export function Loadable<T>({ s, children, label }: { s: { loading: boolean; data?: T; error?: string; reload: () => void }; children: (d: T) => ReactNode; label?: string }) {
  if (s.error) return <ErrorBox message={s.error} onRetry={s.reload} />;
  if (s.data === undefined) return <Spinner label={label} />;
  return <>{children(s.data)}</>;
}

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && <header className="panel-head"><h2>{title}</h2><div className="panel-actions">{actions}</div></header>}
      <div className="panel-body">{children}</div>
    </section>
  );
}

// ---------- values and tables
const ID_RE = /^(S|CR|L|E|B)\d{3,}$/;
export function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="muted">—</span>;
  if (typeof v === 'boolean') return <span className={`tag ${v ? 'tag-amber' : ''}`}>{v ? 'yes' : 'no'}</span>;
  if (Array.isArray(v)) return <span className="chips">{v.map((x, i) => <Value key={i} v={x} />)}</span>;
  if (typeof v === 'object') return <code className="small">{JSON.stringify(v)}</code>;
  const s = String(v);
  if (ID_RE.test(s)) return <a className="idlink" href={href(`/graph?id=${s}`)} title="Open in graph explorer">{s}</a>;
  const m = /^((?:S|CR|L|E|B)\d{3,})( .*)$/.exec(s);
  if (m) return <span><a className="idlink" href={href(`/graph?id=${m[1]}`)}>{m[1]}</a>{m[2]}</span>;
  return <span>{s}</span>;
}

export function DataTable({ rows, columns, onRow, empty = 'No rows' }: { rows: Record<string, unknown>[]; columns?: string[]; onRow?: (r: Record<string, unknown>) => void; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  const cols = columns || Object.keys(rows[0]);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(r) : undefined}
              tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : undefined}>
              {cols.map((c) => <td key={c}><Value v={r[c]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- in-page confirmation (no blocking browser dialogs)
export function Confirm({ text, confirmLabel = 'Delete', onConfirm, onCancel, busy }: { text: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <div className="confirm" role="alertdialog">
      <p>{text}</p>
      <div className="row gap">
        <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button>
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

export const LABEL_COLORS: Record<string, string> = {
  Suspect: '#e5484d', Crime: '#f2a93b', Location: '#3fa7d6', Evidence: '#a78bfa', Officer: '#4cc38a',
};
export const LabelDot = ({ label }: { label: string }) => <span className="dot" style={{ background: LABEL_COLORS[label] || '#888' }} aria-hidden />;
