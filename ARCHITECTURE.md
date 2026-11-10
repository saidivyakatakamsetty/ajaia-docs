# Architecture note

## Shape

```
Browser (React + TipTap)  ──fetch /api──►  Express  ──►  SQLite (built-in node:sqlite)
        ▲                                   │
        └──── static build (dist/) ─────────┘   one process, one deployable
```

- **Single deployable.** Express serves both the API and the Vite build. That means one service to deploy, no CORS, and one URL for reviewers.
- **SQLite via Node's built-in `node:sqlite`** (no native build step, so it installs cleanly on Windows, Mac and any host) with four tables: `users`, `sessions`, `documents`, `shares(document_id, user_id, role)`. It's synchronous, has zero ops, and is fast enough for this scope. The schema is portable to Postgres if that's needed later.
- **The editor is TipTap (ProseMirror).** It gives a real document model, keyboard shortcuts, and undo/redo out of the box, so I could spend the time on product behaviour instead of building contenteditable plumbing.
- **Content is stored as HTML.** It's the editor's native import/export format, it's readable in the DB, and it's the same format that file import produces. The tradeoff vs. storing ProseMirror JSON: you have to sanitize it (see below), but import and export are trivial.

## What I prioritized and why

1. **Access control correctness.** This is the part that's easy to get subtly wrong. Every document route goes through one `loadDoc(req, minRole)` helper with a ranked `viewer < editor < owner` check. Users without access get a **404, not a 403**, so document ids can't be probed. Only the owner can share, change roles, or delete. The full matrix is covered by tests.
2. **An editing loop that feels trustworthy.** Debounced autosave batches title and content, keeps a single request in flight, and keeps failed changes queued for retry. It warns before you close the tab with unsaved work and flushes when you navigate back. The save status is always visible.
3. **Safe sharing of rich content.** Shared HTML is a stored-XSS risk, so the server sanitizes every save and import against an allowlist that matches what the editor can represent (headings, marks, lists, quote, code, links).
4. **Import that's genuinely useful.** `.docx` goes through `mammoth`, `.md` through `marked`, and `.txt` is split on blank lines into paragraphs with HTML escaped. Uploads are kept in memory (5 MB cap) and never written to disk.
5. **Role-based sharing (the stretch item).** Editor vs. viewer cost very little on top of basic sharing and makes the model meaningfully more realistic.

## Deliberate cuts

| Cut | Why / what it would take |
|---|---|
| Real-time co-editing | The biggest Google Docs feature, but it needs CRDTs (Yjs + y-websocket) and presence. Today concurrent edits are **last-write-wins**. Next step: an `updated_at` precondition on PATCH that returns 409 so silent overwrites can't happen. |
| Real auth | Seeded users and opaque bearer tokens in a `sessions` table, with scrypt-hashed passwords. No signup, password reset, or token expiry. |
| Sharing with unregistered emails / links | Shares must target an existing user. Invite links would need a pending-invite table. |
| Export, comments, version history | Out of the timebox. Version history would be an append-only `document_versions` table written on each save. |
| Fonts, colors, alignment, images, tables | Not required, and each one adds sanitizer and schema surface. |
| Durable hosting | The free Render disk is ephemeral (see README). The app is volume-ready via `DB_PATH` and the Dockerfile. |

## Next 2–4 hours

1. A conflict guard (409 on a stale `updated_at`) plus a "this doc changed, reload?" banner.
2. Export to Markdown/PDF.
3. Version history with restore.
4. Move to Postgres (Neon free tier) for durable hosting.
5. Frontend component tests for the autosave hook.
