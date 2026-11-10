import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { verifyPassword } from './db.js';
import {
  fileToDocument, sanitizeContent, MAX_UPLOAD_BYTES, MAX_CONTENT_CHARS, MAX_TITLE_CHARS,
} from './content.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(db, { staticDir } = {}) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByToken: db.prepare(
      'SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    listUsers: db.prepare('SELECT id, email, name FROM users WHERE id != ? ORDER BY name'),
    doc: db.prepare(`SELECT d.*, u.name AS owner_name, u.email AS owner_email
                     FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`),
    shareRole: db.prepare('SELECT role FROM shares WHERE document_id = ? AND user_id = ?'),
    owned: db.prepare(`SELECT d.id, d.title, d.updated_at, 'owner' AS role,
                         (SELECT COUNT(*) FROM shares s WHERE s.document_id = d.id) AS share_count
                       FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC`),
    sharedWithMe: db.prepare(`SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
                              FROM shares s JOIN documents d ON d.id = s.document_id
                              JOIN users u ON u.id = d.owner_id
                              WHERE s.user_id = ? ORDER BY d.updated_at DESC`),
    insertDoc: db.prepare('INSERT INTO documents (owner_id, title, content) VALUES (?, ?, ?)'),
    deleteDoc: db.prepare('DELETE FROM documents WHERE id = ?'),
    shares: db.prepare(`SELECT s.user_id, s.role, u.email, u.name FROM shares s
                        JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`),
    upsertShare: db.prepare(`INSERT INTO shares (document_id, user_id, role) VALUES (?, ?, ?)
                             ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`),
    deleteShare: db.prepare('DELETE FROM shares WHERE document_id = ? AND user_id = ?'),
  };

  // ---------- helpers ----------
  function requireAuth(req, _res, next) {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const user = token && q.userByToken.get(token);
    if (!user) return next(new HttpError(401, 'Please sign in.'));
    req.user = user;
    req.token = token;
    next();
  }

  /** Loads a document and the caller's role. 404 (not 403) when no access, so ids aren't probeable. */
  function loadDoc(req, minRole = 'viewer') {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid document id.');
    const doc = q.doc.get(id);
    if (!doc) throw new HttpError(404, 'Document not found.');
    const role = doc.owner_id === req.user.id ? 'owner' : q.shareRole.get(id, req.user.id)?.role;
    if (!role) throw new HttpError(404, 'Document not found.');
    const rank = { viewer: 1, editor: 2, owner: 3 };
    if (rank[role] < rank[minRole]) {
      throw new HttpError(403, minRole === 'owner'
        ? 'Only the owner can do that.' : 'You have view-only access to this document.');
    }
    return { doc, role };
  }

  function validateTitle(title) {
    if (typeof title !== 'string') throw new HttpError(400, 'Title must be a string.');
    const t = title.trim();
    if (!t) throw new HttpError(400, 'Title cannot be empty.');
    if (t.length > MAX_TITLE_CHARS) throw new HttpError(400, `Title must be ${MAX_TITLE_CHARS} characters or fewer.`);
    return t;
  }

  function validateContent(content) {
    if (typeof content !== 'string') throw new HttpError(400, 'Content must be an HTML string.');
    if (content.length > MAX_CONTENT_CHARS) throw new HttpError(413, 'Document is too large.');
    return sanitizeContent(content);
  }

  const serializeDoc = (doc, role) => ({
    id: doc.id, title: doc.title, content: doc.content, role,
    owner: { name: doc.owner_name, email: doc.owner_email },
    created_at: doc.created_at, updated_at: doc.updated_at,
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // ---------- auth ----------
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'Email and password are required.');
    }
    const user = q.userByEmail.get(email.trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Invalid email or password.');
    }
    const token = crypto.randomBytes(32).toString('hex');
    q.insertSession.run(token, user.id);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    q.deleteSession.run(req.token);
    res.status(204).end();
  });

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/users', requireAuth, (req, res) => res.json({ users: q.listUsers.all(req.user.id) }));

  // ---------- documents ----------
  app.get('/api/documents', requireAuth, (req, res) => {
    res.json({ owned: q.owned.all(req.user.id), shared: q.sharedWithMe.all(req.user.id) });
  });

  app.post('/api/documents', requireAuth, (req, res) => {
    const body = req.body || {};
    const title = body.title === undefined ? 'Untitled document' : validateTitle(body.title);
    const content = body.content === undefined ? '' : validateContent(body.content);
    const id = q.insertDoc.run(req.user.id, title, content).lastInsertRowid;
    res.status(201).json({ document: serializeDoc(q.doc.get(id), 'owner') });
  });

  app.post('/api/documents/import', requireAuth, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'File is larger than 5 MB.'));
      if (err) return next(new HttpError(400, err.message));
      next();
    });
  }, wrap(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file uploaded. Use form field "file".');
    const { title, html } = await fileToDocument(req.file.originalname, req.file.buffer);
    const id = q.insertDoc.run(req.user.id, title, html).lastInsertRowid;
    res.status(201).json({ document: serializeDoc(q.doc.get(id), 'owner') });
  }));

  app.get('/api/documents/:id', requireAuth, (req, res) => {
    const { doc, role } = loadDoc(req);
    res.json({ document: serializeDoc(doc, role) });
  });

  app.patch('/api/documents/:id', requireAuth, (req, res) => {
    const { doc, role } = loadDoc(req, 'editor');
    const body = req.body || {};
    if (body.title === undefined && body.content === undefined) {
      throw new HttpError(400, 'Nothing to update.');
    }
    const title = body.title === undefined ? doc.title : validateTitle(body.title);
    const content = body.content === undefined ? doc.content : validateContent(body.content);
    db.prepare(`UPDATE documents SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(title, content, doc.id);
    res.json({ document: serializeDoc(q.doc.get(doc.id), role) });
  });

  app.delete('/api/documents/:id', requireAuth, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    q.deleteDoc.run(doc.id);
    res.status(204).end();
  });

  // ---------- sharing ----------
  app.get('/api/documents/:id/shares', requireAuth, (req, res) => {
    const { doc } = loadDoc(req);
    res.json({ shares: q.shares.all(doc.id) });
  });

  app.post('/api/documents/:id/shares', requireAuth, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    const { email, role = 'viewer' } = req.body || {};
    if (typeof email !== 'string' || !email.trim()) throw new HttpError(400, 'Email is required.');
    if (!['viewer', 'editor'].includes(role)) throw new HttpError(400, 'Role must be "viewer" or "editor".');
    const target = q.userByEmail.get(email.trim());
    if (!target) throw new HttpError(404, `No user with email ${email.trim()}.`);
    if (target.id === doc.owner_id) throw new HttpError(400, 'The owner already has full access.');
    q.upsertShare.run(doc.id, target.id, role);
    res.status(201).json({ shares: q.shares.all(doc.id) });
  });

  app.delete('/api/documents/:id/shares/:userId', requireAuth, (req, res) => {
    const { doc } = loadDoc(req, 'owner');
    q.deleteShare.run(doc.id, Number(req.params.userId));
    res.json({ shares: q.shares.all(doc.id) });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

  // ---------- static frontend ----------
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // ---------- errors ----------
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON.' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : err.message });
  });

  return app;
}
