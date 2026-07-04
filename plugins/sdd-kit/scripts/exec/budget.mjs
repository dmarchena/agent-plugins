// exec/budget.mjs — T6 2x threshold + transitive block/skip
// Pure Node ESM, stdlib only + plan.mjs/state.mjs. No external dependencies. Does not print: returns data.

import { allDependents } from './plan.mjs';
import { recordResult, markSkipped } from './state.mjs';

/**
 * Checks whether the actual token consumption of already-executed tasks
 * exceeds double the estimate for those same tasks.
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
 * Marks taskId as 'blocked' (preserving its already-recorded fields) and
 * cascades to mark all of its transitive dependents as 'skipped'.
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
