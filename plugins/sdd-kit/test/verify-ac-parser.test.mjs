import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSpecdir, VerifyInputError } from '../scripts/verify-tools.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'verify');

const WRAPPED_DESCRIPTION_DIR = path.join(FIXTURES_DIR, 'wrapped-description-only');
const MALFORMED_AC_LINE_DIR = path.join(FIXTURES_DIR, 'malformed-ac-line');

test('R1.S1 / AC1: SPECDIR with a valid checklist whose description wraps onto a second line (no dash) loads without throwing and folds the wrapped description into a single string', () => {
  const result = loadSpecdir(WRAPPED_DESCRIPTION_DIR);

  assert.ok(Array.isArray(result.checklist));
  assert.equal(result.checklist.length, 1);

  const ac1 = result.checklist[0];
  assert.equal(ac1.ac_id, 'AC1');
  assert.equal(ac1.ref, 'R1.S1');
  assert.equal(ac1.tag, 'auto');
  assert.match(ac1.description, /sample automatic criterion/);
  assert.match(ac1.description, /wraps onto a second line/);
});

test('R1.S2 / AC2: SPECDIR with a malformed AC list line under "## Acceptance Criteria" throws VerifyInputError whose message includes the offending line text', () => {
  assert.throws(
    () => loadSpecdir(MALFORMED_AC_LINE_DIR),
    (err) => {
      assert.ok(err instanceof VerifyInputError);
      assert.match(err.message, /AC25/);
      assert.match(err.message, /R7-catálogos/);
      return true;
    }
  );
});
