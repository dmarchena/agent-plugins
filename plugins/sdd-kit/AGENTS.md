# sdd-kit

A spec-driven development kit: a multi-skill plugin that carries a feature
from a rough idea to an executable task graph **before** any code gets
written, via a fixed chain — **spec → plan → exec → verify** — where each
stage's output is the next stage's input.

This plugin currently ships the first two stages:

- **[`spec-writer`](skills/spec-writer/SKILL.md)** — interview → `spec.md`.
- **[`plan-writer`](skills/plan-writer/SKILL.md)** — `spec.md` →
  `execution_plan.json`.

The remaining stages (`exec-runner` executing the plan, and a `verify` step
running the spec's acceptance criteria against the result) are future work;
this plugin only covers the spec and plan artifacts.

## The chain: spec → plan → exec → verify

1. **spec** (`spec-writer`) — runs a structured, one-question-at-a-time
   interview and writes a single `spec.md`: purpose, scope/non-goals,
   functional requirements with Given/When/Then scenarios, a technical
   section, and a flat acceptance-criteria checklist. It deliberately stops
   here — no plan, no code.
2. **plan** (`plan-writer`) — reads that `spec.md` and derives
   `execution_plan.json`: a DAG of atomic, agent-assigned tasks with
   dependencies, granular instructions, an output contract, and full
   traceability back to the spec's requirements and acceptance criteria. A
   deterministic script validates the result — it does not execute any
   task or touch the spec.
3. **exec** *(future)* — an orchestrator runs the plan's tasks in
   dependency order, dispatching each to its assigned subagent/model.
4. **verify** *(future)* — checks the executed work against the spec's
   acceptance-criteria checklist, then archives the feature's artifacts (see
   "Where the artifacts live" below).

## Where the artifacts live

Every feature gets one directory, **`docs/specs/<slug>/`** (a kebab-case
slug from the feature name), holding the whole chain's artifacts together:

- `spec-writer` writes `docs/specs/<slug>/spec.md`.
- `plan-writer` writes `docs/specs/<slug>/execution_plan.json` alongside it.

Grouping by feature (not by artifact type) follows the standard SDD layout —
spec-kit and Kiro both keep a feature's spec, plan and tasks together under
`specs/<feature>/`, where "spec" means the whole bundle. The full rationale,
and why `docs/` rather than a repo-root `specs/`, is recorded in
[ADR 0001](docs/adr/0001-artifact-location.md).

While the feature is in progress that directory is committed on the feature
branch — git is the handoff between stages and sessions, not the conversation.

**On completion** — every acceptance criterion green — the directory is
archived: moved to **`docs/specs/archived/<slug>/`** and committed. A spec is
the durable record of intended behavior and its acceptance criteria, worth
keeping for later regressions and audits; but a finished spec shouldn't sit
in the active `docs/specs/` path, where every subsequent plan/verify session
would reload it. Archiving preserves the history without the context cost —
it is neither deleted nor left in place. The `verify` stage performs this
move once it lands; until then it's a manual `git mv`.

## Shared ID format

Both skills key off the same requirement/scenario ID scheme so later stages
can reference structure instead of re-quoting prose:

- `R<n>` — a functional requirement, with a `Depende de:` line stating its
  behavioral dependencies (or `—` if independent).
- `R<n>.S<m>` — a Given/When/Then scenario under that requirement.
- `AC<n>` — a flat acceptance-criteria entry, each pointing back to the
  scenario it checks, tagged `[auto]`/`[manual]`.

`spec-writer` produces these IDs; `plan-writer` consumes them — to
partition independent requirements into parallel tasks, to sequence
dependent ones, and to guarantee every `R<n>` and `AC<n>` is covered by at
least one task before writing a plan.

## Skills

| Skill | Input → Output | Details |
|-------|-----------------|---------|
| `spec-writer` | feature idea (interview) → `spec.md` | [skills/spec-writer/SKILL.md](skills/spec-writer/SKILL.md) |
| `plan-writer` | `spec.md` → `execution_plan.json` | [skills/plan-writer/SKILL.md](skills/plan-writer/SKILL.md) |

`plan-writer` additionally ships:
- `skills/plan-writer/assets/execution_plan.schema.json` — the published
  JSON Schema for a valid plan.
- `skills/plan-writer/assets/agent-roles.md` — the `agent_type` →
  `subagent` → `model` catalog used to staff each task.
- `scripts/plan-tools.mjs` — a deterministic validator
  (`inspect-spec <spec.md>`, `check-plan <spec.md> <plan.json>`) that both
  the skill and CI rely on as the source of truth for "valid input" /
  "valid plan".

## Agent compatibility

This plugin is Markdown-only and agent-agnostic. It targets Claude Code's
skill format (`SKILL.md` + `assets/`), but each skill's instructions assume
no Claude-specific runtime beyond a general "coding agent that can read/write
files, run a script, and (for `spec-writer`) ask the user questions" — the
`SKILL.md` body of each skill documents its full procedure.
