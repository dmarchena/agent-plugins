// test/trim-cli-data-contract-doc.test.mjs — T3 living field-to-consumer
// contract doc (docs/specs/trim-cli-data spec, refs R1.S1, R1.S2, R2.S1, AC1,
// AC2).
//
// R1.S1 — "GIVEN the nine CLI scripts under `plugins/sdd-kit/scripts/`, WHEN
//   the audit is complete, THEN `plugins/sdd-kit/docs/cli-data-contract.md`
//   exists with one section per CLI, and every field emitted in that CLI's
//   `data` payload appears as a row naming its consumer file path(s) or the
//   literal marker `unused`".
// R1.S2 — "GIVEN a `data` field referenced only by the test suite and no
//   skill, command, or script, WHEN the field is classified, THEN its
//   contract row reads `unused`".
// R2.S1 — "GIVEN a representative invocation of each CLI, WHEN its
//   serialized `data` is measured with
//   plugins/sdd-kit/scripts/tokenizer.mjs, THEN
//   docs/specs/trim-cli-data/measurements.md records a baseline token figure
//   per payload, and the contract doc carries the weight per CLI".
// AC1 — plugins/sdd-kit/docs/cli-data-contract.md has a section per CLI with
//   every field's consumer or `unused`.
// AC2 — fields referenced only by tests carry the `unused` marker.
//
// This test cross-checks the contract doc against the two upstream
// intermediate artifacts (field-inventory.md, measurements.md) rather than
// hardcoding a duplicate copy of the field list, so it stays correct if
// those artifacts are ever regenerated.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'plugins', 'sdd-kit', 'docs', 'cli-data-contract.md');
const INVENTORY_PATH = path.join(REPO_ROOT, 'docs', 'specs', 'trim-cli-data', 'field-inventory.md');
const MEASUREMENTS_PATH = path.join(REPO_ROOT, 'docs', 'specs', 'trim-cli-data', 'measurements.md');

// The nine CLIs under audit per docs/specs/trim-cli-data/spec.md's Scope
// section (same list used by trim-cli-data-baseline-measurements.test.mjs).
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

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parses field-inventory.md's `` `field -> consumer` `` lines, grouping them
// by the base CLI filename taken from the nearest preceding "## " heading
// (subcommand qualifiers like "(init subcommand)" are stripped, and nested
// "Within `tasks` subdocument:" fields stay attached to the enclosing CLI's
// heading, matching how field-inventory.md itself is structured).
function parseInventory(markdown) {
  const headingRe = /^##\s+(\S+\.mjs)\b/;
  const fieldLineRe = /^`([A-Za-z0-9_]+)\s*->\s*(.+)`$/;
  const entries = [];
  let currentCli = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const h = line.match(headingRe);
    if (h) {
      currentCli = h[1];
      continue;
    }
    const f = line.match(fieldLineRe);
    if (f && currentCli) {
      entries.push({ cli: currentCli, field: f[1], consumer: f[2].trim() });
    }
  }
  return entries;
}

// Extracts the text of one top-level "## <cliName>" section (up to, but not
// including, the next top-level "## " heading) from the contract doc.
function extractCliSection(markdown, cliName) {
  const re = new RegExp(`^##\\s+${escapeRegExp(cliName)}\\s*$`, 'm');
  const match = re.exec(markdown);
  if (!match) return null;
  const rest = markdown.slice(match.index + match[0].length);
  const nextHeadingIdx = rest.search(/^##\s+/m);
  return nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
}

// Parses "| field | consumer |"-style two-column table rows out of a section
// of markdown (skips header/divider rows).
function extractRows(sectionText) {
  const rows = [];
  for (const raw of sectionText.split('\n')) {
    const line = raw.trim();
    const m = line.match(/^\|(.+)\|$/);
    if (!m) continue;
    const cells = m[1].split('|').map((c) => c.trim());
    if (cells.length !== 2) continue;
    const [field, consumer] = cells;
    if (field === '' || field === 'Field' || /^:?-+:?$/.test(field)) continue;
    rows.push({ field, consumer });
  }
  return rows;
}

// Parses measurements.md's "| CLI | Payload shape | Baseline tokens |
// Command |" table rows (same shape as
// trim-cli-data-baseline-measurements.test.mjs's own parser).
function parseMeasurementRows(markdown) {
  const rows = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    const [cli, shape, tokens, command] = cells;
    if (cli === 'CLI' || /^-+$/.test(cli.replace(/[: ]/g, '')) || cli === '') continue;
    rows.push({ cli, shape, tokens, command });
  }
  return rows;
}

test('ref R1.S1/AC1: plugins/sdd-kit/docs/cli-data-contract.md exists', () => {
  assert.ok(fs.existsSync(CONTRACT_PATH), `contract doc must exist at ${CONTRACT_PATH}`);
});

