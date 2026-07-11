// test/exec/e2e-scoped-close.test.mjs — T8-e2e (R-E2E.S1 / AC-E2E)
//
// Verifies that the single-task `complete` path scopes its commit to an explicit
// --files list. When completing a task with touched files explicitly listed,
// the commit includes ONLY those files + the plan state file. Unrelated untracked
// files in the working tree are NOT swept into the commit.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'scoped-close-demo';

// --- fixture: spec with 1 simple requirement ---

const SPEC = `# Spec: Scoped Close Fixture

## Purpose

Verify that task completion scopes its commit to explicitly-listed files.

## Scope

**In scope:**
- One requirement with a clear AC.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — Simple requirement

Depende de: —

The system SHALL implement feature X.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN feature X is done

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — feature X is done

## Assumptions & Open Questions

- None.
`;

const PLAN = {
  plan_id: 'scoped-close-demo-plan',
  project_name: 'Scoped Close Fixture',
  global_objective: 'Verify scoped commit for a single task.',
  source_spec: 'spec.md',
  confidence: 'low',
  estimated_tokens_total: 1000,
  tasks: [
    {
      task_id: 'task-x',
      source_ids: ['R1.S1'],
      dependencies: [],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Bounded delivery of feature X with a clear AC.',
      instructions: 'Implement feature X, referencing scenario R1.S1 from the spec.',
      expected_output_schema: 'Feature X implemented and its test passing',
      satisfies_acs: ['AC1'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R1.S1', assertion: 'Feature X is done and its test passes' },
      ],
    },
  ],
  coverage: {
    requirements: { R1: ['task-x'] },
    acs: { AC1: ['task-x'] },
  },
};

// --- helpers ------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

// Invokes the CLI and returns the parsed JSON from stdout.
function cli(repo, args) {
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

// Executor stub: writes a passing impl + test and returns the re-run command.
function simulateExecutor(repo, taskId, ref) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = true;\n`);
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.test.mjs`),
    `import { test } from 'node:test';\n`
    + `import assert from 'node:assert';\n`
    + `import { done } from '../impl/${taskId}.mjs';\n`
    + `test('${taskId} satisfies ${ref}', () => { assert.strictEqual(done, true); });\n`,
  );
  return `node --test t/${taskId}.test.mjs`;
}

// --- test (R-E2E.S1 / AC-E2E) -------------------------------------------------

test('AC-E2E: scoped commit with explicit --files, unrelated file not swept', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-scoped-close-'));
  try {
    // Fixture under docs/specs/<slug>/ and a git repo on a feat/<slug> branch.
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

    // 1. init: creates branch + state.
    const init = cli(repo, ['init', specDir]);
    assert.strictEqual(init.ok, true, 'init must validate the plan');
    assert.strictEqual(init.data.branch, `feat/${SLUG}`);

    // 2. Simulate executor: create task's touched files (impl & test).
    const testCmd = simulateExecutor(repo, 'task-x', 'R1.S1');

    // 3. Create an UNRELATED untracked file in the working tree.
    fs.mkdirSync(path.join(repo, 'scratch'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'scratch', 'unrelated.txt'), 'This file is not part of the task.\n');

    // 4. Complete the task with explicit --files list (scoped commit).
    const done = cli(repo, [
      'complete', specDir, 'task-x',
      '--tokens', '1200',
      '--test-cmd', testCmd,
      '--rojo', 'fail',
      '--verde', 'pass',
      '--files', 'impl/task-x.mjs,t/task-x.test.mjs',
    ]);
    assert.strictEqual(done.data.status, 'done', 'task must be completed');
    assert.ok(done.data.commit, 'task must have a commit');

    // 5. Verify the commit contains ONLY the task's touched files + state file.
    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD']).split('\n').filter(Boolean);
    assert.ok(
      committedFiles.includes('impl/task-x.mjs'),
      'commit must contain the implementation file',
    );
    assert.ok(
      committedFiles.includes('t/task-x.test.mjs'),
      'commit must contain the test file',
    );
    assert.ok(
      committedFiles.includes(`${specDir}/execution_state.json`),
      'commit must contain the state file',
    );
    assert.strictEqual(
      committedFiles.includes('scratch/unrelated.txt'),
      false,
      'commit must NOT contain the unrelated file',
    );

    // 6. Verify the unrelated file is still untracked (not swept into the commit).
    const status = git(repo, ['status', '--porcelain']).split('\n').filter(Boolean);
    // Git status shows untracked directories/files at the directory level, so look for 'scratch/'
    const unrelatedStatus = status.find(line => line.includes('scratch'));
    assert.ok(unrelatedStatus, 'unrelated file must still be untracked');
    assert.ok(
      unrelatedStatus.startsWith('??'),
      'unrelated file must be shown as untracked (??)',
    );
    // Additionally, verify the file itself exists and is not tracked.
    assert.ok(
      fs.existsSync(path.join(repo, 'scratch', 'unrelated.txt')),
      'unrelated file must exist in working tree',
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
