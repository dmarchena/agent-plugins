#!/usr/bin/env node

// forensics.mjs — per-task real cost/tokens forensics for a plan-executor
// SPECDIR (see docs/specs/spec-forensics).
//
// For each task_id in <SPECDIR>/execution_state.json's `tasks` map, tries to
// resolve the task's REAL (transcript-measured) token/cost figures by
// joining the task's agentId against the subagent transcripts of the
// session named by the task's sessionId. All transcript parsing and
// pricing is reused from token-cost.mjs's analyze() — this file never
// reimplements that.
//
// A task whose agentId/sessionId is missing, or whose transcript can't be
// found, is reported `resolved: false` with null cost/token fields — this
// is an expected, non-error outcome (AC5), never a thrown exception. The
// CLI's exit code is always 0: an unresolved task is forensic information,
// not a process failure.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { analyze } from './token-cost.mjs';
import { emitSuccess, emitError } from './lib/cli.mjs';

// --- projects-root resolution --------------------------------------------
//
// Mirrors token-cost.mjs's own (unexported) projectsRootFrom default:
// explicit override first, then the same TOKEN_COST_PROJECTS_ROOT env var
// existing tests already use to point away from the real
// ~/.claude/projects (see test/exec/report-real-cost.test.mjs), then the
// real default path. Kept as a last-resort default only, per the task
// brief — not a reimplementation of token-cost's session-target logic.
function projectsRootDefault(opts) {
  return (
    (opts && opts.projectsRoot) ||
    process.env.TOKEN_COST_PROJECTS_ROOT ||
    path.join(os.homedir(), '.claude', 'projects')
  );
}

