// test/verify-real-cost.test.mjs — T6-verify-report: the verify report
// carries a `real_cost` block (orchestrator/subagents/total, cache_read
// folded in) computed by T4's computeRealCost, ALONGSIDE the pre-existing
// per-task actual_tokens/estimated_tokens fields (tokenDeviations /
// deviatedTasks) — additive only, neither field displaces the other.
//
// Fixture convention for the session tree mirrors
// test/exec/real-cost.test.mjs (a tmpdir with a flat <session>.jsonl plus an
// optional sibling subagents/ dir).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assembleReport, tokenDeviations } from '../scripts/verify-tools.mjs';
import { computeRealCost } from '../scripts/exec/real-cost.mjs';
import { costForUsage } from '../scripts/token-cost.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'scripts', 'verify-tools.mjs');

function makeFixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'verify-real-cost-fixture-'));
}

// Same writeSessionTree convention as test/exec/real-cost.test.mjs.
function writeSessionTree(orchestratorLines, subagents) {
  const dir = makeFixtureDir();
  const sessionFile = path.join(dir, 'session.jsonl');
  fs.writeFileSync(
    sessionFile,
    orchestratorLines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );

  if (Array.isArray(subagents)) {
    const subagentsDir = path.join(dir, 'subagents');
    fs.mkdirSync(subagentsDir);
    for (const sub of subagents) {
      const transcriptFile = path.join(subagentsDir, `agent-${sub.id}.jsonl`);
      fs.writeFileSync(
        transcriptFile,
        sub.lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
      );
      const metaFile = path.join(subagentsDir, `agent-${sub.id}.meta.json`);
      fs.writeFileSync(metaFile, JSON.stringify({ description: sub.description }));
    }
  }

  return sessionFile;
}

