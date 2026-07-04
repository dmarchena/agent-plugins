#!/usr/bin/env node
// Validador determinista para la skill plan-writer.
// Node ESM puro, solo stdlib (node:fs, node:path). Sin dependencias npm, sin red.
//
// Uso:
//   node plan-tools.mjs inspect-spec <spec.md>
//   node plan-tools.mjs check-plan <spec.md> <plan.json>
//
// Convención: éxito -> exit 0, mensajes por stdout.
//             fallo  -> exit 1, mensaje de error por stderr (nombrando el ID/campo causante).

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Utilidades genéricas
// ---------------------------------------------------------------------------

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readFileOrFail(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    fail(`no se pudo leer ${label}: ${filePath} (${err.message})`);
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isInteger(v) {
  return Number.isInteger(v);
}

// Root de un ID de escenario: la parte antes de ".S". Si no es un escenario
// (ya es un ID de requisito), se devuelve tal cual.
function rootOf(id) {
  const idx = id.indexOf('.S');
  return idx === -1 ? id : id.slice(0, idx);
}

// ---------------------------------------------------------------------------
// Parseo de spec.md (común a inspect-spec y check-plan)
// ---------------------------------------------------------------------------

const REQ_HEADER_RE = /^###\s+(R-E2E|R\d+)\b/;
const SCEN_HEADER_RE = /^####\s+((?:R-E2E|R\d+)\.S\d+)\b/;
const AC_SECTION_RE = /^##\s+Acceptance Criteria\s*$/;
const OTHER_H2_RE = /^##\s+/;
const DEPENDS_LINE_RE = /^Depende de:\s*(.+)$/;
const AC_ITEM_RE = /^-\s*(?:\[[^\]]*\]\s*)?(AC-E2E|AC\d+)\b/;
const REQ_ID_TOKEN_RE = /^(R-E2E|R\d+)$/;

function parseSpec(specText) {
  const lines = specText.split(/\r?\n/);

  const requirements = new Map(); // id -> { dependsOn: string[] }
  const scenarios = new Set();
  const acs = new Set();
  let hasACSectionHeader = false;
  let inACSection = false;
  let currentReqId = null;

  for (const line of lines) {
    const reqMatch = line.match(REQ_HEADER_RE);
    if (reqMatch) {
      currentReqId = reqMatch[1];
      if (!requirements.has(currentReqId)) {
        requirements.set(currentReqId, { dependsOn: [] });
      }
      continue;
    }

    const scenMatch = line.match(SCEN_HEADER_RE);
    if (scenMatch) {
      scenarios.add(scenMatch[1]);
      continue;
    }

    if (AC_SECTION_RE.test(line)) {
      hasACSectionHeader = true;
      inACSection = true;
      continue;
    }

    if (inACSection && OTHER_H2_RE.test(line) && !AC_SECTION_RE.test(line)) {
      inACSection = false;
    }

    const depMatch = line.match(DEPENDS_LINE_RE);
    if (depMatch && currentReqId) {
      const targets = depMatch[1].trim();
      if (targets !== '—' && targets !== '-' && targets !== '') {
        const ids = targets
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => REQ_ID_TOKEN_RE.test(s));
        requirements.get(currentReqId).dependsOn.push(...ids);
      }
      continue;
    }

    if (inACSection) {
      const acMatch = line.match(AC_ITEM_RE);
      if (acMatch) {
        acs.add(acMatch[1]);
      }
    }
  }

  return { requirements, scenarios, acs, hasACSectionHeader };
}

// ---------------------------------------------------------------------------
// inspect-spec
// ---------------------------------------------------------------------------