test('ref R1.S1/AC1: contract doc has a section for each of the nine CLIs', () => {
  const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');
  for (const cli of NINE_CLIS) {
    const section = extractCliSection(contract, cli);
    assert.ok(section !== null, `contract doc must have a "## ${cli}" section`);
  }
});

test('ref R1.S1/AC1: spot-checked fields across several CLIs name their consumer path or the "unused" marker', () => {
  const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');

  // One representative field per several distinct CLIs/shapes, taken
  // verbatim from field-inventory.md, covering both consumer-path and
  // unused classifications. Not exhaustive by design (see task brief) — the
  // exhaustive check for "unused" specifically lives in the R1.S2 test
  // below.
  const SAMPLES = [
    { cli: 'budget-guard.mjs', field: 'results', consumer: 'plugins/sdd-kit/skills/plan-executor/SKILL.md' },
    { cli: 'budget-guard.mjs', field: 'withinBudget', consumer: 'unused' },
    { cli: 'exec-tools.mjs', field: 'branch', consumer: 'plugins/sdd-kit/skills/plan-executor/SKILL.md' },
    { cli: 'exec-tools.mjs', field: 'ids', consumer: 'unused' },
    { cli: 'forensics.mjs', field: 'tasks', consumer: 'plugins/sdd-kit/skills/spec-forensics/SKILL.md' },
    { cli: 'forensics.mjs', field: 'resolved', consumer: 'unused' },
    { cli: 'plan-tools.mjs', field: 'requirements', consumer: 'plugins/sdd-kit/skills/plan-writer/SKILL.md' },
    { cli: 'plan-tools.mjs', field: 'message', consumer: 'unused' },
    { cli: 'token-cost.mjs', field: 'session', consumer: 'plugins/sdd-kit/skills/spec-forensics/SKILL.md' },
    { cli: 'verify-tools.mjs', field: 'green', consumer: 'unused' },
    { cli: 'forensics-analysis-validate.mjs', field: 'ok', consumer: 'plugins/sdd-kit/skills/spec-forensics/SKILL.md' },
    { cli: 'versioning-report.mjs', field: 'warnings', consumer: 'unused' },
  ];

  for (const { cli, field, consumer } of SAMPLES) {
    const section = extractCliSection(contract, cli);
    assert.ok(section, `contract doc must have a "## ${cli}" section`);
    const rows = extractRows(section);
    const row = rows.find((r) => r.field === field && r.consumer === consumer);
    assert.ok(
      row,
      `${cli} section must have a row "${field} -> ${consumer}" (got rows: ${JSON.stringify(rows.filter((r) => r.field === field))})`,
    );
  }
});

test('ref R1.S2/AC2: every field field-inventory.md marks unused is marked unused in the contract doc too', () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, 'utf8');
  const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const entries = parseInventory(inventory);
  const unusedEntries = entries.filter((e) => e.consumer === 'unused');

  assert.ok(unusedEntries.length > 0, 'sanity check: field-inventory.md must have at least one unused field');

  const sectionCache = new Map();
  for (const { cli, field } of unusedEntries) {
    if (!sectionCache.has(cli)) {
      sectionCache.set(cli, extractCliSection(contract, cli));
    }
    const section = sectionCache.get(cli);
    assert.ok(section, `contract doc must have a "## ${cli}" section to check its unused field "${field}"`);
    const rows = extractRows(section);
    const hasUnusedRow = rows.some((r) => r.field === field && r.consumer === 'unused');
    assert.ok(
      hasUnusedRow,
      `${cli}'s "${field}" field is classified unused in field-inventory.md but has no matching "unused" row in the contract doc`,
    );
  }
});

test('ref R2.S1: each CLI section in the contract doc carries the baseline token weight from measurements.md', () => {
  const measurements = fs.readFileSync(MEASUREMENTS_PATH, 'utf8');
  const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');
  const rows = parseMeasurementRows(measurements);

  for (const cli of NINE_CLIS) {
    const section = extractCliSection(contract, cli);
    assert.ok(section, `contract doc must have a "## ${cli}" section`);
    const cliRows = rows.filter((r) => r.cli === cli);
    assert.ok(cliRows.length > 0, `measurements.md must have at least one baseline row for ${cli}`);

    for (const row of cliRows) {
      if (row.tokens === '0' && /N\/A/i.test(row.shape)) {
        // tokenizer.mjs: no stdout envelope, so there is no numeric baseline
        // to reproduce verbatim — the section must instead note it has no
        // CLI data payload.
        assert.match(
          section,
          /N\/A|no stdout envelope|library module/i,
          `${cli} section should note it has no CLI data payload (measurements.md records shape "${row.shape}")`,
        );
        continue;
      }
      assert.ok(
        section.includes(row.tokens),
        `${cli} section must mention its baseline token figure (${row.tokens}) from measurements.md (shape "${row.shape}")`,
      );
    }
  }
});
