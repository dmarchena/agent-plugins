// test/exec/complete-batch-files-guard.test.mjs — batch mirror of the
// issue-#9 explicit-file-list guard (see verifier-commit.test.mjs).
//
// `cmdComplete` (single-task path) refuses to commit a non-verifier task
// with no --files list, so it can never fall through to git.mjs's
// `git add -A` whole-tree fallback. `cmdCompleteBatch` had no equivalent
// guard: a batch entry missing `files` was passed through as `files: null`
// (not `[]`), and git.mjs#pathspecList treats `null` as "no restriction" —
// i.e. the very `git add -A` sweep the single-task path exists to prevent.
// Found while wiring `complete --batch` into plan-executor's documented
// workflow (issue #15 follow-up).
//
//   R1.S1: a batch entry for a non-verifier task with no `files` refuses
//          the WHOLE batch up front — no entry commits, not even a sibling
//          entry that did carry a valid `files` list (same "validate
//          everything before touching git" shape as the unknown-task_id
//          check already in cmdCompleteBatch).
//   R1.S2: a batch entry for a `verifier` task with no `files` still closes
//          done, staging only the state file — never `git add -A`.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

const SPEC = `# Spec: Batch Files Guard Fixture

## Purpose

Minimal fixture for the batch-close file-list guard.

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

The system SHALL verify part B.

#### R2.S1 — Happy path
- GIVEN nothing
- WHEN task B runs
- THEN part B is verified

## Technical Requirements

- **Stack / framework:** N/A (test fixture).
- **Integrations:** N/A
- **Performance:** N/A
- **Security / privacy:** N/A
- **Data / storage:** N/A
- **Additional constraints:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — part A is done
- [ ] AC2 → R2.S1 [auto] — part B is verified

## Assumptions & Open Questions

- None.
`;

function makePlan() {
  return {
    plan_id: 'batch-files-guard-plan',
    project_name: 'Batch Files Guard Fixture',
    global_objective: 'Batch-close a code_writer task and a verifier task in one complete --batch invocation.',
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
        task_id: 'task-verify',
        source_ids: ['R2.S1'],
        dependencies: [],
        agent_type: 'verifier',
        subagent: 'general-purpose',
        model: 'haiku',
        justification: 'Re-runs the suite to confirm part B, no code of its own.',
        instructions: 'Confirm part B by re-running its suite, referencing scenario R2.S1 from the spec.',
        expected_output_schema: 'Verification report for R2.S1',
        satisfies_acs: ['AC2'],
        estimated_tokens: 1000,
        actual_tokens: null,
        deviation: null,
        test_contract: null,
      },
    ],
    coverage: {
      requirements: { R1: ['task-a'], R2: ['task-verify'] },
      acs: { AC1: ['task-a'], AC2: ['task-verify'] },
    },
  };
}

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args) {
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

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
  const specDir = path.join('docs', 'specs', 'batch-files-guard');
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
  return {
    repo, specDir, absSpecDir, statePath: path.join(specDir, 'execution_state.json').split(path.sep).join('/'),
  };
}

function writeCheckScript(repo, name, shouldPass) {
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 't', `${name}.check.mjs`),
    `process.exit(${shouldPass ? 0 : 1});\n`,
  );
  return `node t/${name}.check.mjs`;
}

// --- R1.S1: non-verifier entry with no `files` refuses the WHOLE batch -----

test('R1.S1: a batch entry for a non-verifier task with no files refuses the whole batch, no commits at all', () => {
  const { repo, specDir } = setupRepo('exec-batch-guard-s1-');
  try {
    const testCmdA = writeCheckScript(repo, 'task-a', true);
    const testCmdVerify = writeCheckScript(repo, 'task-verify', true);
    const headBefore = git(repo, ['rev-parse', 'HEAD']);

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      // task-a: code_writer, NO files list — must refuse the whole batch.
      { task_id: 'task-a', tokens: 1000, test_cmd: testCmdA, rojo: 'fail', verde: 'pass' },
      { task_id: 'task-verify', tokens: 800, test_cmd: testCmdVerify, rojo: 'pass', verde: 'pass' },
    ], null, 2));

    const res = cliExpectFail(repo, ['complete', specDir, '--batch', batchFile]);

    assert.notStrictEqual(res.status, 0, 'R1.S1: must exit non-zero');
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.ok, false, 'R1.S1: envelope must report ok:false');
    assert.ok(
      parsed.error.reason.includes('task-a'),
      `R1.S1: refusal must name the offending task_id, got: ${parsed.error.reason}`,
    );
    assert.strictEqual(
      git(repo, ['rev-parse', 'HEAD']), headBefore,
      'R1.S1: HEAD must be unchanged — not even task-verify (a valid entry) may commit',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R1.S2: verifier entry with no `files` still closes done, state-only ---

test('R1.S2: a batch entry for a verifier task with no files closes done, staging only the state file (never git add -A)', () => {
  const { repo, specDir, absSpecDir, statePath } = setupRepo('exec-batch-guard-s2-');
  try {
    const testCmdA = writeCheckScript(repo, 'task-a', true);
    const testCmdVerify = writeCheckScript(repo, 'task-verify', true);

    // Unrelated dirty tree that must NOT be swept into task-verify's commit.
    fs.writeFileSync(path.join(repo, 'unrelated.mjs'), 'export const x = 1;\n');
    fs.appendFileSync(path.join(absSpecDir, 'spec.md'), '\n<!-- unrelated edit -->\n');

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        task_id: 'task-a', tokens: 1000, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs'],
      },
      // task-verify: verifier, no `files` key at all — must NOT hit the guard.
      { task_id: 'task-verify', tokens: 800, test_cmd: testCmdVerify, rojo: 'pass', verde: 'pass' },
    ], null, 2));
    fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'impl', 'task-a.mjs'), 'export const done = true;\n');

    const result = cli(repo, ['complete', specDir, '--batch', batchFile]);
    assert.strictEqual(result.data.status, 'batch');
    const byId = Object.fromEntries(result.data.results.map((r) => [r.task_id, r]));
    assert.strictEqual(byId['task-verify'].status, 'done', 'R1.S2: verifier task must still close done');
    assert.ok(byId['task-verify'].commit, 'R1.S2: a commit hash must be recorded');

    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', byId['task-verify'].commit])
      .split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(committedFiles, [statePath], 'R1.S2: task-verify\'s commit must change only the state file');

    const status = git(repo, ['status', '--porcelain']);
    assert.ok(status.split('\n').some((l) => l.trim() === '?? unrelated.mjs'), 'R1.S2: unrelated.mjs must remain untracked');
    assert.ok(
      status.split('\n').some((l) => l.includes('spec.md')),
      'R1.S2: the unrelated spec.md edit must remain uncommitted',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
