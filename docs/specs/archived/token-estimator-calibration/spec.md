# Spec: Token estimator calibration reference

## Purpose

plan-writer asks the plan author for an `estimated_tokens` baseline per task,
but that baseline is systematically biased and — critically — the sign of the
bias flips from one plan to another (some plans are over-estimated, others
under-estimated), which means it is not a "multiply by 1.3" correction. The
current guidance leans on nominal task complexity by `agent_type`, which does
not capture the real signal. This feature gives the plan author an
evidence-based calibration reference, built deterministically from the token
data already recorded in archived executions, plus guidance that reframes
estimation around *how much prior context a task must read* rather than its
nominal complexity. It is for whoever writes an `execution_plan.json`; it does
not change the plan format or auto-compute anything.

Change type: feat

## Scope

**In scope:**
- A deterministic command that builds a calibration snapshot from the archived
  spec directories that carry both an `execution_state.json` and an
  `execution_plan.json`.
- The committed snapshot artifact, living in plan-writer's `assets/` so the
  skill can reference it by relative path.
- Updated plan-writer estimation guidance that frames estimation around
  accumulated prior context and links the snapshot.

**Out of scope (non-goals):**
- Touching the exec-stage budget-pause 2× threshold — it depends on estimation
  accuracy but is a separate decision.
- Changing `execution_plan.schema.json`, or auto-computing `estimated_tokens`:
  estimation stays the plan author's judgment, only better-informed.
- Backfilling `actual_tokens` / `deviation` into archived plans or states.
- Computing a real prior-context-size proxy by re-reading historical code or
  specs; only cheap structural signals already present in the archived
  artifacts are used.

## Functional Requirements

### R1 — Calibration snapshot generation

Depende de: —

The system SHALL provide a command that reads every archived spec directory
holding both an `execution_state.json` and an `execution_plan.json`, joins each
executed task's recorded consumption with its planned structure, and writes a
Markdown snapshot with one row per executed task carrying: plan slug, task id,
`agent_type`, task index (plan order, 0-based), number of dependencies, plan
size (task count), `estimated_tokens`, `actual_tokens`, and a signed
`deviation%` = round((actual − estimated) / estimated × 100). The join keys the
state's task entry to the plan task of the same id; `actual_tokens` comes from
the state, structural fields from the plan.

#### R1.S1 — Fully executed plan
- GIVEN an archived directory whose `execution_state.json` records a non-null
  `actual_tokens` for every task and a matching `execution_plan.json`
- WHEN the calibration command runs
- THEN the snapshot contains exactly one row per task of that plan, each row
  populated with the nine columns above, and the `deviation%` value carries the
  correct sign (positive when actual > estimated, negative when actual <
  estimated)

#### R1.S2 — Missing or unusable data
- GIVEN a task whose `actual_tokens` is null (or a plan that was never executed,
  so no task has `actual_tokens`)
- WHEN the calibration command runs
- THEN that task/plan contributes no row, and the output states the number of
  excluded tasks on an `excluded: <K>` line (no silent drop)
- AND a task whose `estimated_tokens` is null or 0 still produces a row, with
  `deviation%` rendered as `N/A` instead of a computed number

### R2 — Per-plan bias summary

Depende de: R1

The system SHALL include, in the same snapshot, a summary section listing each
plan with the signed mean of its tasks' `deviation%`, plus one overall line, so
that the sign-flip-between-plans pattern is visible without reading every row.

#### R2.S1 — Opposite-sign plans surface
- GIVEN the archived plans `fix-commit-state-ordering` (over-estimated in the
  recorded data) and `verify` (under-estimated)
- WHEN the calibration command runs
- THEN the summary lists `fix-commit-state-ordering` with a negative mean
  `deviation%` and `verify` with a positive mean `deviation%`

### R3 — Deterministic and regenerable

Depende de: R1

The system SHALL produce byte-identical output from identical inputs — no
timestamps, no run-dependent ordering — so the committed snapshot can be
regenerated and diffed.

