import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');
const INSTALL_PATH = join(PLUGIN_ROOT, 'commands', 'install.md');

function readInstall() {
  assert.ok(existsSync(INSTALL_PATH), `install.md must exist at ${INSTALL_PATH}`);
  return readFileSync(INSTALL_PATH, 'utf8');
}

test('R2.S1 / AC4 — install.md instructs to detect a symlink target, report its real destination, confirm before continuing, and on confirmation use that real destination as the effective source for analysis and write', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(lower.includes('symlink'), 'expected install.md to mention detecting a symlink');
  assert.ok(lower.includes('real destination'), 'expected install.md to mention reporting the real destination');
  assert.ok(/confirm/i.test(content), 'expected install.md to require confirmation before following the symlink');
  assert.ok(
    lower.includes('effective source') && lower.includes('phase 1') && lower.includes('phase 4'),
    'expected install.md to say the real destination becomes the effective source for both the Phase 1 read and the Phase 4 write'
  );
});

test('R2.S2 / AC5 — install.md instructs to detect a file whose only non-blank, non-comment content is a single @path import line and, on confirmation, use the imported file as the effective source', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(/@path/i.test(content), 'expected install.md to reference an @path import line');
  assert.ok(lower.includes('non-blank') && lower.includes('non-comment'), 'expected install.md to describe the non-blank, non-comment content check');
  assert.ok(lower.includes('single') && lower.includes('import'), 'expected install.md to require a single import line');
  assert.ok(lower.includes('imported file') && lower.includes('effective source'), 'expected install.md to say the imported file becomes the effective source on confirmation');
});

test('R2.S3 / AC6 — install.md instructs to follow a pointer chain to the final real source and to stop, reporting the pointer unresolvable, when the chain loops or exceeds a bound of 3 hops', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(lower.includes('chain'), 'expected install.md to mention following a pointer chain');
  assert.ok(lower.includes('final real source'), 'expected install.md to mention resolving to the final real source');
  assert.ok(/3 hops|bound of 3/i.test(content), 'expected install.md to state a fixed bound of 3 hops');
  assert.ok(lower.includes('loop'), 'expected install.md to mention loop detection');
  assert.ok(lower.includes('unresolvable'), 'expected install.md to say an unresolved chain is reported as unresolvable');
});

test('R2.S4 / AC7 — install.md instructs that when the user rejects the redirect the command reads from and writes to nothing in the source and continues on the literal file with no redirect applied', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(lower.includes('rejects the redirect') || lower.includes('reject'), 'expected install.md to cover the user rejecting the redirect');
  assert.ok(lower.includes('reads nothing from') && lower.includes('writes nothing to'), 'expected install.md to say nothing is read from or written to the pointed-at source on rejection');
  assert.ok(lower.includes('literal file'), 'expected install.md to say the flow continues on the literal (unredirected) file');
  assert.ok(lower.includes('no redirect'), 'expected install.md to state no redirect was applied');
});
