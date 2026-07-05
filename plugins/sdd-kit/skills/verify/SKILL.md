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
See the full spec at `docs/specs/verify/spec.md`.

## Invocation

`verify` is invoked with a single argument: the path to a `docs/specs/<slug>/`
directory (`SPECDIR`) — the same directory plan-writer produced the
`execution_plan.json` in and plan-executor ran against. It does not take a
plan or spec file path directly; always pass the directory.

All deterministic loading/parsing logic lives in
`${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs`, starting with
`loadSpecdir(specDir)`, which loads `spec.md`'s AC checklist, the plan's
`coverage.acs` map, and (when present) `execution_state.json`'s per-task
status. It does not re-validate the plan against the spec — that already
happened in plan-executor's `init`. When `execution_plan.json` or `spec.md`
is missing from `SPECDIR`, `loadSpecdir` throws before evaluating or
archiving anything, naming the exact missing file.

## Manual AC confirmation protocol

Every `[manual]`-tagged AC (and, in degraded mode with no
`execution_state.json`, every AC regardless of tag — see R4) MUST be
confirmed **one by one, in this main conversation thread, directly with the
user**. For each such AC: present its `ac_id` and its `description` (the
probe text) to the user, and wait for an explicit answer before moving to
the next one. Only an explicit "yes, this is met" from the user justifies
calling `.confirm(ac_id)`; anything else — an explicit "no", or the
conversation moving on without an answer — means it stays `'unanswered'` or
becomes `.reject(ac_id)`, and either way it is **not** green (R3, R3.S1,
R3.S2).

This confirmation step **MUST NOT be delegated to a subagent** and **MUST
NOT be resolved unilaterally** by the orchestrating agent guessing or
inferring the answer from code/tests. A subagent has no standing to give
informed consent on the user's behalf, and re-running a test or reading code
is exactly what `[auto]` ACs are for — a `[manual]` AC exists precisely
because it needs a human judgment call that automation cannot make. If you
find yourself tempted to mark a manual AC green without an explicit
back-and-forth with the user in this thread, stop: that is a spec violation,
not a shortcut.

The bookkeeping for this (tracking each AC's `'unanswered'` /
`'confirmed'` / `'rejected'` status and computing which ones count green) is
`manualConfirmation(items)` in `verify-tools.mjs` — it is pure bookkeeping
with no I/O of its own; the actual presenting-to-the-user and waiting for a
reply happens here, in the conversation, AC by AC, driven by this protocol.

## Final report and archiving

Verify always evaluates the **whole** checklist before concluding anything —
it never stops at the first not-green AC (that's the spec's own stated
default). `assembleReport(checklist, groundCheckResult, manualTracker,
degradedResult, incompleteCoverageResult, tokenDeviationsResult)` in
`verify-tools.mjs` merges every prior check (`groundCheck`,
`manualConfirmation`, `degradedManualRouting`, `incompleteCoverage`,
`tokenDeviations`) into one final per-AC verdict plus an overall `allGreen`
flag. Token deviations ride along as an informational `deviatedTasks` list —
they are never allowed to turn a green AC (or the archiving decision) red
(R6.S2).

Only when `allGreen` is true does `archiveIfGreen(specDir, report, { cwd })`
archive: `git mv SPECDIR docs/specs/archived/<slug>/` followed by a commit,
on whatever branch is currently checked out — no new branch is created, and
unlike plan-executor's per-task commits, this is explicitly allowed to run
on `main` (R7). If the destination already exists, it refuses before running
any git command and reports the collision. If any AC isn't green, nothing is
moved or committed — the report instead names exactly which ACs are missing
and why (drift, blocked/skipped, not finished, rejected, unanswered, or fully
manual-degraded), so the user knows precisely what's left before verify can
close out the SPECDIR.
