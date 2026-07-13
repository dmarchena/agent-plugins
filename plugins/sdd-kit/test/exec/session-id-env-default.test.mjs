// test/exec/session-id-env-default.test.mjs — R1.S1/R1.S2/R1.S3
//
// When no explicit session id is supplied (neither --session-id in the
// single-task path nor session_id per entry in the batch path), the exec
// stage falls back to sealing process.env.CLAUDE_CODE_SESSION_ID as the
// task's sessionId. An explicit session id always wins over the env value.
// When neither is present, sessionId stays null without aborting (exit 0).
// Modeled closely on test/exec/agentid-persist.test.mjs's fixture/cli setup.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'sessionid-env-demo';

const SPEC = `# Spec: SessionId Env Default Fixture

## Purpose

Minimal fixture for auto-defaulting sessionId from CLAUDE_CODE_SESSION_ID.

## Scope

**In scope:**
- One task closed with/without an explicit session id and with/without the env var.

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
    plan_id: 'sessionid-env-demo-plan',
    project_name: 'SessionId Env Default Fixture',
    global_objective: 'Auto-default sessionId from CLAUDE_CODE_SESSION_ID on completion.',
    source_spec: 'spec.md',
    confidence: 'low',
    estimated_tokens_total: 1000,
    tasks: [
      {
        task_id: 't1-auto-default-sessionid',
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
      requirements: { R1: ['t1-auto-default-sessionid'] },
      acs: { AC1: ['t1-auto-default-sessionid'] },
    },
  };
}

// --- helpers ----------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args, envOverrides) {
  const env = envOverrides ? { ...process.env, ...envOverrides } : process.env;
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8', env });
  return JSON.parse(out);
}

function setupRepo(prefix, plan) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const specDir = path.join('docs', 'specs', SLUG);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(plan || makePlan(), null, 2));
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

// --- R1.S1: env value seals as sessionId when no explicit flag ------------

test('R1.S1: complete with no explicit session id and CLAUDE_CODE_SESSION_ID present seals that value as sessionId, leaving agentId untouched', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-sessionid-env-');
  try {
    const taskId = 't1-auto-default-sessionid';
    const testCmd = writeTaskFiles(repo, taskId, 'R1.S1', true);
    const agentId = 'agent-xyz789';
    const subagentsDir = path.join(repo, specDir, 'subagents');
    fs.mkdirSync(subagentsDir, { recursive: true });
    fs.writeFileSync(path.join(subagentsDir, `${agentId}.jsonl`), '{}\n');

    const result = cli(repo, [
      'complete', specDir, taskId,
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', `impl/${taskId}.mjs,t/${taskId}.check.mjs`,
      '--agent-id', agentId,
      // no --session-id: must fall back to the env value.
    ], { CLAUDE_CODE_SESSION_ID: 'sess-from-env-1' });

    assert.strictEqual(result.data.status, 'done');

    const state = stateOf(absSpecDir);
    const entry = state.tasks[taskId];
    assert.strictEqual(entry.status, 'done');
    assert.strictEqual(entry.sessionId, 'sess-from-env-1', 'sessionId must be sealed from the env var');
    assert.strictEqual(entry.agentId, agentId, 'agentId must be unaffected by the sessionId env fallback');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// --- R1.S2: explicit flag wins over env; absent both stays null, no error -

test('R1.S2: --session-id flag takes precedence over env; absent both, sessionId stays null and the close still succeeds', () => {
  const { repo, specDir, absSpecDir } = setupRepo('exec-sessionid-precedence-');
  try {
    const taskId = 't1-auto-default-sessionid';
    const testCmd = writeTaskFiles(repo, taskId, 'R1.S1', true);

    // Explicit flag beats the env value.
    const result1 = cli(repo, [
      'complete', specDir, taskId,
      '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
      '--files', `impl/${taskId}.mjs,t/${taskId}.check.mjs`,
      '--session-id', 'sess-explicit',
      '--agent-id', 'agent-fixture',
    ], { CLAUDE_CODE_SESSION_ID: 'sess-from-env-2' });

    assert.strictEqual(result1.data.status, 'done');
    const entry1 = stateOf(absSpecDir).tasks[taskId];
    assert.strictEqual(entry1.sessionId, 'sess-explicit', 'explicit --session-id must win over the env value');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // Separate repo: neither flag nor env present.
  {
    const { repo, specDir, absSpecDir } = setupRepo('exec-sessionid-neither-');
    try {
      const taskId = 't1-auto-default-sessionid';
      const testCmd = writeTaskFiles(repo, taskId, 'R1.S1', true);

      const envNoSession = { ...process.env };
      delete envNoSession.CLAUDE_CODE_SESSION_ID;

      const result2 = execFileSync('node', [
        CLI, 'complete', specDir, taskId,
        '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
        '--files', `impl/${taskId}.mjs,t/${taskId}.check.mjs`,
        '--agent-id', 'agent-fixture',
        // no --session-id, no env var.
      ], { cwd: repo, encoding: 'utf8', env: envNoSession });
      const parsed = JSON.parse(result2);

      assert.strictEqual(parsed.data.status, 'done', 'close must still succeed (exit 0) with no session id source at all');
      const entry2 = stateOf(absSpecDir).tasks[taskId];
      assert.strictEqual(entry2.sessionId, null, 'with neither flag nor env, sessionId stays null');
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  }
});

// --- R1.S3: batch path — per-entry inheritance vs own value ---------------

test('R1.S3: batch entry with no session_id inherits the env value; an entry with its own session_id keeps it', () => {
  const plan = makePlan();
  const secondTask = {
    ...plan.tasks[0],
    task_id: 't2-auto-default-sessionid',
  };
  plan.tasks.push(secondTask);
  plan.coverage.requirements.R1.push('t2-auto-default-sessionid');
  plan.coverage.acs.AC1.push('t2-auto-default-sessionid');

  const { repo, specDir, absSpecDir } = setupRepo('exec-sessionid-batch-', plan);
  try {
    const testCmd1 = writeTaskFiles(repo, 't1-auto-default-sessionid', 'R1.S1', true);
    const testCmd2 = writeTaskFiles(repo, 't2-auto-default-sessionid', 'R1.S1', true);

    const batch = [
      {
        task_id: 't1-auto-default-sessionid',
        tokens: 1000, test_cmd: testCmd1, rojo: 'fail', verde: 'pass',
        files: ['impl/t1-auto-default-sessionid.mjs', 't/t1-auto-default-sessionid.check.mjs'],
        agent_id: 'agent-fixture',
        // no session_id: must inherit env.
      },
      {
        task_id: 't2-auto-default-sessionid',
        tokens: 1000, test_cmd: testCmd2, rojo: 'fail', verde: 'pass',
        files: ['impl/t2-auto-default-sessionid.mjs', 't/t2-auto-default-sessionid.check.mjs'],
        session_id: 'sess-own-value', agent_id: 'agent-fixture',
      },
    ];
    const batchPath = path.join(repo, 'batch.json');
    fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2));

    const result = cli(repo, ['complete', specDir, '--batch', batchPath], { CLAUDE_CODE_SESSION_ID: 'sess-from-env-batch' });

    assert.strictEqual(result.data.status, 'batch');

    const state = stateOf(absSpecDir);
    const entry1 = state.tasks['t1-auto-default-sessionid'];
    const entry2 = state.tasks['t2-auto-default-sessionid'];
    assert.strictEqual(entry1.sessionId, 'sess-from-env-batch', 'entry without its own session_id must inherit the env value');
    assert.strictEqual(entry2.sessionId, 'sess-own-value', 'entry with its own session_id must keep it, not the env value');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
