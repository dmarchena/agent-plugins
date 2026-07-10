// test/exec/report-real-cost.test.mjs — T5-exec-report-signal
//
// R5.S1: the `report` subcommand's JSON output must carry both the
// pre-existing tokens.real/estimated fields AND a new real_cost block
// (orchestrator/subagents/total, cache_read included) sourced from
// exec/real-cost.mjs's computeRealCost().
// R5.S2: the report's over-budget indicator must be driven by real_cost,
// not the blind "2x actual_tokens" check — and must never be able to
// pause/halt the run (that pause path was already removed in
// T2-drop-budget-pause; this only adds a new, additional, report-only
// field).
//
// CLI fixture conventions mirror test/exec/next-no-pause.test.mjs (repo in
// a tmpdir, spec.md + execution_plan.json on disk, exec-tools.mjs driven as
// a subprocess). The real_cost session fixture mirrors
// test/exec/real-cost.test.mjs's writeSessionTree, pointed at via the
// TOKEN_COST_PROJECTS_ROOT env var so the test never touches the real
// ~/.claude/projects (see scripts/token-cost.mjs's projectsRootFrom).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { exceeds, realCostOverBudget } from '../../scripts/exec/budget.mjs';
import { initState, recordResult } from '../../scripts/exec/state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

// --- shared single-task fixture -------------------------------------------

