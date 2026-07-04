// T8-e2e: full-pipeline integration test for the verify skill (R-E2E,
// R-E2E.S1, AC-E2E). Wires the SEVEN prior building blocks
// (loadSpecdir → groundCheck → tokenDeviations → degradedManualRouting →
// incompleteCoverage → manualConfirmation → assembleReport → archiveIfGreen)
// against a real fixture SPECDIR inside an ISOLATED temp git repo. Never
// touches the real project repo or its docs/specs/.
//
// Scenario (from R-E2E.S1 / AC-E2E): a SPECDIR with 2 [auto] ACs (each
// covered by one done task, both green on re-run — one of them deviated
// >2x in tokens) and 1 [manual] AC the user confirms. Expected outcome:
// the whole checklist is green, the deviated task is surfaced
// informationally, and the SPECDIR is git-mv'd to docs/specs/archived/<slug>/
// with a commit on the current branch.

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
  manualConfirmation,
  assembleReport,
  archiveIfGreen,
} from '../scripts/verify-tools.mjs';
// Use the REAL rerun from plan-executor's exec/verify.mjs (the same
// deterministic re-run the spec says verify reuses). Each fixture task's
// stored test_cmd is the trivially-true shell command "true", so the re-run
// genuinely spawns a subprocess and passes, exercising the real injected
// rerun contract rather than a hand-rolled fake.
import { rerun } from '../scripts/exec/verify.mjs';

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  }
  return res.stdout.trim();
}

// Isolated temp git repo on a neutral 'work' branch, exactly like the
// sibling git-touching tests (verify-report-archive.test.mjs / exec/git.test.mjs).
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

const SPEC_MD = `# Spec: e2e demo

## Purpose

A demo spec exercising the full verify pipeline end to end.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — the first auto AC, covered by task T1 whose test re-runs green.
- [ ] AC2 → R2.S1 [auto] — the second auto AC, covered by task T2 (also green on re-run, but its
  task blew past its token estimate).
- [ ] AC3 → R3.S1 [manual] — a manual AC the user must confirm explicitly by hand.

## Assumptions

None.
`;

// coverage.acs connects each auto AC to ONE task (two different tasks). The
// plan.tasks array is present for realism only — verify's pipeline reads the
// coverage map + execution_state, not the plan task bodies.
const EXECUTION_PLAN = {
  tasks: [
    { id: 'T1', title: 'implement AC1', satisfies_acs: ['AC1'] },
    { id: 'T2', title: 'implement AC2', satisfies_acs: ['AC2'] },
    { id: 'T3', title: 'supporting work', satisfies_acs: [] },
  ],
  coverage: {
    acs: {
      AC1: ['T1'],
      AC2: ['T2'],
    },
  },
};

// Three done tasks:
//  - T1: covers AC1, test_cmd re-runs green, tokens in range (not deviated).
//  - T2: covers AC2, test_cmd re-runs green, actual 3000 > 2x estimated 1000 (deviated).
//  - T3: no AC coverage, present for realism (done, in-range tokens).
const EXECUTION_STATE = {
  tasks: {
    T1: {
      status: 'done',
      test_cmd: 'true',
      estimated_tokens: 1000,
      actual_tokens: 900,
      deviation: -100,
      commit: 'aaaaaaa',
      incidencia: null,
    },
    T2: {
      status: 'done',
      test_cmd: 'true',
      estimated_tokens: 1000,
      actual_tokens: 3000,
      deviation: 2000,
      commit: 'bbbbbbb',
      incidencia: null,
    },
    T3: {
      status: 'done',
      test_cmd: 'true',
      estimated_tokens: 500,
      actual_tokens: 400,
      deviation: -100,
      commit: 'ccccccc',
      incidencia: null,
    },
  },
};

function makeFixtureSpecdir(repo, slug) {
  const specDir = path.join(repo, 'docs', 'specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.md'), SPEC_MD);
  fs.writeFileSync(
    path.join(specDir, 'execution_plan.json'),
    JSON.stringify(EXECUTION_PLAN, null, 2)
  );
  fs.writeFileSync(
    path.join(specDir, 'execution_state.json'),
    JSON.stringify(EXECUTION_STATE, null, 2)
  );
  git(['add', '-A'], repo);
  git(['commit', '-m', `add ${slug} specdir`], repo);
  return specDir;
}

