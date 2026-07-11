// test/versioning-report.test.mjs — T5-versioning-report (unify-cli-io spec)
// Migrates versioning-report.mjs's stdout to the shared envelope
// ({ok:true,data:{warnings:[...]}}) instead of "⚠ versioning: <msg>" prose
// lines, per plugins/sdd-kit/scripts/lib/cli.mjs. Isolated temp git repo
// fixtures, same convention as test/exec/validate-versioning-wiring.test.mjs
// — never this repo's real plugins/ or .sdd-kit.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'scripts', 'versioning-report.mjs');
const CLI_SOURCE_PATH = CLI;

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

// A fixture repo under the `plugin-changelog` policy with a touched plugin.
// `compliant: true` bumps the version by the segment the branch prefix
// expects AND adds a matching changelog heading (zero warnings expected).
// `compliant: false` touches the plugin's code without bumping the version
// or the changelog at all (a real gap -> at least one warning expected).
function makeRepo({ compliant }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'versioning-report-'));
  const pluginDir = path.join(repo, 'plugins', 'demo-plugin');
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'demo-plugin', version: '1.0.0' }, null, 2),
  );
  fs.writeFileSync(path.join(pluginDir, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n\n- Initial.\n');
  fs.writeFileSync(repo + '/.sdd-kit.json', JSON.stringify({ versioningPolicy: 'plugin-changelog' }, null, 2));
  // Tracked from the start so an uncommitted EDIT to it (rather than a brand
  // new untracked file, which `git diff --name-only <ref>` never reports)
  // shows up as a touched file for the gap/compliant cases below.
  fs.writeFileSync(path.join(pluginDir, 'index.mjs'), '// placeholder\n');

  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture: initial commit, plugin at 1.0.0']);
  git(repo, ['checkout', '-qb', 'fix/demo-gap']);

  fs.writeFileSync(path.join(pluginDir, 'index.mjs'), '// a real code change\n');

  if (compliant) {
    // fix/... expects a patch bump (R4's CHANGE_TYPE_SEGMENT table).
    fs.writeFileSync(
      path.join(pluginDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'demo-plugin', version: '1.0.1' }, null, 2),
    );
    fs.writeFileSync(
      path.join(pluginDir, 'CHANGELOG.md'),
      '# Changelog\n\n## 1.0.1\n\n- Fix.\n\n## 1.0.0\n\n- Initial.\n',
    );
  }
  // else: leave the version/changelog untouched -> a real bump/changelog gap.

  return repo;
}

function runCli(repo) {
  return spawnSync('node', [CLI, repo], { cwd: repo, encoding: 'utf8' });
}

test('AC6: versioning-report emite {ok:true,data:{warnings:[...]}} con warnings y {ok:true,data:{warnings:[]}} sin ellos, sin lineas de prosa de aviso', () => {
  const gapRepo = makeRepo({ compliant: false });
  const compliantRepo = makeRepo({ compliant: true });
  try {
    const gapResult = runCli(gapRepo);
    assert.equal(gapResult.status, 0, `expected exit 0, got ${gapResult.status}; stderr: ${gapResult.stderr}`);
    // Single JSON line on stdout: no stray prose lines alongside it.
    const gapLines = gapResult.stdout.split('\n').filter(Boolean);
    assert.equal(gapLines.length, 1, `expected exactly one stdout line, got: ${JSON.stringify(gapResult.stdout)}`);
    assert.doesNotMatch(gapResult.stdout, /⚠/, 'stdout must not contain the old prose warning marker');
    const gapParsed = JSON.parse(gapLines[0]);
    assert.equal(gapParsed.ok, true);
    assert.ok(Array.isArray(gapParsed.data.warnings), 'data.warnings must be an array');
    assert.ok(gapParsed.data.warnings.length > 0, 'a real bump/changelog gap must produce at least one warning');

    const compliantResult = runCli(compliantRepo);
    assert.equal(compliantResult.status, 0, `expected exit 0, got ${compliantResult.status}; stderr: ${compliantResult.stderr}`);
    const compliantLines = compliantResult.stdout.split('\n').filter(Boolean);
    assert.equal(compliantLines.length, 1, `expected exactly one stdout line, got: ${JSON.stringify(compliantResult.stdout)}`);
    assert.doesNotMatch(compliantResult.stdout, /⚠/, 'stdout must not contain the old prose warning marker');
    const compliantParsed = JSON.parse(compliantLines[0]);
    assert.equal(compliantParsed.ok, true);
    assert.ok(Array.isArray(compliantParsed.data.warnings), 'data.warnings must be an array');
    assert.equal(compliantParsed.data.warnings.length, 0, 'a fully compliant bump+changelog must produce zero warnings');
  } finally {
    fs.rmSync(gapRepo, { recursive: true, force: true });
    fs.rmSync(compliantRepo, { recursive: true, force: true });
  }
});

test('AC4: versioning-report no define localmente helpers de I/O y usa el modulo compartido', () => {
  const source = fs.readFileSync(CLI_SOURCE_PATH, 'utf8');

  assert.match(
    source,
    /from\s+['"]\.\/lib\/cli\.mjs['"]/,
    'must import the shared I/O module from ./lib/cli.mjs',
  );
  assert.doesNotMatch(
    source,
    /process\.stdout\.write/,
    'must not write to stdout directly; use the shared emitSuccess/emitError helpers instead',
  );
});
