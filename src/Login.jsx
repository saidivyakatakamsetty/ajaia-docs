import { useState } from 'react';
import { api } from './api.js';

const DEMO_USERS = [
  { email: 'alice@ajaia.dev', name: 'Alice Chen' },
  { email: 'bob@ajaia.dev', name: 'Bob Rivera' },
  { email: 'carol@ajaia.dev', name: 'Carol Singh' },
];
const DEMO_PASSWORD = 'demo1234';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e, creds = { email, password }) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token, user } = await api.login(creds.email, creds.password);
      onLogin(token, user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="brand"><span className="logo" /> Ajaia Docs</div>
        <h1>Sign in</h1>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="demo">
          <div className="muted small">Demo accounts (password <code>{DEMO_PASSWORD}</code>)</div>
          {DEMO_USERS.map((u) => (
            <button type="button" key={u.email} className="btn ghost demo-user" disabled={busy}
              onClick={() => submit(null, { email: u.email, password: DEMO_PASSWORD })}>
              <span className="avatar">{u.name[0]}</span>
              <span><strong>{u.name}</strong><br /><span className="muted small">{u.email}</span></span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
