/**
 * Executa os testes de lógica no Node:  node tests/run-node.mjs
 */
import { readFile } from 'node:fs/promises';
import { runAll, dataTests } from './unit.tests.js';

const root = new URL('../', import.meta.url);
dataTests(async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8')));

const result = await runAll((ok, name, err) => {
  console.log(`${ok ? '✔' : '✘'} ${name}${err ? `\n    → ${err.message}` : ''}`);
});
console.log(`\n${result.pass}/${result.total} testes passaram.`);
process.exit(result.fail ? 1 : 0);
