// test/verify-skill-cli.test.mjs — T3-verify-skill-cli: mechanical proxy
// checks over skills/verify/SKILL.md's own instructional prose (R1, AC6).
//
// AC6 → R1 [manual] — the `verify` SKILL.md drives every deterministic
// verify step with a `node …/verify-tools.mjs <sub>` one-liner and instructs
// no module import or driver-script authoring; manual because it is a
// judgment over the skill's guidance prose, not a single mechanical string
// assertion. This file cannot substitute for that human judgment call, but
// it DOES assert the mechanical properties R1/AC6 describe: one-liner
// examples for each deterministic subcommand, no import-for-driving prose,
// no standalone-driver-script instruction, and documentation of the
// `--verdicts` mechanism (R1.S3).
//
// This test reads SKILL.md as plain text — it does not execute it (skills
// aren't executable) and does not judge prose quality; it only checks for
// the presence/absence of specific textual patterns.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.resolve(__dirname, '..', 'skills', 'verify', 'SKILL.md');

const skillText = fs.readFileSync(SKILL_PATH, 'utf8');

test('R1/AC6: SKILL.md gives a one-liner example for the ground-check subcommand', () => {
  assert.match(
    skillText,
    /node\s+.*verify-tools\.mjs\s+ground-check\s+SPECDIR/,
    'expected a `node …/verify-tools.mjs ground-check SPECDIR` one-liner example'
  );
});

test('R1/AC6: SKILL.md gives a one-liner example for the report subcommand', () => {
  assert.match(
    skillText,
    /node\s+.*verify-tools\.mjs\s+report\s+SPECDIR/,
    'expected a `node …/verify-tools.mjs report SPECDIR` one-liner example'
  );
});

test('R1/AC6: SKILL.md gives a one-liner example for the archive subcommand', () => {
  assert.match(
    skillText,
    /node\s+.*verify-tools\.mjs\s+archive\s+SPECDIR/,
    'expected a `node …/verify-tools.mjs archive SPECDIR` one-liner example'
  );
});

test('R1/AC6: SKILL.md does not instruct importing verify-tools.mjs exports to drive the workflow', () => {
  // Stale prose from before the CLI existed told the orchestrator to import
  // and call the library's exported functions directly (loadSpecdir,
  // groundCheck, assembleReport, archiveIfGreen, manualConfirmation(...).confirm()).
  // It's fine for the doc to NAME these functions as what the CLI wraps
  // internally, but it must not instruct `import { ... } from '.../verify-tools.mjs'`
  // for the purpose of driving the workflow from the orchestrating agent.
  assert.doesNotMatch(
    skillText,
    /import\s*\{[^}]*\}\s*from\s*['"`][^'"`]*verify-tools\.mjs['"`]/,
    'SKILL.md must not instruct importing verify-tools.mjs exports directly'
  );
});

test('R1/AC6: SKILL.md does not instruct authoring a standalone driver script', () => {
  // The doc is allowed to mention "driver script" while explicitly
  // PROHIBITING one (e.g. "do NOT author a throwaway driver script"). What
  // it must never do is instruct authoring one affirmatively. So every
  // occurrence of the phrase must have a negation word within the preceding
  // ~40 characters.
  const NEGATION_RE = /\b(do not|don't|must not|never|no)\b/i;
  const matches = [...skillText.matchAll(/driver script/gi)];
  assert.ok(matches.length > 0, 'expected SKILL.md to at least discuss driver scripts (to prohibit them)');
  for (const m of matches) {
    const start = Math.max(0, m.index - 40);
    const preceding = skillText.slice(start, m.index);
    assert.match(
      preceding,
      NEGATION_RE,
      `occurrence of "driver script" at index ${m.index} is not clearly negated: "...${preceding}${m[0]}..."`
    );
  }
});

test('R1.S3/AC6: SKILL.md documents the --verdicts flag / verdicts-file mechanism for resolving manual ACs', () => {
  assert.match(
    skillText,
    /--verdicts/,
    'expected SKILL.md to document the --verdicts flag'
  );
  assert.match(
    skillText,
    /ac_id/,
    'expected SKILL.md to describe the verdicts file shape (ac_id/verdict entries)'
  );
  assert.match(
    skillText,
    /confirmed|rejected/,
    'expected SKILL.md to mention confirmed/rejected verdict values'
  );
});
