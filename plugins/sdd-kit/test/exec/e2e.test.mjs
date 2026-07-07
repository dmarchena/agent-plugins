// test/exec/e2e.test.mjs — T8-e2e (R-E2E / R-E2E.S1 / AC-E2E)
//
// End-to-end integration walkthrough of the exec phase. The skill delegates the
// TDD cycle to LLM subagents (not reproducible in a test), so here the
// executor is STUBBED: for each task in the fixture a trivial passing test and
// implementation are written, and the exec-tools.mjs CLI is driven through the
// same sequence prescribed by SKILL.md (init -> next -> complete... -> report).
// It verifies the real glue: DAG batches (2 in parallel, 1 afterwards), one
// commit per task on the feat/<slug> branch, state with all 3 done and their
// consumption filled in, a final green re-run, and a report with actual vs
// estimated tokens and covered ACs.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'e2e-demo';

// --- fixture: spec with 3 requirements (R1, R2 independent; R3 depends on both) ---

const SPEC = `# Spec: E2E Fixture

## Purpose

Minimal fixture for the exec phase's integration walkthrough.

## Scope

**In scope:**
- Three requirements: two independent and one dependent.

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

### R3 — Dependent requirement

Depende de: R1, R2

The system SHALL deliver part C, which combines A and B.

#### R3.S1 — Happy path
- GIVEN A and B are done
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

const PLAN = {
  plan_id: 'e2e-demo-plan',
  project_name: 'E2E Fixture',
  global_objective: 'Integration walkthrough of the exec phase with 3 tasks.',
  source_spec: 'spec.md',
  confidence: 'low',
  estimated_tokens_total: 3000,
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
    {
      task_id: 'task-c',
      source_ids: ['R3.S1'],
      dependencies: ['task-a', 'task-b'],
      agent_type: 'code_writer',
      subagent: 'general-purpose',
      model: 'sonnet',
      justification: 'Combines the outputs of task-a and task-b; depends on both.',
      instructions: 'Implement part C, referencing R3.S1; combines the outputs of task-a and task-b.',
      expected_output_schema: 'Part C implemented and its test passing',
      satisfies_acs: ['AC3'],
      estimated_tokens: 1000,
      actual_tokens: null,
      deviation: null,
      test_contract: [
        { ref: 'R3.S1', assertion: 'Part C is done and its test passes' },
      ],
    },
  ],
  coverage: {
    requirements: { R1: ['task-a'], R2: ['task-b'], R3: ['task-c'] },
    acs: { AC1: ['task-a'], AC2: ['task-b'], AC3: ['task-c'] },
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

// Runs a task the way the skill would: executor stub + complete with correct
// red->green evidence (--rojo fail = the test fails before implementing).
function runTask(repo, specDir, taskId, ref) {
  const testCmd = simulateExecutor(repo, taskId, ref);
  return cli(repo, [
    'complete', specDir, taskId,
    '--tokens', '1200',
    '--test-cmd', testCmd,
    '--rojo', 'fail',
    '--verde', 'pass',
    '--files', `impl/${taskId}.mjs,t/${taskId}.test.mjs`,
  ]);
}

// --- test ---------------------------------------------------------------------

test('AC-E2E: integration walkthrough of 3 tasks (2 parallel + 1 dependent)', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-e2e-'));
  try {
    // Fixture under docs/specs/<slug>/ and a git repo on the main branch.
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
    const mainHead = git(repo, ['rev-parse', 'HEAD']);

    // 1. init: validates the plan, creates branch + state, first batch = the 2 independent tasks.
    const init = cli(repo, ['init', specDir]);
    assert.strictEqual(init.ok, true, 'init must validate the plan');
    assert.strictEqual(init.branch, `feat/${SLUG}`);
    assert.strictEqual(init.branch_created, true);
    assert.strictEqual(init.total_tasks, 3);
    assert.deepStrictEqual([...init.first_batch].sort(), ['task-a', 'task-b'],
      'the first batch is the 2 independent tasks (2 in parallel)');

    // 2. next: confirms the runnable batch.
    const batch1 = cli(repo, ['next', specDir]);
    assert.strictEqual(batch1.status, 'run');
    assert.deepStrictEqual([...batch1.batch].sort(), ['task-a', 'task-b']);

    // 3. Runs the 2 independent tasks; each complete verifies and commits.
    const doneA = runTask(repo, specDir, 'task-a', 'R1.S1');
    const doneB = runTask(repo, specDir, 'task-b', 'R2.S1');
    for (const [d, id] of [[doneA, 'task-a'], [doneB, 'task-b']]) {
      assert.strictEqual(d.status, 'done', `${id} must end up done`);
      assert.ok(d.commit, `${id} must have a commit`);
      assert.strictEqual(d.deviation, 200, `${id} deviation = 1200 - 1000`);
    }

    // 4. next: now the dependent task enters the batch (1 after the 2).
    const batch2 = cli(repo, ['next', specDir]);
    assert.strictEqual(batch2.status, 'run');
    assert.deepStrictEqual(batch2.batch, ['task-c'],
      'task-c is only runnable once both its dependencies are completed');

    // 5. Runs the dependent task.
    const doneC = runTask(repo, specDir, 'task-c', 'R3.S1');
    assert.strictEqual(doneC.status, 'done');
    assert.ok(doneC.commit);

    // 6. next: no tasks left -> complete.
    const end = cli(repo, ['next', specDir]);
    assert.strictEqual(end.status, 'complete');
    assert.strictEqual(end.counts.done, 3);

    // 7. feat/<slug> branch with exactly 3 task commits; main untouched.
    assert.strictEqual(git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']), `feat/${SLUG}`);
    const taskCommits = git(repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, '3', 'exactly 3 task commits on top of main');
    assert.strictEqual(git(repo, ['rev-parse', 'main']), mainHead, 'main receives no commits');
    // Each task commit contains its test + its implementation.
    for (const id of ['task-a', 'task-b', 'task-c']) {
      const files = git(repo, ['log', '--all', '--pretty=format:', '--name-only',
        '--diff-filter=A', '--', `t/${id}.test.mjs`, `impl/${id}.mjs`]);
      assert.ok(files.includes(`t/${id}.test.mjs`), `${id}: test committed`);
      assert.ok(files.includes(`impl/${id}.mjs`), `${id}: impl committed`);
    }

    // 8. State: 3 done with consumption filled in; plan byte-identical to the original.
    const state = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
    for (const id of ['task-a', 'task-b', 'task-c']) {
      assert.strictEqual(state.tasks[id].status, 'done');
      assert.strictEqual(state.tasks[id].actual_tokens, 1200);
      assert.strictEqual(state.tasks[id].deviation, 200);
      assert.ok(state.tasks[id].test_cmd, `${id}: test_cmd recorded`);
    }
    const planOnDisk = fs.readFileSync(path.join(absSpecDir, 'execution_plan.json'), 'utf8');
    assert.strictEqual(planOnDisk, JSON.stringify(PLAN, null, 2), 'execution_plan.json is immutable');

    // 9. Final re-run: all tests of the done tasks are still green.
    for (const id of ['task-a', 'task-b', 'task-c']) {
      assert.doesNotThrow(
        () => execFileSync('node', ['--test', `t/${id}.test.mjs`], { cwd: repo, stdio: 'pipe' }),
        `${id}: final re-run must come out green`,
      );
    }

    // 10. Final report: actual vs estimated (total and per task) and covered ACs.
    const report = cli(repo, ['report', specDir]);
    assert.strictEqual(report.status, 'report');
    assert.strictEqual(report.branch, `feat/${SLUG}`);
    assert.strictEqual(report.counts.done, 3);
    assert.strictEqual(report.counts.blocked, 0);
    assert.strictEqual(report.counts.skipped, 0);
    assert.strictEqual(report.tokens.real, 3600); // 3 × 1200
    assert.strictEqual(report.tokens.estimated, 3000); // 3 × 1000
    assert.strictEqual(report.per_task.length, 3);
    for (const pt of report.per_task) {
      assert.strictEqual(pt.actual_tokens, 1200);
      assert.strictEqual(pt.deviation, 200);
    }
    assert.deepStrictEqual(report.acs_satisfechos, ['AC1', 'AC2', 'AC3']);
    assert.strictEqual(report.pause, null, 'no budget pause');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
