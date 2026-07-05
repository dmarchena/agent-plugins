// Unit test for exec/verify.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rerun, classifyEvidence, confirm, trimRerunOutput } from '../../scripts/exec/verify.mjs';

// --- T?: R3.S1/R3.S2 (AC6/AC7) fixture -------------------------------------
// Builds a >200-line log resembling a failing `node --test` TAP run: lots of
// stack-trace noise from two frames, plus one identifiable assertion line
// that a human/orchestrator needs to diagnose the failure.
const ASSERTION_LINE =
  'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: true !== false';

function buildNoisyFailureLog() {
  const lines = [];
  lines.push('TAP version 13');
  lines.push('# Subtest: widget renders correctly');
  for (let i = 0; i < 90; i++) {
    lines.push(`    at noiseFrame${i} (/repo/node_modules/some-lib/dist/index.js:${100 + i}:${5 + i})`);
  }
  lines.push('not ok 1 - widget renders correctly');
  lines.push('  ---');
  lines.push('  duration_ms: 12.345');
  lines.push("  location: '/repo/src/widget.test.mjs:42:3'");
  lines.push("  failureType: 'testCodeFailure'");
  lines.push('  error: |-');
  lines.push('    Expected values to be strictly equal:');
  lines.push('');
  lines.push('    + actual');
  lines.push('    - expected');
  lines.push('');
  lines.push('    +true');
  lines.push('    -false');
  lines.push(ASSERTION_LINE);
  lines.push("  code: 'ERR_ASSERTION'");
  lines.push('  stack: |-');
  for (let i = 0; i < 110; i++) {
    lines.push(`    at moreNoiseFrame${i} (/repo/node_modules/other-lib/dist/bundle.js:${200 + i}:${10 + i})`);
  }
  lines.push('  ---');
  lines.push('# tests 1');
  lines.push('# pass 0');
  lines.push('# fail 1');
  return lines.join('\n');
}

function withNoisyFixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-trim-'));
  const logPath = path.join(dir, 'fail.log');
  const log = buildNoisyFailureLog();
  fs.writeFileSync(logPath, log);
  try {
    return fn({ dir, logPath, log });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('rerun: exit 0 -> passed true', () => {
  const res = rerun('exit 0');
  assert.equal(res.passed, true);
});

test('rerun: exit 1 -> passed false', () => {
  const res = rerun('exit 1');
  assert.equal(res.passed, false);
});

test('rerun: captures stdout in output', () => {
  const res = rerun('echo hello');
  assert.ok(res.output.includes('hello'));
});

test('classifyEvidence: rojo_passed=false, verde_passed=true -> red-green', () => {
  assert.equal(classifyEvidence({ rojo_passed: false, verde_passed: true }), 'red-green');
});

test('classifyEvidence: rojo_passed=true -> no-red', () => {
  assert.equal(classifyEvidence({ rojo_passed: true, verde_passed: true }), 'no-red');
});

test('classifyEvidence: rojo_passed=false, verde_passed=false -> not-green', () => {
  assert.equal(classifyEvidence({ rojo_passed: false, verde_passed: false }), 'not-green');
});

test('confirm: evidence red-green with a passing testCmd -> done true, reason null', () => {
  const evidence = { rojo_passed: false, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'exit 0');
  assert.equal(res.done, true);
  assert.equal(res.reason, null);
  assert.ok(typeof res.rerun_output === 'string');
});

test('confirm: evidence red-green with a failing testCmd -> done false, reason rerun-failed', () => {
  const evidence = { rojo_passed: false, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'exit 1');
  assert.equal(res.done, false);
  assert.equal(res.reason, 'rerun-failed');
});

test('confirm: evidence without red (rojo_passed=true) -> done false, reason no-red, no re-run', () => {
  const evidence = { rojo_passed: true, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'exit 1');
  assert.equal(res.done, false);
  assert.equal(res.reason, 'no-red');
  assert.equal(res.rerun_output, null);
});

// --- R3.S1/R3.S2 (AC6/AC7): rerun_output is trimmed, verdict is untouched --

test('trimRerunOutput: fixture log is >200 lines (sanity check on the fixture itself)', () => {
  const log = buildNoisyFailureLog();
  assert.ok(log.split('\n').length > 200, 'fixture must exceed 200 lines');
});

test('AC6: trimRerunOutput caps a >200-line failure log to <=50 lines and keeps the assertion line', () => {
  const log = buildNoisyFailureLog();
  const trimmed = trimRerunOutput(log);
  const trimmedLines = trimmed.split('\n');
  assert.ok(trimmedLines.length <= 50, `expected <=50 lines, got ${trimmedLines.length}`);
  assert.ok(trimmed.includes(ASSERTION_LINE), 'trimmed output must preserve the assertion line');
});

test('AC6: trimRerunOutput leaves short output untouched', () => {
  const short = 'line 1\nline 2\nline 3';
  assert.equal(trimRerunOutput(short), short);
});

test('AC7: confirm() on a failing re-run with a noisy log trims rerun_output but keeps reason=rerun-failed', () => {
  withNoisyFixture(({ logPath }) => {
    const evidence = { rojo_passed: false, verde_passed: true };
    const untrimmedRes = rerun(`cat ${logPath}; exit 1`);
    const res = confirm({ id: 'T1' }, evidence, `cat ${logPath}; exit 1`);

    // Veredicto idéntico con y sin recorte: el recorte es solo cosmético.
    assert.equal(untrimmedRes.passed, false);
    assert.equal(res.done, false);
    assert.equal(res.reason, 'rerun-failed');

    // Salida recortada, tope duro <=50 líneas, preserva la línea de fallo.
    const lines = res.rerun_output.split('\n');
    assert.ok(lines.length <= 50, `expected <=50 lines, got ${lines.length}`);
    assert.ok(res.rerun_output.includes(ASSERTION_LINE));

    // El log sin recortar sigue siendo el de referencia (>200 líneas): el
    // recorte realmente reduce el volumen devuelto al orquestador.
    assert.ok(untrimmedRes.output.split('\n').length > 200);
  });
});

test('AC7: confirm() on a passing re-run still reports done=true (green stays green) regardless of trimming', () => {
  const evidence = { rojo_passed: false, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'echo all good; exit 0');
  assert.equal(res.done, true);
  assert.equal(res.reason, null);
  assert.ok(res.rerun_output.includes('all good'));
});
