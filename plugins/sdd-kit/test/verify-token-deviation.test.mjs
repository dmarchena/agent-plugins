import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenDeviations } from '../scripts/verify-tools.mjs';

// Minimal per-task fixture matching execution_state.schema.json's per-task
// shape, filled in only with the fields tokenDeviations cares about.
function makeTask({ estimated_tokens, actual_tokens }) {
  return {
    status: 'done',
    estimated_tokens,
    actual_tokens,
    deviation: actual_tokens == null ? null : actual_tokens - estimated_tokens,
    test_cmd: 'node --test some.test.mjs',
    commit: 'abc123',
    incidencia: null,
  };
}

test('tokenDeviations: taskState === null returns an empty array (nothing to compute yet)', () => {
  assert.deepEqual(tokenDeviations(null), []);
});

test('R6.S1: a task with actual_tokens at or below 2x its estimated_tokens does not appear in the deviated-tasks list', () => {
  const taskState = {
    T1: makeTask({ estimated_tokens: 1000, actual_tokens: 2000 }), // exactly 2x boundary
    T2: makeTask({ estimated_tokens: 1000, actual_tokens: 1500 }), // below 2x
  };

  const result = tokenDeviations(taskState);

  assert.deepEqual(result, []);
});

test('R6.S2: a task with actual_tokens above 2x its estimated_tokens is listed with both figures and a suggestion, with no "blocks" field at all', () => {
  const taskState = {
    T1: makeTask({ estimated_tokens: 1000, actual_tokens: 2001 }), // just above 2x
  };

  const result = tokenDeviations(taskState);

  assert.equal(result.length, 1);
  const entry = result[0];
  assert.equal(entry.task_id, 'T1');
  assert.equal(entry.actual_tokens, 2001);
  assert.equal(entry.estimated_tokens, 1000);
  assert.equal(typeof entry.suggestion, 'string');
  assert.ok(entry.suggestion.length > 0);
  assert.equal('blocks' in entry, false, 'a deviated entry must never carry a blocking flag');
});

test('AC8: a task exceeding the 2x threshold appears in the report while an in-range task in the same taskState is excluded, and archiving is not blocked (no blocking field anywhere)', () => {
  const taskState = {
    T1: makeTask({ estimated_tokens: 500, actual_tokens: 600 }), // in range
    T2: makeTask({ estimated_tokens: 500, actual_tokens: 1200 }), // over threshold (>2x)
    T3: makeTask({ estimated_tokens: 300, actual_tokens: null }), // not yet run, not evaluable
  };

  const result = tokenDeviations(taskState);

  assert.equal(result.length, 1);
  assert.equal(result[0].task_id, 'T2');
  assert.equal(result[0].actual_tokens, 1200);
  assert.equal(result[0].estimated_tokens, 500);
  assert.ok(result[0].suggestion.length > 0);
  // No entry in the whole array carries any kind of block flag.
  for (const item of result) {
    assert.equal('blocks' in item, false);
  }
});

test('tokenDeviations: tasks with null actual_tokens or null estimated_tokens are skipped (not evaluable yet)', () => {
  const taskState = {
    T1: makeTask({ estimated_tokens: 1000, actual_tokens: null }),
    T2: { ...makeTask({ estimated_tokens: 1000, actual_tokens: 5000 }), estimated_tokens: null, deviation: null },
  };

  const result = tokenDeviations(taskState);

  assert.deepEqual(result, []);
});
