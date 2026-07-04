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

test('loadPlan: par válido devuelve valid:true y el plan parseado', () => {
  const result = loadPlan(VALID_SPEC, VALID_PLAN);
  assert.equal(result.valid, true);
  assert.equal(result.error, null);
  assert.ok(result.plan);
  assert.ok(result.plan.plan_id);
});

test('loadPlan: plan rechazado por el validador devuelve valid:false con error', () => {
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

test('readyBatch: sin tareas hechas, solo T1 está lista', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, []), ['T1']);
});

test('readyBatch: con T1 hecho, T2 y T3 están listas', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1']), ['T2', 'T3']);
});

test('readyBatch: con T1 y T2 hechos, solo T3 está lista', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1', 'T2']), ['T3']);
});

test('readyBatch: max=1 trunca el resultado', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1'], { max: 1 }), ['T2']);
});

test('readyBatch: excluded quita tareas del resultado', () => {
  const plan = makePlan();
  assert.deepEqual(readyBatch(plan, ['T1'], { excluded: new Set(['T2']) }), ['T3']);
});

test('allDependents: T1 tiene como dependientes transitivos a T2, T3 y T4', () => {
  const plan = makePlan();
  const dependents = allDependents(plan, 'T1');
  assert.ok(dependents.includes('T2'));
  assert.ok(dependents.includes('T3'));
  assert.ok(dependents.includes('T4'));
  assert.equal(dependents.length, 3);
});
