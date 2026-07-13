// test/exec/branch-prefix.test.mjs — R2.S1/R2.S2/R2.S3 (change-type-versioning-policy spec)
//
// Exercises `exec-tools.mjs init` end to end (temp git repo + minimal valid
// spec/plan fixtures), the same way test/exec/e2e.test.mjs does, to verify
// the branch-prefix resolution wired through config.mjs + git.mjs#ensureBranch:
// - R2.S1: change type maps to its own prefix by default (no project config).
// - R2.S2: a project config can override a type to an empty prefix, dropping
//   the leading slash entirely.
// - R2.S3: a spec with no recorded Change type still defaults to feat/<slug>,
//   and init's output carries a note recommending the spec be updated.

import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'exec-tools.mjs');

// --- minimal valid spec+plan fixture (single task, one requirement) ---

function specText(changeTypeLine) {
  return `# Spec: Branch Prefix Fixture

## Purpose

Minimal fixture for the branch-prefix resolution walkthrough.
${changeTypeLine !== null ? `\n${changeTypeLine}\n` : ''}
## Scope

**In scope:**
- One requirement.

**Out of scope (non-goals):**
- Nothing else.

## Functional Requirements

### R1 — Only requirement

Depende de: —

The system SHALL deliver part A.

#### R1.S1 — Happy path
- GIVEN nothing
- WHEN task A runs
- THEN part A is done

## Technical Requirements

- **Stack / framework:** N/A (test fixture).
- **Integrations:** N/A
- **Performance:** N/A
- **Security / privacy:** N/A
- **Data / storage:** N/A
- **Additional constraints:** N/A

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — part A is done

## Assumptions & Open Questions

- None.
`;
}

function planFor(slug) {
  return {
    plan_id: `${slug}-plan`,
    project_name: 'Branch Prefix Fixture',
    global_objective: 'Single-task fixture for branch-prefix resolution.',
    source_spec: 'spec.md',
    confidence: 'low',
    estimated_tokens_total: 1000,
    tasks: [
      {
        task_id: 'task-a',
        source_ids: ['R1.S1'],
        dependencies: [],
        agent_type: 'code_writer',
        subagent: 'general-purpose',
        model: 'sonnet',
        justification: 'Bounded delivery of part A with a clear AC.',
        instructions: 'Implement part A, referencing scenario R1.S1 from the spec.',
        expected_output_schema: 'Part A implemented and its test passing',
        satisfies_acs: ['AC1'],
        estimated_tokens: 1000,
        actual_tokens: null,
        deviation: null,
        test_contract: [
          { ref: 'R1.S1', assertion: 'Part A is done and its test passes' },
        ],
      },
    ],
    coverage: {
      requirements: { R1: ['task-a'] },
      acs: { AC1: ['task-a'] },
    },
  };
}

// --- helpers ------------------------------------------------------------------

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function cli(repo, args) {
  const out = execFileSync('node', [CLI, ...args], { cwd: repo, encoding: 'utf8' });
  return JSON.parse(out);
}

// Builds a fresh temp git repo with docs/specs/<slug>/{spec.md,execution_plan.json}
// committed on main, optionally with a root .sdd-kit.json.
function makeRepo(slug, changeTypeLine, sddKitJson) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-branch-prefix-'));
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), specText(changeTypeLine));
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(planFor(slug), null, 2));
  if (sddKitJson) {
    fs.writeFileSync(path.join(repo, '.sdd-kit.json'), JSON.stringify(sddKitJson, null, 2));
  }
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture']);
  return { repo, specDir };
}

// --- tests ----------------------------------------------------------------

test('R2.S1: a fix-typed spec with no project config produces a branch prefixed fix rather than feat', () => {
  const slug = 'r2s1-demo';
  const { repo, specDir } = makeRepo(slug, 'Change type: fix', null);
  try {
    const init = cli(repo, ['init', specDir]);
    assert.strictEqual(init.ok, true);
    assert.strictEqual(init.data.branch, `fix/${slug}`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('R2.S2: a project config mapping a type to an empty prefix produces a branch equal to the slug with no leading slash', () => {
  const slug = 'r2s2-demo';
  const { repo, specDir } = makeRepo(slug, 'Change type: chore', { branchPrefixes: { fix: 'bugfix', chore: '' } });
  try {
    const init = cli(repo, ['init', specDir]);
    assert.strictEqual(init.ok, true);
    assert.strictEqual(init.data.branch, slug);
    assert.ok(!init.data.branch.startsWith('/'), 'branch must not have a leading slash');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('R2.S3: a spec with no recorded change type still creates a feat-prefixed branch', () => {
  const slug = 'r2s3-demo';
  const { repo, specDir } = makeRepo(slug, null, null);
  try {
    const init = cli(repo, ['init', specDir]);
    assert.strictEqual(init.ok, true);
    assert.strictEqual(init.data.branch, `feat/${slug}`);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
