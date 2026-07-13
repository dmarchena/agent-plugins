// TDD tests for plan-tools.mjs's `calibration-snapshot` subcommand.
// See docs/specs/token-estimator-calibration/spec.md, R1 (R1.S1/R1.S2).
//
// R1.S1: a fully executed archived plan (plan-alpha, all tasks carry a
// non-null actual_tokens) contributes exactly one row per task, each with
// the nine required columns, and a correctly-signed deviation%.
//
// R1.S2: a task with a null actual_tokens (plan-beta's U2) contributes no
// row and is counted on an `excluded: <K>` line; a never-executed plan
// (plan-gamma-unexecuted, every task's actual_tokens is null) contributes
// zero rows but adds to that same excluded count; a task whose
// estimated_tokens is 0 (plan-beta's U1) still produces a row, with
// deviation% rendered as `N/A`.
//
// A fourth fixture dir (plan-delta-no-state) has only an execution_plan.json
// (no execution_state.json) and must be skipped entirely -- not even
// contributing to `excluded`, since it never qualifies as an archived
// dir holding BOTH files per R1's lead paragraph.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAN_TOOLS_PATH = path.join(__dirname, '..', 'scripts', 'plan-tools.mjs');
const ARCHIVED_FIXTURES_DIR = path.join(__dirname, 'fixtures', 'calibration-snapshot', 'archived');

function runCalibrationSnapshot(args) {
  return spawnSync(process.execPath, [PLAN_TOOLS_PATH, 'calibration-snapshot', ...args], {
    encoding: 'utf8',
  });
}

function parseEnvelope(result) {
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, `stdout debe ser una sola linea; stdout=${JSON.stringify(result.stdout)}`);
  return JSON.parse(lines[0]);
}

test('R1.S1+R1.S2: calibration-snapshot en exito emite {ok:true,data:...} con rows=3 y excluded=3', () => {
  const result = runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]);

  assert.equal(result.status, 0, `debe terminar con codigo 0; stderr=${result.stderr}`);
  const parsed = parseEnvelope(result);

  assert.equal(parsed.ok, true, 'ok debe ser true');
  assert.equal(typeof parsed.data, 'object', 'data debe ser un objeto');
  assert.equal(parsed.data.rows, 3, 'rows debe contar solo las tareas ejecutadas con actual_tokens no nulo (T1, T2, U1)');
  assert.equal(parsed.data.excluded, 3, 'excluded debe contar U2 (actual_tokens null) + V1 + V2 (plan nunca ejecutado)');
  assert.equal(typeof parsed.data.markdown, 'string', 'data.markdown debe ser el snapshot en Markdown');
});

test('R1.S1: el snapshot tiene una fila por tarea del plan totalmente ejecutado, con las 9 columnas y el signo correcto de deviation%', () => {
  const result = runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]);
  const parsed = parseEnvelope(result);
  const md = parsed.data.markdown;

  const lines = md.split('\n');
  const headerIdx = lines.findIndex((l) => l.startsWith('|') && l.toLowerCase().includes('plan_slug'));
  assert.notEqual(headerIdx, -1, 'debe existir una fila de cabecera con plan_slug');

  const headerCols = lines[headerIdx].split('|').map((c) => c.trim()).filter(Boolean);
  assert.equal(headerCols.length, 9, `la cabecera debe tener 9 columnas; tiene ${headerCols.length}: ${JSON.stringify(headerCols)}`);

  const t1Line = lines.find((l) => l.includes('| plan-alpha ') && l.includes('| T1 |') || (l.includes('plan-alpha') && l.includes('T1')));
  assert.ok(t1Line, `debe existir una fila para T1; markdown=${md}`);
  // T1: estimated=100, actual=130 -> deviation = round((130-100)/100*100) = +30
  assert.match(t1Line, /\+30%/, `la fila de T1 debe llevar deviation% = +30 (signo positivo); linea=${t1Line}`);
  assert.match(t1Line, /code_writer/, 'la fila de T1 debe incluir su agent_type');
  // T1 is index 0, has 0 dependencies, plan size 2
  assert.match(t1Line, /\|\s*0\s*\|\s*0\s*\|\s*2\s*\|/, `la fila de T1 debe reflejar task_index=0, dependencies=0, plan_size=2; linea=${t1Line}`);

  const t2Line = lines.find((l) => l.includes('plan-alpha') && l.includes('T2'));
  assert.ok(t2Line, `debe existir una fila para T2; markdown=${md}`);
  // T2: estimated=200, actual=150 -> deviation = round((150-200)/200*100) = -25
  assert.match(t2Line, /-25%/, `la fila de T2 debe llevar deviation% = -25 (signo negativo); linea=${t2Line}`);
  assert.match(t2Line, /reviewer/, 'la fila de T2 debe incluir su agent_type');
  // T2 is index 1, has 1 dependency, plan size 2
  assert.match(t2Line, /\|\s*1\s*\|\s*1\s*\|\s*2\s*\|/, `la fila de T2 debe reflejar task_index=1, dependencies=1, plan_size=2; linea=${t2Line}`);
});

