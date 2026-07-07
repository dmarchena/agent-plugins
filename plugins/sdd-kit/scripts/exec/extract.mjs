// extract.mjs — verbatim text-block extractor for spec.md, used by the
// `extract` subcommand of exec-tools.mjs. Pure Node ESM, stdlib only.
//
// Re-implements only the minimal parsing needed, using the SAME regex
// literals as plan-tools.mjs (SCEN_HEADER_RE) and verify-tools.mjs
// (AC_ITEM_RE) — copied here rather than imported, since neither module
// exports them and neither should be modified to add exports. Keeping the
// literals identical (not new patterns) is what keeps this consistent with
// those modules' behavior.

// From plan-tools.mjs: matches a scenario header line, e.g. "#### R2.S1 — ...".
const SCEN_HEADER_RE = /^####\s+((?:R-E2E|R\d+)\.S\d+)\b/;

// A scenario's block runs until the next markdown header of level <=4
// (#, ##, ###, or ####) — whichever comes first.
const HEADER_STOP_RE = /^#{1,4}\s+/;

// From verify-tools.mjs: matches a full AC checklist line, e.g.
// "- [ ] AC3 → R2.S1 [auto] — description".
const AC_ITEM_RE =
  /^-\s*(?:\[[^\]]*\]\s*)?(AC-E2E|AC\d+)\s*→\s*(R-E2E\.S\d+|R\d+\.S\d+)\s*\[(auto|manual)\]\s*—\s*(.+)$/;

const SCENARIO_ID_RE = /^(?:R-E2E|R\d+)\.S\d+$/;
const AC_ID_RE = /^(?:AC-E2E|AC\d+)$/;

function extractScenario(lines, id) {
  const startIdx = lines.findIndex((line) => {
    const m = line.match(SCEN_HEADER_RE);
    return m && m[1] === id;
  });
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (HEADER_STOP_RE.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  // Trim trailing blank lines so the block ends at its last content line,
  // not at the blank line(s) separating it from the next header.
  while (endIdx > startIdx + 1 && lines[endIdx - 1].trim() === '') endIdx--;
  return lines.slice(startIdx, endIdx).join('\n');
}

function extractAc(lines, id) {
  const line = lines.find((l) => {
    const m = l.match(AC_ITEM_RE);
    return m && m[1] === id;
  });
  return line === undefined ? null : line;
}

// Extracts the verbatim text block for each requested ID from a spec.md's
// full text.
//
// Returns { blocks: Map<id, string>, missing: string[] }:
// - blocks maps every ID that WAS found to its verbatim text.
// - missing lists (in input order) every ID that was NOT found — an ID
//   present in `missing` is never also present in `blocks` (no partial or
//   invented block is ever produced for a missing ID).
export function extractIds(specText, ids) {
  const lines = specText.split(/\r?\n/);
  const blocks = new Map();
  const missing = [];

  for (const id of ids) {
    let block = null;
    if (SCENARIO_ID_RE.test(id)) {
      block = extractScenario(lines, id);
    } else if (AC_ID_RE.test(id)) {
      block = extractAc(lines, id);
    }
    // Any ID that doesn't match either shape is simply not found.

    if (block === null) missing.push(id);
    else blocks.set(id, block);
  }

  return { blocks, missing };
}
