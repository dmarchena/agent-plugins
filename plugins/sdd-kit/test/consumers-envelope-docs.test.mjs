// TDD tests for T9-consumers: prose in the sdd-kit consumer docs (SKILL.md +
// assets + commands/forensics.md) must stop describing the pre-migration
// stdout shapes (bare `{status,...}` objects, "prints a JSON object with a
// `status` field", prose summaries) and instead reference the canonical
// `{ok,data,error}` envelope from scripts/lib/cli.mjs.
//
// See docs/specs/unify-cli-io/spec.md:
//   R4.S1 — "GIVEN los assets/SKILL.md de `verify`, `plan-executor`,
//   `plan-writer`, `spec-forensics` y `commands/forensics.md` / WHEN se
//   revisan tras la migración / THEN ninguno instruye leer el formato
//   antiguo ni parsear prosa de stdout; todos referencian el envelope
//   (`.data`, `.ok`, `.error.reason`)"
//   AC10 — "revisión de SKILL.md/assets/commands (verify, plan-executor,
//   plan-writer, spec-forensics, forensics): ninguno instruye leer
//   prosa/formato antiguo. Manual porque exige juzgar prosa de
//   instrucciones, no comparar strings." (checked here via concrete regexes
//   over the exact pre-migration phrases found in each file, since the
//   phrases themselves are known and stable.)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, relPath), 'utf8');
}

// One entry per file that had (or, per NOTE, deliberately still has) prose
// describing a CLI's stdout shape. `oldPatterns` are the concrete
// pre-migration phrases that must be gone; `envelopePatterns` require at
// least one match each, proving the replacement prose actually names the
// envelope instead of just deleting the old text.
const CASES = [
  {
    file: 'skills/verify/SKILL.md',
    oldPatterns: [
      /prints one JSON object with a `status` field/,
      // The bare (unwrapped) shape - anchored on "prints `{ status:" with
      // no "ok"/"data" in between, so it does NOT false-positive on the
      // migrated `prints \`{ ok: true, data:\n{ status: ...` prose, whose
      // inner object is legitimately nested under `data`.
      /prints `\{ status: 'report', allGreen, acs, deviatedTasks \}`/,
    ],
    envelopePatterns: [/data\.status/, /ok:\s*true,\s*data/],
  },
  {
    file: 'skills/verify/assets/archiving-detail.md',
    oldPatterns: [
      /prints\s*\n?`\{\s*status:\s*'report',\s*allGreen,\s*acs,\s*deviatedTasks\s*\}`/,
      /check the `status`\/\s*\n?`archived` field in its JSON output/,
    ],
    envelopePatterns: [/ok:\s*true,\s*data/, /data\.status/, /data\.archived/],
  },
  {
    file: 'skills/verify/assets/verify-cli-detail.md',
    oldPatterns: [/prints one JSON object with a `status` field to stdout/],
    envelopePatterns: [/ok:\s*true,\s*data/, /data\.status/],
  },
  {
    file: 'skills/plan-executor/SKILL.md',
    oldPatterns: [
      /prints one JSON object to stdout — read it and branch on `status`/,
      /\*\*`\{ ok: true, \.\.\. \}`\*\* → prints `branch`, `branch_created`, `first_batch`, `total_tasks`/,
      /A `\{ status: "done", commit, deviation \}` means verified green/,
      /A `\{ status: "not-done", reason, incidencia \}` breaks into three cases/,
    ],
    envelopePatterns: [/ok:\s*true,\s*data/, /data\.status/],
  },
  {
    file: 'skills/plan-executor/assets/task-brief-detail.md',
    oldPatterns: [/Returns `\{ status: "batch", results: \[\.\.\.\] \}`/],
    envelopePatterns: [/ok:\s*true,\s*data/],
  },
  {
    file: 'skills/plan-executor/assets/failures-and-resume.md',
    oldPatterns: [
      /\*\*`\{ status: "resumed", next_batch \}`\*\*/,
      /\*\*`\{ status: "ground-broken", brokenTask, brokenTest \}`\*\*/,
    ],
    envelopePatterns: [/ok:\s*true,\s*data/],
  },
  {
    file: 'skills/spec-forensics/SKILL.md',
    oldPatterns: [/Prints one summary line per task to stdout/],
    envelopePatterns: [/ok:\s*true,\s*data/, /data\.tasks/],
  },
  {
    // NOTE (T9-consumers finding): plan-tools.mjs's `inspect-spec`/`check-plan`
    // SUCCESS paths were NOT migrated to the envelope by T4-plan-tools -
    // verified empirically (`node scripts/plan-tools.mjs inspect-spec ...`
    // still prints the plain line "4 requirements, 5 ACs detected", exit 0,
    // no JSON) despite T4's own expected_output_schema in execution_plan.json
    // promising "los exitos emiten {ok:true,data:...}". So this file's
    // success-path prose is left describing the (still current) plain-text
    // line on purpose - only the ERROR path (which genuinely IS
    // `{ok:false,error:{reason}}` today, confirmed in plan-tools.mjs) is
    // asserted here as referencing the envelope. Flagged upstream instead of
    // silently inventing false envelope prose for a payload that doesn't
    // exist.
    file: 'skills/plan-writer/SKILL.md',
    oldPatterns: [],
    envelopePatterns: [/error\.reason/, /ok:\s*false,\s*error:\s*\{\s*reason/],
  },
];

for (const { file, oldPatterns, envelopePatterns } of CASES) {
  test(`R4.S1/AC10: ${file} no longer instructs the pre-migration stdout shape and references the {ok,data,error} envelope`, () => {
    const content = read(file);

    for (const pattern of oldPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `${file} still contains the pre-migration phrase matching ${pattern}`
      );
    }

    for (const pattern of envelopePatterns) {
      assert.match(
        content,
        pattern,
        `${file} does not reference the envelope via ${pattern}`
      );
    }
  });
}

test('R4.S1/AC10: commands/forensics.md has no output-format prose of its own (pure delegator) - nothing to migrate', () => {
  const content = read('commands/forensics.md');
  // forensics.md just forwards $ARGUMENTS to the spec-forensics skill; it
  // never itself describes a stdout shape, so there is no pre-migration
  // phrase to remove and no envelope reference to require here - verified by
  // reading the file (6 lines, no mention of JSON/status/fields).
  assert.doesNotMatch(content, /\bstatus\b/i);
  assert.doesNotMatch(content, /JSON object/i);
});
