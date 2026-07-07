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
import {
  ensureBranch, commitTask, currentBranch,
} from './exec/git.mjs';
import { readConfig, readChangeType, resolvePrefix } from './exec/config.mjs';
import { rerun, confirm } from './exec/verify.mjs';
import { exceeds, blockAndSkip } from './exec/budget.mjs';
import { resumeGround } from './exec/resume.mjs';
import { extractIds } from './exec/extract.mjs';

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
  // R2: the branch prefix follows the spec's recorded Change type through
  // the project's .sdd-kit.json (falling back to the built-in identity map,
  // and to 'feat' when no Change type is recorded at all — R2.S3).
  const changeType = readChangeType(p.spec);
  const config = readConfig(process.cwd());
  const prefix = resolvePrefix(changeType, config);
  const { branch, created } = ensureBranch(p.slug, process.cwd(), prefix);
  setBranch(state, branch);
  persist(p.state, state);
  const batch = readyBatch(plan, [], { max: 3 });
  const result = { ok: true, plan_id: plan.plan_id, branch, branch_created: created, first_batch: batch, total_tasks: plan.tasks.length };
  if (!changeType) {
    result.note = 'spec.md has no "Change type:" line; defaulting the branch prefix to "feat". '
      + 'Consider adding an explicit Change type (feat/fix/chore/refactor/docs) near the top of the spec.';
  }
  out(result);
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

// Shared core of `complete`: verifies one task's evidence, commits it if
// green, records its state entry. Used by both the single-task path and the
// batch path so the two stay byte-identical (R2.S1/AC4) — this is the one
// place that decides done vs not-done and writes to state/git; callers only
// differ in how they gather `entry` and when they persist/print.
//
// entry: { taskId, tokens, testCmd, rojo, verde, message, files }
//   files (optional) — paths to stage for this task's commit instead of the
//   whole tree; see git.mjs#commitTask for why a batch needs this.
function completeOne(plan, state, statePath, entry) {
  const {
    taskId, tokens, testCmd, rojo, verde, message, files = null,
  } = entry;
  const task = plan.tasks.find((t) => t.task_id === taskId);
  if (!task) return { status: 'error', task_id: taskId, error: 'UNKNOWN_TASK: ' + taskId };

  const evidence = { rojo_passed: rojo === 'pass', verde_passed: verde === 'pass' };
  const res = confirm(task, evidence, testCmd);

  if (res.done) {
    const msg = message || `${taskId}: test + implementation (green verified)`;
    // Persist this task's OWN status/tokens/test_cmd before committing, so
    // the commit captures its own flip, not the previous task's (the bug
    // this fixes). The commit hash can't be known before the commit exists
    // (embedding a commit's own hash inside itself isn't achievable without
    // amend-per-task gymnastics), so it's recorded afterwards, same as
    // before this fix — it's a convenience cache (also recoverable via
    // `git log`, since the message includes the task_id), not the
    // substantive audit data, so it's fine for it to trail its own commit.
    recordResult(state, taskId, { status: 'done', actual_tokens: tokens, test_cmd: testCmd, commit: null });
    persist(statePath, state);
    const hash = commitTask(taskId, msg, process.cwd(), files, statePath);
    recordResult(state, taskId, { status: 'done', actual_tokens: tokens, test_cmd: testCmd, commit: hash });
    persist(statePath, state);
    return { status: 'done', task_id: taskId, commit: hash, actual_tokens: tokens, deviation: state.tasks[taskId].deviation };
  }

  // Not green: records an incident. 'no-red' => user decision; 'rerun-failed'/'not-green' => failed attempt (R6).
  const incidencia = res.reason === 'no-red' ? 'no red evidence'
    : res.reason === 'rerun-failed' ? 'orchestrator rerun failed after reported green'
      : 'subagent did not report green';
  recordResult(state, taskId, { status: 'pending', actual_tokens: tokens, test_cmd: testCmd, incidencia });
  persist(statePath, state);
  return { status: 'not-done', task_id: taskId, reason: res.reason, incidencia, rerun_output: res.rerun_output };
}

// complete <specDir> <taskId> --tokens N --test-cmd CMD --rojo pass|fail --verde pass|fail [--message MSG]
// Records the result of a subagent attempt and applies deterministic verification.
function cmdComplete(specDir, taskId, flags) {
  const p = paths(specDir);
  const { plan } = loadPlan(p.spec, p.plan);
  const state = read(p.state);
  if (!plan.tasks.find((t) => t.task_id === taskId)) die('UNKNOWN_TASK: ' + taskId, 1);

  const testCmd = flags['test-cmd'] === true || flags['test-cmd'] === undefined ? null : String(flags['test-cmd']);
  const tokens = flags.tokens !== undefined && flags.tokens !== true ? parseInt(flags.tokens, 10) : null;
  const message = (flags.message && flags.message !== true) ? String(flags.message) : null;

  // R1.S2: the single-task path must never fall back to git.mjs's `add -A`
  // whole-tree stage — it requires an explicit, non-empty, comma-separated
  // list of the task's own touched files (--files a.mjs,b.mjs), or it
  // refuses to stage/commit anything at all. This must be checked BEFORE
  // completeOne runs so a missing list can't reach git.mjs#stage.
  const filesRaw = (flags.files && flags.files !== true) ? String(flags.files) : '';
  const files = filesRaw.split(',').map((f) => f.trim()).filter((f) => f.length > 0);
  if (files.length === 0) {
    die("complete: refusing to commit without an explicit file list — pass the task's touched files", 1);
  }

  const result = completeOne(plan, state, p.state, {
    taskId, tokens, testCmd, rojo: flags.rojo, verde: flags.verde, message, files,
  });
  out(result);
}

