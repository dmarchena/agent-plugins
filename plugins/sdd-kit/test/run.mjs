#!/usr/bin/env node
// Test runner for the plan-tools.mjs validator (plan-writer skill).
// Pure Node ESM, stdlib only (node:path, node:url, node:child_process).
//
// Runs each fixture as a child process of the validator and asserts exit code
// + expected substring in stdout/stderr. Prints a checkmark/cross line per
// case and a final summary; exit 1 if any case fails, 0 if all pass.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const PLAN_TOOLS = path.join(__dirname, '..', 'scripts', 'plan-tools.mjs');

// Declarative table of cases: name, subcommand + files (relative to
// fixtures/), expected exit code, and an expected substring inside the
// canonical envelope plan-tools.mjs prints on stdout — {ok:true,data:<...>}
// on success, {ok:false,error:{reason:<...>}} on failure (never stderr:
// stdout is the ONLY channel the envelope uses, see scripts/lib/cli.mjs).
const CASES = [
  {
    name: 'valid: inspect-spec detects requirements and ACs',
    args: ['inspect-spec', 'valid/spec.md'],
    expectExit: 0,
    substr: '"requirements":4,"acs":5',
  },
  {
    name: 'valid: check-plan accepts a well-formed plan',
    args: ['check-plan', 'valid/spec.md', 'valid/plan.json'],
    expectExit: 0,
    substr: '"tasks":4',
  },
  {
    name: 'missing-ac-section: missing the Acceptance Criteria section',
    args: ['inspect-spec', 'missing-ac-section/spec.md'],
    expectExit: 1,
    substr: 'missing the Acceptance Criteria section',
  },
  {
    name: 'no-r-ids: no R<n> IDs found',
    args: ['inspect-spec', 'no-r-ids/spec.md'],
    expectExit: 1,
    substr: 'no R<n> IDs found',
  },
  {
    name: 'cyclic: detects the dependency cycle',
    args: ['check-plan', 'valid/spec.md', 'cyclic/plan.json'],
    expectExit: 1,
    substr: 'cycle:',
  },
  {
    name: 'uncovered-id: uncovered AC',
    args: ['check-plan', 'valid/spec.md', 'uncovered-id/plan.json'],
    expectExit: 1,
    substr: 'uncovered AC:',
  },
  {
    name: 'invalid-schema: missing a required field (model)',
    args: ['check-plan', 'valid/spec.md', 'invalid-schema/plan.json'],
    expectExit: 1,
    substr: 'schema:',
  },
  {
    name: 'bad-instructions-deps: instructions does not reference a previous task',
    args: ['check-plan', 'valid/spec.md', 'bad-instructions-deps/plan.json'],
    expectExit: 1,
    substr: 'instructions does not reference a previous task:',
  },
  {
    name: 'bad-instructions-nodeps: task with no dependencies references a task_id',
    args: ['check-plan', 'valid/spec.md', 'bad-instructions-nodeps/plan.json'],
    expectExit: 1,
    substr: 'task with no dependencies references a task_id:',
  },
  {
    name: 'empty-output-schema: empty expected_output_schema rejected',
    args: ['check-plan', 'valid/spec.md', 'empty-output-schema/plan.json'],
    expectExit: 1,
    substr: 'schema:',
  },
  {
    name: 'bad-test-contract: test_contract ref does not exist in the spec',
    args: ['check-plan', 'valid/spec.md', 'bad-test-contract/plan.json'],
    expectExit: 1,
    substr: 'test_contract.ref does not exist in spec:',
  },
  {
    name: 'R1.S1: verifier task with agent_type verifier and test_contract null passes plan validation',
    args: ['check-plan', 'valid/spec.md', 'verifier-valid/plan.json'],
    expectExit: 0,
    substr: '"tasks":4',
  },
  {
    name: 'R1.S2: verifier task with a non-null test_contract is rejected naming the task_id and the null-contract rule',
    args: ['check-plan', 'valid/spec.md', 'verifier-bad-test-contract/plan.json'],
    expectExit: 1,
    substr: 'test_contract must be null for agent_type=verifier: task-e2e',
  },
];

// Arguments ending in .md/.json are relative fixture paths; the rest
// (the subcommand) is passed through as-is.
function resolveArgs(args) {
  return args.map((a) =>
    a.endsWith('.md') || a.endsWith('.json') ? path.join(FIXTURES_DIR, a) : a
  );
}

let failures = 0;

for (const testCase of CASES) {
  const args = resolveArgs(testCase.args);
  const result = spawnSync(process.execPath, [PLAN_TOOLS, ...args], {
    encoding: 'utf8',
  });

  const exitOk = result.status === testCase.expectExit;
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }
  const wantOk = testCase.expectExit === 0;
  const envelopeOk = parsed != null && parsed.ok === wantOk;
  // Success: the substring must appear in the JSON-stringified data payload.
  // Failure: it must appear in error.reason specifically (not just anywhere
  // in stdout), per the envelope contract (parsed.ok / parsed.error.reason).
  const haystack = parsed == null
    ? ''
    : (wantOk ? JSON.stringify(parsed.data) : parsed.error.reason);
  const substrOk = haystack.includes(testCase.substr);

  if (exitOk && envelopeOk && substrOk) {
    console.log(`✔ ${testCase.name}`);
  } else {
    failures++;
    console.log(`✘ ${testCase.name}`);
    console.log(
      `  expected: exit ${testCase.expectExit}, envelope ok:${wantOk}, contains "${testCase.substr}"`
    );
    console.log(
      `  got: exit ${result.status}, stdout=${JSON.stringify(
        result.stdout
      )}, stderr=${JSON.stringify(result.stderr)}`
    );
  }
}

console.log('');
if (failures > 0) {
  console.log(`✘ ${failures}/${CASES.length} cases failed`);
  process.exit(1);
} else {
  console.log(`✔ ${CASES.length}/${CASES.length} cases passed`);
  process.exit(0);
}
