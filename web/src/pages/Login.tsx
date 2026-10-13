import { useState, type FormEvent } from 'react';
import { api, describe, setSession, type Session } from '../api';

// Decorative evidence-network art for the hero panel: amber = suspect, red = crime, blue = location, grey = officer.
const NODES: [number, number, number, string][] = [
  [70, 80, 9, '#f2a93b'], [170, 40, 6, '#94a3b8'], [260, 95, 8, '#e5484d'], [340, 50, 5, '#3fa7d6'],
  [120, 170, 7, '#e5484d'], [220, 180, 10, '#f2a93b'], [320, 165, 6, '#94a3b8'], [60, 250, 5, '#3fa7d6'],
  [160, 270, 7, '#f2a93b'], [280, 265, 6, '#e5484d'],
];
const EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [0, 4], [1, 4], [2, 5], [4, 5], [5, 6], [3, 6], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9], [7, 8]];

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const usernameOk = /^[a-z0-9_.-]{3,32}$/.test(username);
  const passwordOk = password.length >= 8 && password.length <= 128;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setNote('');
    if (!usernameOk || !passwordOk) { setError('Username: 3-32 lower-case letters, digits, . _ -   Password: at least 8 characters.'); return; }
    setBusy(true);
    try {
      if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: { username, password } });
        setNote('Account created with the viewer role (read-only). An administrator can grant the investigator role. You can sign in now.');
        setMode('login');
      } else {
        const r = await api<{ token: string; user: { username: string; role: Session['role'] } }>('/auth/login', { method: 'POST', body: { username, password } });
        setPassword('');
        setSession({ token: r.token, username: r.user.username, role: r.user.role });
      }
    } catch (err) { setError(describe(err)); } finally { setBusy(false); }
  }

  return (
    <main className="login">
      <div className="login-shell">
        <aside className="login-hero">
          <div className="brand"><span className="brand-mark" aria-hidden />Criminal Investigation Network</div>
          <svg className="login-art" viewBox="0 0 400 320" aria-hidden>
            {EDGES.map(([a, b]) => <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />)}
            {NODES.map(([x, y, r, c]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={c} />)}
          </svg>
          <p className="login-tagline">Graph-based investigative intelligence on Neo4j</p>
        </aside>

        <section className="login-main">
          <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
          <button type="button" className="linkbtn login-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNote(''); }}>
            {mode === 'login' ? 'No account? Register (read-only access)' : 'Have an account? Sign in'}
          </button>

          <form onSubmit={submit} noValidate>
            <label>
              <span className="sr-only">Username</span>
              <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value.trim().toLowerCase())}
                autoComplete="username" autoFocus required aria-invalid={!!username && !usernameOk} />
            </label>
            <label className="pw">
              <span className="sr-only">Password</span>
              <input placeholder="Enter your password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={!!password && !passwordOk} />
              <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPw && <path d="M4 20 20 4" />}
                </svg>
              </button>
            </label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {note && <div className="alert alert-ok" role="status">{note}</div>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
