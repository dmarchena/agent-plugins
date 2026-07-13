// test/exec/e2e-reject-then-record.test.mjs — R-E2E.S1 (AC-E2E)
//
// Integration test for the reject-then-record sequence around the
// single-task `complete` command's MISSING_AGENT_ID guard (already merged):
// a first call with neither --agent-id nor --no-agent-id must be blocked
// (no state write, no commit), and a second call for the SAME task with the
// SAME green evidence plus --agent-id must succeed (state entry done with
// that agentId, and a commit). The point of this test is the TRANSITION
// across both calls — no commit after call 1, a commit after call 2 — not
// just each call's outcome in isolation (that per-call behavior is already
// covered by test/exec/agentid-persist.test.mjs's R1.S1/R1.S2).
//
// Fixture conventions: setupRepo/cli()/writeTaskFiles/stateOf/cliExpectFail
// mirror test/exec/agentid-persist.test.mjs verbatim, per that file's own
// header comment inviting reuse of its helpers rather than reinventing them.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const SLUG = 'e2e-reject-then-record-demo';

const SPEC = `# Spec: Reject-Then-Record Fixture

## Purpose

Minimal fixture proving the reject-then-record sequence around the
MISSING_AGENT_ID guard: a blocked first call leaves no trace, and a second
call with an agentId succeeds and commits.

## Scope

**In scope:**
- One task closed first without an agentId (blocked), then with one
  (recorded).

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
    plan_id: 'e2e-reject-then-record-plan',
    project_name: 'Reject-Then-Record Fixture',
    global_objective: 'Prove the reject-then-record sequence leaves no commit on the blocked call and a commit on the recorded call.',
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

// --- helpers (mirrors test/exec/agentid-persist.test.mjs) -------------------

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
// test/exec/agentid-persist.test.mjs's cliExpectFail, itself mirroring
// test/exec/scoped-commit.test.mjs's).
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

// --- R-E2E.S1 (AC-E2E) -------------------------------------------------------
//
// AC-E2E (ref R-E2E.S1): "The reject-then-record sequence leaves no commit on
// the first (blocked) call and yields a done state entry carrying the
// supplied agentId plus a commit after the second call."

test(
  'R-E2E.S1 / AC-E2E: reject-then-record — first call blocked (no state write, no commit), '
  + 'second call with --agent-id succeeds (done state entry with that agentId, plus a commit)',
  () => {
    const { repo, specDir, absSpecDir } = setupRepo('exec-e2e-reject-then-record-');
    try {
      // Genuine green evidence: the implementation file is already correct,
      // so the test command actually passes when `complete` re-runs it,
      // matching --rojo fail --verde pass (what the subagent observed).
      const testCmd = writeTaskFiles(repo, 'task-a', 'R1.S1', true);
      const completeArgs = [
        'complete', specDir, 'task-a',
        '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
        '--files', 'impl/task-a.mjs,t/task-a.check.mjs',
      ];

      const stateBefore = stateOf(absSpecDir);
      const logBefore = git(repo, ['log', '--oneline']);

      // --- First call: neither --agent-id nor --no-agent-id -> blocked ----
      const blocked = cliExpectFail(repo, completeArgs, { CLAUDE_CODE_SESSION_ID: undefined });

      assert.notStrictEqual(blocked.status, 0, 'first call must exit non-zero');
      const blockedParsed = JSON.parse(blocked.stdout);
      assert.strictEqual(blockedParsed.ok, false);
      assert.ok(
        blockedParsed.error.reason.startsWith('MISSING_AGENT_ID:'),
        `error.reason must start with 'MISSING_AGENT_ID:', got: ${blockedParsed.error.reason}`,
      );
      assert.ok(
        blockedParsed.error.reason.includes('task-a'),
        `error.reason must name the task_id, got: ${blockedParsed.error.reason}`,
      );

      const stateAfterBlocked = stateOf(absSpecDir);
      assert.deepStrictEqual(
        stateAfterBlocked, stateBefore,
        'execution_state.json must be unchanged after the blocked first call',
      );

      const logAfterBlocked = git(repo, ['log', '--oneline']);
      assert.strictEqual(
        logAfterBlocked, logBefore,
        'git log must be unchanged after the blocked first call (no new commit)',
      );

      // --- Second call: same task, same green evidence, WITH --agent-id ---
      const agentId = 'agent-e2e-reject-then-record';
      const recorded = cli(
        repo,
        [...completeArgs, '--agent-id', agentId],
        { CLAUDE_CODE_SESSION_ID: undefined },
      );

      assert.strictEqual(recorded.data.status, 'done');
      assert.ok(recorded.data.commit, 'second call must report a truthy commit hash');

      const stateAfterRecorded = stateOf(absSpecDir);
      const entry = stateAfterRecorded.tasks['task-a'];
      assert.strictEqual(entry.status, 'done');
      assert.strictEqual(entry.agentId, agentId);

      const logAfterRecorded = git(repo, ['log', '--oneline']);
      assert.notStrictEqual(
        logAfterRecorded, logBefore,
        'git log must show a new commit after the second (recorded) call',
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  },
);
