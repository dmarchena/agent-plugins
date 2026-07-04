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
// fixtures/), expected exit code, and expected substring in stdout or stderr.
const CASES = [
  {
    name: 'valid: inspect-spec detects requirements and ACs',
    args: ['inspect-spec', 'valid/spec.md'],
    expectExit: 0,
    stream: 'stdout',
    substr: '4 requirements, 5 ACs detected',
  },
  {
    name: 'valid: check-plan accepts a well-formed plan',
    args: ['check-plan', 'valid/spec.md', 'valid/plan.json'],
    expectExit: 0,
    stream: 'stdout',
    substr: 'valid plan: 4 tasks',
  },
  {
    name: 'missing-ac-section: missing the Acceptance Criteria section',
    args: ['inspect-spec', 'missing-ac-section/spec.md'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'missing the Acceptance Criteria section',
  },
  {
    name: 'no-r-ids: no R<n> IDs found',
    args: ['inspect-spec', 'no-r-ids/spec.md'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'no R<n> IDs found',
  },
  {
    name: 'cyclic: detects the dependency cycle',
    args: ['check-plan', 'valid/spec.md', 'cyclic/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'cycle:',
  },
  {
    name: 'uncovered-id: uncovered AC',
    args: ['check-plan', 'valid/spec.md', 'uncovered-id/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'uncovered AC:',
  },
  {
    name: 'invalid-schema: missing a required field (model)',
    args: ['check-plan', 'valid/spec.md', 'invalid-schema/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'schema:',
  },
  {
    name: 'bad-instructions-deps: instructions does not reference a previous task',
    args: ['check-plan', 'valid/spec.md', 'bad-instructions-deps/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'instructions does not reference a previous task:',
  },
  {
    name: 'bad-instructions-nodeps: task with no dependencies references a task_id',
    args: ['check-plan', 'valid/spec.md', 'bad-instructions-nodeps/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'task with no dependencies references a task_id:',
  },
  {
    name: 'empty-output-schema: empty expected_output_schema rejected',
    args: ['check-plan', 'valid/spec.md', 'empty-output-schema/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'schema:',
  },
  {
    name: 'bad-test-contract: test_contract ref does not exist in the spec',
    args: ['check-plan', 'valid/spec.md', 'bad-test-contract/plan.json'],
    expectExit: 1,
    stream: 'stderr',
    substr: 'test_contract.ref does not exist in spec:',
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
  const haystack = testCase.stream === 'stdout' ? result.stdout : result.stderr;
  const substrOk = haystack.includes(testCase.substr);

  if (exitOk && substrOk) {
    console.log(`✔ ${testCase.name}`);
  } else {
    failures++;
    console.log(`✘ ${testCase.name}`);
    console.log(
      `  expected: exit ${testCase.expectExit}, ${testCase.stream} contains "${testCase.substr}"`
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
