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

`verify` is invoked with a single argument: the path to a `docs/specs/<slug>/`
directory (`SPECDIR`) — the same directory plan-writer produced the
`execution_plan.json` in and plan-executor ran against. It does not take a
plan or spec file path directly; always pass the directory.

All deterministic verify logic lives in
`${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs`, exposed as one-line CLI
subcommands — `node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs <sub> SPECDIR [args]` —
mirroring the shape `exec-tools.mjs` already uses for plan-executor. **Drive
every deterministic verify step through these one-liners. Do NOT `import`
verify-tools.mjs's exported functions (`loadSpecdir`, `groundCheck`,
`assembleReport`, `archiveIfGreen`, `manualConfirmation`, ...) into the
orchestrating agent's context, and do NOT author a throwaway driver script
that calls them — that reloads the whole ~900-line library into this
conversation for no reason the CLI doesn't already cover.** Each subcommand
prints one JSON object with a `status` field to stdout and uses process exit
codes:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs ground-check SPECDIR
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs report SPECDIR [--verdicts <path>]
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs archive SPECDIR [--verdicts <path>]
```

`ground-check` re-runs `[auto]` ACs' stored test commands against the
current working tree and prints the raw green/drift verdict. `report` runs
the full pipeline (load SPECDIR → ground check → manual-confirmation
tracking → degraded-manual routing when `execution_state.json` is absent →
incomplete-coverage explanations → token-deviation flags → assemble the
final per-AC report) and prints `{ status: 'report', allGreen, acs, deviatedTasks }`,
never blocking on interactive stdin. `archive` re-runs that same pipeline
and, only when `allGreen` is true, also archives the SPECDIR (`git mv` +
commit) to `docs/specs/archived/<slug>/`, printing
`{ status: 'archived'|'not-archived', ... }` either way — it always exits 0,
so branch on the `status`/`archived` field, not the exit code.

Internally these subcommands wrap `loadSpecdir(specDir)` (loads `spec.md`'s
AC checklist, the plan's `coverage.acs` map, and — when present —
`execution_state.json`'s per-task status), `groundCheck`,
`degradedManualRouting`, `incompleteCoverage`, `tokenDeviations`, and
`assembleReport` — useful context for interpreting a subcommand's output,
but you invoke them via the CLI, never via `import`. None of this
re-validates the plan against the spec — that already happened in
plan-executor's `init`. On a SPECDIR missing `execution_plan.json` or
`spec.md`, every subcommand exits non-zero and prints
`VerifyInputError: <message naming the missing file>` — nothing is
evaluated or archived.

## Manual AC confirmation protocol

Every `[manual]`-tagged AC (and, in degraded mode with no
`execution_state.json`, every AC regardless of tag — see R4) MUST be
confirmed **one by one, in this main conversation thread, directly with the user**:
present its `ac_id`/`description` (the probe text) and wait for an explicit
answer before moving to the next one. Only an explicit "yes, this is met" from the user justifies
calling `.confirm(ac_id)`; anything else — an explicit "no", or the
conversation moving on without an answer — leaves it `'unanswered'` or
`.reject(ac_id)`, and either way it is **not** green (R3, R3.S1, R3.S2).

This confirmation step **MUST NOT be delegated to a subagent** and **MUST
NOT be resolved unilaterally** by the orchestrating agent guessing or
inferring the answer from code/tests. A subagent has no standing to give
informed consent on the user's behalf — a `[manual]` AC exists precisely
because it needs a human judgment call that automation cannot make. If you
find yourself tempted to mark a manual AC green without an explicit
back-and-forth with the user in this thread, stop: that is a spec violation, not a shortcut.

The bookkeeping (each AC's `'unanswered'`/`'confirmed'`/`'rejected'` status
and which ones count green) is `manualConfirmation(items)` inside
`verify-tools.mjs` — pure bookkeeping with no I/O of its own; the actual
presenting and waiting for a reply happens here, in the conversation, AC
by AC, driven by this protocol. What changed is only the plumbing that
carries the resolved answers into the deterministic pipeline: after each
`[manual]` AC (or, in degraded mode, every AC — see R4) has been confirmed
or rejected in this conversation, write the resolved answers to a JSON
verdicts file —

```json
[
  { "ac_id": "AC6", "verdict": "confirmed" },
  { "ac_id": "AC9", "verdict": "rejected" }
]
```

— and pass it to `report`/`archive` via `--verdicts <path>`
(`node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs report SPECDIR --verdicts <path>`),
the same file-based convention `exec-tools.mjs complete --batch` uses. The
CLI never prompts interactively (R1.S3): an AC with no matching entry in the
file simply stays `'unanswered'` — not green — rather than the command
blocking on stdin. You do not call `manualConfirmation(items).confirm(ac_id)`
yourself; that call now happens inside the `report`/`archive` subcommand
when it reads your verdicts file.

## Final report and archiving

Verify always evaluates the **whole** checklist before concluding anything —
it never stops at the first not-green AC (that's the spec's own stated
default). Run the `report` one-liner to get it:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs report SPECDIR [--verdicts <path>]
```

