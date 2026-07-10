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
export function resolveTaskForensics(task, opts) {
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
  try {
    result = analyze({ sessionPath: sessionFile });
  } catch {
    return unresolved;
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

function formatSummaryLine(taskId, r) {
  if (r.resolved) {
    return (
      `${taskId}: resolved`
      + ` real_tokens=${r.real_tokens}`
      + ` real_cost_usd=${r.real_cost_usd}`
      + ` estimated_tokens=${r.estimated_tokens}`
      + ` deviation_real=${r.deviation_real}`
    );
  }
  return (
    `${taskId}: unresolved`
    + ` real_tokens=null`
    + ` real_cost_usd=null`
    + ` estimated_tokens=${r.estimated_tokens}`
    + ` deviation_real=null`
  );
}

// Runs the full forensics pass for a SPECDIR: reads execution_state.json,
// resolves every task, writes forensics.json, and returns { results, lines }
// so the CLI entry point can print `lines` verbatim. Exported for direct
// (in-process) testing without shelling out.
export function runForensics(specDir, opts) {
  const statePath = path.join(specDir, 'execution_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const tasks = state.tasks || {};

  const results = {};
  const lines = [];
  for (const [taskId, task] of Object.entries(tasks)) {
    const r = resolveTaskForensics(task, opts);
    results[taskId] = r;
    lines.push(formatSummaryLine(taskId, r));
  }

  const outPath = path.join(specDir, 'forensics.json');
  fs.writeFileSync(outPath, JSON.stringify({ tasks: results }, null, 2) + '\n');

  return { results, lines, outPath };
}

// --- CLI -------------------------------------------------------------------

function main() {
  const specDir = process.argv[2];
  if (!specDir) {
    process.stderr.write('Usage: node forensics.mjs <SPECDIR>\n');
    process.exitCode = 1;
    return;
  }

  let outcome;
  try {
    outcome = runForensics(specDir);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(outcome.lines.join('\n') + '\n');
  process.exitCode = 0;
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
