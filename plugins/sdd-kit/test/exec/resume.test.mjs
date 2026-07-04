import test from 'node:test';
import assert from 'node:assert/strict';

import { resumeGround } from '../../scripts/exec/resume.mjs';

const samplePlan = {
  plan_id: 'plan-test-001',
  source_spec: 'spec.md',
  tasks: [
    { task_id: 'T1' },
    { task_id: 'T2' },
    { task_id: 'T3' },
  ],
};

function makeState() {
  return {
    plan_id: 'plan-test-001',
    source_spec: 'spec.md',
    branch: null,
    started_at: new Date().toISOString(),
    pause: null,
    tasks: {
      T1: { status: 'done', test_cmd: 'test T1' },
      T2: { status: 'done', test_cmd: 'test T2' },
      T3: { status: 'pending', test_cmd: null },
    },
  };
}

test('resumeGround: all done tasks with test_cmd pass -> ok:true', () => {
  const state = makeState();
  const rerun = () => ({ passed: true, output: '' });

  const result = resumeGround(samplePlan, state, { rerun });

  assert.deepEqual(result, { ok: true, brokenTask: null, brokenTest: null });
});

test('resumeGround: T2 is broken -> ok:false, brokenTask T2, brokenTest test T2', () => {
  const state = makeState();
  const rerun = (testCmd) => ({ passed: testCmd !== 'test T2', output: '' });

  const result = resumeGround(samplePlan, state, { rerun });

  assert.deepEqual(result, { ok: false, brokenTask: 'T2', brokenTest: 'test T2' });
});

test('resumeGround: stops at the first broken one (plan.tasks order), does not keep re-running', () => {
  const state = makeState();
  const calls = [];
  const rerun = (testCmd) => {
    calls.push(testCmd);
    return { passed: false, output: '' };
  };

  const result = resumeGround(samplePlan, state, { rerun });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls, ['test T1']);
  assert.equal(result.ok, false);
  assert.equal(result.brokenTask, 'T1');
  assert.equal(result.brokenTest, 'test T1');
});

test('resumeGround: no done tasks with test_cmd -> ok:true without calling rerun', () => {
  const state = {
    tasks: {
      T1: { status: 'pending', test_cmd: null },
      T2: { status: 'blocked', test_cmd: null },
      T3: { status: 'done', test_cmd: null },
    },
  };
  let calls = 0;
  const rerun = () => {
    calls += 1;
    return { passed: true, output: '' };
  };

  const result = resumeGround(samplePlan, state, { rerun });

  assert.deepEqual(result, { ok: true, brokenTask: null, brokenTest: null });
  assert.equal(calls, 0);
});
