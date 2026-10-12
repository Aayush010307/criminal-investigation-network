import { useState } from 'react';
import { api, describe, getSession, type Role } from '../api';
import { Confirm, ErrorBox, Loadable, Panel, useAsync } from '../components/common';

interface User { username: string; role: Role; created_at: string }
const ROLES: Role[] = ['viewer', 'investigator', 'admin'];

export default function Users() {
  const users = useAsync(() => api<{ items: User[] }>('/auth/users'), []);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const me = getSession()?.username;
  const [pending, setPending] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!pending) return;
    setBusy(true); setError(''); setSaved('');
    try { await api(`/auth/users/${encodeURIComponent(pending.username)}`, { method: 'DELETE' }); setSaved(`${pending.username} deleted.`); setPending(null); users.reload(); }
    catch (e) { setError(describe(e)); } finally { setBusy(false); }
  }

  async function setRole(u: User, role: Role) {
    setError(''); setSaved('');
    try { await api(`/auth/users/${encodeURIComponent(u.username)}`, { method: 'PATCH', body: { role } }); setSaved(`${u.username} is now ${role}. The change applies at their next sign-in.`); users.reload(); }
    catch (e) { setError(describe(e)); }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Users &amp; roles</h1><p className="muted">Administrators grant roles. The server enforces them on every request.</p></div></div>
      <Panel title="Role permissions">
        <div className="table-wrap"><table>
          <thead><tr><th>role</th><th>read records, graph, analytics</th><th>create / edit records and relationships, register cases</th><th>delete records and relationships, manage users</th></tr></thead>
          <tbody>
            <tr><td><span className="tag">viewer</span></td><td>yes</td><td>no</td><td>no</td></tr>
            <tr><td><span className="tag tag-amber">investigator</span></td><td>yes</td><td>yes</td><td>no</td></tr>
            <tr><td><span className="tag tag-red">admin</span></td><td>yes</td><td>yes</td><td>yes</td></tr>
          </tbody>
        </table></div>
      </Panel>
      <Panel title="Accounts">
        {error && <ErrorBox message={error} />}
        {saved && <div className="alert alert-ok" role="status">{saved}</div>}
        {pending && <Confirm text={<>Delete the account <b>{pending.username}</b>? Their current sign-in stays valid until it expires.</>} onConfirm={remove} onCancel={() => setPending(null)} busy={busy} />}
        <Loadable s={users}>
          {(r) => (
            <div className="table-wrap"><table>
              <thead><tr><th>username</th><th>role</th><th>created</th><th /></tr></thead>
              <tbody>{r.items.map((u) => (
                <tr key={u.username}>
                  <td>{u.username}{u.username === me && <span className="muted"> (you)</span>}</td>
                  <td>
                    <select value={u.role} disabled={u.username === me} aria-label={`Role of ${u.username}`} onChange={(e) => setRole(u, e.target.value as Role)}>
                      {ROLES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="muted small">{u.created_at?.slice(0, 16).replace('T', ' ')}</td>
                  <td>{u.username !== me && <button className="btn btn-sm btn-danger-ghost" onClick={() => setPending(u)}>Delete</button>}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Loadable>
      </Panel>
    </div>
  );
}
