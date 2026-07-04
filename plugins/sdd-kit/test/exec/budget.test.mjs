import test from 'node:test';
import assert from 'node:assert/strict';

import { exceeds, blockAndSkip } from '../../scripts/exec/budget.mjs';
import { initState, recordResult } from '../../scripts/exec/state.mjs';

const samplePlan3 = {
  plan_id: 'plan-budget-001',
  source_spec: 'spec.md',
  tasks: [
    { task_id: 'task-a', estimated_tokens: 1000, dependencies: [] },
    { task_id: 'task-b', estimated_tokens: 1000, dependencies: [] },
    { task_id: 'task-c', estimated_tokens: 1000, dependencies: [] },
  ],
};

test('exceeds: no excedido cuando real <= 2x estimated de las tareas ejecutadas', () => {
  const state = initState(samplePlan3);

  recordResult(state, 'task-a', { status: 'done', actual_tokens: 1200 });
  recordResult(state, 'task-b', { status: 'done', actual_tokens: 1300 });
  // task-c queda pending, sin actual_tokens: no debe contar.

  const result = exceeds(state);

  assert.equal(result.real, 2500);
  assert.equal(result.estimated, 2000);
  assert.equal(result.exceeded, false);
});

test('exceeds: excedido cuando real > 2x estimated de las tareas ejecutadas', () => {
  const state = initState(samplePlan3);

  recordResult(state, 'task-a', { status: 'done', actual_tokens: 3000 });
  recordResult(state, 'task-b', { status: 'done', actual_tokens: 3000 });
  // task-c sin ejecutar: no cuenta en real ni en estimated.

  const result = exceeds(state);

  assert.equal(result.real, 6000);
  assert.equal(result.estimated, 2000);
  assert.equal(result.exceeded, true); // 6000 > 2*2000
});

const samplePlanChain = {
  plan_id: 'plan-budget-002',
  source_spec: 'spec.md',
  tasks: [
    { task_id: 'T1', estimated_tokens: 1000, dependencies: [] },
    { task_id: 'T2', estimated_tokens: 1000, dependencies: ['T1'] },
    { task_id: 'T3', estimated_tokens: 1000, dependencies: ['T2'] },
    { task_id: 'T4', estimated_tokens: 1000, dependencies: [] },
  ],
};

test('blockAndSkip: bloquea la tarea y salta en cascada a sus dependientes transitivos', () => {
  const state = initState(samplePlanChain);

  recordResult(state, 'T1', {
    status: 'done',
    actual_tokens: 2500,
    test_cmd: 'node --test test/t1.test.mjs',
    commit: 'abc1234',
  });

  const result = blockAndSkip(samplePlanChain, state, 'T1');

  assert.equal(result.blocked, 'T1');
  assert.deepEqual(result.skipped.sort(), ['T2', 'T3']);

  assert.equal(state.tasks['T1'].status, 'blocked');
  assert.equal(state.tasks['T2'].status, 'skipped');
  assert.equal(state.tasks['T3'].status, 'skipped');
  assert.equal(state.tasks['T4'].status, 'pending'); // rama sin relación intacta

  // Los campos previos de T1 no se pierden al bloquear.
  assert.equal(state.tasks['T1'].actual_tokens, 2500);
  assert.equal(state.tasks['T1'].test_cmd, 'node --test test/t1.test.mjs');
  assert.equal(state.tasks['T1'].commit, 'abc1234');
  assert.equal(state.tasks['T1'].deviation, 1500);
});
