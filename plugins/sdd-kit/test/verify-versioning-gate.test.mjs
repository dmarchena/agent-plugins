// Unit tests for R5 (change-type-versioning-policy spec): the versioning
// gate that archiveIfGreen runs immediately before archiving a fully-green
// SPECDIR, scoped to the files the spec's execution touched on the current
// branch relative to a base ref ('main' by default).
//
// Same isolation convention as test/verify-report-archive.test.mjs: every
// test builds its own fs.mkdtempSync temp repo, never touches the real
// project repo, and is cleaned up with fs.rmSync in a `finally`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { archiveIfGreen } from '../scripts/verify-tools.mjs';

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  }
  return res.stdout.trim();
}

// Repo with an explicit `main` branch (baseRef default), one initial commit.
function initRepoWithMain(prefix) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  git(['init', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'Test'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'initial\n');
  git(['add', '-A'], repo);
  git(['commit', '-m', 'init'], repo);
  return repo;
}

function writePluginFixture(repo, name, version, changelogHeadings) {
  const pluginDir = path.join(repo, 'plugins', name);
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name, version }, null, 2),
  );
  const body = changelogHeadings
    .map((h) => `## ${h}\n\n- Some change.\n`)
    .join('\n');
  fs.writeFileSync(path.join(pluginDir, 'CHANGELOG.md'), `# Changelog\n\n${body}`);
}

