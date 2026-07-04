// exec/verify.mjs — T3: deterministic re-run + red→green evidence for the
// plan-executor skill. Pure Node ESM, stdlib only (node:child_process). No
// npm dependencies.
//
// Convention: lib modules do not print; they return data.

import { spawnSync } from 'node:child_process';

export function rerun(testCmd, cwd = process.cwd()) {
  const res = spawnSync('bash', ['-lc', testCmd], { cwd, encoding: 'utf8' });
  return {
    passed: res.status === 0,
    output: (res.stdout || '') + (res.stderr || ''),
  };
}

export function classifyEvidence({ rojo_passed, verde_passed }) {
  if (rojo_passed === true) return 'no-red';
  if (verde_passed === false) return 'not-green';
  return 'red-green';
}

export function confirm(task, evidence, testCmd, cwd = process.cwd()) {
  const classification = classifyEvidence(evidence);
  if (classification !== 'red-green') {
    return { done: false, rerun_output: null, reason: classification };
  }
  const res = rerun(testCmd, cwd);
  return {
    done: res.passed,
    rerun_output: res.output,
    reason: res.passed ? null : 'rerun-failed',
  };
}
