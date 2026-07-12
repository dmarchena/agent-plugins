// Content-assertion test for the R1 "delegate composition to a Sonnet
// subagent, with inline fallback" documentation added to
// plugins/sdd-kit/skills/spec-forensics/SKILL.md
// (docs/specs/spec-forensics-report-delegation). One test per extracted
// spec ref (R1.S1/AC1, R1.S2/AC2) — each asserts the specific invariant
// that ref's text requires the skill doc to describe. This is
// documentation, so assertions check "does the doc explain X" via
// substring/regex, not brittle literal-phrase matching.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.join(__dirname, '..', '..', 'skills', 'spec-forensics', 'SKILL.md');

const content = fs.readFileSync(SKILL_PATH, 'utf8');

test('R1.S1 (satisfies AC1) — happy path: doc instructs dispatching a subagent with model: sonnet, briefed with the three artifact paths, the full document contract, and the compose-validate-correct loop, returning only ok/path rather than the document body', () => {
  // dispatching a subagent running model: sonnet
  assert.match(content, /model:\s*sonnet/i, 'should instruct dispatching a subagent with model: sonnet');
  assert.match(content, /subagent/i, 'should name the delegation unit as a subagent');
  // briefed with the three artifact paths
  assert.match(content, /spec\.md/, 'should name spec.md as one of the briefed artifact paths');
  assert.match(content, /execution_plan\.json/, 'should name execution_plan.json as one of the briefed artifact paths');
  assert.match(content, /forensics\.json/, 'should name forensics.json as one of the briefed artifact paths');
  // the full document contract (deterministic/judgment separation, anchor
  // figures, signal-anchoring rule, degraded-case handling) is already
  // covered by SKILL.md's existing "Judgment layer" section — assert the
  // delegation text ties back to that contract explicitly.
  assert.match(content, /document contract/i, 'should reference the document contract the subagent must follow');
  // the compose -> validate -> correct loop
  assert.match(content, /forensics-analysis-validate\.mjs/, 'should reference invoking the validator as part of the loop');
  assert.match(content, /re-?validat/i, 'should instruct re-validating after a fix, closing the compose-validate-correct loop');
  // the subagent returns only ok/path, not the document body
  assert.match(content, /returns?\s+only/i, 'should state the subagent returns only a minimal result');
  assert.match(content, /\bok\b/i, 'should mention the ok field as part of what the subagent returns');
  assert.match(content, /path/i, 'should mention the path as part of what the subagent returns');
  assert.doesNotMatch(
    content.match(/returns?\s+only[^.]*\./i)?.[0] ?? '',
    /document body|full (document|text|content)/i,
    'the "returns only" sentence should exclude the document body, not include it'
  );
});

test('R1.S2 (satisfies AC2) — edge: doc documents an inline-composition fallback for a small run, framed as the invoking agent\'s judgment with no fixed numeric threshold, under the same document contract and validate/correct loop as the delegated path', () => {
  // inline-composition fallback for a small run
  assert.match(content, /inline/i, 'should document an inline-composition fallback');
  assert.match(content, /small/i, 'should frame the fallback as for a small run');
  assert.match(content, /fallback/i, 'should name it explicitly as a fallback to delegation');
  // framed as the invoking agent's judgment, no fixed numeric threshold
  assert.match(content, /judgment/i, 'should frame the small-run determination as a judgment call');
  assert.match(content, /no\s+fixed\s+(numeric\s+)?threshold|without\s+a\s+(fixed\s+)?(numeric\s+)?threshold/i, 'should state there is no fixed numeric threshold for "small"');
  // same document contract and compose->validate->correct loop as the
  // delegated path
  assert.match(content, /same\s+document\s+contract|identical\s+document\s+contract/i, 'should state the inline path follows the same document contract as delegation');
  assert.match(content, /forensics-analysis-validate\.mjs/, 'should require the validate/correct loop for the inline path too');
});
