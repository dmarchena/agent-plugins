# Spec: Verify CLI + drop the budget auto-pause (sdd-kit cost slice of #15)

## Purpose

Running a small change through the sdd-kit `spec → plan → exec → verify` flow
costs far more than the work justifies, and ~98% of that cost is the Opus
orchestrator re-reading a growing context every turn — not the subagents. Two
tool-design choices in that context tax are fixable **without** first building
cost measurement (issue #16): the `verify` stage ships its logic as a ~900-line
library with no CLI, forcing the orchestrator to load the whole module and
hand-write throwaway driver scripts; and the exec budget-pause halts a healthy
DAG on a `cache_read`-blind signal, forcing a `resume` round-trip that costs
more than it saves. This spec covers only that #16-independent slice of #15, for
whoever runs SDD flows day to day. It deliberately leaves the parts that need
real-cost measurement to a follow-up spec after #16, so **#15 stays open** until
then.

Change type: refactor

## Scope

**In scope:**
- Expose the `verify` stage's deterministic steps (ground check, report
  assembly, archive-if-green) as command-line subcommands, so the stage is
  driven by one-line `node …/verify-tools.mjs <sub> SPECDIR` commands instead of
  importing the module and authoring driver scripts.
- Update the `verify` skill to drive the stage via those one-liners.
- Remove the exec budget **auto-pause**: a plan whose real tokens exceed 2× the
  estimate but whose tasks are healthy runs to completion; the deviation is
  still reported, not turned into a DAG-halting pause + `resume`.

**Out of scope (non-goals):**
- Any budget signal weighted by real cost incl. `cache_read`, and surfacing
  real per-run orchestrator cost in reports — both need the measurement from
  issue #16; deferred to a follow-up spec (this is why #15 is not closed here).
- Recalibrating `estimated_tokens` per task — that is issue #7
  (`plan-writer-token-estimator`).
- The exec `complete --batch` round-trip reduction — already shipped
  (`sdd-kit-token-reduction`); untouched here.
- Changing which model runs subagents.
- Persisting `agentId`/`sessionId` per task — that is issue #17.

## Functional Requirements

### R1 — Verify stage driven by a CLI

Depende de: —

The system SHALL expose the verify stage's deterministic steps (at minimum:
ground check, final report assembly, and archive-if-green) as command-line
subcommands invocable as `node …/verify-tools.mjs <subcommand> <specDir> [args]`,
each printing structured JSON with a `status` field to stdout and using process
exit codes, mirroring the existing `exec-tools.mjs` CLI shape — so the verify
stage is driven by one-line commands without importing the module into the
caller's context or authoring a driver script.

#### R1.S1 — Happy path
- GIVEN a SPECDIR containing `spec.md`, `execution_plan.json` and
  `execution_state.json`, all present and green
- WHEN the operator runs the deterministic verify steps as
  `node …/verify-tools.mjs <sub> SPECDIR` one-liners (ground check, then report,
  then archive)
- THEN each command prints a JSON object with a `status` field to stdout and
  exits 0
- AND the archive command moves the SPECDIR to `docs/specs/archived/<slug>/`

#### R1.S2 — Missing required file
- GIVEN a SPECDIR missing a required file (e.g. `execution_plan.json`)
- WHEN any verify subcommand runs on it
- THEN the command exits non-zero and prints a `VerifyInputError` message naming
  the missing file, and nothing is archived

#### R1.S3 — Manual ACs are consumed, not prompted
- GIVEN a spec whose acceptance checklist contains one or more `[manual]` ACs
- WHEN the report subcommand is invoked with a manual-verdicts input file (the
  human-resolved verdicts, supplied the way `exec complete --batch` takes a batch
  file)
- THEN the assembled report incorporates those verdicts and the command never
  blocks on interactive stdin (the skill elicits the human judgment; the CLI
  only consumes the resolved verdicts)

### R2 — Budget deviation no longer halts the run

Depende de: —

The system SHALL let an execution plan run to completion when a task's real
tokens exceed 2× its estimate but the task otherwise completes cleanly: the
token deviation is surfaced in the exec report, not turned into a DAG-halting
pause that requires a `resume`.

#### R2.S1 — Over-budget but healthy run completes
- GIVEN a mid-run plan where cumulative real `actual_tokens` exceed 2× the
  estimate of the tasks already run, and every task is green