const SPEC = `# Spec: Report Real-Cost Fixture

## Purpose

Minimal fixture for the exec phase's report real_cost wiring.

## Scope

**In scope:**
- One requirement, one task.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — Only requirement

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

function makePlan(planId, estimatedTokensTotal) {
  return {
    plan_id: planId,
    project_name: 'Report Real-Cost Fixture',
    global_objective: 'Verify report carries real_cost and a real_cost-derived over-budget indicator.',
    source_spec: 'spec.md',
    confidence: 'low',
    estimated_tokens_total: estimatedTokensTotal,
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
    ],
    coverage: {
      requirements: { R1: ['task-a'] },
      acs: { AC1: ['task-a'] },
    },
  };
}

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args, env) {
  const stdout = execFileSync('node', [CLI, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
  return JSON.parse(stdout);
}

function simulateExecutor(repo, taskId, ref) {
  fs.mkdirSync(path.join(repo, 'impl'), { recursive: true });
  fs.mkdirSync(path.join(repo, 't'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'impl', `${taskId}.mjs`), `export const done = true;\n`);
  fs.writeFileSync(
    path.join(repo, 't', `${taskId}.test.mjs`),
    `import { test } from 'node:test';\n`
    + `import assert from 'node:assert';\n`
    + `import { done } from '../impl/${taskId}.mjs';\n`
    + `test('${taskId} satisfies ${ref}', () => { assert.strictEqual(done, true); });\n`,
  );
  return `node --test t/${taskId}.test.mjs`;
}

function runTask(repo, specDir, taskId, ref, tokens) {
  const testCmd = simulateExecutor(repo, taskId, ref);
  return cli(repo, [
    'complete', specDir, taskId,
    '--tokens', String(tokens),
    '--test-cmd', testCmd,
    '--rojo', 'fail',
    '--verde', 'pass',
    '--files', `impl/${taskId}.mjs,t/${taskId}.test.mjs`,
  ]);
}

function makeRepo(slug, planId, estimatedTokensTotal) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-report-real-cost-'));
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), SPEC);
  fs.writeFileSync(
    path.join(absSpecDir, 'execution_plan.json'),
    JSON.stringify(makePlan(planId, estimatedTokensTotal), null, 2),
  );

  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture']);

  return { repo, specDir, absSpecDir };
}

// Mirrors test/exec/real-cost.test.mjs's writeSessionTree: a flat
// <session>.jsonl plus a subagents/agent-<id>.jsonl + .meta.json, rooted
// under a fresh "project" dir inside a fresh "projects root" dir, so
// TOKEN_COST_PROJECTS_ROOT can point straight at it (newest-active-project
// + newest-session-in-that-project fallback, since cmdReport only ever
// passes `boundary`, never an explicit session target).
function writeProjectsRootFixture(branch, postUsage, subUsage) {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-real-cost-root-'));
  const projectDir = path.join(projectsRoot, 'fixture-project');
  fs.mkdirSync(projectDir, { recursive: true });

  const sessionFile = path.join(projectDir, 'session.jsonl');
  const lines = [
    // Pre-boundary noise: must be excluded from the orchestrator slice.
    { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 9000, output_tokens: 9000, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 } } },
    // The boundary line: the run's branch name, as `init` would echo it.
    { type: 'user', tool_result: { branch } },
    { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: postUsage } },
  ];
  fs.writeFileSync(sessionFile, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

  const subagentsDir = path.join(projectDir, 'session', 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(subagentsDir, 'agent-fixture1.jsonl'),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: subUsage } }) + '\n',
  );
  fs.writeFileSync(
    path.join(subagentsDir, 'agent-fixture1.meta.json'),
    JSON.stringify({ description: 'fixture subagent' }),
  );

  return projectsRoot;
}

function sumUsageTokens(usage) {
  return (
    (usage.input_tokens || 0)
    + (usage.output_tokens || 0)
    + (usage.cache_read_input_tokens || 0)
    + (usage.cache_creation_input_tokens || 0)
  );
}

test('R5.S1: exec report carries both the pre-existing tokens.real/estimated fields and a new real_cost block with orchestrator/subagents portions including cache_read', () => {
  const { repo, specDir } = makeRepo('report-real-cost-r5s1', 'report-real-cost-r5s1-plan', 5000);
  try {
    const init = cli(repo, ['init', specDir]);
    assert.ok(init.branch, 'init must record a branch to use as the real_cost boundary');

    runTask(repo, specDir, 'task-a', 'R1.S1', 1200);

    const postUsage = { input_tokens: 2000, output_tokens: 600, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 };
    const subUsage = { input_tokens: 1500, output_tokens: 400, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 };
    const projectsRoot = writeProjectsRootFixture(init.branch, postUsage, subUsage);

    const report = cli(repo, ['report', specDir], { TOKEN_COST_PROJECTS_ROOT: projectsRoot });

    // Pre-existing fields, unchanged.
    assert.equal(report.tokens.real, 1200);
    assert.equal(report.tokens.estimated, 1000);

    // New real_cost block.
    assert.ok(report.real_cost, 'report must include a real_cost field');
    assert.equal(report.real_cost.unavailable, undefined, 'expected a real real_cost result for this fixture, not unavailable');
    assert.equal(report.real_cost.orchestrator.tokens, sumUsageTokens(postUsage));
    assert.equal(report.real_cost.subagents.tokens, sumUsageTokens(subUsage));
    assert.equal(
      report.real_cost.total.tokens,
      report.real_cost.orchestrator.tokens + report.real_cost.subagents.tokens,
    );

    // cache_read must be folded in: both fixtures used non-zero cache_read,
    // so a correct total is strictly greater than input+output alone.
    assert.ok(postUsage.cache_read_input_tokens > 0, 'sanity: fixture exercises cache_read');
    assert.ok(subUsage.cache_read_input_tokens > 0, 'sanity: fixture exercises cache_read');
    assert.ok(report.real_cost.orchestrator.usd > 0);
    assert.ok(report.real_cost.subagents.usd > 0);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('R5.S2: when 2x actual_tokens and real_cost disagree, the report over-budget indicator follows real_cost, and no CLI subcommand pauses or halts the run', () => {
  // --- Unit-level: construct a case where the two signals disagree. ------
  const samplePlan = {
    plan_id: 'plan-disagree-001',
    source_spec: 'spec.md',
    tasks: [{ task_id: 'task-a', estimated_tokens: 1000, dependencies: [] }],
  };
  const state = initState(samplePlan);
  // actual_tokens stays modest: the blind 2x check says "not exceeded".
  recordResult(state, 'task-a', { status: 'done', actual_tokens: 1200 });
  const blind = exceeds(state);
  assert.equal(blind.exceeded, false, 'sanity: the blind actual_tokens check must NOT flag this run as over budget');

  // But the transcript-measured real_cost for the same run is far larger
  // than the plan's total estimated budget: the real_cost-derived indicator
  // must flag this as over budget even though the blind check didn't.
  const estimatedTokensTotal = 3000;
  const realCost = {
    orchestrator: { tokens: 40000, usd: 4 },
    subagents: { tokens: 20000, usd: 2 },
    total: { tokens: 60000, usd: 6 },
  };
  const indicator = realCostOverBudget(realCost, estimatedTokensTotal);
  assert.equal(indicator.available, true);
  assert.equal(indicator.over_budget, true, 'real_cost-derived indicator must flag over-budget when the blind check did not');
  assert.notEqual(indicator.over_budget, blind.exceeded, 'the two signals must disagree in this fixture, by construction');

  // realCostOverBudget must be pure: no state mutation, no process.exit.
  assert.equal(state.pause, null, 'realCostOverBudget must not touch execution state');

  // --- CLI-level: confirm nothing about this ever pauses/halts a run. ----
  const { repo, specDir, absSpecDir } = makeRepo('report-real-cost-r5s2', 'report-real-cost-r5s2-plan', estimatedTokensTotal);
  try {
    const init = cli(repo, ['init', specDir]);

    // Same disagreement, wired through the real report this time: modest
    // actual_tokens, but a real_cost fixture whose total dwarfs the plan's
    // estimated_tokens_total.
    runTask(repo, specDir, 'task-a', 'R1.S1', 1200);

    const postUsage = { input_tokens: 30000, output_tokens: 10000, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 };
    const subUsage = { input_tokens: 15000, output_tokens: 5000, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 };
    const projectsRoot = writeProjectsRootFixture(init.branch, postUsage, subUsage);

    const report = cli(repo, ['report', specDir], { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(report.real_cost_over_budget.over_budget, true, 'report-level indicator must also flag this run as over budget');
    assert.notEqual(report.status, 'paused');

    // `next` must still compute purely from DAG state, never pause,
    // regardless of how over-budget real_cost says this run is.
    const next = cli(repo, ['next', specDir], { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.notEqual(next.status, 'paused');

    const state2 = JSON.parse(fs.readFileSync(path.join(absSpecDir, 'execution_state.json'), 'utf8'));
    assert.equal(state2.pause, null, 'no pause entry must ever be written to execution_state.json by this indicator');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
