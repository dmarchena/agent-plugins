#!/usr/bin/env node
// Deterministic validator for the plan-writer skill.
// Pure Node ESM, stdlib only (node:fs, node:path). No npm dependencies, no network.
//
// Usage:
//   node plan-tools.mjs inspect-spec <spec.md>
//   node plan-tools.mjs check-plan <spec.md> <plan.json>
//   node plan-tools.mjs calibration-snapshot <archivedDir> [--out <path>]
//
// Convention: success -> exit 0, stdout carries {ok:true,data:...}.
//             failure -> exit != 0, stdout carries {ok:false,error:{reason}}
//             (naming the offending ID/field in reason).

import fs from 'node:fs';
import path from 'node:path';
import { emitSuccess, emitError, parseFlags } from './lib/cli.mjs';

// ---------------------------------------------------------------------------
// Generic utilities
// ---------------------------------------------------------------------------

function readFileOrFail(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    emitError(`could not read ${label}: ${filePath} (${err.message})`);
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isInteger(v) {
  return Number.isInteger(v);
}

// Root of a scenario ID: the part before ".S". If it's not a scenario
// (it's already a requirement ID), it is returned as-is.
function rootOf(id) {
  const idx = id.indexOf('.S');
  return idx === -1 ? id : id.slice(0, idx);
}

// ---------------------------------------------------------------------------
// spec.md parsing (shared by inspect-spec and check-plan)
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
    emitError('no R<n> IDs found');
  }
  if (spec.scenarios.size === 0) {
    emitError('no scenarios found');
  }
  if (!spec.hasACSectionHeader) {
    emitError('missing the Acceptance Criteria section');
  }

  emitSuccess({ requirements: spec.requirements.size, acs: spec.acs.size });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// check-plan: schema validation
// ---------------------------------------------------------------------------

const VALID_AGENT_TYPES = new Set([
  'researcher',
  'terminal_operator',
  'code_writer',
  'doc_writer',
  'reviewer',
  'architect',
  'verifier',
]);
const VALID_MODELS = new Set(['haiku', 'sonnet', 'opus']);

// Returns null if the schema is valid, or the path of the failing field.
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
    if (!isNonEmptyString(t.expected_output_schema)) {
      return `${p}.expected_output_schema`;
    }
    if (!Array.isArray(t.satisfies_acs) || t.satisfies_acs.length < 1) return `${p}.satisfies_acs`;
    if (!isInteger(t.estimated_tokens)) return `${p}.estimated_tokens`;
    if (t.actual_tokens !== null) return `${p}.actual_tokens`;
    if (t.deviation !== null) return `${p}.deviation`;

    if (t.test_contract !== null) {
      if (!Array.isArray(t.test_contract) || t.test_contract.length < 1) {
        return `${p}.test_contract`;
      }
      for (let j = 0; j < t.test_contract.length; j++) {
        const tc = t.test_contract[j];
        const tcp = `${p}.test_contract[${j}]`;
        if (typeof tc !== 'object' || tc === null || Array.isArray(tc)) return tcp;
        if (!isNonEmptyString(tc.ref)) return `${tcp}.ref`;
        if (!isNonEmptyString(tc.assertion)) return `${tcp}.assertion`;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// check-plan: individual checks
// ---------------------------------------------------------------------------

function checkDuplicateTaskIds(tasks) {
  const seen = new Set();
  for (const t of tasks) {
    if (seen.has(t.task_id)) return `duplicate task_id: ${t.task_id}`;
    seen.add(t.task_id);
  }
  return null;
}

function checkDependenciesExist(tasks, taskIds) {
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      if (!taskIds.has(dep)) {
        return `dependency on nonexistent task: ${dep}`;
      }
    }
  }
  return null;
}

