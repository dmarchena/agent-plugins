import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  initState,
  recordResult,
  markSkipped,
  recordPause,
  setBranch,
  persist,
  read,
} from '../../scripts/exec/state.mjs';

const samplePlan = {
  plan_id: 'plan-test-001',
  source_spec: 'spec.md',
  tasks: [
    { task_id: 'task-a', estimated_tokens: 1000 },
    { task_id: 'task-b', estimated_tokens: 2000 },
    { task_id: 'task-c', estimated_tokens: 1500 },
  ],
};

test('initState: crea estado inicial con todas las tareas pending', () => {
  const state = initState(samplePlan);

  assert.equal(state.plan_id, 'plan-test-001');
  assert.equal(state.source_spec, 'spec.md');
  assert.equal(state.branch, null);
  assert.equal(state.pause, null);
  assert.equal(typeof state.started_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(state.started_at)));

  for (const [taskId, estimatedTokens] of [
    ['task-a', 1000],
    ['task-b', 2000],
    ['task-c', 1500],
  ]) {
    const entry = state.tasks[taskId];
    assert.equal(entry.status, 'pending');
    assert.equal(entry.estimated_tokens, estimatedTokens);
    assert.equal(entry.actual_tokens, null);
    assert.equal(entry.deviation, null);
    assert.equal(entry.test_cmd, null);
    assert.equal(entry.commit, null);
    assert.equal(entry.incidencia, null);
  }
});

test('recordResult: con actual_tokens fija los campos y calcula deviation', () => {
  const state = initState(samplePlan);

  recordResult(state, 'task-a', {
    status: 'done',
    actual_tokens: 1200,
    test_cmd: 'node --test test/a.test.mjs',
    commit: 'abc1234',
    incidencia: null,
  });

  const entry = state.tasks['task-a'];
  assert.equal(entry.status, 'done');
  assert.equal(entry.actual_tokens, 1200);
  assert.equal(entry.deviation, 200);
  assert.equal(entry.test_cmd, 'node --test test/a.test.mjs');
  assert.equal(entry.commit, 'abc1234');
  assert.equal(entry.incidencia, null);
});

test('recordResult: con actual_tokens null deja deviation en null', () => {
  const state = initState(samplePlan);

  recordResult(state, 'task-b', { status: 'done' });

  const entry = state.tasks['task-b'];
  assert.equal(entry.status, 'done');
  assert.equal(entry.actual_tokens, null);
  assert.equal(entry.deviation, null);
  assert.equal(entry.test_cmd, null);
  assert.equal(entry.commit, null);
  assert.equal(entry.incidencia, null);
});

test('markSkipped: marca "skipped" cada id dado', () => {
  const state = initState(samplePlan);

  markSkipped(state, ['task-b', 'task-c']);

  assert.equal(state.tasks['task-b'].status, 'skipped');
  assert.equal(state.tasks['task-c'].status, 'skipped');
  assert.equal(state.tasks['task-a'].status, 'pending');
});

test('recordPause: fija state.pause con las cifras dadas', () => {
  const state = initState(samplePlan);

  recordPause(state, {
    reason: 'umbral de presupuesto superado',
    real_tokens: 5000,
    estimated_tokens: 2000,
    at_task: 'task-b',
  });

  assert.deepEqual(state.pause, {
    reason: 'umbral de presupuesto superado',
    real_tokens: 5000,
    estimated_tokens: 2000,
    at_task: 'task-b',
  });
});

test('setBranch: fija state.branch', () => {
  const state = initState(samplePlan);
  setBranch(state, 'ia/plan-test-001');
  assert.equal(state.branch, 'ia/plan-test-001');
});

test('persist + read: roundtrip conserva el estado', () => {
  const state = initState(samplePlan);
  recordResult(state, 'task-a', { status: 'done', actual_tokens: 900 });
  setBranch(state, 'ia/plan-test-001');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-state-'));
  const statePath = path.join(tmpDir, 'execution_state.json');

  try {
    persist(statePath, state);

    const raw = fs.readFileSync(statePath, 'utf8');
    assert.ok(raw.endsWith('\n'));
    assert.equal(raw, `${JSON.stringify(state, null, 2)}\n`);
    assert.ok(!fs.existsSync(`${statePath}.tmp`));

    const loaded = read(statePath);
    assert.deepEqual(loaded, state);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
