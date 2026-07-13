import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'assets', 'token-diet-rules.md');

const EXPECTED_PROFILE_BULLETS = [
  '- Freeze exploration: work ONLY on paths/lines already identified; no "looking around just in case".',
  '- Drop the model one tier for every remaining mechanical delegation.',
  '- Verify between edits only if the result decides the next step; report once, at the end.',
  '- After a long pause at a task boundary: cut context and resume from disk, not "continue".',
  '- Wide sweeps (whole repo, full history, regenerating an entire doc): only with prior warning and confirmation.',
];

function readRules() {
  return readFileSync(RULES_PATH, 'utf8');
}

function findHeadingLineIndices(content) {
  const lines = content.split('\n');
  const headings = [];
  lines.forEach((line, idx) => {
    if (/^#{1,3}\s/.test(line)) {
      headings.push({ idx, text: line.trim() });
    }
  });
  return headings;
}

test('R2.S1/AC3 — a detail-section heading exists strictly between the base and profile headings', () => {
  const content = readRules();
  const headings = findHeadingLineIndices(content);

  const baseIdx = headings.findIndex((h) => /base|caveman/i.test(h.text));
  const profileIdx = headings.findIndex((h) => /profile.*scrooge/i.test(h.text));

  assert.ok(baseIdx !== -1, 'expected to find the base/caveman heading');
  assert.ok(profileIdx !== -1, 'expected to find the profile/scrooge heading');
  assert.ok(profileIdx > baseIdx, 'expected the profile heading to come after the base heading');

  const between = headings.slice(baseIdx + 1, profileIdx);
  assert.equal(
    between.length,
    1,
    `expected exactly one new heading strictly between base and profile (the detail section), found ${between.length}`
  );

  global.__detailHeading = between[0];
});

test('R2.S1/AC3 — the detail section contains exactly 6 identifiable entries mapping to the 6 nuances', () => {
  const content = readRules();
  const headings = findHeadingLineIndices(content);
  const lines = content.split('\n');

  const baseIdx = headings.findIndex((h) => /base|caveman/i.test(h.text));
  const profileIdx = headings.findIndex((h) => /profile.*scrooge/i.test(h.text));
  const between = headings.slice(baseIdx + 1, profileIdx);
  assert.equal(between.length, 1, 'expected exactly one detail-section heading (see previous test)');

  const detailHeading = between[0];
  const detailStart = detailHeading.idx + 1;
  const detailEnd = headings[profileIdx].idx;
  const detailBody = lines.slice(detailStart, detailEnd).join('\n');
  const detailLower = detailBody.toLowerCase();

  // exactly 6 numbered entries (e.g. "1. **Title**: ...")
  const entryMatches = detailBody.match(/^\d+\.\s+\*\*/gm) || [];
  assert.equal(
    entryMatches.length,
    6,
    `expected exactly 6 numbered entries in the detail section, found ${entryMatches.length}`
  );

  // 1. cheap-explorer guardrail
  assert.ok(
    /does not audit/.test(detailLower) && /locates/.test(detailLower),
    'expected an entry explaining the explore/locate guardrail ("locates" but "does not audit")'
  );
  assert.ok(/6×|6x/.test(detailLower), 'expected the guardrail entry to cite the ~6× explore-cost ratio figure');

  // 2. delegation cost + model pinning
  assert.ok(
    /pin/.test(detailLower) && /inherits/.test(detailLower),
    'expected an entry explaining explicit model pinning vs the default inheriting the expensive model'
  );

  // 3. batching threshold
  assert.ok(
    /≥2/.test(detailLower) && /independent/.test(detailLower),
    'expected an entry explaining the ≥2-independent-operations batching threshold'
  );

  // 4. resume-from-disk figures
  assert.ok(/~5k/.test(detailLower), 'expected an entry citing the ~5K disk-resume token figure');
  assert.ok(
    /0\.4|400k|1m/.test(detailLower),
    'expected the resume entry to cite the 0.4-1M continue-cost comparison figure'
  );

  // 5. plans/docs hierarchy
  assert.ok(/index/.test(detailLower), 'expected an entry explaining the thin-index/on-demand-detail hierarchy');

  // 6. grep-all-readers before a shared-datum shape change
  assert.ok(
    /grep/.test(detailLower) && /readers/.test(detailLower),
    'expected an entry explaining why to grep all readers/consumers before a shape change'
  );
});

test('R2.S1/AC3 — the base section\'s intro text references the detail section by name', () => {
  const content = readRules();
  const headings = findHeadingLineIndices(content);
  const lines = content.split('\n');

  const baseIdx = headings.findIndex((h) => /base|caveman/i.test(h.text));
  const profileIdx = headings.findIndex((h) => /profile.*scrooge/i.test(h.text));
  const between = headings.slice(baseIdx + 1, profileIdx);
  assert.equal(between.length, 1, 'expected exactly one detail-section heading (see previous test)');

  const detailHeading = between[0];
  const detailTitle = detailHeading.text.replace(/^#{1,3}\s*/, '').trim();

  const baseStart = headings[baseIdx].idx + 1;
  const bulletLineIdx = lines
    .slice(baseStart, detailHeading.idx)
    .findIndex((l) => l.trim().startsWith('-'));
  assert.ok(bulletLineIdx !== -1, 'expected to find the base section\'s first bullet line');

  const introLines = lines.slice(baseStart, baseStart + bulletLineIdx);
  const introText = introLines.join('\n');

  assert.ok(
    introText.includes(detailTitle),
    `expected the base section's introductory text to reference the detail section by its exact name ("${detailTitle}")`
  );
});

test('R2.S2/AC4 — the "Profile: scrooge" section still exists after the base section, byte-identical to v1.2.0', () => {
  const content = readRules();
  const headings = findHeadingLineIndices(content);
  const lines = content.split('\n');

  const baseIdx = headings.findIndex((h) => /base|caveman/i.test(h.text));
  const profileIdx = headings.findIndex((h) => /profile.*scrooge/i.test(h.text));

  assert.ok(baseIdx !== -1, 'expected to find the base/caveman heading');
  assert.ok(profileIdx !== -1, 'expected to find the profile/scrooge heading');
  assert.ok(profileIdx > baseIdx, 'expected the profile heading to appear after the base heading');
  assert.equal(
    headings[profileIdx].text,
    '## Profile: scrooge (overspend detected)',
    'expected the profile heading text to be unchanged'
  );

  const profileStart = headings[profileIdx].idx + 1;
  const profileEnd = profileIdx + 1 < headings.length ? headings[profileIdx + 1].idx : lines.length;
  const profileBulletLines = lines
    .slice(profileStart, profileEnd)
    .filter((l) => l.trim().length > 0 && l.trim().startsWith('-'));

  assert.equal(
    profileBulletLines.length,
    5,
    `expected exactly 5 non-empty bullet lines in the profile section, found ${profileBulletLines.length}`
  );

  profileBulletLines.forEach((line, i) => {
    assert.equal(
      line.trim(),
      EXPECTED_PROFILE_BULLETS[i],
      `expected profile bullet #${i + 1} to be byte-identical to the v1.2.0 content`
    );
  });
});
