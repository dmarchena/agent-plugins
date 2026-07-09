// Persistent, resumable state for the plan-executor skill.
// Pure Node ESM, stdlib only (node:fs). No npm dependencies, no network.
// State shape: plugins/sdd-kit/skills/plan-executor/assets/execution_state.schema.json.
// Convention: lib modules do not print; they return/mutate data.

import fs from 'node:fs';

/**
 * Initializes the execution state from an already-validated execution_plan.json.
 * @param {object} plan - plan with plan_id, source_spec and tasks[].task_id/estimated_tokens.
 * @returns {object} initial state conforming to execution_state.schema.json.
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
      agentId: null,
      sessionId: null,
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
 * Records the result of a task in the state.
 * @param {object} state
 * @param {string} taskId
 * @param {{status: string, actual_tokens?: number|null, test_cmd?: string|null, commit?: string|null, incidencia?: string|null, agentId?: string|null, sessionId?: string|null}} result
 */
export function recordResult(
  state,
  taskId,
  {
    status, actual_tokens = null, test_cmd = null, commit = null, incidencia = null,
    agentId = null, sessionId = null,
  }
) {
  const entry = state.tasks[taskId];
  entry.status = status;
  entry.actual_tokens = actual_tokens;
  entry.deviation = actual_tokens == null ? null : actual_tokens - entry.estimated_tokens;
  entry.test_cmd = test_cmd;
  entry.commit = commit;
  entry.incidencia = incidencia;
  entry.agentId = agentId;
  entry.sessionId = sessionId;
}

/**
 * Marks each given task_id as 'skipped'.
 * @param {object} state
 * @param {string[]} taskIds
 */
export function markSkipped(state, taskIds) {
  for (const taskId of taskIds) {
    state.tasks[taskId].status = 'skipped';
  }
}

/**
 * Records a pause triggered by the budget threshold.
 * @param {object} state
 * @param {{reason: string, real_tokens: number, estimated_tokens: number, at_task: string}} pause
 */
export function recordPause(state, { reason, real_tokens, estimated_tokens, at_task }) {
  state.pause = { reason, real_tokens, estimated_tokens, at_task };
}

/**
 * Sets the git branch associated with the execution.
 * @param {object} state
 * @param {string} branch
 */
export function setBranch(state, branch) {
  state.branch = branch;
}

/**
 * Writes the state to disk atomically (tmp + rename).
 * @param {string} statePath
 * @param {object} state
 */
export function persist(statePath, state) {
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(tmpPath, statePath);
}

/**
 * Reads and parses the state from disk.
 * @param {string} statePath
 * @returns {object} state
 */
export function read(statePath) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  // R1.S3: backward-compatible load — a pre-schema state's task entries may
  // lack agentId/sessionId entirely; normalize them to null in place so
  // every caller (cmdNext, cmdComplete, cmdCompleteBatch, cmdResume,
  // cmdReport, cmdBlock) sees the current shape without throwing.
  for (const entry of Object.values(state.tasks || {})) {
    if (!('agentId' in entry)) entry.agentId = null;
    if (!('sessionId' in entry)) entry.sessionId = null;
  }
  return state;
}
