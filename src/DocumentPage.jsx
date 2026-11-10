import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { api } from './api.js';
import { navigate } from './router.js';
import ShareDialog from './ShareDialog.jsx';

const AUTOSAVE_MS = 800;

export default function DocumentPage({ id, user }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getDoc(id).then((r) => setDoc(r.document)).catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="center">
        <div className="card narrow">
          <h2>Can't open this document</h2>
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={() => navigate('/')}>Back to documents</button>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="center muted">Loading document…</div>;
  return <Editor doc={doc} user={user} />;
}

/** Batches title/content changes and PATCHes them; one request in flight at a time. */
function useAutosave(docId) {
  const pending = useRef({});
  const timer = useRef(null);
  const inFlight = useRef(false);
  const [status, setStatus] = useState('saved'); // saved | dirty | saving | error
  const [saveError, setSaveError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || Object.keys(pending.current).length === 0) return;
    const changes = pending.current;
    pending.current = {};
    inFlight.current = true;
    setStatus('saving');
    try {
      const { document } = await api.updateDoc(docId, changes);
      setUpdatedAt(document.updated_at);
      setSaveError('');
      setStatus(Object.keys(pending.current).length ? 'dirty' : 'saved');
    } catch (e) {
      pending.current = { ...changes, ...pending.current }; // keep for retry
      setSaveError(e.message);
      setStatus('error');
    } finally {
      inFlight.current = false;
    }
    if (Object.keys(pending.current).length) timer.current = setTimeout(flush, AUTOSAVE_MS);
  }, [docId]);

  const queue = useCallback((changes, immediate = false) => {
    Object.assign(pending.current, changes);
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, immediate ? 0 : AUTOSAVE_MS);
  }, [flush]);

  useEffect(() => {
    const warn = (e) => {
      if (inFlight.current || Object.keys(pending.current).length) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); flush(); };
  }, [flush]);

  return { queue, flush, status, saveError, updatedAt };
}

function Editor({ doc, user }) {
  const canEdit = doc.role !== 'viewer';
  const [title, setTitle] = useState(doc.title);
  const savedTitle = useRef(doc.title);
  const [titleError, setTitleError] = useState('');
  const [sharing, setSharing] = useState(false);
  const { queue, flush, status, saveError, updatedAt } = useAutosave(doc.id);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: !canEdit } })],
    content: doc.content,
    editable: canEdit,
    onUpdate: ({ editor: ed }) => queue({ content: ed.getHTML() }),
  });

  function commitTitle() {
    const t = title.trim();
    if (!t) { setTitleError('Title cannot be empty.'); setTitle(savedTitle.current); return; }
    if (t.length > 200) { setTitleError('Title must be 200 characters or fewer.'); return; }
    setTitleError('');
    if (t !== savedTitle.current) { savedTitle.current = t; setTitle(t); queue({ title: t }, true); }
  }

  const back = async () => { await flush(); navigate('/'); };

  return (
    <div className="page">
      <header className="topbar doc-topbar">
        <button className="btn ghost" onClick={back} title="Back to documents">←</button>
        <div className="title-block">
          <input className="title-input" value={title} disabled={!canEdit} aria-label="Document title"
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTitle(savedTitle.current); e.currentTarget.blur(); } }} />
          <div className="small muted">
            {doc.role === 'owner' ? 'Owned by you' : `Owned by ${doc.owner.name} · you ${doc.role === 'editor' ? 'can edit' : 'can view'}`}
            {' · '}<SaveStatus status={status} error={saveError} updatedAt={updatedAt} canEdit={canEdit} onRetry={flush} />
          </div>
          {titleError && <div className="error small">{titleError}</div>}
        </div>
        <div className="row">
          {doc.role === 'owner'
            ? <button className="btn primary" onClick={() => setSharing(true)}>Share</button>
            : <span className={`badge ${doc.role}`}>{doc.role === 'editor' ? 'Can edit' : 'View only'}</span>}
          <span className="avatar" title={user.email}>{user.name[0]}</span>
        </div>
      </header>

      {canEdit ? <Toolbar editor={editor} /> : (
        <div className="viewer-banner">You have view-only access. Ask {doc.owner.name} for edit access.</div>
      )}

      <div className="paper-wrap">
        <EditorContent editor={editor} className="paper" />
      </div>

      {sharing && <ShareDialog docId={doc.id} onClose={() => setSharing(false)} />}
    </div>
  );
}

function SaveStatus({ status, error, updatedAt, canEdit, onRetry }) {
  if (!canEdit) return <span>Read-only</span>;
  if (status === 'saving') return <span>Saving…</span>;
  if (status === 'dirty') return <span>Unsaved changes</span>;
  if (status === 'error') {
    return <span className="error-text">Save failed: {error} <button className="link" onClick={onRetry}>Retry</button></span>;
  }
  return <span title={updatedAt ? `Last saved ${updatedAt} UTC` : undefined}>All changes saved</span>;
}

function B({ active = false, onClick, label, title, disabled }) {
  return (
    <button type="button" className={`tb ${active ? 'active' : ''}`} onMouseDown={(e) => e.preventDefault()}
      onClick={onClick} title={title} aria-label={title} aria-pressed={active} disabled={disabled}>{label}</button>
  );
}

function Toolbar({ editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const blockValue = s.h1 ? 'h1' : s.h2 ? 'h2' : s.h3 ? 'h3' : 'p';
  const setBlock = (v) => (v === 'p' ? c().setParagraph().run() : c().setHeading({ level: Number(v[1]) }).run());

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <B onClick={() => c().undo().run()} label="↶" title="Undo (Ctrl+Z)" disabled={!s.canUndo} />
      <B onClick={() => c().redo().run()} label="↷" title="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} />
      <span className="sep" />
      <select value={blockValue} onChange={(e) => setBlock(e.target.value)} aria-label="Text style">
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="sep" />
      <B active={s.bold} onClick={() => c().toggleBold().run()} label={<b>B</b>} title="Bold (Ctrl+B)" />
      <B active={s.italic} onClick={() => c().toggleItalic().run()} label={<i>I</i>} title="Italic (Ctrl+I)" />
      <B active={s.underline} onClick={() => c().toggleUnderline().run()} label={<u>U</u>} title="Underline (Ctrl+U)" />
      <B active={s.strike} onClick={() => c().toggleStrike().run()} label={<s>S</s>} title="Strikethrough" />
      <span className="sep" />
      <B active={s.bullet} onClick={() => c().toggleBulletList().run()} label="• List" title="Bulleted list" />
      <B active={s.ordered} onClick={() => c().toggleOrderedList().run()} label="1. List" title="Numbered list" />
      <B active={s.quote} onClick={() => c().toggleBlockquote().run()} label="❝" title="Quote" />
    </div>
  );
}
