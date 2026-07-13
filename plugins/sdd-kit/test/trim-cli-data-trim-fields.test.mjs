// test/trim-cli-data-trim-fields.test.mjs — T4_trim_dead_fields
// (docs/specs/trim-cli-data spec, refs R3.S1, R3.S2, AC5).
//
// R3.S1 — "GIVEN a representative invocation of each trimmed CLI, WHEN its
//   stdout data payload is parsed, THEN it contains none of the field names
//   its contract section (plugins/sdd-kit/docs/cli-data-contract.md) marks
//   `unused`."
// R3.S2 — "GIVEN a CLI whose contract section lists no unused fields, WHEN
//   the trim pass runs, THEN neither its script nor its stdout payload
//   change" — checked here for token-cost.mjs by asserting its existing test
//   suite still passes unmodified (no changes were made to it).
//
// Two fields the contract doc marks `unused` are DELIBERATELY left
// untrimmed and are NOT asserted absent below — flagged as ambiguities in
// this task's own report rather than resolved unilaterally, per the task's
// own instructions (a real, non-test consumer was found for each):
//   - exec-tools.mjs `extract` (`ids`, `blocks`): the whole payload IS the
//     verbatim spec text a task-executing agent fetches itself, per
//     skills/plan-executor/assets/task-brief-detail.md.
//   - exec-tools.mjs `complete --batch` (`status`, `results`): `results` is
//     the only place a batch entry's `reason`/`incidencia`/`rerun_output`
//     diagnostics surface (never persisted to execution_state.json), per
//     the same asset doc's "Closing a multi-task batch" section.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(__dirname, '..', 'scripts');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const BUDGET_GUARD = path.join(SCRIPTS, 'budget-guard.mjs');
const EXEC_CLI = path.join(SCRIPTS, 'exec-tools.mjs');
const VERIFY_CLI = path.join(SCRIPTS, 'verify-tools.mjs');
const FORENSICS_VALIDATE_CLI = path.join(SCRIPTS, 'forensics-analysis-validate.mjs');
const FORENSICS_CLI = path.join(SCRIPTS, 'forensics.mjs');
const PLAN_TOOLS_CLI = path.join(SCRIPTS, 'plan-tools.mjs');
const VERSIONING_REPORT_CLI = path.join(SCRIPTS, 'versioning-report.mjs');
const TOKEN_COST_CLI = path.join(SCRIPTS, 'token-cost.mjs');

function assertAbsentKeys(obj, keys, label) {
  assert.ok(obj && typeof obj === 'object', `${label}: expected an object, got ${JSON.stringify(obj)}`);
  for (const key of keys) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(obj, key),
      `${label}: expected key "${key}" to be absent, got keys [${Object.keys(obj).join(', ')}]`,
    );
  }
}

// --- read-only CLIs: reuse docs/specs/trim-cli-data/measurements.md's exact
// commands (run from the repo root) as the representative invocation. ---

test('R3.S1: budget-guard.mjs stdout data has no withinBudget key', () => {
  const result = spawnSync('node', [BUDGET_GUARD], { cwd: REPO_ROOT, encoding: 'utf8' });
  const parsed = JSON.parse(result.stdout);
  assertAbsentKeys(parsed.data, ['withinBudget'], 'budget-guard.mjs');
  assert.ok(Array.isArray(parsed.data.results), 'data.results must still be present');
});

