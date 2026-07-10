// test/exec/lib-cli-migration.test.mjs — T2-exec-tools (docs/specs/unify-cli-io)
//
// Covers exec-tools.mjs's migration to the shared scripts/lib/cli.mjs I/O
// helpers: the success and error envelopes it must now emit on stdout (AC1 /
// R1.S3), driven through the `extract` subcommand via a real subprocess
// since emitError() terminates the process, and the static absence of
// locally-redefined I/O helpers (AC4).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

const SPEC = `# Spec: Migration Fixture

## Functional Requirements

### R2 — Second requirement

Depende de: —

The system SHALL deliver part B.

#### R2.S1 — Happy path
- GIVEN nothing
- WHEN task B runs
- THEN part B is done

## Acceptance Criteria

- [ ] AC1 → R2.S1 [auto] — part B is delivered
`;

function writeSpecDir(specText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-tools-migration-'));
  fs.writeFileSync(path.join(dir, 'spec.md'), specText, 'utf8');
  return dir;
}

test('AC1: un comando de exito de exec-tools emite un envelope {ok:true,data:...} compacto de una linea y termina con codigo 0', () => {
  const dir = writeSpecDir(SPEC);
  const res = spawnSync(process.execPath, [CLI, 'extract', dir, 'R2.S1'], { encoding: 'utf8' });

  assert.equal(res.status, 0, res.stderr);

  const body = res.stdout.endsWith('\n') ? res.stdout.slice(0, -1) : res.stdout;
  assert.equal(body.split('\n').length, 1, 'stdout must be exactly one line of JSON plus the trailing newline');
  assert.ok(!body.includes('  '), 'must not be indented');

  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.data, 'success envelope must carry a data payload');
});

test('R1.S3: un comando de exec-tools con entrada invalida emite {ok:false,error:{reason}} en stdout y termina con codigo distinto de cero', () => {
  const dir = writeSpecDir(SPEC);
  const res = spawnSync(process.execPath, [CLI, 'extract', dir, 'R9.S9'], { encoding: 'utf8' });

  assert.notEqual(res.status, 0, 'must exit with a non-zero code');

  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.error && typeof parsed.error.reason === 'string', 'error.reason must be a string');
  assert.match(parsed.error.reason, /R9\.S9/, 'the missing id must be named in error.reason');
});

test('AC4: exec-tools no contiene definiciones locales de los helpers de I/O y los importa del modulo compartido', () => {
  const source = fs.readFileSync(CLI, 'utf8');

  assert.doesNotMatch(source, /function\s+die\s*\(/, 'must not locally define die()');
  assert.doesNotMatch(source, /function\s+out\s*\(/, 'must not locally define out()');
  assert.doesNotMatch(source, /function\s+parseFlags\s*\(/, 'must not locally define parseFlags()');
  assert.match(source, /from\s+['"]\.\/lib\/cli\.mjs['"]/, 'must import from the shared ./lib/cli.mjs module');
  assert.match(source, /\bemitSuccess\s*\(/, 'must call emitSuccess');
  assert.match(source, /\bemitError\s*\(/, 'must call emitError');
});
