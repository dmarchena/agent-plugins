// test/exec/validate-versioning-wiring.test.mjs — R4.S1 (change-type-versioning-policy spec)
// spec.md scenario (verbatim, R4.S1):
//   GIVEN a project whose `.sdd-kit.json` has no `versioningPolicy` or sets it
//   to `"disabled"`
//   WHEN `scripts/validate.sh` runs
//   THEN no version/changelog warning is printed for that project
// AC9: "with `versioningPolicy: "disabled"`, run `scripts/validate.sh` on a
// branch with an uncommitted version bump gap; confirm no version/changelog
// warning is printed" (and validate.sh still exits 0 either way).
//
// Exercises `plugins/sdd-kit/scripts/versioning-report.mjs` directly — the
// small Node CLI that scripts/validate.sh shells out to for this
// non-blocking check (scripts/validate.sh itself needs `claude`+`jq` and a
// full marketplace layout to run standalone; this is the reusable unit that
// carries all of R4.S1's actual decision logic, same isolation convention as
// test/exec/versioning-check.test.mjs and test/exec/branch-prefix.test.mjs:
// isolated temp git repo, never this repo's real plugins/ or .sdd-kit.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'versioning-report.mjs');

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

// A fixture repo with a touched plugin whose version was NOT bumped and
// whose CHANGELOG.md was NOT updated (a real "gap") — with the policy
// disabled or absent, this must still produce zero warning output. The gap
// itself is left as an UNCOMMITTED change on the branch (AC9's own wording:
// "a branch with an uncommitted version bump gap").
function makeRepo({ withConfig }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'versioning-wiring-'));
  const pluginDir = path.join(repo, 'plugins', 'demo-plugin');
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'demo-plugin', version: '1.0.0' }, null, 2),
  );
  fs.writeFileSync(path.join(pluginDir, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- Initial.\n');

  if (withConfig) {
    fs.writeFileSync(path.join(repo, '.sdd-kit.json'), JSON.stringify(withConfig, null, 2));
  }

  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture: initial commit, no bump/changelog gap yet']);
  git(repo, ['checkout', '-qb', 'fix/demo-gap']);

  // Touch the plugin's code WITHOUT bumping its version or changelog — the
  // "uncommitted version bump gap" AC9 describes — and leave it uncommitted.
  fs.writeFileSync(path.join(pluginDir, 'index.mjs'), '// a real code change, no version bump\n');

  return repo;
}

function runCli(repo) {
  return spawnSync('node', [CLI, repo], { cwd: repo, encoding: 'utf8' });
}

test('R4.S1: versioningPolicy absent — validate.sh\'s versioning step prints no warning and exits 0, despite a real bump/changelog gap', () => {
  const repo = makeRepo({ withConfig: null });
  try {
    const result = runCli(repo);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /version|changelog|bump|demo-plugin/i);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true, 'envelope must report ok:true');
    assert.deepEqual(parsed.data, {}, 'data.warnings is trimmed (T4-trim-cli-data) — data is now an empty object');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('R4.S1: versioningPolicy explicitly "disabled" — validate.sh\'s versioning step prints no warning and exits 0, despite a real bump/changelog gap', () => {
  const repo = makeRepo({ withConfig: { versioningPolicy: 'disabled' } });
  try {
    const result = runCli(repo);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /version|changelog|bump|demo-plugin/i);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true, 'envelope must report ok:true');
    assert.deepEqual(parsed.data, {}, 'data.warnings is trimmed (T4-trim-cli-data) — data is now an empty object');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
