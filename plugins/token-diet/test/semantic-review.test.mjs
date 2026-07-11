import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');
const REPO_ROOT = join(PLUGIN_ROOT, '..', '..');
const REPORT_PATH = join(REPO_ROOT, 'docs', 'specs', 'token-diet', 'semantic-review.md');
const INSTALL_PATH = join(PLUGIN_ROOT, 'commands', 'install.md');

function readReport() {
  assert.ok(
    existsSync(REPORT_PATH),
    `AC9 semantic-review report must exist at ${REPORT_PATH}`
  );
  return readFileSync(REPORT_PATH, 'utf8');
}

// The three AC9 case types: heading matcher + the recommendation each must record.
const CASES = [
  { label: 'foreign/conflicting policy', head: /foreign|conflicting|ajena|conflicto/i, rec: 'replace' },
  { label: 'own but incomplete policy', head: /incomplete|incompleta|own but|propia/i, rec: 'extend' },
  { label: 'no token-saving policy', head: /no (token-saving )?policy|sin pol[ií]tica/i, rec: 'add' },
];

function caseBlocks(report) {
  // Split on level-3 "### Case" headings so each block owns one case.
  return report.split(/^###\s+/m).slice(1);
}

test('AC9 / R2 — report records all three case types, each with its expected recommendation and a "correct" verdict', () => {
  const report = readReport();
  const blocks = caseBlocks(report);
  for (const c of CASES) {
    const block = blocks.find((b) => c.head.test(b));
    assert.ok(block, `expected a "### Case" block for the ${c.label} case`);
    assert.ok(
      new RegExp('`' + c.rec + '`').test(block) || new RegExp('\\b' + c.rec + '\\b').test(block),
      `expected the ${c.label} block to record expected recommendation \`${c.rec}\``
    );
    assert.ok(
      /\bcorrect\b/i.test(block),
      `expected the ${c.label} block to record a "correct" verdict`
    );
  }
});

test('AC9 / R2 — report states an overall AC9 verdict', () => {
  const report = readReport();
  assert.ok(
    /overall[^\n]*AC9|AC9[^\n]*verdict/i.test(report),
    'expected an explicit overall AC9 verdict statement'
  );
  assert.ok(/\bcorrect\b/i.test(report), 'expected the overall AC9 verdict to be recorded');
});

test('AC9 / R2 — install.md documents the add/replace/extend semantic mapping under review', () => {
  assert.ok(existsSync(INSTALL_PATH), `install.md must exist at ${INSTALL_PATH}`);
  const content = readFileSync(INSTALL_PATH, 'utf8');
  const lower = content.toLowerCase();
  assert.ok(lower.includes('sin política') && /`add`/.test(content), 'install.md: no policy -> add');
  assert.ok(
    (lower.includes('ajena') || lower.includes('conflicto')) && /`replace`/.test(content),
    'install.md: foreign/conflicting policy -> replace'
  );
  assert.ok(lower.includes('incompleta') && /`extend`/.test(content), 'install.md: own but incomplete -> extend');
});
