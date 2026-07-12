// test/exec/forensics.test.mjs — forensics-per-task
//
// R2.S1: For a SPECDIR whose tasks carry agentId with matching transcripts,
// forensics.json lists each task with numeric real_tokens (counting
// cache-read), real_cost_usd, estimated_tokens and deviation_real, and the
// same per-task figures are printed to stdout.
// R2.S2: A task with null agentId or an absent transcript is reported
// resolved:false with null cost/token fields while other tasks show real
// figures, and the process exits with code 0.
//
// Fixture conventions mirror test/exec/real-cost.test.mjs and
// test/exec/report-real-cost.test.mjs: a "projects root" is a tmpdir
// containing project dirs, each with a flat <sessionId>.jsonl plus a
// sibling <sessionId>/subagents/agent-<agentId>.jsonl + .meta.json. The CLI
// is pointed at the fixture root via TOKEN_COST_PROJECTS_ROOT so it never
// touches the real ~/.claude/projects.

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

// Writes one project dir under projectsRoot with a flat <sessionId>.jsonl
// plus a subagents/agent-<agentId>.jsonl + .meta.json — mirrors
// report-real-cost.test.mjs's writeProjectsRootFixture.
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

function makeSpecDir(tasks, pause) {
  const specDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-specdir-'));
  fs.writeFileSync(
    path.join(specDir, 'execution_state.json'),
    JSON.stringify({
      plan_id: 'plan-forensics-fixture',
      source_spec: 'spec.md',
      branch: null,
      started_at: new Date().toISOString(),
      tasks,
      pause: pause === undefined ? null : pause,
    }, null, 2),
  );
  return specDir;
}

