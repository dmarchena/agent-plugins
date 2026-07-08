// T4-verify-e2e-flow: verify's NORMAL report/archive flow closes the
// spec-mandated AC-E2E from its backing `verifier` task's state alone
// (R4/AC8, R4.S1/AC8, R4.S2/AC9) — no hand-patched report field, no
// user-override reason, no special-casing anywhere in verify-tools.mjs.
// Wires the same building blocks as verify-e2e.test.mjs
// (loadSpecdir → groundCheck → tokenDeviations → degradedManualRouting →
// incompleteCoverage → assembleReport → archiveIfGreen) against a real
// fixture SPECDIR inside an ISOLATED temp git repo. Never touches the real
// project repo or its docs/specs/.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  loadSpecdir,
  groundCheck,
  tokenDeviations,
  degradedManualRouting,
  incompleteCoverage,
  assembleReport,
  archiveIfGreen,
} from '../scripts/verify-tools.mjs';
// Use the REAL rerun from plan-executor's exec/verify.mjs — the same
// deterministic re-run verify's normal [auto] path reuses for every AC,
// including AC-E2E's backing verifier task. Each fixture task's stored
// test_cmd is the trivially-true shell command "true", so the re-run
// genuinely spawns a subprocess and passes.
import { rerun } from '../scripts/exec/verify.mjs';

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  }
  return res.stdout.trim();
}

// Isolated temp git repo on a neutral 'work' branch, exactly like the
// sibling git-touching tests (verify-e2e.test.mjs / verify-report-archive.test.mjs).
function makeTempRepo(prefix) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(['init'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'Test'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'initial\n');
  git(['add', '-A'], repo);
  git(['commit', '-m', 'init'], repo);
  git(['checkout', '-b', 'work'], repo);
  return repo;
}

// spec.md carries one ordinary [auto] AC (AC1) plus the spec-mandated
// AC-E2E, both [auto] so both flow through groundCheck/incompleteCoverage —
// there is no [manual] AC here, keeping this fixture focused strictly on the
// verifier-task-backed AC-E2E path.
const SPEC_MD = `# Spec: verifier e2e demo

## Purpose

A demo spec exercising the spec-mandated AC-E2E, backed by a \`verifier\`
agent_type task, through verify's normal report/archive flow.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — an ordinary auto AC, covered by a code_writer task.
- [ ] AC-E2E → R-E2E.S1 [auto] — the spec-mandated end-to-end confirmation,
  covered by a \`verifier\` agent_type task.

## Assumptions

None.
`;

// coverage.acs connects AC1 to an ordinary task and AC-E2E to the verifier
// task. verify-tools.mjs's pipeline never reads agent_type off the plan (that
// is exec-tools.mjs's concern) — it only reads coverage.acs + execution_state
// — but the field is included here for fixture realism.
const EXECUTION_PLAN = {
  tasks: [
    { id: 'T1', title: 'implement AC1', agent_type: 'code_writer', satisfies_acs: ['AC1'] },
    { id: 'Tverify', title: 'verifier e2e', agent_type: 'verifier', satisfies_acs: ['AC-E2E'] },
  ],
  coverage: {
    acs: {
      AC1: ['T1'],
      'AC-E2E': ['Tverify'],
    },
  },
};

function makeExecutionState(verifierStatus) {
  return {
    tasks: {
      T1: {
        status: 'done',
        test_cmd: 'true',
        estimated_tokens: 500,
        actual_tokens: 400,
        deviation: -100,
        commit: 'aaaaaaa',
        incidencia: null,
      },
      Tverify:
        verifierStatus === 'done'
          ? {
              status: 'done',
              test_cmd: 'true',
              estimated_tokens: 1000,
              actual_tokens: 900,
              deviation: -100,
              commit: 'bbbbbbb',
              incidencia: null,
            }
          : {
              status: 'pending',
              test_cmd: null,
              estimated_tokens: 1000,
              actual_tokens: null,
              deviation: null,
              commit: null,
              incidencia: null,
            },
    },
  };
}

function makeFixtureSpecdir(repo, slug, verifierStatus) {
  const specDir = path.join(repo, 'docs', 'specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.md'), SPEC_MD);
  fs.writeFileSync(
    path.join(specDir, 'execution_plan.json'),
    JSON.stringify(EXECUTION_PLAN, null, 2)
  );
  fs.writeFileSync(
    path.join(specDir, 'execution_state.json'),
    JSON.stringify(makeExecutionState(verifierStatus), null, 2)
  );
  git(['add', '-A'], repo);
  git(['commit', '-m', `add ${slug} specdir`], repo);
  return specDir;
}

