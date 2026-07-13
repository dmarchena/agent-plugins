# Spec: Guarantee agentId capture at exec `complete`

## Purpose

When plan-executor closes a task, the subagent's `agentId` is what
`spec-forensics` later joins on to attribute real per-task cost. Today the
exec CLI treats `--agent-id` as advisory prose in the SKILL.md contract: an
orchestrating session can silently omit it, the CLI degrades to a `null`
`agentId` with only a quiet `incidencia`, and the gap surfaces only turns or
days later when forensics runs `incomplete` — often after the spec is
archived (issue #46; markvault: all 8 tasks `agentId: null` despite every
`Task` tool result carrying a real id). This makes the already-available
`agentId` impossible to skip silently: the exec CLI refuses to record or
commit a delegated task without it, unless the gap is explicitly
acknowledged. For anyone running the spec → plan → exec → verify chain.

Change type: fix

## Scope

**In scope:**
- `complete` (single task) refuses a delegated task with no supplied agent id.
- `complete --batch` applies the same rule to every entry, all-or-nothing.
- An explicit acknowledgment (`--no-agent-id "<reason>"` /
  `no_agent_id: "<reason>"`) preserves the pre-existing graceful degrade for
  the rare case the id genuinely couldn't be recovered.
- The plan-executor `SKILL.md` contract (§2/§3) documents the requirement and
  the acknowledgment escape hatch.

**Out of scope (non-goals):**
- `sessionId` capture — unchanged (reliable env fallback; present in the #46
  failure, not the gap).
- Automatic recovery of the id from on-disk subagent transcripts (a rejected
  alternative — correlation is fragile for parallel batches/retries).
- Any change to `spec-forensics` / `verify` behavior or to the state schema.
- Reclassifying which `agent_type` roles delegate (all current roles do).

## Functional Requirements

### R1 — Single-task `complete` requires an agent id for a delegated task

Depende de: —

The system MUST refuse to record state or commit for a delegated task closed
via the single-task complete command unless an agent id is supplied, or the
gap is explicitly acknowledged.

#### R1.S1 — Happy path: id supplied
- GIVEN a delegated task (its plan entry declares an `agent_type`)
- WHEN complete is invoked with `--agent-id <id>`
- THEN stdout is a single `{"ok":true,"data":...}` envelope, exit code 0
- AND the task's `execution_state.json` entry records `agentId: "<id>"` (its
  `done`/`not-done` outcome following the existing verification, unchanged)

#### R1.S2 — Blocked: no id, no acknowledgment
- GIVEN a delegated task
- WHEN complete is invoked with neither `--agent-id` nor `--no-agent-id`
- THEN stdout is `{"ok":false,"error":{"reason":...}}` whose `reason` begins
  `MISSING_AGENT_ID:` and names the task_id, and the exit code is non-zero
- AND no entry is written to `execution_state.json` and no commit is created
  (the state file and `git log` are unchanged from before the call)

#### R1.S3 — Opt-out: gap explicitly acknowledged
- GIVEN a delegated task
- WHEN complete is invoked without `--agent-id` but with `--no-agent-id "<reason>"`
- THEN it proceeds as the pre-existing graceful degrade: stdout
  `{"ok":true,"data":...}`, exit 0, the state entry's `agentId` is `null` and
  its `incidencia` contains `<reason>`

### R2 — `complete --batch` requires an agent id per entry, all-or-nothing

Depende de: R1

