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

test('R4 — the reserved Fase 4 placeholder is gone; apply logic is actually implemented', () => {
  const content = readCommand();
  assert.ok(
    !/RESERVADO, no implementado aqu[ií]/i.test(content),
    'expected the R4 placeholder ("RESERVADO, no implementado aquí") to be replaced by real apply logic'
  );
});

test('R4 — apply step is gated on EXPLICIT user confirmation', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('confirmación explícita') || lower.includes('confirmacion explicita') || lower.includes('explicit confirmation'),
    'expected the apply step to require explicit user confirmation before writing anything'
  );
});

test('R4.S1 / AC7 — confirmed add writes base summary + pointer + exact versioned mark', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  // exact mark literal for the fixed plugin version 1.0.0
  assert.ok(
    content.includes('Produced with token-diet (v1.0.0)'),
    'expected the exact attribution mark literal "Produced with token-diet (v1.0.0)"'
  );
  // inline base summary insertion (the ~6-8 line caveman summary from rules.md base section)
  assert.ok(
    lower.includes('resumen base') && (lower.includes('inline') || lower.includes('insert')),
    'expected the command to insert the inline base summary into the target file'
  );
  // pointer to the copied doc
  assert.ok(
    lower.includes('puntero'),
    'expected the command to insert a pointer to the copied rules.md doc'
  );
});

test('R4.S1 / AC7 — a second invocation at the same version recommends none and adds NO second block (idempotency by mark)', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    /segunda\s+(invocaci[oó]n|pasada)/i.test(content),
    'expected the command to describe the second-invocation idempotent behavior'
  );
  assert.ok(
    lower.includes('no añade un segundo bloque') ||
      lower.includes('no anade un segundo bloque') ||
      lower.includes('no adds a second block') ||
      (lower.includes('segundo bloque') && lower.includes('no')),
    'expected an explicit guarantee that no second block is added on a repeat run'
  );
});

test('R4 — idempotency-by-mark: an existing own block is REPLACED in place, never duplicated', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('reempla') || lower.includes('replace'),
    'expected the command to state that an existing own block is replaced in place'
  );
  assert.ok(
    lower.includes('en lugar de duplic') || lower.includes('instead of duplicat') || lower.includes('sin duplic'),
    'expected the command to explicitly rule out duplicating the block when it already exists'
  );
});

test('R4.S2 / AC8 — without confirmation / on rejection, NOTHING changes: neither target file nor copy destination', () => {
  const content = readCommand();
  const lower = content.toLowerCase();
  assert.ok(
    lower.includes('sin confirmaci') || lower.includes('rechaz') || lower.includes('without confirmation') || lower.includes('reject'),
    'expected the command to describe the no-confirmation / rejection path'
  );
  assert.ok(
    (lower.includes('no modifica') || lower.includes('no cambia') || lower.includes('nothing changes') || lower.includes('does not modify')),
    'expected an explicit "nothing changes" guarantee'
  );
  // must cover BOTH the target file AND the copy destination, not just one
  assert.ok(
    lower.includes('fichero') && lower.includes('copia'),
    'expected the "nothing changes" guarantee to cover both the target file and the copy destination'
  );
});
