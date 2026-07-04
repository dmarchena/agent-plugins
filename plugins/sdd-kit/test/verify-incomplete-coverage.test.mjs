// verify-incomplete-coverage.test.mjs — T5: incompleteCoverage() (R5, R5.S1, R5.S2, AC7)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { incompleteCoverage } from '../scripts/verify-tools.mjs';

function checklistOf(...acIds) {
  return acIds.map((ac_id) => ({
    ac_id,
    ref: 'R5.S1',
    tag: 'auto',
    description: `desc for ${ac_id}`,
  }));
}

test('R5.S1 / AC7: AC whose only covering task is blocked is not counted green and names task, status, incidencia', () => {
  const checklist = checklistOf('AC7');
  const coverageAcs = { AC7: ['T-blocked'] };
  const taskState = {
    'T-blocked': { status: 'blocked', incidencia: 'dependency service down' },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  assert.equal(result.length, 1);
  assert.equal(result[0].ac_id, 'AC7');
  assert.equal(result[0].task_id, 'T-blocked');
  assert.equal(result[0].status, 'blocked');
  assert.equal(result[0].incidencia, 'dependency service down');
  assert.equal(result[0].reason, 'blocked-or-skipped');
});

test('R5.S1: AC whose only covering task is skipped is not counted green and names task, status, incidencia', () => {
  const checklist = checklistOf('AC1');
  const coverageAcs = { AC1: ['T-skipped'] };
  const taskState = {
    'T-skipped': { status: 'skipped', incidencia: null },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  assert.equal(result.length, 1);
  assert.equal(result[0].ac_id, 'AC1');
  assert.equal(result[0].task_id, 'T-skipped');
  assert.equal(result[0].status, 'skipped');
  assert.equal(result[0].incidencia, null);
  assert.equal(result[0].reason, 'blocked-or-skipped');
});

test('R5.S1: incidencia is faithfully reported both when present and when null', () => {
  const checklist = checklistOf('AC-WITH-INC', 'AC-NULL-INC');
  const coverageAcs = {
    'AC-WITH-INC': ['T-a'],
    'AC-NULL-INC': ['T-b'],
  };
  const taskState = {
    'T-a': { status: 'blocked', incidencia: 'flaky test infra' },
    'T-b': { status: 'skipped', incidencia: null },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  const withInc = result.find((r) => r.ac_id === 'AC-WITH-INC');
  const withNullInc = result.find((r) => r.ac_id === 'AC-NULL-INC');
  assert.equal(withInc.incidencia, 'flaky test infra');
  assert.equal(withNullInc.incidencia, null);
});

test('R5.S2: AC whose covering task is pending is not counted green and states execution has not finished', () => {
  const checklist = checklistOf('AC2');
  const coverageAcs = { AC2: ['T-pending'] };
  const taskState = {
    'T-pending': { status: 'pending', incidencia: null },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  assert.equal(result.length, 1);
  assert.equal(result[0].ac_id, 'AC2');
  assert.equal(result[0].task_id, 'T-pending');
  assert.equal(result[0].status, 'pending');
  assert.equal(result[0].reason, 'not-finished');
});

test('R5.S2: AC whose covering task is running is not counted green and states execution has not finished', () => {
  const checklist = checklistOf('AC3');
  const coverageAcs = { AC3: ['T-running'] };
  const taskState = {
    'T-running': { status: 'running', incidencia: null },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  assert.equal(result.length, 1);
  assert.equal(result[0].ac_id, 'AC3');
  assert.equal(result[0].task_id, 'T-running');
  assert.equal(result[0].status, 'running');
  assert.equal(result[0].reason, 'not-finished');
});

test('positive space: AC whose covering task is done produces no entry (left for groundCheck)', () => {
  const checklist = checklistOf('AC4');
  const coverageAcs = { AC4: ['T-done'] };
  const taskState = {
    'T-done': { status: 'done', incidencia: null, test_cmd: 'npm test' },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  assert.deepEqual(result, []);
});

test('taskState === null returns empty result (not this function\'s job — that\'s T4-degraded-manual)', () => {
  const checklist = checklistOf('AC5');
  const coverageAcs = { AC5: ['T-x'] };

  const result = incompleteCoverage(checklist, coverageAcs, null);

  assert.deepEqual(result, []);
});

test('manual-tagged ACs are ignored entirely, even with a blocked covering task', () => {
  const checklist = [
    { ac_id: 'AC6', ref: 'R3.S1', tag: 'manual', description: 'manual AC' },
  ];
  const coverageAcs = { AC6: ['T-blocked-manual'] };
  const taskState = {
    'T-blocked-manual': { status: 'blocked', incidencia: 'irrelevant' },
  };

  const result = incompleteCoverage(checklist, coverageAcs, taskState);

  assert.deepEqual(result, []);
});
