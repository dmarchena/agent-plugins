import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

function findCommandFile() {
  if (!existsSync(COMMANDS_DIR)) return null;
  const entries = readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
  return entries.length > 0 ? join(COMMANDS_DIR, entries[0]) : null;
}

function readCommand() {
  const cmdPath = findCommandFile();
  assert.ok(cmdPath, `expected at least one .md command file under ${COMMANDS_DIR}`);
  return readFileSync(cmdPath, 'utf8');
}

test('R4 — the reserved Phase 4 placeholder is gone; apply logic is actually implemented', () => {
  const content = readCommand();
  assert.ok(
    /implements all\s+four/i.test(content),
    'expected the command to state it implements all four phases (no reserved placeholder left)'
  );
});

test('R4 — apply step is gated on EXPLICIT user confirmation', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('explicit confirmation'),
    'expected the apply step to require explicit user confirmation before writing anything'
  );
});

test('R4.S1 / AC7 — confirmed add writes base summary + pointer + exact versioned mark', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  // exact mark literal for the fixed plugin version 1.2.0
  assert.ok(
    content.includes('Produced with token-diet (v1.2.0)'),
    'expected the exact attribution mark literal "Produced with token-diet (v1.2.0)"'
  );
  // inline base summary insertion (the 10-line caveman decalogue from token-diet-rules.md base section)
  assert.ok(
    lower.includes('base decalogue') && (lower.includes('inline') || lower.includes('insert')),
    'expected the command to insert the inline base decalogue into the target file'
  );
  // pointer to the copied doc
  assert.ok(
    lower.includes('pointer'),
    'expected the command to insert a pointer to the copied token-diet-rules.md doc'
  );
});

test('R4.S1 / AC7 — a second invocation at the same version recommends none and adds NO second block (idempotency by mark)', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    /second\s+(invocation|pass)/i.test(content),
    'expected the command to describe the second-invocation idempotent behavior'
  );
  assert.ok(
    lower.includes('not add a second block') || lower.includes('no second block'),
    'expected an explicit guarantee that no second block is added on a repeat run'
  );
});

test('R4 — idempotency-by-mark: an existing own block is REPLACED in place, never duplicated', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('replace'),
    'expected the command to state that an existing own block is replaced in place'
  );
  assert.ok(
    lower.includes('instead of duplicat'),
    'expected the command to explicitly rule out duplicating the block when it already exists'
  );
});

test('R4.S2 / AC8 — without confirmation / on rejection, NOTHING changes: neither target file nor copy destination', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('without confirmation') || lower.includes('reject'),
    'expected the command to describe the no-confirmation / rejection path'
  );
  assert.ok(
    (lower.includes('nothing changes') || lower.includes('does not modify')),
    'expected an explicit "nothing changes" guarantee'
  );
  // must cover BOTH the target file AND the copy destination, not just one
  assert.ok(
    lower.includes('target file') && lower.includes('copy destination'),
    'expected the "nothing changes" guarantee to cover both the target file and the copy destination'
  );
});
