#!/usr/bin/env node

// forensics-analysis-validate.mjs — deterministic checker for R2 of
// docs/specs/forensics-analysis/spec.md: confirms a hand/skill-authored
// SPECDIR/forensics-analysis.md correctly reconciles with its enriched
// SPECDIR/forensics.json.
//
// This module does NOT compose forensics-analysis.md (that's the skill's
// judgment layer) -- it only checks the hard invariants R2 requires of an
// already-written document:
//   1. A deterministic cost-reconstruction section is present.
//   2. Judgment sections (opportunities / bad practices) are clearly
//      separated from the deterministic section.
//   3. The anchor figures in the deterministic section -- total USD and
//      orchestrator share -- numerically match forensics.json (within
//      float tolerance).
//   4. Every judgment finding cites the name of a signal that is actually
//      present in forensics.json (no fabricated signal names).
//   5. Degraded case: unresolved tasks (resolved:false, or a whole-run
//      `incomplete: true`) are marked as such, carry no fabricated
//      numeric figures, and the document states the join is incomplete.
//
// Convention this validator expects a compliant forensics-analysis.md to
// follow (documented here since R2 leaves the doc's structure orientativa
// / illustrative rather than a rigid schema -- these are the minimal
// literal markers this checker looks for, not an exhaustive template):
//   - A heading (any '#'..'######' level) whose text contains
//     "deterministic" or "determinista" marks the cost-reconstruction
//     section.
//   - Heading(s) whose text contains "judgment" or "juicio" mark the
//     judgment sections (opportunities / bad practices / whatever they're
//     named).
//   - Inside the deterministic section, a line containing "Total USD"
//     followed by a "$<number>" figure, and a line containing
//     "Orchestrator share" followed by a "<number>%" figure.
//   - Judgment findings are bullet list items ("- ..." / "* ...") inside a
//     judgment section; each must literally contain the name of a signal
//     present in forensics.json (a top-level signals key, a per_model
//     model name, or a deviations/incidences task_id).
//   - For each unresolved task (tasks[id].resolved === false), some line
//     mentioning that task_id must also mark it unresolved (e.g.
//     "unresolved" / "sin resolver" / "resolved: false"), and no line
//     mentioning that task_id may carry a fabricated real-figure (a "$"
//     amount, or an explicit "real tokens"/"real cost" number) -- plan
//     estimates (estimated_tokens) are not real figures and are allowed.
//   - When any task is unresolved, or forensicsJson.incomplete === true,
//     the document must state somewhere that the join is incomplete
//     ("incomplete" / "incompleto").

import fs from 'node:fs';
import path from 'node:path';

import { emitSuccess, emitError } from './lib/cli.mjs';

const USD_TOLERANCE_ABS = 0.01;
const SHARE_TOLERANCE_ABS = 0.002; // 0.2 percentage points, as a fraction

function numbersClose(a, b, absTol) {
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) return false;
  const tol = Math.max(absTol, Math.abs(b) * 0.001);
  return Math.abs(a - b) <= tol;
}

// --- markdown structure parsing --------------------------------------------

function parseHeadings(lines) {
  const headings = [];
  lines.forEach((line, idx) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) headings.push({ level: m[1].length, title: m[2].trim(), line: idx });
  });
  return headings;
}

