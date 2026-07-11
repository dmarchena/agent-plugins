// test/exec/commit-ordering.test.mjs — fix-commit-state-ordering
//
// completeOne() used to commit a task's work (git add -A + git commit)
// BEFORE that task's own state flip (recordResult + persist) was written to
// disk. Net effect: each task's commit captured whatever was on disk from
// the PREVIOUS task's persist (not its own), and the very last task closed
// in an invocation never got its flip committed at all (it sat as an
// orphaned working-tree diff) — including its STATUS, the substantive,
// load-bearing field this bug actually lost data on. This test proves:
//   AC1 — each task's commit captures ITS OWN status/actual_tokens/test_cmd
//         (not the previous task's stale values), with a real, distinct
//         commit hash per task.
//   AC2 — after the LAST task closes, status/actual_tokens/test_cmd are
//         always already committed for every task. The `commit` hash field
//         itself may still be a pending, uncommitted write for the very
//         last task — a commit can't embed the hash of itself (that's
//         provably impossible, not a gap in this fix), and that field is a
//         convenience cache also recoverable via `git log` (the message
//         includes the task_id), not substantive audit data, so it's fine
//         for it to trail its own commit the same way it always has.
// Both assertions are checked twice: once closing via cmdComplete (one
// `complete` invocation per task) and once via cmdCompleteBatch (both tasks
// in one `--batch` invocation) — the fix must hold in both modes.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'commit-ordering-demo';
const STATE_REL = path.join('docs', 'specs', SLUG, 'execution_state.json');

// --- fixture: 2 independent tasks, task-a (N-1) and task-b (N, the last) --

const SPEC = `# Spec: Commit Ordering Fixture

## Purpose

Minimal fixture for proving each task's own state flip is captured by its
own commit, and the last task leaves no pending diff.

## Scope

**In scope:**
- Two independent requirements closed in sequence (task-a then task-b).

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
    plan_id: 'commit-ordering-demo-plan',
    project_name: 'Commit Ordering Fixture',
    global_objective: 'Close 2 sequential tasks proving per-task commit/state ordering.',
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

// --- helpers (same pattern as complete-batch.test.mjs) ----------------------

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

// Writes a task's impl + a plain exit-code check (see complete-batch.test.mjs
// for why this isn't `node:test` based — nested NODE_TEST_CONTEXT recursion
// guard would silently skip it).
function writeTaskFiles(repo, taskId, ref, shouldPass) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = ${shouldPass};\n`);
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.check.mjs`),
    `import { done } from '../impl/${taskId}.mjs';\n`
    + `// ${taskId} satisfies ${ref}\n`
    + `if (done !== true) { console.error('FAIL: ${taskId} (${ref}) expected done=true, got', done); process.exit(1); }\n`
    + `console.log('PASS: ${taskId} (${ref})');\n`,
  );
  return `node t/${taskId}.check.mjs`;
}

function stateOf(absSpecDir) {
  return JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
}

// Asserts a task's entry (read at HEAD after some point in time) shows its
// OWN correct status/actual_tokens/test_cmd — not blank/null and not another
// task's stale values.
function assertOwnValues(state, taskId, expectedTokens, expectedTestCmd) {
  const entry = state.tasks[taskId];
  assert.strictEqual(entry.status, 'done', `${taskId}: status must be done`);
  assert.strictEqual(entry.actual_tokens, expectedTokens, `${taskId}: actual_tokens must be its own`);
  assert.strictEqual(entry.test_cmd, expectedTestCmd, `${taskId}: test_cmd must be its own`);
  assert.ok(entry.commit != null, `${taskId}: commit must be non-null`);
}

// Verifies a task's recorded commit hash resolves to a real git object whose
// OWN content (at that hash) shows that task's correct state.
function assertCommitContent(repo, commitHash, taskId, expectedTokens, expectedTestCmd) {
  // git cat-file -e <hash>^{commit} exits 0 if it's a real commit object.
  execFileSync('git', ['cat-file', '-e', `${commitHash}^{commit}`], { cwd: repo });
  const shown = git(repo, ['show', `${commitHash}:${STATE_REL}`]);
  const stateAtCommit = JSON.parse(shown);
  const entry = stateAtCommit.tasks[taskId];
  assert.strictEqual(entry.status, 'done', `${taskId}@${commitHash}: status must be done in its own commit`);
  assert.strictEqual(entry.actual_tokens, expectedTokens, `${taskId}@${commitHash}: actual_tokens must be its own`);
  assert.strictEqual(entry.test_cmd, expectedTestCmd, `${taskId}@${commitHash}: test_cmd must be its own`);
}

