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
git, budget, resume) lives in `scripts/exec-tools.mjs` and its
`scripts/exec/` modules. This document is the orchestration layer: it tells
you which subcommand to run at each step, how to brief the executor
subagent, and how to react to each subcommand's JSON output. **The scripts
are the source of truth for behavior; you drive them, you do not
re-implement them.**

Throughout, `SPECDIR` is the `docs/specs/<slug>/` directory (the argument,
or the directory of the `execution_plan.json` argument). Every subcommand
prints one JSON object to stdout — read it and branch on `status`.

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
- **`{ ok: true, ... }`** → it printed `branch`, `branch_created`,
  `first_batch` and `total_tasks`. Announce the batch plan to the user:
  which tasks run in parallel now and which wait on dependencies (R1.S1).

If a `execution_state.json` already exists in SPECDIR, this is a resume —
skip `init` and go to **§6 Resume** instead.

## 1. The task loop

Repeat until a subcommand reports `complete`, `stalled`, or `paused`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs next SPECDIR
```

Branch on `status`:

- **`run`** → `batch` is the list of `task_id`s ready now (≤3). Execute
  them per **§2** and **§3**, then loop.
- **`paused`** (`reason: "budget"`) → see **§5.2**. Stop the loop and ask
  the user.
- **`complete`** → all tasks done. Go to **§7 Final report**.
- **`stalled`** → no runnable tasks remain but some are pending (their
  deps got blocked/skipped). Go to **§7**; the report explains what's
  blocked.

## 2. Execute a task: the TDD executor brief

For each `task_id` in the batch, delegate to **one** subagent — the
`subagent` and `model` the plan assigns to that task (do not re-decide
them). Independent tasks in the same batch are launched **in a single
message** (parallel `Task` calls, never one per turn), never more
than 3 at once (R4.S1 / AC7).

The executor's brief is self-contained (it starts with no memory of this
conversation) and MUST require the strict TDD cycle **test → red →
implementation → green**. It must return:

1. **The new test file(s)** that materialize the task's test contract.
2. **The implementation** that makes them pass.
3. **Evidence of red BEFORE** implementing (the failing test output) and
   **green AFTER** — both are required (R2.S1).
4. **The exact command to re-run the test** (e.g. `node --test path/to.test.mjs`).
5. **Its token consumption** for the task.

**Where the test contract comes from** — the contract is never invented by
the implementer:

- **Task carries a `test_contract`** (array of `{ref, assertion}` in the
  plan) → the tests must materialize exactly those assertions, one test per
  ref, and cite the `ref` ID in each test's description (R2.S1).
- **Task has no contract** (`test_contract: null`) → the brief instructs
  the executor to **derive** the contract from the `spec.md` scenarios
  referenced by the task's `source_ids` / `satisfies_acs`, and the tests
  **must cite those scenario/AC IDs** (e.g. `R2.S1`, `AC3`) in their
  descriptions (R2.S2 / AC3). Read those scenarios from `SPECDIR/spec.md`
  and quote them into the brief so the executor doesn't re-explore.

Give the executor the task's `instructions`, `expected_output_schema`,
exact file paths, and the constraints (Node ESM only, no network, don't
touch X) so it doesn't explore. It resolves **no** open decisions: if it
hits an ambiguity or trade-off, it stops and returns it — you decide.

## 3. Verify the task (deterministic — no reviewer)

When the executor returns, record the attempt. `--test-cmd` is the exact
re-run command it reported; **quote it** so it arrives as one argv token:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs complete SPECDIR <task_id> \
  --tokens <N> --test-cmd "<re-run command>" \
  --rojo pass|fail --verde pass|fail [--message "<commit subject>"]
```

`--rojo` and `--verde` report the **exit status of the test** in each TDD
phase, not a verdict. Genuine red→green evidence is `--rojo fail`
(the test **fails** before the implementation exists) **and** `--verde
pass` (it passes after). A `--rojo pass` means the test passed with nothing
implemented — that is the "sin evidencia de rojo" incidence, not success.
`complete` applies the deterministic gate: it re-runs `--test-cmd` itself
and only trusts a green it can reproduce (R3). Branch on its output:

