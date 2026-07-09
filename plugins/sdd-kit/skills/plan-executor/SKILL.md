---
name: plan-executor
description: Use this skill whenever the user has a validated execution_plan.json (plan-writer format) next to its spec.md and wants to EXECUTE it — turn the planned tasks into tested, committed code — e.g. "ejecuta el plan", "corre el execution_plan", "implementa las tareas del plan", "arranca la fase exec", "plan-executor", "reanuda la ejecución del plan", or any request to run/resume a spec-driven-development exec stage from an existing plan. It consumes execution_plan.json + spec.md and does NOT write the plan (that's plan-writer) nor the spec (that's spec-writer); it drives the DAG task by task via TDD, verifies deterministically, and commits per task on the plan's own branch.
argument-hint: "[ruta a docs/specs/<slug>/ o al execution_plan.json]"
allowed-tools: Read, Write, Edit, Bash, Task
---

# Plan Executor (execution_plan → tested, committed code)

## What this does

Third stage of the spec → plan → **exec** → verify workflow. Takes a
validated `execution_plan.json` (plan-writer's format) and its `spec.md`
from the same `docs/specs/<slug>/` directory and runs the task DAG to
completion, to a block, or to a pause. Its defining trait is token
economy: instead of the expensive "developer subagent + reviewer subagent
per task" pattern, each task runs a **single TDD executor** and the
orchestrator verifies the green **deterministically** by re-running the
test itself — no reviewer tokens.

All deterministic logic (validate, DAG batching, state, verify-by-rerun,
git, budget, resume) lives in `scripts/exec-tools.mjs` and `scripts/exec/`
(tests in `test/exec/`; state shape fixed by
`assets/execution_state.schema.json`). **The scripts are the source of
truth for behavior; you drive them, you do not re-implement them.**
`SPECDIR` (throughout) is the `docs/specs/<slug>/` directory. Every
subcommand prints one JSON object to stdout — read it and branch on
`status`.

## 0. Hard gate: validate before touching anything

Always run this first:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs init SPECDIR
```

`init` validates the plan against its spec (schema + full requirement/AC
coverage, via plan-writer's `check-plan`), and only then creates state and
the branch.

- **Exit ≠ 0 / `PLAN_INVALIDO`** → STOP. Report the concrete failing
  field/ID the validator named and tell the user to fix the plan with
  plan-writer. Do **not** create a branch, state, or launch any subagent
  (R1.S2 / AC1).
- **`{ ok: true, ... }`** → prints `branch`, `branch_created`,
  `first_batch`, `total_tasks`. Announce the batch plan to the user: which
  tasks run in parallel now, which wait on dependencies (R1.S1).

If `execution_state.json` already exists in SPECDIR, this is a resume —
skip `init`, go to `assets/failures-and-resume.md` §6 Resume instead.

## 1. The task loop

Repeat until a subcommand reports `complete` or `stalled`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs next SPECDIR
```

Branch on `status`: **`run`** → `batch` is the list of `task_id`s
ready now (≤3); execute them per **§2**/**§3**, then loop.
**`complete`** → go to **§7 Final report**. **`stalled`** → no runnable
tasks remain but some are pending; go to **§7**, the report explains
what's blocked. Token deviation never pauses the loop — purely
informational, see **§7**.

## 2. Execute a task: the TDD executor brief

For each `task_id` in the batch, delegate to **one** subagent — the
`subagent` and `model` the plan assigns to that task (do not re-decide
them). Independent tasks in the same batch are launched **in a single
message** (parallel `Task` calls, never one per turn), never more
than 3 at once (R4.S1 / AC7).

The brief is self-contained (no memory of this conversation) and
MUST require the strict TDD cycle **test → red → implementation →
green**, with **Evidence of red BEFORE** implementing and green after
(R2.S1). Its return follows the compact happy-path contract in
`assets/task-brief-detail.md` — no file bodies — except when bouncing
an ambiguity or hitting `no-red`, which keep full prose. The test
contract is never invented by the
implementer — see `assets/task-brief-detail.md` for exactly how it's
sourced from the plan's `test_contract`, or derived from the spec's
scenarios when `test_contract: null` — the brief then carries IDs plus
an extraction command, never the spec text itself (R2.S2 / AC3).

Give the executor the task's `instructions`, `expected_output_schema`,
exact file paths, and the constraints (Node ESM only, no network, don't
touch X) so it doesn't explore. It resolves **no** open decisions: if it
hits an ambiguity or trade-off, it stops and returns it — you decide.

## 3. Verify the task (deterministic — no reviewer)

When the executor returns, record the attempt. `--test-cmd` is the exact
re-run command it reported; **quote it** so it arrives as one argv token:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs complete SPECDIR <task_id> \
  --tokens <N> --test-cmd "<re-run command>" --files "<a.mjs,b.mjs,...>" \
  --rojo pass|fail --verde pass|fail [--message "<commit subject>"]
```

`--files` is REQUIRED (comma-separated touched paths) — `complete` commits only those plus its own state file, refusing to commit at all without it (R1). `--rojo`/`--verde` report the exit status of the test in each TDD phase.
Genuine evidence is `--rojo fail` **and** `--verde pass`; `--rojo pass`
means the test passed with nothing implemented — the "sin evidencia de
rojo" incidence, not success. `complete` re-runs `--test-cmd` itself and
only trusts a green it can reproduce (R3). A `{ status: "done", commit,
deviation }` means verified green, already committed on the plan branch
(R3.S1 / AC5). A `{ status: "not-done", reason, incidencia }` breaks into
three cases — see `assets/task-brief-detail.md` for the full `reason:
"no-red"` / `"rerun-failed"` / `"not-green"` breakdown and what to do for
each.

When the batch has more than one task, close all of them in a SINGLE
`complete --batch` invocation instead of one `complete` per task, cutting
orchestrator round-trips (R2.S1) — same fields as the single-task flags,
one entry per task; a task that doesn't reach green is `not-done` in its
own entry and does NOT block or revert its siblings (R2.S2/AC5). Full
command shape: `assets/task-brief-detail.md`.

Never mark a task done yourself or with git directly; only a `done` from
`complete` is authoritative, and it owns the commit.

## 4. State & the immutable plan

State lives in `SPECDIR/execution_state.json` and is written **only at task
boundaries** by the scripts — never edit it by hand, and never edit
`execution_plan.json` (it must stay byte-identical to plan-writer's output;
R5 / AC9). Real consumption (`actual_tokens`, `deviation`) lives in state,
not the plan. A half-done task never appears as `done`.

## 5. Failures and resume

See `assets/failures-and-resume.md` for the full commands and decision
rules covering the two ways execution branches off the happy path: a
failed attempt retried **exactly once** then blocked (§5.1), and resuming
a SPECDIR with existing state, which re-runs every `done` task's test
first and stops for the user on broken ground (§6). Token deviation never
blocks or pauses execution — purely informational, reported in **§7**.

## 7. Final report

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs report SPECDIR
```

Relay to the user: the branch, counts (done / blocked / skipped), tokens
**real vs estimated** (per task and, when available, the `real_cost`
total), any blocked/skipped tasks with their `incidencia`, and the spec
ACs the completed tasks declare satisfied (R-E2E.S1). This skill
guarantees the **task** level (TDD tests green); it does not run the
spec's full acceptance checklist — that's the verify stage. It does not
open a PR or merge — commits stay on the plan branch.

## Autonomy

Operate autonomously through the loop: validate, batch, delegate, verify,
commit, advance — without stepping the user through each task. Commit
happens automatically per verified task on the plan branch (never on
main/master; the git module refuses). **Stop and ask the user** only for:
an invalid plan (§0), a `no-red` incidence (§3), broken ground on resume
(§5), or a genuine ambiguity an executor bounced back that the spec/plan
can't resolve. Don't re-decide the plan's subagent/model assignments and
don't re-plan on the fly.
