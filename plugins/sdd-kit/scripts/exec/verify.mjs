// exec/verify.mjs — T3: deterministic re-run + red→green evidence for the
// plan-executor skill. Pure Node ESM, stdlib only (node:child_process). No
// npm dependencies.
//
// Convention: lib modules do not print; they return data.

import { spawnSync } from 'node:child_process';

// T?: R3 — hard cap on rerun_output so a failing re-run's log never floods
// the orchestrator's context. Purely cosmetic: it never changes pass/fail.
const RERUN_OUTPUT_MAX_LINES = 50;
const FAILURE_LINE_PATTERN =
  /AssertionError|Error:|not ok|✖|expected|actual|failureType|ERR_ASSERTION/i;

export function rerun(testCmd, cwd = process.cwd()) {
  const res = spawnSync('bash', ['-lc', testCmd], { cwd, encoding: 'utf8' });
  return {
    passed: res.status === 0,
    output: (res.stdout || '') + (res.stderr || ''),
  };
}

// Trims a (possibly huge) test-run log to at most maxLines lines, prioritizing
// lines that look like failure/assertion output so the diagnosable line
// survives the cut. Falls back to the tail of the log if no such line is
// found. Never touches pass/fail — callers decide that from the exit code.
export function trimRerunOutput(output, maxLines = RERUN_OUTPUT_MAX_LINES) {
  if (!output) return output;
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output;
  const matched = lines.filter((line) => FAILURE_LINE_PATTERN.test(line));
  const picked = matched.length > 0 ? matched : lines.slice(-maxLines);
  return picked.slice(0, maxLines).join('\n');
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
    rerun_output: trimRerunOutput(res.output),
    reason: res.passed ? null : 'rerun-failed',
  };
}
