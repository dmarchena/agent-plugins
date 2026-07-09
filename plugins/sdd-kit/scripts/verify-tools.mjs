// verify-tools.mjs — T1 load inputs for the verify skill (sdd-kit).
// Pure Node ESM, stdlib only. No external dependencies. Does not print: returns data.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkVersioning } from './exec/versioning-check.mjs';
import { currentBranch } from './exec/git.mjs';
import { readConfig } from './exec/config.mjs';
import { rerun } from './exec/verify.mjs';
import { computeRealCost } from './exec/real-cost.mjs';

/**
 * Thrown when a required SPECDIR input (execution_plan.json or spec.md) is
 * missing. `.message` always names the exact missing filename.
 */
export class VerifyInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VerifyInputError';
  }
}

// ---------------------------------------------------------------------------
// spec.md AC checklist parsing
// ---------------------------------------------------------------------------

const AC_SECTION_RE = /^##\s+Acceptance Criteria\s*$/;
const OTHER_H2_RE = /^##\s+/;
const AC_ITEM_RE =
  /^-\s*(?:\[[^\]]*\]\s*)?(AC-E2E|AC\d+)\s*→\s*(R-E2E(?:\.S\d+)?|R\d+(?:\.S\d+)?)\s*\[(auto|manual)\]\s*—\s*(.+)$/;
// Any markdown list item line (a dash followed by a space), used to detect
// AC-shaped lines that fail AC_ITEM_RE instead of silently treating them as
// a wrapped description continuation (R1).
const LIST_ITEM_RE = /^-\s/;

// Parses the "## Acceptance Criteria" section of a spec.md into an array of
// { ac_id, ref, tag, description }, folding wrapped description lines (lines
// that continue a bullet's text on the next line) into a single string.
//
// R1: a line under this section that IS a markdown list item (starts with
// "- ") but does NOT match AC_ITEM_RE is a malformed AC entry (e.g. a
// non-standard ref like "R7-catálogos") — this throws VerifyInputError
// naming the offending line rather than silently dropping it. Lines that are
// not list items (wrapped description continuations, "---" horizontal
// rules, blank lines) are unaffected and keep folding into the current
// item's description exactly as before.
function parseAcChecklist(specText) {
  const lines = specText.split(/\r?\n/);
  const checklist = [];
  let inACSection = false;
  let current = null;

  for (const line of lines) {
    if (AC_SECTION_RE.test(line)) {
      inACSection = true;
      current = null;
      continue;
    }

    if (inACSection && OTHER_H2_RE.test(line) && !AC_SECTION_RE.test(line)) {
      inACSection = false;
      current = null;
      continue;
    }

    if (!inACSection) continue;

    const match = line.match(AC_ITEM_RE);
    if (match) {
      current = {
        ac_id: match[1],
        ref: match[2],
        tag: match[3],
        description: match[4].trim(),
      };
      checklist.push(current);
      continue;
    }

    if (LIST_ITEM_RE.test(line)) {
      throw new VerifyInputError(
        `malformed Acceptance Criteria list item (does not match the expected AC format): ${line}`
      );
    }

    const trimmed = line.trim();
    if (current && trimmed.length > 0 && !trimmed.startsWith('-')) {
      current.description = `${current.description} ${trimmed}`.trim();
    }
  }

  return checklist;
}

// ---------------------------------------------------------------------------
// loadSpecdir
// ---------------------------------------------------------------------------

function assertRequiredFiles(specDir) {
  const planPath = path.join(specDir, 'execution_plan.json');
  const specPath = path.join(specDir, 'spec.md');

  if (!fs.existsSync(planPath)) {
    throw new VerifyInputError(
      `missing execution_plan.json in SPECDIR: ${specDir}`
    );
  }
  if (!fs.existsSync(specPath)) {
    throw new VerifyInputError(`missing spec.md in SPECDIR: ${specDir}`);
  }

  return { planPath, specPath };
}

/**
 * Loads the three SPECDIR inputs (spec.md, execution_plan.json, and
 * execution_state.json if present) without validating the plan against the
 * spec (that already happened in plan-executor's init/check-plan).
 *
 * Throws VerifyInputError before reading/parsing anything else when
 * execution_plan.json or spec.md is missing from specDir.
 *
 * @param {string} specDir
 * @returns {{
 *   checklist: Array<{ ac_id: string, ref: string, tag: 'auto'|'manual', description: string }>,
 *   coverageAcs: Record<string, string[]>,
 *   taskState: Record<string, object>|null,
 *   branch: string|null,
 * }}
 */
export function loadSpecdir(specDir) {
  const { planPath, specPath } = assertRequiredFiles(specDir);

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const specText = fs.readFileSync(specPath, 'utf8');
  const checklist = parseAcChecklist(specText);
  const coverageAcs = (plan.coverage && plan.coverage.acs) || {};

  // R2: cross-check plan.coverage.acs against the parsed checklist — every
  // ac_id the plan claims to cover must have a matching checklist item, or
  // that AC would silently vanish from verify's verdict (never green, never
  // reported as not-green either). Only this direction (plan -> checklist);
  // the inverse (checklist ac_id absent from the plan) is out of scope here,
  // already covered by plan-executor's check-plan. A no-op when
  // plan.coverage.acs is empty/absent.
  const checklistAcIds = new Set(checklist.map((item) => item.ac_id));
  const missingFromChecklist = Object.keys(coverageAcs).filter(
    (acId) => !checklistAcIds.has(acId)
  );
  if (missingFromChecklist.length > 0) {
    throw new VerifyInputError(
      `plan.coverage.acs names AC id(s) missing from the spec.md checklist: ${missingFromChecklist.join(', ')}`
    );
  }

  const statePath = path.join(specDir, 'execution_state.json');
  let taskState = null;
  let branch = null;
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    taskState = state.tasks || {};
    branch = state.branch || null;
  }

  return { checklist, coverageAcs, taskState, branch };
}

