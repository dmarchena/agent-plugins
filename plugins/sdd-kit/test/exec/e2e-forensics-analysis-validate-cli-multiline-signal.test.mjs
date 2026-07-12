// test/exec/e2e-forensics-analysis-validate-cli-multiline-signal.test.mjs —
// R-E2E.S1
//
// End-to-end integration test combining the two already-shipped pieces:
//   1. The CLI entry point (scripts/forensics-analysis-validate.mjs),
//      spawned as a child process against a fixture SPECDIR (pattern from
//      forensics-analysis-validate-cli.test.mjs).
//   2. The multi-line judgment-finding signal-citation fix in
//      validateForensicsAnalysis (findBulletFindings/bulletIndent), which
//      matches a bullet's FULL text — first line + indented continuation
//      lines of the same list item — not just its first line (unit-level
//      coverage: forensics-analysis-validate.test.mjs's R3.S1/R3.S2).
//
// This file does not re-test either piece in isolation; it confirms they
// compose correctly through the real CLI process boundary: a judgment
// finding that cites its signal ONLY on a continuation line must still be
// accepted by the CLI-spawned validator, end to end.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'forensics-analysis-validate.mjs');

// Minimal forensics.json: orchestrator + subagents_total anchor the
// deterministic Total USD / Orchestrator share figures below, and
// signals.orchestrator_share is the one real signal name the judgment
// finding cites — deliberately only on its continuation line. No tasks
// (so no unresolved-task / incomplete-join invariant applies).
const FORENSICS_JSON = {
  tasks: {},
  orchestrator: { real_cost_usd: 10.0 },
  subagents_total: { real_cost_usd: 2.0 },
  signals: {
    orchestrator_share: 0.8333333333333334,
  },
};

// Total USD = 10.00 + 2.00 = 12.00; Orchestrator share = 12.00 -> 83.3%.
// The judgment finding's first line mentions no signal name at all; the
// indented continuation line (same list item) cites "orchestrator_share".
// Nothing else in the document violates any other invariant.
const FORENSICS_ANALYSIS_MD = [
  '# Forensics analysis — fixture (multi-line signal citation)',
  '',
  '## 1. Cost reconstruction (deterministic)',
  '',
  'Total USD: $12.00',
  'Orchestrator share: 83.3%',
  '',
  '## 2. Opportunities (judgment)',
  '',
  '- **O1** — this first line mentions nothing signal-related at all,',
  '  it continues here citing orchestrator_share as the real signal used.',
  '',
].join('\n');

function makeSpecDir() {
  const specDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-forensics-analysis-validate-cli-multiline-signal-'));
  fs.writeFileSync(path.join(specDir, 'forensics-analysis.md'), FORENSICS_ANALYSIS_MD);
  fs.writeFileSync(path.join(specDir, 'forensics.json'), JSON.stringify(FORENSICS_JSON, null, 2));
  return specDir;
}

function runCli(specDir) {
  return spawnSync('node', [CLI, specDir], { encoding: 'utf8' });
}

test('R-E2E.S1: node forensics-analysis-validate.mjs sobre un SPECDIR cuyo forensics-analysis.md cita un signal real de forensics.json solo en una linea de continuacion (2a/3a linea, indentada, del mismo item) de un judgment finding -- y en lo demas reconcilia sin violar ningun otro invariante -- imprime exactamente {"ok":true,"data":{"ok":true,"errors":[]}} y el proceso sale con codigo 0', () => {
  const specDir = makeSpecDir();

  try {
    const result = runCli(specDir);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stdout, '{"ok":true,"data":{"ok":true,"errors":[]}}\n');
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});
