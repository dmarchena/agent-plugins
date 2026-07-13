// test/exec/batch-agentid-guard.test.mjs — R2 (AC4/AC5/AC6)
//
// `complete --batch` must apply R1's agentId rule (agentIdGuardReason, see
// exec-tools.mjs) to EVERY batch entry, all-or-nothing: if ANY entry is
// missing both an agent id and an acknowledgment reason, the WHOLE batch is
// refused before any entry's state is written or committed — mirroring the
// existing files-guard loop's all-or-nothing shape in cmdCompleteBatch.
//
// Fixture conventions: setupRepo/cli/writeTaskFiles/stateOf/git are copied
// verbatim from test/exec/complete-batch.test.mjs, per that file's own
// convention of duplicating this small helper block rather than importing
// across test files (see test/exec/e2e-complete-agentid-sessionid.test.mjs's
// header comment for the same convention).
//
//   R2.S1 (AC4): a batch where EVERY entry carries an agent id exits 0 and
//                each entry's state records its id.
//   R2.S2 (AC5): a batch with one entry lacking BOTH an agent id and the
//                acknowledgment field exits non-zero with a reason beginning
//                MISSING_AGENT_ID: naming that task_id, and NOTHING in the
//                batch is recorded or committed.
//   R2.S3 (AC6): a batch mixing one acknowledged entry (no_agent_id: "<reason>")
//                with agent_id-carrying entries exits 0; the acknowledged
//                entry's state records agentId: null plus an incidencia
//                containing the reason, and the rest record their own
//                agent ids.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'batch-agentid-guard-demo';

// --- fixture: 2 independent tasks (a ready batch, R4.S1) -------------------

const SPEC = `# Spec: Batch AgentId Guard Fixture

## Purpose

Minimal fixture for the executor's batch-close mode's agentId guard.

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
    plan_id: 'batch-agentid-guard-plan',
    project_name: 'Batch AgentId Guard Fixture',
    global_objective: 'Batch-close 2 parallel tasks in one complete invocation, applying the agentId guard.',
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

// --- helpers (copied verbatim from complete-batch.test.mjs) -----------------

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

// --- R2.S1 (AC4): every entry carries an agent id ---------------------------

test('R2.S1 (AC4): a batch where every entry carries an agent id exits 0 and each entry state records its id', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-batch-agentid-ac4-');
  try {
    const testCmdA = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    const testCmdB = writeTaskFiles(repo, 'task-b', 'R2.S1', true);

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        task_id: 'task-a', tokens: 1200, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs', 't/task-a.check.mjs'], agent_id: 'agent-a',
      },
      {
        task_id: 'task-b', tokens: 1100, test_cmd: testCmdB, rojo: 'fail', verde: 'pass',
        files: ['impl/task-b.mjs', 't/task-b.check.mjs'], agent_id: 'agent-b',
      },
    ], null, 2));

    const result = cli(repo, ['complete', specDir, '--batch', batchFile]);
    assert.strictEqual(result.data.status, 'batch');
    const byId = Object.fromEntries(result.data.results.map((r) => [r.task_id, r]));
    assert.strictEqual(byId['task-a'].status, 'done');
    assert.strictEqual(byId['task-b'].status, 'done');

    const state = stateOf(absSpecDir);
    assert.strictEqual(state.tasks['task-a'].agentId, 'agent-a');
    assert.strictEqual(state.tasks['task-b'].agentId, 'agent-b');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R2.S2 (AC5): one entry missing both agent id and ack reason ------------

test('R2.S2 (AC5): a batch with one entry lacking both agent id and ack reason exits non-zero and rejects the whole batch', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-batch-agentid-ac5-');
  try {
    const testCmdA = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    const testCmdB = writeTaskFiles(repo, 'task-b', 'R2.S1', true);

    const headBefore = git(repo, ['rev-parse', 'HEAD']);
    const stateBefore = stateOf(absSpecDir);

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        task_id: 'task-a', tokens: 1200, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs', 't/task-a.check.mjs'], agent_id: 'agent-a',
      },
      {
        // task-b: neither agent_id nor no_agent_id — must refuse the WHOLE batch.
        task_id: 'task-b', tokens: 1100, test_cmd: testCmdB, rojo: 'fail', verde: 'pass',
        files: ['impl/task-b.mjs', 't/task-b.check.mjs'],
      },
    ], null, 2));

    const res = cliExpectFail(repo, ['complete', specDir, '--batch', batchFile]);
    assert.notStrictEqual(res.status, 0, 'R2.S2: must exit non-zero');
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.ok, false, 'R2.S2: envelope must report ok:false');
    assert.ok(
      parsed.error.reason.startsWith('MISSING_AGENT_ID:'),
      `R2.S2: reason must begin with MISSING_AGENT_ID:, got: ${parsed.error.reason}`,
    );
    assert.ok(
      parsed.error.reason.includes('task-b'),
      `R2.S2: refusal must name the offending task_id, got: ${parsed.error.reason}`,
    );

    assert.strictEqual(
      git(repo, ['rev-parse', 'HEAD']), headBefore,
      'R2.S2: HEAD must be unchanged — not even task-a (a valid entry) may commit',
    );
    const stateAfter = stateOf(absSpecDir);
    assert.deepStrictEqual(stateAfter, stateBefore, 'R2.S2: execution_state.json must be unchanged — nothing recorded');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R2.S3 (AC6): one acknowledged entry mixed with agent_id entries -------

test('R2.S3 (AC6): a batch mixing one acknowledged entry with agent_id-carrying entries exits 0 and records each accordingly', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-batch-agentid-ac6-');
  try {
    const testCmdA = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    const testCmdB = writeTaskFiles(repo, 'task-b', 'R2.S1', true);

    const batchFile = path.join(repo, 'batch.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        // task-a: acknowledged gap, no agent_id.
        task_id: 'task-a', tokens: 1200, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs', 't/task-a.check.mjs'], no_agent_id: 'agent id unavailable for this run',
      },
      {
        task_id: 'task-b', tokens: 1100, test_cmd: testCmdB, rojo: 'fail', verde: 'pass',
        files: ['impl/task-b.mjs', 't/task-b.check.mjs'], agent_id: 'agent-b',
      },
    ], null, 2));

    const result = cli(repo, ['complete', specDir, '--batch', batchFile]);
    assert.strictEqual(result.data.status, 'batch');
    const byId = Object.fromEntries(result.data.results.map((r) => [r.task_id, r]));
    assert.strictEqual(byId['task-a'].status, 'done');
    assert.strictEqual(byId['task-b'].status, 'done');

    const state = stateOf(absSpecDir);
    assert.strictEqual(state.tasks['task-a'].agentId, null, 'R2.S3: acknowledged entry records agentId: null');
    assert.ok(
      state.tasks['task-a'].incidencia && state.tasks['task-a'].incidencia.includes('agent id unavailable for this run'),
      'R2.S3: acknowledged entry records an incidencia containing the reason',
    );
    assert.strictEqual(state.tasks['task-b'].agentId, 'agent-b', 'R2.S3: the rest still record their own agent ids');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