function cmdInspectSpec(specPath) {
  const specText = readFileOrFail(specPath, 'spec.md');
  const spec = parseSpec(specText);

  if (spec.requirements.size === 0) {
    fail('no se encontraron IDs R<n>');
  }
  if (spec.scenarios.size === 0) {
    fail('no se encontraron escenarios');
  }
  if (!spec.hasACSectionHeader) {
    fail('falta la sección Acceptance Criteria');
  }

  process.stdout.write(
    `${spec.requirements.size} requisitos, ${spec.acs.size} ACs detectados\n`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// check-plan: validación de esquema
// ---------------------------------------------------------------------------

const VALID_AGENT_TYPES = new Set([
  'researcher',
  'terminal_operator',
  'code_writer',
  'doc_writer',
  'reviewer',
  'architect',
]);
const VALID_MODELS = new Set(['haiku', 'sonnet', 'opus']);

// Devuelve null si el esquema es válido, o la ruta del campo que falla.
function validateSchema(plan) {
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) {
    return 'plan_id';
  }

  const rootStringFields = ['plan_id', 'project_name', 'global_objective', 'source_spec'];
  for (const field of rootStringFields) {
    if (!isNonEmptyString(plan[field])) return field;
  }

  if (plan.confidence !== 'low') return 'confidence';
  if (!isInteger(plan.estimated_tokens_total)) return 'estimated_tokens_total';
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) return 'tasks';

  if (typeof plan.coverage !== 'object' || plan.coverage === null || Array.isArray(plan.coverage)) {
    return 'coverage';
  }
  if (!('requirements' in plan.coverage)) return 'coverage.requirements';
  if (!('acs' in plan.coverage)) return 'coverage.acs';

  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i];
    const p = `tasks[${i}]`;
    if (typeof t !== 'object' || t === null || Array.isArray(t)) return p;

    if (!isNonEmptyString(t.task_id)) return `${p}.task_id`;
    if (!Array.isArray(t.source_ids) || t.source_ids.length < 1) return `${p}.source_ids`;
    if (!Array.isArray(t.dependencies)) return `${p}.dependencies`;
    if (!VALID_AGENT_TYPES.has(t.agent_type)) return `${p}.agent_type`;
    if (!isNonEmptyString(t.subagent)) return `${p}.subagent`;
    if (!VALID_MODELS.has(t.model)) return `${p}.model`;
    if (!isNonEmptyString(t.justification)) return `${p}.justification`;
    if (!isNonEmptyString(t.instructions)) return `${p}.instructions`;
    if (t.expected_output_schema === undefined || t.expected_output_schema === null) {
      return `${p}.expected_output_schema`;
    }
    if (!Array.isArray(t.satisfies_acs) || t.satisfies_acs.length < 1) return `${p}.satisfies_acs`;
    if (!isInteger(t.estimated_tokens)) return `${p}.estimated_tokens`;
    if (t.actual_tokens !== null) return `${p}.actual_tokens`;
    if (t.deviation !== null) return `${p}.deviation`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// check-plan: checks individuales
// ---------------------------------------------------------------------------

function checkDuplicateTaskIds(tasks) {
  const seen = new Set();
  for (const t of tasks) {
    if (seen.has(t.task_id)) return `task_id duplicado: ${t.task_id}`;
    seen.add(t.task_id);
  }
  return null;
}

function checkDependenciesExist(tasks, taskIds) {
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (!taskIds.has(dep)) {
        return `dependencia a task inexistente: ${dep}`;
      }
    }
  }
  return null;
}

