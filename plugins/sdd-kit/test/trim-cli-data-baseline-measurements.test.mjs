// test/trim-cli-data-baseline-measurements.test.mjs — T2 baseline token
// measurements (docs/specs/trim-cli-data spec, refs R2.S1, R2.S2, AC3, AC4).
//
// R2.S1 — "GIVEN a representative invocation of each CLI, WHEN its
//   serialized `data` is measured with
//   plugins/sdd-kit/scripts/tokenizer.mjs, THEN
//   docs/specs/trim-cli-data/measurements.md records a baseline token figure
//   per payload".
// R2.S2 — "GIVEN a CLI whose subcommands emit distinct `data` shapes (e.g.
//   exec-tools.mjs), WHEN measured, THEN each distinct payload shape gets
//   its own baseline figure".
// AC3 — measurements.md lists a baseline token figure for every CLI payload.
// AC4 — multi-shape CLIs have one baseline figure per distinct payload
//   shape.
//
// This test only asserts the evidence recorded in measurements.md — it does
// not re-invoke the CLIs itself (that would re-measure live, non-frozen
// state; the baseline is a point-in-time snapshot, reproduced by re-running
// the recorded commands by hand, not by this automated guard).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEASUREMENTS_PATH = path.resolve(__dirname, '..', '..', '..', 'docs', 'specs', 'trim-cli-data', 'measurements.md');

// The nine CLIs under audit per docs/specs/trim-cli-data/spec.md's Scope
// section.
const NINE_CLIS = [
  'budget-guard.mjs',
  'exec-tools.mjs',
  'forensics-analysis-validate.mjs',
  'forensics.mjs',
  'plan-tools.mjs',
  'token-cost.mjs',
  'tokenizer.mjs',
  'verify-tools.mjs',
  'versioning-report.mjs',
];

// Parses the "| CLI | Payload shape | Baseline tokens | Command |"-style
// markdown table rows out of measurements.md. Returns an array of
// { cli, shape, tokens, command } objects, one per data row (header/divider
// rows are skipped).
function parseRows(markdown) {
  const rows = [];
  const lines = markdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const [cli, shape, tokens, command] = cells;
    if (cli === 'CLI' || /^-+$/.test(cli.replace(/[: ]/g, '')) || cli === '') continue;
    rows.push({ cli, shape, tokens, command });
  }
  return rows;
}

test('ref R2.S1/AC3: docs/specs/trim-cli-data/measurements.md exists', () => {
  assert.ok(
    fs.existsSync(MEASUREMENTS_PATH),
    `measurements.md must exist at ${MEASUREMENTS_PATH}`,
  );
});

test('ref R2.S1/AC3: measurements.md records a baseline token figure for every one of the nine CLIs', () => {
  const markdown = fs.readFileSync(MEASUREMENTS_PATH, 'utf8');
  const rows = parseRows(markdown);

  for (const cli of NINE_CLIS) {
    const cliRows = rows.filter((r) => r.cli === cli);
    assert.ok(cliRows.length > 0, `measurements.md must have at least one row for ${cli}`);
    for (const row of cliRows) {
      assert.match(
        row.tokens,
        /^\d+$/,
        `${cli} (shape "${row.shape}") must record a numeric baseline token figure, got "${row.tokens}"`,
      );
    }
  }
});

test('ref R2.S2/AC4: exec-tools.mjs (multi-shape CLI) has one baseline figure per distinct payload shape', () => {
  const markdown = fs.readFileSync(MEASUREMENTS_PATH, 'utf8');
  const rows = parseRows(markdown).filter((r) => r.cli === 'exec-tools.mjs');

  assert.ok(
    rows.length >= 2,
    `exec-tools.mjs emits distinct data shapes across subcommands, so measurements.md must record at least 2 rows for it, got ${rows.length}`,
  );

  const shapes = rows.map((r) => r.shape);
  const uniqueShapes = new Set(shapes);
  assert.equal(
    uniqueShapes.size,
    shapes.length,
    'each exec-tools.mjs row must name a distinct payload shape (no duplicate shape labels)',
  );
});

test('ref R2.S1: every payload row records the exact reproducible command used', () => {
  const markdown = fs.readFileSync(MEASUREMENTS_PATH, 'utf8');
  const rows = parseRows(markdown);

  assert.ok(rows.length >= NINE_CLIS.length, 'expected at least one row per CLI');

  for (const row of rows) {
    assert.ok(
      row.command && row.command.length > 0,
      `row for ${row.cli} (shape "${row.shape}") must record a command`,
    );
    // A reproducible invocation of one of these scripts always shells out to
    // node against a path under plugins/sdd-kit/scripts/ (the CLIs live
    // there) OR, for tokenizer.mjs's documented N/A shape, still names the
    // exact command that was run to observe its behavior.
    assert.match(
      row.command,
      /node .*plugins\/sdd-kit\/scripts\//,
      `row for ${row.cli} (shape "${row.shape}") must record a concrete "node plugins/sdd-kit/scripts/..." command, got "${row.command}"`,
    );
  }
});
