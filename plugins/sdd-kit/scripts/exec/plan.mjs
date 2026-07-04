// exec/plan.mjs — T1 carga+validación, T4.S1 tandas del DAG
// Node ESM puro, solo stdlib. Sin dependencias externas. No imprime: devuelve datos.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAN_TOOLS_PATH = path.join(__dirname, '..', 'plan-tools.mjs');

/**
 * Carga y valida un plan contra su spec usando el validador existente
 * (scripts/plan-tools.mjs check-plan) por subproceso.
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
 * Devuelve los task_id listos para ejecutar: todas sus dependencies están en
 * doneIds, no están en doneIds ni en excluded, en el orden de plan.tasks,
 * truncado a opts.max.
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
 * Devuelve los dependientes transitivos de taskId: tareas que dependen
 * directa o indirectamente de ella.
 *
 * @param {object} plan
 * @param {string} taskId
 * @returns {string[]}
 */
export function allDependents(plan, taskId) {
  const dependentsOf = new Map(); // id -> [ids que dependen de él]
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