function sumUsageTokens(usage) {
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

// Minimal per-task fixture, same shape as verify-token-deviation.test.mjs's
// makeTask, filled in only with the fields tokenDeviations cares about.
function makeTask({ estimated_tokens, actual_tokens }) {
  return {
    status: 'done',
    estimated_tokens,
    actual_tokens,
    deviation: actual_tokens == null ? null : actual_tokens - estimated_tokens,
    test_cmd: 'true',
    commit: 'abc123',
    incidencia: null,
  };
}

// A minimal single-AC checklist, all-green, so assembleReport's own verdict
// logic isn't what's under test here — only the additive real_cost/
// deviatedTasks coexistence is.
const CHECKLIST = [
  { ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', description: 'sample auto AC.' },
];
const GROUND_CHECK_RESULT = { green: ['AC1'], drift: [] };
const DEGRADED_RESULT = { degraded: false };
const INCOMPLETE_COVERAGE_RESULT = [];

test('R5.S1: assembleReport folds a real computeRealCost result into a `real_cost` key, alongside the pre-existing per-task actual_tokens/estimated_tokens (deviatedTasks) fields, without dropping either', () => {
  const preUsage = {
    input_tokens: 4000, output_tokens: 1000,
    cache_read_input_tokens: 500, cache_creation_input_tokens: 0,
  };
  const postUsage = {
    input_tokens: 2000, output_tokens: 600,
    cache_read_input_tokens: 300, cache_creation_input_tokens: 0,
  };
  const subUsage = {
    input_tokens: 1500, output_tokens: 400,
    cache_read_input_tokens: 200, cache_creation_input_tokens: 0,
  };
  const branch = 'feat/shared-scripts-and-real-cost';

  const sessionFile = writeSessionTree(
    [
      { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: preUsage } },
      { type: 'user', tool_result: { branch } },
      { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: postUsage } },
    ],
    [
      {
        id: 'sub1',
        description: 'fixture subagent',
        lines: [
          { type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: subUsage } },
        ],
      },
    ],
  );

  // Real, non-mocked computeRealCost call — same convention T4's own tests use.
  const realCostResult = computeRealCost({ sessionPath: sessionFile, boundary: branch });
  assert.equal(realCostResult.unavailable, undefined, 'sanity: fixture must produce a real result');

  // Pre-existing per-task token bookkeeping (T2 blew past its estimate).
  const taskState = {
    T1: makeTask({ estimated_tokens: 500, actual_tokens: 600 }), // in range
    T2: makeTask({ estimated_tokens: 500, actual_tokens: 1200 }), // > 2x, deviated
  };
  const tokenDeviationsResult = tokenDeviations(taskState);
  assert.equal(tokenDeviationsResult.length, 1, 'sanity: exactly one deviated task');

  const report = assembleReport(
    CHECKLIST,
    GROUND_CHECK_RESULT,
    null,
    DEGRADED_RESULT,
    INCOMPLETE_COVERAGE_RESULT,
    tokenDeviationsResult,
    realCostResult,
  );

  // Pre-existing field: still present, untouched.
  assert.equal(report.deviatedTasks.length, 1);
  assert.equal(report.deviatedTasks[0].task_id, 'T2');
  assert.equal(report.deviatedTasks[0].actual_tokens, 1200);
  assert.equal(report.deviatedTasks[0].estimated_tokens, 500);

  // New field: real_cost, with orchestrator + subagents portions.
  assert.ok(report.real_cost, 'report must carry a real_cost block');
  assert.equal(report.real_cost.unavailable, undefined);

  const expectedOrchTokens = sumUsageTokens(postUsage);
  const expectedOrchCost = costForUsage('sonnet', postUsage);
  assert.equal(report.real_cost.orchestrator.tokens, expectedOrchTokens);
  assert.ok(Math.abs(report.real_cost.orchestrator.usd - expectedOrchCost) < 0.0001);

  const expectedSubTokens = sumUsageTokens(subUsage);
  const expectedSubCost = costForUsage('haiku', subUsage);
  assert.equal(report.real_cost.subagents.tokens, expectedSubTokens);
  assert.ok(Math.abs(report.real_cost.subagents.usd - expectedSubCost) < 0.0001);

  // cache_read is folded into the totals (both fixtures used non-zero
  // cache_read_input_tokens): sanity that it wasn't dropped anywhere.
  assert.ok(postUsage.cache_read_input_tokens > 0, 'sanity: fixture exercises cache_read (orchestrator)');
  assert.ok(subUsage.cache_read_input_tokens > 0, 'sanity: fixture exercises cache_read (subagents)');
  assert.equal(
    report.real_cost.total.tokens,
    report.real_cost.orchestrator.tokens + report.real_cost.subagents.tokens,
  );

  fs.rmSync(path.dirname(sessionFile), { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Wiring: the `report` CLI subcommand (buildReport -> cmdReport) actually
// reads execution_state.json's `branch` and threads it through to
// computeRealCost, surfacing a `real_cost` key on the printed report object
// — not just at the assembleReport unit level tested above.
// ---------------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function buildFixture(repo, slug) {
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);

  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });

  fs.writeFileSync(
    path.join(absSpecDir, 'spec.md'),
    `# Spec: ${slug}\n\n## Purpose\n\nFixture.\n\n## Acceptance Criteria\n\n- [ ] AC1 → R1.S1 [auto] — sample automatic criterion.\n`,
  );
  fs.writeFileSync(
    path.join(absSpecDir, 'execution_plan.json'),
    JSON.stringify({ tasks: [{ task_id: 'T1' }], coverage: { acs: { AC1: ['T1'] } } }, null, 2),
  );
  fs.writeFileSync(
    path.join(absSpecDir, 'execution_state.json'),
    JSON.stringify(
      {
        plan_id: `${slug}-plan`,
        branch: `feat/${slug}`,
        pause: null,
        tasks: {
          T1: {
            status: 'done', estimated_tokens: 100, actual_tokens: 100, deviation: 0,
            test_cmd: 'true', commit: 'abc1234', incidencia: null,
          },
        },
      },
      null,
      2,
    ),
  );

  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture: ' + slug]);
  return specDir;
}

test('R5.S1 (wiring): `report` CLI output carries a top-level real_cost key, alongside the existing deviatedTasks per-task actual_tokens/estimated_tokens field', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-real-cost-cli-'));
  try {
    const specDir = buildFixture(repo, 'real-cost-demo');

    const out = execFileSync('node', [CLI, 'report', specDir], {
      cwd: repo, encoding: 'utf8', input: '', timeout: 10000,
    });
    const report = JSON.parse(out);

    assert.equal(report.status, 'report');
    assert.ok('deviatedTasks' in report, 'pre-existing deviatedTasks field must still be present');
    assert.ok('real_cost' in report, 'report must carry a real_cost key');
    assert.ok(report.real_cost !== undefined, 'real_cost must not be undefined');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
