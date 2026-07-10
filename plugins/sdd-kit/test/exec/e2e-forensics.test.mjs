// test/exec/e2e-forensics.test.mjs — R-E2E.S1 / AC-E2E
//
// End-to-end integration test for the forensics stage: combines, in ONE
// fixture, everything the isolated unit tests in forensics.test.mjs only
// ever exercise separately — multiple tasks, one deliberately unresolved
// (null agentId), a recorded pause, the orchestrator/subagents_total split,
// and the byte-identical (read-only) guarantee on both execution_state.json
// AND execution_plan.json. Fixture-building conventions (projects-root
// layout, TOKEN_COST_PROJECTS_ROOT env var, spawning forensics.mjs as a
// child process) are reused verbatim from test/exec/forensics.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { costForUsage } from '../../scripts/token-cost.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'forensics.mjs');

function sumUsageTokens(usage) {
  return (
    (usage.input_tokens || 0)
    + (usage.output_tokens || 0)
    + (usage.cache_read_input_tokens || 0)
    + (usage.cache_creation_input_tokens || 0)
  );
}

// Mirrors forensics.test.mjs's writeProjectFixture: one project dir under
// projectsRoot with a flat <sessionId>.jsonl plus a subagents/agent-<agentId>
// transcript + .meta.json.
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

function taskEntry(overrides) {
  return {
    status: 'done',
    estimated_tokens: 1000,
    actual_tokens: null,
    deviation: null,
    test_cmd: null,
    commit: null,
    incidencia: null,
    agentId: null,
    sessionId: null,
    ...overrides,
  };
}

