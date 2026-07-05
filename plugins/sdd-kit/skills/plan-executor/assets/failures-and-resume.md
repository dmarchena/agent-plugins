# Plan Executor — failures, budget, and resume (full detail)

Referenced from `SKILL.md` §5 ("Failures, budget, and resume"). These are
the off-the-happy-path branches of the executor loop: a task failing twice,
the token budget getting exceeded, and resuming a SPECDIR that already has
state on disk. They don't fire on every run, so the exact commands and
decision rules live here instead of in the always-loaded body.

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

### 5.2 Budget pause

`next` returns `{ status: "paused", reason: "budget", real, estimated,
at_task }` when accumulated real tokens exceed **2×** the estimate of the
tasks already run. The pause is recorded in state (`pause`). **Stop the
loop** and ask the user whether to refine the plan (back to plan-writer) or
continue anyway (R6.S2 / AC11). Only resume on their say-so.

## 6. Resume

When invoked on a SPECDIR that already has `execution_state.json` (after a
pause, a block, or a closed session), resume instead of `init`:

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