// ---------------------------------------------------------------------------
// groundCheck — T2: re-run evidence for [auto] ACs (R2, R2.S1, R2.S2)
// ---------------------------------------------------------------------------

/**
 * Re-verifies `[auto]`-tagged checklist items against the *current* working
 * tree, reusing plan-executor's resume pattern: re-run each covering task's
 * stored `test_cmd` and compare its exit status, rather than trusting the
 * `done` status recorded in execution_state.json at face value.
 *
 * Scope boundary: an AC is only ever placed in `green` or `drift` when ALL of
 * its covering tasks (per `coverageAcs[ac_id]`) are `status === 'done'` *and*
 * have a non-null `test_cmd`. If `taskState` is null, or any covering task is
 * not done yet / has no stored test_cmd, that AC is left out of BOTH lists —
 * no verdict is produced. Reasoning about that "not ready to verify" case
 * belongs to other tasks (incomplete coverage / degraded-manual handling),
 * not to this function. `manual`-tagged checklist items are never considered.
 *
 * @param {Array<{ac_id: string, ref: string, tag: 'auto'|'manual', description: string}>} checklist
 * @param {Record<string, string[]>} coverageAcs - AC id -> covering task_ids.
 * @param {Record<string, {status: string, test_cmd: string|null}>|null} taskState
 * @param {{rerun: (testCmd: string) => {passed: boolean, output: string}}} deps
 * @returns {{
 *   green: string[],
 *   drift: Array<{ac_id: string, task_id: string, test_cmd: string, output: string}>,
 * }}
 */
export function groundCheck(checklist, coverageAcs, taskState, { rerun }) {
  const green = [];
  const drift = [];

  if (!taskState) {
    return { green, drift };
  }

  for (const item of checklist) {
    if (item.tag !== 'auto') continue;

    const taskIds = coverageAcs[item.ac_id] || [];
    if (taskIds.length === 0) continue;

    const readyToVerify = taskIds.every((taskId) => {
      const entry = taskState[taskId];
      return entry && entry.status === 'done' && entry.test_cmd != null;
    });
    if (!readyToVerify) continue;

    let acDrift = [];
    let allPassed = true;
    for (const taskId of taskIds) {
      const entry = taskState[taskId];
      const result = rerun(entry.test_cmd);
      if (!result.passed) {
        allPassed = false;
        acDrift.push({
          ac_id: item.ac_id,
          task_id: taskId,
          test_cmd: entry.test_cmd,
          output: result.output,
        });
      }
    }

    if (allPassed) {
      green.push(item.ac_id);
    } else {
      drift.push(...acDrift);
    }
  }

  return { green, drift };
}

// ---------------------------------------------------------------------------
// tokenDeviations — T6: flag tasks whose real token spend blew past their
// estimate (R6, R6.S1, R6.S2, AC8).
// ---------------------------------------------------------------------------

/**
 * Flags tasks whose `actual_tokens` overshot `estimated_tokens` by more than
 * 2x, so the final verify report can surface them for the user to review.
 *
 * A task is only evaluable when BOTH `actual_tokens` and `estimated_tokens`
 * are non-null; a task not yet run (or run without token bookkeeping) is
 * simply omitted — it is neither "in range" nor "deviated". The deviation
 * itself is recomputed here from the two raw fields (`actual_tokens -
 * estimated_tokens`) rather than trusting the stored `deviation` field, so
 * this function stays correct even if a caller hands it a taskState whose
 * `deviation` field wasn't (re)computed upstream.
 *
 * This is purely informative: the returned entries never carry any kind of
 * "block" flag, and archiving must never be gated on this result (R6.S2).
 *
 * @param {Record<string, {estimated_tokens: number|null, actual_tokens: number|null}>|null} taskState
 * @returns {Array<{ task_id: string, actual_tokens: number, estimated_tokens: number, suggestion: string }>}
 */
export function tokenDeviations(taskState) {
  if (!taskState) {
    return [];
  }

  const deviations = [];
  for (const [taskId, entry] of Object.entries(taskState)) {
    if (entry.actual_tokens == null || entry.estimated_tokens == null) continue;

    if (entry.actual_tokens > 2 * entry.estimated_tokens) {
      deviations.push({
        task_id: taskId,
        actual_tokens: entry.actual_tokens,
        estimated_tokens: entry.estimated_tokens,
        suggestion: `Task ${taskId} used ${entry.actual_tokens} tokens vs an estimate of ${entry.estimated_tokens} (more than 2x over) — review this task's token estimate or reconsider whether its scope/definition was too broad.`,
      });
    }
  }

  return deviations;
}

// ---------------------------------------------------------------------------
// manualConfirmation — per-AC manual confirmation bookkeeping (T3)
// ---------------------------------------------------------------------------

