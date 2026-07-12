// test/exec/e2e-forensics-analysis.test.mjs — R-E2E.S1 / AC-E2E
//
// Validates the DURABLE, already-committed forensics artifacts for
// docs/specs/archived/token-diet/: forensics.json (enriched with a `signals`
// block by a prior task in this plan) and forensics-analysis.md (the
// judgment-layer artifact composed by a prior task). Both files are read as
// static, real, already-on-disk files -- this test does NOT re-invoke
// forensics.mjs (that would re-resolve real ~/.claude/projects transcripts
// and make the test non-portable; see e2e-forensics.test.mjs and
// report-real-cost.test.mjs for the TOKEN_COST_PROJECTS_ROOT + synthetic
// tmp-fixture convention used everywhere else in this suite -- that
// convention does not apply here because there is nothing left to run).
//
// Anchor-figure extraction mirrors forensics-analysis-validate.mjs's own
// regex convention ("Total USD" + "$<figure>", "Orchestrator share" +
// "<figure>%") verbatim, so this test's independent reconciliation cannot
// silently diverge from what the validator itself checks.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateForensicsAnalysis } from '../../scripts/forensics-analysis-validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECDIR = path.resolve(__dirname, '..', '..', '..', '..', 'docs', 'specs', 'archived', 'token-diet');
const FORENSICS_JSON_PATH = path.join(SPECDIR, 'forensics.json');
const FORENSICS_MD_PATH = path.join(SPECDIR, 'forensics-analysis.md');

const FLOAT_TOLERANCE = 1e-2;

// Mirrors forensics-analysis-validate.mjs's own anchor regexes exactly, so
// this test's "independent" reconciliation reads the same anchor lines the
// validator reads rather than inventing a second, possibly-divergent
// parsing scheme.
function extractAnchorTotalUsd(mdText) {
  const m = /total usd[^$\n]*\$\s*([\d,]+(?:\.\d+)?)/i.exec(mdText);
  assert.ok(m, 'forensics-analysis.md must contain a "Total USD: $<figure>" anchor line');
  return parseFloat(m[1].replace(/,/g, ''));
}

function extractAnchorOrchestratorShare(mdText) {
  const m = /orchestrator share[^%\n\d]*([\d.]+)\s*%/i.exec(mdText);
  assert.ok(m, 'forensics-analysis.md must contain an "Orchestrator share: <figure>%" anchor line');
  return parseFloat(m[1]) / 100;
}

function loadArtifacts() {
  const forensicsJson = JSON.parse(fs.readFileSync(FORENSICS_JSON_PATH, 'utf8'));
  const md = fs.readFileSync(FORENSICS_MD_PATH, 'utf8');
  return { forensicsJson, md };
}

test('R-E2E.S1: Sobre token-diet, tras correr el flujo completo, el SPECDIR contiene forensics.json con signals y forensics-analysis.md con reconstrucción determinista + juicio anclado, y el total USD y el orchestrator share coinciden entre ambos ficheros', () => {
  const { forensicsJson, md } = loadArtifacts();

  // --- forensics.json carries the full signals block.
  assert.ok(forensicsJson.signals, 'forensics.json must have a top-level "signals" block');
  for (const key of ['per_model', 'orchestrator_share', 'orchestrator_token_ratio', 'deviations', 'incidences', 'session_count']) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(forensicsJson.signals, key),
      `forensics.json signals block is missing "${key}"`,
    );
  }

  // --- forensics-analysis.md exists and is non-empty.
  assert.ok(md.trim().length > 0, 'forensics-analysis.md must be non-empty');

  // --- deterministic reconstruction + judgment separation + signal-anchored
  // findings: delegate to the validator rather than reimplementing its
  // structural checks.
  const result = validateForensicsAnalysis(md, forensicsJson);
  assert.equal(result.ok, true, `expected ok:true, got errors: ${JSON.stringify(result.errors)}`);

  // --- independent numeric reconciliation (not only trusting the
  // validator's internal check): total USD.
  const expectedTotalUsd = forensicsJson.orchestrator.real_cost_usd + forensicsJson.subagents_total.real_cost_usd;
  const mdTotalUsd = extractAnchorTotalUsd(md);
  assert.ok(
    Math.abs(mdTotalUsd - expectedTotalUsd) < FLOAT_TOLERANCE,
    `Total USD mismatch: md says $${mdTotalUsd}, forensics.json says $${expectedTotalUsd}`,
  );

  // --- independent numeric reconciliation: orchestrator share.
  const expectedShare = forensicsJson.signals.orchestrator_share;
  const mdShare = extractAnchorOrchestratorShare(md);
  assert.ok(
    Math.abs(mdShare - expectedShare) < FLOAT_TOLERANCE,
    `Orchestrator share mismatch: md says ${(mdShare * 100).toFixed(1)}%, forensics.json signals.orchestrator_share says ${(expectedShare * 100).toFixed(1)}%`,
  );
});

