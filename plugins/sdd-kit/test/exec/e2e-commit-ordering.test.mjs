// test/exec/e2e-commit-ordering.test.mjs — fix-commit-state-ordering (R-E2E)
//
// R1 (commit-ordering.test.mjs) proves, on a 2-task fixture, that each
// task's own commit carries its own status/actual_tokens/test_cmd, in both
// closing modes separately. R2 (commit-invariant.test.mjs) proves commitTask
// has exactly one call site, inside completeOne. This file is the
// INTEGRATION composition R-E2E asks for: a full plan close (3 tasks, not 2,
// so this isn't just a re-run of R1's own fixture) driven end-to-end through
// BOTH modes on independent tmp repos of the SAME fixture, checking the same
// invariant holds for every task across the whole plan, plus that both modes
// land the same number of commits (one per task) and never cross-contaminate
// a task's fields with another task's values.
//
// R2's own call-site guard is NOT re-implemented here — see
// commit-invariant.test.mjs for that; this file only asserts the R1 behavior
// (own-commit-owns-own-state) composed across a full plan in both modes.
//
//   AC-E2E — fixture of 3 tasks (2nd/3rd requirement still "2+ where the
//            last is last"), closed once via cmdComplete and once via
//            cmdCompleteBatch (fresh tmp repo each time): every commit
//            reflects its own task's status/actual_tokens/test_cmd (never
//            another task's), and once the whole plan is closed the on-disk
//            execution_state.json matches HEAD's for those fields for every
//            task (only the last task's `commit` field may still be a
//            pending disk write — see spec.md's Nota de alcance under R1).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'e2e-commit-ordering-demo';
const STATE_REL = path.join('docs', 'specs', SLUG, 'execution_state.json');

// --- fixture: 3 independent tasks, task-a / task-b / task-c (task-c last) --

const SPEC = `# Spec: E2E Commit Ordering Fixture

## Purpose

Minimal 3-task fixture for proving, end-to-end, that closing a full plan in
either mode leaves every task's own commit carrying its own state.

## Scope

**In scope:**
- Three independent requirements closed in sequence (task-a, task-b, task-c).

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

### R3 — Third independent requirement

Depende de: —

The system SHALL deliver part C.

#### R3.S1 — Happy path
- GIVEN nothing
- WHEN task C runs
- THEN part C is done

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
- [ ] AC3 → R3.S1 [auto] — part C is done

## Assumptions & Open Questions

- None.
`;

function taskSpec(taskId, ref, ac, tokens) {
  return {
    task_id: taskId,
    source_ids: [ref],
    dependencies: [],
    agent_type: 'code_writer',
    subagent: 'general-purpose',
    model: 'sonnet',
    justification: `Bounded delivery of ${taskId} with a clear AC.`,
    instructions: `Implement ${taskId}, referencing scenario ${ref} from the spec.`,
    expected_output_schema: `${taskId} implemented and its test passing`,
    satisfies_acs: [ac],
    estimated_tokens: tokens,
    actual_tokens: null,
    deviation: null,
    test_contract: [{ ref, assertion: `${taskId} is done and its test passes` }],
  };
}

function makePlan() {
  return {
    plan_id: 'e2e-commit-ordering-demo-plan',
    project_name: 'E2E Commit Ordering Fixture',
    global_objective: 'Close 3 sequential tasks proving end-to-end per-task commit/state ordering in both closing modes.',
    source_spec: 'spec.md',
    confidence: 'low',
    estimated_tokens_total: 3000,
    tasks: [
      taskSpec('task-a', 'R1.S1', 'AC1', 1000),
      taskSpec('task-b', 'R2.S1', 'AC2', 1000),
      taskSpec('task-c', 'R3.S1', 'AC3', 1000),
    ],
    coverage: {
      requirements: { R1: ['task-a'], R2: ['task-b'], R3: ['task-c'] },
      acs: { AC1: ['task-a'], AC2: ['task-b'], AC3: ['task-c'] },
    },
  };
}

const TASK_IDS = ['task-a', 'task-b', 'task-c'];
const TOKENS = { 'task-a': 1200, 'task-b': 1100, 'task-c': 1300 };

// --- helpers (same pattern as commit-ordering.test.mjs / complete-batch.test.mjs) --

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

// Same rationale as complete-batch.test.mjs: a plain exit-code check, not
// `node:test`, so the outer `node --test` run of THIS file doesn't trip
// Node's nested-test-run recursion guard and silently mark the re-run green.
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

// A task's entry (wherever read from) shows ITS OWN status/tokens/test_cmd —
// never blank and never another task's stale values.
function assertOwnValues(entry, taskId, expectedTokens, expectedTestCmd) {
  assert.strictEqual(entry.status, 'done', `${taskId}: status must be done`);
  assert.strictEqual(entry.actual_tokens, expectedTokens, `${taskId}: actual_tokens must be its own`);
  assert.strictEqual(entry.test_cmd, expectedTestCmd, `${taskId}: test_cmd must be its own`);
}

// A task's recorded commit hash is a real git object whose OWN content (at
// that hash) already shows that task's correct state — not the previous
// task's, which is exactly the ordering bug this spec fixes.
function assertCommitContent(repo, commitHash, taskId, expectedTokens, expectedTestCmd) {
  execFileSync('git', ['cat-file', '-e', `${commitHash}^{commit}`], { cwd: repo });
  const shown = git(repo, ['show', `${commitHash}:${STATE_REL}`]);
  const stateAtCommit = JSON.parse(shown);
  const entry = stateAtCommit.tasks[taskId];
  assertOwnValues(entry, taskId, expectedTokens, expectedTestCmd);
}

