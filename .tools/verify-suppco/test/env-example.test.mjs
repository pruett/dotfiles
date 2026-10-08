// .env.example names every variable the CLI reads, so `doctor` and the example never drift from the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const IGNORE = new Set(['HOME', 'XDG_CONFIG_HOME']);

test('.env.example names every process.env key the CLI reads', () => {
  const example = read('.env.example');
  const files = ['src', 'src/verbs'].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith('.mjs')).map((f) => `${d}/${f}`));
  const used = new Set(files.flatMap((f) => [...read(f).matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1])).filter((k) => !IGNORE.has(k)));
  assert.ok(used.has('VERIFY_SUPPCO_EMAIL'));
  const missing = [...used].filter((k) => !new RegExp(`\\b${k}\\b`).test(example));
  assert.deepEqual(missing, [], `add to .env.example: ${missing.join(', ')}`);
  assert.match(read('.gitignore'), /^\.env$/m);
});
