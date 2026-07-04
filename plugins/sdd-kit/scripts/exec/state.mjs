// Estado persistente y reanudable de la skill plan-executor.
// Node ESM puro, solo stdlib (node:fs). Sin dependencias npm, sin red.
// Forma del estado: plugins/sdd-kit/skills/plan-executor/assets/execution_state.schema.json.
// Convención: los módulos lib no imprimen; devuelven/mutan datos.

import fs from 'node:fs';

/**
 * Inicializa el estado de ejecución a partir de un execution_plan.json ya validado.
 * @param {object} plan - plan con plan_id, source_spec y tasks[].task_id/estimated_tokens.
 * @returns {object} estado inicial conforme a execution_state.schema.json.
 */
export function initState(plan) {
  const tasks = {};
  for (const task of plan.tasks) {
    tasks[task.task_id] = {
      status: 'pending',
      estimated_tokens: task.estimated_tokens,
      actual_tokens: null,
      deviation: null,
      test_cmd: null,
      commit: null,
      incidencia: null,
    };
  }
  return {
    plan_id: plan.plan_id,
    source_spec: plan.source_spec,
    branch: null,
    started_at: new Date().toISOString(),
    tasks,
    pause: null,
  };
}

/**
 * Registra el resultado de una tarea en el estado.
 * @param {object} state
 * @param {string} taskId
 * @param {{status: string, actual_tokens?: number|null, test_cmd?: string|null, commit?: string|null, incidencia?: string|null}} result
 */
export function recordResult(
  state,
  taskId,
  { status, actual_tokens = null, test_cmd = null, commit = null, incidencia = null }
) {
  const entry = state.tasks[taskId];
  entry.status = status;
  entry.actual_tokens = actual_tokens;
  entry.deviation = actual_tokens == null ? null : actual_tokens - entry.estimated_tokens;
  entry.test_cmd = test_cmd;
  entry.commit = commit;
  entry.incidencia = incidencia;
}

/**
 * Marca como 'skipped' cada task_id dado.
 * @param {object} state
 * @param {string[]} taskIds
 */
export function markSkipped(state, taskIds) {
  for (const taskId of taskIds) {
    state.tasks[taskId].status = 'skipped';
  }
}

/**
 * Registra una pausa por umbral de presupuesto.
 * @param {object} state
 * @param {{reason: string, real_tokens: number, estimated_tokens: number, at_task: string}} pause
 */
export function recordPause(state, { reason, real_tokens, estimated_tokens, at_task }) {
  state.pause = { reason, real_tokens, estimated_tokens, at_task };
}

/**
 * Fija la rama git asociada a la ejecución.
 * @param {object} state
 * @param {string} branch
 */
export function setBranch(state, branch) {
  state.branch = branch;
}

/**
 * Escribe el estado a disco de forma atómica (tmp + rename).
 * @param {string} statePath
 * @param {object} state
 */
export function persist(statePath, state) {
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmpPath, statePath);
}

/**
 * Lee y parsea el estado desde disco.
 * @param {string} statePath
 * @returns {object} state
 */
export function read(statePath) {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}
