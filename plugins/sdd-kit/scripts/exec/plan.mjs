// exec/plan.mjs — T1 load+validation, T4.S1 DAG batches
// Pure Node ESM, stdlib only. No external dependencies. Does not print: returns data.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAN_TOOLS_PATH = path.join(__dirname, '..', 'plan-tools.mjs');

/**
 * Loads and validates a plan against its spec using the existing validator
 * (scripts/plan-tools.mjs check-plan) via a subprocess.
 *
 * @param {string} specPath
 * @param {string} planPath
 * @returns {{ valid: boolean, error: string|null, plan: object|null }}
 */
export function loadPlan(specPath, planPath) {
  const result = spawnSync('node', [PLAN_TOOLS_PATH, 'check-plan', specPath, planPath]);

  if (result.status === 0) {
    return {
      valid: true,
      error: null,
      plan: JSON.parse(fs.readFileSync(planPath, 'utf8')),
    };
  }

  const stdout = result.stdout ? result.stdout.toString() : '';
  const stderr = result.stderr ? result.stderr.toString() : '';
  return {
    valid: false,
    error: (stdout + stderr).trim(),
    plan: null,
  };
}

function toSet(value) {
  if (value instanceof Set) return value;
  return new Set(value || []);
}

/**
 * Returns the task_ids ready to run: all their dependencies are in doneIds,
 * they are not in doneIds nor in excluded, in plan.tasks order, truncated to
 * opts.max.
 *
 * @param {object} plan
 * @param {string[]|Set<string>} doneIds
 * @param {{ max?: number, excluded?: string[]|Set<string> }} [opts]
 * @returns {string[]}
 */
export function readyBatch(plan, doneIds, opts = {}) {
  const max = opts.max ?? 3;
  const done = toSet(doneIds);
  const excluded = toSet(opts.excluded);

  const ready = [];
  for (const task of plan.tasks) {
    if (ready.length >= max) break;
    if (done.has(task.task_id) || excluded.has(task.task_id)) continue;
    const depsSatisfied = task.dependencies.every((dep) => done.has(dep));
    if (depsSatisfied) ready.push(task.task_id);
  }
  return ready;
}

/**
 * Returns the transitive dependents of taskId: tasks that depend directly or
 * indirectly on it.
 *
 * @param {object} plan
 * @param {string} taskId
 * @returns {string[]}
 */
export function allDependents(plan, taskId) {
  const dependentsOf = new Map(); // id -> [ids that depend on it]
  for (const task of plan.tasks) {
    for (const dep of task.dependencies) {
      if (!dependentsOf.has(dep)) dependentsOf.set(dep, []);
      dependentsOf.get(dep).push(task.task_id);
    }
  }

  const result = [];
  const seen = new Set();
  const stack = [...(dependentsOf.get(taskId) || [])];

  while (stack.length > 0) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    for (const next of dependentsOf.get(id) || []) {
      if (!seen.has(next)) stack.push(next);
    }
  }

  return result;
}
