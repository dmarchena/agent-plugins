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

// ---------------------------------------------------------------------------
// R2 (docs/specs/token-estimator-calibration/spec.md): per-plan bias summary
// ---------------------------------------------------------------------------
//
// R2.S1: the summary lists each plan (that contributed at least one row to
// the main table) with the signed mean of its rows' numeric deviation%, plus
// one overall grand-mean line across all included rows. plan-alpha's two
// rows are T1=+30%, T2=-25% -> mean = round((30-25)/2) = round(2.5) = +3
// (Math.round rounds .5 away from zero for positives). plan-beta's only
// included row (U1) has deviation% = N/A (estimated_tokens was 0), so its
// mean must render N/A rather than NaN/crash from an empty-denominator
// division. plan-gamma-unexecuted contributes zero rows at all, so it must
// not appear in the summary either. The overall line covers the same two
// numeric rows (T1, T2) as plan-alpha, so it lands on the same +3%.

test('R2.S1: el summary lista el mean deviation% firmado por plan, con N/A cuando el plan no tiene filas con deviation% numerico, y una linea overall', () => {
  const result = runCalibrationSnapshot([ARCHIVED_FIXTURES_DIR]);
  const parsed = parseEnvelope(result);
  const md = parsed.data.markdown;

  assert.match(md, /## Per-plan bias summary/, `debe existir una seccion de resumen por plan; markdown=${md}`);
  assert.match(
    md,
    /\|\s*plan-alpha\s*\|\s*\+3%\s*\|/,
    `plan-alpha debe listar mean deviation% = +3% (round((30-25)/2)); markdown=${md}`
  );
  assert.match(
    md,
    /\|\s*plan-beta\s*\|\s*N\/A\s*\|/,
    `plan-beta debe listar N/A cuando ninguna de sus filas incluidas tiene deviation% numerico; markdown=${md}`
  );
  assert.doesNotMatch(
    md,
    /plan-gamma-unexecuted/,
    'plan-gamma-unexecuted no contribuye ninguna fila y no debe aparecer en el summary'
  );
  assert.match(md, /overall:\s*\+3%/, `debe existir una linea overall con el mean global firmado; markdown=${md}`);
});

test('R2.S1/AC3: sobre los datos reales archivados, fix-commit-state-ordering tiene mean deviation% negativo y verify positivo', () => {
  const realArchivedDir = path.join(__dirname, '..', '..', '..', 'docs', 'specs', 'archived');
  const result = runCalibrationSnapshot([realArchivedDir]);
  assert.equal(result.status, 0, `debe terminar con codigo 0; stderr=${result.stderr}`);
  const parsed = parseEnvelope(result);
  const md = parsed.data.markdown;

  const fixMatch = md.match(/\|\s*fix-commit-state-ordering\s*\|\s*([+-]\d+)%\s*\|/);
  assert.ok(fixMatch, `debe existir una fila de resumen para fix-commit-state-ordering; markdown=${md}`);
  assert.ok(
    Number(fixMatch[1]) < 0,
    `fix-commit-state-ordering debe tener mean deviation% negativo (sobre-estimado); obtenido=${fixMatch[1]}%`
  );

  const verifyMatch = md.match(/\|\s*verify\s*\|\s*([+-]\d+)%\s*\|/);
  assert.ok(verifyMatch, `debe existir una fila de resumen para verify; markdown=${md}`);
  assert.ok(
    Number(verifyMatch[1]) > 0,
    `verify debe tener mean deviation% positivo (sub-estimado); obtenido=${verifyMatch[1]}%`
  );
});

// R3/AC4: regenerar el snapshot contra el directorio real de specs
// archivadas debe producir exactamente el Markdown ya committeado en
// plugins/sdd-kit/skills/plan-writer/assets/calibration-snapshot.md -- es
// decir, `git diff --exit-code` sobre ese fichero no debe reportar cambios
// tras una regeneracion. A diferencia del test sintetico de arriba (mismo
// input dos veces), este ejercita el caso real de AC4: input real,
// artefacto real committeado.
//
// Ambos lados se leen en el momento de ejecutar el test (no se cachea nada
// de una carga anterior de este fichero), para que el resultado sea
// correcto sin importar el orden relativo frente a otra tarea que este
// regenerando este mismo fichero committeado en paralelo.
test('R3/AC4: regenerar contra docs/specs/archived/ real es byte-identico al snapshot actualmente committeado en disco', () => {
  const REAL_ARCHIVED_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'specs', 'archived');
  const COMMITTED_SNAPSHOT_PATH = path.join(
    __dirname,
    '..',
    'skills',
    'plan-writer',
    'assets',
    'calibration-snapshot.md'
  );

  assert.ok(
    fs.existsSync(REAL_ARCHIVED_DIR),
    `debe existir el directorio real de specs archivadas: ${REAL_ARCHIVED_DIR}`
  );
  assert.ok(
    fs.existsSync(COMMITTED_SNAPSHOT_PATH),
    `debe existir el snapshot actualmente committeado: ${COMMITTED_SNAPSHOT_PATH}`
  );

  const committed = fs.readFileSync(COMMITTED_SNAPSHOT_PATH, 'utf8');

  const result = runCalibrationSnapshot([REAL_ARCHIVED_DIR]);
  assert.equal(result.status, 0, `debe terminar con codigo 0; stderr=${result.stderr}`);
  const regenerated = parseEnvelope(result).data.markdown;

  assert.equal(
    regenerated,
    committed,
    'regenerar contra docs/specs/archived/ debe ser byte-identico al fichero committeado (AC4: git diff --exit-code no debe reportar cambios)'
  );
});
