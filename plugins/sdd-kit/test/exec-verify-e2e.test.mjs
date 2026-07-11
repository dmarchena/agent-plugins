// test/exec-verify-e2e.test.mjs — T4-e2e-test (R-E2E.S1 / AC-E2E)
//
// Full-pipeline walkthrough combining BOTH halves of this branch's work:
//   - T2 (exec-tools.mjs `next`): budget pause removed — a healthy DAG must
//     reach `status: 'complete'` and never `status: 'paused'`, no matter how
//     far a completed task's real tokens exceed 2x its estimate.
//   - T1 (verify-tools.mjs CLI): `ground-check` / `report` / `archive`
//     one-liners drive the deterministic verify pipeline and archive a fully
//     green SPECDIR to docs/specs/archived/<slug>/.
//
// Unlike test/verify-e2e.test.mjs (which imports verify-tools.mjs's exports
// directly), THIS test drives every step — exec AND verify — exclusively via
// subprocess CLI one-liners (execFileSync), because AC-E2E requires the
// walkthrough be "driven through command-line one-liners" end to end. The
// SPECDIR's execution_state.json is produced entirely by real `exec-tools.mjs
// complete` calls (not hand-crafted JSON), so verify's `ground-check` re-runs
// the SAME test_cmd ("true") that exec itself verified.
//
// Fixture mirrors test/exec/e2e.test.mjs / test/exec/next-no-pause.test.mjs's
// conventions: an isolated temp git repo, spec.md + execution_plan.json on
// disk, CLI driven as a subprocess.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXEC_CLI = path.resolve(__dirname, '..', 'scripts', 'exec-tools.mjs');
const VERIFY_CLI = path.resolve(__dirname, '..', 'scripts', 'verify-tools.mjs');
const SLUG = 'e2e-full-demo';

// --- fixture: spec with 2 independent requirements, each one [auto] AC ---

const SPEC = `# Spec: E2E Full Walkthrough Fixture

## Purpose

Fixture for the full exec+verify walkthrough (R-E2E.S1 / AC-E2E): drives exec
to completion with a healthy task that exceeds 2x its token estimate, then
verifies and archives via the verify CLI.

## Scope

**In scope:**
- Two independent requirements, each covered by one task.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — First requirement

Depende de: —

The system SHALL deliver part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN part A is done

### R2 — Second requirement

Depende de: —

The system SHALL deliver part B.

#### R2.S1 — Happy path
- GIVEN nothing
- WHEN task B runs
- THEN part B is done

## Technical Requirements

- **Stack / framework:** N/A (test fixture).
- **Integrations:** N/A
- **Performance:** N/A
- **Security / privacy:** N/A
- **Data / storage:** N/A
- **Additional constraints:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — part A is done
- [ ] AC2 → R2.S1 [auto] — part B is done

## Assumptions & Open Questions

- None.
`;

const PLAN = {
  plan_id: 'e2e-full-demo-plan',
  project_name: 'E2E Full Walkthrough Fixture',
  global_objective: 'Full exec+verify walkthrough with a healthy over-budget task.',
  source_spec: 'spec.md',
  confidence: 'low',
  estimated_tokens_total: 2000,
  tasks: [
    {
      task_id: 'task-a',
      source_ids: ['R1.S1'],
      dependencies: [],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Bounded delivery of part A with a clear AC.',
      instructions: 'Implement part A, referencing scenario R1.S1 from the spec.',
      expected_output_schema: 'Part A implemented and its test passing',
      satisfies_acs: ['AC1'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R1.S1', assertion: 'Part A is done and its test passes' },
      ],
    },
    {
      task_id: 'task-b',
      source_ids: ['R2.S1'],
      dependencies: [],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Bounded delivery of part B with a clear AC.',
      instructions: 'Implement part B, referencing scenario R2.S1 from the spec.',
      expected_output_schema: 'Part B implemented and its test passing',
      satisfies_acs: ['AC2'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R2.S1', assertion: 'Part B is done and its test passes' },
      ],
    },
  ],
  coverage: {
    requirements: { R1: ['task-a'], R2: ['task-b'] },
    acs: { AC1: ['task-a'], AC2: ['task-b'] },
  },
};

