import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecdir, VerifyInputError } from '../scripts/verify-tools.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'verify');

const VALID_DIR = path.join(FIXTURES_DIR, 'valid');
const MISSING_PLAN_DIR = path.join(FIXTURES_DIR, 'missing-plan');
const MISSING_SPEC_DIR = path.join(FIXTURES_DIR, 'missing-spec');
const NO_STATE_DIR = path.join(FIXTURES_DIR, 'no-state');

test('R1.S1 / AC1: with spec.md, execution_plan.json and execution_state.json present, loadSpecdir loads the AC checklist, coverage.acs map and per-task state', () => {
  const result = loadSpecdir(VALID_DIR);

  assert.ok(Array.isArray(result.checklist));
  assert.ok(result.checklist.length > 0);

  const ac1 = result.checklist.find((item) => item.ac_id === 'AC1');
  assert.ok(ac1, 'AC1 should be present in the parsed checklist');
  assert.equal(ac1.ref, 'R1.S1');
  assert.equal(ac1.tag, 'auto');
  assert.match(ac1.description, /sample automatic criterion one/);
  // Multi-line description continuation must be folded in.
  assert.match(ac1.description, /multi-line parsing/);

  const ac2 = result.checklist.find((item) => item.ac_id === 'AC2');
  assert.ok(ac2);
  assert.equal(ac2.tag, 'manual');

  assert.deepEqual(result.coverageAcs, {
    AC1: ['T1'],
    AC2: ['T2'],
    AC3: ['T1'],
  });

  assert.ok(result.taskState);
  assert.equal(result.taskState.T1.status, 'done');
  assert.equal(result.taskState.T2.status, 'pending');
});

test('R1.S1: when execution_state.json is absent, taskState is null (not an empty object)', () => {
  const result = loadSpecdir(NO_STATE_DIR);

  assert.equal(result.taskState, null);
  assert.ok(Array.isArray(result.checklist));
  assert.ok(result.checklist.length > 0);
  assert.deepEqual(result.coverageAcs, { AC1: ['T1'], AC2: ['T1'] });
});

test('R1.S2 / AC2: SPECDIR missing execution_plan.json throws naming that exact file', () => {
  assert.throws(
    () => loadSpecdir(MISSING_PLAN_DIR),
    (err) => {
      assert.match(err.message, /execution_plan\.json/);
      return true;
    }
  );
});

test('R1.S2 / AC2: SPECDIR missing spec.md throws naming that exact file', () => {
  assert.throws(
    () => loadSpecdir(MISSING_SPEC_DIR),
    (err) => {
      assert.match(err.message, /spec\.md/);
      return true;
    }
  );
});