function makeSpecDir(repo, slug) {
  const specDir = path.join(repo, 'docs', 'specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'spec.md'), '# demo spec\n');
  fs.writeFileSync(
    path.join(specDir, 'execution_plan.json'),
    JSON.stringify({ tasks: [] }, null, 2),
  );
  return specDir;
}

const defaultBranchPrefixes = {
  feat: 'feat', fix: 'fix', chore: 'chore', refactor: 'refactor', docs: 'docs',
};

const allGreenReport = {
  allGreen: true,
  acs: [{ ac_id: 'AC1', ref: 'R1.S1', tag: 'auto', green: true }],
  deviatedTasks: [],
};

// ---------------------------------------------------------------------------
// R5.S1 / AC14 — policy disabled, no additional check at all
// ---------------------------------------------------------------------------

test('R5.S1/AC14: with policy disabled, a spec with all ACs green archives with no additional check', () => {
  const repo = initRepoWithMain('verify-gate-r5s1-');
  try {
    // Plugin never gets a bump or a new changelog heading on the feature
    // branch — if the versioning check ran despite the disabled policy, it
    // would report a missing bump/changelog and block archiving.
    writePluginFixture(repo, 'sdd-kit', '0.3.4', ['0.3.4']);
    git(['add', '-A'], repo);
    git(['commit', '-m', 'add plugin fixture'], repo);

    git(['checkout', '-b', 'fix/demo'], repo);
    const specDir = makeSpecDir(repo, 'demo');
    fs.mkdirSync(path.join(repo, 'plugins', 'sdd-kit', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'plugins', 'sdd-kit', 'scripts', 'foo.mjs'), '// touch\n');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'touch plugin, no bump, add specdir'], repo);

    const result = archiveIfGreen(specDir, allGreenReport, {
      cwd: repo,
      versioning: {
        config: { versioningPolicy: 'disabled', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
        branchPrefix: 'fix',
      },
    });

    assert.equal(result.archived, true);
    assert.equal(result.versioningWarnings, undefined);
    assert.equal(fs.existsSync(path.join(repo, 'docs', 'specs', 'archived', 'demo')), true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// R5.S2 / AC15 — plugin-changelog, compliant touched plugin
// ---------------------------------------------------------------------------

test('R5.S2/AC15: with plugin-changelog and every touched plugin compliant, verify archives normally', () => {
  const repo = initRepoWithMain('verify-gate-r5s2-');
  try {
    writePluginFixture(repo, 'sdd-kit', '0.3.4', ['0.3.4']);
    git(['add', '-A'], repo);
    git(['commit', '-m', 'add plugin fixture'], repo);

    git(['checkout', '-b', 'fix/demo'], repo);
    // 'fix' expects a patch bump: 0.3.4 -> 0.3.5, plus a new changelog heading.
    writePluginFixture(repo, 'sdd-kit', '0.3.5', ['0.3.5', '0.3.4']);
    const specDir = makeSpecDir(repo, 'demo');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'bump + changelog + specdir'], repo);

    const result = archiveIfGreen(specDir, allGreenReport, {
      cwd: repo,
      versioning: {
        config: { versioningPolicy: 'plugin-changelog', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
        branchPrefix: 'fix',
      },
    });

    assert.equal(result.archived, true);
    assert.deepEqual(result.versioningWarnings ?? [], []);
    assert.equal(fs.existsSync(path.join(repo, 'docs', 'specs', 'archived', 'demo')), true);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// R5.S3 / AC16 — plugin-changelog, missing bump/changelog blocks archiving
// ---------------------------------------------------------------------------

test('R5.S3/AC16: with plugin-changelog and a touched plugin missing its bump and/or changelog, verify does not archive and reports the specific plugin', () => {
  const repo = initRepoWithMain('verify-gate-r5s3-');
  try {
    writePluginFixture(repo, 'sdd-kit', '0.3.4', ['0.3.4']);
    git(['add', '-A'], repo);
    git(['commit', '-m', 'add plugin fixture'], repo);

    git(['checkout', '-b', 'fix/demo'], repo);
    const specDir = makeSpecDir(repo, 'demo');
    fs.mkdirSync(path.join(repo, 'plugins', 'sdd-kit', 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'plugins', 'sdd-kit', 'scripts', 'foo.mjs'), '// touch\n');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'touch plugin, no bump, add specdir'], repo);

    const beforeLog = git(['log', '--oneline'], repo);
    const destination = path.join(repo, 'docs', 'specs', 'archived', 'demo');

    const result = archiveIfGreen(specDir, allGreenReport, {
      cwd: repo,
      versioning: {
        config: { versioningPolicy: 'plugin-changelog', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
        branchPrefix: 'fix',
      },
    });

    assert.equal(result.archived, false);
    assert.ok(Array.isArray(result.versioningWarnings));
    assert.equal(result.versioningWarnings.length, 1);
    const [warning] = result.versioningWarnings;
    assert.equal(warning.plugin, 'sdd-kit');
    assert.match(warning.message, /sdd-kit/);
    assert.match(warning.message, /missing bump/i);
    assert.match(warning.message, /missing changelog entry/i);

    // Nothing moved, nothing committed.
    assert.equal(fs.existsSync(specDir), true);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(git(['log', '--oneline'], repo), beforeLog);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// R5.S4 / AC17 — plugin-changelog, wrong segment warns but still archives
// ---------------------------------------------------------------------------

test('R5.S4/AC17: with plugin-changelog and a touched plugin whose segment is wrong (bump and changelog present), verify warns about the mismatch but still archives', () => {
  const repo = initRepoWithMain('verify-gate-r5s4-');
  try {
    writePluginFixture(repo, 'sdd-kit', '0.3.4', ['0.3.4']);
    git(['add', '-A'], repo);
    git(['commit', '-m', 'add plugin fixture'], repo);

    git(['checkout', '-b', 'fix/demo'], repo);
    // 'fix' expects a patch bump, but the minor segment was bumped instead.
    writePluginFixture(repo, 'sdd-kit', '0.4.0', ['0.4.0', '0.3.4']);
    const specDir = makeSpecDir(repo, 'demo');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'wrong-segment bump + changelog + specdir'], repo);

    const result = archiveIfGreen(specDir, allGreenReport, {
      cwd: repo,
      versioning: {
        config: { versioningPolicy: 'plugin-changelog', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
        branchPrefix: 'fix',
      },
    });

    assert.equal(result.archived, true);
    assert.equal(fs.existsSync(path.join(repo, 'docs', 'specs', 'archived', 'demo')), true);
    assert.ok(Array.isArray(result.versioningWarnings));
    assert.equal(result.versioningWarnings.length, 1);
    const [warning] = result.versioningWarnings;
    assert.equal(warning.plugin, 'sdd-kit');
    assert.equal(warning.kind, 'wrong-segment');
    assert.match(warning.message, /\bfix\b/);
    assert.match(warning.message, /\bminor\b/);
    assert.match(warning.message, /\bpatch\b/);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// R5.S5 / AC18 — changelog-only, missing entry blocks archiving
// ---------------------------------------------------------------------------

test('R5.S5/AC18: with changelog-only and a missing required changelog entry, verify does not archive and reports the missing entry', () => {
  const repo = initRepoWithMain('verify-gate-r5s5-');
  try {
    fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- Initial.\n');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'add root changelog'], repo);

    git(['checkout', '-b', 'feat/demo'], repo);
    const specDir = makeSpecDir(repo, 'demo');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'index.mjs'), '// non-trivial change\n');
    git(['add', '-A'], repo);
    git(['commit', '-m', 'non-trivial change, no changelog entry, add specdir'], repo);

    const beforeLog = git(['log', '--oneline'], repo);
    const destination = path.join(repo, 'docs', 'specs', 'archived', 'demo');

    const result = archiveIfGreen(specDir, allGreenReport, {
      cwd: repo,
      versioning: {
        config: { versioningPolicy: 'changelog-only', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
        branchPrefix: 'feat',
      },
    });

    assert.equal(result.archived, false);
    assert.ok(Array.isArray(result.versioningWarnings));
    assert.equal(result.versioningWarnings.length, 1);
    const [warning] = result.versioningWarnings;
    assert.equal(warning.kind, 'missing-changelog-entry');
    assert.match(warning.message, /CHANGELOG\.md/);

    // Nothing moved, nothing committed.
    assert.equal(fs.existsSync(specDir), true);
    assert.equal(fs.existsSync(destination), false);
    assert.equal(git(['log', '--oneline'], repo), beforeLog);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