// DFS with a visit stack to detect cycles in the dependency DAG.
function findCycle(tasks) {
  const graph = new Map(tasks.map((t) => [t.task_id, t.dependencies]));
  const state = new Map(); // 0/undefined = unvisited, 1 = on stack, 2 = done
  const stack = [];

  function dfs(node) {
    state.set(node, 1);
    stack.push(node);

    for (const dep of graph.get(node) || []) {
      if (!graph.has(dep)) continue; // already reported by checkDependenciesExist
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
      return `instructions has no reference to IDs: ${t.task_id}`;
    }

    if (t.dependencies.length > 0) {
      const mentionsDep = t.dependencies.some((depId) => instructions.includes(depId));
      if (!mentionsDep) {
        return `instructions does not reference a previous task: ${t.task_id}`;
      }
    } else {
      const otherTaskIds = [...taskIds].filter((id) => id !== t.task_id);
      const mentionsOther = otherTaskIds.some((id) => instructions.includes(id));
      if (mentionsOther) {
        return `task with no dependencies references a task_id: ${t.task_id}`;
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
      return `uncovered requirement: ${reqId}`;
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
      return `uncovered AC: ${acId}`;
    }
  }
  return null;
}

// For each requirement R, which task_ids cover it (via source_ids / scenario root).
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
          return `spec dependency not reflected: ${taskId} requires ${reqDep}`;
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
      return 'missing parallelizable tasks (dependencies: [])';
    }
  }
  return null;
}

