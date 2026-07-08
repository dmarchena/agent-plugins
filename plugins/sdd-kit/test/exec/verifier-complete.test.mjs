// test/exec/verifier-complete.test.mjs — T2-complete-green (R2.S1/R2.S2/R2.S3)
//
// A `verifier` task (agent_type: "verifier") re-runs an already-implemented
// suite instead of writing new code from a failing test, so requiring a red
// phase from it makes no sense: there is no code_writer-style red->green
// cycle to report. This scopes a waiver of the red-phase requirement
// strictly to agent_type === "verifier": `complete` on such a task
// deterministically re-runs its --test-cmd and closes it `done` when that
// re-run passes (R2.S1), or `not-done`/`rerun-failed` when it doesn't
// (R2.S2) — never trusting the subagent's self-reported --rojo/--verde
// flags either way. Any other agent_type (e.g. terminal_operator) keeps the
// pre-existing no-red behavior unchanged (R2.S3).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

// --- fixture: a single-task plan, agent_type parametrized -------------------

const SPEC = `# Spec: Verifier Fixture

## Purpose

Minimal fixture for a single task that closes via re-run verification.

## Scope

**In scope:**
- One requirement closed by a single task.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — Single requirement

Depende de: —

The system SHALL verify part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN the task runs
- THEN the suite is confirmed green

## Technical Requirements

- **Stack / framework:** N/A (test fixture).
- **Integrations:** N/A
- **Performance:** N/A
- **Security / privacy:** N/A
- **Data / storage:** N/A
- **Additional constraints:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — the suite is confirmed green

## Assumptions & Open Questions

- None.
`;

function makePlan(agentType, taskId) {
  return {
    plan_id: `${taskId}-plan`,
    project_name: 'Verifier Fixture',
    global_objective: 'Single task plan exercising the verifier red-phase waiver.',
    source_spec: 'spec.md',
    confidence: 'low',
    estimated_tokens_total: 1000,
    tasks: [
      {
        task_id: taskId,
        source_ids: ['R1.S1'],
        dependencies: [],
        agent_type: agentType,
        subagent: 'general-purpose',
        model: 'sonnet',
        justification: 'Single task fixture exercising R1.S1.',
        instructions: `Verify R1.S1 by re-running the suite for ${taskId}.`,
        expected_output_schema: 'Verification report for R1.S1',
        satisfies_acs: ['AC1'],
        estimated_tokens: 1000,
        actual_tokens: null,
        deviation: null,
        test_contract: null,
      },
    ],
    coverage: {
      requirements: { R1: [taskId] },
      acs: { AC1: [taskId] },
    },
  };
}

// --- helpers ------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args) {
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

function setupRepo(prefix, agentType, taskId) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const slug = taskId;
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(makePlan(agentType, taskId), null, 2));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture']);
  cli(repo, ['init', specDir]);
  return { repo, specDir, absSpecDir };
}

// Writes a plain (non `node --test`) exit-code check script and returns its
// test-cmd, so the deterministic re-run's own exit code is what's under
// test, not Node's nested-test-run recursion guard (see complete-batch.test.mjs
// for the full rationale on why a plain script is used instead of node --test).
function writeCheckScript(repo, name, shouldPass) {
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 't', `${name}.check.mjs`),
    `process.exit(${shouldPass ? 0 : 1});\n`,
  );
  return `node t/${name}.check.mjs`;
}

function stateOf(absSpecDir) {
  return JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
}

// --- R2.S1 (AC3): verifier + passing re-run -> done, no no-red incident ----

test('R2.S1: complete on a verifier task whose suite passes returns done, state done, no no-red incident', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-verifier-ok-', 'verifier', 'task-verify');
  try {
    const testCmd = writeCheckScript(repo, 'task-verify', true);
    // A dummy artifact so the --files guard has something real to stage; the
    // commit itself is incidental here — this test only asserts the done
    // classification + state entry, per the task brief's note on commit
    // behavior for file-less verifier tasks.
    fs.writeFileSync(path.join(repo, specDir, 'verify-report.txt'), 'verification report\n');

    const result = cli(repo, [
      'complete', specDir, 'task-verify',
      '--tokens', '500', '--test-cmd', testCmd, '--rojo', 'pass', '--verde', 'pass',
      '--files', path.join(specDir, 'verify-report.txt'),
    ]);

    assert.strictEqual(result.status, 'done', 'R2.S1: a verifier task whose suite passes must close done');
    assert.strictEqual(result.reason, undefined, 'R2.S1: a done result carries no reason field');
    assert.notStrictEqual(result.incidencia, 'no red evidence', 'R2.S1: no no-red incidencia in the result');

    const state = stateOf(absSpecDir);
    assert.strictEqual(state.tasks['task-verify'].status, 'done', 'R2.S1: state entry flips to done');
    assert.strictEqual(state.tasks['task-verify'].incidencia, null, 'R2.S1: no no-red incidencia is recorded in state');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R2.S2 (AC4): verifier + failing re-run -> not-done/rerun-failed -------

test('R2.S2: complete on a verifier task whose suite fails on the orchestrator re-run returns not-done/rerun-failed, no commit', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-verifier-fail-', 'verifier', 'task-verify');
  try {
    const testCmd = writeCheckScript(repo, 'task-verify', false);

    const result = cli(repo, [
      'complete', specDir, 'task-verify',
      '--tokens', '500', '--test-cmd', testCmd, '--rojo', 'pass', '--verde', 'pass',
      '--files', 'placeholder.txt',
    ]);

    assert.strictEqual(result.status, 'not-done', 'R2.S2: a failing orchestrator re-run must not close the task');
    assert.strictEqual(result.reason, 'rerun-failed', 'R2.S2: the failure reason is rerun-failed, not no-red');

    const state = stateOf(absSpecDir);
    assert.strictEqual(state.tasks['task-verify'].status, 'pending', 'R2.S2: state entry stays pending');
    assert.strictEqual(state.tasks['task-verify'].commit, null, 'R2.S2: no commit recorded in state');

    const taskCommits = git(repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, '0', 'R2.S2: no commit was created on the branch');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R2.S3 (AC5): non-verifier + rojo=pass -> no-red, unchanged ------------

test('R2.S3: complete on a terminal_operator task with a passed red phase still returns not-done/no-red (unchanged)', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-nonverifier-', 'terminal_operator', 'task-op');
  try {
    // Would pass if a re-run were ever attempted — it must NOT be, since a
    // non-verifier task with rojo=pass has to short-circuit on no-red before
    // any rerun happens.
    const testCmd = writeCheckScript(repo, 'task-op', true);

    const result = cli(repo, [
      'complete', specDir, 'task-op',
      '--tokens', '500', '--test-cmd', testCmd, '--rojo', 'pass', '--verde', 'pass',
      '--files', 'placeholder.txt',
    ]);

    assert.strictEqual(result.status, 'not-done', 'R2.S3: non-verifier tasks are unaffected by the waiver');
    assert.strictEqual(result.reason, 'no-red', 'R2.S3: rojo=pass still classifies as no-red for non-verifier tasks');

    const state = stateOf(absSpecDir);
    assert.strictEqual(state.tasks['task-op'].status, 'pending');
    assert.strictEqual(state.tasks['task-op'].incidencia, 'no red evidence');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