#### R3.S1 — Idempotent regeneration
- GIVEN the snapshot has just been generated and committed
- WHEN the calibration command runs a second time with no change to the archived
  inputs
- THEN the snapshot file is byte-identical to the committed one (a `git diff`
  reports no change)

### R4 — Estimation guidance consumes the calibration

Depende de: R1

The system SHALL update plan-writer's estimation guidance so it (a) instructs
the plan author to weight how much prior context a task must read before writing
anything over the task's nominal complexity, and (b) points to the calibration
snapshot by its relative path.

#### R4.S1 — Guidance links the reference
- GIVEN plan-writer's estimation guidance after this change
- WHEN the guidance text is read
- THEN it contains an instruction to estimate by accumulated prior context (not
  nominal complexity) and a relative-path link to the snapshot, and the snapshot
  file exists at that path

### R-E2E — Author-facing calibration loop

Depende de: R1, R2, R3, R4

The system SHALL let a plan author, from a clean checkout, regenerate the
snapshot with no diff, see per-plan bias in it, and reach it from the estimation
guidance.

#### R-E2E.S1 — End-to-end walk
- GIVEN a clean checkout of the repo
- WHEN the calibration command is run and plan-writer's estimation guidance is
  opened
- THEN regeneration produces no diff, the snapshot's rows and per-plan summary
  match the archived data, and the guidance's relative-path link resolves to the
  existing snapshot file

## Technical Requirements

- **Stack / framework:** Node `.mjs` command, consistent with
  `scripts/plan-tools.mjs`. Whether it is a new subcommand of `plan-tools.mjs`
  or a standalone script is left to the plan (OQ2).
- **Integraciones:** N/A — reads only local archived artifacts under
  `docs/specs/archived/`.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** Input — `docs/specs/archived/<slug>/execution_state.json`
  (source of `actual_tokens`, tasks keyed by task id) joined to the sibling
  `execution_plan.json` (source of `agent_type`, `dependencies`, task order and
  count) on state-key ↔ plan `task_id`. Output — a committed Markdown snapshot
  under `plugins/sdd-kit/skills/plan-writer/assets/` (primary; a parallel
  structured `.json` is optional per A1).
- **Restricciones adicionales:** `execution_plan.schema.json` is unchanged; the
  landing bumps plan-writer's minor version with a `CHANGELOG.md` entry.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — on an archived pair with all `actual_tokens` present,
  the snapshot has exactly one row per task with the nine columns, and
  `deviation%` sign matches actual-vs-estimated.
- [ ] AC2 → R1.S2 [auto] — a task with null `actual_tokens` produces no row and
  is counted on an `excluded: <K>` line; a task with null/0 `estimated_tokens`
  keeps its row with `deviation%` = `N/A`.
- [ ] AC3 → R2.S1 [auto] — the summary lists a signed mean `deviation%` per
  plan; `fix-commit-state-ordering` is negative and `verify` is positive.
- [ ] AC4 → R3.S1 [auto] — running the command twice back-to-back leaves the
  snapshot byte-identical (`git diff --exit-code` on the file is clean).
- [ ] AC5 → R4.S1 [auto] — the estimation guidance contains the prior-context
  instruction and a relative-path link to the snapshot, and a file exists at
  that path.
- [ ] AC-E2E → R-E2E.S1 [auto] — from a clean checkout, regenerating yields no
  diff and the guidance's relative-path link resolves to the existing snapshot.

## Assumptions & Open Questions

- A1: The primary output is Markdown; a parallel structured `.json` is optional
  and only added if cheap. Default: `.md` only.
- A2: `deviation%` = round((actual − estimated) / estimated × 100), signed,
  integer. This differs from the absolute `deviation` (actual − estimated)
  stored in `execution_state.json`, which is kept as-is.
- OQ1: Should CI enforce snapshot freshness (regenerate-and-diff) when a new
  spec is archived? Deferred — not part of this feature.
- OQ2: Exact home of the command (a `plan-tools.mjs` subcommand vs a standalone
  script) is left to plan-writer.
