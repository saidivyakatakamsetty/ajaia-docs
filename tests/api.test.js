import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb, SEED_PASSWORD } from '../server/db.js';
import { createApp } from '../server/app.js';

let app;

async function login(email) {
  const res = await request(app).post('/api/auth/login').send({ email, password: SEED_PASSWORD });
  expect(res.status).toBe(200);
  return { Authorization: `Bearer ${res.body.token}` };
}

beforeEach(() => {
  app = createApp(openDb(':memory:'));
});

describe('auth', () => {
  it('rejects bad credentials and unauthenticated requests', async () => {
    const bad = await request(app).post('/api/auth/login').send({ email: 'alice@ajaia.dev', password: 'nope' });
    expect(bad.status).toBe(401);
    expect((await request(app).get('/api/documents')).status).toBe(401);
  });
});

describe('documents', () => {
  it('creates, renames, edits and reopens a document with formatting preserved', async () => {
    const alice = await login('alice@ajaia.dev');
    const created = await request(app).post('/api/documents').set(alice).send({});
    expect(created.status).toBe(201);
    const id = created.body.document.id;

    const html = '<h2>Plan</h2><p><strong>Bold</strong> <em>it</em> <u>u</u></p><ul><li>one</li></ul>';
    const patched = await request(app).patch(`/api/documents/${id}`).set(alice)
      .send({ title: '  Q3 plan ', content: html });
    expect(patched.status).toBe(200);

    const reopened = await request(app).get(`/api/documents/${id}`).set(alice);
    expect(reopened.body.document.title).toBe('Q3 plan');
    expect(reopened.body.document.content).toBe(html);
  });

  it('strips scripts and event handlers from saved content', async () => {
    const alice = await login('alice@ajaia.dev');
    const res = await request(app).post('/api/documents').set(alice)
      .send({ content: '<p onclick="x()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>' });
    expect(res.body.document.content).toBe('<p>hi</p>');
  });

  it('validates input', async () => {
    const alice = await login('alice@ajaia.dev');
    expect((await request(app).post('/api/documents').set(alice).send({ title: '   ' })).status).toBe(400);
    expect((await request(app).post('/api/documents').set(alice).send({ title: 'x'.repeat(201) })).status).toBe(400);
    expect((await request(app).get('/api/documents/abc').set(alice)).status).toBe(400);
    expect((await request(app).get('/api/documents/9999').set(alice)).status).toBe(404);
  });
});

describe('sharing and access control', () => {
  it('enforces owner / editor / viewer / no-access end to end', async () => {
    const alice = await login('alice@ajaia.dev');
    const bob = await login('bob@ajaia.dev');
    const carol = await login('carol@ajaia.dev');

    const { body } = await request(app).post('/api/documents').set(alice).send({ title: 'Private' });
    const id = body.document.id;

    // Not shared yet: Bob can't see it, and it isn't in his list.
    expect((await request(app).get(`/api/documents/${id}`).set(bob)).status).toBe(404);

    // Share: Bob editor, Carol viewer.
    expect((await request(app).post(`/api/documents/${id}/shares`).set(alice)
      .send({ email: 'bob@ajaia.dev', role: 'editor' })).status).toBe(201);
    await request(app).post(`/api/documents/${id}/shares`).set(alice).send({ email: 'carol@ajaia.dev' });

    const bobList = await request(app).get('/api/documents').set(bob);
    expect(bobList.body.shared.map((d) => d.id)).toContain(id);
    expect(bobList.body.owned.map((d) => d.id)).not.toContain(id);

    // Editor can edit; viewer cannot.
    expect((await request(app).patch(`/api/documents/${id}`).set(bob).send({ content: '<p>bob</p>' })).status).toBe(200);
    const carolView = await request(app).get(`/api/documents/${id}`).set(carol);
    expect(carolView.body.document).toMatchObject({ role: 'viewer', content: '<p>bob</p>' });
    expect((await request(app).patch(`/api/documents/${id}`).set(carol).send({ content: '<p>c</p>' })).status).toBe(403);

    // Only the owner manages sharing or deletes.
    expect((await request(app).post(`/api/documents/${id}/shares`).set(bob)
      .send({ email: 'carol@ajaia.dev', role: 'editor' })).status).toBe(403);
    expect((await request(app).delete(`/api/documents/${id}`).set(bob)).status).toBe(403);

    // Revoking access removes it.
    const bobUserId = (await request(app).get(`/api/documents/${id}/shares`).set(alice))
      .body.shares.find((s) => s.email === 'bob@ajaia.dev').user_id;
    await request(app).delete(`/api/documents/${id}/shares/${bobUserId}`).set(alice);
    expect((await request(app).get(`/api/documents/${id}`).set(bob)).status).toBe(404);
  });

  it('rejects sharing with unknown users or the owner', async () => {
    const alice = await login('alice@ajaia.dev');
    const { body } = await request(app).post('/api/documents').set(alice).send({});
    const url = `/api/documents/${body.document.id}/shares`;
    expect((await request(app).post(url).set(alice).send({ email: 'nobody@x.com' })).status).toBe(404);
    expect((await request(app).post(url).set(alice).send({ email: 'alice@ajaia.dev' })).status).toBe(400);
    expect((await request(app).post(url).set(alice).send({ email: 'bob@ajaia.dev', role: 'admin' })).status).toBe(400);
  });
});

describe('file import', () => {
  it('turns a Markdown file into an editable document', async () => {
    const alice = await login('alice@ajaia.dev');
    const res = await request(app).post('/api/documents/import').set(alice)
      .attach('file', Buffer.from('# Notes\n\n- **one**\n- two\n'), 'meeting-notes.md');
    expect(res.status).toBe(201);
    expect(res.body.document.title).toBe('meeting-notes');
    expect(res.body.document.content).toContain('<h1>Notes</h1>');
    expect(res.body.document.content).toContain('<strong>one</strong>');
  });

  it('turns a .txt file into paragraphs and escapes HTML', async () => {
    const alice = await login('alice@ajaia.dev');
    const res = await request(app).post('/api/documents/import').set(alice)
      .attach('file', Buffer.from('Hello <b>world</b>\n\nSecond para'), 'a.txt');
    expect(res.body.document.content).toBe('<p>Hello &lt;b&gt;world&lt;/b&gt;</p><p>Second para</p>');
  });

  it('rejects unsupported types and corrupt .docx files', async () => {
    const alice = await login('alice@ajaia.dev');
    const pdf = await request(app).post('/api/documents/import').set(alice)
      .attach('file', Buffer.from('%PDF'), 'x.pdf');
    expect(pdf.status).toBe(415);
    const docx = await request(app).post('/api/documents/import').set(alice)
      .attach('file', Buffer.from('not a zip'), 'x.docx');
    expect(docx.status).toBe(422);
  });
});
