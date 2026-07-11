// test/exec/e2e-complete-agentid-sessionid.test.mjs — R-E2E.S1
//
// Full-chain integration: `complete` (CLI) -> execution_state.json ->
// `forensics` (CLI). Two prior changes landed separately (R1: `complete`
// auto-defaults sessionId from process.env.CLAUDE_CODE_SESSION_ID when no
// --session-id flag is given; R2: plan-executor docs instruct passing
// --agent-id) but nothing before this test exercised them together,
// end-to-end, through forensics resolution. This is that test.
//
// "Tras cerrar las tareas pasando el agentId por flag y sin session id, con
// el entorno fijado, cada tarea done tiene agentId y sessionId no nulos y
// forensics resuelve al menos una tarea sin marcar el fallo de no haber
// registrado ningún agentId."
//
// Fixture conventions:
// - setupRepo/cli()/writeTaskFiles mirror test/exec/agentid-persist.test.mjs
//   verbatim (temp git repo, minimal spec.md + execution_plan.json, `init`).
// - writeProjectFixture mirrors test/exec/e2e-forensics.test.mjs's helper of
//   the same name (a project dir under TOKEN_COST_PROJECTS_ROOT with a flat
//   <sessionId>.jsonl plus <sessionId>/subagents/agent-<agentId>.jsonl +
//   .meta.json — the exact shape forensics.mjs's join reads).

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const FORENSICS_CLI = path.resolve(__dirname, '..', '..', 'scripts', 'forensics.mjs');
const SLUG = 'e2e-agentid-sessionid-demo';

const SPEC = `# Spec: E2E AgentId/SessionId Fixture

## Purpose

Minimal fixture proving the complete -> execution_state.json -> forensics
chain resolves agentId/sessionId end to end.

## Scope

**In scope:**
- One task closed via --agent-id, with sessionId auto-defaulted from the
  environment.

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
    plan_id: 'e2e-agentid-sessionid-plan',
    project_name: 'E2E AgentId/SessionId Fixture',
    global_objective: 'Prove complete -> execution_state.json -> forensics resolves agentId/sessionId end to end.',
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

// --- helper (mirrors test/exec/e2e-forensics.test.mjs's writeProjectFixture)

function writeProjectFixture(projectsRoot, projectName, sessionId, agentId, subUsage) {
  const projectDir = path.join(projectsRoot, projectName);
  fs.mkdirSync(projectDir, { recursive: true });

  const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
  fs.writeFileSync(
    sessionFile,
    JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    }) + '\n',
  );

  const subagentsDir = path.join(projectDir, sessionId, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(subagentsDir, `agent-${agentId}.jsonl`),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: subUsage } }) + '\n',
  );
  fs.writeFileSync(
    path.join(subagentsDir, `agent-${agentId}.meta.json`),
    JSON.stringify({ description: 'fixture subagent' }),
  );
}

function runForensicsCli(specDir, env) {
  return spawnSync('node', [FORENSICS_CLI, specDir], {
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

// --- R-E2E.S1 ----------------------------------------------------------------

test(
  'R-E2E.S1: Tras cerrar las tareas pasando el agentId por flag y sin session id, con el entorno '
  + 'fijado, cada tarea done tiene agentId y sessionId no nulos y forensics resuelve al menos una '
  + 'tarea sin marcar el fallo de no haber registrado ningún agentId',
  () => {
    const { repo, specDir, absSpecDir } = setupRepo('exec-e2e-agentid-sessionid-');
    const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-agentid-sessionid-root-'));

    try {
      const testCmd = writeTaskFiles(repo, 'task-a', 'R1.S1', true);

      const agentId = 'agent-e2e-known';
      const sessionId = 'session-e2e-known';

      // Fixture for forensics's join: a subagent transcript reachable under
      // TOKEN_COST_PROJECTS_ROOT, keyed by sessionId/agentId exactly as
      // forensics.mjs expects.
      const subUsage = { input_tokens: 400, output_tokens: 80, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 };
      writeProjectFixture(projectsRoot, 'project-e2e-agentid-sessionid', sessionId, agentId, subUsage);

      // Close the task via --agent-id but deliberately WITHOUT --session-id:
      // R1's auto-default must pick sessionId up from the environment.
      const result = cli(
        repo,
        [
          'complete', specDir, 'task-a',
          '--tokens', '1200', '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
          '--files', 'impl/task-a.mjs,t/task-a.check.mjs',
          '--agent-id', agentId,
        ],
        { CLAUDE_CODE_SESSION_ID: sessionId },
      );

      assert.strictEqual(result.data.status, 'done');

      const state = stateOf(absSpecDir);
      const entry = state.tasks['task-a'];
      assert.strictEqual(entry.status, 'done');
      assert.strictEqual(entry.agentId, agentId);
      assert.notStrictEqual(entry.agentId, null);
      assert.strictEqual(entry.sessionId, sessionId);
      assert.notStrictEqual(entry.sessionId, null);

      // Now run forensics against the same specDir, pointed at the fixture
      // projects root.
      const forensicsResult = runForensicsCli(absSpecDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
      assert.strictEqual(
        forensicsResult.status,
        0,
        `expected forensics exit 0, got ${forensicsResult.status}; stderr: ${forensicsResult.stderr}`,
      );

      const forensics = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'forensics.json'), 'utf8'));

      const taskForensics = forensics.tasks['task-a'];
      assert.strictEqual(taskForensics.resolved, true);
      assert.notStrictEqual(taskForensics.real_tokens, null);
      assert.strictEqual(typeof taskForensics.real_tokens, 'number');

      // The whole-run incomplete flag must NOT fire with the "no agentId
      // recorded for any task" reason — this fixture has exactly one task
      // and it did carry an agentId, so that reason can never legitimately
      // apply here.
      const noAgentIdIncomplete = forensics.incomplete === true
        && forensics.incomplete_reason === 'no agentId recorded for any task';
      assert.strictEqual(
        noAgentIdIncomplete,
        false,
        `forensics must not report the no-agentId incomplete reason when a task carried an agentId; got incomplete=${forensics.incomplete}, incomplete_reason=${forensics.incomplete_reason}`,
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(projectsRoot, { recursive: true, force: true });
    }
  },
);
