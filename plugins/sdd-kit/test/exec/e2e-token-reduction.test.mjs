// test/exec/e2e-token-reduction.test.mjs — R-E2E.S1 / AC-E2E (sdd-kit-token-reduction)
//
// Drives the exec-tools.mjs CLI end-to-end, exactly as the orchestrator
// would per SKILL.md, over the multi-batch fixture at
// test/exec/fixtures/e2e-token-reduction/ (3 independent tasks in a
// parallel batch — task-b fails its first attempt and succeeds on retry —
// plus a dependent task-d). It measures:
//
//   (a) BASELINE — invocations needed using only the tarea-a-tarea path
//       (single-task `complete`, one invocation per task/attempt), and
//   (b) BATCH — invocations needed closing the parallel batch with ONE
//       `complete --batch` call (R2-batch) instead of one per task.
//
// AC-E2E requires: both runs finish `report`ed done/complete with every
// task green and committed; batch invocations < baseline invocations
// (strictly fewer); and no `rerun_output` returned by `complete` ever
// exceeds 50 lines (R3-filter), even though task-b's first attempt emits a
// >200-line failing log.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'e2e-token-reduction');
const SLUG = 'e2e-token-reduction';

const FIXTURE_SPEC = fs.readFileSync(path.join(FIXTURE_DIR, 'spec.md'), 'utf8');
const FIXTURE_PLAN_TEXT = fs.readFileSync(path.join(FIXTURE_DIR, 'execution_plan.json'), 'utf8');

// --- helpers ------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

// Wraps CLI invocations for one repo, counting every real subprocess call so
// the test can compare baseline vs batch invocation totals honestly. Every
// subcommand here prints the canonical envelope {ok:true,data:<payload>} —
// invoke() asserts success and unwraps to the payload once, in one place,
// so every call site below reads the same fields it always has (`init.ok`
// still works because cmdInit's own payload also carries a redundant `ok`).
function makeCli(repo) {
  let count = 0;
  function invoke(args) {
    count++;
    const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.ok, true, `CLI call must succeed (envelope ok:true): node ${[CLI, ...args].join(' ')}`);
    return parsed.data;
  }
  return { invoke, get count() { return count; } };
}

// Sets up an isolated temp git repo with the fixture spec+plan committed on
// main, then runs `init` (not counted against the caller's invocation
// counter — both baseline and batch pay this one identically, so it nets
// out; each helper still counts its own `init` call for the reported total).
function setupRepo(prefix) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const specDir = path.join('docs', 'specs', SLUG);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), FIXTURE_SPEC);
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), FIXTURE_PLAN_TEXT);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture']);
  return { repo, specDir, absSpecDir };
}

// Writes a task's impl + re-run check script. When shouldPass is false, the
// check prints a >200-line noisy log (like a real failing `node --test` TAP
// run) before exiting 1 — the same shape verify.test.mjs's R3-filter fixture
// exercises, but produced by a real subprocess here instead of a canned
// string. A plain script (not `node:test`) on purpose: this file itself runs
// under `node --test`, which sets NODE_TEST_CONTEXT; a nested `node --test`
// re-run would be silently skipped (exit 0) by Node's recursion guard,
// masking a genuine failure as green.
function writeTaskFiles(repo, taskId, ref, shouldPass) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = ${shouldPass};\n`);
  const lines = [
    `import { done } from '../impl/${taskId}.mjs';`,
    `// ${taskId} satisfies ${ref}`,
    'if (done !== true) {',
    "  console.log('TAP version 13');",
    "  console.log('# Subtest: " + taskId + " (" + ref + ")');",
    '  for (let i = 0; i < 220; i++) {',
    "    console.log(`    at noiseFrame${i} (/repo/node_modules/some-lib/dist/index.js:${100 + i}:${5 + i})`);",
    '  }',
    `  console.error('AssertionError [ERR_ASSERTION]: ${taskId} (${ref}) expected done=true, got false');`,
    "  console.log('not ok 1 - " + taskId + " (" + ref + ")');",
    '  process.exit(1);',
    '}',
    `console.log('PASS: ${taskId} (${ref})');`,
    '',
  ];
  fs.writeFileSync(path.join(repo, 't', `${taskId}.check.mjs`), lines.join('\n'));
  return `node t/${taskId}.check.mjs`;
}

function completeArgs(specDir, taskId, tokens, testCmd) {
  return [
    'complete', specDir, taskId, '--tokens', String(tokens), '--test-cmd', testCmd, '--rojo', 'fail', '--verde', 'pass',
    '--files', `impl/${taskId}.mjs,t/${taskId}.check.mjs`, '--agent-id', 'agent-fixture',
  ];
}

