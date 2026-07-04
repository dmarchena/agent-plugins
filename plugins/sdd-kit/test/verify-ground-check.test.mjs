import test from 'node:test';
import assert from 'node:assert/strict';

import { groundCheck } from '../scripts/verify-tools.mjs';

const rerun = (cmd) => ({
  passed: cmd !== 'test T2',
  output: cmd === 'test T2' ? 'AssertionError: expected true' : '',
});

test('R2.S1: A done task with a stored test_cmd that satisfies an [auto] AC, re-run green, counts that AC as green in the report.', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R2.S1', tag: 'auto', description: 'auto criterion one' },
  ];
  const coverageAcs = { AC1: ['T1'] };
  const taskState = {
    T1: { status: 'done', test_cmd: 'test T1' },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.deepEqual(result.green, ['AC1']);
  assert.deepEqual(result.drift, []);
});

test('R2.S2: A done task whose stored test_cmd fails on re-run leaves its AC not green and the report names the task, command, and failure output as drift.', () => {
  const checklist = [
    { ac_id: 'AC2', ref: 'R2.S2', tag: 'auto', description: 'auto criterion two' },
  ];
  const coverageAcs = { AC2: ['T2'] };
  const taskState = {
    T2: { status: 'done', test_cmd: 'test T2' },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.deepEqual(result.green, []);
  assert.deepEqual(result.drift, [
    {
      ac_id: 'AC2',
      task_id: 'T2',
      test_cmd: 'test T2',
      output: 'AssertionError: expected true',
    },
  ]);
});

test('AC3: Re-running a done task\'s test_cmd green counts its AC as green.', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R2.S1', tag: 'auto', description: 'auto criterion one' },
    { ac_id: 'AC2', ref: 'R2.S1', tag: 'manual', description: 'a manual criterion, ignored' },
  ];
  const coverageAcs = { AC1: ['T1'], AC2: ['T3'] };
  const taskState = {
    T1: { status: 'done', test_cmd: 'test T1' },
    T3: { status: 'pending', test_cmd: null },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.deepEqual(result.green, ['AC1']);
  assert.deepEqual(result.drift, []);
});

test("AC4: Re-running a done task's test_cmd and getting a failure reports drift with task/command/failure and the AC is not green.", () => {
  const checklist = [
    { ac_id: 'AC2', ref: 'R2.S2', tag: 'auto', description: 'auto criterion two' },
  ];
  const coverageAcs = { AC2: ['T2'] };
  const taskState = {
    T2: { status: 'done', test_cmd: 'test T2' },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.equal(result.green.includes('AC2'), false);
  assert.equal(result.drift.length, 1);
  assert.equal(result.drift[0].ac_id, 'AC2');
  assert.equal(result.drift[0].task_id, 'T2');
  assert.equal(result.drift[0].test_cmd, 'test T2');
  assert.match(result.drift[0].output, /AssertionError/);
});

test('manual-tagged checklist items are ignored entirely, even with covering done tasks', () => {
  const checklist = [
    { ac_id: 'AC5', ref: 'R2.S1', tag: 'manual', description: 'manual criterion' },
  ];
  const coverageAcs = { AC5: ['T1'] };
  const taskState = {
    T1: { status: 'done', test_cmd: 'test T1' },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.deepEqual(result.green, []);
  assert.deepEqual(result.drift, []);
});

test('an [auto] AC whose covering task is not done yet produces no verdict (not green, not drift)', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R2.S1', tag: 'auto', description: 'auto criterion one' },
  ];
  const coverageAcs = { AC1: ['T1'] };
  const taskState = {
    T1: { status: 'pending', test_cmd: null },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.deepEqual(result.green, []);
  assert.deepEqual(result.drift, []);
});

test('an [auto] AC covered by multiple tasks needs ALL of them done+test_cmd to be evaluated; when one is missing, no verdict', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R2.S1', tag: 'auto', description: 'auto criterion one' },
  ];
  const coverageAcs = { AC1: ['T1', 'T3'] };
  const taskState = {
    T1: { status: 'done', test_cmd: 'test T1' },
    T3: { status: 'pending', test_cmd: null },
  };

  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });

  assert.deepEqual(result.green, []);
  assert.deepEqual(result.drift, []);
});

test('when taskState is null (no execution_state.json yet), no verdicts are produced for any [auto] AC', () => {
  const checklist = [
    { ac_id: 'AC1', ref: 'R2.S1', tag: 'auto', description: 'auto criterion one' },
  ];
  const coverageAcs = { AC1: ['T1'] };

  const result = groundCheck(checklist, coverageAcs, null, { rerun });

  assert.deepEqual(result.green, []);
  assert.deepEqual(result.drift, []);
});