The system MUST apply R1's rule to every batch entry before committing any of
them: one non-acknowledged entry without an id rejects the entire batch with
nothing recorded or committed (matching the batch's existing up-front guards).

#### R2.S1 — Happy path: every entry carries `agent_id`
- GIVEN a batch whose every entry carries `agent_id`
- WHEN complete --batch runs
- THEN stdout is `{"ok":true,"data":{"status":"batch",...}}`, exit 0, and each
  task's state entry records its `agent_id`

#### R2.S2 — Blocked: whole batch refused up front
- GIVEN a batch with ≥1 entry that has neither `agent_id` nor `no_agent_id`
- WHEN complete --batch runs
- THEN stdout is `{"ok":false,"error":{"reason":...}}` whose `reason` begins
  `MISSING_AGENT_ID:` and names the offending task_id, exit non-zero
- AND no entry of the batch is recorded or committed (`execution_state.json`
  and `git log` unchanged)

#### R2.S3 — Per-entry opt-out
- GIVEN a batch where one entry carries `no_agent_id: "<reason>"` (and no
  `agent_id`) while the others carry `agent_id`
- WHEN complete --batch runs
- THEN stdout `{"ok":true,...}`, exit 0; the acknowledged entry records
  `agentId: null` with `incidencia` containing `<reason>`, and the others
  record their `agent_id`

### R3 — The plan-executor contract documents the requirement

Depende de: R1

The plan-executor `SKILL.md` (§2/§3) MUST state that complete/`--batch`
requires the captured agent id and describe the acknowledgment escape hatch,
instead of presenting `--agent-id` as advisory.

#### R3.S1 — Contract prose updated
- GIVEN the plan-executor `SKILL.md` §2/§3 after the change
- WHEN read
- THEN it states complete rejects a delegated task with no agent id and
  documents the explicit `--no-agent-id` / `no_agent_id` acknowledgment

### R-E2E — A `done` delegated task always carries its agentId

Depende de: R1, R2

The system SHALL make it impossible for a delegated task to reach `done`
without a recorded `agentId`, unless the gap was explicitly acknowledged.

#### R-E2E.S1 — Reject then record
- GIVEN a validated plan with a delegated task on a fresh `execution_state.json`
- WHEN the task is completed once with green evidence but no agent id, then
  re-completed with `--agent-id <id>` and the same green evidence
- THEN the first call exits non-zero with `reason` beginning `MISSING_AGENT_ID:`
  and leaves no state entry and no commit; after the second call the task's
  state entry is `status: "done"` with `agentId: "<id>"` and a commit exists

## Technical Requirements

- **Stack / framework:** Node.js ESM, stdlib only — no new dependencies
  (consistent with the existing exec CLI).
- **Integraciones:** N/A.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** reads the immutable `execution_plan.json` and
  the sibling `execution_state.json`; the guard MUST run before any state
  write or git commit, preserving plan immutability and the batch's
  all-or-nothing semantics.
- **Restricciones adicionales:** stdout carries only the canonical
  `{ok,...}` envelope (no prose); the blocked path signals failure via a
  non-zero exit. "Delegated task" = a plan entry that declares an `agent_type`
  (schema-required; all 7 current roles delegate, so effectively every task).

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — completing a delegated task with `--agent-id X` exits 0 and its state entry has `agentId: "X"`
- [ ] AC2 → R1.S2 [auto] — completing it with no id and no `--no-agent-id` exits non-zero, `error.reason` starts `MISSING_AGENT_ID:` and names the task_id, and the state file + `git log` are unchanged
- [ ] AC3 → R1.S3 [auto] — completing it with `--no-agent-id "R"` exits 0, records `agentId: null` and `incidencia` containing `R`
- [ ] AC4 → R2.S1 [auto] — a batch where every entry has `agent_id` exits 0 and each entry's state records its id
- [ ] AC5 → R2.S2 [auto] — a batch with one entry lacking both `agent_id` and `no_agent_id` exits non-zero with `MISSING_AGENT_ID:` naming that task_id, and nothing in the batch is recorded or committed
- [ ] AC6 → R2.S3 [auto] — a batch mixing one `no_agent_id: "R"` entry with `agent_id` entries exits 0; the acknowledged entry records `agentId: null` + `incidencia` containing `R`, the rest record their ids
- [ ] AC7 → R3.S1 [manual] — reading plan-executor `SKILL.md` §2/§3 confirms it documents the block and the `--no-agent-id`/`no_agent_id` acknowledgment (human judgment that the prose is accurate/coherent)
- [ ] AC-E2E → R-E2E.S1 [auto] — the reject-then-record sequence leaves no commit on the first (blocked) call and a `done` entry with the supplied `agentId` after the second

## Assumptions & Open Questions

- Every plan task declares an `agent_type` (schema-required enum of 7 roles,
  all delegating to a subagent), so "delegated task" is effectively every task
  today; the rule is phrased against `agent_type` presence to stay correct if
  a non-delegating role is ever added.
- The agent id is always available to the orchestrator in the `Task` tool
  result (`toolUseResult.agentId`), so the block never demands an unavailable
  value; `--no-agent-id` exists only for the rare genuine-recovery-failure case.
- Opt-out flag naming is fixed: `--no-agent-id "<reason>"` (single) and the
  `no_agent_id: "<reason>"` field (batch entry, snake_case like its siblings).
- `spec-forensics` / `verify` behavior and the state schema are unchanged; this
  fix only guarantees the `agentId` forensics later joins on is recorded at
  `complete` time.
