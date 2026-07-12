// test/exec/forensics-analysis-validate.test.mjs — R2 validator for
// forensics-analysis.md against its enriched forensics.json.
//
// R2.S1 / AC3: happy path -- deterministic reconstruction + separated
// judgment sections, anchor figures reconciling, findings citing real
// signals.
// R2.S2 / AC4: degraded path -- unresolved tasks marked, no fabricated
// figures, join-incomplete stated. This is itself CORRECT behaviour: the
// validator confirms the degraded doc, it does not reject it.
//
// Fixtures live in test/exec/fixtures/forensics-analysis/ (mirrors the
// e2e-token-reduction/ fixture convention: plain JSON.stringify(...,null,2)
// files sitting next to the .md they pair with).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateForensicsAnalysis } from '../../scripts/forensics-analysis-validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures', 'forensics-analysis');

function loadPair(prefix) {
  const json = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${prefix}-forensics.json`), 'utf8'));
  const md = fs.readFileSync(path.join(FIXTURES, `${prefix}-forensics-analysis.md`), 'utf8');
  return { json, md };
}

test('R2.S1: Dado un forensics.json enriquecido y un forensics-analysis.md completo, la validación confirma reconstrucción determinista y secciones de juicio separadas, cifras ancla coincidentes con forensics.json y cada hallazgo de juicio citando un signal presente', () => {
  const { json, md } = loadPair('complete');
  const result = validateForensicsAnalysis(md, json);
  assert.equal(result.ok, true, `expected ok:true, got errors: ${JSON.stringify(result.errors)}`);
  assert.deepEqual(result.errors, []);
});

test('R2.S2: Dado un forensics.json degradado (tarea no resuelta), la validación confirma que el md marca las tareas no resueltas, no contiene cifras fabricadas para ellas y declara el join incompleto', () => {
  const { json, md } = loadPair('degraded');
  const result = validateForensicsAnalysis(md, json);
  assert.equal(result.ok, true, `expected ok:true, got errors: ${JSON.stringify(result.errors)}`);
  assert.deepEqual(result.errors, []);
});

test('AC3: forensics-analysis.md completo tiene reconstrucción de coste determinista y secciones de juicio separadas de ella; las cifras ancla (total USD, orchestrator share) coinciden con forensics.json; cada hallazgo de juicio cita un signal presente en forensics.json', () => {
  const { json, md } = loadPair('complete');

  // Structural existence: a deterministic heading and at least one judgment
  // heading, in that order.
  assert.match(md, /#{1,6}\s+.*deterministic/i);
  assert.match(md, /#{1,6}\s+.*judgment/i);

  const result = validateForensicsAnalysis(md, json);
  assert.equal(result.ok, true, `expected ok:true, got errors: ${JSON.stringify(result.errors)}`);

  // Anchor figures reconcile independently of the validator's own parsing,
  // as an extra guard against the validator and the fixture agreeing on a
  // bug.
  const expectedTotalUsd = json.orchestrator.real_cost_usd + json.subagents_total.real_cost_usd;
  assert.equal(expectedTotalUsd, 12.0);
  assert.ok(Math.abs(json.signals.orchestrator_share - 0.8333333333333334) < 1e-9);
});

test('AC4: con un forensics.json degradado (tarea resolved:false), forensics-analysis.md marca las tareas no resueltas, no contiene cifras fabricadas para ellas, y declara el join incompleto', () => {
  const { json, md } = loadPair('degraded');

  const unresolved = Object.entries(json.tasks).filter(([, t]) => t.resolved === false);
  assert.equal(unresolved.length, 1);
  const [unresolvedId] = unresolved[0];
  assert.equal(unresolvedId, 't2-gamma');

  const result = validateForensicsAnalysis(md, json);
  assert.equal(result.ok, true, `expected ok:true, got errors: ${JSON.stringify(result.errors)}`);
  assert.match(md, /incomplete/i);
});

test('negative: anchor Total USD mismatch is rejected', () => {
  const { json, md } = loadPair('complete');
  const mutated = md.replace('Total USD: $12.00', 'Total USD: $999.00');
  const result = validateForensicsAnalysis(mutated, json);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Total USD mismatch/.test(e)), `expected a Total USD mismatch error, got: ${JSON.stringify(result.errors)}`);
});

test('negative: a judgment finding citing a fabricated signal name is rejected', () => {
  const { json, md } = loadPair('complete');
  const mutated = md.replace(
    '- **O1** — signal orchestrator_share is 83.3%, meaning the orchestrator dominates\n  total cost; splitting the session across `/clear` boundaries is the largest lever.',
    '- **O1** — signal made_up_signal_xyz is 83.3%, meaning the orchestrator dominates\n  total cost; splitting the session across `/clear` boundaries is the largest lever.',
  );
  assert.notEqual(mutated, md, 'fixture text to mutate was not found -- fixture drifted');
  const result = validateForensicsAnalysis(mutated, json);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /cites no known signal/.test(e)), `expected a "cites no known signal" error, got: ${JSON.stringify(result.errors)}`);
});
