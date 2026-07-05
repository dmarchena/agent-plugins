// Unit tests for T7-report-archive: assembleReport + archiveIfGreen
// (R7, R7.S1, R7.S2, R7.S3). Git-touching tests always run against an
// isolated fs.mkdtempSync temp repo — never the real project repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assembleReport,
  archiveIfGreen,
  manualConfirmation,
} from '../scripts/verify-tools.mjs';

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  }
  return res.stdout.trim();
}

// ---------------------------------------------------------------------------
// assembleReport
// ---------------------------------------------------------------------------

test('assembleReport: auto AC present in groundCheckResult.green is reported green', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', description: 'auto ac' },
  ];
  const groundCheckResult = { green: ['AC1'], drift: [] };
  const incompleteCoverageResult = [];
  const report = assembleReport(
    checklist,
    groundCheckResult,
    null,
    { degraded: false },
    incompleteCoverageResult,
    []
  );
  const ac1 = report.acs.find((a) => a.ac_id === 'AC1');
  assert.equal(ac1.green, true);
  assert.equal(report.allGreen, true);
});

test('assembleReport: auto AC present in groundCheckResult.drift is reported not-green with drift details', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', description: 'auto ac' },
  ];
  const driftEntry = { ac_id: 'AC1', task_id: 'T1', test_cmd: 'npm test', output: 'FAIL' };
  const groundCheckResult = { green: [], drift: [driftEntry] };
  const report = assembleReport(
    checklist,
    groundCheckResult,
    null,
    { degraded: false },
    [],
    []
  );
  const ac1 = report.acs.find((a) => a.ac_id === 'AC1');
  assert.equal(ac1.green, false);
  assert.equal(ac1.reason, 'drift');
  assert.ok(ac1.details);
  assert.equal(report.allGreen, false);
});

test('assembleReport: auto AC present in incompleteCoverageResult is reported not-green with that reason', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', description: 'auto ac' },
  ];
  const groundCheckResult = { green: [], drift: [] };
  const incompleteEntry = {
    ac_id: 'AC1',
    task_id: 'T1',
    status: 'blocked',
    incidencia: 'flaky infra',
    reason: 'blocked-or-skipped',
  };
  const report = assembleReport(
    checklist,
    groundCheckResult,
    null,
    { degraded: false },
    [incompleteEntry],
    []
  );
  const ac1 = report.acs.find((a) => a.ac_id === 'AC1');
  assert.equal(ac1.green, false);
  assert.equal(ac1.reason, 'blocked-or-skipped');
  assert.equal(report.allGreen, false);
});

test('assembleReport: manual AC confirmed via manualTracker is reported green', () => {
  const checklist = [
    { ac_id: 'AC2', ref: 'R2.S1', tag: 'manual', description: 'manual ac' },
  ];
  const tracker = manualConfirmation(checklist);
  tracker.confirm('AC2');
  const report = assembleReport(
    checklist,
    { green: [], drift: [] },
    tracker,
    { degraded: false },
    [],
    []
  );
  const ac2 = report.acs.find((a) => a.ac_id === 'AC2');
  assert.equal(ac2.green, true);
  assert.equal(report.allGreen, true);
});

test('assembleReport: manual AC left unconfirmed via manualTracker is reported not-green', () => {
  const checklist = [
    { ac_id: 'AC2', ref: 'R2.S1', tag: 'manual', description: 'manual ac' },
  ];
  const tracker = manualConfirmation(checklist);
  const report = assembleReport(
    checklist,
    { green: [], drift: [] },
    tracker,
    { degraded: false },
    [],
    []
  );
  const ac2 = report.acs.find((a) => a.ac_id === 'AC2');
  assert.equal(ac2.green, false);
  assert.equal(ac2.reason, 'unanswered');
  assert.equal(report.allGreen, false);
});

test('assembleReport: degraded mode routes both auto and manual ACs through the tracker regardless of tag', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', description: 'auto ac' },
    { ac_id: 'AC2', ref: 'R2.S1', tag: 'manual', description: 'manual ac' },
  ];
  const tracker = manualConfirmation(checklist);
  tracker.confirm('AC1');
  // AC2 left unanswered.
  const degradedResult = {
    degraded: true,
    reason: 'no execution_state.json',
    tracker,
  };
  const report = assembleReport(
    checklist,
    { green: [], drift: [] }, // must be ignored entirely in degraded mode
    null,
    degradedResult,
    [{ ac_id: 'AC1', task_id: 'x', status: 'irrelevant', reason: 'not-finished' }], // must be ignored too
    []
  );
  const ac1 = report.acs.find((a) => a.ac_id === 'AC1');
  const ac2 = report.acs.find((a) => a.ac_id === 'AC2');
  assert.equal(ac1.green, true);
  assert.equal(ac2.green, false);
  assert.equal(ac2.reason, 'manual-degraded');
  assert.equal(report.allGreen, false);
});