function runCli(specDir, env) {
  return spawnSync('node', [CLI, specDir], {
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

function sha256OfFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

test('R-E2E.S1 / AC-E2E: a SPECDIR combining two resolvable tasks, one unresolved task and a recorded pause produces correct per-task, orchestrator/subagents_total and pause_timeline figures, while execution_state.json and execution_plan.json remain byte-identical', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-forensics-root-'));
  const specDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-forensics-specdir-'));

  try {
    // --- fixture: two resolvable tasks sharing one session (so
    // orchestrator/subagents_total reflect the whole session, per R3.S1),
    // plus one task deliberately unresolved (null agentId/sessionId).
    const subUsageAlpha = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 };
    const subUsageBeta = { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 };
    const orchestratorUsage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

    writeProjectFixture(projectsRoot, 'project-e2e', 'session-e2e', 'agentAlpha', subUsageAlpha);
    writeProjectFixture(projectsRoot, 'project-e2e', 'session-e2e', 'agentBeta', subUsageBeta);

    const pause = {
      reason: 'budget-threshold',
      real_tokens: 9999,
      estimated_tokens: 1400,
      at_task: 'task-gamma',
    };

    const tasks = {
      'task-alpha': taskEntry({ estimated_tokens: 1000, agentId: 'agentAlpha', sessionId: 'session-e2e' }),
      'task-beta': taskEntry({ estimated_tokens: 400, agentId: 'agentBeta', sessionId: 'session-e2e' }),
      'task-gamma': taskEntry({ estimated_tokens: 250, agentId: null, sessionId: null }),
    };

    fs.writeFileSync(
      path.join(specDir, 'execution_state.json'),
      JSON.stringify({
        plan_id: 'plan-e2e-forensics-fixture',
        source_spec: 'spec.md',
        branch: null,
        started_at: new Date().toISOString(),
        tasks,
        pause,
      }, null, 2),
    );

    // execution_plan.json sits alongside it; forensics.mjs must not read it
    // to run, but must never touch it either (AC-E2E).
    fs.writeFileSync(
      path.join(specDir, 'execution_plan.json'),
      JSON.stringify({
        plan_id: 'plan-e2e-forensics-fixture',
        tasks: ['task-alpha', 'task-beta', 'task-gamma'],
      }, null, 2) + '\n',
    );

    const statePath = path.join(specDir, 'execution_state.json');
    const planPath = path.join(specDir, 'execution_plan.json');
    const stateHashBefore = sha256OfFile(statePath);
    const planHashBefore = sha256OfFile(planPath);

    // --- run the forensics stage exactly as the skill does.
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));

    // --- per-task assertions.
    const expectedTokensAlpha = sumUsageTokens(subUsageAlpha);
    const expectedCostAlpha = costForUsage('haiku', subUsageAlpha);
    const expectedTokensBeta = sumUsageTokens(subUsageBeta);
    const expectedCostBeta = costForUsage('haiku', subUsageBeta);

    const taskAlpha = forensics.tasks['task-alpha'];
    assert.equal(taskAlpha.resolved, true);
    assert.equal(taskAlpha.real_tokens, expectedTokensAlpha);
    assert.equal(typeof taskAlpha.real_cost_usd, 'number');
    assert.ok(Math.abs(taskAlpha.real_cost_usd - expectedCostAlpha) < 0.0001);
    assert.equal(taskAlpha.deviation_real, expectedTokensAlpha - 1000);

    const taskBeta = forensics.tasks['task-beta'];
    assert.equal(taskBeta.resolved, true);
    assert.equal(taskBeta.real_tokens, expectedTokensBeta);
    assert.equal(typeof taskBeta.real_cost_usd, 'number');
    assert.ok(Math.abs(taskBeta.real_cost_usd - expectedCostBeta) < 0.0001);
    assert.equal(taskBeta.deviation_real, expectedTokensBeta - 400);

    const taskGamma = forensics.tasks['task-gamma'];
    assert.equal(taskGamma.resolved, false);
    assert.equal(taskGamma.real_tokens, null);
    assert.equal(taskGamma.real_cost_usd, null);
    assert.equal(taskGamma.estimated_tokens, 250);
    assert.equal(taskGamma.deviation_real, null);

    // --- orchestrator / subagents_total assertions.
    const expectedOrchTokens = sumUsageTokens(orchestratorUsage);
    const expectedOrchCost = costForUsage('sonnet', orchestratorUsage);
    const expectedSubTotalTokens = expectedTokensAlpha + expectedTokensBeta;
    const expectedSubTotalCost = expectedCostAlpha + expectedCostBeta;

    assert.ok(forensics.orchestrator, 'forensics.json must include an orchestrator object');
    assert.equal(typeof forensics.orchestrator.real_tokens, 'number');
    assert.equal(typeof forensics.orchestrator.real_cost_usd, 'number');
    assert.equal(forensics.orchestrator.real_tokens, expectedOrchTokens);
    assert.ok(Math.abs(forensics.orchestrator.real_cost_usd - expectedOrchCost) < 0.0001);

    assert.ok(forensics.subagents_total, 'forensics.json must include a subagents_total object');
    assert.equal(typeof forensics.subagents_total.real_tokens, 'number');
    assert.equal(typeof forensics.subagents_total.real_cost_usd, 'number');
    assert.equal(forensics.subagents_total.real_tokens, expectedSubTotalTokens);
    assert.ok(Math.abs(forensics.subagents_total.real_cost_usd - expectedSubTotalCost) < 0.0001);

    // --- pause_timeline assertions.
    assert.ok(Array.isArray(forensics.pause_timeline), 'pause_timeline must be an array');
    assert.equal(forensics.pause_timeline.length, 1);
    assert.equal(forensics.pause_timeline[0].at_task, 'task-gamma');
    assert.equal(forensics.pause_timeline[0].real_tokens, 9999);

    // --- byte-identical guarantee: both input files unchanged after the run.
    assert.equal(
      sha256OfFile(statePath),
      stateHashBefore,
      'execution_state.json must be byte-identical after a forensics run (AC-E2E)',
    );
    assert.equal(
      sha256OfFile(planPath),
      planHashBefore,
      'execution_plan.json must be byte-identical after a forensics run (AC-E2E)',
    );
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});