// AC2, honestly scoped: status/actual_tokens/test_cmd for every task must
// already be committed at HEAD (no pending diff on the substantive fields).
// The `commit` hash field itself is allowed to still be a pending disk write
// for the task whose commit it names — it can't be embedded in the commit
// that produces it (see the file-header comment), so it isn't held to the
// same bar. A future regression that lost STATUS again (the actual incident)
// would show up here as a mismatch on status/actual_tokens/test_cmd.
function assertSubstantiveFieldsCommitted(repo, absSpecDir) {
  const committed = JSON.parse(git(repo, ['show', `HEAD:${STATE_REL}`]));
  const onDisk = stateOf(absSpecDir);
  for (const taskId of Object.keys(onDisk.tasks)) {
    const a = committed.tasks[taskId];
    const b = onDisk.tasks[taskId];
    assert.strictEqual(b.status, a.status, `${taskId}: status must already be committed, not pending`);
    assert.strictEqual(b.actual_tokens, a.actual_tokens, `${taskId}: actual_tokens must already be committed, not pending`);
    assert.strictEqual(b.test_cmd, a.test_cmd, `${taskId}: test_cmd must already be committed, not pending`);
  }
}

// --- AC1 + AC2 via cmdComplete (single-task, one invocation per task) ------

test('AC1/AC2 (single-task complete): each task commits its own state; last task leaves no pending diff', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-commit-order-single-');
  try {
    const testCmdA = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    const doneA = cli(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmdA, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'impl/task-a.mjs,t/task-a.check.mjs',
    ]);
    assert.strictEqual(doneA.data.status, 'done');
    assert.ok(doneA.data.commit, 'task-a must have a commit hash');

    // AC1 (task N-1): state at current HEAD shows task-a's own values.
    const stateAfterA = stateOf(absSpecDir);
    assertOwnValues(stateAfterA, 'task-a', 1200, testCmdA);
    assertCommitContent(repo, doneA.data.commit, 'task-a', 1200, testCmdA);

    const testCmdB = writeTaskFiles(repo, 'task-b', 'R2.S1', true);
    const doneB = cli(repo, [
      'complete', specDir, 'task-b',
      '--tokens', '1100', '--test-cmd', testCmdB, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'impl/task-b.mjs,t/task-b.check.mjs',
    ]);
    assert.strictEqual(doneB.data.status, 'done');
    assert.ok(doneB.data.commit, 'task-b must have a commit hash');
    assert.notStrictEqual(doneB.data.commit, doneA.data.commit, 'task-b commit must differ from task-a commit');

    // AC1 (task N, the last): state shows task-b's OWN values, not task-a's
    // stale ones, and task-a's entry is still intact (not clobbered).
    const stateAfterB = stateOf(absSpecDir);
    assertOwnValues(stateAfterB, 'task-b', 1100, testCmdB);
    assertOwnValues(stateAfterB, 'task-a', 1200, testCmdA);
    assertCommitContent(repo, doneB.data.commit, 'task-b', 1100, testCmdB);

    // AC2: after the LAST task closes, status/actual_tokens/test_cmd for
    // every task are already committed (only `commit` may still be pending).
    assertSubstantiveFieldsCommitted(repo, absSpecDir);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- Same two assertions via cmdCompleteBatch (both tasks, 1 invocation) ---

test('AC1/AC2 (batch complete): each task commits its own state; last task leaves no pending diff', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-commit-order-batch-');
  try {
    const testCmdA = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    const testCmdB = writeTaskFiles(repo, 'task-b', 'R2.S1', true);

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        task_id: 'task-a', tokens: 1200, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs', 't/task-a.check.mjs'],
      },
      {
        task_id: 'task-b', tokens: 1100, test_cmd: testCmdB, rojo: 'fail', verde: 'pass',
        files: ['impl/task-b.mjs', 't/task-b.check.mjs'],
      },
    ], null, 2));

    const result = cli(repo, ['complete', specDir, '--batch', batchFile]);
    assert.strictEqual(result.data.status, 'batch');
    const byId = Object.fromEntries(result.data.results.map((r) => [r.task_id, r]));
    assert.strictEqual(byId['task-a'].status, 'done');
    assert.strictEqual(byId['task-b'].status, 'done');
    assert.ok(byId['task-a'].commit);
    assert.ok(byId['task-b'].commit);
    assert.notStrictEqual(byId['task-a'].commit, byId['task-b'].commit, 'each task has a DIFFERENT commit');

    // AC1: final state shows BOTH tasks' own correct values.
    const state = stateOf(absSpecDir);
    assertOwnValues(state, 'task-a', 1200, testCmdA);
    assertOwnValues(state, 'task-b', 1100, testCmdB);

    // AC1: each task's recorded commit hash is a real object whose OWN
    // content at that hash shows that task's correct state.
    assertCommitContent(repo, byId['task-a'].commit, 'task-a', 1200, testCmdA);
    assertCommitContent(repo, byId['task-b'].commit, 'task-b', 1100, testCmdB);

    // AC2: after the last task (task-b) closes, status/actual_tokens/test_cmd
    // for every task are already committed (only `commit` may still be pending).
    assertSubstantiveFieldsCommitted(repo, absSpecDir);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