/**
 * Pure bookkeeping primitive for tracking explicit human confirmation of a
 * list of ACs, one by one. This does NOT do any prompting/I-O itself — the
 * real orchestrating conversation is responsible for presenting each item's
 * probe (`description`) to the user and calling `.confirm()`/`.reject()`
 * with the result; this object only remembers the answers and computes the
 * aggregate verdict.
 *
 * Generic over "any AC list": `items` just needs an `ac_id` per entry. This
 * function does not look at `tag` and does not filter — for R3 (manual-only
 * confirmation), the caller filters the loaded checklist to
 * `tag === 'manual'` before calling this. A later task (T4, degraded-manual
 * routing) reuses this exact primitive unfiltered, passing the WHOLE
 * checklist (auto + manual) when `execution_state.json` is absent (R4),
 * since in that mode every AC — regardless of tag — needs explicit human
 * confirmation.
 *
 * Every item starts `'unanswered'`. Only an explicit `.confirm(ac_id)` moves
 * it to `'confirmed'` (green); `.reject(ac_id)` moves it to `'rejected'`.
 * There is no automatic transition out of `'unanswered'` — asking for the
 * report before answering an item (i.e. "the session ends without an
 * answer", R3.S2) leaves it `'unanswered'`, which `.report()` treats the
 * same as `'rejected'`: not green, blocks archiving.
 *
 * @param {Array<{ ac_id: string }>} items
 * @returns {{
 *   confirm: (acId: string) => void,
 *   reject: (acId: string) => void,
 *   status: (acId: string) => 'unanswered'|'confirmed'|'rejected',
 *   report: () => {
 *     green: string[],
 *     notGreen: Array<{ ac_id: string, status: 'rejected'|'unanswered' }>,
 *     allGreen: boolean,
 *   },
 * }}
 */
