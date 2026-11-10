import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = openDb(process.env.DB_PATH || path.join(root, 'data', 'app.db'));
const app = createApp(db, { staticDir: path.join(root, 'dist') });
const port = Number(process.env.PORT) || 3001;

app.listen(port, () => console.log(`Ajaia Docs listening on http://localhost:${port}`));
