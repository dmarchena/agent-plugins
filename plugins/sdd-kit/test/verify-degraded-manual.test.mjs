// verify-degraded-manual.test.mjs — T4-degraded-manual tests for the verify
// skill: when execution_state.json is absent (taskState === null), the whole
// checklist (auto + manual) must be routed to manual human confirmation,
// nothing auto-derived from a re-run.

import test from 'node:test';
import assert from 'node:assert/strict';

import { degradedManualRouting } from '../scripts/verify-tools.mjs';

// A representative checklist mixing [auto] and [manual] tags, as loadSpecdir()
// would produce it.
const MIXED_CHECKLIST = [
  {
    ac_id: 'AC1',
    ref: 'R1.S1',
    tag: 'auto',
    description: 'Sample automatic criterion one.',
  },
  {
    ac_id: 'AC2',
    ref: 'R2.S1',
    tag: 'auto',
    description: 'Sample automatic criterion two.',
  },
  {
    ac_id: 'AC5',
    ref: 'R3.S2',
    tag: 'manual',
    description: 'Reviewer manually confirms the UI matches the mockup.',
  },
  {
    ac_id: 'AC9',
    ref: 'R3.S2',
    tag: 'manual',
    description: 'Reviewer manually confirms the migration is reversible.',
  },
];

test('R4.S1: with no execution_state.json, every AC (auto and manual) is presented for explicit human confirmation without re-running any test', () => {
  const result = degradedManualRouting(MIXED_CHECKLIST, null);

  assert.equal(result.degraded, true);
  assert.match(result.reason, /execution_state\.json/);

  // Nothing is auto-derived from a re-run: all four ac_ids, both auto and
  // manual, start not green.
  const before = result.tracker.report();
  assert.deepEqual(
    before.notGreen.map((entry) => entry.ac_id).sort(),
    ['AC1', 'AC2', 'AC5', 'AC9']
  );
  assert.equal(before.allGreen, false);

  // Simulate the human explicitly confirming every AC, including the [auto]
  // ones — nothing was re-run to get them there.
  result.tracker.confirm('AC1');
  result.tracker.confirm('AC2');
  result.tracker.confirm('AC5');
  result.tracker.confirm('AC9');

  const after = result.tracker.report();
  assert.equal(after.allGreen, true);
  assert.deepEqual(after.green.sort(), ['AC1', 'AC2', 'AC5', 'AC9']);
});

test('AC6: without execution_state.json, the report presents all ACs as pending human confirmation, none derived from a re-run', () => {
  const result = degradedManualRouting(MIXED_CHECKLIST, null);

  // Every ac_id, including [auto]-tagged ones, starts unanswered — none is
  // green "for free" just because it's tagged auto.
  for (const item of MIXED_CHECKLIST) {
    assert.equal(result.tracker.status(item.ac_id), 'unanswered');
  }

  const report = result.tracker.report();
  assert.deepEqual(report.green, []);
});

test('negative space: when taskState is a non-null object (not degraded), degradedManualRouting signals not-degraded', () => {
  const nonDegradedTaskState = {
    'task-1': { status: 'done', test_cmd: 'npm test' },
  };

  const result = degradedManualRouting(MIXED_CHECKLIST, nonDegradedTaskState);

  assert.equal(result === null || result.degraded === false, true);
});

test('negative space: an empty object taskState (not null) is still not-degraded — detection is exactly taskState === null', () => {
  const result = degradedManualRouting(MIXED_CHECKLIST, {});

  assert.equal(result === null || result.degraded === false, true);
});