// AC-E2E, same scope as R1's own AC2: status/actual_tokens/test_cmd for
// every task must already be committed at HEAD once the whole plan is
// closed. `commit` itself is exempt for whichever task closed last (see
// spec.md's Nota de alcance) — it cannot be embedded in the very commit that
// produces it.
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

// Cross-contamination guard: no task's committed state ever equals another
// task's expected values (the concrete shape the original bug took — task
// N's commit showed task N-1's fields).
function assertNoCrossContamination(commitsById) {
  for (const idA of TASK_IDS) {
    for (const idB of TASK_IDS) {
      if (idA === idB) continue;
      assert.notStrictEqual(
        TOKENS[idA],
        TOKENS[idB],
        'fixture sanity: distinct tasks must have distinct expected tokens (so a swap would be detectable)',
      );
    }
  }
  // Every recorded commit hash must be distinct (one commit per task, never
  // shared/reused across tasks).
  const hashes = Object.values(commitsById);
  assert.strictEqual(new Set(hashes).size, hashes.length, 'every task must have a DIFFERENT commit hash');
}

// --- AC-E2E via cmdComplete (single-task, one invocation per task) ---------

test('AC-E2E (single-task complete): full 3-task plan closes with every commit reflecting its own task state', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-e2e-single-');
  try {
    const commitsById = {};
    let previousTaskId = null;

    for (const taskId of TASK_IDS) {
      const testCmd = writeTaskFiles(repo, taskId, `${taskId}-ref`, true);
      const result = cli(repo, [
        'complete', specDir, taskId,
        '--tokens', String(TOKENS[taskId]), '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
        '--files', `impl/${taskId}.mjs,t/${taskId}.check.mjs`,
      ]);
      assert.strictEqual(result.status, 'done', `${taskId} must close done`);
      assert.ok(result.commit, `${taskId} must have a commit hash`);
      commitsById[taskId] = result.commit;

      // The commit this task JUST produced must show ITS OWN state, not the
      // previous task's (the actual bug this spec fixes).
      assertCommitContent(repo, result.commit, taskId, TOKENS[taskId], testCmd);

      // And it must NOT show the previous task's tokens (direct proof of "not
      // the N-1 task's stale values", the concrete failure mode of the bug).
      if (previousTaskId) {
        const stateAtCommit = JSON.parse(git(repo, ['show', `${result.commit}:${STATE_REL}`]));
        assert.strictEqual(
          stateAtCommit.tasks[taskId].actual_tokens,
          TOKENS[taskId],
          `${taskId}'s own commit must not carry ${previousTaskId}'s tokens`,
        );
      }
      previousTaskId = taskId;
    }

    // After the WHOLE plan (all 3 tasks) is closed: every task's own values
    // are correct on disk, and nothing is pending except possibly the last
    // task's `commit` field.
    const finalState = stateOf(absSpecDir);
    for (const taskId of TASK_IDS) {
      assertOwnValues(finalState.tasks[taskId], taskId, TOKENS[taskId], `node t/${taskId}.check.mjs`);
    }
    assertSubstantiveFieldsCommitted(repo, absSpecDir);
    assertNoCrossContamination(commitsById);

    // One commit per task, no more, no fewer.
    const taskCommits = git(repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, String(TASK_IDS.length), 'exactly one commit per task in single-task mode');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- Same fixture, fresh tmp repo, closed via cmdCompleteBatch (1 invocation) --

test('AC-E2E (batch complete): full 3-task plan closes with every commit reflecting its own task state', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-e2e-batch-');
  try {
    const testCmds = {};
    for (const taskId of TASK_IDS) {
      testCmds[taskId] = writeTaskFiles(repo, taskId, `${taskId}-ref`, true);
    }

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify(
      TASK_IDS.map((taskId) => ({
        task_id: taskId,
        tokens: TOKENS[taskId],
        test_cmd: testCmds[taskId],
        rojo: 'fail',
        verde: 'pass',
        files: [`impl/${taskId}.mjs`, `t/${taskId}.check.mjs`],
      })),
      null,
      2,
    ));

    const result = cli(repo, ['complete', specDir, '--batch', batchFile]);
    assert.strictEqual(result.status, 'batch');
    assert.strictEqual(result.results.length, TASK_IDS.length);
    const byId = Object.fromEntries(result.results.map((r) => [r.task_id, r]));

    const commitsById = {};
    for (const taskId of TASK_IDS) {
      assert.strictEqual(byId[taskId].status, 'done', `${taskId} must close done`);
      assert.ok(byId[taskId].commit, `${taskId} must have a commit hash`);
      commitsById[taskId] = byId[taskId].commit;
      // Each task's OWN commit shows its OWN state — proven the same way as
      // the single-task mode above, on the same kind of fixture.
      assertCommitContent(repo, byId[taskId].commit, taskId, TOKENS[taskId], testCmds[taskId]);
    }

    // After the WHOLE batch closes: every task's own values are correct on
    // disk, and nothing substantive is pending.
    const finalState = stateOf(absSpecDir);
    for (const taskId of TASK_IDS) {
      assertOwnValues(finalState.tasks[taskId], taskId, TOKENS[taskId], testCmds[taskId]);
    }
    assertSubstantiveFieldsCommitted(repo, absSpecDir);
    assertNoCrossContamination(commitsById);

    // One commit per task, no more, no fewer — same invariant as the
    // single-task mode, proving both modes are consistent (R2-batch's own
    // existing invariant, reused here as a cross-check).
    const taskCommits = git(repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, String(TASK_IDS.length), 'exactly one commit per task in batch mode');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
