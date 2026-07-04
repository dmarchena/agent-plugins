#!/usr/bin/env node
// CLI for the exec phase (plan-executor skill). Wires the deterministic
// modules under scripts/exec/ into subcommands invoked at runtime by
// SKILL.md. All the deterministic logic (validation, DAG batches, state,
// re-run verification, git, budget, resume) lives in the modules; this file
// only orchestrates and prints so the agent following the skill can decide
// the next step.
//
// Pure Node ESM, stdlib only. The plan is IMMUTABLE: execution_plan.json is
// never written; state lives in execution_state.json next to it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlan, readyBatch } from './exec/plan.mjs';
import {
  initState, recordResult, recordPause, setBranch, persist, read,
} from './exec/state.mjs';
import { ensureBranch, commitTask, currentBranch } from './exec/git.mjs';
import { rerun, confirm } from './exec/verify.mjs';
import { exceeds, blockAndSkip } from './exec/budget.mjs';
import { resumeGround } from './exec/resume.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- path utilities -----------------------------------------------------

function paths(specDir) {
  return {
    spec: path.join(specDir, 'spec.md'),
    plan: path.join(specDir, 'execution_plan.json'),
    state: path.join(specDir, 'execution_state.json'),
    slug: path.basename(path.resolve(specDir)),
  };
}

function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function out(obj) {
  // Stable JSON output so the skill can read it unambiguously.
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

// Minimal --flags parser (value in the next token).
function parseFlags(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { flags[key] = true; }
      else { flags[key] = next; i++; }
    } else { pos.push(a); }
  }
  return { flags, pos };
}

function doneAndExcluded(state) {
  const done = new Set();
  const excluded = new Set();
  for (const [id, t] of Object.entries(state.tasks)) {
    if (t.status === 'done') done.add(id);
    else if (t.status === 'blocked' || t.status === 'skipped' || t.status === 'running') excluded.add(id);
  }
  return { done, excluded };
}

function counts(state) {
  const c = { pending: 0, running: 0, done: 0, blocked: 0, skipped: 0 };
  for (const t of Object.values(state.tasks)) c[t.status]++;
  return c;
}

// --- subcommands -------------------------------------------------------------

// init <specDir>: validates the plan and starts execution (state + branch).
// Invalid plan => no branch or state is created (R1.S2/AC1).
function cmdInit(specDir) {
  const p = paths(specDir);
  const { valid, error, plan } = loadPlan(p.spec, p.plan);
  if (!valid) {
    die('INVALID_PLAN: ' + error + '\nFix the plan with plan-writer before executing.', 2);
  }
  const state = initState(plan);
  const { branch, created } = ensureBranch(p.slug); // creates/reuses feat/<slug>
  setBranch(state, branch);
  persist(p.state, state);
  const batch = readyBatch(plan, [], { max: 3 });
  out({ ok: true, plan_id: plan.plan_id, branch, branch_created: created, first_batch: batch, total_tasks: plan.tasks.length });
}

// next <specDir>: next runnable batch (<=3), or a budget pause, or done.
function cmdNext(specDir) {
  const p = paths(specDir);
  const { plan } = loadPlan(p.spec, p.plan);
  const state = read(p.state);

  const budget = exceeds(state);
  if (budget.exceeded) {
    const { done } = doneAndExcluded(state);
    const nextId = readyBatch(plan, done, { max: 1, excluded: doneAndExcluded(state).excluded })[0] || null;
    recordPause(state, { reason: 'budget: actual > 2x estimated executed', real_tokens: budget.real, estimated_tokens: budget.estimated, at_task: nextId });
    persist(p.state, state);
    out({ status: 'paused', reason: 'budget', real: budget.real, estimated: budget.estimated, at_task: nextId });
    return;
  }

  const { done, excluded } = doneAndExcluded(state);
  const batch = readyBatch(plan, done, { max: 3, excluded });
  const c = counts(state);
  if (batch.length === 0) {
    if (c.pending === 0 && c.running === 0) out({ status: 'complete', counts: c });
    else out({ status: 'stalled', counts: c, note: 'no runnable tasks (dependencies blocked/skipped)' });
    return;
  }
  out({ status: 'run', batch, counts: c });
}