// Returns the raw text (line range) of the section starting right after
// headings[idx], up to (not including) the next heading whose level is <=
// headings[idx].level, or end of document.
function sectionBody(lines, headings, idx) {
  const h = headings[idx];
  const start = h.line + 1;
  let end = lines.length;
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= h.level) {
      end = headings[i].line;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

// Returns the indentation (number of leading spaces) before the bullet
// marker if `line` starts a list item ("- ..." / "* ..."), or null
// otherwise.
function bulletIndent(line) {
  const m = /^(\s*)[-*]\s+\S/.exec(line);
  return m ? m[1].length : null;
}

// Extracts judgment findings as their FULL text: a bullet's first line plus
// any continuation lines belonging to the same list item -- lines more
// indented than the bullet marker, up to (not including) the next
// bullet/heading/blank-line separator.
function findBulletFindings(sectionText) {
  const rawLines = sectionText.split('\n');
  const findings = [];
  let current = null; // { lines: string[], indent: number }

  const flush = () => {
    if (current) findings.push(current.lines.join(' '));
    current = null;
  };

  for (const line of rawLines) {
    const indent = bulletIndent(line);
    if (indent !== null) {
      flush();
      current = { lines: [line.trim()], indent };
      continue;
    }
    const isBlank = /^\s*$/.test(line);
    const isHeading = /^\s*#{1,6}\s+/.test(line);
    if (current && !isBlank && !isHeading) {
      const leadingLen = /^(\s*)/.exec(line)[1].length;
      if (leadingLen > current.indent) {
        current.lines.push(line.trim());
        continue;
      }
    }
    flush();
  }
  flush();

  return findings;
}

// --- signal-name catalog ----------------------------------------------------

function knownSignalNames(forensicsJson) {
  const names = new Set();
  const signals = (forensicsJson && forensicsJson.signals) || {};

  for (const key of Object.keys(signals)) {
    names.add(key);
  }
  for (const model of Object.keys(signals.per_model || {})) {
    names.add(model);
  }
  for (const dev of signals.deviations || []) {
    if (dev && dev.task_id) names.add(dev.task_id);
  }
  for (const inc of signals.incidences || []) {
    if (inc && inc.task_id) names.add(inc.task_id);
  }
  return names;
}

// --- main entry point --------------------------------------------------------

/**
 * Validates a forensics-analysis.md document against the forensics.json it
 * claims to summarize. Never throws for a merely-invalid document -- it
 * returns { ok:false, errors:[...] }. Only genuinely malformed inputs
 * (non-string mdText, non-object forensicsJson) throw.
 *
 * @param {string} mdText - full text of forensics-analysis.md
 * @param {object} forensicsJson - parsed, enriched forensics.json
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateForensicsAnalysis(mdText, forensicsJson) {
  if (typeof mdText !== 'string') {
    throw new TypeError('validateForensicsAnalysis: mdText must be a string');
  }
  if (!forensicsJson || typeof forensicsJson !== 'object') {
    throw new TypeError('validateForensicsAnalysis: forensicsJson must be an object');
  }

  const errors = [];
  const lines = mdText.split('\n');
  const headings = parseHeadings(lines);

  // --- 1 & 2: deterministic section present, judgment sections separated
  const detIdx = headings.findIndex((h) => /deterministic|determinista/i.test(h.title));
  const judgmentIdxs = headings
    .map((h, i) => i)
    .filter((i) => /judgment|juicio/i.test(headings[i].title));

  if (detIdx === -1) {
    errors.push('missing a deterministic cost-reconstruction section (no heading mentions "deterministic"/"determinista")');
  }
  if (judgmentIdxs.length === 0) {
    errors.push('missing judgment section(s) (no heading mentions "judgment"/"juicio")');
  }
  if (detIdx !== -1 && judgmentIdxs.length > 0 && judgmentIdxs.some((i) => i < detIdx)) {
    errors.push('judgment section(s) are not clearly separated from the deterministic section (a judgment heading precedes the deterministic one)');
  }

  // --- 3: anchor figures reconcile with forensics.json
  const orchestrator = forensicsJson.orchestrator || { real_cost_usd: 0 };
  const subagentsTotal = forensicsJson.subagents_total || { real_cost_usd: 0 };
  const expectedTotalUsd = (orchestrator.real_cost_usd || 0) + (subagentsTotal.real_cost_usd || 0);
  const expectedShare = forensicsJson.signals ? forensicsJson.signals.orchestrator_share : null;

  if (detIdx !== -1) {
    const detText = sectionBody(lines, headings, detIdx);

    const totalMatch = /total usd[^$\n]*\$\s*([\d,]+(?:\.\d+)?)/i.exec(detText);
    if (!totalMatch) {
      errors.push('deterministic section has no "Total USD: $<figure>" anchor line');
    } else {
      const mdTotal = parseFloat(totalMatch[1].replace(/,/g, ''));
      if (!numbersClose(mdTotal, expectedTotalUsd, USD_TOLERANCE_ABS)) {
        errors.push(`anchor Total USD mismatch: md says $${mdTotal}, forensics.json (orchestrator.real_cost_usd + subagents_total.real_cost_usd) says $${expectedTotalUsd}`);
      }
    }

    const shareMatch = /orchestrator share[^%\n\d]*([\d.]+)\s*%/i.exec(detText);
    if (expectedShare === null || expectedShare === undefined) {
      if (!shareMatch && !/orchestrator share[^\n]*(n\/a|null|not applicable)/i.test(detText)) {
        errors.push('deterministic section has no "Orchestrator share" anchor line (expected N/A since signals.orchestrator_share is null)');
      }
    } else if (!shareMatch) {
      errors.push('deterministic section has no "Orchestrator share: <figure>%" anchor line');
    } else {
      const mdShare = parseFloat(shareMatch[1]) / 100;
      if (!numbersClose(mdShare, expectedShare, SHARE_TOLERANCE_ABS)) {
        errors.push(`anchor Orchestrator share mismatch: md says ${shareMatch[1]}%, forensics.json signals.orchestrator_share says ${(expectedShare * 100).toFixed(1)}%`);
      }
    }
  }

  // --- 4: every judgment finding cites a real signal name
  if (judgmentIdxs.length > 0) {
    const known = knownSignalNames(forensicsJson);
    for (const idx of judgmentIdxs) {
      const body = sectionBody(lines, headings, idx);
      const findings = findBulletFindings(body);
      for (const finding of findings) {
        const cited = [...known].some((name) => finding.includes(name));
        if (!cited) {
          errors.push(`judgment finding cites no known signal from forensics.json: "${finding}"`);
        }
      }
    }
  }

  // --- 5: degraded case -- unresolved tasks marked, no fabricated figures,
  // join-incomplete stated
  const tasks = forensicsJson.tasks || {};
  const unresolvedIds = Object.entries(tasks)
    .filter(([, t]) => t && t.resolved === false)
    .map(([id]) => id);

  const UNRESOLVED_MARK_RE = /unresolv|no resuelt|sin resolver|resolved:\s*false/i;
  const FABRICATED_FIGURE_RE = /\$\s*[\d,]+(?:\.\d+)?|real[\s_]*(?:tokens?|cost)[^\n\d]{0,15}\d/i;

  for (const taskId of unresolvedIds) {
    const taskLines = lines.filter((line) => line.includes(taskId));
    if (taskLines.length === 0) {
      errors.push(`unresolved task "${taskId}" is not mentioned anywhere in forensics-analysis.md`);
      continue;
    }
    if (!taskLines.some((line) => UNRESOLVED_MARK_RE.test(line))) {
      errors.push(`unresolved task "${taskId}" is mentioned but not clearly marked as unresolved`);
    }
    const fabricated = taskLines.filter((line) => FABRICATED_FIGURE_RE.test(line));
    if (fabricated.length > 0) {
      errors.push(`unresolved task "${taskId}" has a fabricated-looking numeric figure: "${fabricated[0].trim()}"`);
    }
  }

  const needsIncompleteStatement = unresolvedIds.length > 0 || forensicsJson.incomplete === true;
  if (needsIncompleteStatement && !/incomplete|incompleto/i.test(mdText)) {
    errors.push('one or more tasks are unresolved (or forensics.json is marked incomplete) but the document never states the join is incomplete');
  }

  return { ok: errors.length === 0, errors };
}

// --- CLI -------------------------------------------------------------------

function main() {
  const specDir = process.argv[2];
  if (!specDir) {
    emitError('Usage: node forensics-analysis-validate.mjs <SPECDIR>', 1);
    return;
  }

  let mdText;
  let forensicsJson;
  try {
    mdText = fs.readFileSync(path.join(specDir, 'forensics-analysis.md'), 'utf8');
    forensicsJson = JSON.parse(fs.readFileSync(path.join(specDir, 'forensics.json'), 'utf8'));
  } catch (err) {
    emitError(err.message, 1);
    return;
  }

  const outcome = validateForensicsAnalysis(mdText, forensicsJson);
  emitSuccess(outcome);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
