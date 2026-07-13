// test/exec/agentid-persist.test.mjs — R1.S1/R1.S2/R1.S3 (AC1/AC2/AC3)
//
// The exec stage must persist the executing subagent's agentId/sessionId per
// task in execution_state.json. Per docs/specs/agentid-capture/spec.md's R1,
// the single-task `complete` command now REFUSES to record/commit a
// delegated task closed with no captured agent id unless the gap is
// explicitly acknowledged via `--no-agent-id "<reason>"` (superseding the old
// unconditional graceful-degrade-everywhere behavior). This file covers:
//   - R1.S1/AC1: an agent id supplied -> exit 0, state entry records it.
//   - R1.S2/AC2: neither an id nor the ack flag -> refused, nothing written.
//   - R1.S3/AC3: the ack flag with a reason -> graceful degrade, agentId
//     null, incidencia containing the reason verbatim.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SCHEMA_PATH = path.resolve(
  __dirname, '..', '..', 'skills', 'plan-executor', 'assets', 'execution_state.schema.json',
);
const SLUG = 'agentid-demo';

const SPEC = `# Spec: AgentId Fixture

## Purpose

Minimal fixture for persisting agentId/sessionId per task.

## Scope

**In scope:**
- One task closed with and without an agentId join.

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
    plan_id: 'agentid-demo-plan',
    project_name: 'AgentId Fixture',
    global_objective: 'Persist agentId/sessionId per task on completion.',
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

// --- helpers ----------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args, envOverrides) {
  let env = process.env;
  if (envOverrides) {
    env = { ...process.env, ...envOverrides };
    for (const key of Object.keys(envOverrides)) {
      if (envOverrides[key] === undefined) delete env[key];
    }
  }
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8', env });
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

function writeTaskFiles(repo, taskId, ref, shouldPass) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = ${shouldPass};\n`);
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.check.mjs`),
    `import { done } from '../impl/${taskId}.mjs';\n`
    + `if (done !== true) { console.error('FAIL'); process.exit(1); }\n`
    + `console.log('PASS: ${taskId} (${ref})');\n`,
  );
  return `node t/${taskId}.check.mjs`;
}

function stateOf(absSpecDir) {
  return JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
}

// Runs the CLI expecting a non-zero exit; returns { status, stdout, stderr }
// instead of throwing, so the test can assert on the failure itself (mirrors
// test/exec/scoped-commit.test.mjs's cliExpectFail).
function cliExpectFail(repo, args, envOverrides) {
  let env = process.env;
  if (envOverrides) {
    env = { ...process.env, ...envOverrides };
    for (const key of Object.keys(envOverrides)) {
      if (envOverrides[key] === undefined) delete env[key];
    }
  }
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8', env });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

// --- R1.S1: real agentId/sessionId join is persisted, schema-valid --------

test('R1.S1: completing with --agent-id/--session-id persists both in the task state entry', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-agentid-ok-');
  try {
    const testCmd = writeTaskFiles(repo, 'task-a', 'R1.S1', true);

    // The real join point: the subagent's own transcript lives at
    // SPECDIR/subagents/agent-<id>.jsonl once it has run.
    const agentId = 'agent-abc123';
    const sessionId = 'session-def456';
    const subagentsDir = path.join(repo, specDir, 'subagents');
    fs.mkdirSync(subagentsDir, { recursive: true });
    fs.writeFileSync(path.join(subagentsDir, `${agentId}.jsonl`), '{}\n');

    const result = cli(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'impl/task-a.mjs,t/task-a.check.mjs',
      '--agent-id', agentId, '--session-id', sessionId,
    ]);

    assert.strictEqual(result.data.status, 'done');

    const state = stateOf(absSpecDir);
    const entry = state.tasks['task-a'];
    assert.strictEqual(entry.status, 'done');
    assert.strictEqual(entry.agentId, agentId);
    assert.ok('sessionId' in entry, 'entry must carry a sessionId field');
    assert.strictEqual(entry.sessionId, sessionId);
    assert.strictEqual(entry.incidencia, null, 'a real agentId join needs no incidencia');

    // Structural schema validation (no Ajv dependency in this repo's test/
    // tree; assert the required keys/nullability directly instead).
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    const taskSchema = schema.properties.tasks.additionalProperties;
    for (const key of taskSchema.required) {
      assert.ok(key in entry, `schema-required key '${key}' must be present in the state entry`);
    }
    assert.ok(taskSchema.properties.agentId, 'schema must declare agentId');
    assert.ok(taskSchema.properties.sessionId, 'schema must declare sessionId');
    assert.deepStrictEqual(taskSchema.properties.agentId.type, ['string', 'null']);
    assert.deepStrictEqual(taskSchema.properties.sessionId.type, ['string', 'null']);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R1.S2: no id, no acknowledgment -> blocked, nothing written ----------

test('R1.S2: completing with neither --agent-id nor --no-agent-id exits non-zero, error.reason starts MISSING_AGENT_ID: and names the task_id, and state/git are unchanged', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-agentid-blocked-');
  try {
    const testCmd = writeTaskFiles(repo, 'task-a', 'R1.S1', true);

    const stateBefore = stateOf(absSpecDir);
    const logBefore = git(repo, ['log', '--oneline']);

    const res = cliExpectFail(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'impl/task-a.mjs,t/task-a.check.mjs',
      // no --agent-id / --no-agent-id: the gap is neither filled nor acknowledged.
    ], { CLAUDE_CODE_SESSION_ID: undefined });

    assert.notStrictEqual(res.status, 0, 'must exit non-zero');
    const parsed = JSON.parse(res.stdout);
    assert.strictEqual(parsed.ok, false);
    assert.ok(
      parsed.error.reason.startsWith('MISSING_AGENT_ID:'),
      `error.reason must start with 'MISSING_AGENT_ID:', got: ${parsed.error.reason}`,
    );
    assert.ok(
      parsed.error.reason.includes('task-a'),
      `error.reason must name the task_id, got: ${parsed.error.reason}`,
    );

    // Nothing written to state and no new commit — read the raw file rather
    // than assuming stateOf() would still find an entry for this task.
    const stateAfter = stateOf(absSpecDir);
    assert.deepStrictEqual(stateAfter, stateBefore, 'execution_state.json must be unchanged');
    assert.strictEqual(
      stateAfter.tasks['task-a'].status,
      'pending',
      'task-a must have no recorded done/not-done entry',
    );

    const logAfter = git(repo, ['log', '--oneline']);
    assert.strictEqual(logAfter, logBefore, 'git log must be unchanged (no new commit)');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R1.S3: gap explicitly acknowledged -> graceful degrade ---------------

test('R1.S3: completing with --no-agent-id "<reason>" exits 0, records agentId null and an incidencia containing the reason', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-agentid-ack-');
  try {
    const testCmd = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
    const reason = 'orchestrator could not recover the agent id for this task';

    const result = cli(repo, [
      'complete', specDir, 'task-a',
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', 'impl/task-a.mjs,t/task-a.check.mjs',
      '--no-agent-id', reason,
      // no --agent-id / --session-id: the join is unavailable but acknowledged.
    ], { CLAUDE_CODE_SESSION_ID: undefined }); // isolate from the ambient shell's session id (unrelated to this test's agentId assertions)

    // The run is not aborted: it exits 0 (execFileSync would throw otherwise)
    // and still reports done.
    assert.strictEqual(result.data.status, 'done');

    const state = stateOf(absSpecDir);
    const entry = state.tasks['task-a'];
    assert.strictEqual(entry.status, 'done');
    assert.strictEqual(entry.agentId, null);
    assert.strictEqual(entry.sessionId, null);
    assert.ok(entry.incidencia, 'an acknowledged missing agentId join must be recorded as a non-null incidencia');
    assert.ok(
      entry.incidencia.includes(reason),
      `incidencia must contain the acknowledgment reason verbatim, got: ${entry.incidencia}`,
    );
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