test('R3.S1: forensics-analysis-validate.mjs stdout data has no errors key', () => {
  const result = spawnSync(
    'node',
    [FORENSICS_VALIDATE_CLI, 'docs/specs/archived/forensics-analysis'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assertAbsentKeys(parsed.data, ['errors'], 'forensics-analysis-validate.mjs');
  assert.equal(typeof parsed.data.ok, 'boolean', 'data.ok must still be present');
});

test('R3.S1: forensics.mjs stdout data has no resolved/estimated_tokens keys inside tasks (forensics.json on disk keeps them)', () => {
  const tmpFx = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-cli-data-forensics-'));
  const specDir = path.join(tmpFx, 'forensics-analysis');
  fs.cpSync(path.join(REPO_ROOT, 'docs', 'specs', 'archived', 'forensics-analysis'), specDir, { recursive: true });

  const result = spawnSync('node', [FORENSICS_CLI, specDir], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.data.tasks && Object.keys(parsed.data.tasks).length > 0, 'data.tasks must be non-empty');
  for (const [taskId, entry] of Object.entries(parsed.data.tasks)) {
    assertAbsentKeys(entry, ['resolved', 'estimated_tokens'], `forensics.mjs data.tasks["${taskId}"]`);
  }

  // The on-disk forensics.json (a real, non-test consumer via
  // forensics-analysis-validate.mjs's `t.resolved === false` check) must
  // still carry BOTH fields — only the CLI's own stdout is trimmed.
  const written = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
  for (const entry of Object.values(written.tasks)) {
    assert.ok(Object.prototype.hasOwnProperty.call(entry, 'resolved'), 'forensics.json must still carry resolved');
    assert.ok(Object.prototype.hasOwnProperty.call(entry, 'estimated_tokens'), 'forensics.json must still carry estimated_tokens');
  }
});

test('R3.S1: plan-tools.mjs check-plan stdout data has no message key', () => {
  const specPath = path.join(__dirname, 'fixtures', 'valid', 'spec.md');
  const planPath = path.join(__dirname, 'fixtures', 'valid', 'plan.json');
  const result = spawnSync('node', [PLAN_TOOLS_CLI, 'check-plan', specPath, planPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assertAbsentKeys(parsed.data, ['message'], 'plan-tools.mjs check-plan');
  assert.equal(typeof parsed.data.tasks, 'number', 'data.tasks must still be present');
});

test('R3.S1: versioning-report.mjs stdout data has no warnings key', () => {
  const result = spawnSync('node', [VERSIONING_REPORT_CLI, REPO_ROOT], { encoding: 'utf8' });
  assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assertAbsentKeys(parsed.data, ['warnings'], 'versioning-report.mjs');
});

// --- R3.S2: token-cost.mjs (no unused fields) is untouched -----------------

test('R3.S2: token-cost.mjs is untouched by the trim pass — its own test suite still passes', () => {
  const result = spawnSync(
    process.execPath,
    ['--test', path.join(__dirname, 'exec', 'token-cost-cli-io.test.mjs')],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `token-cost.mjs's own CLI-IO suite must still pass unmodified; stderr: ${result.stderr}`);
});

test('R3.S2: token-cost.mjs source file was not modified by this task (git diff is empty)', () => {
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', 'plugins/sdd-kit/scripts/token-cost.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(diff.stdout.trim(), '', 'token-cost.mjs must show no diff against HEAD');
});

// --- exec-tools.mjs: mutating subcommands driven against a disposable temp
// git repo fixture (mirrors test/exec-verify-e2e.test.mjs's conventions). ---

const SLUG = 'trim-cli-data-fixture';

const SPEC = `# Spec: trim-cli-data field trim fixture

## Purpose

Disposable fixture spec for exercising exec-tools.mjs/verify-tools.mjs's
mutating subcommands (init/next/complete/block/resume/report,
ground-check/archive) end to end.

## Scope

**In scope:**
- Two independent requirements, each covered by one task.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — First requirement

Depende de: —

The system SHALL deliver part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN part A is done

### R2 — Second requirement

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

const PLAN = {
  plan_id: 'trim-cli-data-fixture-plan',
  project_name: 'trim-cli-data field trim fixture',
  global_objective: 'Exercise every mutating exec-tools.mjs/verify-tools.mjs subcommand.',
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
  ],
  coverage: {
    requirements: { R1: ['task-a'], R2: ['task-b'] },
    acs: { AC1: ['task-a'], AC2: ['task-b'] },
  },
};

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function execCli(repo, args) {
  const out = execFileSync('node', [EXEC_CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

function verifyCli(repo, args) {
  const out = execFileSync('node', [VERIFY_CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

function runTask(repo, specDir, taskId, tokens) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.marker`), `${taskId} done\n`);
  return execCli(repo, [
    'complete', specDir, taskId,
    '--tokens', String(tokens),
    '--test-cmd', 'true',
    '--rojo', 'fail',
    '--verde', 'pass',
    '--files', `impl/${taskId}.marker`,
  ]);
}

test('R3.S1: exec-tools.mjs + verify-tools.mjs mutating subcommands emit trimmed stdout data payloads', () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'trim-cli-data-exec-')));
  try {
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

    // init: plan_id/branch_created/first_batch/total_tasks/note trimmed; branch stays.
    const init = execCli(repo, ['init', specDir]);
    assertAbsentKeys(init.data, ['plan_id', 'branch_created', 'first_batch', 'total_tasks', 'note'], 'exec-tools.mjs init');
    assert.equal(init.data.branch, `feat/${SLUG}`);

    // next: note trimmed; status/batch/counts stay.
    const next = execCli(repo, ['next', specDir]);
    assertAbsentKeys(next.data, ['note'], 'exec-tools.mjs next');
    assert.equal(next.data.status, 'run');

    // block: status trimmed (blocked/skipped stay, not in scope of this trim).
    const blockResult = execCli(repo, ['block', specDir, 'task-b']);
    assertAbsentKeys(blockResult.data, ['status'], 'exec-tools.mjs block');
    assert.equal(blockResult.data.blocked, 'task-b');

    // complete (single task, done path): task_id/error trimmed.
    const doneA = runTask(repo, specDir, 'task-a', 900);
    assertAbsentKeys(doneA.data, ['task_id', 'error'], 'exec-tools.mjs complete (done)');
    assert.equal(doneA.data.status, 'done');
    assert.ok(doneA.data.commit, 'commit must still be present');

    // Note: completeOne()'s own `{status:'error', task_id, error}` UNKNOWN_TASK
    // branch is unreachable from this single-task subcommand — cmdComplete
    // already guards with `if (!task) emitError(...)` before ever calling
    // completeOne, so an unknown task_id here exits via the {ok:false,error}
    // envelope instead, not the {ok:true,data} one this test is about.

    // resume: counts trimmed; status/next_batch stay.
    const resumeResult = execCli(repo, ['resume', specDir]);
    assertAbsentKeys(resumeResult.data, ['counts'], 'exec-tools.mjs resume');
    assert.equal(resumeResult.data.status, 'resumed');

    // report (exec-tools.mjs): status/branch/counts/acs_satisfechos/pause
    // trimmed; tokens/per_task/real_cost/real_cost_over_budget stay.
    const execReport = execCli(repo, ['report', specDir]);
    assertAbsentKeys(
      execReport.data,
      ['status', 'branch', 'counts', 'acs_satisfechos', 'pause'],
      'exec-tools.mjs report',
    );
    assert.ok(execReport.data.tokens, 'data.tokens must still be present');
    assert.ok(Array.isArray(execReport.data.per_task), 'data.per_task must still be present');
    assert.ok('real_cost_over_budget' in execReport.data, 'data.real_cost_over_budget must still be present (consumed)');

    // ground-check (verify-tools.mjs): status/green/drift all trimmed -> {}.
    const ground = verifyCli(repo, ['ground-check', specDir]);
    assert.deepEqual(ground.data, {}, 'verify-tools.mjs ground-check data must be an empty object');

    // archive (verify-tools.mjs): task-b is blocked/skipped so not every AC
    // is green -> the not-all-green shape, whose notGreenAcs is trimmed.
    const archiveResult = verifyCli(repo, ['archive', specDir]);
    assertAbsentKeys(archiveResult.data, ['notGreenAcs'], 'verify-tools.mjs archive (not-all-green)');
    assert.equal(archiveResult.data.archived, false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
