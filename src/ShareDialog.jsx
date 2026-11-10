import { useEffect, useState } from 'react';
import { api } from './api.js';

export default function ShareDialog({ docId, onClose }) {
  const [shares, setShares] = useState([]);
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.shares(docId).then((r) => setShares(r.shares)).catch((e) => setError(e.message));
    api.users().then((r) => setUsers(r.users)).catch(() => {});
  }, [docId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try { setShares((await fn()).shares); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const add = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    run(async () => { const r = await api.share(docId, email.trim(), role); setEmail(''); return r; });
  };

  const sharedIds = new Set(shares.map((s) => s.user_id));
  const suggestions = users.filter((u) => !sharedIds.has(u.id));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h2 id="share-title">Share document</h2>
        <form className="share-form" onSubmit={add}>
          <input type="email" placeholder="Add people by email" value={email} list="share-users"
            onChange={(e) => setEmail(e.target.value)} autoFocus aria-label="Email" />
          <datalist id="share-users">
            {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button className="btn primary" disabled={busy || !email.trim()}>Share</button>
        </form>
        {error && <div className="error" role="alert">{error}</div>}

        <h3 className="small muted">People with access</h3>
        <ul className="share-list">
          <li><span className="avatar">Y</span><span className="grow">You</span><span className="muted small">Owner</span></li>
          {shares.map((s) => (
            <li key={s.user_id}>
              <span className="avatar">{s.name[0]}</span>
              <span className="grow">{s.name}<br /><span className="muted small">{s.email}</span></span>
              <select value={s.role} disabled={busy} aria-label={`Role for ${s.name}`}
                onChange={(e) => run(() => api.share(docId, s.email, e.target.value))}>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button className="btn ghost small danger" disabled={busy}
                onClick={() => run(() => api.unshare(docId, s.user_id))}>Remove</button>
            </li>
          ))}
        </ul>
        <p className="muted small">Demo users: alice@, bob@, carol@ajaia.dev</p>
        <div className="modal-actions"><button className="btn" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
