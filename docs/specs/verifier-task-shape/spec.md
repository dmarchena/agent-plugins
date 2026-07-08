# Spec: Verifier task shape for spec-mandated end-to-end confirmation

## Purpose

Every spec `spec-writer` produces mandates an `R-E2E` / `AC-E2E` end-to-end
requirement, so `plan-writer` always emits a final "run the whole suite and
confirm it's green" task with no code to write. `plan-executor`'s TDD model
classifies any `complete` whose red phase passed (`--rojo pass`) as `no-red`
("test passed with nothing implemented"), so this task can never legitimately
close: it's structurally incapable of a genuine red phase, gets stuck
`pending`, and has been unblocked ad hoc — once via a commit-message note,
once via a hand-patched report field — on every plan the kit has run. This
change gives that recurring "verification-only, no code" task a first-class,
documented shape (`agent_type: "verifier"`) so it closes green through the
normal executor/verify flow, with no manual override. For maintainers of the
sdd-kit and anyone running a spec → plan → exec → verify cycle. Resolves
issue #11.

Change type: fix

## Scope

**In scope:**
- A `verifier` `agent_type` in the execution-plan contract, meaning: run the
  existing suite and confirm it green, with no code and no red phase expected.
- `complete` closing a `verifier` task green (deterministic suite re-run)
  without treating the absent red phase as `no-red`, and committing it staging
  only the executor state file (no `--files` required, no whole-tree `add -A`).
- `verify` marking `AC-E2E` green through its normal report/archive flow when
  the backing `verifier` task is done — no ad hoc override.
- `plan-writer` emitting `verifier` for the E2E task, and the completion path
  being documented in the kit's docs.

**Out of scope (non-goals):**
- Removing the `R-E2E` requirement from `spec-writer`'s template entirely — the
  integrative end-to-end check is valuable; only the tooling to confirm it is
  missing a path.
- Changing how ordinary `code_writer` tasks or other non-code roles
  (researcher, doc_writer, reviewer, architect) are verified.
- Any change to the shape of `execution_state.json`.

## Functional Requirements

### R1 — `verifier` role in the execution-plan contract

Depende de: —

The execution-plan contract MUST recognize `verifier` as a valid `agent_type`,
meaning a task that runs the pre-existing suite and confirms it green with no
code and no test contract, and MUST hold `verifier` to the same "no test
contract" rule as every other non-`code_writer` role.

#### R1.S1 — Verifier task validates
- GIVEN an `execution_plan.json` whose task has `agent_type: "verifier"` and `test_contract: null`
- WHEN it is validated against `execution_plan.schema.json` plus the kit's external plan validator
- THEN validation succeeds (exit code 0, no error emitted)

#### R1.S2 — Verifier task with a test contract is rejected
- GIVEN an `execution_plan.json` whose `verifier` task has a non-null `test_contract`
- WHEN it is validated by the kit's plan validator
- THEN validation fails with a non-zero exit and an error message naming the offending `task_id` and stating that a non-`code_writer` role must have `test_contract: null`

### R2 — `complete` closes a verifier task green without a red phase

Depende de: R1

For a task whose `agent_type` is `verifier`, `complete` MUST NOT require a red
phase: it MUST deterministically re-run the task's `--test-cmd` (the suite) and
record the task `done` when that re-run passes, instead of returning `no-red`.
The waiver MUST be scoped to `verifier` tasks only.

#### R2.S1 — Verifier task with a green suite closes done
- GIVEN a `verifier` task in a plan and a `--test-cmd` whose suite passes
- WHEN `complete <specDir> <taskId> --test-cmd <suite> --rojo pass --verde pass` runs (no `--files`)
- THEN the command returns `status: "done"` for that task, its `execution_state.json` entry is `status: "done"`, and no `no-red` incident (`incidencia: "no red evidence"` / `reason: "no-red"`) is recorded anywhere for it

