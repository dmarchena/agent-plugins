// T6-budget-guard: budget-guard.mjs migra su stdout al envelope compartido
// de scripts/lib/cli.mjs, preservando su exit code distinto de cero como
// gate cuando un skill excede su techo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_GUARD_PATH = path.join(__dirname, '..', 'scripts', 'budget-guard.mjs');

const FIXTURES_ROOT = path.join(__dirname, 'fixtures', 'budget-guard-exceeded');
const SKILLS_FIXTURE_DIR = path.join(FIXTURES_ROOT, 'skills');
const HWM_FIXTURE_DIR = path.join(FIXTURES_ROOT, 'hwm');

test('ref AC7: budget-guard con un skill que excede su techo emite {ok:true,data:{results:[...],withinBudget:false}} y termina con codigo distinto de cero como gate', () => {
  const result = spawnSync(
    process.execPath,
    [
      BUDGET_GUARD_PATH,
      '--skills-dir',
      SKILLS_FIXTURE_DIR,
      '--hwm-dir',
      HWM_FIXTURE_DIR,
    ],
    { encoding: 'utf8' }
  );

  assert.notEqual(result.status, 0, 'exit code debe ser distinto de cero como gate cuando hay un skill que excede su techo');

  const stdout = result.stdout;
  const parsed = JSON.parse(stdout);

  assert.equal(parsed.ok, true, 'exceder el techo sigue siendo ok:true (resultado de dominio, no un fallo de I/O)');
  assert.ok(Array.isArray(parsed.data.results), 'data.results debe ser un array');
  assert.equal(parsed.data.withinBudget, false, 'data.withinBudget debe ser false cuando algun skill excede su techo');

  const exceededEntry = parsed.data.results.find((r) => r.skill === 'verify');
  assert.ok(exceededEntry, 'debe reportar una entrada para el skill que excede su techo');
  assert.equal(exceededEntry.withinBudget, false);
  assert.ok(exceededEntry.count > exceededEntry.ceiling, 'el skill excedido debe tener count > ceiling');
});

test('ref AC4: budget-guard no define localmente helpers de I/O y usa el modulo compartido', () => {
  const source = fs.readFileSync(BUDGET_GUARD_PATH, 'utf8');

  assert.match(
    source,
    /from\s+['"]\.\/lib\/cli\.mjs['"]/,
    'budget-guard.mjs debe importar del modulo compartido ./lib/cli.mjs'
  );
  assert.match(
    source,
    /\bemitSuccess\s*\(/,
    'budget-guard.mjs debe usar emitSuccess() del modulo compartido para emitir su resultado'
  );
  assert.doesNotMatch(
    source,
    /function\s+emitSuccess/,
    'budget-guard.mjs no debe definir localmente su propio emitSuccess'
  );
  assert.doesNotMatch(
    source,
    /function\s+emitError/,
    'budget-guard.mjs no debe definir localmente su propio emitError'
  );
  assert.doesNotMatch(
    source,
    /JSON\.stringify\(\s*\{\s*ok\s*:/,
    'budget-guard.mjs no debe reimplementar el envelope manualmente con JSON.stringify({ok:...})'
  );
});