// Finds the flat <sessionId>.jsonl session file for a given session id by
// searching the top level of every project dir under projectsRoot (flat
// session files live at a project dir's own top level, sibling to its
// <session>/subagents/ dir — see token-cost.mjs's
// newestSessionInProjectDir/analyze() comments). Returns null (never
// throws) when projectsRoot doesn't exist or no project dir has a matching
// file — that is the "transcript file can't be found" case from AC5.
function findSessionFile(projectsRoot, sessionId) {
  if (!sessionId || !fs.existsSync(projectsRoot)) {
    return null;
  }

  let projectDirs;
  try {
    projectDirs = fs
      .readdirSync(projectsRoot)
      .map((name) => path.join(projectsRoot, name))
      .filter((p) => fs.statSync(p).isDirectory());
  } catch {
    return null;
  }

  for (const dir of projectDirs) {
    const candidate = path.join(dir, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Resolves one task's real figures. Never throws: any failure to resolve
// (missing agentId/sessionId, missing transcript, missing subagent entry,
// or an analyze() error) falls through to the `resolved: false` shape.
//
// `analyzeCache` (optional Map keyed by resolved sessionFile path) lets
// callers reuse a single analyze() call's whole-session orchAll/subTotal
// figures (R3.S1) across every task that shares a sessionId, instead of
// paying for analyze() again per task.
export function resolveTaskForensics(task, opts, analyzeCache) {
  const estimated_tokens = task ? task.estimated_tokens : null;
  const unresolved = {
    resolved: false,
    real_tokens: null,
    real_cost_usd: null,
    estimated_tokens,
    deviation_real: null,
  };

  if (!task || !task.agentId || !task.sessionId) {
    return unresolved;
  }

  const projectsRoot = projectsRootDefault(opts);
  const sessionFile = findSessionFile(projectsRoot, task.sessionId);
  if (!sessionFile) {
    return unresolved;
  }

  let result;
  if (analyzeCache && analyzeCache.has(sessionFile)) {
    result = analyzeCache.get(sessionFile);
  } else {
    try {
      result = analyze({ sessionPath: sessionFile });
    } catch {
      return unresolved;
    }
    if (analyzeCache) {
      analyzeCache.set(sessionFile, result);
    }
  }

  const sub = (result.subs || []).find((s) => s.id === task.agentId);
  if (!sub) {
    return unresolved;
  }

  const real_tokens = sub.tokens;
  return {
    resolved: true,
    real_tokens,
    real_cost_usd: sub.cost,
    estimated_tokens,
    deviation_real: real_tokens - estimated_tokens,
  };
}

// Determines the whole-run `incomplete`/`incomplete_reason` flag (R4.S2).
// This is distinct from a single task's `resolved: false`: it only fires
// when NOT ONE task in the whole run could be resolved, i.e. join data is
// missing entirely rather than for just one task among several. Returns
// null (not incomplete) as soon as any task resolved.
function determineIncompleteReason(tasks, results) {
  const anyResolved = Object.values(results).some((r) => r.resolved);
  if (anyResolved) {
    return null;
  }

  const anyUsableAgentId = Object.values(tasks).some((t) => t && t.agentId);
  if (!anyUsableAgentId) {
    return 'no agentId recorded for any task';
  }

  // At least one task had an agentId/sessionId, yet nothing resolved: the
  // transcript/subagents join data itself is missing (no subagents
  // directory found for the resolved session, or no matching session file
  // at all — both read as "the join has nothing to offer").
  return 'no subagents directory found';
}

// Builds the `per_model` block of R1's `signals`: tokens/cost aggregated by
// model, computed directly off the whole session's subagent list (not by
// walking per-task `results`) so its token sum is trivially equal to
// subagents_total.real_tokens regardless of which subset of that session's
// subagents the run's tasks happen to reference (R1.S1). No cached
// analyze() result (nothing resolved at all) -> empty object, matching a
// zeroed subagents_total (R1.S2).
function buildPerModel(subs) {
  const perModel = {};
  for (const sub of subs || []) {
    const model = (sub.models && sub.models[0]) || 'unknown';
    if (!perModel[model]) {
      perModel[model] = { tokens: 0, cost: 0 };
    }
    perModel[model].tokens += sub.tokens;
    perModel[model].cost += sub.cost;
  }
  return perModel;
}

// Cost-based orchestrator/total split. Guards the coste-0 edge case (R1.S2):
// a zero total (nothing resolved, or a resolved run whose priced cost is
// exactly zero) never yields NaN/Infinity — it yields null.
function buildOrchestratorShare(orchestrator, subagentsTotal) {
  const totalUsd = orchestrator.real_cost_usd + subagentsTotal.real_cost_usd;
  return totalUsd > 0 ? orchestrator.real_cost_usd / totalUsd : null;
}

// Same split, but token-based rather than cost-based, for callers who want a
// pricing-independent ratio. Same zero-guard as buildOrchestratorShare.
function buildOrchestratorTokenRatio(orchestrator, subagentsTotal) {
  const totalTokens = orchestrator.real_tokens + subagentsTotal.real_tokens;
  return totalTokens > 0 ? orchestrator.real_tokens / totalTokens : null;
}

// Builds `deviations`: one entry per RESOLVED task with a positive
// estimated_tokens (a zero/missing estimate can't form a real÷estimated
// ratio without dividing by zero), sorted desc so the worst
// over-estimations sort first.
function buildDeviations(results) {
  const items = [];
  for (const [taskId, r] of Object.entries(results)) {
    if (
      r.resolved
      && typeof r.real_tokens === 'number'
      && typeof r.estimated_tokens === 'number'
      && r.estimated_tokens > 0
    ) {
      items.push({
        task_id: taskId,
        real_tokens: r.real_tokens,
        estimated_tokens: r.estimated_tokens,
        ratio: r.real_tokens / r.estimated_tokens,
      });
    }
  }
  items.sort((a, b) => b.ratio - a.ratio);
  return items;
}

// Builds `incidences`: one entry per task that resolveTaskForensics could
// NOT resolve — the task-level counterpart to determineIncompleteReason's
// whole-run verdict, so a run with a mix of resolved/unresolved tasks still
// surfaces exactly which task_ids need attention (R1.S2).
function buildIncidences(tasks, results) {
  const items = [];
  for (const [taskId, r] of Object.entries(results)) {
    if (!r.resolved) {
      const task = tasks[taskId];
      const reason = (!task || !task.agentId || !task.sessionId)
        ? 'missing agentId or sessionId'
        : 'transcript or subagent entry not found';
      items.push({ task_id: taskId, reason });
    }
  }
  return items;
}

// Builds the full R1 `signals` block: per_model / orchestrator_share /
// orchestrator_token_ratio / deviations / incidences / session_count.
// `sessionCount` is the number of distinct sessions runForensics actually
// resolved a task against (the caller passes analyzeCache.size).
function buildSignals(tasks, results, orchestrator, subagentsTotal, subs, sessionCount) {
  return {
    per_model: buildPerModel(subs),
    orchestrator_share: buildOrchestratorShare(orchestrator, subagentsTotal),
    orchestrator_token_ratio: buildOrchestratorTokenRatio(orchestrator, subagentsTotal),
    deviations: buildDeviations(results),
    incidences: buildIncidences(tasks, results),
    session_count: sessionCount,
  };
}

// Builds the `pause_timeline` array (R3.S2) from execution_state.json's
// top-level `pause` field: null (never paused) yields [], never an error.
// A non-null pause carries its own recorded accumulated real_tokens figure
// (pause.real_tokens) — that figure is used as-is, never recomputed.
function buildPauseTimeline(pause) {
  if (!pause) {
    return [];
  }
  return [{ at_task: pause.at_task, real_tokens: pause.real_tokens }];
}

// Runs the full forensics pass for a SPECDIR: reads execution_state.json,
// resolves every task, and writes forensics.json. Returns the same object
// written to forensics.json so the CLI entry point can emit it verbatim via
// the shared {ok,data} envelope. Exported for direct (in-process) testing
// without shelling out.
export function runForensics(specDir, opts) {
  const statePath = path.join(specDir, 'execution_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const tasks = state.tasks || {};

  // Shared across every task's resolution: analyze() returns whole-session
  // orchAll/subTotal figures (not per-task), so tasks sharing a sessionId
  // must reuse the same analyze() call instead of recomputing it (R3.S1).
  const analyzeCache = new Map();

  const results = {};
  for (const [taskId, task] of Object.entries(tasks)) {
    const r = resolveTaskForensics(task, opts, analyzeCache);
    results[taskId] = r;
  }

  // Any one cached analyze() result carries the same whole-session
  // orchAll/subTotal figures; the first is as good as any other.
  const firstAnalyzed = analyzeCache.size > 0 ? analyzeCache.values().next().value : null;
  const orchestrator = {
    real_tokens: firstAnalyzed ? firstAnalyzed.orchAll.tokens : 0,
    real_cost_usd: firstAnalyzed ? firstAnalyzed.orchAll.cost : 0,
  };
  const subagents_total = {
    real_tokens: firstAnalyzed ? firstAnalyzed.subTotal.tokens : 0,
    real_cost_usd: firstAnalyzed ? firstAnalyzed.subTotal.cost : 0,
  };
  const pause_timeline = buildPauseTimeline(state.pause);
  const incompleteReason = determineIncompleteReason(tasks, results);
  const signals = buildSignals(
    tasks,
    results,
    orchestrator,
    subagents_total,
    firstAnalyzed ? firstAnalyzed.subs : [],
    analyzeCache.size,
  );

  const output = { tasks: results, orchestrator, subagents_total, pause_timeline, signals };
  if (incompleteReason) {
    output.incomplete = true;
    output.incomplete_reason = incompleteReason;
  }

  const outPath = path.join(specDir, 'forensics.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

  return output;
}

// --- CLI -------------------------------------------------------------------

function main() {
  const specDir = process.argv[2];
  if (!specDir) {
    emitError('Usage: node forensics.mjs <SPECDIR>', 1);
    return;
  }

  let outcome;
  try {
    outcome = runForensics(specDir);
  } catch (err) {
    emitError(err.message, 1);
    return;
  }

  emitSuccess(outcome);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