#### R2.S2 — Verifier task with a red suite does not close
- GIVEN a `verifier` task whose `--test-cmd` suite fails on the orchestrator's re-run
- WHEN `complete` runs for it
- THEN it returns `status: "not-done"` with `reason: "rerun-failed"`, the task's `execution_state.json` entry stays `status: "pending"`, and no commit is created for it

#### R2.S3 — The waiver does not leak to non-verifier tasks (high-risk)
- GIVEN a task whose `agent_type` is `terminal_operator` (not `verifier`)
- WHEN `complete` runs for it with `--rojo pass`
- THEN it still returns `status: "not-done"` with `reason: "no-red"` exactly as before this change (the no-code waiver never masks a genuine no-red on a non-verifier task)

### R3 — A verifier task commits only the executor state file

Depende de: R2

When a `verifier` task is recorded done, `complete` MUST produce exactly one
commit that stages only the executor state file (`execution_state.json`, the
task's own done-flip), without requiring an explicit `--files` list and without
ever falling back to a whole-tree `git add -A`.

#### R3.S1 — Verifier done-commit contains only the state file
- GIVEN a `verifier` task completing green on the plan's own branch, with unrelated untracked/modified files present in the tree
- WHEN `complete` records it done
- THEN exactly one new commit is created whose set of changed paths is exactly `{execution_state.json}` (relative to the spec dir), its message references the `task_id`, and none of the unrelated tree changes are swept into it

#### R3.S2 — Verifier completion is exempt from the `--files` refusal
- GIVEN a `verifier` task completing green
- WHEN `complete` is called for it without `--files`
- THEN it does NOT abort with `complete: refusing to commit without an explicit file list ...` (the issue #9 guard for code tasks), and still stages no code files it was not given

### R4 — `verify` closes AC-E2E through the normal flow

Depende de: R2

When the `verifier` task backing `AC-E2E` is done, `verify` MUST mark `AC-E2E`
green through its normal `assembleReport` / `archiveIfGreen` path, with no
hand-patched report field and no user-override confirmation step.

#### R4.S1 — Done verifier task drives AC-E2E green and archives
- GIVEN a `SPECDIR` whose `verifier`/E2E task is `done` in `execution_state.json` and all other ACs are green
- WHEN `verify` runs over it
- THEN `AC-E2E` is reported `green: true` via the normal report flow (its reason is not `user-override`) and the `SPECDIR` is archived to `docs/specs/archived/<slug>/`

#### R4.S2 — Pending verifier task keeps AC-E2E open
- GIVEN a `SPECDIR` whose `verifier`/E2E task is still `pending` (its suite was red)
- WHEN `verify` runs over it
- THEN `AC-E2E` is reported not-green, the run is not-finished, and the `SPECDIR` is NOT archived

### R5 — The verifier path is emitted and documented

Depende de: R1

`plan-writer` SHALL emit `agent_type: "verifier"` for the task backing the
spec's `R-E2E`/`AC-E2E`, and the kit's docs SHALL describe the verifier task
shape and how it completes (green via suite re-run, state-only commit, no red
phase).

#### R5.S1 — Docs describe the verifier completion path
- GIVEN the shipped kit docs
- WHEN one reads `plan-executor/assets/task-brief-detail.md` (the `not-done` reasons / completion section) and `verify/SKILL.md`
- THEN both describe the `verifier` task shape and its no-red-phase, state-only-commit completion path (the literal role name `verifier` appears in that context)

#### R5.S2 — plan-writer instructs emitting verifier for the E2E task
- GIVEN `plan-writer`'s skill guidance
- WHEN one reads how it maps `R-E2E`/`AC-E2E` to a task
- THEN it instructs emitting `agent_type: "verifier"` for that task (rather than `terminal_operator`)

### R-E2E — Spec-mandated E2E task closes with no manual override

Depende de: R1, R2, R3, R4, R5

The system SHALL take a spec carrying the mandated `R-E2E`/`AC-E2E`, plan it,
execute it, and verify/archive it end-to-end, closing the E2E task green
through the normal flow without any manual override.

#### R-E2E.S1 — Full spec→plan→exec→verify with a verifier E2E task
- GIVEN a spec whose plan includes a `verifier` task backing `AC-E2E`, on the plan's own branch, with the suite green
- WHEN the plan is executed to completion and then `verify` is run
- THEN the `verifier` task closes `done` with a state-only commit and no `no-red` incident, `AC-E2E` is reported green through the normal flow (never `user-override`), and the `SPECDIR` is archived — with no manual override at any step

## Technical Requirements

- **Stack / framework:** existing sdd-kit Node ESM scripts (stdlib only, no npm deps); JSON Schema draft 2020-12 for the plan schema.
- **Integraciones:** git (per-task commit on the plan branch); the plan's own test runner invoked via `--test-cmd`.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** `execution_plan.schema.json` gains `verifier` in the `agent_type` enum; `execution_state.json` shape is unchanged.
- **Restricciones adicionales:** MUST preserve issue #9 commit hygiene (scoped pathspec, never `git add -A` on the single-task path); MUST NOT remove or weaken the `R-E2E` requirement in `spec-writer`'s template.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — validating a plan whose task is `agent_type: "verifier"`, `test_contract: null` exits 0 with no error
- [ ] AC2 → R1.S2 [auto] — validating a `verifier` task with a non-null `test_contract` exits non-zero, error names the `task_id` and the null-contract rule
- [ ] AC3 → R2.S1 [auto] — `complete` on a verifier task with a green suite returns `status: "done"`, state entry is `done`, and no `no-red` incident is recorded for it
- [ ] AC4 → R2.S2 [auto] — `complete` on a verifier task with a failing suite returns `status: "not-done"` / `reason: "rerun-failed"`, state stays `pending`, no commit created
- [ ] AC5 → R2.S3 [auto] — `complete` on a `terminal_operator` task with `--rojo pass` still returns `status: "not-done"` / `reason: "no-red"`
- [ ] AC6 → R3.S1 [auto] — the verifier done-commit's changed paths are exactly `{execution_state.json}`; unrelated tree changes are not swept in
- [ ] AC7 → R3.S2 [auto] — `complete` on a verifier task without `--files` does not abort with the issue #9 refusal message and stages no code files
- [ ] AC8 → R4.S1 [auto] — with the verifier task done and all other ACs green, `verify` reports `AC-E2E` green via the normal flow (reason ≠ `user-override`) and archives the SPECDIR
- [ ] AC9 → R4.S2 [auto] — with the verifier task pending, `verify` reports `AC-E2E` not-green and does not archive the SPECDIR
- [ ] AC10 → R5.S1 [auto] — `task-brief-detail.md` and `verify/SKILL.md` both contain the `verifier` role and its completion path in context
- [ ] AC11 → R5.S2 [manual] — `plan-writer`'s guidance instructs emitting `agent_type: "verifier"` for the E2E task; manual because plan-writer output is LLM-generated prose, not a mechanically produced artifact
- [ ] AC-E2E → R-E2E.S1 [auto] — a full spec→plan→exec→verify run over a plan with a verifier E2E task closes it green (state-only commit, no `no-red`), reports `AC-E2E` green normally, and archives the SPECDIR, with no manual override

## Assumptions & Open Questions

- The `done` result / state entry for a verifier task carries a distinguishing marker (e.g. `reason: "verifier-confirmed"`); the exact token is left to the plan/implementation, as long as it is observably NOT a `no-red` incident (AC3).
- Assumed the plan validator that enforces the `code_writer` ↔ non-null `test_contract` exclusivity is the correct place to also enforce `verifier` ⇒ null contract (R1.S2); if that rule lives elsewhere, the plan stage adapts the probe accordingly.
- Assumed `verify`'s existing `assembleReport`/`archiveIfGreen` flow already treats a `done` task's `AC-E2E` as green once no `no-red` incident blocks it, so R4 needs no new manual-confirmation primitive.
