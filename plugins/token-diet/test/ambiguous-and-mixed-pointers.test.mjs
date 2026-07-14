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

test('R3.S1 / AC8 — install.md instructs to list the candidate import destinations and ask the user which one to use when a pure-pointer file has more than one import line, picking none on its own', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('r3.s1') && lower.includes('ac8'),
    'expected install.md to cite spec R3.S1 / AC8 for the ambiguous multi-import case'
  );
  assert.ok(
    lower.includes('two or more') && lower.includes('import'),
    'expected install.md to describe a pure-pointer file with two or more import lines'
  );
  assert.ok(
    lower.includes('candidate import destinations'),
    'expected install.md to instruct listing the candidate import destinations'
  );
  assert.ok(
    /ask the user which one to use/i.test(content),
    'expected install.md to instruct asking the user which one to use as the effective source'
  );
  assert.ok(
    lower.includes('pick none on its own') || lower.includes('picking none on its own'),
    'expected install.md to say none is picked automatically on its own'
  );
});

test('R3.S2 / AC9 — install.md instructs that a file with its own policy text plus an @import line is treated as a non-pure pointer, uses that file itself as the source with no redirect, and notes an import is present', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('r3.s2') && lower.includes('ac9'),
    'expected install.md to cite spec R3.S2 / AC9 for the mixed-content case'
  );
  assert.ok(
    lower.includes('non-pure pointer'),
    'expected install.md to describe a mixed-content file as a non-pure pointer'
  );
  assert.ok(
    lower.includes('own policy') || lower.includes('own instruction'),
    'expected install.md to describe the file holding its own policy/instruction text'
  );
  assert.ok(
    lower.includes('that file itself as the effective source') || (lower.includes('the file itself') && lower.includes('effective source')),
    'expected install.md to say that file itself becomes the effective source'
  );
  assert.ok(
    lower.includes('no redirect'),
    'expected install.md to say no redirect is applied for the mixed-content case'
  );
  assert.ok(
    lower.includes('import is present') && lower.includes('informational only'),
    'expected install.md to say the report notes an import is present, informational only'
  );
});
