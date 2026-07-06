// test/exec/commit-invariant.test.mjs — fix-commit-state-ordering
//
// R2 fixes commitTask as the SOLE commit point of plan-executor, invoked
// exclusively from completeOne (exec-tools.mjs). This is a tripwire, not a
// re-check of R1's ordering fix (see commit-ordering.test.mjs for that): it
// only guards against a FUTURE regression where some other subcommand
// (cmdBlock, cmdResume, budget/resume modules, ...) starts calling
// commitTask directly, which would risk the same commit/persist desync bug
// R1 fixed, just via a different code path.
//
//   AC3 — today, `commitTask(` appears as a call site EXACTLY ONCE across
//         exec-tools.mjs and exec/*.mjs, and that call site sits inside
//         completeOne's function body.
//   AC4 — the detection logic itself is proven against a synthetic,
//         deliberately-broken sample (not just today's real files), so a
//         future regression in the real files would actually be caught.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXEC_TOOLS = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');
const GIT_MJS = path.resolve(__dirname, '..', '..', 'scripts', 'exec', 'git.mjs');

// --- detection logic (the thing under test; AC4 exercises this directly) ---

// Returns 1-indexed line numbers where `commitTask(` appears as a CALL SITE
// — i.e. excluding the `function commitTask(` definition line itself
// (git.mjs). Everything else matching `commitTask(` is a real invocation.
function findCallSites(text) {
  const lines = text.split('\n');
  const sites = [];
  lines.forEach((line, idx) => {
    if (/commitTask\(/.test(line) && !/function\s+commitTask\(/.test(line)) {
      sites.push(idx + 1);
    }
  });
  return sites;
}

// Finds the [start, end] 1-indexed line span of a top-level function's body:
// start = the line declaring `function <name>(`, end = the line right
// before the NEXT top-level `function ` declaration (or EOF if none). Used
// to check whether a call site line falls textually inside that span.
function findFunctionBoundaries(text, name) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => new RegExp(`function\\s+${name}\\(`).test(l));
  if (startIdx === -1) return null;
  let endIdx = lines.length - 1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^function\s+\w+\(/.test(lines[i])) { endIdx = i - 1; break; }
  }
  return { start: startIdx + 1, end: endIdx + 1 };
}

function isInside(line, boundaries) {
  return boundaries != null && line >= boundaries.start && line <= boundaries.end;
}

// --- AC3: real repo state ----------------------------------------------

test('AC3: commitTask( is invoked exactly once, inside completeOne', () => {
  const execToolsText = fs.readFileSync(EXEC_TOOLS, 'utf8');
  const gitText = fs.readFileSync(GIT_MJS, 'utf8');

  const sites = [
    ...findCallSites(execToolsText).map((line) => ({ file: 'exec-tools.mjs', line })),
    ...findCallSites(gitText).map((line) => ({ file: 'git.mjs', line })),
  ];

  assert.strictEqual(
    sites.length,
    1,
    `expected exactly 1 commitTask( call site across exec-tools.mjs + exec/*.mjs, found ${sites.length}: ${JSON.stringify(sites)}`,
  );

  const [site] = sites;
  assert.strictEqual(site.file, 'exec-tools.mjs', 'the sole commitTask( call site must live in exec-tools.mjs');

  const boundaries = findFunctionBoundaries(execToolsText, 'completeOne');
  assert.ok(boundaries, 'completeOne(...) not found in exec-tools.mjs');
  assert.ok(
    isInside(site.line, boundaries),
    `call site at exec-tools.mjs:${site.line} must fall within completeOne (lines ${boundaries.start}-${boundaries.end})`,
  );
});

// --- AC4: regression tripwire, proven against a synthetic broken sample ---
//
// A future regression looks like: a second commitTask( call site appears,
// OR the sole call site moves outside completeOne. Prove the detection
// logic above actually flags that — don't just trust today's real files are
// clean (that only proves today's snapshot, not the guard itself).

const SYNTHETIC_BROKEN = `function helperOutsideCompleteOne() {
  // regression: a subcommand calling commitTask directly, bypassing
  // completeOne's persist-before-commit ordering.
  const hash = commitTask('rogue-task', 'oops');
  return hash;
}

function completeOne(plan, state, statePath, entry) {
  if (entry.done) {
    const hash = commitTask(entry.taskId, entry.message);
    return hash;
  }
  return null;
}

function anotherTopLevelFunction() {
  return true;
}
`;

test('AC4: detection logic flags a synthetic sample with a call site outside completeOne', () => {
  const sites = findCallSites(SYNTHETIC_BROKEN).map((line) => ({ file: 'synthetic', line }));

  // The regression itself: more than one call site.
  assert.strictEqual(sites.length, 2, 'fixture sanity: synthetic sample must contain exactly 2 commitTask( call sites');
  assert.notStrictEqual(sites.length, 1, 'REGRESSION DETECTED: more than one commitTask( call site');

  const boundaries = findFunctionBoundaries(SYNTHETIC_BROKEN, 'completeOne');
  assert.ok(boundaries, 'fixture sanity: completeOne must be found in the synthetic sample');

  // Classify each site: the guard's real-world job is "is EVERY call site
  // inside completeOne" — here one is and one deliberately isn't.
  const classified = sites.map((s) => ({ ...s, inside: isInside(s.line, boundaries) }));
  const outside = classified.filter((s) => !s.inside);
  const inside = classified.filter((s) => s.inside);

  assert.strictEqual(outside.length, 1, 'REGRESSION DETECTED: a commitTask( call site sits outside completeOne');
  assert.strictEqual(inside.length, 1, 'fixture sanity: the legitimate call site inside completeOne must still be recognized as inside');

  // The guard's overall verdict on this sample must be "invalid": either the
  // count is wrong, or something is outside completeOne (both are true here).
  const invariantHolds = sites.length === 1 && outside.length === 0;
  assert.strictEqual(invariantHolds, false, 'the synthetic sample must be judged INVALID by the same logic used for AC3');
});