test('AC-E2E: Un run E2E sobre token-diet deja ambos ficheros con las cifras ancla (total USD, orchestrator share) coincidentes entre ambos, y las citas de signal del md corresponden a datos que existen realmente en el forensics.json regenerado', () => {
  // --- both files exist at their expected, committed paths.
  assert.ok(fs.existsSync(FORENSICS_JSON_PATH), `forensics.json must exist at ${FORENSICS_JSON_PATH}`);
  assert.ok(fs.existsSync(FORENSICS_MD_PATH), `forensics-analysis.md must exist at ${FORENSICS_MD_PATH}`);

  const { forensicsJson, md } = loadArtifacts();

  // --- same anchor reconciliation, at the acceptance-criteria (black-box)
  // level.
  const expectedTotalUsd = forensicsJson.orchestrator.real_cost_usd + forensicsJson.subagents_total.real_cost_usd;
  const mdTotalUsd = extractAnchorTotalUsd(md);
  assert.ok(Math.abs(mdTotalUsd - expectedTotalUsd) < FLOAT_TOLERANCE);

  const expectedShare = forensicsJson.signals.orchestrator_share;
  const mdShare = extractAnchorOrchestratorShare(md);
  assert.ok(Math.abs(mdShare - expectedShare) < FLOAT_TOLERANCE);

  // --- staleness guard: the md must not be a leftover from before the
  // `signals` block existed. Every model name in the CURRENT
  // signals.per_model rollup must be cited somewhere in the md (a doc
  // written against an older forensics.json, before this regeneration,
  // would not mention these exact model names/figures). Model ids that end
  // in an 8-digit release date (e.g. "claude-haiku-4-5-20251001") are
  // legitimately cited in prose without that suffix (e.g.
  // "claude-haiku-4-5"), so accept either form.
  const perModelNames = Object.keys(forensicsJson.signals.per_model);
  assert.ok(perModelNames.length > 0, 'forensics.json signals.per_model must be non-empty for this staleness check to be meaningful');
  for (const modelName of perModelNames) {
    const shortName = modelName.replace(/-\d{8}$/, '');
    assert.ok(
      md.includes(modelName) || md.includes(shortName),
      `forensics-analysis.md never mentions model "${modelName}" (or "${shortName}") from the regenerated forensics.json signals.per_model -- looks stale`,
    );
  }

  // --- staleness guard: every task_id in signals.deviations (computed
  // fresh by the regenerated forensics.json) must be cited in the md too.
  const deviationTaskIds = (forensicsJson.signals.deviations || []).map((d) => d.task_id);
  assert.ok(deviationTaskIds.length > 0, 'forensics.json signals.deviations must be non-empty for this staleness check to be meaningful');
  for (const taskId of deviationTaskIds) {
    assert.ok(
      md.includes(taskId),
      `forensics-analysis.md never mentions task_id "${taskId}" from the regenerated forensics.json signals.deviations -- looks stale`,
    );
  }
});
