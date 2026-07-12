---
name: spec-forensics
description: Use this skill whenever the user has a docs/specs/<slug>/ that plan-executor already ran (or resumed/paused) and wants the REAL per-task token/cost figures instead of the plan's estimates — e.g. "forensics", "coste real por tarea", "cuánto costó de verdad esta tarea", "dame el desglose orquestador vs subagentes", "cuánto se desvió el gasto real del estimado", or any request to inspect real spend/tokens for an already-run execution_state.json. It consumes execution_state.json and does NOT plan (plan-writer), execute (plan-executor), or verify ACs (verify) — it only reports.
argument-hint: "[ruta a docs/specs/<slug>/]"
allowed-tools: Read, Bash
---

# Spec Forensics

## What this does

Read-only forensics stage alongside spec → plan → exec → verify: given a
`docs/specs/<slug>/` (`SPECDIR`) whose `execution_state.json` already
exists, resolves each task's REAL token/cost figures by joining its
persisted `agentId`/`sessionId` against the matching session transcript,
and writes `SPECDIR/forensics.json` enriched with a `signals` block
(`per_model`, `orchestrator_share`, `orchestrator_token_ratio`,
`deviations`, `incidences`, `session_count`). All resolution logic (the
join, pricing, signal computation, graceful degradation) lives in
`scripts/forensics.mjs` — this skill invokes it, then runs its own
**judgment layer** on top (below) that writes `SPECDIR/forensics-analysis.md`
automatically on every run — the user never has to ask for it separately.

## Invocation

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/forensics.mjs SPECDIR
```

Prints one `{ ok: true, data: { tasks, orchestrator, subagents_total,
pause_timeline, signals, ... } }` envelope to stdout and always exits 0 — a
task whose real figures can't be resolved (missing `agentId`/`sessionId`, or
no matching transcript) is expected forensic information reflected as
`resolved: false` in `data.tasks`, not a failure. The full detail is also
written to `SPECDIR/forensics.json` (same shape as `data`); read that file
to relay the complete report.

## Relaying the result

Summarize `forensics.json` for the user:

- **Per task**: `real_tokens`/`real_cost_usd` vs `estimated_tokens` and
  `deviation_real`, or "unresolved" when `resolved: false`.
- **Orchestrator vs subagents**: the top-level `orchestrator` and
  `subagents_total` blocks (tokens + USD each).
- **`pause_timeline`**: if non-empty, call out each pause point
  (`at_task`, accumulated `real_tokens`) so the user sees where the run
  paused.
- **`incomplete`**: if present and `true`, say so clearly up front along
  with `incomplete_reason` — this means the join found nothing to work
  with for the whole run (e.g. no `agentId` recorded on any task), not
  that any single task failed.

Do not recompute or second-guess these figures — `forensics.json` is
already the source of truth; just surface it.

## Judgment layer: writing `forensics-analysis.md`

After `forensics.mjs` returns the enriched `forensics.json` (with its
`signals` block), this skill's judgment layer runs **automatically, every
run** — never on request only — reading `SPECDIR/spec.md`,
`SPECDIR/execution_plan.json`, and the enriched `SPECDIR/forensics.json`,
and composing `SPECDIR/forensics-analysis.md`. This step happens even when
`forensics.json` is degraded (see below) — the analysis doc is always
produced, never skipped.

`forensics-analysis.md` has two kinds of content, kept in clearly separate
sections:

1. **Deterministic cost-reconstruction section** (heading text containing
   "Deterministic"/"Determinista") — figures copied or trivially derived
   from `forensics.json`, never estimated or guessed. Must include at
   least:
   - `Total USD: $<figure>` — `orchestrator.real_cost_usd +
     subagents_total.real_cost_usd`.
   - `Orchestrator share: <figure>%` — `signals.orchestrator_share` (or
     an explicit N/A line when it's `null`, e.g. a zero-cost run).
   These two anchor figures must numerically match `forensics.json`
   exactly (within float tolerance) — this is a hard invariant, not a
   suggestion.
2. **Judgment sections** (heading text containing
   "Judgment"/"Juicio"), placed *after* the deterministic section —
   this is where interpretation lives: **opportunities** (e.g. cheaper
   model/method for a task, parallelizable work that ran serially) and
   **bad practices** (e.g. an orchestrator share that's too high, a
   deviation that suggests a bad estimate or wasted retries) as bullet
   findings.

**Signal-anchoring rule**: every judgment finding must cite, by name, a
signal that actually exists in `forensics.json` — a `signals` key
(e.g. `orchestrator_share`), a `signals.per_model` model name, or a
`signals.deviations`/`signals.incidences` `task_id`. Never write a
judgment bullet that doesn't name a real signal — that's a fabricated
finding, not an anchored one.

### Degraded case (unresolved tasks / incomplete join)

When `forensics.json` has one or more tasks with `resolved: false`, or is
itself marked `incomplete: true`, `forensics-analysis.md` is still written
(never skipped) — but the deterministic section must handle those tasks
without inventing numbers for them:

- Every unresolved task is explicitly marked as unresolved (e.g.
  "unresolved" / "sin resolver" / `resolved: false`) wherever it's
  mentioned.
- No fabricated real-figures (a `$` amount, or a "real tokens"/"real
  cost" number) are ever written for an unresolved task — plan estimates
  (`estimated_tokens`) are fine to show, real figures are not, since
  there aren't any.
- The document states **explicitly** that the join is incomplete (a
  line containing "incomplete"/"incompleto") whenever any task is
  unresolved or `forensics.json.incomplete === true` — this must not be
  left implicit.

### Validating the written doc

Before considering the run complete, invoke the CLI entry point:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/forensics-analysis-validate.mjs SPECDIR
```

It reads the just-written `SPECDIR/forensics-analysis.md` and the parsed
`SPECDIR/forensics.json` itself and prints a `{ ok: true, data: { ok:
boolean, errors: string[] } }` envelope to stdout — read `data.ok`/
`data.errors` from it to confirm the deterministic/judgment separation,
the anchor figures, the signal-anchoring rule, and the degraded-case
handling above all hold. It never composes or rewrites the doc itself; if
`data.ok` is `false`, fix `forensics-analysis.md` and re-validate before
relaying results to the user.
