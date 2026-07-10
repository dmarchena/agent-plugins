import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitSuccess, emitError } from '../scripts/lib/cli.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_MODULE_PATH = path.join(__dirname, '..', 'scripts', 'lib', 'cli.mjs');
// file:// URL so the spawned `node --input-type=module -e` snippet can import
// the module regardless of the working directory the test runner uses.
const CLI_MODULE_URL = pathToFileUrl(CLI_MODULE_PATH);

function pathToFileUrl(p) {
  return new URL(`file://${p}`).href;
}

test('R1.S1: el helper de exito serializa el envelope como {ok:true,data:<payload>} en una sola linea compacta sin indent y con salto final', () => {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(chunk);
    return true;
  };
  try {
    emitSuccess({ foo: 'bar', n: 1 });
  } finally {
    process.stdout.write = originalWrite;
  }

  assert.equal(chunks.length, 1, 'emitSuccess must write exactly once to stdout');
  const written = chunks[0];

  // Compact: no indentation/newlines inside the JSON, single trailing \n.
  assert.equal(written, JSON.stringify({ ok: true, data: { foo: 'bar', n: 1 } }) + '\n');
  assert.equal(written.split('\n').length, 2, 'exactly one line plus the trailing newline');
  assert.ok(!written.includes('  '), 'must not be indented');

  const parsed = JSON.parse(written);
  assert.deepEqual(parsed, { ok: true, data: { foo: 'bar', n: 1 } });
});

test('R1.S3: el helper de error produce {ok:false,error:{reason}} compacto y provoca terminacion con codigo distinto de cero', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `import { emitError } from '${CLI_MODULE_URL}'; emitError('boom');`],
    { encoding: 'utf8' }
  );

  assert.notEqual(result.status, 0, 'emitError must exit with a non-zero code');

  const stdout = result.stdout;
  assert.equal(stdout, JSON.stringify({ ok: false, error: { reason: 'boom' } }) + '\n');
  assert.equal(stdout.split('\n').length, 2, 'exactly one line plus the trailing newline');
  assert.ok(!stdout.includes('  '), 'must not be indented');

  const parsed = JSON.parse(stdout);
  assert.deepEqual(parsed, { ok: false, error: { reason: 'boom' } });
});

test('AC5: la cabecera del modulo documenta el envelope, el uso de stdout solo para datos, la serializacion compacta y el mapeo ok<->exit code', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(CLI_MODULE_PATH, 'utf8');

  // Only look at the leading header comment (before the first import/export).
  const headerEnd = source.search(/^\s*(import|export)\b/m);
  const header = headerEnd === -1 ? source : source.slice(0, headerEnd);

  assert.match(header, /ok\s*:\s*true/i, 'header must document the success shape');
  assert.match(header, /ok\s*:\s*false/i, 'header must document the error shape');
  assert.match(header, /reason/i, 'header must document error.reason');
  assert.match(header, /stdout/i, 'header must mention stdout');
  assert.match(header, /(only|solo|exclusiv)/i, 'header must state stdout is only for data, not logs');
  assert.match(header, /compact|compacta/i, 'header must document compact serialization');
  assert.match(header, /(one line|una linea|una l[ií]nea|single line)/i, 'header must document single-line output');
  assert.match(header, /exit/i, 'header must document the exit code mapping');
  assert.match(header, /0/, 'header must mention exit code 0 for ok:true');
});
