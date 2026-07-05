// verify-manual-confirm.test.mjs — T3-manual-confirm tests for the verify
// skill's bookkeeping primitive: per-AC manual confirmation status tracking.
//
// This is pure bookkeeping — no real user prompting happens here. "The user
// confirms/rejects/does nothing" is simulated by calling the primitive's own
// .confirm()/.reject() methods directly (or not calling them at all, to
// simulate the session ending unanswered).

import test from 'node:test';
import assert from 'node:assert/strict';

import { manualConfirmation } from '../scripts/verify-tools.mjs';

// A representative checklist slice as loadSpecdir() would produce it (mixed
// auto/manual tags). The real caller filters to tag === 'manual' before
// handing the list to manualConfirmation() for T3's own use; T4 will instead
// hand the whole mixed list through unfiltered.
const FULL_CHECKLIST = [
  {
    ac_id: 'AC1',
    ref: 'R1.S1',
    tag: 'auto',
    description: 'Sample automatic criterion one.',
  },
  {
    ac_id: 'AC2',
    ref: 'R3.S1',
    tag: 'manual',
    description: 'Reviewer manually confirms the release notes read well.',
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

function manualItems() {
  return FULL_CHECKLIST.filter((item) => item.tag === 'manual');
}

test('R3.S1: a manual AC presented with its probe and explicitly confirmed by the user counts as green in the report', () => {
  const tracker = manualConfirmation(manualItems());

  tracker.confirm('AC2');

  assert.equal(tracker.status('AC2'), 'confirmed');
  const report = tracker.report();
  assert.ok(report.green.includes('AC2'));
  assert.equal(
    report.notGreen.some((entry) => entry.ac_id === 'AC2'),
    false
  );
});

test('R3.S2: a manual AC the user explicitly rejects does not count green and blocks archiving', () => {
  const tracker = manualConfirmation(manualItems());

  tracker.reject('AC5');

  assert.equal(tracker.status('AC5'), 'rejected');
  const report = tracker.report();
  assert.equal(report.green.includes('AC5'), false);
  assert.deepEqual(
    report.notGreen.find((entry) => entry.ac_id === 'AC5'),
    { ac_id: 'AC5', status: 'rejected' }
  );
  assert.equal(report.allGreen, false);
});

test('AC5: an unconfirmed manual AC (session ends without an answer) is excluded from the green count and archiving is blocked', () => {
  const tracker = manualConfirmation(manualItems());

  // Simulate the session ending unanswered: never call confirm()/reject() on
  // AC9 at all before asking for the final verdict.
  assert.equal(tracker.status('AC9'), 'unanswered');

  const report = tracker.report();
  assert.equal(report.green.includes('AC9'), false);
  assert.deepEqual(
    report.notGreen.find((entry) => entry.ac_id === 'AC9'),
    { ac_id: 'AC9', status: 'unanswered' }
  );
  assert.equal(report.allGreen, false);
});

test('R3: only manual ACs that were explicitly confirmed make the whole set green (all-confirmed case)', () => {
  const tracker = manualConfirmation(manualItems());

  tracker.confirm('AC2');
  tracker.confirm('AC5');
  tracker.confirm('AC9');

  const report = tracker.report();
  assert.deepEqual(report.green.sort(), ['AC2', 'AC5', 'AC9']);
  assert.deepEqual(report.notGreen, []);
  assert.equal(report.allGreen, true);
});
