# Verify — final report and archiving (full detail)

Referenced from `SKILL.md`'s "Final report and archiving" section.

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
`{ ok: true, data: { status: 'report', allGreen, acs, deviatedTasks } }`.
Token deviations ride
along as an informational `deviatedTasks` list — they are never allowed to turn a green AC (or the archiving decision) red (R6.S2). This same normal flow
is what closes the spec-mandated `AC-E2E`: once its backing `verifier`
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
collision. If any AC isn't green, nothing is moved or committed — the report instead names exactly which ACs are missing and why (drift, blocked/skipped, not finished, rejected, unanswered, or fully
manual-degraded). Either way `archive` exits 0 — check the `data.status`/
`data.archived` field in its `{ ok, data }` envelope, not the exit code.
