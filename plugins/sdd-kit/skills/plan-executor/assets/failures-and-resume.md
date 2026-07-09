# Plan Executor — failures and resume (full detail)

Referenced from `SKILL.md` §5 ("Failures and resume"). These are the
off-the-happy-path branches of the executor loop: a task failing twice,
and resuming a SPECDIR that already has state on disk. They don't fire on
every run, so the exact commands and decision rules live here instead of
in the always-loaded body.

Token deviation (real tokens vs. estimate) does **not** belong here: it
never blocks, pauses, or otherwise branches the loop off the happy path —
it's purely informational, reported per task in `complete`'s `deviation`
field and for the whole run in `report`'s `real_cost`/`real_cost_over_budget`
(see `exec/budget.mjs`'s `realCostOverBudget()`).

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
independent DAG branches keep going. Resume the loop at §1 of the main
document — `next` will route around the blocked subtree (R6.S1 / AC10).

## 6. Resume

When invoked on a SPECDIR that already has `execution_state.json` (after a
block or a closed session), resume instead of `init`:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/exec-tools.mjs resume SPECDIR
```

It re-runs the test command of every `done` task to check the ground is
still valid before launching anything new (R7):

- **`{ status: "resumed", next_batch }`** → ground holds; announce the next
  batch and re-enter the loop at §1 of the main document (R7.S1 / AC12).
- **`{ status: "ground-broken", brokenTask, brokenTest }`** (exit 4) → a
  previously-green test now fails; the working tree changed under us. STOP,
  name the broken task/test, and hand the decision to the user. Launch
  **no** new tasks (R7.S2 / AC13).