function assertRerunOutputBounded(result, label) {
  if (result.rerun_output == null) return;
  const lineCount = result.rerun_output.split('\n').length;
  assert.ok(lineCount <= 50, `${label}: rerun_output must be <=50 lines, got ${lineCount}`);
}

// --- test ---------------------------------------------------------------------

test('AC-E2E: --batch closes the fixture with strictly fewer invocations than tarea-a-tarea, both fully green, no rerun_output over 50 lines', () => {
  const rerunOutputs = [];

  // --- (a) BASELINE: tarea-a-tarea, single-task `complete` only -------------
  const base = setupRepo('e2e-tr-base-');
  try {
    const baseCli = makeCli(base.repo);

    const init = baseCli.invoke(['init', base.specDir]);
    assert.strictEqual(init.ok, true);

    const batch1 = baseCli.invoke(['next', base.specDir]);
    assert.strictEqual(batch1.status, 'run');
    assert.deepStrictEqual([...batch1.batch].sort(), ['task-a', 'task-b', 'task-c']);

    // task-a: straight to green.
    const testCmdA = writeTaskFiles(base.repo, 'task-a', 'R1.S1', true);
    const doneA = baseCli.invoke(completeArgs(base.specDir, 'task-a', 1000, testCmdA));
    assert.strictEqual(doneA.status, 'done');

    // task-b: attempt 1 fails (rerun-failed, noisy >200-line log).
    const testCmdBFail = writeTaskFiles(base.repo, 'task-b', 'R2.S1', false);
    const failB = baseCli.invoke(completeArgs(base.specDir, 'task-b', 900, testCmdBFail));
    assert.strictEqual(failB.status, 'not-done');
    assert.strictEqual(failB.reason, 'rerun-failed');
    assertRerunOutputBounded(failB, 'baseline task-b attempt 1');
    rerunOutputs.push(failB);

    // task-b: retry (re-delegated, per failures-and-resume.md §5.1) succeeds.
    const testCmdBRetry = writeTaskFiles(base.repo, 'task-b', 'R2.S1', true);
    const doneB = baseCli.invoke(completeArgs(base.specDir, 'task-b', 950, testCmdBRetry));
    assert.strictEqual(doneB.status, 'done');

    // task-c: straight to green.
    const testCmdC = writeTaskFiles(base.repo, 'task-c', 'R3.S1', true);
    const doneC = baseCli.invoke(completeArgs(base.specDir, 'task-c', 1000, testCmdC));
    assert.strictEqual(doneC.status, 'done');

    const batch2 = baseCli.invoke(['next', base.specDir]);
    assert.strictEqual(batch2.status, 'run');
    assert.deepStrictEqual(batch2.batch, ['task-d']);

    const testCmdD = writeTaskFiles(base.repo, 'task-d', 'R4.S1', true);
    const doneD = baseCli.invoke(completeArgs(base.specDir, 'task-d', 1000, testCmdD));
    assert.strictEqual(doneD.status, 'done');

    const end = baseCli.invoke(['next', base.specDir]);
    assert.strictEqual(end.status, 'complete');
    assert.strictEqual(end.counts.done, 4);

    // report: status/counts/acs_satisfechos are trimmed from stdout as of
    // T4-trim-cli-data (only the test suite ever read them there); tokens
    // stays and is exercised elsewhere (test/exec/e2e.test.mjs).
    const report = baseCli.invoke(['report', base.specDir]);
    assert.ok(report.tokens, 'report.tokens must still be present');

    // 4 task commits on top of main (one per DONE task; task-b's failed
    // attempt produced no commit).
    const taskCommits = git(base.repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, '4', 'baseline: exactly one commit per done task');
    assert.strictEqual(git(base.repo, ['rev-parse', '--abbrev-ref', 'HEAD']), `feat/${SLUG}`);

    // --- baseline invocation count -------------------------------------------
    // init, next, complete(a), complete(b fail), complete(b retry),
    // complete(c), next, complete(d), next, report = 10.
    var baselineInvocations = baseCli.count;
    assert.strictEqual(baselineInvocations, 10, 'baseline invocation count sanity check');
  } finally {
    fs.rmSync(base.repo, { recursive: true, force: true });
  }

  // --- (b) BATCH: R2-batch closes the parallel batch in 1 invocation --------
  const batchRun = setupRepo('e2e-tr-batch-');
  try {
    const bCli = makeCli(batchRun.repo);

    const init = bCli.invoke(['init', batchRun.specDir]);
    assert.strictEqual(init.ok, true);

    const batch1 = bCli.invoke(['next', batchRun.specDir]);
    assert.strictEqual(batch1.status, 'run');
    assert.deepStrictEqual([...batch1.batch].sort(), ['task-a', 'task-b', 'task-c']);

    // All 3 tasks' files exist up front (as they would once 3 parallel
    // subagents have returned); task-b's attempt is the failing one.
    const testCmdA = writeTaskFiles(batchRun.repo, 'task-a', 'R1.S1', true);
    const testCmdBFail = writeTaskFiles(batchRun.repo, 'task-b', 'R2.S1', false);
    const testCmdC = writeTaskFiles(batchRun.repo, 'task-c', 'R3.S1', true);

    const batchFile = path.join(batchRun.repo, 'batch1.json');
    fs.writeFileSync(batchFile, JSON.stringify([
      {
        task_id: 'task-a', tokens: 1000, test_cmd: testCmdA, rojo: 'fail', verde: 'pass',
        files: ['impl/task-a.mjs', 't/task-a.check.mjs'],
      },
      {
        task_id: 'task-b', tokens: 900, test_cmd: testCmdBFail, rojo: 'fail', verde: 'pass',
        files: ['impl/task-b.mjs', 't/task-b.check.mjs'],
      },
      {
        task_id: 'task-c', tokens: 1000, test_cmd: testCmdC, rojo: 'fail', verde: 'pass',
        files: ['impl/task-c.mjs', 't/task-c.check.mjs'],
      },
    ], null, 2));

    const batchResult = bCli.invoke(['complete', batchRun.specDir, '--batch', batchFile]);
    assert.strictEqual(batchResult.status, 'batch');
    const byId = Object.fromEntries(batchResult.results.map((r) => [r.task_id, r]));
    assert.strictEqual(byId['task-a'].status, 'done');
    assert.strictEqual(byId['task-c'].status, 'done');
    assert.strictEqual(byId['task-b'].status, 'not-done');
    assert.strictEqual(byId['task-b'].reason, 'rerun-failed');
    assertRerunOutputBounded(byId['task-b'], 'batch task-b attempt 1');
    rerunOutputs.push(byId['task-b']);

    // Retry task-b alone (still 1 invocation, single-task path).
    const testCmdBRetry = writeTaskFiles(batchRun.repo, 'task-b', 'R2.S1', true);
    const doneB = bCli.invoke(completeArgs(batchRun.specDir, 'task-b', 950, testCmdBRetry));
    assert.strictEqual(doneB.status, 'done');

    const batch2 = bCli.invoke(['next', batchRun.specDir]);
    assert.strictEqual(batch2.status, 'run');
    assert.deepStrictEqual(batch2.batch, ['task-d']);

    const testCmdD = writeTaskFiles(batchRun.repo, 'task-d', 'R4.S1', true);
    const doneD = bCli.invoke(completeArgs(batchRun.specDir, 'task-d', 1000, testCmdD));
    assert.strictEqual(doneD.status, 'done');

    const end = bCli.invoke(['next', batchRun.specDir]);
    assert.strictEqual(end.status, 'complete');
    assert.strictEqual(end.counts.done, 4);

    const report = bCli.invoke(['report', batchRun.specDir]);
    assert.ok(report.tokens, 'report.tokens must still be present');

    // 4 task commits on top of main, each atomic (one per done task).
    const taskCommits = git(batchRun.repo, ['rev-list', '--count', 'HEAD', '^main']);
    assert.strictEqual(taskCommits, '4', 'batch run: exactly one commit per done task');
    assert.strictEqual(git(batchRun.repo, ['rev-parse', '--abbrev-ref', 'HEAD']), `feat/${SLUG}`);
    assert.notStrictEqual(byId['task-a'].commit, byId['task-c'].commit, 'each task in the batch got its OWN commit');

    // --- batch invocation count -----------------------------------------------
    // init, next, complete --batch(a,b-fail,c), complete(b retry), next,
    // complete(d), next, report = 8.
    var batchInvocations = bCli.count;
    assert.strictEqual(batchInvocations, 8, 'batch invocation count sanity check');

    // --- AC-E2E: strictly fewer invocations, batch < baseline ------------------
    assert.ok(batchInvocations < baselineInvocations,
      `--batch must need strictly fewer invocations than the tarea-a-tarea baseline (batch=${batchInvocations}, baseline=${baselineInvocations})`);

    // --- no rerun_output over 50 lines, anywhere ------------------------------
    assert.ok(rerunOutputs.length >= 2, 'sanity: both runs produced a failing rerun_output to check');
    for (const r of rerunOutputs) {
      const lineCount = r.rerun_output.split('\n').length;
      assert.ok(lineCount <= 50, `rerun_output for ${r.task_id} must be <=50 lines, got ${lineCount}`);
    }
  } finally {
    fs.rmSync(batchRun.repo, { recursive: true, force: true });
  }
});
