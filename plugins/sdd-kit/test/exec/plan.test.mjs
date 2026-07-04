import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlan, readyBatch, allDependents } from '../../scripts/exec/plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

const VALID_SPEC = path.join(FIXTURES_DIR, 'valid', 'spec.md');
const VALID_PLAN = path.join(FIXTURES_DIR, 'valid', 'plan.json');
const CYCLIC_PLAN = path.join(FIXTURES_DIR, 'cyclic', 'plan.json');

test('loadPlan: valid pair returns valid:true and the parsed plan', () => {
  const result = loadPlan(VALID_SPEC, VALID_PLAN);
  assert.equal(result.valid, true);
  assert.equal(result.error, null);
  assert.ok(result.plan);
  assert.ok(result.plan.plan_id);
});

test('loadPlan: plan rejected by the validator returns valid:false with an error', () => {
  const result = loadPlan(VALID_SPEC, CYCLIC_PLAN);
  assert.equal(result.valid, false);
  assert.notEqual(result.error, '');
  assert.ok(result.error.length > 0);
  assert.equal(result.plan, null);
});

function makePlan() {
  return {
    tasks: [
      { task_id: 'T1', dependencies: [] },
      { task_id: 'T2', dependencies: ['T1'] },
      { task_id: 'T3', dependencies: ['T1'] },
      { task_id: 'T4', dependencies: ['T2', 'T3'] },
    ],
  };
}

test('readyBatch: with no tasks done, only T1 is ready', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, []), ['T1']);
});

test('readyBatch: with T1 done, T2 and T3 are ready', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1']), ['T2', 'T3']);
});

test('readyBatch: with T1 and T2 done, only T3 is ready', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1', 'T2']), ['T3']);
});

test('readyBatch: max=1 truncates the result', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1'], { max: 1 }), ['T2']);
});

test('readyBatch: excluded removes tasks from the result', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1'], { excluded: new Set(['T2']) }), ['T3']);
});

test('allDependents: T1 has T2, T3 and T4 as transitive dependents', () => {
  const plan = makePlan();
  const dependents = allDependents(plan, 'T1');
  assert.ok(dependents.includes('T2'));
  assert.ok(dependents.includes('T3'));
  assert.ok(dependents.includes('T4'));
  assert.equal(dependents.length, 3);
});
