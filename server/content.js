import sanitizeHtml from 'sanitize-html';
import mammoth from 'mammoth';
import { marked } from 'marked';
import path from 'node:path';

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_CONTENT_CHARS = 1_000_000;
export const MAX_TITLE_CHARS = 200;

// Only the structure the editor can represent. Anything else is stripped,
// which also prevents stored XSS when a document is shared with other users.
const SANITIZE_OPTIONS = {
  allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'hr', 'a'],
  allowedAttributes: { a: ['href', 'target', 'rel'], ol: ['start'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    h4: 'h3', h5: 'h3', h6: 'h3',
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

export function sanitizeContent(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Convert an uploaded file into { title, html }. Throws Error with .status on bad input. */
export async function fileToDocument(originalName, buffer) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    const err = new Error(`Unsupported file type "${ext || 'none'}". Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
    err.status = 415;
    throw err;
  }
  let html;
  if (ext === '.docx') {
    try {
      ({ value: html } = await mammoth.convertToHtml({ buffer }));
    } catch {
      const err = new Error('Could not read .docx file. Is it a valid Word document?');
      err.status = 422;
      throw err;
    }
  } else {
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) {
      const err = new Error('File does not look like plain text.');
      err.status = 422;
      throw err;
    }
    html = ext === '.txt' ? textToHtml(text) : await marked.parse(text);
  }
  const title = path.basename(originalName, ext).slice(0, MAX_TITLE_CHARS).trim() || 'Imported document';
  return { title, html: sanitizeContent(html) };
}
