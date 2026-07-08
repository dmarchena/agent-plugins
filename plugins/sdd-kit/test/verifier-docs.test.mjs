// T5-emit-and-document: doc-content guard for the `verifier` task shape
// (docs/specs/verifier-task-shape, task T5-emit-and-document). Presence-only
// checks (no execution) that the kit's docs describe the new `verifier`
// agent_type and that plan-writer's guidance instructs emitting it for the
// spec-mandated R-E2E/AC-E2E task.
//
//   ref R5.S1 (AC10) — plan-executor/assets/task-brief-detail.md AND
//     verify/SKILL.md each contain the literal role name `verifier` together
//     with its completion path: no red phase / suite re-run / state-only
//     commit (task-brief-detail.md), and AC-E2E closing green through the
//     normal report/archive flow with no manual override (verify/SKILL.md).
//   ref R5.S2 (AC11) — plan-writer's assets/agent-roles.md carries a
//     `verifier` row, and plan-writer's SKILL.md instructs emitting
//     `agent_type: "verifier"` for the R-E2E/AC-E2E task instead of
//     `terminal_operator`.
//
// Run against the pre-edit docs (before T5's doc changes land), this test is
// RED: none of the four files below mention `verifier` yet.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

const TASK_BRIEF_DETAIL_PATH = path.join(
  SKILLS_DIR,
  'plan-executor',
  'assets',
  'task-brief-detail.md',
);
const VERIFY_SKILL_PATH = path.join(SKILLS_DIR, 'verify', 'SKILL.md');
const AGENT_ROLES_PATH = path.join(
  SKILLS_DIR,
  'plan-writer',
  'assets',
  'agent-roles.md',
);
const PLAN_WRITER_SKILL_PATH = path.join(SKILLS_DIR, 'plan-writer', 'SKILL.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('R5.S1 (AC10): task-brief-detail.md documents the verifier task shape and its no-red-phase, state-only-commit completion path', () => {
  const content = read(TASK_BRIEF_DETAIL_PATH);
  const lower = content.toLowerCase();

  assert.ok(
    lower.includes('verifier'),
    'task-brief-detail.md must mention the `verifier` role by name',
  );
  assert.ok(
    lower.includes('no red phase') || lower.includes('waives the red phase'),
    'task-brief-detail.md must state the verifier task has no red phase / the red phase is waived',
  );
  assert.ok(
    lower.includes('re-run') && lower.includes('suite'),
    'task-brief-detail.md must state the verifier task re-runs the pre-existing suite',
  );
  assert.ok(
    lower.includes('state file') || lower.includes('state-only commit'),
    'task-brief-detail.md must state the verifier done-commit stages only the executor state file',
  );
});

test('R5.S1 (AC10): verify/SKILL.md documents that a done verifier task closes AC-E2E green through the normal flow, no manual override', () => {
  const content = read(VERIFY_SKILL_PATH);
  const lower = content.toLowerCase();

  assert.ok(
    lower.includes('verifier'),
    'verify/SKILL.md must mention the `verifier` role by name',
  );
  assert.ok(
    lower.includes('ac-e2e'),
    'verify/SKILL.md must reference AC-E2E in the verifier context',
  );
  assert.ok(
    lower.includes('normal report') ||
      lower.includes('normal flow') ||
      lower.includes('normal archive'),
    'verify/SKILL.md must state AC-E2E closes through the NORMAL report/archive flow',
  );
  assert.ok(
    lower.includes('no manual override') || lower.includes('not a manual override'),
    'verify/SKILL.md must clarify no manual override is needed for a verifier-backed AC-E2E',
  );
});

test('R5.S2 (AC11): plan-writer agent-roles.md carries a verifier row (subagent + haiku model + no-code/no-red-phase description)', () => {
  const content = read(AGENT_ROLES_PATH);
  const lower = content.toLowerCase();

  assert.ok(
    /`verifier`/.test(content),
    'agent-roles.md must have a `verifier` agent_type entry',
  );
  assert.ok(lower.includes('haiku'), 'agent-roles.md verifier row context must mention model haiku');
  assert.ok(
    lower.includes('r-e2e') || lower.includes('ac-e2e'),
    'agent-roles.md verifier row must reference the spec-mandated R-E2E/AC-E2E task',
  );
});

test('R5.S2 (AC11): plan-writer SKILL.md instructs emitting agent_type: "verifier" for the R-E2E/AC-E2E task (not terminal_operator)', () => {
  const content = read(PLAN_WRITER_SKILL_PATH);
  const lower = content.toLowerCase();

  assert.ok(
    lower.includes('verifier'),
    'plan-writer/SKILL.md must mention the `verifier` agent_type',
  );
  assert.ok(
    lower.includes('r-e2e') || lower.includes('ac-e2e'),
    'plan-writer/SKILL.md must tie the `verifier` instruction to the R-E2E/AC-E2E task',
  );
  assert.ok(
    lower.includes('not `terminal_operator`') ||
      lower.includes('not terminal_operator') ||
      lower.includes('instead of `terminal_operator`') ||
      lower.includes('instead of terminal_operator'),
    'plan-writer/SKILL.md must clarify verifier replaces terminal_operator for this task',
  );
});
