# Ajaia Docs

A lightweight collaborative document editor: create and format documents, import files, and share them with other users as editors or viewers.

**Live URL:** `<add your deployed URL>`

## Demo accounts

All seeded accounts use the password **`demo1234`**. The login screen also has one-click buttons for each.

| User | Email | Seeded access |
|---|---|---|
| Alice Chen | alice@ajaia.dev | Owns "Welcome to Ajaia Docs" |
| Bob Rivera | bob@ajaia.dev | Editor on the welcome doc |
| Carol Singh | carol@ajaia.dev | Viewer on the welcome doc |

**Suggested review flow (3 min):** sign in as Alice → create a document, format it, rename it → Share with `carol@ajaia.dev` as Viewer → sign out, sign in as Carol → the doc is under "Shared with me" and opens read-only. Sign in as Bob to see editor access on the welcome doc.

## Features

- **Editing:** rich text with bold, italic, underline, strikethrough, headings (H1–H3), bulleted and numbered lists, quotes, undo/redo, and keyboard shortcuts. Autosave runs 800 ms after you stop typing, and the save status is always visible (with Retry if a save fails).
- **Documents:** create, rename (click the title), reopen, delete (owner only).
- **File import:** `.txt`, `.md`/`.markdown` and `.docx` files up to 5 MB become a new editable document. Headings, bold, italic and lists carry over. Other types are rejected with a clear message. Sample files are in [`samples/`](samples/).
- **Sharing:** the owner shares by email with the **Editor** or **Viewer** role, can change roles, and can remove access. The doc list separates "My documents" from "Shared with me" and shows each doc's owner and your role. Viewers get a read-only editor.
- **Persistence:** SQLite. Content is stored as sanitized HTML, so formatting survives reloads.

## Run locally

Requires Node 22.13+ (uses the built-in `node:sqlite`, so there are no native modules to compile).

```bash
npm install
npm run dev        # API on :3001 + Vite on http://localhost:5173 (proxies /api)
```

Production mode (a single server that serves the built frontend):

```bash
npm run build
npm start          # http://localhost:3001
```

The database file goes in `data/app.db` (override with `DB_PATH`). It is created and seeded on first start. To reset it, delete `data/`.

## Tests

```bash
npm test           # Vitest + Supertest API tests (in-memory DB)
```

They cover auth, create/rename/edit/reopen round-trips with formatting, HTML sanitization, input validation, the full owner/editor/viewer/no-access matrix, share revocation, and `.md`/`.txt`/`.docx` import including the error cases.

There is also a browser end-to-end script (Playwright for Python) that drives the full UI flow and captures screenshots: see the header of `tests/e2e/browser_flow.py`.

## Deploy

**Render (free, no card required):** push to GitHub → New → Blueprint → select the repo. `render.yaml` builds the app, runs the tests, and starts it. Alternatively, create a Web Service with build command `npm ci --include=dev && npm run build` and start command `npm start`.

> Render's free tier has an ephemeral disk. Data survives refreshes and normal use, but it resets when the instance restarts or sleeps (after about 15 minutes idle). The demo accounts and welcome doc are re-seeded on every boot, so the review flow always works. For durable storage, run the `Dockerfile` on any host with a volume mounted at `/data` (Railway, Fly.io, or a Render paid disk). No code changes are needed.

## Project layout

```
server/   Express API: app.js (routes + access control), db.js (schema + seed), content.js (import + sanitize)
src/      React frontend: Login, DocList, DocumentPage (TipTap editor + autosave), ShareDialog
tests/    api.test.js (Vitest), e2e/browser_flow.py (Playwright)
docs/     screenshots
samples/  example files for import
```

See [ARCHITECTURE.md](ARCHITECTURE.md) and [AI_WORKFLOW.md](AI_WORKFLOW.md).
