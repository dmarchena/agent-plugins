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
 * T5-exec-report-signal — a report-only, real_cost-derived over-budget
 * indicator. Unlike `exceeds()` (which sums each task's self-reported
 * `actual_tokens`, a blind figure the executor itself hands back),
 * this compares the transcript-measured `total.tokens` a
 * exec/real-cost.mjs#computeRealCost() call produced for the run against
 * the plan's total estimated budget (`estimated_tokens_total`, the
 * top-level figure plan-writer records in execution_plan.json). Same 2x
 * threshold convention as `exceeds()` for consistency, but driven by the
 * real signal instead of the self-reported one.
 *
 * Pure: takes only its two arguments, never touches `state`, never calls
 * process.exit, never signals a pause — it exists solely to be printed by
 * `report`. The run's actual pause/halt behavior (removed from `next` in
 * T2-drop-budget-pause) is untouched by this function's existence; nothing
 * in exec-tools.mjs wires its result into anything that can halt a run.
 *
 * @param {{orchestrator:object,subagents:object,total:{tokens:number,usd:number}}|{unavailable:true,reason:string}} realCost
 *   the return value of computeRealCost().
 * @param {number} estimatedTokensTotal - plan.estimated_tokens_total.
 * @returns {{available:boolean, over_budget:boolean, real_tokens:number|null, estimated_tokens:number, reason?:string}}
 */
export function realCostOverBudget(realCost, estimatedTokensTotal) {
  if (!realCost || realCost.unavailable) {
    return {
      available: false,
      over_budget: false,
      real_tokens: null,
      estimated_tokens: estimatedTokensTotal,
      reason: (realCost && realCost.reason) || 'real_cost unavailable',
    };
  }

  const real = realCost.total.tokens;
  return {
    available: true,
    over_budget: real > 2 * estimatedTokensTotal,
    real_tokens: real,
    estimated_tokens: estimatedTokensTotal,
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
