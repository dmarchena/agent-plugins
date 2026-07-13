// Scaffolding check for T1_field_inventory (agent_type: researcher, no
// test_contract, no files written by the Explore subagent per the spec's
// R1.S1/R1.S2 audit). The orchestrator persists the subagent's returned
// text as field-inventory.md and runs this script for real red -> green
// evidence, since exec-tools.mjs's TDD/--files gate applies to every
// agent_type except "verifier". This is scaffolding for closing the task
// honestly, not itself a spec deliverable (the real contract doc is
// plugins/sdd-kit/docs/cli-data-contract.md, written by T3).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = path.join(HERE, 'field-inventory.md');

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

const FIELD_ROW_RE = /^`[^`]+ -> (.+)`$/;

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exitCode = 1;
}

if (!existsSync(INVENTORY_PATH)) {
  fail('docs/specs/trim-cli-data/field-inventory.md does not exist (R1.S1)');
  process.exit(1);
}

const text = readFileSync(INVENTORY_PATH, 'utf8');

for (const cli of NINE_CLIS) {
  if (!text.includes(cli)) {
    fail(`field-inventory.md has no section covering ${cli} (R1.S1)`);
  }
}

let fieldRowCount = 0;
for (const line of text.split('\n')) {
  const m = line.match(FIELD_ROW_RE);
  if (!m) continue;
  fieldRowCount++;
  const target = m[1].trim();
  const isUnused = target === 'unused';
  const looksLikePath = /[./]/.test(target);
  if (!isUnused && !looksLikePath) {
    fail(`field row does not name a consumer path or 'unused': "${line}" (R1.S1/R1.S2)`);
  }
}

if (fieldRowCount < 9) {
  fail(`only ${fieldRowCount} field rows found — expected at least one per CLI (R1.S1)`);
}

if (process.exitCode === 1) {
  process.exit(1);
}

console.log(`PASS: ${fieldRowCount} field rows across ${NINE_CLIS.length} CLIs, each naming a consumer path or 'unused' (R1.S1, R1.S2)`);
