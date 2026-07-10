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

test('R1.S1: plan-tools inspect-spec en exito emite {ok:true,data:...} compacto en una linea y termina con codigo 0', () => {
  const result = spawnSync(
    process.execPath,
    [PLAN_TOOLS_PATH, 'inspect-spec', SPEC_PATH],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, 'inspect-spec en exito debe terminar con codigo 0');

  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `stdout debe ser una sola linea; stdout=${JSON.stringify(result.stdout)}`);

  let parsed;
  try {
    parsed = JSON.parse(lines[0]);
  } catch (err) {
    assert.fail(`stdout debe ser JSON parseable con el envelope {ok:true,data:...}; stdout=${JSON.stringify(result.stdout)} (${err.message})`);
  }

  assert.equal(parsed.ok, true, 'ok debe ser true');
  assert.equal(typeof parsed.data, 'object', 'data debe ser un objeto');
});

test('R1.S1: plan-tools check-plan en exito emite {ok:true,data:...} compacto en una linea y termina con codigo 0', () => {
  const VALID_PLAN_PATH = path.join(__dirname, 'fixtures', 'valid', 'plan.json');
  const result = spawnSync(
    process.execPath,
    [PLAN_TOOLS_PATH, 'check-plan', SPEC_PATH, VALID_PLAN_PATH],
    { encoding: 'utf8' }
  );

  assert.equal(result.status, 0, `check-plan en exito debe terminar con codigo 0; stderr=${result.stderr}`);

  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `stdout debe ser una sola linea; stdout=${JSON.stringify(result.stdout)}`);

  let parsed;
  try {
    parsed = JSON.parse(lines[0]);
  } catch (err) {
    assert.fail(`stdout debe ser JSON parseable con el envelope {ok:true,data:...}; stdout=${JSON.stringify(result.stdout)} (${err.message})`);
  }

  assert.equal(parsed.ok, true, 'ok debe ser true');
  assert.equal(typeof parsed.data, 'object', 'data debe ser un objeto');
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