// test_contract business rules: only code_writer carries a contract, and its
// refs must exist in the spec (scenario R<n>.S<m> or AC AC<n>).
function checkTestContract(spec, tasks) {
  const validRefs = new Set([...spec.scenarios, ...spec.acs]);

  for (const t of tasks) {
    const isCodeWriter = t.agent_type === 'code_writer';
    const hasContract = Array.isArray(t.test_contract) && t.test_contract.length > 0;

    if (isCodeWriter && !hasContract) {
      return `empty test_contract in code_writer task: ${t.task_id}`;
    }
    if (!isCodeWriter && t.test_contract !== null) {
      return `test_contract must be null for agent_type=${t.agent_type}: ${t.task_id}`;
    }
    if (hasContract) {
      for (const tc of t.test_contract) {
        if (!validRefs.has(tc.ref)) {
          return `test_contract.ref does not exist in spec: ${t.task_id} -> ${tc.ref}`;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// check-plan: orchestration
// ---------------------------------------------------------------------------

function cmdCheckPlan(specPath, planPath) {
  const specText = readFileOrFail(specPath, 'spec.md');
  const planText = readFileOrFail(planPath, 'plan.json');
  const spec = parseSpec(specText);

  let plan;
  try {
    plan = JSON.parse(planText);
  } catch {
    emitError('plan.json is not valid JSON');
  }

  const schemaError = validateSchema(plan);
  if (schemaError) {
    emitError(`schema: ${schemaError}`);
  }

  const tasks = plan.tasks;
  const taskIds = new Set(tasks.map((t) => t.task_id));

  const checks = [
    () => checkDuplicateTaskIds(tasks),
    () => checkDependenciesExist(tasks, taskIds),
    () => {
      const cycle = findCycle(tasks);
      return cycle ? `cycle: ${cycle.join(' -> ')}` : null;
    },
    () => checkInstructions(tasks, taskIds),
    () => checkRequirementCoverage(spec, tasks),
    () => checkACCoverage(spec, tasks),
    () => checkSpecDependencyConsistency(spec, tasks),
    () => checkParallelizableTasks(spec, tasks),
    () => checkTestContract(spec, tasks),
  ];

  for (const check of checks) {
    const error = check();
    if (error) emitError(error);
  }

  // T4-trim-cli-data: `message` is unused (only the test suite ever read it).
  emitSuccess({ tasks: tasks.length });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// calibration-snapshot: R1 (docs/specs/token-estimator-calibration/spec.md)
// ---------------------------------------------------------------------------
//
// Reads every immediate subdirectory of `archivedDir` that carries BOTH an
// execution_state.json and an execution_plan.json, joins each executed
// task's recorded consumption (state) with its planned structure (plan) on
// task id, and produces a Markdown snapshot: one row per executed task
// (actual_tokens non-null), nine columns, plus an `excluded: <K>` line
// counting every task skipped because its actual_tokens was null (including
// every task of a plan that was never executed).
//
// Deterministic by construction: subdirectories are sorted by name, and
// tasks within a plan are sorted by their plan-order index (falling back to
// task_id for any task not found in the plan, which shouldn't happen in
// well-formed archives) -- re-running against unchanged inputs always
// yields the same row order and the same Markdown bytes.
//
// Kept as two separate steps (collect -> render) rather than one fused
// function so a later task can extend the collected data (e.g. a per-plan
// mean deviation% for R2) without having to first factor this apart.

// Returns { rows, excluded } for every archived <slug> dir under
// `archivedDir` that has both execution_state.json and execution_plan.json.
// `rows` is already sorted (by plan slug, then plan-order task index) so the
// caller can render it directly without any further sorting.
function collectCalibrationRows(archivedDir) {
  let entries;
  try {
    entries = fs.readdirSync(archivedDir, { withFileTypes: true });
  } catch (err) {
    emitError(`could not read archived dir: ${archivedDir} (${err.message})`);
  }

  const slugs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const rows = [];
  let excluded = 0;

  for (const slug of slugs) {
    const dirPath = path.join(archivedDir, slug);
    const statePath = path.join(dirPath, 'execution_state.json');
    const planPath = path.join(dirPath, 'execution_plan.json');
    if (!fs.existsSync(statePath) || !fs.existsSync(planPath)) continue;

    let state;
    let plan;
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    } catch (err) {
      emitError(`could not parse JSON for archived dir ${slug}: ${err.message}`);
    }

    const planTasks = Array.isArray(plan.tasks) ? plan.tasks : [];
    const planSize = planTasks.length;
    const planIndexById = new Map(planTasks.map((t, i) => [t.task_id, i]));
    const planTaskById = new Map(planTasks.map((t) => [t.task_id, t]));

    const stateTasks =
      state.tasks && typeof state.tasks === 'object' && !Array.isArray(state.tasks) ? state.tasks : {};

    const taskIds = Object.keys(stateTasks).sort((a, b) => {
      const ia = planIndexById.has(a) ? planIndexById.get(a) : Number.MAX_SAFE_INTEGER;
      const ib = planIndexById.has(b) ? planIndexById.get(b) : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    for (const taskId of taskIds) {
      const stateTask = stateTasks[taskId];
      const planTask = planTaskById.get(taskId);

      // Unusable join: no plan task of this id to source structural fields
      // from. Counted as excluded rather than silently dropped.
      if (!planTask) {
        excluded++;
        continue;
      }

      const actualTokens = stateTask ? stateTask.actual_tokens : null;
      if (actualTokens === null || actualTokens === undefined) {
        excluded++;
        continue;
      }

      const estimatedTokens = planTask.estimated_tokens;
      const deviationPct =
        estimatedTokens === null || estimatedTokens === undefined || estimatedTokens === 0
          ? null
          : Math.round(((actualTokens - estimatedTokens) / estimatedTokens) * 100);

      rows.push({
        planSlug: slug,
        taskId,
        agentType: planTask.agent_type,
        taskIndex: planIndexById.get(taskId),
        dependencyCount: Array.isArray(planTask.dependencies) ? planTask.dependencies.length : 0,
        planSize,
        estimatedTokens,
        actualTokens,
        deviationPct,
      });
    }
  }

  return { rows, excluded };
}

const CALIBRATION_SNAPSHOT_HEADER =
  '| plan_slug | task_id | agent_type | task_index | dependencies | plan_size | estimated_tokens | actual_tokens | deviation_pct |';
const CALIBRATION_SNAPSHOT_DIVIDER = '|---|---|---|---|---|---|---|---|---|';

// Shared with the per-row deviation% cell and the R2 summary's mean cells,
// so both render `N/A` the same way and signed values the same way (explicit
// `+` for non-negative, bare `-` for negative, via the numeric sign already
// carried by Math.round).
function formatSignedPct(value) {
  return value === null ? 'N/A' : `${value >= 0 ? '+' : ''}${value}%`;
}

// R2 (docs/specs/token-estimator-calibration/spec.md): per-plan bias summary.
//
// Groups `rows` (collectCalibrationRows' output, already sorted by plan slug
// then plan-order task index) by planSlug, in first-appearance order -- which
// is the same as the table's slug order, since rows are pre-sorted, so this
// needs no extra sort to stay deterministic. For each plan, averages only
// the rows whose deviationPct is numeric (a row with null/0 estimated_tokens
// renders `N/A` in the table per R1.S2 and is excluded from its plan's mean
// too, rather than treated as 0 -- an N/A isn't a zero deviation, it's an
// unknown one). A plan whose every row is N/A (e.g. every estimated_tokens
// was 0) would otherwise divide 0/0 into NaN; instead its mean is `null`,
// rendered `N/A` like any other missing value. `overallMeanDeviationPct` is
// the same signed-mean rule applied across every plan's numeric rows at
// once (the "one overall line" from R2's requirement text).
function computeBiasSummary(rows) {
  const perPlanOrder = [];
  const perPlanAcc = new Map(); // planSlug -> { sum, count }
  let overallSum = 0;
  let overallCount = 0;

  for (const r of rows) {
    if (!perPlanAcc.has(r.planSlug)) {
      perPlanAcc.set(r.planSlug, { sum: 0, count: 0 });
      perPlanOrder.push(r.planSlug);
    }
    if (r.deviationPct !== null) {
      const acc = perPlanAcc.get(r.planSlug);
      acc.sum += r.deviationPct;
      acc.count += 1;
      overallSum += r.deviationPct;
      overallCount += 1;
    }
  }

  const perPlan = perPlanOrder.map((planSlug) => {
    const { sum, count } = perPlanAcc.get(planSlug);
    return { planSlug, meanDeviationPct: count === 0 ? null : Math.round(sum / count) };
  });

  return {
    perPlan,
    overallMeanDeviationPct: overallCount === 0 ? null : Math.round(overallSum / overallCount),
  };
}

// Renders { rows, excluded } (collectCalibrationRows' return shape) into the
// R1 Markdown snapshot: a nine-column table (one row per included task) plus
// a trailing `excluded: <K>` line. Pure string formatting, no filesystem or
// timestamp dependency, so it is byte-identical for identical input.
//
// R2 appends a second section AFTER the `excluded:` line (rather than before
// it, or interleaved into the main table) so the main table + excluded count
// -- R1's whole contract -- stays a stable, unchanged prefix of the output,
// and the new per-plan summary reads as a distinct, clearly-labeled section
// appended at the end.
function renderCalibrationSnapshot({ rows, excluded }) {
  const lines = [CALIBRATION_SNAPSHOT_HEADER, CALIBRATION_SNAPSHOT_DIVIDER];

  for (const r of rows) {
    const deviationCell = formatSignedPct(r.deviationPct);
    lines.push(
      `| ${r.planSlug} | ${r.taskId} | ${r.agentType} | ${r.taskIndex} | ${r.dependencyCount} | ${r.planSize} | ${r.estimatedTokens} | ${r.actualTokens} | ${deviationCell} |`
    );
  }

  lines.push('');
  lines.push(`excluded: ${excluded}`);

  const { perPlan, overallMeanDeviationPct } = computeBiasSummary(rows);

  lines.push('');
  lines.push('## Per-plan bias summary');
  lines.push('');
  lines.push('| plan_slug | mean_deviation_pct |');
  lines.push('|---|---|');
  for (const p of perPlan) {
    lines.push(`| ${p.planSlug} | ${formatSignedPct(p.meanDeviationPct)} |`);
  }
  lines.push('');
  lines.push(`overall: ${formatSignedPct(overallMeanDeviationPct)}`);

  return lines.join('\n') + '\n';
}

function cmdCalibrationSnapshot(archivedDir, flags) {
  const { rows, excluded } = collectCalibrationRows(archivedDir);
  const markdown = renderCalibrationSnapshot({ rows, excluded });

  if (flags.out && flags.out !== true) {
    fs.writeFileSync(String(flags.out), markdown);
  }

  emitSuccess({ rows: rows.length, excluded, markdown });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const [, , subcommand, ...args] = process.argv;

  if (subcommand === 'inspect-spec') {
    const [specPath] = args;
    if (!specPath) emitError('usage: plan-tools.mjs inspect-spec <spec.md>');
    cmdInspectSpec(specPath);
  } else if (subcommand === 'check-plan') {
    const [specPath, planPath] = args;
    if (!specPath || !planPath) {
      emitError('usage: plan-tools.mjs check-plan <spec.md> <plan.json>');
    }
    cmdCheckPlan(specPath, planPath);
  } else if (subcommand === 'calibration-snapshot') {
    const [archivedDir] = args;
    if (!archivedDir) {
      emitError('usage: plan-tools.mjs calibration-snapshot <archivedDir> [--out <path>]');
    }
    const flags = parseFlags(args);
    cmdCalibrationSnapshot(archivedDir, flags);
  } else {
    emitError(
      'unknown subcommand: usage: plan-tools.mjs <inspect-spec|check-plan|calibration-snapshot> <args>'
    );
  }
}

main();