test('assembleReport: a deviatedTasks entry never blocks allGreen (R6.S2/AC8 re-verified at assembly level)', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', description: 'auto ac' },
  ];
  const groundCheckResult = { green: ['AC1'], drift: [] };
  const deviatedTasks = [
    {
      task_id: 'T1',
      actual_tokens: 5000,
      estimated_tokens: 1000,
      suggestion: 'review this',
    },
  ];
  const report = assembleReport(
    checklist,
    groundCheckResult,
    null,
    { degraded: false },
    [],
    deviatedTasks
  );
  assert.equal(report.allGreen, true);
  assert.deepEqual(report.deviatedTasks, deviatedTasks);
});

// ---------------------------------------------------------------------------
// archiveIfGreen — R7.S1 / AC9, R7.S2 / AC10, R7.S3 / AC11
// ---------------------------------------------------------------------------

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

function makeSpecDir(repo, slug) {
  const specDir = path.join(repo, 'docs', 'specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.md'), '# demo spec\n');
  fs.writeFileSync(
    path.join(specDir, 'execution_plan.json'),
    JSON.stringify({ tasks: [] }, null, 2)
  );
  git(['add', '-A'], repo);
  git(['commit', '-m', 'add demo specdir'], repo);
  return specDir;
}

test('R7.S1/AC9: a fully green checklist moves the whole SPECDIR to docs/specs/archived/<slug>/ with git mv, commits on the current branch, and the report confirms the final path', () => {
  const repo = makeTempRepo('verify-archive-green-');
  const specDir = makeSpecDir(repo, 'demo');

  const beforeLog = git(['log', '--oneline'], repo);

  const allGreenReport = {
    allGreen: true,
    acs: [{ ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', green: true }],
    deviatedTasks: [],
  };

  const result = archiveIfGreen(specDir, allGreenReport, { cwd: repo });

  const destination = path.join(repo, 'docs', 'specs', 'archived', 'demo');
  assert.equal(result.archived, true);
  assert.equal(result.destination, destination);
  assert.ok(typeof result.commit === 'string' && result.commit.length > 0);

  assert.equal(fs.existsSync(specDir), false);
  assert.equal(fs.existsSync(destination), true);
  assert.equal(
    fs.readFileSync(path.join(destination, 'spec.md'), 'utf8'),
    '# demo spec\n'
  );

  const afterLog = git(['log', '--oneline'], repo);
  assert.notEqual(afterLog, beforeLog);
  assert.ok(afterLog.includes(result.commit));

  fs.rmSync(repo, { recursive: true, force: true });
});

test('R7.S2/AC10: a SPECDIR with at least one not-green AC runs no git mv or commit, and the final report lists exactly the not-green ACs with their reason', () => {
  const repo = makeTempRepo('verify-archive-notgreen-');
  const specDir = makeSpecDir(repo, 'demo2');
  const destination = path.join(repo, 'docs', 'specs', 'archived', 'demo2');

  const beforeLog = git(['log', '--oneline'], repo);

  const notGreenReport = {
    allGreen: false,
    acs: [
      { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', green: true },
      {
        ac_id: 'AC2',
        ref: 'R2.S1',
        tag: 'manual',
        green: false,
        reason: 'unanswered',
      },
    ],
    deviatedTasks: [],
  };

  const result = archiveIfGreen(specDir, notGreenReport, { cwd: repo });

  assert.equal(result.archived, false);
  assert.deepEqual(result.notGreenAcs, [{ ac_id: 'AC2', reason: 'unanswered' }]);

  // Nothing moved, nothing committed.
  assert.equal(fs.existsSync(specDir), true);
  assert.equal(fs.existsSync(destination), false);
  const afterLog = git(['log', '--oneline'], repo);
  assert.equal(afterLog, beforeLog);

  fs.rmSync(repo, { recursive: true, force: true });
});

test('R7.S3/AC11: a pre-existing docs/specs/archived/<slug>/ rejects the git mv, leaves source and destination untouched, and the report names the collision', () => {
  const repo = makeTempRepo('verify-archive-collision-');
  const specDir = makeSpecDir(repo, 'demo3');
  const destination = path.join(repo, 'docs', 'specs', 'archived', 'demo3');

  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'preexisting.txt'), 'do not touch\n');
  git(['add', '-A'], repo);
  git(['commit', '-m', 'pre-existing collision dir'], repo);

  const beforeLog = git(['log', '--oneline'], repo);

  const allGreenReport = {
    allGreen: true,
    acs: [{ ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', green: true }],
    deviatedTasks: [],
  };

  const result = archiveIfGreen(specDir, allGreenReport, { cwd: repo });

  assert.equal(result.archived, false);
  assert.equal(result.reason, 'collision');
  assert.equal(result.destination, destination);

  // Source untouched.
  assert.equal(fs.existsSync(specDir), true);
  assert.equal(
    fs.readFileSync(path.join(specDir, 'spec.md'), 'utf8'),
    '# demo spec\n'
  );
  // Destination untouched (still only has the pre-existing file).
  assert.equal(
    fs.readFileSync(path.join(destination, 'preexisting.txt'), 'utf8'),
    'do not touch\n'
  );
  assert.equal(fs.existsSync(path.join(destination, 'spec.md')), false);

  const afterLog = git(['log', '--oneline'], repo);
  assert.equal(afterLog, beforeLog);

  fs.rmSync(repo, { recursive: true, force: true });
});
