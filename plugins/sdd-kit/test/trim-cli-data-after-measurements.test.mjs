// test/trim-cli-data-after-measurements.test.mjs — T7 after-measurements
// (docs/specs/trim-cli-data spec, ref R-E2E.S1, AC-E2E).
//
// R-E2E.S1 — "GIVEN the branch with all audit, trim, and restructure work
//   applied, WHEN each payload is re-measured and the full suite runs, THEN
//   docs/specs/trim-cli-data/measurements.md shows before/after figures with
//   a total reduction > 0 ... and scripts/validate.sh exits 0".
//
// Cross-checks the recorded total against the table's own before/after
// columns (summing them itself) rather than hardcoding a duplicate total,
// so it stays correct if the table is ever re-measured.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MEASUREMENTS_PATH = path.join(REPO_ROOT, 'docs', 'specs', 'trim-cli-data', 'measurements.md');

function parseTableRows(markdown) {
  const rows = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 6) continue;
    const [cli, shape, before, command, after, delta] = cells;
    if (cli === 'CLI' || /^:?-+:?$/.test(cli)) continue;
    rows.push({ cli, shape, before, command, after, delta });
  }
  return rows;
}

test('ref R-E2E.S1: measurements.md has an After-tokens column with a numeric figure for every measured CLI (N/A only for tokenizer.mjs)', () => {
  const md = fs.readFileSync(MEASUREMENTS_PATH, 'utf8');
  assert.match(md, /After tokens/, 'table header must include an "After tokens" column');
  const rows = parseTableRows(md);
  assert.ok(rows.length >= 11, `expected at least 11 measured rows, got ${rows.length}`);
  for (const row of rows) {
    if (row.cli === 'tokenizer.mjs') {
      assert.equal(row.after, 'N/A', 'tokenizer.mjs has no data payload, its After figure must stay N/A');
      continue;
    }
    assert.ok(/^\d+$/.test(row.after), `${row.cli} (${row.shape}) After tokens must be a plain number, got "${row.after}"`);
  }
});

test('ref R-E2E.S1/AC-E2E: the recorded total reduction is positive and matches the sum of the table\'s own before/after columns', () => {
  const md = fs.readFileSync(MEASUREMENTS_PATH, 'utf8');
  const rows = parseTableRows(md).filter((r) => r.cli !== 'tokenizer.mjs');
  const beforeTotal = rows.reduce((sum, r) => sum + Number(r.before), 0);
  const afterTotal = rows.reduce((sum, r) => sum + Number(r.after), 0);
  const reduction = beforeTotal - afterTotal;

  assert.ok(reduction > 0, `total reduction must be > 0, computed ${beforeTotal} - ${afterTotal} = ${reduction}`);

  const summaryMatch = md.match(/Total reduction:\s*([\d,]+)\s*tokens/i);
  assert.ok(summaryMatch, 'measurements.md must record a "Total reduction: N tokens" summary line');
  const recordedReduction = Number(summaryMatch[1].replace(/,/g, ''));
  assert.equal(recordedReduction, reduction, 'the recorded total reduction must match the table\'s own before/after sums');
});
