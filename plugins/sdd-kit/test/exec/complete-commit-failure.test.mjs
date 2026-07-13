// test/exec/complete-commit-failure.test.mjs
//
// `complete`'s underlying commitTask (git.mjs) now throws instead of
// silently no-op-ing when a --files pathspec can't be staged (see
// test/exec/git.test.mjs's R-git-silent-failure case) — e.g. a rename's
// stale old path, already fully staged by `git mv` and no longer present
// under either the working tree or the index. This test pins the CLI-level
// behavior on top of that fix: `complete` must not report `done` with a
// bogus commit hash when the underlying git commit could not happen, and
// the task must remain retryable (status stays 'pending', matching the
// existing rerun-failed/not-green not-done branches) rather than getting
// stuck 'done' with commit: null.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'commit-failure-demo';

const SPEC = `# Spec: Commit Failure Fixture

## Purpose

Minimal fixture proving \`complete\` degrades gracefully instead of reporting
a false 'done' when the underlying git commit fails.

## Scope

**In scope:**
- One task closed with a --files list containing an unstageable path.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — Single requirement

Depende de: —

The system SHALL deliver part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN part A is done

## Technical Requirements

- **Stack / framework:** N/A (test fixture).
- **Integrations:** N/A
- **Performance:** N/A
- **Security / privacy:** N/A
- **Data / storage:** N/A
- **Additional constraints:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — part A is done

## Assumptions & Open Questions

- None.
`;

function makePlan() {
  return {
    plan_id: 'commit-failure-plan',
    project_name: 'Commit Failure Fixture',
    global_objective: 'Prove complete does not report a false done on a git commit failure.',
    source_spec: 'spec.md',
    confidence: 'low',
    estimated_tokens_total: 1000,
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
    ],
    coverage: {
      requirements: { R1: ['task-a'] },
      acs: { AC1: ['task-a'] },
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

function writeTaskFiles(repo, taskId) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), 'export const done = true;\n');
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.check.mjs`),
    `import { done } from '../impl/${taskId}.mjs';\n`
    + `if (done !== true) { console.error('FAIL'); process.exit(1); }\n`
    + `console.log('PASS: ${taskId}');\n`,
  );
  return `node t/${taskId}.check.mjs`;
}

function stateOf(absSpecDir) {
  return JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
}

test(
  'R-git-silent-failure (CLI): complete does not report done when --files names an unstageable path',
  () => {
    const { repo, specDir, absSpecDir } = setupRepo('exec-commit-failure-');

    try {
      const testCmd = writeTaskFiles(repo, 'task-a');
      const headBefore = git(repo, ['rev-parse', 'HEAD']);

      const result = cli(repo, [
        'complete', specDir, 'task-a',
        '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
        '--files', 'impl/task-a.mjs,t/task-a.check.mjs,does-not-exist.mjs',
        '--no-agent-id', 'fixture: no subagent involved',
      ]);

      assert.notStrictEqual(result.data.status, 'done', 'must not report done when the commit could not happen');
      assert.strictEqual(result.data.status, 'not-done');

      const headAfter = git(repo, ['rev-parse', 'HEAD']);
      assert.strictEqual(headAfter, headBefore, 'HEAD must not move when the commit failed');

      const state = stateOf(absSpecDir);
      const entry = state.tasks['task-a'];
      assert.notStrictEqual(entry.status, 'done', 'state must not be stuck done with no real commit');
      assert.strictEqual(entry.commit, null);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  },
);