- WHEN the next-batch subcommand is invoked
- THEN it returns the next ready batch, never `{ status: "paused", reason:
  "budget" }`, and no `pause` entry is recorded in `execution_state.json`

#### R2.S2 — Genuine-failure blocking is preserved
- GIVEN a task that fails its verification twice (a genuine failure)
- WHEN it is processed
- THEN it is still blocked and its dependents skipped (the existing
  retry-once-then-block behavior is unchanged — removing the budget pause does
  not remove failure blocking)

### R-E2E — Cheap verify + no spurious pause, end to end

Depende de: R1, R2

The system SHALL run a healthy over-budget plan to completion without a budget
pause and then verify and archive it through CLI one-liners.

#### R-E2E.S1 — Full walkthrough
- GIVEN a SPECDIR whose exec run included at least one healthy task exceeding 2×
  its estimate, all tasks green
- WHEN the operator runs exec to completion, then the verify subcommands as
  one-liners
- THEN exec reports `complete` with no `pause` recorded in
  `execution_state.json`, the verify report is all-green, and the SPECDIR is
  moved to `docs/specs/archived/<slug>/`

## Technical Requirements

- **Stack / framework:** Node.js ESM (`.mjs`), run via `node`, consistent with
  the existing `scripts/*-tools.mjs`. No new dependencies.
- **Integraciones:** N/A — all local file I/O under the repo.
- **Rendimiento:** No numeric latency target; the goal is fewer orchestrator
  round-trips and less context loaded. Observable proxy: verify is driven
  without loading the ~900-line library into the caller (see AC6).
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** Reads `spec.md`, `execution_plan.json`,
  `execution_state.json` under `docs/specs/<slug>/`; archives to
  `docs/specs/archived/<slug>/`. `execution_state.json` schema is unchanged.
- **Restricciones adicionales:** CLI output shape mirrors `exec-tools.mjs`
  (JSON with `status`) so the skill drives both identically. Existing exported
  functions of `verify-tools.mjs` remain importable (current tests depend on
  them) — the CLI wraps them; it does not replace the library. Backward
  compatible.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — running each verify subcommand as
  `node verify-tools.mjs <sub> SPECDIR` on a green fixture prints JSON with a
  `status` field and exit 0; the archive command moves the dir under
  `docs/specs/archived/<slug>/`
- [ ] AC2 → R1.S2 [auto] — a subcommand on a SPECDIR missing
  `execution_plan.json` exits non-zero and its stderr/stdout contains the
  `VerifyInputError` message naming the file; the archived dir is not created
- [ ] AC3 → R1.S3 [auto] — the report subcommand given a manual-verdicts input
  file produces a report incorporating those verdicts and never reads
  interactive stdin
- [ ] AC4 → R2.S1 [auto] — the next-batch subcommand on an over-2× but all-green
  state returns a ready batch (never `status:"paused"`/`reason:"budget"`) and
  writes no `pause` entry to `execution_state.json`
- [ ] AC5 → R2.S2 [auto] — a twice-failing task is still blocked and its
  dependents skipped (regression guard on the failure-blocking path)
- [ ] AC6 → R1 [manual] — the `verify` SKILL.md drives every deterministic verify
  step with a `node …/verify-tools.mjs <sub>` one-liner and instructs no module
  import or driver-script authoring; manual because it is a judgment over the
  skill's guidance prose, not a single mechanical string assertion
- [ ] AC-E2E → R-E2E.S1 [auto] — fixture-driven: exec reaches `complete` with no
  `pause` in state, the verify subcommands yield an all-green report, and the
  SPECDIR ends up under `docs/specs/archived/<slug>/`

## Assumptions & Open Questions

- `[manual]` AC verdicts are supplied to the report subcommand as an input file,
  mirroring `exec complete --batch`; the skill elicits the human judgment and the
  CLI consumes resolved verdicts (default adopted; revisit only if an interactive
  path is later wanted).
- Exact subcommand names and granularity (e.g. `ground-check` / `report` /
  `archive`) are left to plan-writer; the spec fixes only that each deterministic
  stage is CLI-invocable with `exec-tools`-style JSON output.
- The `#16`-dependent items (budget signal incl. `cache_read`, per-run cost
  reporting) are a follow-up spec after #16 lands; **#15 remains open** until
  that follow-up completes.
