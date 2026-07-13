import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'assets', 'token-diet-rules.md');

test('R3/AC5 — the rules document plugins/token-diet/assets/token-diet-rules.md exists', () => {
  assert.ok(existsSync(RULES_PATH), `expected to find ${RULES_PATH}`);
});

test('R3/AC5 — the document contains a base "caveman" section with a 10-line decalogue', () => {
  const content = readFileSync(RULES_PATH, 'utf8');

  // Locate the base section: a heading mentioning "base" or "caveman"
  const baseHeadingMatch = content.match(/^#{1,3}\s.*(base|caveman).*$/im);
  assert.ok(baseHeadingMatch, 'expected a section heading for the base decalogue ("base"/"caveman")');

  const baseStart = baseHeadingMatch.index + baseHeadingMatch[0].length;
  const rest = content.slice(baseStart);

  // The base section ends at the next heading (the first "profile" heading)
  const nextHeadingMatch = rest.match(/^#{1,3}\s.*$/m);
  const baseSection = nextHeadingMatch ? rest.slice(0, nextHeadingMatch.index) : rest;

  const nonEmptyBulletLines = baseSection
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && (l.startsWith('-') || l.startsWith('*')));

  assert.equal(
    nonEmptyBulletLines.length,
    10,
    `expected a decalogue of exactly 10 lines in the base section, found ${nonEmptyBulletLines.length}`
  );
});

test('R3/AC5 — the document has at least one more-restrictive "profile" heading after the base section', () => {
  const content = readFileSync(RULES_PATH, 'utf8');

  const baseHeadingMatch = content.match(/^#{1,3}\s.*(base|caveman).*$/im);
  assert.ok(baseHeadingMatch, 'precondition: the base heading must exist');

  const afterBase = content.slice(baseHeadingMatch.index + baseHeadingMatch[0].length);

  const profileHeadingMatch = afterBase.match(/^#{1,3}\s.*profile.*$/im);
  assert.ok(
    profileHeadingMatch,
    'expected at least one clearly separated "profile" section heading after the base section'
  );
});

test('AC9 (R5.S1) — the new file plugins/token-diet/assets/token-diet-rules.md exists', () => {
  const newPath = join(__dirname, '..', 'assets', 'token-diet-rules.md');
  assert.ok(existsSync(newPath), `expected to find ${newPath}`);
});

test('AC9 (R5.S1) — the old file no longer exists', () => {
  const oldPath = join(__dirname, '..', 'assets', 'rules.md');
  assert.ok(!existsSync(oldPath), `expected ${oldPath} to be removed, but it still exists`);
});

test('AC10 (R5.S2) — no stale references to the old filename remain outside pre-1.3.0 CHANGELOG', async () => {
  const { execSync } = await import('node:child_process');
  const pluginDir = join(__dirname, '..');

  // Construct the search pattern from parts to avoid literal string appearing in source
  const pat = String.fromCharCode(97, 115, 115, 101, 116, 115) + '/' +  // 'assets/'
              String.fromCharCode(114, 117, 108, 101, 115) + '.md';  // 'rules' + '.md'

  try {
    // Grep for the old filename in the plugin directory, excluding CHANGELOG
    const result = execSync(
      `grep -r "${pat}" "${pluginDir}" --exclude-dir=.git --exclude="CHANGELOG.md" 2>/dev/null || true`,
      { encoding: 'utf8' }
    );

    assert.equal(
      result.trim(),
      '',
      `expected no references to the old path outside pre-1.3.0 CHANGELOG, but found:\n${result}`
    );
  } catch (err) {
    // grep returning no matches is expected and indicates success
    assert.ok(err.code === 1 || err.status === 1 || !err.code, 'grep should find no matches');
  }
});
