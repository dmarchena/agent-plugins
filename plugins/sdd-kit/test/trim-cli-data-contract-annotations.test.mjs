// test/trim-cli-data-contract-annotations.test.mjs — T6 contract doc
// annotations (docs/specs/trim-cli-data spec, refs R3.S2, R4.S2, AC6, AC8).
//
// R3.S2 — "GIVEN a CLI with no `unused` fields and a consumed payload at or
//   under the threshold, WHEN the trim pass evaluates it, THEN its script
//   and payload are unchanged and its contract section records `no
//   change`".
// R4.S2 — "GIVEN a heavy payload whose every field is read by its consumer
//   on every invocation, WHEN evaluated for restructure, THEN it stays on
//   stdout and its contract section records the justification".
// AC6 — CLIs with nothing to trim show no script diff and a `no change`
//   contract entry.
// AC8 — heavy-but-fully-consumed payloads have a recorded justification in
//   the contract doc instead of a detail file.
//
// R3.S2 candidates below are the two contract-doc subsections found (by
// re-reading every CLI/subcommand field table) to have zero `unused` rows
// AND a baseline at or under the 200-token threshold: `exec-tools.mjs`'s
// "complete subcommand (--batch)" and `plan-tools.mjs`'s "inspect-spec
// subcommand". Two other zero-`unused` sections (`token-cost.mjs` and
// `verify-tools.mjs`'s "report subcommand") are deliberately excluded here
// because their baseline is over threshold (441 / 726-728 tokens) — those
// are R4.S2 candidates instead, per restructure-findings.md.
//
// R4.S2 candidates are cross-checked against
// trim-cli-data-restructure-findings.test.mjs's own OVER_THRESHOLD_CLIS list
// so both tests stay in sync with restructure-findings.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CONTRACT_PATH = path.join(REPO_ROOT, 'plugins', 'sdd-kit', 'docs', 'cli-data-contract.md');
const FINDINGS_PATH = path.join(REPO_ROOT, 'docs', 'specs', 'trim-cli-data', 'restructure-findings.md');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extracts the text of one "#"-repeated-`level` heading's section (up to,
// but not including, the next heading at the same or a shallower level)
// from a markdown string.
function extractSection(markdown, level, heading) {
  const hashes = '#'.repeat(level);
  const re = new RegExp(`^${hashes}\\s+${escapeRegExp(heading)}\\s*$`, 'm');
  const match = re.exec(markdown);
  if (!match) return null;
  const rest = markdown.slice(match.index + match[0].length);
  const nextHeadingIdx = rest.search(new RegExp(`^#{1,${level}}\\s+`, 'm'));
  return nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
}

// Extracts a "### <subHeading>" subsection nested within a "## <cliHeading>"
// section (disambiguates identical subcommand names reused across CLIs,
// e.g. both exec-tools.mjs and verify-tools.mjs have a "report subcommand").
function extractSubsection(markdown, cliHeading, subHeading) {
  const cliSection = extractSection(markdown, 2, cliHeading);
  if (!cliSection) return null;
  return extractSection(cliSection, 3, subHeading);
}

// Parses "| field | consumer |"-style two-column table rows out of a
// section of markdown (skips header/divider rows), ignoring prose lines —
// so a "no change" annotation's own prose (which may legitimately mention
// the word "unused" while explaining nothing needed trimming) doesn't get
// mistaken for a field row.
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

const R3S2_CANDIDATES = [
  { cli: 'exec-tools.mjs', sub: 'complete subcommand (--batch)' },
  { cli: 'plan-tools.mjs', sub: 'inspect-spec subcommand' },
];

for (const { cli, sub } of R3S2_CANDIDATES) {
  test(`ref R3.S2/AC6: ${cli} "${sub}" has zero unused fields and is marked "no change"`, () => {
    const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');
    const section = extractSubsection(contract, cli, sub);
    assert.ok(section, `contract doc must have a "### ${sub}" subsection under "## ${cli}"`);
    const rows = extractRows(section);
    assert.ok(rows.length > 0, `"${sub}" must have at least one field row to check`);
    assert.ok(
      rows.every((r) => r.consumer !== 'unused'),
      `sanity: "${sub}" must have zero unused field rows (else it is not an R3.S2 "clean" candidate); got rows: ${JSON.stringify(rows)}`,
    );
    assert.match(
      section,
      /no change/i,
      `"${sub}" has nothing to trim — its contract section must record "no change" (R3.S2/AC6)`,
    );
  });
}

const R4S2_SECTIONS = [
  { label: 'token-cost.mjs', extract: (md) => extractSection(md, 2, 'token-cost.mjs') },
  { label: 'forensics.mjs `report` (default)', extract: (md) => extractSection(md, 2, 'forensics.mjs') },
  {
    label: 'exec-tools.mjs `report`',
    extract: (md) => extractSubsection(md, 'exec-tools.mjs', 'report subcommand'),
  },
  {
    label: 'exec-tools.mjs `extract`',
    extract: (md) => extractSubsection(md, 'exec-tools.mjs', 'extract subcommand'),
  },
  {
    label: 'verify-tools.mjs `report`',
    extract: (md) => extractSubsection(md, 'verify-tools.mjs', 'report subcommand'),
  },
];

// Sanity: keep this file's R4.S2 roster in lockstep with
// trim-cli-data-restructure-findings.test.mjs's OVER_THRESHOLD_CLIS (both
// derive from restructure-findings.md's same five findings).
test('ref R4.S2: restructure-findings.md still names all five R4.S2 CLIs this test expects', () => {
  const findings = fs.readFileSync(FINDINGS_PATH, 'utf8');
  const expectedMentions = [
    'exec-tools.mjs `report`',
    'exec-tools.mjs `extract`',
    'verify-tools.mjs `report`',
    'token-cost.mjs',
    'forensics.mjs `report`',
  ];
  for (const mention of expectedMentions) {
    assert.ok(findings.includes(mention), `restructure-findings.md must still cover ${mention}`);
  }
});

for (const { label, extract } of R4S2_SECTIONS) {
  test(`ref R4.S2/AC8: ${label}'s contract section records a justification (not "unused", not a bare file path)`, () => {
    const contract = fs.readFileSync(CONTRACT_PATH, 'utf8');
    const section = extract(contract);
    assert.ok(section, `contract doc must have a section covering ${label}`);
    assert.match(
      section,
      /R4\.S2/,
      `${label} is a fully-consumed heavy payload staying on stdout — its section must record an "R4.S2" justification`,
    );
    // The justification must be a real sentence, not a lone detail-file
    // path (AC8 says "instead of a detail file") and not the bare `unused`
    // marker.
    const justificationLine = section
      .split('\n')
      .find((line) => /R4\.S2/.test(line));
    assert.ok(justificationLine, `expected a line mentioning R4.S2 in ${label}'s section`);
    assert.ok(
      !/^\s*\|.*\|\s*$/.test(justificationLine),
      `${label}'s R4.S2 line must be prose, not a table row`,
    );
    assert.ok(
      justificationLine.replace(/R4\.S2/, '').trim().length > 20,
      `${label}'s R4.S2 annotation must carry an actual one-sentence justification, not just the tag (got: ${JSON.stringify(justificationLine)})`,
    );
  });
}
