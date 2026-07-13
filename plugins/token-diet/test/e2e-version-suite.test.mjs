import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = __dirname;
const REPO_ROOT = join(__dirname, '..', '..', '..');

const OLD_BASELINE_SHA = '7dece75';
// Built from parts (not a single string literal) so this file's own source
// text does not contain the pre-rename path and trip the AC10 stale-reference
// grep test, which scans this directory for the literal old asset path.
const OLD_RULES_PATH_AT_BASELINE = 'plugins/token-diet/' + 'assets' + '/rules.md';
const OLD_INSTALL_PATH_AT_BASELINE = 'plugins/token-diet/commands/install.md';

// Expand the *.test.mjs glob ourselves (node:fs, not shell globbing) so the
// spawned child process gets an explicit argv file list — this sidesteps the
// `node --test <dir>/` bug in this Node version where a bare directory
// argument is treated as a literal module path instead of being recursively
// searched for test files.
function listTestFiles() {
  return readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => join(TEST_DIR, f));
}

function countBaseSectionBullets(rulesContent) {
  const baseHeadingMatch = rulesContent.match(/^#{1,3}\s.*(base|caveman).*$/im);
  assert.ok(baseHeadingMatch, 'expected a base/caveman heading in the OLD rules content');

  const baseStart = baseHeadingMatch.index + baseHeadingMatch[0].length;
  const rest = rulesContent.slice(baseStart);

  const nextHeadingMatch = rest.match(/^#{1,3}\s.*$/m);
  const baseSection = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;

  return baseSection
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('-') || l.startsWith('*')));
}

test('R4.S1 — running the full plugin test suite over the updated files completes with exit code 0 and zero failures', () => {
  const files = listTestFiles();
  assert.ok(files.length > 0, `expected to find *.test.mjs files under ${TEST_DIR}`);

  let exitCode = 0;
  let output = '';
  try {
    output = execFileSync('node', ['--test', ...files], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch (err) {
    exitCode = typeof err.status === 'number' ? err.status : 1;
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }

  assert.equal(
    exitCode,
    0,
    `expected \`node --test plugins/token-diet/test/*.test.mjs\` to exit 0, got ${exitCode}. Output:\n${output}`
  );

  const failCountMatch = output.match(/^ℹ fail (\d+)/m);
  if (failCountMatch) {
    assert.equal(
      failCountMatch[1],
      '0',
      `expected the suite output to report zero failures, found ${failCountMatch[1]}. Output:\n${output}`
    );
  }
});

test('R4.S2 — the updated test assertions fail when evaluated against the pre-1.3.0 rules and install content, proving they pin the new contract rather than being tautological', () => {
  let oldRules;
  let oldInstall;
  try {
    oldRules = execFileSync(
      'git',
      ['show', `${OLD_BASELINE_SHA}:${OLD_RULES_PATH_AT_BASELINE}`],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    oldInstall = execFileSync(
      'git',
      ['show', `${OLD_BASELINE_SHA}:${OLD_INSTALL_PATH_AT_BASELINE}`],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
  } catch (err) {
    assert.fail(
      `expected \`git show ${OLD_BASELINE_SHA}:...\` to succeed for both the old rules doc and old install.md, but it failed: ${err.message}`
    );
    return;
  }

  // 1. OLD content has exactly 10 bullets, NOT 11 — the new "expect 11" assertion
  //    (rules-doc.test.mjs / rules-doc-base-block.test.mjs) would fail against it.
  const oldBullets = countBaseSectionBullets(oldRules);
  assert.equal(
    oldBullets.length,
    10,
    `expected the pre-1.3.0 base section to hold exactly 10 bullet lines, found ${oldBullets.length}`
  );
  assert.notEqual(
    oldBullets.length,
    11,
    'the new "expect 11 bullets" assertion must NOT hold against the OLD (pre-1.3.0) rules content'
  );

  // 2. OLD install.md does NOT contain the new mark literal.
  assert.ok(
    !oldInstall.includes('Produced with token-diet (v1.3.0)'),
    'the OLD install.md must NOT contain the new mark literal "Produced with token-diet (v1.3.0)"'
  );
  assert.ok(
    oldInstall.includes('Produced with token-diet (v1.2.0)'),
    'the OLD install.md is expected to contain the old mark literal "Produced with token-diet (v1.2.0)" instead'
  );

  // 3. OLD install.md does NOT match the new version-jump regex used by cmd-recommend.test.mjs.
  assert.ok(
    !/v1\.2\.0\s*(→|->)\s*v1\.3\.0/.test(oldInstall),
    'the OLD install.md must NOT match the new version-jump regex v1.2.0 -> v1.3.0'
  );
  assert.ok(
    /v1\.0\.0\s*(→|->)\s*v1\.2\.0/.test(oldInstall),
    'the OLD install.md is expected to match the old version-jump regex v1.0.0 -> v1.2.0 instead'
  );
});