// --- helpers ---------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function execCli(repo, args) {
  const out = execFileSync('node', [EXEC_CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

function verifyCli(repo, args) {
  const out = execFileSync('node', [VERIFY_CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

// Writes a trivial placeholder file for the task (so `complete --files` has a
// real, non-empty file list to stage) and completes the task via a
// deterministic, genuinely-passing shell test command ("true") — the same
// re-run contract verify-tools.mjs's groundCheck will exercise again later.
function runTask(repo, specDir, taskId, tokens) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.marker`), `${taskId} done\n`);
  return execCli(repo, [
    'complete', specDir, taskId,
    '--tokens', String(tokens),
    '--test-cmd', 'true',
    '--rojo', 'fail',
    '--verde', 'pass',
    '--files', `impl/${taskId}.marker`,
  ]);
}

// --- test --------------------------------------------------------------------

test('R-E2E.S1/AC-E2E: exec reaches complete (never paused) despite a healthy task blowing past 2x its token estimate, then the verify CLI one-liners report all-green and archive the SPECDIR', () => {
  // realpathSync: on macOS os.tmpdir() is /var/folders/... (a symlink to
  // /private/var/...); the archive CLI returns a canonicalized destination, so
  // the fixture root must be canonical too for the path string comparisons.
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'exec-verify-e2e-')));
  try {
    const specDir = path.join('docs', 'specs', SLUG);
    const absSpecDir = path.join(repo, specDir);
    fs.mkdirSync(absSpecDir, { recursive: true });
    fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
    fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(PLAN, null, 2));

    git(repo, ['init', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@t.t']);
    git(repo, ['config', 'user.name', 'test']);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'fixture']);

    // Collect every `next` status observed along the run; none may ever be
    // 'paused', however far over budget a healthy task runs.
    const observedStatuses = [];

    // 1. init: validates the plan, creates branch + state, first batch = both tasks.
    const init = execCli(repo, ['init', specDir]);
    assert.equal(init.ok, true, 'init must validate the plan');
    assert.equal(init.data.branch, `feat/${SLUG}`);
    assert.deepEqual([...init.data.first_batch].sort(), ['task-a', 'task-b']);

    // 2. next: confirms the runnable batch (both independent tasks).
    const batch1 = execCli(repo, ['next', specDir]);
    observedStatuses.push(batch1.data.status);
    assert.equal(batch1.data.status, 'run');
    assert.deepEqual([...batch1.data.batch].sort(), ['task-a', 'task-b']);

    // 3. Complete task-a with tokens FAR beyond 2x its 1000-token estimate
    //    (2500 > 2*1000) — a healthy task that just happens to blow the
    //    budget — and task-b within its estimate.
    const doneA = runTask(repo, specDir, 'task-a', 2500);
    const doneB = runTask(repo, specDir, 'task-b', 900);
    assert.equal(doneA.data.status, 'done');
    assert.ok(doneA.data.commit, 'task-a must have a commit');
    assert.equal(doneB.data.status, 'done');
    assert.ok(doneB.data.commit, 'task-b must have a commit');

    // 4. next: no tasks left -> complete. NEVER 'paused', even though
    //    cumulative real tokens (3400) already exceed 2x the plan's total
    //    estimate (2*2000=4000 is not even exceeded here, but task-a alone
    //    individually blew past 2x its OWN estimate, which is what used to
    //    trigger the (now removed) budget-pause check).
    const end = execCli(repo, ['next', specDir]);
    observedStatuses.push(end.data.status);
    assert.equal(end.data.status, 'complete');
    assert.equal(end.data.counts.done, 2);

    assert.ok(
      observedStatuses.every((s) => s !== 'paused'),
      `next must never report 'paused' along the way; observed: ${JSON.stringify(observedStatuses)}`
    );

    // 5. execution_state.json's pause field must be null.
    const state = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
    assert.equal(state.pause, null, 'no pause entry must be written to execution_state.json');
    assert.equal(state.tasks['task-a'].actual_tokens, 2500);
    assert.equal(state.tasks['task-a'].status, 'done');

    // --- verify phase: same SPECDIR, driven via verify-tools.mjs one-liners ---

    // 6. ground-check: both [auto] ACs re-run green against the real
    //    execution_state.json produced above (test_cmd "true" for both).
    const ground = verifyCli(repo, ['ground-check', specDir]);
    assert.equal(ground.data.status, 'ground-check');
    assert.deepEqual([...ground.data.green].sort(), ['AC1', 'AC2']);
    assert.deepEqual(ground.data.drift, []);

    // 7. report: the whole checklist is green, and the over-budget task-a
    //    rides along informationally as a deviated task (never blocking).
    const report = verifyCli(repo, ['report', specDir]);
    assert.equal(report.data.status, 'report');
    assert.equal(report.data.allGreen, true, 'the whole AC checklist must be green');
    for (const ac of report.data.acs) {
      assert.equal(ac.green, true, `${ac.ac_id} must be green`);
    }
    assert.equal(report.data.deviatedTasks.length, 1, 'exactly task-a is flagged as a token deviation');
    assert.equal(report.data.deviatedTasks[0].task_id, 'task-a');
    assert.equal(report.data.deviatedTasks[0].actual_tokens, 2500);
    assert.equal(report.data.deviatedTasks[0].estimated_tokens, 1000);

    // 8. archive: all-green => relocate the SPECDIR to docs/specs/archived/<slug>/.
    const archive = verifyCli(repo, ['archive', specDir]);
    assert.equal(archive.data.status, 'archived');
    assert.equal(archive.data.archived, true);

    const destination = path.join(repo, 'docs', 'specs', 'archived', SLUG);
    assert.equal(archive.data.destination, destination);
    assert.equal(fs.existsSync(destination), true, 'archived SPECDIR must exist at the sibling path');
    assert.equal(fs.existsSync(absSpecDir), false, 'original SPECDIR must no longer exist');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
