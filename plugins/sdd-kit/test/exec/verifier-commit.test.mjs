// test/exec/verifier-commit.test.mjs — T3-state-only-commit (R3.S1/R3.S2)
//
// A `verifier` task's `complete` closes it `done` by re-running its suite
// (see verifier-complete.test.mjs), but it never writes any code of its own —
// there is nothing to name in a `--files` list. Before this fix, closing such
// a task either (a) got refused by the issue-#9 explicit-file-list guard (no
// --files => die), or (b) if that guard were ever bypassed with an empty
// list, would fall through to git.mjs's `git add -A` and sweep in whatever
// else happens to be dirty in the tree. Neither is acceptable: a verifier
// task's only legitimate change is its own done-flip in execution_state.json.
//
//   R3.S1: verifier task done, unrelated changes present in the tree =>
//          exactly one commit, changed-path set is only the state file,
//          message references the task_id, unrelated changes untouched.
//   R3.S2: complete on a verifier task with no --files list at all does not
//          hit the issue-#9 refusal, and stages no code files it wasn't
//          given.
//
// A control test also checks that ordinary (non-verifier) tasks still hit
// the issue-#9 guard unchanged — this fix must not weaken it.

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

const SPEC = `# Spec: Verifier Commit Fixture

## Purpose

Minimal fixture for a single task closed via the verifier state-only commit path.

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
    project_name: 'Verifier Commit Fixture',
    global_objective: 'Single task plan exercising the verifier state-only commit.',
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
        test_contract: agentType === 'verifier' ? null : [{ ref: 'R1.S1', assertion: 'Part A is done and its test passes' }],
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

// Runs the CLI expecting a non-zero exit; returns { status, stdout, stderr }
// instead of throwing, so a test can assert on the failure itself.
function cliExpectFail(repo, args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
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
  return {
    repo, specDir, absSpecDir, statePath: path.join(specDir, 'execution_state.json').split(path.sep).join('/'),
  };
}

// Writes a plain (non `node --test`) exit-code check script so the
// deterministic re-run's own exit code is what's under test, not node
// --test's nested-run recursion guard (see complete-batch.test.mjs).
function writeCheckScript(repo, name, shouldPass) {
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 't', `${name}.check.mjs`),
    `process.exit(${shouldPass ? 0 : 1});\n`,
  );
  return `node t/${name}.check.mjs`;
}

// --- R3.S1: verifier done, unrelated changes present => commit is state-only --

test('R3.S1: verifier task complete with unrelated dirty tree produces one commit whose changed-path set is only the state file', () => {
  const {
    repo, specDir, absSpecDir, statePath,
  } = setupRepo('exec-verifier-commit-s1-', 'verifier', 'task-verify');
  try {
    const testCmd = writeCheckScript(repo, 'task-verify', true);

    // Unrelated untracked path that must NOT be swept into the commit.
    fs.mkdirSync(path.join(repo, 'scratch', 'wip'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'scratch', 'wip', 'notes.txt'), 'unrelated wip\n');
    // Unrelated modification to an already-tracked file that must also stay
    // out of the commit and remain dirty afterward.
    fs.appendFileSync(path.join(absSpecDir, 'spec.md'), '\n<!-- unrelated edit -->\n');

    const headBefore = git(repo, ['rev-parse', 'HEAD']);

    const result = cli(repo, [
      'complete', specDir, 'task-verify',
      '--tokens', '500', '--test-cmd', testCmd, '--rojo', 'pass', '--verde', 'pass',
      '--agent-id', 'agent-fixture',
    ]);

    assert.strictEqual(result.data.status, 'done', 'R3.S1: a passing verifier re-run must close done');
    assert.ok(result.data.commit, 'R3.S1: a commit hash must be recorded');

    const newCommitCount = git(repo, ['rev-list', '--count', `${headBefore}..HEAD`]);
    assert.strictEqual(newCommitCount, '1', 'R3.S1: exactly one commit must be created');

    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(committedFiles, [statePath], 'R3.S1: the commit must change only the executor state file');

    const msg = git(repo, ['log', '-1', '--pretty=%s']);
    assert.ok(msg.includes('task-verify'), `R3.S1: commit message must reference the task_id, got: ${msg}`);

    const status = git(repo, ['status', '--porcelain']);
    assert.ok(status.split('\n').some((l) => l.trim() === '?? scratch/'), 'R3.S1: unrelated untracked scratch/ must remain untracked');
    assert.ok(
      status.split('\n').some((l) => l.includes('spec.md')),
      'R3.S1: the unrelated spec.md modification must remain uncommitted',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R3.S2: no --files at all => no issue-#9 refusal, no code files staged --

test('R3.S2: complete on a verifier task with no --files list does not hit the issue-#9 refusal and stages no code files it was not given', () => {
  const { repo, specDir, statePath } = setupRepo('exec-verifier-commit-s2-', 'verifier', 'task-verify');
  try {
    const testCmd = writeCheckScript(repo, 'task-verify', true);

    // A stray code file sitting in the tree, never named to `complete` —
    // must not end up committed.
    fs.writeFileSync(path.join(repo, 'unrelated.mjs'), 'export const x = 1;\n');

    let result;
    try {
      result = cli(repo, [
        'complete', specDir, 'task-verify',
        '--tokens', '500', '--test-cmd', testCmd, '--rojo', 'pass', '--verde', 'pass',
        '--agent-id', 'agent-fixture',
      ]);
    } catch (e) {
      assert.fail(`R3.S2: complete must not abort without --files for a verifier task; stderr: ${e.stderr}`);
    }

    assert.strictEqual(result.data.status, 'done', 'R3.S2: the verifier task must still close done');

    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(committedFiles, [statePath], 'R3.S2: no code file must be staged/committed when none was given');

    const status = git(repo, ['status', '--porcelain']);
    assert.ok(status.split('\n').some((l) => l.trim() === '?? unrelated.mjs'), 'R3.S2: the untouched stray file must remain untracked');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- control: the issue-#9 guard must stay intact for ordinary tasks -------

test('control: complete on a non-verifier (code_writer) task with no --files still refuses (guard not weakened)', () => {
  const { repo, specDir } = setupRepo('exec-verifier-commit-ctrl-', 'code_writer', 'task-code');
  try {
    const testCmd = writeCheckScript(repo, 'task-code', true);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);

    const res = cliExpectFail(repo, [
      'complete', specDir, 'task-code',
      '--tokens', '500', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--agent-id', 'agent-fixture',
    ]);

    assert.notStrictEqual(res.status, 0, 'control: must exit non-zero');
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.ok, false, 'control: envelope must report ok:false');
    assert.ok(
      parsed.error.reason.includes('complete: refusing to commit without an explicit file list — pass the task\'s touched files'),
      `control: error.reason must contain the exact refusal message, got: ${parsed.error.reason}`,
    );
    assert.strictEqual(git(repo, ['rev-parse', 'HEAD']), headBefore, 'control: HEAD must be unchanged — no commit created');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
