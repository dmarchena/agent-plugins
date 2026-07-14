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

test('R1.S1 / AC1 — install.md instructs to use the sole existing file of ./CLAUDE.md/./AGENTS.md as the source, without asking which and without reporting a missing target', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(lower.includes('./agents.md'), 'expected install.md to reference ./AGENTS.md as a project candidate');
  assert.ok(
    lower.includes('r1.s1') && lower.includes('ac1'),
    'expected install.md to cite spec R1.S1 / AC1 for the sole-existing-file case'
  );
  assert.ok(
    /exactly one of/i.test(content) || /only one of/i.test(content),
    'expected install.md to describe the case where exactly one of the two files exists'
  );
  assert.ok(
    lower.includes('without asking which') && lower.includes('without reporting'),
    'expected install.md to say the sole existing file is used without asking which and without reporting a missing target'
  );
});

test('R1.S2 / AC2 — install.md instructs that when both files exist and one is a pointer to the other, the file holding the real text is used as the source (redirect after confirm, do not ask which)', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('r1.s2') && lower.includes('ac2'),
    'expected install.md to cite spec R1.S2 / AC2 for the both-exist-one-is-a-pointer case'
  );
  assert.ok(
    lower.includes('holding the real text') || lower.includes('holds the real text'),
    'expected install.md to describe identifying the file holding the real text'
  );
  assert.ok(
    lower.includes('pointer-detection primitive') || (lower.includes('step 3') && lower.includes('primitive')),
    'expected install.md to explicitly reuse the step-3 pointer-detection primitive between the two candidates'
  );
  assert.ok(
    lower.includes('without asking the user to choose'),
    'expected install.md to say the user is not asked to choose between the two files in this case'
  );
});

test('R1.S3 / AC3 — install.md instructs to ask the user which of ./CLAUDE.md/./AGENTS.md to use when both hold independent own content and neither points to the other', () => {
  const content = readInstall();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('r1.s3') && lower.includes('ac3'),
    'expected install.md to cite spec R1.S3 / AC3 for the independent-content case'
  );
  assert.ok(
    lower.includes('independent') && lower.includes('own content'),
    'expected install.md to describe both files holding independent own content'
  );
  assert.ok(
    lower.includes('neither points to the other') || lower.includes('neither is a pointer to the other'),
    'expected install.md to describe neither file pointing to the other'
  );
  assert.ok(
    /ask the user which/i.test(content),
    'expected install.md to instruct asking the user which of the two files to use'
  );
  assert.ok(
    lower.includes('picking neither') || lower.includes('pick neither'),
    'expected install.md to say neither file is picked on its own'
  );
});