test('R1.S2: una tarea con actual_tokens null no genera fila y se cuenta en `excluded: <K>`', () => {
  const result = runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]);
  const parsed = parseEnvelope(result);
  const md = parsed.data.markdown;

  assert.doesNotMatch(md, /\bU2\b/, 'U2 (actual_tokens null) no debe aparecer en ninguna fila del snapshot');
  assert.doesNotMatch(md, /\bV1\b/, 'V1 (plan nunca ejecutado) no debe aparecer en ninguna fila del snapshot');
  assert.doesNotMatch(md, /\bV2\b/, 'V2 (plan nunca ejecutado) no debe aparecer en ninguna fila del snapshot');
  assert.match(md, /excluded:\s*3/, `el snapshot debe declarar excluded: 3 (no drop silencioso); markdown=${md}`);
});

test('R1.S2: una tarea con estimated_tokens 0 sigue generando fila, con deviation% = N/A', () => {
  const result = runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]);
  const parsed = parseEnvelope(result);
  const md = parsed.data.markdown;

  const u1Line = md.split('\n').find((l) => l.includes('plan-beta') && l.includes('U1'));
  assert.ok(u1Line, `debe existir una fila para U1 (estimated_tokens=0, actual_tokens=500); markdown=${md}`);
  assert.match(u1Line, /\|\s*N\/A\s*\|/, `la fila de U1 debe llevar deviation% = N/A; linea=${u1Line}`);
});

test('calibration-snapshot con --out escribe el mismo Markdown en disco', () => {
  const outPath = path.join(os.tmpdir(), `calibration-snapshot-test-${process.pid}-${Date.now()}.md`);
  try {
    const result = runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR, '--out', outPath]);
    assert.equal(result.status, 0, `debe terminar con codigo 0; stderr=${result.stderr}`);
    const parsed = parseEnvelope(result);
    assert.equal(parsed.ok, true);

    assert.ok(fs.existsSync(outPath), '--out debe escribir el fichero en la ruta indicada');
    const written = fs.readFileSync(outPath, 'utf8');
    assert.equal(written, parsed.data.markdown, 'el fichero escrito debe coincidir byte a byte con data.markdown');
  } finally {
    fs.rmSync(outPath, { force: true });
  }
});

test('calibration-snapshot sin argumento de directorio emite {ok:false,error:{reason}} y termina con codigo distinto de cero', () => {
  const result = runCalibrationSnapshot([]);
  assert.notEqual(result.status, 0, 'debe terminar con codigo distinto de cero');
  const parsed = parseEnvelope(result);
  assert.equal(parsed.ok, false, 'ok debe ser false');
  assert.equal(typeof parsed.error.reason, 'string');
  assert.ok(parsed.error.reason.length > 0);
});

test('calibration-snapshot es determinista: dos ejecuciones sobre el mismo input producen el mismo Markdown', () => {
  const first = parseEnvelope(runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]));
  const second = parseEnvelope(runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]));
  assert.equal(first.data.markdown, second.data.markdown, 'el snapshot debe ser byte-identico entre ejecuciones sobre el mismo input');
});
