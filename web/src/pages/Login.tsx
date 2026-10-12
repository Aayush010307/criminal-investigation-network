import { useState, type FormEvent } from 'react';
import { api, describe, setSession, type Session } from '../api';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      <div className="login-card">
        <div className="brand brand-lg"><span className="brand-mark" aria-hidden />Criminal Investigation Network</div>
        <p className="muted">Graph-based investigative intelligence on Neo4j</p>
        <form onSubmit={submit} noValidate>
          <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
          <label>Username
            <input value={username} onChange={(e) => setUsername(e.target.value.trim().toLowerCase())} autoComplete="username" autoFocus required
              aria-invalid={!!username && !usernameOk} />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={!!password && !passwordOk} />
          </label>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          {note && <div className="alert alert-ok" role="status">{note}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
        </form>
        <button className="linkbtn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNote(''); }}>
          {mode === 'login' ? 'No account? Register (read-only access)' : 'Have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
