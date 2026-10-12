import { useEffect, useState, useSyncExternalStore } from 'react';
import { can, getSession, onSession, setSession } from './api';
import { href, useRoute } from './components/common';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GraphExplorer from './pages/GraphExplorer';
import Records from './pages/Records';
import Analytics from './pages/Analytics';
import Users from './pages/Users';

const NAV = [
  ['dashboard', 'Dashboard'], ['graph', 'Graph explorer'], ['records', 'Records'], ['analytics', 'Analytics'],
] as const;

export default function App() {
  const session = useSyncExternalStore(onSession, getSession);
  const { parts } = useRoute();
  const [menu, setMenu] = useState(false);
  const page = parts[0] || 'dashboard';
  useEffect(() => { setMenu(false); window.scrollTo(0, 0); }, [page]);

  if (!session) return <Login />;
  const nav = can('admin') ? [...NAV, ['users', 'Users'] as const] : NAV;
  const current = nav.some(([k]) => k === page) ? page : 'notfound';

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href={href('/dashboard')}><span className="brand-mark" aria-hidden />CIN</a>
        <button className="btn btn-sm menu-btn" aria-expanded={menu} aria-controls="mainnav" onClick={() => setMenu(!menu)}>Menu</button>
        <nav id="mainnav" className={`mainnav ${menu ? 'open' : ''}`} aria-label="Main">
          {nav.map(([k, l]) => <a key={k} href={href(`/${k}`)} className={k === page ? 'on' : ''} aria-current={k === page ? 'page' : undefined}>{l}</a>)}
        </nav>
        <div className="account">
          <span className="who">{session.username} <span className={`tag ${session.role === 'admin' ? 'tag-red' : session.role === 'investigator' ? 'tag-amber' : ''}`}>{session.role}</span></span>
          <button className="btn btn-sm" onClick={() => setSession(null)}>Sign out</button>
        </div>
      </header>
      <main>
        {current === 'dashboard' && <Dashboard />}
        {current === 'graph' && <GraphExplorer />}
        {current === 'records' && <Records />}
        {current === 'analytics' && <Analytics />}
        {current === 'users' && <Users />}
        {current === 'notfound' && (
          <div className="page"><h1>Page not found</h1><p className="muted">{page === 'users' ? 'User management needs the admin role.' : `There is no page '${page}'.`} <a href={href('/dashboard')}>Back to the dashboard</a></p></div>
        )}
      </main>
    </div>
  );
}
