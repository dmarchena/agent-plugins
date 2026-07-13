// Content-assertion test for the AC7/R3.S1 "agent id is mandatory at
// complete time" documentation added to
// plugins/sdd-kit/skills/plan-executor/SKILL.md (docs/specs/agentid-capture).
// One test per invariant the doc must now describe — this is documentation,
// so assertions check "does the doc explain X" via substring/regex, not
// brittle literal-phrase matching.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = path.join(__dirname, '..', '..', 'skills', 'plan-executor', 'SKILL.md');

const content = fs.readFileSync(SKILL_PATH, 'utf8');

test('AC7/R3.S1 — doc states single-task complete now requires an agent id and refuses without one (non-zero exit, MISSING_AGENT_ID reason)', () => {
  assert.match(content, /required/i, 'should state the agent id is required, not merely advisory');
  assert.match(content, /rejects|refuses/i, 'should state complete rejects/refuses without an agent id');
  assert.match(content, /MISSING_AGENT_ID:\s*<task_id>/, 'should name the exact error.reason prefix, including the task_id it names');
  assert.match(content, /non-zero/i, 'should state the CLI exits non-zero on this refusal');
  assert.match(content, /nothing written/i, 'should state nothing is recorded or committed on refusal');
});

test('AC7/R3.S1 — doc documents the --no-agent-id "<reason>" escape hatch and its graceful-degrade outcome', () => {
  assert.match(content, /--no-agent-id\s+"<reason>"/, 'should document the --no-agent-id "<reason>" flag verbatim');
  assert.match(content, /rare case the id (?:truly|genuinely) couldn't be recovered/i, 'should scope the escape hatch to the rare unrecoverable-id case');
  assert.match(content, /agentId[\s\S]{0,10}`?null`?/i, "should state the graceful degrade sets the state entry's agentId to null");
  assert.match(content, /incidencia:\s*`?"<reason>"`?/i, 'should state incidencia carries the given <reason>');
});

test('AC7/R3.S1 — doc states complete --batch applies the same all-or-nothing rule per entry, and names the no_agent_id batch field', () => {
  assert.match(content, /no_agent_id:\s*"<reason>"/, 'should document the no_agent_id: "<reason>" batch field name explicitly');
  assert.match(content, /agent_id[\s\S]{0,20}OR[\s\S]{0,40}no_agent_id/i, 'should state every batch entry needs agent_id or no_agent_id');
  assert.match(content, /entry with neither/i, 'should describe the case where an entry has neither field');
  assert.match(content, /rejects the WHOLE batch/i, 'should state the whole batch is rejected, not just the offending entry');
  assert.match(content, /all-or-nothing/i, 'should tie the rule explicitly to the pre-existing --files all-or-nothing guard');
});

test('AC7/R3.S1 — doc requires exactly one of --agent-id/--no-agent-id for a delegated task, not --agent-id alone with no further requirement', () => {
  // Old wording was the WHOLE sentence: "`--agent-id` is the id captured per
  // **§2**." (full stop right after, no requirement/refusal statement
  // following it). Prove that exact old sentence shape is gone, not just
  // that new text was appended after it.
  assert.doesNotMatch(
    content,
    /`--agent-id` is the id captured per \*\*§2\*\*\.\s/,
    'the old "--agent-id is the id captured per §2." standalone sentence must no longer appear verbatim — it must now carry the requirement/refusal statement in the same place'
  );
  assert.match(
    content,
    /`--agent-id <id>`[\s\S]{0,20}\*\*§2\*\*[\s\S]{0,120}`--no-agent-id/,
    'should fold the requirement into the same bullet as the §2 cross-reference for --agent-id'
  );
});

test('AC7/R3.S1 — doc still tells the orchestrator to capture agentId from the Task tool result per §2, and now flags it as required with no skip', () => {
  assert.match(content, /Task[\s\S]{0,10}tool result itself/i, 'should keep instructing capture from the Task tool result itself');
  assert.match(content, /no other way to skip it/i, 'should state the orchestrator cannot skip passing the captured id');
  assert.match(content, /explicit\s+`--no-agent-id[\s\S]{0,20}acknowledgment/i, 'should frame --no-agent-id as the explicit acknowledgment exception');
});
