// test/exec/versioning-check.test.mjs — R4.S2/R4.S3/R4.S4/R4.S5
// (change-type-versioning-policy spec)
//
// Unit tests for exec/versioning-check.mjs, built as isolated temp-dir
// fixtures (fs.mkdtempSync), never against this repo's real plugins/ — same
// isolation convention as test/exec/git.test.mjs and
// test/exec/branch-prefix.test.mjs.
//
// checkVersioning() is pure/testable by design: instead of diffing real git
// history, callers supply the "before" state explicitly (a plugin's prior
// version + changelog headings, or the changelog's prior headings for
// changelog-only), and the "after" state is read from files on `cwd` (the
// fixture's temp dir standing in for the working tree post-change).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkVersioning } from '../../scripts/exec/versioning-check.mjs';

// Builds a temp dir with plugins/<name>/.claude-plugin/plugin.json (given
// `version`) and plugins/<name>/CHANGELOG.md (given headings, one per
// entry, `## x.y.z` style) — mirrors the real plugins/sdd-kit/ layout
// documented in the spec's Assumptions section.
function makePluginFixture(root, name, version, changelogHeadings) {
  const pluginDir = path.join(root, 'plugins', name);
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

function tmpRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const defaultBranchPrefixes = {
  feat: 'feat', fix: 'fix', chore: 'chore', refactor: 'refactor', docs: 'docs',
};

test('R4.S2: under plugin-changelog, a plugin with a correctly-segmented version bump and a matching new changelog heading produces no warning', () => {
  const root = tmpRoot('versioning-r4s2-');
  try {
    // Branch type 'fix' expects a patch bump: 0.3.4 -> 0.3.5, plus a new heading.
    makePluginFixture(root, 'sdd-kit', '0.3.5', ['0.3.5', '0.3.4']);
    const result = checkVersioning({
      cwd: root,
      touchedFiles: ['plugins/sdd-kit/scripts/exec/foo.mjs'],
      config: { versioningPolicy: 'plugin-changelog', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
      branchPrefix: 'fix',
      before: { 'sdd-kit': { version: '0.3.4', changelogHeadings: ['0.3.4'] } },
    });
    assert.deepEqual(result, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R4.S3: under plugin-changelog, a touched plugin missing its version bump and/or a new changelog heading produces a warning naming the plugin and the specific missing piece', () => {
  const root = tmpRoot('versioning-r4s3-');
  try {
    // No bump (still 0.3.4) and no new changelog heading (still just 0.3.4).
    makePluginFixture(root, 'sdd-kit', '0.3.4', ['0.3.4']);
    const result = checkVersioning({
      cwd: root,
      touchedFiles: ['plugins/sdd-kit/scripts/exec/foo.mjs'],
      config: { versioningPolicy: 'plugin-changelog', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
      branchPrefix: 'fix',
      before: { 'sdd-kit': { version: '0.3.4', changelogHeadings: ['0.3.4'] } },
    });
    assert.equal(result.length, 1);
    const [warning] = result;
    assert.equal(warning.plugin, 'sdd-kit');
    assert.match(warning.message, /sdd-kit/);
    assert.match(warning.message, /missing bump/i);
    assert.match(warning.message, /missing changelog entry/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R4.S4: under plugin-changelog, a plugin bumped by the wrong segment produces a warning stating the branch type, the segment bumped, and the segment expected', () => {
  const root = tmpRoot('versioning-r4s4-');
  try {
    // Branch type is 'fix' (expects patch), but the minor segment was bumped instead.
    makePluginFixture(root, 'sdd-kit', '0.4.0', ['0.4.0', '0.3.4']);
    const result = checkVersioning({
      cwd: root,
      touchedFiles: ['plugins/sdd-kit/scripts/exec/foo.mjs'],
      config: { versioningPolicy: 'plugin-changelog', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
      branchPrefix: 'fix',
      before: { 'sdd-kit': { version: '0.3.4', changelogHeadings: ['0.3.4'] } },
    });
    assert.equal(result.length, 1);
    const [warning] = result;
    assert.equal(warning.plugin, 'sdd-kit');
    assert.equal(warning.kind, 'wrong-segment');
    assert.match(warning.message, /\bfix\b/);
    assert.match(warning.message, /\bminor\b/);
    assert.match(warning.message, /\bpatch\b/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R4.S5: under changelog-only, non-trivial changes without a new entry in the configured changelog file produce a warning with no segment-level check', () => {
  const root = tmpRoot('versioning-r4s5-');
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- Initial.\n');
    const result = checkVersioning({
      cwd: root,
      touchedFiles: ['src/index.mjs'],
      config: { versioningPolicy: 'changelog-only', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
      branchPrefix: 'feat',
      before: { changelogHeadings: ['1.0.0'] },
    });
    assert.equal(result.length, 1);
    const [warning] = result;
    assert.equal(warning.kind, 'missing-changelog-entry');
    assert.ok(!('segment' in warning), 'no segment-level check under changelog-only');
    assert.ok(!/segment/i.test(warning.message), 'message must not reference a segment');
    assert.match(warning.message, /CHANGELOG\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('R4.S5 (negative case): a trivial-only change set (docs/tests) produces no warning even without a changelog entry', () => {
  const root = tmpRoot('versioning-r4s5-trivial-');
  try {
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- Initial.\n');
    const result = checkVersioning({
      cwd: root,
      touchedFiles: ['docs/notes.md', 'test/foo.test.mjs'],
      config: { versioningPolicy: 'changelog-only', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
      branchPrefix: 'docs',
      before: { changelogHeadings: ['1.0.0'] },
    });
    assert.deepEqual(result, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('disabled policy (sanity, not itself an R4 ref): touched plugins produce no warnings when versioningPolicy is disabled', () => {
  const root = tmpRoot('versioning-disabled-');
  try {
    makePluginFixture(root, 'sdd-kit', '0.3.4', ['0.3.4']);
    const result = checkVersioning({
      cwd: root,
      touchedFiles: ['plugins/sdd-kit/scripts/exec/foo.mjs'],
      config: { versioningPolicy: 'disabled', branchPrefixes: defaultBranchPrefixes, changelogPath: 'CHANGELOG.md' },
      branchPrefix: 'fix',
      before: {},
    });
    assert.deepEqual(result, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
