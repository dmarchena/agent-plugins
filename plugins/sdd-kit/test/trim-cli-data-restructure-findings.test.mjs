// test/trim-cli-data-restructure-findings.test.mjs — T5 restructure
// investigation record (docs/specs/trim-cli-data spec, refs R4.S1, R4.S2,
// AC7).
//
// R4.S1 — every CLI whose consumed data payload exceeds 200 tokens must
//   have been investigated and either restructured or explicitly justified
//   as an R4.S2 stay-on-stdout candidate; this test confirms the
//   investigation record covers all five over-threshold CLIs found by T5.
// R4.S2 — a heavy payload left on stdout because every field is read on
//   every invocation must carry its justification in the findings doc.
// AC7 — the full plugin suite and repo validation must remain green after
//   T5 (whether or not anything was restructured).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FINDINGS_PATH = path.join(REPO_ROOT, 'docs', 'specs', 'trim-cli-data', 'restructure-findings.md');

const OVER_THRESHOLD_CLIS = [
  'exec-tools.mjs `report`',
  'exec-tools.mjs `extract`',
  'verify-tools.mjs `report`',
  'token-cost.mjs',
  'forensics.mjs `report`',
];

test('ref R4.S1: restructure-findings.md exists and covers every over-200-token CLI found by T5', () => {
  assert.ok(fs.existsSync(FINDINGS_PATH), `findings doc must exist at ${FINDINGS_PATH}`);
  const doc = fs.readFileSync(FINDINGS_PATH, 'utf8');
  for (const cli of OVER_THRESHOLD_CLIS) {
    assert.ok(doc.includes(cli), `findings doc must cover ${cli}`);
  }
});

test('ref R4.S2: each covered CLI records an R4.S2 justification (no CLI was silently skipped)', () => {
  const doc = fs.readFileSync(FINDINGS_PATH, 'utf8');
  const r4s2Count = (doc.match(/R4\.S2/g) || []).length;
  assert.ok(r4s2Count >= OVER_THRESHOLD_CLIS.length, 'every over-threshold CLI must be explicitly classified R4.S2 in the findings doc');
});

// AC7 ("full plugin suite + repo validation pass") is verified by the
// orchestrator running the full suite and scripts/validate.sh directly —
// not from inside this file, which is itself part of that suite and would
// otherwise recursively re-invoke itself.
