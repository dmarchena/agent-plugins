// TDD tests for plan-tools.mjs migration to the shared scripts/lib/cli.mjs
// envelope helpers ({ok,data,error}). See docs/specs/unify-cli-io/spec.md
// (AC3/AC4) and execution_plan.json task T4-plan-tools.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAN_TOOLS_PATH = path.join(__dirname, '..', 'scripts', 'plan-tools.mjs');
const SPEC_PATH = path.join(__dirname, 'fixtures', 'valid', 'spec.md');
const MALFORMED_PLAN_PATH = path.join(__dirname, 'fixtures', 'malformed-json', 'plan.json');

test('AC3: plan-tools con un plan.json malformado emite {ok:false,error:{reason}} en stdout y termina con codigo distinto de cero', () => {
  const result = spawnSync(
    process.execPath,
    [PLAN_TOOLS_PATH, 'check-plan', SPEC_PATH, MALFORMED_PLAN_PATH],
    { encoding: 'utf8' }
  );

  assert.notEqual(result.status, 0, 'plan-tools debe terminar con codigo distinto de cero');

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    assert.fail(
      `stdout debe ser JSON parseable con el envelope {ok:false,error:{reason}}; stdout=${JSON.stringify(
        result.stdout
      )} stderr=${JSON.stringify(result.stderr)} (${err.message})`
    );
  }

  assert.equal(parsed.ok, false, 'ok debe ser false');
  assert.equal(typeof parsed.error, 'object', 'error debe ser un objeto');
  assert.equal(typeof parsed.error.reason, 'string', 'error.reason debe ser un string');
  assert.ok(parsed.error.reason.length > 0, 'error.reason no debe estar vacio');
});

test('AC4: plan-tools no define localmente su helper de error/parseo y usa el modulo compartido', () => {
  const source = fs.readFileSync(PLAN_TOOLS_PATH, 'utf8');

  assert.doesNotMatch(
    source,
    /function\s+fail\s*\(/,
    'plan-tools.mjs no debe definir localmente un helper fail()'
  );
  assert.doesNotMatch(
    source,
    /function\s+parseFlags\s*\(/,
    'plan-tools.mjs no debe definir localmente un parseFlags()'
  );
  assert.match(
    source,
    /from\s+['"]\.\/lib\/cli\.mjs['"]/,
    'plan-tools.mjs debe importar los helpers desde ./lib/cli.mjs'
  );
});
