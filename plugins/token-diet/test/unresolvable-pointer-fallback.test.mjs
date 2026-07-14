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

test('R4.S1 / AC10 — install.md instructs to report a dangling symlink (destination does not exist) as unresolvable and continue on the literal file path without aborting', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('r4.s1') && lower.includes('ac10'),
    'expected install.md to cite spec R4.S1 / AC10 for the dangling symlink case'
  );
  assert.ok(
    lower.includes('dangling symlink'),
    'expected install.md to describe the dangling symlink case explicitly'
  );
  assert.ok(
    lower.includes('destination') && lower.includes('does not exist'),
    'expected install.md to describe a symlink whose destination does not exist'
  );
  assert.ok(
    lower.includes('unresolvable'),
    'expected install.md to report the dangling symlink as unresolvable'
  );
  assert.ok(
    lower.includes('literal file path') || lower.includes('literal file'),
    'expected install.md to say the flow continues on the literal file path'
  );
  assert.ok(
    /without aborting/i.test(content) || /never aborting/i.test(content),
    'expected install.md to say the flow never aborts with an error for this case'
  );
});

test('R4.S2 / AC11 — install.md instructs to report a missing import target as unresolvable and continue on the literal file without aborting', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('r4.s2') && lower.includes('ac11'),
    'expected install.md to cite spec R4.S2 / AC11 for the missing import target case'
  );
  assert.ok(
    lower.includes('missing import target'),
    'expected install.md to describe the missing import target case explicitly'
  );
  assert.ok(
    lower.includes('import') && lower.includes('does not exist'),
    'expected install.md to describe an import naming a file that does not exist'
  );
  assert.ok(
    lower.includes('unresolvable'),
    'expected install.md to report the missing import target as unresolvable'
  );
  assert.ok(
    lower.includes('literal file'),
    'expected install.md to say the flow continues on the literal file'
  );
  assert.ok(
    /without aborting/i.test(content),
    'expected install.md to say the flow does not abort for this case'
  );
});