// complete <specDir> --batch <path/to/batch.json>
// Closes up to 3 tasks (a ready batch, R4.S1) in a SINGLE invocation instead
// of one `complete` per task (R2.S1). batch.json is a JSON array of:
//   { task_id, tokens, test_cmd, rojo, verde, message?, files? }
// (same fields as the single-task flags, snake_case since they come from a
// file, not argv). Each entry still gets its own re-run verification, its
// own commit (atomic — see files above) and its own state entry: this is the
// same completeOne() the single-task path uses, just looped once per
// process instead of once per invocation. A task that doesn't reach green
// is reported `not-done` with its incidencia and does NOT stop, revert, or
// block the rest of the batch (R2.S2/AC5).
function cmdCompleteBatch(specDir, batchPath) {
  const p = paths(specDir);
  const { plan } = loadPlan(p.spec, p.plan);
  const state = read(p.state);

  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  } catch (e) {
    return die('BATCH_INVALIDO: could not read/parse ' + batchPath + ': ' + e.message, 1);
  }
  if (!Array.isArray(entries) || entries.length === 0) die('BATCH_INVALIDO: expected a non-empty JSON array of task entries', 1);
  if (entries.length > 3) die('BATCH_INVALIDO: a batch closes at most 3 tasks (' + entries.length + ' given)', 1);

  // Validate all task_ids up front so a typo doesn't leave a partially-closed batch.
  for (const e of entries) {
    if (!e || typeof e.task_id !== 'string' || !plan.tasks.find((t) => t.task_id === e.task_id)) {
      die('UNKNOWN_TASK: ' + (e && e.task_id) + ' (in batch ' + batchPath + ')', 1);
    }
  }

  const results = [];
  for (const e of entries) {
    // completeOne persists internally (before AND after its commit) so each
    // task's own flip is captured by its own commit, and a crash mid-batch
    // still leaves the already-committed tasks correctly recorded in state.
    const result = completeOne(plan, state, p.state, {
      taskId: e.task_id,
      tokens: e.tokens != null ? parseInt(e.tokens, 10) : null,
      testCmd: e.test_cmd != null ? String(e.test_cmd) : null,
      rojo: e.rojo,
      verde: e.verde,
      message: e.message || null,
      files: Array.isArray(e.files) ? e.files : null,
    });
    results.push(result);
  }
  out({ status: 'batch', results });
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

// extract <specDir> <ID> [ID...]: prints the verbatim spec.md block for each
// ID. Scenario IDs (R<n>.S<m> or R-E2E.S<m>) print their full #### block up
// to (not including) the next header of level <=4; AC IDs (AC<n> or AC-E2E)
// print just their single checklist line. Human/subagent-readable plain
// text, not the JSON out() convention the other commands use. If ANY
// requested ID isn't found, nothing is printed for it (no partial/invented
// block) and the process exits non-zero naming the missing ID(s) on stderr.
function cmdExtract(specDir, ids) {
  if (!ids || ids.length === 0) {
    die('Usage: exec-tools.mjs extract <specDir> <ID> [ID...]', 1);
  }
  const p = paths(specDir);
  let specText;
  try {
    specText = fs.readFileSync(p.spec, 'utf8');
  } catch (err) {
    die(`could not read spec.md: ${p.spec} (${err.message})`, 1);
  }
  const { blocks, missing } = extractIds(specText, ids);
  if (missing.length > 0) {
    die(`ID(s) not found in spec.md: ${missing.join(', ')}`, 1);
  }
  const parts = ids.map((id) => `--- ${id} ---\n${blocks.get(id)}`);
  process.stdout.write(parts.join('\n\n') + '\n');
}

// --- dispatch ----------------------------------------------------------------

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, pos } = parseFlags(rest);
  switch (cmd) {
    case 'init': return cmdInit(pos[0]);
    case 'next': return cmdNext(pos[0]);
    case 'complete':
      return flags.batch ? cmdCompleteBatch(pos[0], String(flags.batch)) : cmdComplete(pos[0], pos[1], flags);
    case 'block': return cmdBlock(pos[0], pos[1]);
    case 'resume': return cmdResume(pos[0]);
    case 'report': return cmdReport(pos[0]);
    case 'extract': return cmdExtract(pos[0], pos.slice(1));
    default:
      die('Usage: exec-tools.mjs <init|next|complete|block|resume|report|extract> <specDir> [...]', 1);
  }
}

main();
