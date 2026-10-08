#!/usr/bin/env node
// Dispatcher. Verbs live in ./verbs/<verb>.mjs and export `default async (argv, ctx) => exitCode`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP, VERBS } from './help.mjs';
import { CliError, loadEnvFile } from './lib.mjs';

loadEnvFile();

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const verb = argv[0];

const usage = (code, msg) => {
  if (msg) console.error(`error: ${msg}`);
  if (code) console.error('fix: verify-suppco --help');
  (code ? process.stderr : process.stdout).write(HELP.root);
  process.exit(code);
};

if (!verb || verb === '--help' || verb === '-h' || verb === 'help') usage(verb ? 0 : 2);
if (!VERBS.includes(verb)) usage(2, `unknown verb '${verb}'`);
if (argv.slice(1).some((a) => a === '--help' || a === '-h')) { process.stdout.write(HELP[verb]); process.exit(0); }

try {
  const mod = await import(path.join(here, 'verbs', `${verb}.mjs`));
  const code = await mod.default(argv.slice(1), { verb, help: HELP[verb] });
  process.exit(typeof code === 'number' ? code : 0);
} catch (e) {
  if (e instanceof CliError) {
    console.error(`error: ${e.message}`);
    console.error(`fix: ${e.fix || `verify-suppco ${verb} --help`}`);
    process.exit(e.code);
  }
  console.error(`error: ${e?.stack || e}`);
  console.error(`fix: verify-suppco doctor`);
  process.exit(1);
}
