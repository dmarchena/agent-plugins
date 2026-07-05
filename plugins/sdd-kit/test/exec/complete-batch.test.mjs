// test/exec/complete-batch.test.mjs — R2.S1/R2.S2 (AC4/AC5)
//
// Closing a ready batch (<=3 parallel tasks) today costs one `complete`
// invocation per task. This tests the batch-closing mode: one invocation
// (`complete SPECDIR --batch <file.json>`) that closes N tasks at once,
// producing per-task commits/state entries indistinguishable from the
// tarea-a-tarea (one-invocation-per-task) baseline (AC4), and isolating a
// single failing task's outcome without touching its siblings (AC5).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'batch-demo';

// --- fixture: 2 independent tasks (a ready batch, R4.S1) -------------------

const SPEC = `# Spec: Batch Fixture

## Purpose

Minimal fixture for the executor's batch-close mode.

## Scope

**In scope:**
- Two independent requirements closed as one ready batch.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — First independent requirement

Depende de: —

The system SHALL deliver part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN part A is done

### R2 — Second independent requirement

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

function makePlan() {
  return {
    plan_id: 'batch-demo-plan',
    project_name: 'Batch Fixture',
    global_objective: 'Batch-close 2 parallel tasks in one complete invocation.',
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
        test_contract: [{ ref: 'R1.S1', assertion: 'Part A is done and its test passes' }],
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
        test_contract: [{ ref: 'R2.S1', assertion: 'Part B is done and its test passes' }],
      },
    ],
    coverage: {
      requirements: { R1: ['task-a'], R2: ['task-b'] },
      acs: { AC1: ['task-a'], AC2: ['task-b'] },
    },
  };
}

// --- helpers ----------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args) {
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

function setupRepo(prefix) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const specDir = path.join('docs', 'specs', SLUG);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(makePlan(), null, 2));
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture']);
  cli(repo, ['init', specDir]);
  return { repo, specDir, absSpecDir };
}

// Writes a task's test+impl. Trivial pass/fail toggle via `shouldPass`.
function writeTaskFiles(repo, taskId, ref, shouldPass) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = ${shouldPass};\n`);
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.test.mjs`),
    `import { test } from 'node:test';\n`
    + `import assert from 'node:assert';\n`
    + `import { done } from '../impl/${taskId}.mjs';\n`
    + `test('${taskId} satisfies ${ref}', () => { assert.strictEqual(done, true); });\n`,
  );
  return `node --test t/${taskId}.test.mjs`;
}

function stateOf(absSpecDir) {
  return JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
}

// Strips fields that are legitimately unique per repo/run (git hashes) so two
// independent closings of the "same" fixture can be compared for equality.
function stableEntry(entry) {
  const { commit, ...rest } = entry;
  return { ...rest, hadCommit: commit != null };
}

// --- AC4: batch close == tarea-a-tarea close, byte-identical per-task state -

test('AC4: closing a batch in 1 invocation yields the same per-task commit+state as closing them one by one', () => {
  // Reference: today's tarea-a-tarea flow — one `complete` invocation per task.
  const ref = setupRepo('exec-batch-ref-');
  let refInvocations = 0;
  try {
    const testCmdA = writeTaskFiles(ref.repo, 'task-a', 'R1.S1', true);
    refInvocations++;
    const doneA = cli(ref.repo, [
      'complete', ref.specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmdA, '--rojo', 'fail', '--verde', 'pass',
    ]);
    const testCmdB = writeTaskFiles(ref.repo, 'task-b', 'R2.S1', true);
    refInvocations++;
    const doneB = cli(ref.repo, [
      'complete', ref.specDir, 'task-b',
      '--tokens', '1100', '--test-cmd', testCmdB, '--rojo', 'fail', '--verde', 'pass',
    ]);
    assert.strictEqual(doneA.status, 'done');
    assert.strictEqual(doneB.status, 'done');
    assert.strictEqual(refInvocations, 2, 'baseline: N tasks need N invocations');

    const refState = stateOf(ref.absSpecDir);

    // Batch: both tasks' files already exist (as they would once 2 parallel
    // subagents have both returned), closed with ONE invocation.
    const batch = setupRepo('exec-batch-new-');
    try {
      const testCmdA2 = writeTaskFiles(batch.repo, 'task-a', 'R1.S1', true);
      const testCmdB2 = writeTaskFiles(batch.repo, 'task-b', 'R2.S1', true);
      const batchFile = path.join(batch.repo, 'batch.json');
      fs.writeFileSync(batchFile, JSON.stringify([
        {
          task_id: 'task-a', tokens: 1200, test_cmd: testCmdA2, rojo: 'fail', verde: 'pass',
          files: ['impl/task-a.mjs', 't/task-a.test.mjs'],
        },
        {
          task_id: 'task-b', tokens: 1100, test_cmd: testCmdB2, rojo: 'fail', verde: 'pass',
          files: ['impl/task-b.mjs', 't/task-b.test.mjs'],
        },
      ], null, 2));

      let batchInvocations = 0;
      batchInvocations++;
      const result = cli(batch.repo, ['complete', batch.specDir, '--batch', batchFile]);
      assert.strictEqual(batchInvocations, 1, 'the whole batch closes in exactly 1 invocation');
      assert.ok(batchInvocations < refInvocations, 'strictly fewer invocations than tarea-a-tarea');

      assert.strictEqual(result.status, 'batch');
      assert.strictEqual(result.results.length, 2);
      const byId = Object.fromEntries(result.results.map((r) => [r.task_id, r]));
      assert.strictEqual(byId['task-a'].status, 'done');
      assert.strictEqual(byId['task-b'].status, 'done');
      assert.ok(byId['task-a'].commit, 'task-a has its own commit');
      assert.ok(byId['task-b'].commit, 'task-b has its own commit');
      assert.notStrictEqual(byId['task-a'].commit, byId['task-b'].commit, 'each task has a DIFFERENT commit');

      const batchState = stateOf(batch.absSpecDir);

      // Byte-identical per-task state (status/tokens/deviation/test_cmd/incidencia)
      // between the batch close and the tarea-a-tarea close of the same fixture.
      for (const id of ['task-a', 'task-b']) {
        assert.deepStrictEqual(
          stableEntry(batchState.tasks[id]),
          stableEntry(refState.tasks[id]),
          `${id}: batch-closed state entry must match the tarea-a-tarea one`,
        );
      }

      // Exactly 2 task commits on top of main, each containing ONLY its own
      // task's files (atomic per-task commit, not one commit swallowing both).
      const taskCommits = git(batch.repo, ['rev-list', '--count', 'HEAD', '^main']);
      assert.strictEqual(taskCommits, '2', 'exactly one commit per task');
      for (const id of ['task-a', 'task-b']) {
        const files = git(batch.repo, ['log', '--all', '--pretty=format:', '--name-only',
          '--diff-filter=A', '--', `t/${id}.test.mjs`, `impl/${id}.mjs`]);
        assert.ok(files.includes(`t/${id}.test.mjs`), `${id}: test committed`);
        assert.ok(files.includes(`impl/${id}.mjs`), `${id}: impl committed`);
      }
      // The other task's files must NOT appear in this task's commit (isolation).
      const commitAFiles = git(batch.repo, ['show', '--name-only', '--pretty=format:', byId['task-a'].commit]);
      assert.ok(!commitAFiles.includes('task-b'), "task-a's commit must not include task-b's files");
      const commitBFiles = git(batch.repo, ['show', '--name-only', '--pretty=format:', byId['task-b'].commit]);
      assert.ok(!commitBFiles.includes('task-a'), "task-b's commit must not include task-a's files");
    } finally {
      fs.rmSync(batch.repo, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(ref.repo, { recursive: true, force: true });
  }
});

// --- AC5: one failing task in the batch doesn't block/revert the others ----

test('AC5: a task that fails its re-run in the batch is reported not-done without blocking/reverting the green ones', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-batch-fail-');
  try {
    // task-a: genuine red->green, will verify clean.
    const testCmdA = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    // task-b: implementation left broken (done=false), its test will fail on re-run.
    const testCmdB = writeTaskFiles(repo, 'task-b', 'R2.S1', false);

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        task_id: 'task-a', tokens: 1200, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs', 't/task-a.test.mjs'],
      },
      {
        // The subagent claimed green, but the deterministic re-run will fail
        // because the implementation is broken (rerun-failed, R6).
        task_id: 'task-b', tokens: 1100, test_cmd: testCmdB, rojo: 'fail', verde: 'pass',
        files: ['impl/task-b.mjs', 't/task-b.test.mjs'],
      },
    ], null, 2));

    const result = cli(repo, ['complete', specDir, '--batch', batchFile]);
    assert.strictEqual(result.status, 'batch');
    const byId = Object.fromEntries(result.results.map((r) => [r.task_id, r]));

    // task-a: unaffected, still commits and reports done.
    assert.strictEqual(byId['task-a'].status, 'done');
    assert.ok(byId['task-a'].commit);

    // task-b: not-done, with its incidencia, no commit.
    assert.strictEqual(byId['task-b'].status, 'not-done');
    assert.strictEqual(byId['task-b'].reason, 'rerun-failed');
    assert.ok(byId['task-b'].incidencia, 'task-b must carry an incidencia');
    assert.strictEqual(byId['task-b'].commit, undefined, 'a not-done task has no commit field on its result');

    // State reflects the split outcome: task-a done, task-b still pending with incidencia.
    const state = stateOf(absSpecDir);
    assert.strictEqual(state.tasks['task-a'].status, 'done');
    assert.strictEqual(state.tasks['task-a'].commit !== null, true);
    assert.strictEqual(state.tasks['task-b'].status, 'pending', 'not blocked/skipped, just not done yet');
    assert.strictEqual(state.tasks['task-b'].commit, null, 'no commit for the failed task');
    assert.ok(state.tasks['task-b'].incidencia);

    // Only ONE commit landed (task-a's); task-b was not reverted, it was simply never committed.
    const taskCommits = git(repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, '1', 'only the green task produced a commit');
    const filesA = git(repo, ['log', '--all', '--pretty=format:', '--name-only',
      '--diff-filter=A', '--', 't/task-a.test.mjs', 'impl/task-a.mjs']);
    assert.ok(filesA.includes('t/task-a.test.mjs'));
    assert.ok(filesA.includes('impl/task-a.mjs'));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
