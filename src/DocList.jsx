import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { navigate } from './router.js';

const ACCEPT = '.txt,.md,.markdown,.docx';

export function formatDate(sqlUtc) {
  const d = new Date(`${sqlUtc.replace(' ', 'T')}Z`);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function DocList({ user, onLogout }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = () => api.listDocs().then(setDocs).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function run(fn) {
    setBusy(true);
    setError('');
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const createDoc = () => run(async () => {
    const { document } = await api.createDoc();
    navigate(`/doc/${document.id}`);
  });

  const importFile = (file) => run(async () => {
    const { document } = await api.importFile(file);
    navigate(`/doc/${document.id}`);
  });

  const deleteDoc = (doc) => {
    if (!window.confirm(`Delete "${doc.title}"? This also removes access for anyone it's shared with.`)) return;
    run(async () => { await api.deleteDoc(doc.id); await load(); });
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand"><span className="logo" /> Ajaia Docs</div>
        <div className="row">
          <span className="avatar" title={user.email}>{user.name[0]}</span>
          <span className="small">{user.name}</span>
          <button className="btn ghost small" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="list-main">
        <section className="actions">
          <button className="btn primary" onClick={createDoc} disabled={busy}>+ New document</button>
          <button className="btn" onClick={() => fileInput.current.click()} disabled={busy}>Import file…</button>
          <input ref={fileInput} type="file" accept={ACCEPT} hidden
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); }} />
          <span className="muted small">Import supports .txt, .md and .docx (max 5 MB) and creates a new editable document.</span>
        </section>
        {error && <div className="error" role="alert">{error}</div>}

        {!docs ? <p className="muted">Loading…</p> : (
          <>
            <DocSection title="My documents" empty="No documents yet — create one or import a file."
              docs={docs.owned} renderMeta={(d) => (
                <>
                  {d.share_count > 0 && <span className="badge">Shared · {d.share_count}</span>}
                  <button className="btn ghost small danger" onClick={(e) => { e.stopPropagation(); deleteDoc(d); }}>
                    Delete
                  </button>
                </>
              )} />
            <DocSection title="Shared with me" empty="Nothing has been shared with you yet."
              docs={docs.shared} renderMeta={(d) => (
                <>
                  <span className="muted small">Owner: {d.owner_name}</span>
                  <span className={`badge ${d.role}`}>{d.role === 'editor' ? 'Can edit' : 'View only'}</span>
                </>
              )} />
          </>
        )}
      </main>
    </div>
  );
}

function DocSection({ title, docs, empty, renderMeta }) {
  return (
    <section className="doc-section">
      <h2>{title}</h2>
      {docs.length === 0 ? <p className="muted small">{empty}</p> : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id} onClick={() => navigate(`/doc/${d.id}`)} tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/doc/${d.id}`)}>
              <span className="doc-icon" />
              <span className="doc-title">{d.title}</span>
              <span className="muted small">Edited {formatDate(d.updated_at)}</span>
              <span className="meta">{renderMeta(d)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
