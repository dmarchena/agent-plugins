import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALIDATE_SH = path.join(__dirname, '../../..', 'scripts/validate.sh');

test('R4.S1: budget-guard.mjs debe estar conectado a validate.sh con patrón bloqueante (|| fail=1)', async (t) => {
  const content = fs.readFileSync(VALIDATE_SH, 'utf-8');
  const lines = content.split('\n');

  // Buscar la línea que invoca budget-guard.mjs
  const budgetGuardLine = lines.find((line) =>
    line.includes('budget-guard.mjs') && line.includes('node')
  );

  assert.ok(
    budgetGuardLine,
    'validate.sh debe contener una línea que invoque budget-guard.mjs'
  );

  // Verificar que la invocación tiene el patrón bloqueante || fail=1
  const hasBlockingPattern = budgetGuardLine.includes('|| fail=1');
  assert.ok(
    hasBlockingPattern,
    `budget-guard.mjs debe estar seguido de || fail=1 (patrón bloqueante), pero la línea es: ${budgetGuardLine}`
  );

  // Verificar que NO tiene || true (sería no-bloqueante)
  const hasNonBlockingPattern = budgetGuardLine.includes('|| true');
  assert.ok(
    !hasNonBlockingPattern,
    `budget-guard.mjs debe usar || fail=1, no || true. Línea: ${budgetGuardLine}`
  );
});
