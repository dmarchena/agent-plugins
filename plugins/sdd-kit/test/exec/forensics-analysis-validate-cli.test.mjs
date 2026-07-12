// test/exec/forensics-analysis-validate-cli.test.mjs — CLI entry point for
// forensics-analysis-validate.mjs (task cli-entry-point).
//
// AC1: a SPECDIR whose forensics-analysis.md and forensics.json reconcile
// (no violated invariant) -> stdout is exactly
// {"ok":true,"data":{"ok":true,"errors":[]}} and exit code 0.
// AC2: a SPECDIR whose forensics-analysis.md violates an invariant ->
// stdout is {"ok":true,"data":{"ok":false,"errors":[...]}} with a
// non-empty errors array, and the process STILL exits with code 0 (a
// validator-reported failure is data, not a process failure).
//
// Fixtures reused verbatim from test/exec/fixtures/forensics-analysis/
// (the same complete-* pair test/exec/forensics-analysis-validate.test.mjs
// already exercises against the exported function directly). AC2 reuses
// the same "Total USD mismatch" mutation as that file's own negative test,
// applied here to a copy of the md written into the fixture SPECDIR, so no
// new fixture files are needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'forensics-analysis-validate.mjs');
const FIXTURES = path.join(__dirname, 'fixtures', 'forensics-analysis');

function loadPair(prefix) {
  const json = fs.readFileSync(path.join(FIXTURES, `${prefix}-forensics.json`), 'utf8');
  const md = fs.readFileSync(path.join(FIXTURES, `${prefix}-forensics-analysis.md`), 'utf8');
  return { json, md };
}

function makeSpecDir(mdText, jsonText) {
  const specDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-analysis-validate-cli-specdir-'));
  fs.writeFileSync(path.join(specDir, 'forensics-analysis.md'), mdText);
  fs.writeFileSync(path.join(specDir, 'forensics.json'), jsonText);
  return specDir;
}

function runCli(specDir) {
  return spawnSync('node', [CLI, specDir], { encoding: 'utf8' });
}

test('AC1: SPECDIR cuyo forensics-analysis.md y forensics.json reconcilian (sin invariante violado) imprime exactamente {"ok":true,"data":{"ok":true,"errors":[]}} y el proceso sale con codigo 0', () => {
  const { json, md } = loadPair('complete');
  const specDir = makeSpecDir(md, json);

  try {
    const result = runCli(specDir);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.equal(result.stdout, '{"ok":true,"data":{"ok":true,"errors":[]}}\n');
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});

test('AC2: SPECDIR cuyo forensics-analysis.md viola un invariante imprime {"ok":true,"data":{"ok":false,"errors":[...]}} con errors no vacio, y el proceso sigue saliendo con codigo 0', () => {
  const { json, md } = loadPair('complete');
  const mutatedMd = md.replace('Total USD: $12.00', 'Total USD: $999.00');
  assert.notEqual(mutatedMd, md, 'fixture text to mutate was not found -- fixture drifted');
  const specDir = makeSpecDir(mutatedMd, json);

  try {
    const result = runCli(specDir);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.ok, false);
    assert.ok(Array.isArray(parsed.data.errors) && parsed.data.errors.length > 0, `expected a non-empty errors array, got: ${JSON.stringify(parsed.data.errors)}`);
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
  }
});
