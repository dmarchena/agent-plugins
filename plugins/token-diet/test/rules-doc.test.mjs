import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'assets', 'rules.md');

test('R3/AC5 — the rules document plugins/token-diet/assets/rules.md exists', () => {
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
