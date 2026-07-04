// verify-tools.mjs — T1 load inputs for the verify skill (sdd-kit).
// Pure Node ESM, stdlib only. No external dependencies. Does not print: returns data.

import fs from 'node:fs';
import path from 'node:path';

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
  /^-\s*(?:\[[^\]]*\]\s*)?(AC-E2E|AC\d+)\s*→\s*(R-E2E\.S\d+|R\d+\.S\d+)\s*\[(auto|manual)\]\s*—\s*(.+)$/;

// Parses the "## Acceptance Criteria" section of a spec.md into an array of
// { ac_id, ref, tag, description }, folding wrapped description lines (lines
// that continue a bullet's text on the next line) into a single string.
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
 * }}
 */
export function loadSpecdir(specDir) {
  const { planPath, specPath } = assertRequiredFiles(specDir);

  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const specText = fs.readFileSync(specPath, 'utf8');
  const checklist = parseAcChecklist(specText);
  const coverageAcs = (plan.coverage && plan.coverage.acs) || {};

  const statePath = path.join(specDir, 'execution_state.json');
  let taskState = null;
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    taskState = state.tasks || {};
  }

  return { checklist, coverageAcs, taskState };
}
