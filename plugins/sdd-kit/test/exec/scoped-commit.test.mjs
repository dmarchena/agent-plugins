// test/exec/scoped-commit.test.mjs — R1 (scoped single-task commit)
//
// The single-task `complete` path used to always `git add -A` the whole
// tree before committing (git.mjs's stage() fallback), which sweeps in any
// unrelated untracked/dirty files sitting in the working tree (e.g. another
// task's WIP, or scratch files) into a commit that's only supposed to record
// ONE task. This tests that:
//   - R1.S1: an explicit --files list scopes the commit to exactly those
//     files + the plan state file, leaving unrelated untracked paths alone.
//   - R1.S2: no file list => refuse to stage/commit anything, exit non-zero
//     with the exact message.
//   - R1.S3: two disjoint single-task completions against the same tree each
//     produce a commit containing only their own named files.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'scoped-demo';

// --- fixture: 2 independent tasks (a ready batch), minimal spec -----------

const SPEC = `# Spec: Scoped Commit Fixture

## Purpose

Minimal fixture for the executor's scoped single-task commit.

## Scope

**In scope:**
- Two independent requirements, each closed via the single-task \`complete\` path.

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
    plan_id: 'scoped-demo-plan',
    project_name: 'Scoped Commit Fixture',
    global_objective: 'Close 2 independent tasks via the single-task complete path.',
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

// Runs the CLI expecting a non-zero exit; returns { status, stderr, stdout }
// instead of throwing, so the test can assert on the failure itself.
function cliExpectFail(repo, args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
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
  cli(repo, ['init', specDir]); // moves to feat/<slug>, past commitTask's main/master guard
  return { repo, specDir, absSpecDir, statePath: path.join(specDir, 'execution_state.json') };
}

// Writes a task's impl + a plain (non node:test) exit-code check — see
// complete-batch.test.mjs for why this dodges node --test's recursion guard.
function writeTaskFiles(repo, name, shouldPass) {
  fs.writeFileSync(path.join(repo, `${name}.mjs`), `export const done = ${shouldPass};\n`);
  fs.writeFileSync(
    path.join(repo, `${name}.test.mjs`),
    `import { done } from './${name}.mjs';\n`
    + `if (done !== true) { console.error('FAIL'); process.exit(1); }\n`
    + `console.log('PASS');\n`,
  );
  return `node ${name}.test.mjs`;
}

// --- R1.S1: scoped commit contains exactly the named files + state file ----

test('R1.S1: single-task complete with --files commits only those files + state, leaves unrelated untracked paths alone', () => {
  const { repo, specDir, statePath } = setupRepo('exec-scoped-s1-');
  try {
    const testCmd = writeTaskFiles(repo, 'a', true);

    // Unrelated untracked path that must NOT be swept into the commit.
    fs.mkdirSync(path.join(repo, 'scratch', 'wip'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'scratch', 'wip', 'notes.txt'), 'unrelated wip\n');

    const result = cli(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'a.mjs,a.test.mjs',
    ]);
    assert.strictEqual(result.data.status, 'done');
    assert.ok(result.data.commit);

    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).split('\n').filter(Boolean).sort();
    const expected = ['a.mjs', 'a.test.mjs', statePath.split(path.sep).join('/')].sort();
    assert.deepStrictEqual(committedFiles, expected, 'commit must contain exactly the task files + the plan state file');

    const status = git(repo, ['status', '--porcelain']);
    assert.ok(status.split('\n').some((l) => l.trim() === '?? scratch/'), 'unrelated untracked scratch/ must remain untracked');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R1.S2: no resolvable file list => refuse, no stage, no commit ---------

test('R1.S2: single-task complete with no file list refuses to commit/stage and exits non-zero with the exact message', () => {
  const { repo, specDir } = setupRepo('exec-scoped-s2-');
  try {
    const testCmd = writeTaskFiles(repo, 'a', true);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);

    const res = cliExpectFail(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
    ]);
    assert.notStrictEqual(res.status, 0, 'must exit non-zero');
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.ok, false, 'envelope must report ok:false');
    assert.ok(
      parsed.error.reason.includes('complete: refusing to commit without an explicit file list — pass the task\'s touched files'),
      `error.reason must contain the exact refusal message, got: ${parsed.error.reason}`,
    );

    const headAfter = git(repo, ['rev-parse', 'HEAD']);
    assert.strictEqual(headAfter, headBefore, 'HEAD must be unchanged — no commit created');
    const staged = git(repo, ['diff', '--cached']);
    assert.strictEqual(staged, '', 'nothing must be staged');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('R1.S2b: an empty/whitespace-only --files value is treated the same as an absent flag', () => {
  const { repo, specDir } = setupRepo('exec-scoped-s2b-');
  try {
    const testCmd = writeTaskFiles(repo, 'a', true);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);

    const res = cliExpectFail(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', '  , ,',
    ]);
    assert.notStrictEqual(res.status, 0, 'must exit non-zero');
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.ok, false, 'envelope must report ok:false');
    assert.ok(parsed.error.reason.includes('complete: refusing to commit without an explicit file list — pass the task\'s touched files'));
    assert.strictEqual(git(repo, ['rev-parse', 'HEAD']), headBefore, 'HEAD must be unchanged');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R1.S3: disjoint single-task completions never swallow each other ------

test('R1.S3: two disjoint single-task completions against the same tree each commit only their own named file', () => {
  const { repo, specDir, statePath } = setupRepo('exec-scoped-s3-');
  try {
    const testCmdA = writeTaskFiles(repo, 'a', true);
    const testCmdB = writeTaskFiles(repo, 'b', true);
    const stateFile = statePath.split(path.sep).join('/');

    const resultA = cli(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmdA, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'a.mjs,a.test.mjs',
    ]);
    assert.strictEqual(resultA.data.status, 'done');
    const filesA = git(repo, ['show', '--name-only', '--pretty=format:', resultA.data.commit]).split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(filesA, ['a.mjs', 'a.test.mjs', stateFile].sort());

    const resultB = cli(repo, [
      'complete', specDir, 'task-b',
      '--tokens', '1100', '--test-cmd', testCmdB, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'b.mjs,b.test.mjs',
    ]);
    assert.strictEqual(resultB.data.status, 'done');
    const filesB = git(repo, ['show', '--name-only', '--pretty=format:', resultB.data.commit]).split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(filesB, ['b.mjs', 'b.test.mjs', stateFile].sort());

    assert.notStrictEqual(resultA.data.commit, resultB.data.commit);
    assert.ok(!filesB.includes('a.mjs') && !filesB.includes('a.test.mjs'), "task-b's commit must not include task-a's files");
    assert.ok(!filesA.includes('b.mjs') && !filesA.includes('b.test.mjs'), "task-a's commit must not include task-b's files");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
