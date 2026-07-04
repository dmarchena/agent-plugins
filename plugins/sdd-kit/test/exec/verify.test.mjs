// Test unitario de exec/verify.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rerun, classifyEvidence, confirm } from '../../scripts/exec/verify.mjs';

test('rerun: exit 0 -> passed true', () => {
  const res = rerun('exit 0');
  assert.equal(res.passed, true);
});

test('rerun: exit 1 -> passed false', () => {
  const res = rerun('exit 1');
  assert.equal(res.passed, false);
});

test('rerun: captura stdout en output', () => {
  const res = rerun('echo hola');
  assert.ok(res.output.includes('hola'));
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

test('confirm: evidence red-green con testCmd que pasa -> done true, reason null', () => {
  const evidence = { rojo_passed: false, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'exit 0');
  assert.equal(res.done, true);
  assert.equal(res.reason, null);
  assert.ok(typeof res.rerun_output === 'string');
});

test('confirm: evidence red-green con testCmd que falla -> done false, reason rerun-failed', () => {
  const evidence = { rojo_passed: false, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'exit 1');
  assert.equal(res.done, false);
  assert.equal(res.reason, 'rerun-failed');
});

test('confirm: evidence sin rojo (rojo_passed=true) -> done false, reason no-red, sin re-run', () => {
  const evidence = { rojo_passed: true, verde_passed: true };
  const res = confirm({ id: 'T1' }, evidence, 'exit 1');
  assert.equal(res.done, false);
  assert.equal(res.reason, 'no-red');
  assert.equal(res.rerun_output, null);
});
