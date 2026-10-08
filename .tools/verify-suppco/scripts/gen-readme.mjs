#!/usr/bin/env node
// Regenerates the fenced `--help` blocks in README.md from src/help.mjs (the source of truth). Run after editing help.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP } from '../src/help.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '../README.md');
const md = fs.readFileSync(file, 'utf8');
const [head, tail] = md.split(/\n## `verify-suppco[\s\S]*?(?=\n## (?!`verify-suppco)|$)/);
const blocks = Object.entries(HELP).map(([verb, text]) =>
  `## \`verify-suppco ${verb === 'root' ? '' : verb + ' '}--help\`\n\n\`\`\`\n${text}\`\`\`\n`).join('\n');
fs.writeFileSync(file, `${head}\n${blocks}${tail ?? ''}`);
console.error(`wrote README.md (${Object.keys(HELP).length} blocks)`);
