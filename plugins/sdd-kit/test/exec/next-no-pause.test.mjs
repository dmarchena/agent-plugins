// test/exec/next-no-pause.test.mjs — T2-drop-budget-pause (R2.S1 / AC5)
//
// The `next <specDir>` CLI subcommand used to check the token budget BEFORE
// computing the next runnable batch, and would halt an otherwise-healthy DAG
// with a `{ status: 'paused', reason: 'budget', ... }` response once real
// tokens exceeded 2x the estimate for already-run tasks. That pause branch is
// removed: `next` must always compute the ready batch purely from DAG state
// (done/blocked/skipped), regardless of how far over budget the run is.
//
// Fixture mirrors test/exec/e2e.test.mjs's conventions: a real git repo in a
// temp dir, spec.md + execution_plan.json on disk, exec-tools.mjs driven as a
// subprocess via execFileSync.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

// --- shared fixture: spec with 3 requirements (R1, R2 independent; R3 depends on both) ---

const SPEC = `# Spec: No-Pause Fixture

## Purpose

Minimal fixture for the exec phase's next-subcommand budget-pause removal.

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

function makePlan(planId) {
  return {
    plan_id: planId,
    project_name: 'No-Pause Fixture',
    global_objective: 'Verify next never pauses on budget.',
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
}

// --- helpers -------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args) {
  const stdout = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(stdout);
}

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

function runTask(repo, specDir, taskId, ref, tokens) {
  const testCmd = simulateExecutor(repo, taskId, ref);
  return cli(repo, [
    'complete', specDir, taskId,
    '--tokens', String(tokens),
    '--test-cmd', testCmd,
    '--rojo', 'fail',
    '--verde', 'pass',
    '--files', `impl/${taskId}.mjs,t/${taskId}.test.mjs`,
  ]);
}

function makeRepo(slug, planId) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-next-no-pause-'));
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(makePlan(planId), null, 2));

  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture']);

  return { repo, specDir, absSpecDir };
}

// --- tests -----------------------------------------------------------------

test('R2.S1: next never pauses on budget, even when real tokens already exceed 2x estimated for done tasks', () => {
  const { repo, specDir, absSpecDir } = makeRepo('no-pause-r2s1', 'no-pause-r2s1-plan');
  try {
    cli(repo, ['init', specDir]);

    // task-a and task-b are done, healthy, but consumed far more tokens than
    // estimated: real (3000+3000=6000) > 2x estimated (2*(1000+1000)=4000) —
    // exceeds() on this state would report exceeded: true.
    const doneA = runTask(repo, specDir, 'task-a', 'R1.S1', 3000);
    const doneB = runTask(repo, specDir, 'task-b', 'R2.S1', 3000);
    assert.strictEqual(doneA.status, 'done');
    assert.strictEqual(doneB.status, 'done');

    // task-c remains pending with both its dependencies satisfied: it must
    // be the next runnable batch, never a budget pause.
    const next = cli(repo, ['next', specDir]);
    assert.strictEqual(next.status, 'run', 'next must return a ready batch, never "paused"');
    assert.notStrictEqual(next.status, 'paused');
    assert.deepStrictEqual(next.batch, ['task-c']);

    const state = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
    assert.strictEqual(state.pause, null, 'no pause entry must be written to execution_state.json');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('AC5: removing the budget pause does not resurrect an already-blocked/skipped task into a runnable batch', () => {
  const { repo, specDir, absSpecDir } = makeRepo('no-pause-ac5', 'no-pause-ac5-plan');
  try {
    cli(repo, ['init', specDir]);

    // task-a has already failed verification twice and been blocked (via the
    // real `block` subcommand, same as the orchestrator would call after
    // exhausting its retry). task-c depends on task-a (and task-b), so it
    // cascades to 'skipped'. task-b is independent and stays pending.
    const blockResult = cli(repo, ['block', specDir, 'task-a']);
    assert.strictEqual(blockResult.status, 'blocked');
    assert.deepStrictEqual(blockResult.skipped.sort(), ['task-c']);

    const next = cli(repo, ['next', specDir]);
    assert.strictEqual(next.status, 'run');
    assert.deepStrictEqual(next.batch, ['task-b'], 'only the unaffected independent task is runnable');
    assert.ok(!next.batch.includes('task-a'), 'blocked task must stay excluded from the batch');
    assert.ok(!next.batch.includes('task-c'), 'skipped dependent must stay excluded from the batch');

    const state = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
    assert.strictEqual(state.tasks['task-a'].status, 'blocked');
    assert.strictEqual(state.tasks['task-c'].status, 'skipped');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
