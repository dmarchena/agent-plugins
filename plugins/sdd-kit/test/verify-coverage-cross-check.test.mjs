import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecdir, VerifyInputError } from '../scripts/verify-tools.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'verify');

const COVERAGE_MATCH_DIR = path.join(FIXTURES_DIR, 'coverage-match');
const COVERAGE_MISMATCH_DIR = path.join(FIXTURES_DIR, 'coverage-mismatch');

test('R2.S1 / AC3: every ac_id in plan.coverage.acs has a matching checklist line loads without throwing', () => {
  const result = loadSpecdir(COVERAGE_MATCH_DIR);

  const coverageAcIds = Object.keys(result.coverageAcs);
  assert.deepEqual(coverageAcIds.sort(), ['AC1', 'AC2']);

  for (const acId of coverageAcIds) {
    assert.ok(
      result.checklist.some((item) => item.ac_id === acId),
      `checklist should contain an item for ${acId}`
    );
  }
});

test('R2.S2 / AC4: an ac_id in plan.coverage.acs (AC25) absent from the checklist aborts with VerifyInputError naming it', () => {
  assert.throws(
    () => loadSpecdir(COVERAGE_MISMATCH_DIR),
    (err) => {
      assert.ok(err instanceof VerifyInputError);
      assert.match(err.message, /AC25/);
      return true;
    }
  );
});