// Runs the full verify pipeline (minus manual confirmation, since this
// fixture has no [manual] ACs) and returns the assembled report plus every
// intermediate result, so each test can assert on the specific stage that
// matters to it.
function runPipeline(specDir) {
  const { checklist, coverageAcs, taskState } = loadSpecdir(specDir);
  const groundCheckResult = groundCheck(checklist, coverageAcs, taskState, { rerun });
  const tokenDeviationsResult = tokenDeviations(taskState);
  const degradedResult = degradedManualRouting(checklist, taskState);
  const incompleteCoverageResult = incompleteCoverage(checklist, coverageAcs, taskState);
  const report = assembleReport(
    checklist,
    groundCheckResult,
    null,
    degradedResult,
    incompleteCoverageResult,
    tokenDeviationsResult
  );
  return { checklist, groundCheckResult, degradedResult, incompleteCoverageResult, report };
}

test('R4.S1/AC8: a done verifier task closes AC-E2E green through the normal report flow (no user-override reason) and archives the SPECDIR', () => {
  const repo = makeTempRepo('verify-verifier-e2e-done-');
  const slug = 'verifier-demo-done';
  const specDir = makeFixtureSpecdir(repo, slug, 'done');

  const { groundCheckResult, degradedResult, report } = runPipeline(specDir);

  // Normal (non-degraded) path — the verifier task's `done` state alone is
  // what carries AC-E2E, not any manual/degraded override.
  assert.deepEqual(degradedResult, { degraded: false });
  assert.ok(
    groundCheckResult.green.includes('AC-E2E'),
    'AC-E2E re-runs green through groundCheck, same as any other auto AC'
  );
  assert.deepEqual(groundCheckResult.drift, [], 'no drift for either AC');

  const acE2E = report.acs.find((a) => a.ac_id === 'AC-E2E');
  assert.ok(acE2E, 'AC-E2E is present in the assembled report');
  assert.equal(acE2E.green, true, 'AC-E2E is green');
  assert.notEqual(acE2E.reason, 'user-override', 'AC-E2E is not green via a user-override reason');
  assert.equal(
    Object.prototype.hasOwnProperty.call(acE2E, 'reason'),
    false,
    'a green AC carries no reason field at all — confirming this is the plain normal-flow green path'
  );
  assert.equal(report.allGreen, true, 'the whole checklist (AC1 + AC-E2E) is green');

  const archiveResult = archiveIfGreen(specDir, report, { cwd: repo });
  const destination = path.join(repo, 'docs', 'specs', 'archived', slug);

  assert.equal(archiveResult.archived, true);
  assert.equal(archiveResult.destination, destination);
  assert.equal(fs.existsSync(specDir), false, 'original SPECDIR is gone');
  assert.equal(fs.existsSync(destination), true, 'SPECDIR archived under docs/specs/archived/<slug>/');

  fs.rmSync(repo, { recursive: true, force: true });
});

test('R4.S2/AC9: a still-pending verifier task leaves AC-E2E not-green, the run not-finished, and does not archive the SPECDIR', () => {
  const repo = makeTempRepo('verify-verifier-e2e-pending-');
  const slug = 'verifier-demo-pending';
  const specDir = makeFixtureSpecdir(repo, slug, 'pending');

  const { groundCheckResult, incompleteCoverageResult, report } = runPipeline(specDir);

  // groundCheck never places a not-yet-done covering task's AC in either of
  // its lists — that "not finished" story belongs to incompleteCoverage.
  assert.ok(!groundCheckResult.green.includes('AC-E2E'), 'AC-E2E is not green in groundCheck');
  assert.ok(
    !groundCheckResult.drift.some((d) => d.ac_id === 'AC-E2E'),
    'AC-E2E is not reported as drift either — it was never ready to verify'
  );

  const incompleteEntry = incompleteCoverageResult.find((e) => e.ac_id === 'AC-E2E');
  assert.ok(incompleteEntry, 'incompleteCoverage explains the still-pending verifier task');
  assert.equal(incompleteEntry.status, 'pending');
  assert.equal(incompleteEntry.reason, 'not-finished');

  const acE2E = report.acs.find((a) => a.ac_id === 'AC-E2E');
  assert.equal(acE2E.green, false, 'AC-E2E is not green while its verifier task is pending');
  assert.equal(acE2E.reason, 'not-finished', 'the run is reported not-finished, not drift or manual-degraded');
  assert.equal(report.allGreen, false, 'the overall report is not all-green');

  const archiveResult = archiveIfGreen(specDir, report, { cwd: repo });

  assert.equal(archiveResult.archived, false, 'archiving is refused while AC-E2E is not green');
  assert.equal(archiveResult.reason, 'not all ACs green');
  assert.ok(
    archiveResult.notGreenAcs.some((a) => a.ac_id === 'AC-E2E' && a.reason === 'not-finished'),
    'the refusal names AC-E2E and its not-finished reason'
  );

  const destination = path.join(repo, 'docs', 'specs', 'archived', slug);
  assert.equal(fs.existsSync(specDir), true, 'SPECDIR is left in place, unarchived');
  assert.equal(fs.existsSync(destination), false, 'no archived/<slug>/ directory was created');

  fs.rmSync(repo, { recursive: true, force: true });
});
