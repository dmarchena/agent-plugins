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
completion, a block, or a pause. Token economy is the point: each task
runs a **single TDD executor**, not a "developer + reviewer" pair, and
the orchestrator verifies green **deterministically** by re-running the
test itself — no reviewer tokens.

Deterministic logic (validate, DAG batching, state, verify-by-rerun, git,
budget, resume) lives in `scripts/exec-tools.mjs`/`scripts/exec/` (tests
in `test/exec/`; state shape in `assets/execution_state.schema.json`) —
the scripts are authoritative, you drive them, not re-implement them.
`SPECDIR` = the `docs/specs/<slug>/` directory. Every subcommand prints
one `{ ok, data }` envelope — read `data` and branch on `data.status`.

## 0. Hard gate: validate before touching anything

Always run this first:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs init SPECDIR
```

`init` validates the plan against its spec (schema + full requirement/AC
coverage, via plan-writer's `check-plan`), then creates state and the
branch.

- **Exit ≠ 0 / `PLAN_INVALIDO`** → STOP. Report the failing field/ID the
  validator named; tell the user to fix the plan with plan-writer.
  Do **not** create a branch, state, or launch any subagent (R1.S2 / AC1).
- **`{ ok: true, data: {...} }`** → announce the batch plan: tasks
  running now vs waiting on dependencies (R1.S1).

If `execution_state.json` already exists, it's a resume — skip `init`,
go to `assets/failures-and-resume.md` §6 instead.

## 1. The task loop

Repeat until a subcommand reports `complete` or `stalled`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs next SPECDIR
```

Branch on `data.status`: **`run`** →
`data.batch` is the list of `task_id`s ready now (≤3); execute per
**§2**/**§3**, then loop.
**`complete`** → **§7**. **`stalled`** → no runnable tasks but some
pending; **§7** explains what's blocked. Token deviation never pauses
the loop — informational, see **§7**.

## 2. Execute a task: the TDD executor brief

For each `task_id` in the batch, delegate to **one** subagent — the
`subagent` and `model` the plan assigns to that task (do not re-decide
them). Independent tasks in the same batch are launched **in a single
message** (parallel `Task` calls, never one per turn), never more
than 3 at once (R4.S1 / AC7).

Once a `Task` call returns, capture its `agentId` from the **`Task`
tool result itself** (`toolUseResult.agentId`, the hash naming
`subagents/agent-<agentId>.jsonl`) — never from the subagent's
returned text. Retain it per `task_id`: `complete` in **§3** requires
either this id or an explicit `--no-agent-id "<reason>"` acknowledgment —
there is no other way to skip it.

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
  --tokens <N> --agent-id <id> --test-cmd "<re-run command>" --files "<a.mjs,b.mjs,...>" \
  --rojo pass|fail --verde pass|fail [--message "<commit subject>"]
```

Each flag has one rule — read them independently, they don't combine:

- **`--agent-id <id>`** — the id captured in **§2**. Required for a
  delegated task. Provide this OR `--no-agent-id` below; provide neither
  and `complete` rejects the call up front: exit non-zero,
  `error.reason` starting `MISSING_AGENT_ID: <task_id>`, and nothing
  written — no state entry, no commit, state file and git log unchanged.
- **`--no-agent-id "<reason>"`** — use ONLY when the id genuinely
  couldn't be recovered from the `Task` tool result. Takes the place of
  `--agent-id`. `complete` then proceeds (the pre-existing graceful
  degrade): the state entry's `agentId` is `null` and `incidencia`
  contains `<reason>`.
- **`--files "<a.mjs,b.mjs,...>"`** — comma-separated touched paths.
  Required (R1); `complete` commits only these plus its own state file,
  and refuses to commit at all without this flag.
- **`--rojo pass|fail` / `--verde pass|fail`** — the test's exit status
  in each TDD phase. Genuine evidence is `--rojo fail` **and**
  `--verde pass`; `--rojo pass` means the test passed with nothing
  implemented yet — the "sin evidencia de rojo" incidence, not success.

`complete` re-runs `--test-cmd` itself and only trusts a green it can
reproduce (R3). `data.status: "done"` (with commit, deviation) means
verified green, already committed on the plan branch (R3.S1 / AC5).
`data.status: "not-done"` (with reason, incidencia) breaks into three
cases — see `assets/task-brief-detail.md` for the full `reason:
"no-red"` / `"rerun-failed"` / `"not-green"` breakdown and what to do
for each.

When the batch has more than one task, close all of them in a SINGLE
`complete --batch` invocation instead of one `complete` per task, cutting
orchestrator round-trips (R2.S1) — same fields as above, one entry per
task:

- Each entry needs `agent_id` OR `no_agent_id: "<reason>"` — same rule as
  `--agent-id`/`--no-agent-id` above, just spelled as batch-entry fields.
- An entry with neither rejects the WHOLE batch before anything lands:
  nothing recorded, nothing committed, matching the batch's `--files`
  guard (all-or-nothing).
- A task that doesn't reach green is `not-done` in its own entry and does
  NOT block or revert its siblings (R2.S2/AC5).

Full command shape: `assets/task-brief-detail.md`.

Never mark a task done yourself or with git directly; only a `done` from
`complete` is authoritative, and it owns the commit.

## 4. State & the immutable plan

State: `SPECDIR/execution_state.json`, written **only at task
boundaries** by the scripts — never edit it by hand, and never edit
`execution_plan.json` (must stay byte-identical to plan-writer's output;
R5 / AC9). Real consumption (`actual_tokens`, `deviation`) lives in
state, not the plan. A half-done task never appears as `done`.

## 5. Failures and resume

Full commands/rules: `assets/failures-and-resume.md`. Two branches off
the happy path: a failed attempt retried **exactly once** then blocked
(§5.1); resuming a SPECDIR re-runs every `done` task's test first and
stops on broken ground (§6). Token deviation never blocks/pauses — only
informational, reported in **§7**.

## 7. Final report

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs report SPECDIR
```

Relay: branch, counts (done/blocked/skipped), tokens **real vs
estimated** (per task, plus `real_cost` total when available),
blocked/skipped tasks with `incidencia`, and the spec ACs the completed
tasks satisfy (R-E2E.S1). This skill only
guarantees the **task** level (TDD tests green); it does not run the
spec's full acceptance checklist — that's the verify stage. It does not
open a PR or merge — commits stay on the plan branch.

## Autonomy

Operate autonomously: validate, batch, delegate, verify, commit, advance
— no stepping the user through each task. Commit
happens automatically per verified task on the plan branch (never on
main/master; the git module refuses). **Stop and ask the user** only
for: an invalid plan (§0), a `no-red` incidence (§3), broken ground on
resume (§5), or a genuine ambiguity the spec/plan can't resolve. Don't
re-decide subagent/model assignments; don't re-plan on the fly.