test('R-E2E.S1/AC-E2E: full verify pipeline over a 2-auto + 1-manual fixture reports all-green (with the deviated task surfaced) and archives the SPECDIR with a commit', () => {
  const repo = makeTempRepo('verify-e2e-');
  const slug = 'e2e-demo';
  const specDir = makeFixtureSpecdir(repo, slug);

  // 1. Load the three SPECDIR inputs.
  const { checklist, coverageAcs, taskState } = loadSpecdir(specDir);

  // Sanity: the fixture spec.md actually parsed into the 3 expected ACs.
  assert.equal(checklist.length, 3, 'spec.md AC checklist should parse 3 ACs');
  const byId = new Map(checklist.map((c) => [c.ac_id, c]));
  assert.equal(byId.get('AC1').tag, 'auto');
  assert.equal(byId.get('AC2').tag, 'auto');
  assert.equal(byId.get('AC3').tag, 'manual');
  assert.deepEqual(coverageAcs, { AC1: ['T1'], AC2: ['T2'] });
  assert.notEqual(taskState, null, 'execution_state.json present => non-null taskState');

  // 2. Ground check the [auto] ACs via the real rerun against test_cmd "true".
  const groundCheckResult = groundCheck(checklist, coverageAcs, taskState, { rerun });
  assert.deepEqual(
    [...groundCheckResult.green].sort(),
    ['AC1', 'AC2'],
    'both auto ACs re-run green'
  );
  assert.deepEqual(groundCheckResult.drift, [], 'no drift');

  // 3. Token deviations — exactly T2 (3000 > 2x1000); T1 and T3 in range.
  const tokenDeviationsResult = tokenDeviations(taskState);
  assert.equal(tokenDeviationsResult.length, 1, 'exactly one deviated task');
  const dev = tokenDeviationsResult[0];
  assert.equal(dev.task_id, 'T2');
  assert.equal(dev.actual_tokens, 3000);
  assert.equal(dev.estimated_tokens, 1000);
  assert.ok(
    typeof dev.suggestion === 'string' && dev.suggestion.length > 0,
    'deviated task carries a suggestion'
  );

  // 4. Degraded routing — taskState is non-null, so this is the normal path.
  const degradedResult = degradedManualRouting(checklist, taskState);
  assert.deepEqual(degradedResult, { degraded: false });

  // 5. Incomplete coverage — both covering tasks are done, so nothing to report.
  const incompleteCoverageResult = incompleteCoverage(checklist, coverageAcs, taskState);
  assert.deepEqual(incompleteCoverageResult, []);

  // 6. Manual confirmation over just the [manual] ACs, and SIMULATE the user
  //    confirming AC3 (no interactive prompt — .confirm() is what "the user
  //    confirms" means in an automated E2E test).
  const manualItems = checklist.filter((c) => c.tag === 'manual');
  assert.deepEqual(
    manualItems.map((c) => c.ac_id),
    ['AC3']
  );
  const manualTracker = manualConfirmation(manualItems);
  manualTracker.confirm('AC3');

  // 7. Assemble the final report from every prior check.
  const report = assembleReport(
    checklist,
    groundCheckResult,
    manualTracker,
    degradedResult,
    incompleteCoverageResult,
    tokenDeviationsResult
  );

  // 8. Assertions on the assembled report.
  assert.equal(report.allGreen, true, 'whole checklist is green');

  const reportById = new Map(report.acs.map((a) => [a.ac_id, a]));
  assert.equal(reportById.get('AC1').green, true, 'AC1 (auto) green');
  assert.equal(reportById.get('AC2').green, true, 'AC2 (auto) green');
  assert.equal(reportById.get('AC3').green, true, 'AC3 (manual, confirmed) green');
  assert.equal(reportById.get('AC3').tag, 'manual');

  // The deviated task rides along informationally and did NOT block allGreen.
  assert.equal(report.deviatedTasks.length, 1);
  assert.deepEqual(report.deviatedTasks, tokenDeviationsResult);
  assert.equal(report.deviatedTasks[0].task_id, 'T2');
  assert.equal(report.deviatedTasks[0].actual_tokens, 3000);
  assert.equal(report.deviatedTasks[0].estimated_tokens, 1000);
  assert.ok(report.deviatedTasks[0].suggestion.length > 0);

  // 9. Archive: all green => git mv into docs/specs/archived/<slug>/ + commit.
  const beforeLog = git(['log', '--oneline'], repo);
  const branchBefore = git(['rev-parse', '--abbrev-ref', 'HEAD'], repo);

  const archiveResult = archiveIfGreen(specDir, report, { cwd: repo });

  const destination = path.join(repo, 'docs', 'specs', 'archived', slug);
  assert.equal(archiveResult.archived, true);
  assert.equal(archiveResult.destination, destination);
  assert.ok(
    typeof archiveResult.commit === 'string' && archiveResult.commit.length > 0,
    'archive produced a commit hash'
  );

  // The fixture directory moved inside the temp repo.
  assert.equal(fs.existsSync(specDir), false, 'original SPECDIR is gone');
  assert.equal(fs.existsSync(destination), true, 'archived SPECDIR exists');
  assert.equal(
    fs.readFileSync(path.join(destination, 'spec.md'), 'utf8'),
    SPEC_MD,
    'archived spec.md content is intact (git mv did not rewrite it)'
  );

  // A commit exists on the CURRENT branch (still 'work', no new branch created).
  const afterLog = git(['log', '--oneline'], repo);
  assert.notEqual(afterLog, beforeLog, 'a new commit was created');
  assert.ok(afterLog.includes(archiveResult.commit), 'the commit is on HEAD');
  assert.equal(
    git(['rev-parse', '--abbrev-ref', 'HEAD'], repo),
    branchBefore,
    'archiving stayed on the current branch'
  );

  // Clean up: never leave stray temp directories behind.
  fs.rmSync(repo, { recursive: true, force: true });
});
