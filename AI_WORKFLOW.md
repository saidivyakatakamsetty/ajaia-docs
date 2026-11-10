# AI workflow note

> Draft: edit this so it reflects your own decisions and words before you submit.

## Tools used

- **Claude (agentic mode with a shell and file tools).** Used for scaffolding, implementation, tests, a headless-browser verification pass, and first drafts of the docs.
- **Playwright (headless Chromium).** Used to drive the real UI and capture screenshots for visual review.

## Where AI materially sped things up

- **Boilerplate and wiring:** Express routes, the SQLite schema and seed, the fetch wrapper, and the multer upload handling. Each would have taken a while by hand, and it was quick to review.
- **Library specifics:** the TipTap v3 APIs (`useEditorState` for toolbar active states, StarterKit configuration) and the mammoth/marked conversion calls.
- **Test matrix:** turning "owner / editor / viewer / stranger × read / write / share / delete" into concrete Supertest cases.
- **The E2E script:** a Playwright flow that types with real keyboard shortcuts, reloads to prove persistence, and switches users to prove the sharing flow.

## What I changed or rejected

- **Native database driver.** The first version used `better-sqlite3`. On a fresh Windows machine with Node 26, `npm install` failed: there was no prebuilt binary, so it tried to compile and needed Visual Studio C++ tools. Reviewers shouldn't need a compiler, so I switched to Node's built-in `node:sqlite`, which needs zero native dependencies. All tests pass unchanged.
- **Duplicate Underline extension.** The first plan installed `@tiptap/extension-underline`. TipTap v3's StarterKit already bundles Underline (and Link), so the extra package would register a duplicate extension. I removed it.
- **A re-fetching share dialog.** The first version put an inline `onClose` callback in the dialog's data-loading effect dependencies. Every parent re-render (for example an autosave status change) would have re-fetched the shares. I split it into a fetch effect keyed only on `docId` and a separate keydown effect.
- **A toolbar button defined inside `Toolbar`.** That gives the component a new identity on every render, so React remounts every button on each selection change. I hoisted it to module scope.
- **403 for documents you can't access.** I kept 403 only for "you can see it but can't do this" (a viewer trying to edit). Users with no access get a 404, so ids can't be enumerated.
- **Trusting editor output.** The editor's schema already drops unknown tags *in the browser*, but the API can be called directly. So sanitization happens on the server, on every save and import, and a test asserts that `<script>` and `onerror` are stripped.
- **Formatting polish from screenshot review.** List items inherited paragraph margins and looked double-spaced. The save label switched between "Saved" and "All changes saved". I fixed both after reviewing the screenshots.

## How correctness and UX were verified

1. **Automated API tests** (`npm test`, 9 tests). These use a fresh in-memory DB per test. They cover the round-trip that HTML formatting survives save and reopen, the full access-control matrix including revocation, validation errors, and import of all three formats including corrupt and unsupported files.
2. **Browser E2E** (`tests/e2e/browser_flow.py`). As Alice: create a document, apply H1/bold/italic/underline/lists through both shortcuts and the toolbar, rename it, wait for "All changes saved", **reload** and assert the formatting is still present. Then share with Carol as a viewer, check that an unknown email shows an error, and import a real `.docx`. As Carol: check the document appears under "Shared with me", that the editor is `contenteditable=false`, and that there is no Share button. Finally, check that a nonexistent doc shows a friendly error and that the mobile layout renders. The script also collects console errors; the only ones were the two intentional 404s.
3. **Manual screenshot review** at desktop and 390 px widths (`docs/screenshots/`). This review caught the spacing issues above.
4. **Code read-through** of every AI-written file, focused on the auth/access paths and the autosave state machine. I specifically checked that failed saves re-queue their changes rather than dropping them.