- **`{ status: "done", commit, deviation }`** → verified green. The script
  already committed the task (test + implementation) on the plan branch and
  wrote state. Report the commit and move on (R3.S1 / AC5).
- **`{ status: "not-done", reason, incidencia }`** → not green. Three cases:
  - `reason: "no-red"` (`incidencia: "sin evidencia de rojo"`) — the test
    passed without implementing anything. **Do not** count this as a failed
    attempt or retry blindly: it's flagged for the **user's decision**
    (R2.S3 / AC4). Surface it.
  - `reason: "rerun-failed"` — the executor claimed green but the
    orchestrator's re-run failed; `rerun_output` holds the failing output.
  - `reason: "not-green"` — the executor itself didn't report green.

  For the last two, this counts as a failed attempt → go to **§5.1**.

Never mark a task done yourself or with git directly; only a `done` from
`complete` is authoritative, and it owns the commit.

## 4. State & the immutable plan

State lives in `SPECDIR/execution_state.json` and is written **only at task
boundaries** by the scripts — never edit it by hand, and never edit
`execution_plan.json` (it must stay byte-identical to plan-writer's output;
R5 / AC9). Real consumption (`actual_tokens`, `deviation`) lives in state,
not the plan. A half-done task never appears as `done`.

## 5. Failures and budget

### 5.1 One retry, then block the DAG branch

On a genuine failed attempt (`rerun-failed` / `not-green`), retry the task
**exactly once**: re-delegate to the same subagent with the failure
diagnosis (the `rerun_output` / test failure) added to the brief, then run
`complete` again.

If the retry also fails to reach a verified green, block it:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs block SPECDIR <task_id>
```

This marks the task `blocked` and its transitive dependents `skipped`;
independent DAG branches keep going. Resume the loop at **§1** — `next`
will route around the blocked subtree (R6.S1 / AC10).

### 5.2 Budget pause

`next` returns `{ status: "paused", reason: "budget", real, estimated,
at_task }` when accumulated real tokens exceed **2×** the estimate of the
tasks already run. The pause is recorded in state (`pause`). **Stop the
loop** and ask the user whether to refine the plan (back to plan-writer) or
continue anyway (R6.S2 / AC11). Only resume on their say-so.

## 6. Resume

When invoked on a SPECDIR that already has `execution_state.json` (after a
pause, a block, or a closed session), resume instead of `init`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs resume SPECDIR
```

It re-runs the test command of every `done` task to check the ground is
still valid before launching anything new (R7):

- **`{ status: "resumed", next_batch }`** → ground holds; announce the next
  batch and re-enter the loop at **§1** (R7.S1 / AC12).
- **`{ status: "ground-broken", brokenTask, brokenTest }`** (exit 4) → a
  previously-green test now fails; the working tree changed under us. STOP,
  name the broken task/test, and hand the decision to the user. Launch
  **no** new tasks (R7.S2 / AC13).

## 7. Final report

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs report SPECDIR
```

Relay to the user: the branch, counts (done / blocked / skipped), tokens
**real vs estimated** (total and per task with deviation), any blocked or
skipped tasks with their `incidencia`, whether a budget pause fired, and
the spec ACs the completed tasks declare satisfied (R-E2E.S1). This skill
guarantees the **task** level (TDD tests green); it does not run the spec's
full acceptance checklist — that's the verify stage. It does not open a PR
or merge — commits stay on the plan branch.

## Autonomy

Operate autonomously through the loop: validate, batch, delegate, verify,
commit, advance — without stepping the user through each task. Commit
happens automatically per verified task on the plan branch (never on
main/master; the git module refuses). **Stop and ask the user** only for:
an invalid plan (§0), a `no-red` incidence (§3), a budget pause (§5.2),
broken ground on resume (§6), or a genuine ambiguity an executor bounced
back that the spec/plan can't resolve. Don't re-decide the plan's
subagent/model assignments and don't re-plan on the fly — if the plan is
insufficient, stop and remit to plan-writer.

---

The scripts in `scripts/exec/` (with their tests in `test/exec/`) and
`scripts/exec-tools.mjs` are the source of truth for what each subcommand
does; the state shape is fixed by `assets/execution_state.schema.json`.
This document orchestrates them — it does not override them.