which internally runs `assembleReport(checklist, groundCheckResult,
manualTracker, degradedResult, incompleteCoverageResult,
tokenDeviationsResult)` to merge every prior check into one final per-AC
verdict plus an overall `allGreen` flag, and prints
`{ status: 'report', allGreen, acs, deviatedTasks }`. Token deviations ride
along as an informational `deviatedTasks` list — they are never allowed to
turn a green AC (or the archiving decision) red (R6.S2). This same normal
flow is what closes the spec-mandated `AC-E2E`: once its backing `verifier`
task (see plan-executor's `assets/task-brief-detail.md`) is `done`,
`AC-E2E` goes green here with no manual override, no hand-patched report
field, and no user-override confirmation step — a still-`pending` verifier
task just leaves it not-green like any other AC.

Once you've confirmed the report looks right, run the `archive` one-liner
(it re-runs the same pipeline itself, so pass the same `--verdicts` file if
you used one for `report`):

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs archive SPECDIR [--verdicts <path>]
```

Only when `allGreen` is true does this internally call
`archiveIfGreen(specDir, report, { cwd })` to archive:
`git mv SPECDIR docs/specs/archived/<slug>/` followed by a commit, on
whatever branch is checked out — unlike plan-executor's per-task commits,
this is explicitly allowed to run on `main` (R7). If the destination already
exists, it refuses before running any git command and reports the
collision. If any AC isn't green, nothing is moved or committed — the
printed report instead names exactly which ACs are missing and why (drift,
blocked/skipped, not finished, rejected, unanswered, or fully
manual-degraded). Either way `archive` exits 0 — check the `status`/
`archived` field in its JSON output, not the exit code.

## Versioning-policy gate before archiving (R5)

Immediately before `archiveIfGreen` would otherwise archive an all-green SPECDIR — after the
not-all-ACs-green check, before any `git mv` — it runs the same `versioningPolicy`-driven check
`scripts/validate.sh` runs (R4), scoped to the files this spec's own commits touched. Pass
`readConfig(cwd)`'s result (`exec/config.mjs`) as `options.versioning.config`; the current branch's
prefix (e.g. `fix` in `fix/<slug>`) is auto-derived unless you pass `options.versioning.branchPrefix`
explicitly. Omit `versioning` entirely (or leave `versioningPolicy` at its `'disabled'` default) and
`archiveIfGreen` behaves exactly as R7 always has — it doesn't even run the check (R5.S1).

With `versioningPolicy: "plugin-changelog"`: a touched plugin missing its version bump and/or
changelog entry BLOCKS archiving — nothing is moved or committed, and the result names the specific
plugin and which piece is missing (R5.S3). A touched plugin whose bump+changelog are both present but
land on the wrong semver segment (per `AGENTS.md`'s change-type table) does NOT block — archiving
proceeds and the mismatch rides along as a `versioningWarnings` entry for you to surface to the user
(R5.S4). Fully compliant plugins archive with no warning at all (R5.S2).

With `versioningPolicy: "changelog-only"`: non-trivial changes with no new entry in the configured
changelog file (default `CHANGELOG.md`) BLOCK archiving the same way, reporting the missing entry
(R5.S5).
