---
name: verify
description: Use this skill whenever the user has a docs/specs/<slug>/ that plan-executor already ran and wants to check whether it's really done — e.g. "verifica esta spec", "comprueba los AC de este plan", "archiva la spec si está completa", "verify", "cierra y archiva esta feature", or any request to run the spec-driven-development verify stage over an existing SPECDIR. It consumes spec.md + execution_plan.json + (optional) execution_state.json and does NOT write the plan (plan-writer) nor execute its tasks (plan-executor); it checks the spec's Acceptance Criteria checklist AC by AC and, only when every AC is green, archives the SPECDIR to docs/specs/archived/<slug>/.
argument-hint: "[ruta a docs/specs/<slug>/]"
allowed-tools: Read, Write, Edit, Bash, Task
---

# Verify

## What this does

Fourth and last stage of the spec → plan → exec → **verify** workflow. Given
a `docs/specs/<slug>/` (`SPECDIR`) already run by plan-executor, it checks,
AC by AC, against the plain Acceptance Criteria checklist in `spec.md`,
whether the feature is really finished — re-running the stored test command
of every `done` task for `[auto]` ACs, asking the user to confirm `[manual]`
ACs one by one, and degrading the whole checklist to manual confirmation
when no `execution_state.json` exists. Only once every AC is green does it
archive the SPECDIR (`git mv` + commit) to `docs/specs/archived/<slug>/`.

## Invocation

`verify` takes a single argument: `SPECDIR` (`docs/specs/<slug>/`) — the
same directory plan-writer/plan-executor already used. Not a plan or spec
file path directly; always pass the directory.

All deterministic verify logic lives in
`${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs`, exposed as CLI
one-liners. **Do NOT `import` its functions into the orchestrating agent's
context, and do NOT author a throwaway driver script that calls them** —
drive everything through these:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs ground-check SPECDIR
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs report SPECDIR [--verdicts <path>]
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs archive SPECDIR [--verdicts <path>]
```

Each prints one `{ ok: true, data: { status, ... } }` envelope and always
exits 0 — branch on `data.status`, never the exit code. `ground-check`
re-runs `[auto]` ACs' stored tests and prints the raw green/drift verdict
under `data`. `report` runs the full pipeline and prints `{ ok: true, data:
{ status: 'report', allGreen, acs, deviatedTasks } }`, never blocking on
stdin. `archive` re-runs that pipeline and, only when `allGreen`, also
archives the SPECDIR. Full internals (`loadSpecdir`,
`groundCheck`, `assembleReport`, missing-file handling):
`assets/verify-cli-detail.md`.

## Manual AC confirmation protocol

Every `[manual]`-tagged AC (and, in degraded mode with no
`execution_state.json`, every AC — see R4) MUST be confirmed **one by one,
in this main conversation thread, directly with the user** — never
delegated to a subagent, never resolved unilaterally by guessing from
code/tests (R3, R3.S1, R3.S2). Only an explicit "yes, this is met" counts
as green; anything else stays `'unanswered'`/`'rejected'`.

Write resolved answers to a JSON verdicts file (`{ "ac_id": "AC6", "verdict":
"confirmed"|"rejected" }` entries) and pass `--verdicts <path>` to
`report`/`archive`; an AC with no matching entry stays `'unanswered'`
(R1.S3) — the CLI never prompts interactively. Full protocol and verdicts
file schema: `assets/manual-confirmation-detail.md`.

## Final report and archiving

Verify always evaluates the **whole** checklist — it never stops at the
first not-green AC. Run `report`, confirm it, then `archive` (same
`--verdicts` file). Token deviations are informational only — never turn a
green AC red (R6.S2); this same **normal report/archive flow** closes
`AC-E2E`: once its `verifier` task is `done`, it goes green here with
**no manual override**.

Only when `allGreen` does `archive` `git mv SPECDIR
docs/specs/archived/<slug>/` and commit — explicitly allowed on `main`
(R7), unlike plan-executor's per-task commits. A destination collision
refuses before any git command; a not-all-green report instead names
exactly which ACs are missing and why (drift, blocked/skipped, not
finished, rejected, unanswered, or fully manual-degraded). Full detail:
`assets/archiving-detail.md`.

## Versioning-policy gate before archiving (R5)

Immediately before archiving an all-green SPECDIR, it runs the same
`versioningPolicy`-driven check `scripts/validate.sh` runs (R4), scoped to
this spec's own touched files — `disabled` by default (no-op), or
`plugin-changelog`/`changelog-only` to block archiving on a missing version
bump or changelog entry. Full per-policy behavior:
`assets/versioning-gate-detail.md`.
