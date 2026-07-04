// exec/resume.mjs — T7: resume (re-run of 'done' tasks) for the
// plan-executor skill. Pure Node ESM, no npm dependencies.
//
// Convention: lib modules do not print; they return data. `rerun` is
// received via injection (normally the one from verify.mjs) so it can be
// tested with a test double.

/**
 * Re-runs the test_cmd of every 'done' task in the plan, in the order they
 * appear in plan.tasks, stopping at the first one that fails.
 * @param {object} plan - plan with tasks[].task_id in deterministic order.
 * @param {object} state - state with state.tasks[id] = { status, test_cmd, ... }.
 * @param {{rerun: (testCmd: string) => {passed: boolean, output: string}}} deps
 * @returns {{ok: boolean, brokenTask: string|null, brokenTest: string|null}}
 */
export function resumeGround(plan, state, { rerun }) {
  for (const task of plan.tasks) {
    const entry = state.tasks[task.task_id];
    if (!entry || entry.status !== 'done' || entry.test_cmd == null) continue;

    const result = rerun(entry.test_cmd);
    if (result.passed === false) {
      return { ok: false, brokenTask: task.task_id, brokenTest: entry.test_cmd };
    }
  }
  return { ok: true, brokenTask: null, brokenTest: null };
}
