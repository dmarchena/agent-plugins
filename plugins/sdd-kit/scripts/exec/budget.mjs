// exec/budget.mjs — T6 umbral 2x + bloqueo/skip transitivo
// Node ESM puro, solo stdlib + plan.mjs/state.mjs. Sin dependencias externas. No imprime: devuelve datos.

import { allDependents } from './plan.mjs';
import { recordResult, markSkipped } from './state.mjs';

/**
 * Comprueba si el consumo real de tokens de las tareas ya ejecutadas excede
 * el doble de lo estimado para esas mismas tareas.
 *
 * @param {object} state
 * @returns {{ exceeded: boolean, real: number, estimated: number }}
 */
export function exceeds(state) {
  let real = 0;
  let estimated = 0;

  for (const entry of Object.values(state.tasks)) {
    if (entry.actual_tokens == null) continue;
    real += entry.actual_tokens;
    estimated += entry.estimated_tokens;
  }

  return {
    exceeded: real > 2 * estimated,
    real,
    estimated,
  };
}

/**
 * Marca taskId como 'blocked' (preservando sus campos ya registrados) y
 * marca en cascada como 'skipped' todos sus dependientes transitivos.
 *
 * @param {object} plan
 * @param {object} state
 * @param {string} taskId
 * @returns {{ blocked: string, skipped: string[] }}
 */
export function blockAndSkip(plan, state, taskId) {
  const current = state.tasks[taskId];
  recordResult(state, taskId, {
    status: 'blocked',
    actual_tokens: current.actual_tokens,
    test_cmd: current.test_cmd,
    commit: current.commit,
    incidencia: current.incidencia,
  });

  const skipped = allDependents(plan, taskId);
  markSkipped(state, skipped);

  return { blocked: taskId, skipped };
}
