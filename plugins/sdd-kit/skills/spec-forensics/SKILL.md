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
and writes `SPECDIR/forensics.json`. All resolution logic (the join,
pricing, graceful degradation) lives in `scripts/forensics.mjs` — this
skill only invokes it and relays the result.

## Invocation

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/forensics.mjs SPECDIR
```

Prints one summary line per task to stdout and always exits 0 — a task
whose real figures can't be resolved (missing `agentId`/`sessionId`, or no
matching transcript) is expected forensic information, not a failure.
The full detail is written to `SPECDIR/forensics.json`; read that file to
relay the complete report.

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