export function manualConfirmation(items) {
  const statuses = new Map();
  for (const item of items) {
    statuses.set(item.ac_id, 'unanswered');
  }

  function assertKnown(acId) {
    if (!statuses.has(acId)) {
      throw new Error(`manualConfirmation: unknown ac_id "${acId}"`);
    }
  }

  return {
    confirm(acId) {
      assertKnown(acId);
      statuses.set(acId, 'confirmed');
    },
    reject(acId) {
      assertKnown(acId);
      statuses.set(acId, 'rejected');
    },
    status(acId) {
      assertKnown(acId);
      return statuses.get(acId);
    },
    report() {
      const green = [];
      const notGreen = [];
      for (const [ac_id, status] of statuses) {
        if (status === 'confirmed') {
          green.push(ac_id);
        } else {
          notGreen.push({ ac_id, status });
        }
      }
      return { green, notGreen, allGreen: notGreen.length === 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// degradedManualRouting — T4: route the whole checklist to manual
// confirmation when execution_state.json is absent (R4, R4.S1, AC6).
// ---------------------------------------------------------------------------

/**
 * Detects the "degraded" verify case — `execution_state.json` absent from
 * SPECDIR, i.e. `taskState === null` exactly as `loadSpecdir` returns it (see
 * T1) — and, when degraded, routes the ENTIRE checklist (both `[auto]` and
 * `[manual]` items) to `manualConfirmation` for explicit human confirmation.
 * This is the whole point of R4: with no recorded task state there is
 * nothing to re-run test commands against, so every AC — regardless of tag —
 * must be confirmed by a human one by one, exactly like a `[manual]` AC
 * normally is (see the "Manual AC confirmation protocol" in SKILL.md).
 *
 * The detection condition is exactly `taskState === null`, not any kind of
 * falsy/empty check: an empty (but non-null) taskState object is a normal
 * (non-degraded) state with zero recorded tasks, not this degraded case.
 *
 * When NOT degraded, this function does none of the above — it returns
 * `{ degraded: false }` and callers (T7) are expected to only invoke this
 * routing when `taskState === null` in the first place; the non-degraded
 * branch here is intentionally a no-op stub, not a second code path.
 *
 * @param {Array<{ac_id: string, ref: string, tag: 'auto'|'manual', description: string}>} checklist
 * @param {Record<string, object>|null} taskState
 * @returns {
 *   | { degraded: true, reason: string, tracker: ReturnType<typeof manualConfirmation> }
 *   | { degraded: false }
 * }
 */
export function degradedManualRouting(checklist, taskState) {
  if (taskState !== null) {
    return { degraded: false };
  }

  return {
    degraded: true,
    reason:
      'no execution_state.json: verification is fully manual (all ACs, auto and manual, require explicit human confirmation)',
    tracker: manualConfirmation(checklist),
  };
}

// ---------------------------------------------------------------------------
// incompleteCoverage — T5: explain [auto] ACs left out of groundCheck's
// green/drift verdict because their coverage isn't fully 'done' yet
// (R5, R5.S1, R5.S2, AC7).
// ---------------------------------------------------------------------------

/**
 * Explains WHY an `[auto]` checklist item is not (yet) green, for every case
 * that `groundCheck` (T2) silently omits from both its `green` and `drift`
 * lists: a covering task that is `blocked`/`skipped` (R5.S1, AC7), or one
 * that is still `pending`/`running` (R5.S2) — i.e. the plan's execution
 * hasn't finished for that AC. An AC is never reported twice: once ALL of an
 * AC's covering tasks reach `status === 'done'`, this function has nothing
 * to say about it — that AC has moved fully into `groundCheck`'s territory
 * (green or drift), so no entry is produced here for it (T7 merges both
 * lists into the final report without overlap).
 *
 * Only `tag === 'auto'` checklist items are considered; `manual` items are
 * never evaluated here (they are `manualConfirmation`'s territory instead).
 *
 * Scope boundary: when `taskState === null` (no execution_state.json at
 * all), this function returns an empty array — that degraded case is
 * T4-degraded-manual's responsibility (`degradedManualRouting`), not this
 * function's; it is simply not applicable here.
 *
 * For an AC with multiple covering tasks, the FIRST non-done task found (in
 * `coverageAcs[ac_id]` order) determines the reported reason: a
 * blocked/skipped task takes precedence over a pending/running one, since a
 * blocked/skipped task is a harder stop that needs attention first.
 *
 * @param {Array<{ac_id: string, ref: string, tag: 'auto'|'manual', description: string}>} checklist
 * @param {Record<string, string[]>} coverageAcs - AC id -> covering task_ids.
 * @param {Record<string, {status: string, incidencia?: string|null}>|null} taskState
 * @returns {Array<{
 *   ac_id: string,
 *   task_id: string,
 *   status: string,
 *   incidencia?: string|null,
 *   reason: 'blocked-or-skipped'|'not-finished',
 * }>}
 */
export function incompleteCoverage(checklist, coverageAcs, taskState) {
  if (!taskState) {
    return [];
  }

  const entries = [];

  for (const item of checklist) {
    if (item.tag !== 'auto') continue;

    const taskIds = coverageAcs[item.ac_id] || [];
    if (taskIds.length === 0) continue;

    const allDone = taskIds.every((taskId) => {
      const entry = taskState[taskId];
      return entry && entry.status === 'done';
    });
    if (allDone) continue;

    const blockedOrSkippedId = taskIds.find((taskId) => {
      const entry = taskState[taskId];
      return entry && (entry.status === 'blocked' || entry.status === 'skipped');
    });

    if (blockedOrSkippedId) {
      const entry = taskState[blockedOrSkippedId];
      entries.push({
        ac_id: item.ac_id,
        task_id: blockedOrSkippedId,
        status: entry.status,
        incidencia: entry.incidencia != null ? entry.incidencia : null,
        reason: 'blocked-or-skipped',
      });
      continue;
    }

    const notFinishedId = taskIds.find((taskId) => {
      const entry = taskState[taskId];
      return entry && (entry.status === 'pending' || entry.status === 'running');
    });

    if (notFinishedId) {
      const entry = taskState[notFinishedId];
      entries.push({
        ac_id: item.ac_id,
        task_id: notFinishedId,
        status: entry.status,
        reason: 'not-finished',
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// assembleReport — T7: merge every prior check into one final verdict
// (R7).
// ---------------------------------------------------------------------------

/**
 * Merges the outputs of `groundCheck`, `manualConfirmation`,
 * `degradedManualRouting`, `incompleteCoverage`, and `tokenDeviations` into
 * one final report: a per-AC green/not-green verdict (with a reason and
 * supporting details when not green) plus an overall `allGreen` flag that
 * `archiveIfGreen` (below) gates archiving on.
 *
 * Two modes, decided purely by `degradedResult.degraded`:
 *
 * - **Degraded** (`degradedResult.degraded === true`, i.e. no
 *   `execution_state.json`): every checklist item — `[auto]` and `[manual]`
 *   alike — gets its verdict from `degradedResult.tracker.report()`. In this
 *   mode `groundCheckResult` and `incompleteCoverageResult` are IGNORED
 *   entirely (there is nothing to ground-check without task state); not-green
 *   items get `reason: 'manual-degraded'`.
 * - **Normal** (`degradedResult.degraded === false`): `[auto]` items are
 *   green iff present in `groundCheckResult.green`; otherwise not-green, with
 *   `reason: 'drift'` (details: the matching `groundCheckResult.drift`
 *   entries) if found there, else the `reason` reported by
 *   `incompleteCoverageResult` (`'blocked-or-skipped'` or `'not-finished'`,
 *   details: the matching entries). `[manual]` items are green iff present
 *   in `manualTracker.report().green`; otherwise not-green with the
 *   `manualTracker`'s own status (`'rejected'` or `'unanswered'`) as the
 *   reason. `manualTracker` may be `null` when the checklist has no
 *   `[manual]` ACs at all.
 *
 * `tokenDeviationsResult` is folded into the report verbatim as
 * `deviatedTasks` — purely informational (R6.S2/AC8): it is NEVER consulted
 * when computing any AC's verdict or the overall `allGreen`.
 *
 * `realCostResult` (T6-verify-report, R5.S1) is folded into the report
 * verbatim as `real_cost` — the same `computeRealCost` return shape T4
 * introduced (`{orchestrator, subagents, total}` or `{unavailable, reason}`),
 * additive alongside `deviatedTasks`/the per-AC verdicts: it is NEVER
 * consulted when computing any AC's verdict or the overall `allGreen`
 * either. Optional (defaults to `null` when omitted) so every existing
 * caller of this function keeps working unchanged.
 *
 * @param {Array<{ac_id: string, ref: string, tag: 'auto'|'manual', description: string}>} checklist
 * @param {{green: string[], drift: Array<{ac_id: string, task_id: string, test_cmd: string, output: string}>}} groundCheckResult
 * @param {ReturnType<typeof manualConfirmation>|null} manualTracker
 * @param {{degraded: boolean, reason?: string, tracker?: ReturnType<typeof manualConfirmation>}} degradedResult
 * @param {Array<{ac_id: string, task_id: string, status: string, incidencia?: string|null, reason: string}>} incompleteCoverageResult
 * @param {Array<{task_id: string, actual_tokens: number, estimated_tokens: number, suggestion: string}>} tokenDeviationsResult
 * @param {{orchestrator:{tokens:number,usd:number},subagents:{tokens:number,usd:number},total:{tokens:number,usd:number}}|{unavailable:true,reason:string}|null} [realCostResult]
 * @returns {{
 *   allGreen: boolean,
 *   acs: Array<{
 *     ac_id: string,
 *     ref: string,
 *     tag: 'auto'|'manual',
 *     green: boolean,
 *     reason?: string,
 *     details?: object,
 *   }>,
 *   deviatedTasks: Array<{task_id: string, actual_tokens: number, estimated_tokens: number, suggestion: string}>,
 *   real_cost: {orchestrator:{tokens:number,usd:number},subagents:{tokens:number,usd:number},total:{tokens:number,usd:number}}|{unavailable:true,reason:string}|null,
 * }}
 */
export function assembleReport(
  checklist,
  groundCheckResult,
  manualTracker,
  degradedResult,
  incompleteCoverageResult,
  tokenDeviationsResult,
  realCostResult
) {
  const acs = [];

  if (degradedResult && degradedResult.degraded) {
    const { green, notGreen } = degradedResult.tracker.report();
    const greenSet = new Set(green);
    const notGreenByAc = new Map(notGreen.map((e) => [e.ac_id, e.status]));

    for (const item of checklist) {
      if (greenSet.has(item.ac_id)) {
        acs.push({ ac_id: item.ac_id, ref: item.ref, tag: item.tag, green: true });
      } else {
        acs.push({
          ac_id: item.ac_id,
          ref: item.ref,
          tag: item.tag,
          green: false,
          reason: 'manual-degraded',
          details: { status: notGreenByAc.get(item.ac_id) },
        });
      }
    }
  } else {
    const groundGreenSet = new Set(groundCheckResult.green);

    const driftByAc = new Map();
    for (const d of groundCheckResult.drift) {
      if (!driftByAc.has(d.ac_id)) driftByAc.set(d.ac_id, []);
      driftByAc.get(d.ac_id).push(d);
    }

    const incompleteByAc = new Map();
    for (const e of incompleteCoverageResult) {
      if (!incompleteByAc.has(e.ac_id)) incompleteByAc.set(e.ac_id, []);
      incompleteByAc.get(e.ac_id).push(e);
    }

    const manualReport = manualTracker ? manualTracker.report() : null;
    const manualGreenSet = manualReport ? new Set(manualReport.green) : new Set();
    const manualStatusByAc = manualReport
      ? new Map(manualReport.notGreen.map((e) => [e.ac_id, e.status]))
      : new Map();

    for (const item of checklist) {
      if (item.tag === 'auto') {
        if (groundGreenSet.has(item.ac_id)) {
          acs.push({ ac_id: item.ac_id, ref: item.ref, tag: item.tag, green: true });
        } else if (driftByAc.has(item.ac_id)) {
          acs.push({
            ac_id: item.ac_id,
            ref: item.ref,
            tag: item.tag,
            green: false,
            reason: 'drift',
            details: { entries: driftByAc.get(item.ac_id) },
          });
        } else if (incompleteByAc.has(item.ac_id)) {
          const entries = incompleteByAc.get(item.ac_id);
          acs.push({
            ac_id: item.ac_id,
            ref: item.ref,
            tag: item.tag,
            green: false,
            reason: entries[0].reason,
            details: { entries },
          });
        } else {
          // Not covered by any of the three sources — nothing has produced
          // a verdict for this AC yet (e.g. missing coverage.acs entry).
          acs.push({
            ac_id: item.ac_id,
            ref: item.ref,
            tag: item.tag,
            green: false,
            reason: 'not-evaluated',
          });
        }
      } else {
        if (manualGreenSet.has(item.ac_id)) {
          acs.push({ ac_id: item.ac_id, ref: item.ref, tag: item.tag, green: true });
        } else {
          const status = manualStatusByAc.get(item.ac_id) || 'unanswered';
          acs.push({
            ac_id: item.ac_id,
            ref: item.ref,
            tag: item.tag,
            green: false,
            reason: status,
          });
        }
      }
    }
  }

  const allGreen = acs.every((a) => a.green);

  return {
    allGreen,
    acs,
    deviatedTasks: tokenDeviationsResult || [],
    real_cost: realCostResult !== undefined ? realCostResult : null,
  };
}

// ---------------------------------------------------------------------------
// versioningGate — T6: policy-driven pre-archive versioning check
// (R5, R5.S1-R5.S5).
// ---------------------------------------------------------------------------

function runGit(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

// Same heading regex as exec/versioning-check.mjs's readChangelogHeadings —
// duplicated here (rather than importing an unexported helper) because this
// module reads changelog TEXT AT A REF (via `git show`), not from a live file
// on disk, so it can't reuse that function's fs.readFileSync directly.
function parseChangelogHeadings(text) {
  if (!text) return [];
  const headings = [];
  for (const line of text.split('\n')) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) headings.push(match[1]);
  }
  return headings;
}

function parsePluginVersion(text) {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    return typeof raw.version === 'string' ? raw.version : null;
  } catch {
    return null;
  }
}

const PLUGIN_PATH_RE = /^plugins\/([^/]+)\//;

function touchedPluginNames(touchedFiles) {
  const seen = [];
  for (const file of touchedFiles) {
    const match = PLUGIN_PATH_RE.exec(file.replace(/\\/g, '/'));
    if (match && !seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

// Reads `ref:filePath` via `git show`; returns null when the ref or path
// doesn't exist (e.g. the plugin/changelog is brand new on this branch).
function readAtRef(ref, filePath, cwd) {
  const res = runGit(['show', `${ref}:${filePath}`], cwd);
  return res.status === 0 ? res.stdout : null;
}

// Files changed between the merge-base of `baseRef`/HEAD and HEAD — i.e. the
// files this branch's own commits actually touched, not the full diff to
// baseRef's current tip. Returns `[]` (rather than throwing) when `baseRef`
// doesn't exist or the repo has no common history with it, so a caller with
// versioningPolicy 'disabled' is never forced to have a real `main` branch.
function computeTouchedFiles(cwd, baseRef) {
  const mergeBaseRes = runGit(['merge-base', baseRef, 'HEAD'], cwd);
  if (mergeBaseRes.status !== 0) return [];
  const base = mergeBaseRes.stdout.trim();
  const diffRes = runGit(['diff', base, 'HEAD', '--name-only'], cwd);
  if (diffRes.status !== 0) return [];
  return diffRes.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

// Builds the `before` baseline `checkVersioning` expects (see its own
// docstring), reading each relevant file's content AT the merge-base commit
// via `git show` rather than assuming a real working tree checkout of
// baseRef exists.
function buildVersioningBaseline(cwd, baseRef, policy, touchedFiles, changelogPath) {
  const mergeBaseRes = runGit(['merge-base', baseRef, 'HEAD'], cwd);
  const base = mergeBaseRes.status === 0 ? mergeBaseRes.stdout.trim() : baseRef;

  if (policy === 'plugin-changelog') {
    const before = {};
    for (const plugin of touchedPluginNames(touchedFiles)) {
      const versionText = readAtRef(base, `plugins/${plugin}/.claude-plugin/plugin.json`, cwd);
      const changelogText = readAtRef(base, `plugins/${plugin}/CHANGELOG.md`, cwd);
      before[plugin] = {
        version: parsePluginVersion(versionText),
        changelogHeadings: parseChangelogHeadings(changelogText),
      };
    }
    return before;
  }

  if (policy === 'changelog-only') {
    const changelogText = readAtRef(base, changelogPath, cwd);
    return { changelogHeadings: parseChangelogHeadings(changelogText) };
  }

  return {};
}

/**
 * Runs R5's policy-driven versioning gate, scoped to the files this branch's
 * own commits touched (via `git diff <merge-base with baseRef> HEAD
 * --name-only`), immediately before `archiveIfGreen` would otherwise archive.
 *
 * Deliberate fast path (R5.S1, AC14): when `config.versioningPolicy` is
 * `'disabled'` (or unset, `readConfig`'s own default), this returns
 * `{ touchedFiles: [], warnings: [], blocking: [] }` WITHOUT computing
 * touched files, reading any git history, or calling `checkVersioning` at
 * all — not merely an empty result of running the check.
 *
 * Otherwise it computes `touchedFiles` and the `before` baseline (reading
 * each relevant file's content at the merge-base via `git show`, never
 * assuming a real checkout of `baseRef`), calls `checkVersioning` from
 * `exec/versioning-check.mjs`, and splits its warnings into `blocking`
 * (anything except `'wrong-segment'`) vs. the full `warnings` list — a
 * `'wrong-segment'` warning (R5.S4) is reported but never blocks; every
 * other kind (`'missing-bump'`, `'missing-changelog'`,
 * `'missing-bump-and-changelog'`, `'missing-changelog-entry'`) does
 * (R5.S3, R5.S5).
 *
 * @param {object} args
 * @param {string} args.cwd
 * @param {{versioningPolicy: string, branchPrefixes: Record<string,string>, changelogPath: string}} args.config
 *   - as returned by `readConfig` (exec/config.mjs).
 * @param {string} [args.branchPrefix] - literal branch-name prefix (e.g. the
 *   `fix` in `fix/<slug>`), used for `plugin-changelog`'s segment check.
 *   Defaults to the current branch's own prefix segment (via
 *   `currentBranch(cwd)`, split on `/`) when omitted.
 * @param {string} [args.baseRef] - ref to diff against for the touched-files
 *   list and the "before" baseline. Defaults to `'main'`.
 * @returns {{
 *   touchedFiles: string[],
 *   warnings: {plugin: string|null, kind: string, message: string}[],
 *   blocking: {plugin: string|null, kind: string, message: string}[],
 * }}
 */
export function versioningGate({ cwd, config, branchPrefix, baseRef = 'main' }) {
  const policy = (config && config.versioningPolicy) || 'disabled';
  if (policy === 'disabled') {
    return { touchedFiles: [], warnings: [], blocking: [] };
  }

  const resolvedBranchPrefix =
    branchPrefix !== undefined ? branchPrefix : (currentBranch(cwd).split('/')[0] || '');

  const touchedFiles = computeTouchedFiles(cwd, baseRef);
  const changelogPath = (config && config.changelogPath) || 'CHANGELOG.md';
  const before = buildVersioningBaseline(cwd, baseRef, policy, touchedFiles, changelogPath);

  const warnings = checkVersioning({
    cwd,
    touchedFiles,
    config,
    branchPrefix: resolvedBranchPrefix,
    before,
  });
  const blocking = warnings.filter((w) => w.kind !== 'wrong-segment');

  return { touchedFiles, warnings, blocking };
}

// ---------------------------------------------------------------------------
// archiveIfGreen — T7: archive the SPECDIR once every AC is green
// (R7, R7.S1, R7.S2, R7.S3; gated by versioningGate for R5, R5.S1-R5.S5).
// ---------------------------------------------------------------------------

/**
 * Archives `specDir` to a sibling `archived/<slug>/` directory (i.e.
 * `docs/specs/archived/<slug>/` when `specDir` is `docs/specs/<slug>/`) via
 * `git mv` + a commit, but ONLY when `report.allGreen` is true (R7.S1). When
 * it isn't, this does nothing — no `git mv`, no commit — and instead names
 * exactly which ACs are not green and why (R7.S2).
 *
 * Operates on the CURRENT branch, whatever it is — unlike plan-executor's
 * per-task `commitTask`, this deliberately does NOT guard against `main`/
 * `master`: verify is explicitly allowed to archive on `main` (R7).
 *
 * Collision guard (R7.S3): if the destination directory already exists,
 * this refuses before running ANY git command — neither `specDir` nor the
 * pre-existing destination is touched.
 *
 * Versioning gate (R5, R5.S1-R5.S5): once the checklist itself is fully
 * green, and only when the caller opts in via `options.versioning` (an
 * object carrying at least `config`, as returned by `readConfig` from
 * `exec/config.mjs`), this runs `versioningGate` BEFORE touching git at all.
 * When `config.versioningPolicy` is `'disabled'`/unset, or `options.versioning`
 * is omitted entirely, this adds no behavior beyond today's R7 (R5.S1) — it
 * doesn't even call `versioningGate`. Otherwise: any blocking warning
 * (everything except `'wrong-segment'`) refuses to archive and reports
 * exactly which plugin/changelog and which gap (R5.S3, R5.S5), same shape as
 * the not-all-ACs-green refusal; a `'wrong-segment'`-only result (R5.S4)
 * does NOT block — archiving proceeds normally and the warning rides along
 * on the success result as `versioningWarnings` for the caller to print.
 *
 * @param {string} specDir
 * @param {{allGreen: boolean, acs: Array<{ac_id: string, green: boolean, reason?: string}>}} report
 * @param {{
 *   cwd?: string,
 *   versioning?: {
 *     config: {versioningPolicy: string, branchPrefixes: Record<string,string>, changelogPath: string},
 *     branchPrefix?: string,
 *     baseRef?: string,
 *   },
 * }} [options]
 * @returns {
 *   | { archived: true, destination: string, commit: string, versioningWarnings?: Array<{plugin: string|null, kind: string, message: string}> }
 *   | { archived: false, reason: 'not all ACs green', notGreenAcs: Array<{ac_id: string, reason?: string}> }
 *   | { archived: false, reason: 'collision', destination: string }
 *   | { archived: false, reason: 'versioning policy not satisfied', versioningWarnings: Array<{plugin: string|null, kind: string, message: string}> }
 * }
 */
export function archiveIfGreen(specDir, report, { cwd, versioning } = {}) {
  if (!report.allGreen) {
    const notGreenAcs = report.acs
      .filter((a) => !a.green)
      .map((a) => ({ ac_id: a.ac_id, reason: a.reason }));
    return { archived: false, reason: 'not all ACs green', notGreenAcs };
  }

  const gitCwd = cwd || process.cwd();

  let versioningWarnings = [];
  const policy = versioning && versioning.config && (versioning.config.versioningPolicy || 'disabled');
  if (versioning && policy && policy !== 'disabled') {
    const gate = versioningGate({
      cwd: gitCwd,
      config: versioning.config,
      branchPrefix: versioning.branchPrefix,
      ...(versioning.baseRef !== undefined ? { baseRef: versioning.baseRef } : {}),
    });
    versioningWarnings = gate.warnings;
    if (gate.blocking.length > 0) {
      return {
        archived: false,
        reason: 'versioning policy not satisfied',
        versioningWarnings: gate.blocking,
      };
    }
  }

  const resolvedSpecDir = path.resolve(specDir);
  const slug = path.basename(resolvedSpecDir);
  const destination = path.join(path.dirname(resolvedSpecDir), 'archived', slug);

  if (fs.existsSync(destination)) {
    return { archived: false, reason: 'collision', destination };
  }

  // git mv requires the destination's parent directory to already exist.
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  const mvRes = runGit(['mv', resolvedSpecDir, destination], gitCwd);
  if (mvRes.status !== 0) {
    throw new Error(`git mv failed: ${mvRes.stderr}`);
  }

  const commitRes = runGit(
    ['commit', '-m', `verify: archive ${slug} (all ACs green)`],
    gitCwd
  );
  if (commitRes.status !== 0) {
    throw new Error(`git commit failed: ${commitRes.stderr}`);
  }

  const hashRes = runGit(['rev-parse', '--short', 'HEAD'], gitCwd);
  const commit = hashRes.stdout.trim();

  return {
    archived: true,
    destination,
    commit,
    ...(versioningWarnings.length > 0 ? { versioningWarnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// CLI — T1-verify-cli: wires the deterministic functions above into
// one-line `node verify-tools.mjs <sub> SPECDIR [args]` subcommands, mirroring
// exec-tools.mjs's shape (parseFlags/out/die + a main() dispatcher). This
// section is guarded behind the `import.meta.url` check at the bottom so
// importing this module (as ~10 existing test files do) never triggers argv
// parsing or process.exit — only running it directly as a script does.
// ---------------------------------------------------------------------------

function die(msg, code = 1) {
  process.stderr.write(msg + '\n');
  process.exit(code);
}

function out(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

// Minimal --flags parser (value in the next token), same convention as
// exec-tools.mjs's parseFlags.
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

// Reads --verdicts <path> (a JSON array of { ac_id, verdict: 'confirmed'|'rejected' },
// the same file-based convention as exec-tools.mjs's `complete --batch`) and
// applies each entry to a manualConfirmation-shaped tracker. An entry whose
// ac_id isn't tracked by `tracker` (e.g. it names an [auto] AC while not in
// degraded mode) is silently ignored rather than crashing the whole report —
// this file is meant to resolve manual/degraded ACs, nothing else. An AC with
// no entry in the file simply stays 'unanswered' (tracker's own default) —
// this function never invents a confirmation.
function applyVerdicts(tracker, verdictsPath) {
  if (!tracker || !verdictsPath) return;
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(verdictsPath, 'utf8'));
  } catch (e) {
    throw new Error(`could not read/parse --verdicts file ${verdictsPath}: ${e.message}`);
  }
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || typeof entry.ac_id !== 'string') continue;
    try {
      if (entry.verdict === 'confirmed') tracker.confirm(entry.ac_id);
      else if (entry.verdict === 'rejected') tracker.reject(entry.ac_id);
    } catch {
      // Unknown ac_id for this tracker — not a [manual]/degraded AC. Ignore.
    }
  }
}

// Shared pipeline behind `report` and `archive` (SKILL.md's documented
// sequence): loadSpecdir -> groundCheck -> build a manual-confirmation
// tracker for [manual] ACs (skipped when degraded) -> degradedManualRouting
// -> incompleteCoverage -> tokenDeviations -> computeRealCost -> assembleReport.
// Never reads interactive stdin: [manual]/degraded ACs are resolved solely
// from an optional --verdicts file, and anything left unanswered simply
// stays 'unanswered' (not green) rather than blocking on a prompt.
//
// `realCostOpts` (T6-verify-report): extra options merged into the
// `computeRealCost` call, ahead of `boundary` (which always comes from the
// SPECDIR's own execution_state.json `branch`, per T4/T5's convention of
// stamping the run's branch name into the transcript once at `init`).
// Production call sites (cmdReport/cmdArchive below) never pass this —
// it exists so tests can point computeRealCost at a fixture session
// (`sessionPath`/`projectsRoot`/etc.) instead of auto-discovering the live
// session. `computeRealCost` never throws, so a missing/unresolvable
// session degrades to `{ unavailable: true, reason }` rather than failing
// the whole report.
function buildReport(specDir, verdictsPath, realCostOpts = {}) {
  const { checklist, coverageAcs, taskState, branch } = loadSpecdir(specDir);

  const groundCheckResult = groundCheck(checklist, coverageAcs, taskState, { rerun });
  const degradedResult = degradedManualRouting(checklist, taskState);

  let manualTracker = null;
  if (degradedResult.degraded) {
    applyVerdicts(degradedResult.tracker, verdictsPath);
  } else {
    const manualItems = checklist.filter((item) => item.tag === 'manual');
    if (manualItems.length > 0) {
      manualTracker = manualConfirmation(manualItems);
      applyVerdicts(manualTracker, verdictsPath);
    }
  }

  const incompleteCoverageResult = incompleteCoverage(checklist, coverageAcs, taskState);
  const tokenDeviationsResult = tokenDeviations(taskState);
  const realCostResult = computeRealCost({ boundary: branch, ...realCostOpts });

  return assembleReport(
    checklist,
    groundCheckResult,
    manualTracker,
    degradedResult,
    incompleteCoverageResult,
    tokenDeviationsResult,
    realCostResult
  );
}

// ground-check <specDir>: re-runs [auto] ACs' stored test commands against
// the current working tree (T2/groundCheck) and prints the raw green/drift
// verdict, without the manual/degraded/coverage machinery `report` adds.
function cmdGroundCheck(specDir) {
  let checklist; let coverageAcs; let taskState;
  try {
    ({ checklist, coverageAcs, taskState } = loadSpecdir(specDir));
  } catch (e) {
    if (e instanceof VerifyInputError) return die(`VerifyInputError: ${e.message}`, 1);
    throw e;
  }
  const result = groundCheck(checklist, coverageAcs, taskState, { rerun });
  out({ status: 'ground-check', ...result });
}

// report <specDir> [--verdicts <path>]: full deterministic verify pipeline,
// never blocking on interactive input (R1.S3).
function cmdReport(specDir, flags) {
  let report;
  try {
    const verdictsPath = flags.verdicts && flags.verdicts !== true ? String(flags.verdicts) : null;
    report = buildReport(specDir, verdictsPath);
  } catch (e) {
    if (e instanceof VerifyInputError) return die(`VerifyInputError: ${e.message}`, 1);
    throw e;
  }
  out({ status: 'report', ...report });
}

// archive <specDir> [--verdicts <path>]: re-runs the same pipeline as
// `report` to get a fresh report, then archives iff every AC is green.
// Exits 0 whether or not it actually archived — the `status`/`archived`
// field in the JSON tells the caller which.
function cmdArchive(specDir, flags) {
  let report;
  try {
    const verdictsPath = flags.verdicts && flags.verdicts !== true ? String(flags.verdicts) : null;
    report = buildReport(specDir, verdictsPath);
  } catch (e) {
    if (e instanceof VerifyInputError) return die(`VerifyInputError: ${e.message}`, 1);
    throw e;
  }
  const cwd = process.cwd();
  const config = readConfig(cwd);
  const result = archiveIfGreen(specDir, report, { cwd, versioning: { config } });
  out({ status: result.archived ? 'archived' : 'not-archived', ...result });
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, pos } = parseFlags(rest);
  switch (cmd) {
    case 'ground-check': return cmdGroundCheck(pos[0]);
    case 'report': return cmdReport(pos[0], flags);
    case 'archive': return cmdArchive(pos[0], flags);
    default:
      die('Usage: verify-tools.mjs <ground-check|report|archive> <specDir> [--verdicts <path>]', 1);
  }
}

// Guard: only run the CLI when this file is executed directly (`node
// verify-tools.mjs ...`), never when it's `import`ed — ~10 existing test
// files import this module in-process to call its exported functions
// directly, and must never trigger argv parsing or process.exit as a side
// effect of that import.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
