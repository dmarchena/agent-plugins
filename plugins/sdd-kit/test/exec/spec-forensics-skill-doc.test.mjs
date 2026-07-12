// Content-assertion test for the R2 "judgment layer" documentation added to
// plugins/sdd-kit/skills/spec-forensics/SKILL.md (docs/specs/forensics-analysis).
// One test per extracted spec ref (R2.S1, R2.S2, AC3, AC4) — each asserts the
// specific invariant that ref's text requires the skill doc to describe. This
// is documentation, so assertions check "does the doc explain X" via
// substring/regex, not brittle literal-phrase matching.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.join(__dirname, '..', '..', 'skills', 'spec-forensics', 'SKILL.md');

const content = fs.readFileSync(SKILL_PATH, 'utf8');

test('R2.S1 — happy path: doc describes forensics-analysis.md written automatically with a deterministic cost-reconstruction section and judgment sections (opportunities/bad practices) clearly separated from it', () => {
  // "existe SPECDIR/forensics-analysis.md" + "corre la capa de juicio" (i.e.
  // runs automatically, not on request)
  assert.match(content, /forensics-analysis\.md/);
  assert.match(content, /automat/i, 'should document the write happens automatically every run');
  // "reconstrucción de coste determinista" ... "secciones de juicio
  // (oportunidades y malas prácticas) claramente separadas de ella"
  assert.match(content, /deterministic/i, 'should name the deterministic cost-reconstruction section');
  assert.match(content, /judgment/i, 'should name the judgment section(s)');
  assert.match(content, /separat/i, 'should state the judgment sections are separated from the deterministic one');
  assert.match(content, /opportunit/i, 'should mention opportunities as a judgment finding type');
  assert.match(content, /bad practice/i, 'should mention bad practices as a judgment finding type');
});

test('R2.S2 — edge: doc describes the degraded case where forensics.json has unresolved/incomplete tasks: forensics-analysis.md is still written, with unresolved tasks marked without fabricated figures', () => {
  // "forensics.json con tareas resolved:false o marcado incomplete" ...
  // "forensics-analysis.md se escribe igualmente"
  assert.match(content, /resolved:\s*false|unresolved/i, 'should mention unresolved tasks as a degraded input');
  assert.match(content, /incomplete/i, 'should mention the incomplete/degraded case');
  assert.match(content, /written|escrib|written every run|still writ/i, 'should state the doc is still written in the degraded case');
  // "sin inventar sus cifras" / "sin fabricar números"
  assert.match(content, /fabricat|invent/i, 'should prohibit fabricating figures for unresolved tasks');
});

test('AC3 — doc explains that anchor figures (total USD, orchestrator share) in the deterministic section must numerically coincide with forensics.json, and every judgment finding cites a signal name present in forensics.json', () => {
  assert.match(content, /total usd/i, 'should name the "Total USD" anchor figure');
  assert.match(content, /orchestrator share/i, 'should name the "Orchestrator share" anchor figure');
  // signal-anchoring rule: every judgment finding must cite a named signal
  // from forensics.json's signals block
  assert.match(content, /signal/i, 'should reference "signal" as the anchoring unit');
  assert.match(content, /anchor|cite|referenc/i, 'should state that judgment findings must cite/reference a signal');
});

test('AC4 — doc describes that the join-incomplete state must be declared explicitly (not just implied) and covers invoking forensics-analysis-validate.mjs\'s validateForensicsAnalysis(mdText, forensicsJson) to confirm the written doc satisfies these invariants', () => {
  // "declara explícitamente que el join fue incompleto"
  assert.match(content, /join.{0,20}incomplete|incomplete.{0,20}join/i, 'should require an explicit "join incomplete" statement');
  // validator invocation with its exact exported signature
  assert.match(content, /forensics-analysis-validate\.mjs/, 'should reference the validator script by filename');
  assert.match(content, /validateForensicsAnalysis/, 'should reference the exported validateForensicsAnalysis function');
});