// complete <specDir> <taskId> --tokens N --test-cmd CMD --rojo pass|fail --verde pass|fail [--message MSG]
// Records the result of a subagent attempt and applies deterministic verification.
function cmdComplete(specDir, taskId, flags) {
  const p = paths(specDir);
  const { plan } = loadPlan(p.spec, p.plan);
  const state = read(p.state);
  const task = plan.tasks.find((t) => t.task_id === taskId);
  if (!task) die('UNKNOWN_TASK: ' + taskId, 1);

  const testCmd = flags['test-cmd'] === true || flags['test-cmd'] === undefined ? null : String(flags['test-cmd']);
  const tokens = flags.tokens !== undefined && flags.tokens !== true ? parseInt(flags.tokens, 10) : null;
  const evidence = {
    rojo_passed: flags.rojo === 'pass',
    verde_passed: flags.verde === 'pass',
  };
  const res = confirm(task, evidence, testCmd);

  if (res.done) {
    const msg = (flags.message && flags.message !== true) ? String(flags.message)
      : `${taskId}: test + implementation (green verified)`;
    const hash = commitTask(taskId, msg);
    recordResult(state, taskId, { status: 'done', actual_tokens: tokens, test_cmd: testCmd, commit: hash });
    persist(p.state, state);
    out({ status: 'done', task_id: taskId, commit: hash, actual_tokens: tokens, deviation: state.tasks[taskId].deviation });
    return;
  }

  // Not green: records an incident. 'no-red' => user decision; 'rerun-failed'/'not-green' => failed attempt (R6).
  const incidencia = res.reason === 'no-red' ? 'no red evidence'
    : res.reason === 'rerun-failed' ? 'orchestrator rerun failed after reported green'
      : 'subagent did not report green';
  recordResult(state, taskId, { status: 'pending', actual_tokens: tokens, test_cmd: testCmd, incidencia });
  persist(p.state, state);
  out({ status: 'not-done', task_id: taskId, reason: res.reason, incidencia, rerun_output: res.rerun_output });
}

// block <specDir> <taskId>: after exhausting the retry, blocks and skips dependents (R6.S1).
function cmdBlock(specDir, taskId) {
  const p = paths(specDir);
  const { plan } = loadPlan(p.spec, p.plan);
  const state = read(p.state);
  const r = blockAndSkip(plan, state, taskId);
  persist(p.state, state);
  out({ status: 'blocked', ...r });
}

// resume <specDir>: verifies the ground (re-run of done tests) before continuing (R7).
function cmdResume(specDir) {
  const p = paths(specDir);
  const { valid, error, plan } = loadPlan(p.spec, p.plan);
  if (!valid) die('INVALID_PLAN: ' + error, 2);
  const state = read(p.state);
  const ground = resumeGround(plan, state, { rerun });
  if (!ground.ok) {
    out({ status: 'ground-broken', brokenTask: ground.brokenTask, brokenTest: ground.brokenTest });
    process.exit(4);
  }
  const { done, excluded } = doneAndExcluded(state);
  const batch = readyBatch(plan, done, { max: 3, excluded });
  out({ status: 'resumed', next_batch: batch, counts: counts(state) });
}

// report <specDir>: final report (done/blocked/skipped, actual vs estimated tokens, ACs).
function cmdReport(specDir) {
  const p = paths(specDir);
  const { plan } = loadPlan(p.spec, p.plan);
  const state = read(p.state);
  const per = [];
  let realTotal = 0; let estTotal = 0;
  const acs = new Set();
  for (const task of plan.tasks) {
    const st = state.tasks[task.task_id];
    per.push({ task_id: task.task_id, status: st.status, actual_tokens: st.actual_tokens, estimated_tokens: st.estimated_tokens, deviation: st.deviation, incidencia: st.incidencia, commit: st.commit });
    if (st.actual_tokens != null) realTotal += st.actual_tokens;
    estTotal += st.estimated_tokens;
    if (st.status === 'done') for (const ac of (task.satisfies_acs || [])) acs.add(ac);
  }
  out({
    status: 'report', branch: state.branch, counts: counts(state),
    tokens: { real: realTotal, estimated: estTotal }, per_task: per,
    acs_satisfechos: [...acs].sort(), pause: state.pause,
  });
}

// --- dispatch ----------------------------------------------------------------

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, pos } = parseFlags(rest);
  switch (cmd) {
    case 'init': return cmdInit(pos[0]);
    case 'next': return cmdNext(pos[0]);
    case 'complete': return cmdComplete(pos[0], pos[1], flags);
    case 'block': return cmdBlock(pos[0], pos[1]);
    case 'resume': return cmdResume(pos[0]);
    case 'report': return cmdReport(pos[0]);
    default:
      die('Usage: exec-tools.mjs <init|next|complete|block|resume|report> <specDir> [...]', 1);
  }
}

main();
