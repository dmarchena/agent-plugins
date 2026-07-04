---
name: plan-writer
description: Use this skill whenever the user has a finished spec.md (spec-writer format) and wants to turn it into an execution plan before any code gets written — e.g. "genera el plan de ejecución de esta spec", "convierte el spec en tareas", "dame el DAG de tareas de esta feature", "plan-writer", or any request for a spec-driven-development stage plan / task breakdown from an existing spec. It consumes an already-written spec.md and does NOT generate one (that's spec-writer) and does NOT execute the resulting tasks (that's a later exec stage) — it only produces the execution_plan.json in between.
argument-hint: "[ruta al spec.md]"
allowed-tools: Read, Write, Edit, Bash
---

# Plan Writer (spec → execution plan)

## What this does

Second stage of a spec → plan → exec → verify workflow. Takes a `spec.md`
written in spec-writer's format and produces `execution_plan.json` next to
it — in the same `docs/specs/<slug>/` directory the spec lives in — a
Directed Acyclic Graph (DAG) of atomic, agent-assigned tasks that a
future orchestrator (`exec-runner`) can run without reinterpreting the spec.
This skill deliberately does **not** execute any task and does **not** edit
the spec — it only reads it and writes the plan.

## Coupled ingestion (no best-effort)

The input spec **must** already be in spec-writer's structured format:
stable requirement IDs (`R<n>`), scenarios (`R<n>.S<m>`), and a
`## Acceptance Criteria` section. This skill does not degrade gracefully
into interpreting free-form prose — if the structure isn't there, it fails
loudly instead of guessing.

Always run this first, before touching anything else:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/plan-tools.mjs inspect-spec <spec.md>
```

- **Exit code ≠ 0** → STOP. Report the exact structural element the
  validator says is missing (e.g. no `R<n>` IDs found, or no `## Acceptance
  Criteria` section). Do not write any plan, not even a partial one.
- **Exit code 0** → show the user the detected counts, in the form "N
  requirements, M ACs detected", before moving on.

## Decompose into atomic tasks

Derive one or more tasks per requirement/scenario. Each task must represent
exactly **one verifiable deliverable**, carry a unique `task_id`, and list
`source_ids` referencing at least one spec ID (`R<n>` or `R<n>.S<m>`) it
derives from.

When a single requirement has independent scenarios — deliverables that
don't depend on each other — split them into **separate tasks**. Never fold
independent deliverables into one task; a task has exactly one
`expected_output_schema`, so if a requirement would need more than one,
that's the signal to split it.

## Derive the dependency DAG

Build each task's `dependencies` array from the spec's `Depende de:` lines:
if requirement R depends on Rx, the task(s) covering R depend on the
task(s) covering Rx. Requirements with `Depende de: —` produce tasks with
`dependencies: []`. The resulting graph must be acyclic — the validator
checks this, but don't rely on it to catch a cycle you could have avoided
by following the spec's dependency lines directly.

## Assign an agent per task

Read `assets/agent-roles.md` — it's the fixed catalog of `agent_type` →
`subagent` → `model` mappings. For every task, assign:

- `agent_type` — the abstract, portable role (`researcher`,
  `terminal_operator`, `code_writer`, `doc_writer`, `reviewer`, `architect`).
- `subagent` — its concrete Claude Code mapping (e.g. `Explore`,
  `general-purpose`, `Plan`).
- `model` — `haiku`, `sonnet`, or `opus`.
- `justification` — one line explaining the pick.

Apply the most-austere-that-qualifies rule: mechanical, low-judgment work
(search, inventory, extraction, mechanical checks) → `haiku`; bounded
implementation with clear acceptance criteria → `sonnet`; design, critical
review, or trade-off decisions → `opus`. Don't default everything to the
same model — the catalog exists precisely so each task gets sized to what
it actually needs.

## Write granular instructions

Each task's `instructions` field must reference spec IDs (`R<n>.S<m>`,
`AC<n>`) instead of copying their text — the executor reads the spec
itself; duplicating it here just drifts out of sync. When a task has
dependencies, `instructions` must also name the specific prior `task_id`
whose output it consumes. A task with `dependencies: []` must not reference
any `task_id` as prior context — don't invent dependencies that aren't
there just to sound thorough.

## Output contract per task

Every task needs:

- `expected_output_schema` — a non-empty string describing the exact
  artifact or format the task produces (not just "the code" — be specific
  enough that the executor and a later verifier can both recognize done).
- `satisfies_acs` — an array with at least one `AC<n>` from the spec that
  this task's output satisfies.

## Test contract per task

Every task also needs a `test_contract` field — the external source of truth
the exec stage's TDD executor materializes its tests from, which is what
makes a per-task review subagent unnecessary:

- **`agent_type: code_writer` tasks** — a non-empty array of cases, each
  `{ ref, assertion }`:
  - `ref` — an existing ID from the source spec (`R<n>.S<m>` or `AC<n>`)
    that this task derives from; it must match one of the spec's real IDs,
    never an invented one.
  - `assertion` — an observable assertion in prose: what should be
    checkable, not how to check it. Same rule as `instructions`: reference
    spec IDs, never copy the spec's text verbatim. Code and test-file names
    are forbidden in `assertion`.
- **Any other `agent_type`** — `test_contract: null`.

Derive the cases from the scenarios (`R<n>.S<m>`) and ACs the task already
lists in `satisfies_acs` — don't invent cases unrelated to what the task
covers.

## Traceability / coverage (hard gate)

Every `R<n>` and every `AC<n>` in the spec must end up covered by at least
one task. Materialize this in the plan's `coverage` field (maps of
requirement ID → covering `task_id`s, and AC ID → covering `task_id`s).

This is a hard gate, not a nice-to-have: if any ID would be left uncovered,
STOP and report exactly which ID before writing anything. Never write a
plan that silently drops a requirement or AC.

## Token budget estimate

Give every task an `estimated_tokens` integer, and the plan an
`estimated_tokens_total`. Set `confidence: "low"` on the plan — this is a
baseline for measuring deviation later, not a commitment. Set
`actual_tokens` and `deviation` to `null` on every task and leave them
there: the plan is immutable once the exec stage starts, so these fields
never get filled in on the plan itself. Real token consumption and
deviation are recorded separately, in the exec stage's
`execution_state.json` — not in this plan.

## Write and validate safely

Follow `assets/execution_plan.schema.json` for the exact shape of the
output — don't improvise field names or structure.

To avoid ever leaving an invalid plan on disk:

1. Write the candidate plan to `execution_plan.json.tmp` in the **same
   directory** as the input spec.
2. Run:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/plan-tools.mjs check-plan <spec.md> execution_plan.json.tmp
   ```
3. **Exit 0** → rename the tmp file to `execution_plan.json`.
4. **Exit ≠ 0** → delete the tmp file, report the validator's concrete
   error (schema field/rule, cycle, or coverage gap), and do not leave
   `execution_plan.json` in an invalid state.

Once written, show the user a short summary (task count, agent/model mix,
coverage) and confirm.

## Autonomy

Operate autonomously: read the spec and write the plan without stepping
the user through it question by question. Only stop for a structural
failure (ingestion, a dependency cycle, a coverage gap, or schema
validation) or for a genuine ambiguity that can't be resolved from the
spec's own content. Do not re-interview the user — the spec already
carries everything this skill needs.

---

The exact shape of a valid plan is defined by
`assets/execution_plan.schema.json`; the `plan-tools.mjs check-plan`
validator, not this document, is the source of truth for "valid plan".
