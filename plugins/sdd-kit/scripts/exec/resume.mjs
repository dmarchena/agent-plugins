// exec/resume.mjs — T7: reanudación (re-run de tareas 'done') para la skill
// plan-executor. Node ESM puro, sin dependencias npm.
//
// Convención: los módulos lib no imprimen; devuelven datos. `rerun` se recibe
// por inyección (normalmente el de verify.mjs) para poder testear con un doble.

/**
 * Vuelve a ejecutar el test_cmd de cada tarea 'done' del plan, en el orden en
 * que aparecen en plan.tasks, y para en la primera que falle.
 * @param {object} plan - plan con tasks[].task_id en orden determinista.
 * @param {object} state - estado con state.tasks[id] = { status, test_cmd, ... }.
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
