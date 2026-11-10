# Submission: Ajaia Docs

- **Live URL:** `<add deployed URL>`
- **Walkthrough video:** see `VIDEO_URL.txt`
- **Test accounts:** alice@ajaia.dev, bob@ajaia.dev, carol@ajaia.dev, all with the password `demo1234` (one-click buttons on the login screen)

## Included

| Path | What |
|---|---|
| `server/`, `src/`, `index.html`, `vite.config.js`, `package.json`, `package-lock.json` | Source code (Express + SQLite API, React + TipTap frontend) |
| `README.md` | Local setup, run, test, and deploy instructions; demo accounts |
| `ARCHITECTURE.md` | Architecture note: priorities, tradeoffs, cuts, next steps |
| `AI_WORKFLOW.md` | AI tools used, what was changed or rejected, how it was verified |
| `tests/api.test.js` | 9 automated API tests (`npm test`) |
| `tests/e2e/browser_flow.py` | Playwright browser end-to-end script |
| `docs/screenshots/` | 7 screenshots of the main flows (login, editor, share, lists, viewer, mobile) |
| `samples/` | `.docx`, `.md`, and `.txt` files for trying import |
| `render.yaml`, `Dockerfile` | Deployment config |
| `VIDEO_URL.txt` | Walkthrough video link |
| `SUBMISSION.md` | This file |

## Status

**Working end to end:** login with seeded users; create, rename, edit, autosave, reopen, and delete documents; rich text (bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quote, undo/redo); `.txt`/`.md`/`.docx` import into a new document; sharing by email with Editor/Viewer roles, role changes, and revocation; a separate "Shared with me" list; read-only mode for viewers; server-side validation and HTML sanitization.

**Incomplete or intentionally cut:** real-time co-editing (edits are last-write-wins), signup and real auth, invite links for unregistered users, export, comments, and version history. Data on the free Render tier resets when the instance restarts (seed data is restored automatically).

**Next 2–4 hours:** a stale-write conflict guard (409 plus a reload banner), Markdown/PDF export, version history with restore, and Postgres for durable hosting.