function runCli(specDir, env) {
  const result = spawnSync('node', [CLI, specDir], {
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
  return result;
}

test('R2.S1: for a SPECDIR whose tasks carry agentId with matching transcripts, forensics.json lists each task with numeric real_tokens (counting cache-read), real_cost_usd, estimated_tokens and deviation_real, and the same per-task figures are printed to stdout', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r2s1-'));

  const subUsageA = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 };
  const subUsageB = { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 };

  writeProjectFixture(projectsRoot, 'project-a', 'session-a', 'agentA', subUsageA);
  writeProjectFixture(projectsRoot, 'project-b', 'session-b', 'agentB', subUsageB);

  const specDir = makeSpecDir({
    'task-a': taskEntry({ estimated_tokens: 1000, agentId: 'agentA', sessionId: 'session-a' }),
    'task-b': taskEntry({ estimated_tokens: 400, agentId: 'agentB', sessionId: 'session-b' }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    const forensicsPath = path.join(specDir, 'forensics.json');
    assert.ok(fs.existsSync(forensicsPath), 'forensics.json must be written');
    const forensics = JSON.parse(fs.readFileSync(forensicsPath, 'utf8'));

    const expectedTokensA = sumUsageTokens(subUsageA);
    const expectedCostA = costForUsage('haiku', subUsageA);
    const expectedTokensB = sumUsageTokens(subUsageB);
    const expectedCostB = costForUsage('haiku', subUsageB);

    // cache_read must be folded into real_tokens: both fixtures used
    // non-zero cache_read_input_tokens.
    assert.ok(subUsageA.cache_read_input_tokens > 0, 'sanity: fixture exercises cache_read');

    const taskA = forensics.tasks['task-a'];
    assert.equal(taskA.resolved, true);
    assert.equal(taskA.real_tokens, expectedTokensA);
    assert.ok(Math.abs(taskA.real_cost_usd - expectedCostA) < 0.0001);
    assert.equal(taskA.estimated_tokens, 1000);
    assert.equal(taskA.deviation_real, expectedTokensA - 1000);

    const taskB = forensics.tasks['task-b'];
    assert.equal(taskB.resolved, true);
    assert.equal(taskB.real_tokens, expectedTokensB);
    assert.ok(Math.abs(taskB.real_cost_usd - expectedCostB) < 0.0001);
    assert.equal(taskB.estimated_tokens, 400);
    assert.equal(taskB.deviation_real, expectedTokensB - 400);

    // Same figures must be printed to stdout.
    assert.ok(result.stdout.includes('task-a'), 'stdout must mention task-a');
    assert.ok(result.stdout.includes(String(expectedTokensA)), 'stdout must include task-a real_tokens');
    assert.ok(result.stdout.includes('task-b'), 'stdout must mention task-b');
    assert.ok(result.stdout.includes(String(expectedTokensB)), 'stdout must include task-b real_tokens');
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('R2.S2: a task with null agentId or an absent transcript is reported resolved:false with null cost/token fields while other tasks show real figures, and the process exits with code 0', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r2s2-'));

  const subUsageResolved = { input_tokens: 800, output_tokens: 150, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 };
  writeProjectFixture(projectsRoot, 'project-resolved', 'session-resolved', 'agentResolved', subUsageResolved);

  const specDir = makeSpecDir({
    'task-resolved': taskEntry({ estimated_tokens: 700, agentId: 'agentResolved', sessionId: 'session-resolved' }),
    'task-null-agent': taskEntry({ estimated_tokens: 300, agentId: null, sessionId: null }),
    'task-missing-transcript': taskEntry({ estimated_tokens: 250, agentId: 'ghostAgent', sessionId: 'session-does-not-exist' }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `process must exit 0 even with unresolved tasks; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));

    const expectedTokensResolved = sumUsageTokens(subUsageResolved);
    const resolvedTask = forensics.tasks['task-resolved'];
    assert.equal(resolvedTask.resolved, true);
    assert.equal(resolvedTask.real_tokens, expectedTokensResolved);
    assert.equal(typeof resolvedTask.real_cost_usd, 'number');
    assert.equal(resolvedTask.estimated_tokens, 700);
    assert.equal(resolvedTask.deviation_real, expectedTokensResolved - 700);

    const nullAgentTask = forensics.tasks['task-null-agent'];
    assert.equal(nullAgentTask.resolved, false);
    assert.equal(nullAgentTask.real_tokens, null);
    assert.equal(nullAgentTask.real_cost_usd, null);
    assert.equal(nullAgentTask.estimated_tokens, 300);
    assert.equal(nullAgentTask.deviation_real, null);

    const missingTranscriptTask = forensics.tasks['task-missing-transcript'];
    assert.equal(missingTranscriptTask.resolved, false);
    assert.equal(missingTranscriptTask.real_tokens, null);
    assert.equal(missingTranscriptTask.real_cost_usd, null);
    assert.equal(missingTranscriptTask.estimated_tokens, 250);
    assert.equal(missingTranscriptTask.deviation_real, null);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('R3.S1: forensics.json includes an orchestrator object and a subagents_total object, each with numeric real_tokens and real_cost_usd, and a pause_timeline entry carrying the recorded pause\'s at_task and accumulated real_tokens', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r3s1-'));

  // Two subagents sharing ONE session, so orchestrator/subagents_total are
  // whole-session figures (not just one task's), and analyze() need only
  // be computed once for both tasks to see the same totals.
  const orchestratorUsage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const subUsageAlpha = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 };
  const subUsageBeta = { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 };

  writeProjectFixture(projectsRoot, 'project-x', 'session-x', 'agentAlpha', subUsageAlpha);
  writeProjectFixture(projectsRoot, 'project-x', 'session-x', 'agentBeta', subUsageBeta);

  const pause = { reason: 'budget-threshold', real_tokens: 4242, estimated_tokens: 1000, at_task: 'task-beta' };

  const specDir = makeSpecDir({
    'task-alpha': taskEntry({ estimated_tokens: 1000, agentId: 'agentAlpha', sessionId: 'session-x' }),
    'task-beta': taskEntry({ estimated_tokens: 400, agentId: 'agentBeta', sessionId: 'session-x' }),
  }, pause);

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));

    const expectedOrchTokens = sumUsageTokens(orchestratorUsage);
    const expectedOrchCost = costForUsage('sonnet', orchestratorUsage);
    const expectedSubTotalTokens = sumUsageTokens(subUsageAlpha) + sumUsageTokens(subUsageBeta);
    const expectedSubTotalCost = costForUsage('haiku', subUsageAlpha) + costForUsage('haiku', subUsageBeta);

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

    assert.ok(Array.isArray(forensics.pause_timeline), 'pause_timeline must be an array');
    assert.equal(forensics.pause_timeline.length, 1);
    assert.equal(forensics.pause_timeline[0].at_task, 'task-beta');
    assert.equal(forensics.pause_timeline[0].real_tokens, 4242);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('R3.S2: for a run whose state pause is null, forensics.json pause_timeline is an empty array and no error is raised', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r3s2-'));

  const subUsage = { input_tokens: 300, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  writeProjectFixture(projectsRoot, 'project-y', 'session-y', 'agentY', subUsage);

  const specDir = makeSpecDir({
    'task-y': taskEntry({ estimated_tokens: 200, agentId: 'agentY', sessionId: 'session-y' }),
  }, null);

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `process must exit 0 with a null pause; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
    assert.ok(Array.isArray(forensics.pause_timeline), 'pause_timeline must be an array');
    assert.deepEqual(forensics.pause_timeline, []);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('R1.S1: on a totally resolved SPECDIR, forensics.json contains a signals object with the six keys; the sum of per_model[*].tokens equals subagents_total.real_tokens and orchestrator_share equals orch_usd/total_usd within tolerance; deviations is ordered desc by real÷estimated', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r1s1-'));

  const orchestratorUsage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const subUsageAlpha = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 };
  const subUsageBeta = { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 };

  writeProjectFixture(projectsRoot, 'project-sig', 'session-sig', 'agentAlpha', subUsageAlpha);
  writeProjectFixture(projectsRoot, 'project-sig', 'session-sig', 'agentBeta', subUsageBeta);

  // task-beta's estimate (100) is far below its real usage (650 tokens),
  // so its real÷estimated ratio must sort ahead of task-alpha's (estimate
  // 5000 against 1500 real tokens) — this is what exercises the "sorted
  // desc" requirement rather than an order that happens to match insertion.
  const specDir = makeSpecDir({
    'task-alpha': taskEntry({ estimated_tokens: 5000, agentId: 'agentAlpha', sessionId: 'session-sig' }),
    'task-beta': taskEntry({ estimated_tokens: 100, agentId: 'agentBeta', sessionId: 'session-sig' }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
    const signals = forensics.signals;
    assert.ok(signals, 'forensics.json must include a signals object');

    for (const key of ['per_model', 'orchestrator_share', 'orchestrator_token_ratio', 'deviations', 'incidences', 'session_count']) {
      assert.ok(Object.prototype.hasOwnProperty.call(signals, key), `signals must have key ${key}`);
    }

    const expectedSubTotalTokens = sumUsageTokens(subUsageAlpha) + sumUsageTokens(subUsageBeta);
    const perModelTokenSum = Object.values(signals.per_model).reduce((acc, m) => acc + m.tokens, 0);
    assert.equal(perModelTokenSum, expectedSubTotalTokens, 'sum of per_model[*].tokens must equal subagents_total.real_tokens');
    assert.equal(perModelTokenSum, forensics.subagents_total.real_tokens);

    const expectedOrchCost = costForUsage('sonnet', orchestratorUsage);
    const expectedSubTotalCost = costForUsage('haiku', subUsageAlpha) + costForUsage('haiku', subUsageBeta);
    const expectedShare = expectedOrchCost / (expectedOrchCost + expectedSubTotalCost);
    assert.ok(
      Math.abs(signals.orchestrator_share - expectedShare) < 0.0001,
      'orchestrator_share must equal orch_usd/total_usd within tolerance',
    );

    assert.ok(Array.isArray(signals.deviations));
    assert.equal(signals.deviations.length, 2);
    for (let i = 1; i < signals.deviations.length; i++) {
      assert.ok(signals.deviations[i - 1].ratio >= signals.deviations[i].ratio, 'deviations must be sorted desc by real÷estimated');
    }
    assert.equal(signals.deviations[0].task_id, 'task-beta', 'task-beta has the higher real÷estimated ratio and must sort first');

    assert.equal(signals.session_count, 1);
    assert.deepEqual(signals.incidences, []);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('R1.S2: with at least one unresolved task and total cost 0, the script exits 0 without exception or NaN, each unresolved task is listed in signals.incidences and excluded from per_model, and orchestrator_share is 0 or null', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r1s2-'));

  const specDir = makeSpecDir({
    'task-null-agent': taskEntry({ estimated_tokens: 300, agentId: null, sessionId: null }),
    'task-missing-transcript': taskEntry({ estimated_tokens: 250, agentId: 'ghostAgent', sessionId: 'session-does-not-exist' }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stderr, '', 'no exception/stack trace expected on stderr');

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
    const signals = forensics.signals;
    assert.ok(signals, 'forensics.json must include a signals object');

    assert.equal(forensics.subagents_total.real_tokens, 0);
    assert.equal(forensics.subagents_total.real_cost_usd, 0);

    assert.deepEqual(signals.per_model, {}, 'per_model must exclude unresolved tasks entirely (coste 0 -> nothing to aggregate)');

    const incidenceIds = signals.incidences.map((i) => i.task_id).sort();
    assert.deepEqual(incidenceIds, ['task-missing-transcript', 'task-null-agent']);

    assert.ok(
      signals.orchestrator_share === 0 || signals.orchestrator_share === null,
      `orchestrator_share must be 0 or null, got ${signals.orchestrator_share}`,
    );
    assert.ok(!Number.isNaN(signals.orchestrator_share), 'orchestrator_share must never be NaN');
    assert.ok(
      signals.orchestrator_token_ratio === 0 || signals.orchestrator_token_ratio === null,
      `orchestrator_token_ratio must be 0 or null, got ${signals.orchestrator_token_ratio}`,
    );
    assert.ok(!Number.isNaN(signals.orchestrator_token_ratio), 'orchestrator_token_ratio must never be NaN');

    assert.deepEqual(signals.deviations, []);
    assert.equal(signals.session_count, 0);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('AC1: running the script over the token-diet-style SPECDIR fixture produces the six signals subkeys with the sum and share equalities and deviations ordered desc', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-ac1-'));

  const orchestratorUsage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const subUsageRules = { input_tokens: 2000, output_tokens: 400, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 };
  const subUsageApply = { input_tokens: 300, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  writeProjectFixture(projectsRoot, 'project-token-diet', 'session-token-diet', 'agentRulesDoc', subUsageRules);
  writeProjectFixture(projectsRoot, 'project-token-diet', 'session-token-diet', 'agentApply', subUsageApply);

  const specDir = makeSpecDir({
    't1-rules-doc': taskEntry({ estimated_tokens: 1800, agentId: 'agentRulesDoc', sessionId: 'session-token-diet' }),
    't2-cmd-apply': taskEntry({ estimated_tokens: 900, agentId: 'agentApply', sessionId: 'session-token-diet' }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
    const signals = forensics.signals;
    assert.ok(signals, 'forensics.json must include a signals object');

    for (const key of ['per_model', 'orchestrator_share', 'orchestrator_token_ratio', 'deviations', 'incidences', 'session_count']) {
      assert.ok(Object.prototype.hasOwnProperty.call(signals, key), `signals must have key ${key}`);
    }

    const expectedSubTotalTokens = sumUsageTokens(subUsageRules) + sumUsageTokens(subUsageApply);
    const perModelTokenSum = Object.values(signals.per_model).reduce((acc, m) => acc + m.tokens, 0);
    assert.equal(perModelTokenSum, expectedSubTotalTokens);
    assert.equal(perModelTokenSum, forensics.subagents_total.real_tokens);

    const expectedOrchCost = costForUsage('sonnet', orchestratorUsage);
    const expectedSubTotalCost = costForUsage('haiku', subUsageRules) + costForUsage('haiku', subUsageApply);
    const expectedShare = expectedOrchCost / (expectedOrchCost + expectedSubTotalCost);
    assert.ok(Math.abs(signals.orchestrator_share - expectedShare) < 0.0001);

    assert.equal(signals.deviations.length, 2);
    for (let i = 1; i < signals.deviations.length; i++) {
      assert.ok(signals.deviations[i - 1].ratio >= signals.deviations[i].ratio, 'deviations must be ordered desc by real÷estimated');
    }
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('AC2: on a SPECDIR fixture with one task lacking agentId and total cost 0, incidences lists the task, per_model excludes it, and orchestrator_share is never NaN', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-ac2-'));

  const specDir = makeSpecDir({
    'task-no-agent': taskEntry({ estimated_tokens: 500, agentId: null, sessionId: null }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    const forensics = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
    const signals = forensics.signals;
    assert.ok(signals, 'forensics.json must include a signals object');

    assert.equal(forensics.subagents_total.real_cost_usd, 0);
    assert.equal(forensics.orchestrator.real_cost_usd, 0);

    assert.equal(signals.incidences.length, 1);
    assert.equal(signals.incidences[0].task_id, 'task-no-agent');

    assert.deepEqual(signals.per_model, {});

    assert.ok(!Number.isNaN(signals.orchestrator_share), 'orchestrator_share must never be NaN');
    assert.ok(!Number.isNaN(signals.orchestrator_token_ratio), 'orchestrator_token_ratio must never be NaN');
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

function sha256OfFile(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

test('R4.S1: after a forensics run the input execution_state.json and execution_plan.json are byte-identical (unchanged SHA-256)', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r4s1-'));

  const subUsage = { input_tokens: 400, output_tokens: 80, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 };
  writeProjectFixture(projectsRoot, 'project-ro', 'session-ro', 'agentRO', subUsage);

  const specDir = makeSpecDir({
    'task-ro': taskEntry({ estimated_tokens: 500, agentId: 'agentRO', sessionId: 'session-ro' }),
  });

  // execution_plan.json isn't produced by makeSpecDir; write an arbitrary
  // fixture here since forensics.mjs must never touch it either.
  const planPath = path.join(specDir, 'execution_plan.json');
  fs.writeFileSync(
    planPath,
    JSON.stringify({ plan_id: 'plan-forensics-fixture', tasks: ['task-ro'] }, null, 2) + '\n',
  );

  const statePath = path.join(specDir, 'execution_state.json');
  const stateHashBefore = sha256OfFile(statePath);
  const planHashBefore = sha256OfFile(planPath);

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    assert.equal(
      sha256OfFile(statePath),
      stateHashBefore,
      'execution_state.json must be byte-identical after a forensics run (R4.S1)',
    );
    assert.equal(
      sha256OfFile(planPath),
      planHashBefore,
      'execution_plan.json must be byte-identical after a forensics run (R4.S1)',
    );
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('R4.S2: with no subagents directory or state lacking agentId, forensics.json has incomplete:true plus an incomplete_reason string, and the process exits with code 0 and no stack trace', () => {
  // Subcase A: every task lacks a usable agentId.
  const specDirNoAgent = makeSpecDir({
    'task-a': taskEntry({ estimated_tokens: 100, agentId: null, sessionId: null }),
    'task-b': taskEntry({ estimated_tokens: 200, agentId: null, sessionId: null }),
  });
  const emptyProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r4s2-noagent-'));

  let reasonNoAgent;
  try {
    const result = runCli(specDirNoAgent, { TOKEN_COST_PROJECTS_ROOT: emptyProjectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stderr, '', 'no stack trace expected on stderr');

    const forensics = JSON.parse(fs.readFileSync(path.join(specDirNoAgent, 'forensics.json'), 'utf8'));
    assert.equal(forensics.incomplete, true, 'forensics.json must be flagged incomplete when no task has an agentId');
    assert.equal(typeof forensics.incomplete_reason, 'string');
    assert.ok(forensics.incomplete_reason.length > 0);
    reasonNoAgent = forensics.incomplete_reason;
  } finally {
    fs.rmSync(specDirNoAgent, { recursive: true, force: true });
    fs.rmSync(emptyProjectsRoot, { recursive: true, force: true });
  }

  // Subcase B: tasks carry agentId/sessionId, but no subagents directory (no
  // project dirs at all) exists anywhere under the resolved projects root.
  const specDirNoSubagents = makeSpecDir({
    'task-c': taskEntry({ estimated_tokens: 150, agentId: 'agentGhost', sessionId: 'session-ghost' }),
  });
  const noTranscriptProjectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-root-r4s2-nosubagents-'));

  try {
    const result = runCli(specDirNoSubagents, { TOKEN_COST_PROJECTS_ROOT: noTranscriptProjectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stderr, '', 'no stack trace expected on stderr');

    const forensics = JSON.parse(fs.readFileSync(path.join(specDirNoSubagents, 'forensics.json'), 'utf8'));
    assert.equal(forensics.incomplete, true, 'forensics.json must be flagged incomplete when no subagents directory is found');
    assert.equal(typeof forensics.incomplete_reason, 'string');
    assert.ok(forensics.incomplete_reason.length > 0);
    assert.notEqual(
      forensics.incomplete_reason,
      reasonNoAgent,
      'the missing-subagents-directory reason must be distinguishable from the missing-agentId reason',
    );
  } finally {
    fs.rmSync(specDirNoSubagents, { recursive: true, force: true });
    fs.rmSync(noTranscriptProjectsRoot, { recursive: true, force: true });
  }
});