// DFS con pila de visita para detectar ciclos en el DAG de dependencias.
function findCycle(tasks) {
  const graph = new Map(tasks.map((t) => [t.task_id, t.dependencies]));
  const state = new Map(); // 0/undefined = no visitado, 1 = en pila, 2 = terminado
  const stack = [];

  function dfs(node) {
    state.set(node, 1);
    stack.push(node);

    for (const dep of graph.get(node) || []) {
      if (!graph.has(dep)) continue; // ya reportado por checkDependenciesExist
      const s = state.get(dep) || 0;
      if (s === 1) {
        const idx = stack.indexOf(dep);
        return stack.slice(idx).concat(dep);
      }
      if (s === 0) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      }
    }

    stack.pop();
    state.set(node, 2);
    return null;
  }

  for (const id of graph.keys()) {
    if ((state.get(id) || 0) === 0) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

const ID_REFERENCE_RE = /\b(?:R-E2E|AC-E2E|R\d+|AC\d+)\b/;

function checkInstructions(tasks, taskIds) {
  for (const t of tasks) {
    const instructions = t.instructions;

    if (!ID_REFERENCE_RE.test(instructions)) {
      return `instructions sin referencia a IDs: ${t.task_id}`;
    }

    if (t.dependencies.length > 0) {
      const mentionsDep = t.dependencies.some((depId) => instructions.includes(depId));
      if (!mentionsDep) {
        return `instructions no referencia task previo: ${t.task_id}`;
      }
    } else {
      const otherTaskIds = [...taskIds].filter((id) => id !== t.task_id);
      const mentionsOther = otherTaskIds.some((id) => instructions.includes(id));
      if (mentionsOther) {
        return `tarea sin dependencias referencia task_id: ${t.task_id}`;
      }
    }
  }
  return null;
}

function coveredRequirements(tasks) {
  const covered = new Set();
  for (const t of tasks) {
    for (const sid of t.source_ids) {
      covered.add(rootOf(sid));
    }
  }
  return covered;
}

function checkRequirementCoverage(spec, tasks) {
  const covered = coveredRequirements(tasks);
  for (const reqId of spec.requirements.keys()) {
    if (!covered.has(reqId)) {
      return `requisito sin cubrir: ${reqId}`;
    }
  }
  return null;
}

function checkACCoverage(spec, tasks) {
  const covered = new Set();
  for (const t of tasks) {
    for (const ac of t.satisfies_acs) covered.add(ac);
  }
  for (const acId of spec.acs) {
    if (!covered.has(acId)) {
      return `AC sin cubrir: ${acId}`;
    }
  }
  return null;
}

// Para cada requisito R, qué task_ids lo cubren (via source_ids / root de escenario).
function tasksCoveringRequirement(tasks) {
  const map = new Map(); // reqId -> Set<task_id>
  for (const t of tasks) {
    for (const sid of t.source_ids) {
      const req = rootOf(sid);
      if (!map.has(req)) map.set(req, new Set());
      map.get(req).add(t.task_id);
    }
  }
  return map;
}

function checkSpecDependencyConsistency(spec, tasks) {
  const coveringMap = tasksCoveringRequirement(tasks);

  for (const [reqId, info] of spec.requirements) {
    const coveringTasks = coveringMap.get(reqId) || new Set();
    for (const taskId of coveringTasks) {
      const task = tasks.find((t) => t.task_id === taskId);
      for (const reqDep of info.dependsOn) {
        const dependencyCoverers = coveringMap.get(reqDep) || new Set();
        const satisfied = task.dependencies.some((d) => dependencyCoverers.has(d));
        if (!satisfied) {
          return `dependencia de spec no reflejada: ${taskId} requiere ${reqDep}`;
        }
      }
    }
  }
  return null;
}

function checkParallelizableTasks(spec, tasks) {
  let independentReqs = 0;
  for (const info of spec.requirements.values()) {
    if (info.dependsOn.length === 0) independentReqs++;
  }
  if (independentReqs >= 2) {
    const parallelTasks = tasks.filter((t) => t.dependencies.length === 0).length;
    if (parallelTasks < 2) {
      return 'faltan tareas paralelizables (dependencies: [])';
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// check-plan: orquestación
// ---------------------------------------------------------------------------

function cmdCheckPlan(specPath, planPath) {
  const specText = readFileOrFail(specPath, 'spec.md');
  const planText = readFileOrFail(planPath, 'plan.json');
  const spec = parseSpec(specText);

  let plan;
  try {
    plan = JSON.parse(planText);
  } catch {
    fail('plan.json no es JSON válido');
  }

  const schemaError = validateSchema(plan);
  if (schemaError) {
    fail(`esquema: ${schemaError}`);
  }

  const tasks = plan.tasks;
  const taskIds = new Set(tasks.map((t) => t.task_id));

  const checks = [
    () => checkDuplicateTaskIds(tasks),
    () => checkDependenciesExist(tasks, taskIds),
    () => {
      const cycle = findCycle(tasks);
      return cycle ? `ciclo: ${cycle.join(' -> ')}` : null;
    },
    () => checkInstructions(tasks, taskIds),
    () => checkRequirementCoverage(spec, tasks),
    () => checkACCoverage(spec, tasks),
    () => checkSpecDependencyConsistency(spec, tasks),
    () => checkParallelizableTasks(spec, tasks),
  ];

  for (const check of checks) {
    const error = check();
    if (error) fail(error);
  }

  process.stdout.write(
    `plan válido: ${tasks.length} tareas, todos los requisitos y ACs cubiertos\n`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const [, , subcommand, ...args] = process.argv;

  if (subcommand === 'inspect-spec') {
    const [specPath] = args;
    if (!specPath) fail('uso: plan-tools.mjs inspect-spec <spec.md>');
    cmdInspectSpec(specPath);
  } else if (subcommand === 'check-plan') {
    const [specPath, planPath] = args;
    if (!specPath || !planPath) {
      fail('uso: plan-tools.mjs check-plan <spec.md> <plan.json>');
    }
    cmdCheckPlan(specPath, planPath);
  } else {
    fail('subcomando desconocido: uso: plan-tools.mjs <inspect-spec|check-plan> <args>');
  }
}

main();
