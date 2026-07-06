// Guard test for the R1 token-reduction pass (docs/specs/sdd-kit-token-reduction,
// task R1-slim). Verifies the slimmed SKILL.md files still satisfy R1.S1/R1.S2:
//
//   AC1 - the combined line count of the 4 SKILL.md bodies is <= 491 (>=30%
//         less than the pre-slimming baseline of 702).
//   AC2 - every rule anchor in plan-executor/assets/rule-anchors.json (the
//         manifest captured from the SKILL.md files BEFORE slimming) is still
//         reachable: either it's a literal substring of the SKILL.md body, or
//         the SKILL.md references (by relative path) an asset file that
//         contains it.
//   AC3 - every asset file under skills/*/assets/ is referenced by its
//         relative path somewhere in its skill's SKILL.md (no orphans) -
//         except rule-anchors.json itself, which is a meta manifest consumed
//         by tests, not skill content moved out of a SKILL.md.
//
// Run against the pre-slimming state, this test is RED (AC1 fails: 702 > 491).
// After slimming, it must be GREEN.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const MANIFEST_PATH = path.join(
  SKILLS_DIR,
  'plan-executor',
  'assets',
  'rule-anchors.json',
);

const SKILLS = ['spec-writer', 'plan-writer', 'plan-executor', 'verify'];
const MAX_TOTAL_LINES = 491;

// Assets that are meta-artifacts consumed by the guard tests themselves,
// not reference content moved out of a SKILL.md body - exempt from the
// "must be referenced by path" orphan check in AC3.
const ORPHAN_EXEMPT_ASSETS = new Set(['plan-executor/assets/rule-anchors.json']);

function countLines(content) {
  // wc -l semantics: number of newline characters in the file.
  return (content.match(/\n/g) || []).length;
}

function skillDir(skill) {
  return path.join(SKILLS_DIR, skill);
}

function skillMdPath(skill) {
  return path.join(skillDir(skill), 'SKILL.md');
}

function readSkillMd(skill) {
  return fs.readFileSync(skillMdPath(skill), 'utf8');
}

function listAssetFiles(skill) {
  const assetsDir = path.join(skillDir(skill), 'assets');
  if (!fs.existsSync(assetsDir)) return [];
  return fs
    .readdirSync(assetsDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(assetsDir, e.name));
}

// Relative path as it would appear when referenced *from within* a skill's
// SKILL.md, e.g. 'assets/rule-anchors.json'.
function relFromSkillMd(skill, assetPath) {
  return path.relative(skillDir(skill), assetPath).split(path.sep).join('/');
}

// Relative path used as the key in ORPHAN_EXEMPT_ASSETS, e.g.
// 'plan-executor/assets/rule-anchors.json'.
function relFromSkillsDir(assetPath) {
  return path.relative(SKILLS_DIR, assetPath).split(path.sep).join('/');
}

test('AC1: combined SKILL.md body line count is <= 491 (>=30% less than 702)', () => {
  const perSkill = {};
  let total = 0;
  for (const skill of SKILLS) {
    const lines = countLines(readSkillMd(skill));
    perSkill[skill] = lines;
    total += lines;
  }
  assert.ok(
    total <= MAX_TOTAL_LINES,
    `combined SKILL.md lines = ${total} (${JSON.stringify(perSkill)}), ` +
      `expected <= ${MAX_TOTAL_LINES}`,
  );
});

test('AC2: every rule anchor is reachable from its SKILL.md body or a referenced asset', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  for (const skill of SKILLS) {
    const skillContent = readSkillMd(skill);
    const assetFiles = listAssetFiles(skill);
    const missing = [];

    for (const anchor of manifest[skill]) {
      if (skillContent.includes(anchor)) continue;

      const reachableViaAsset = assetFiles.some((assetPath) => {
        const rel = relFromSkillMd(skill, assetPath);
        // The SKILL.md must actually reference this asset by path ...
        if (!skillContent.includes(rel)) return false;
        // ... and the asset must actually contain the anchor verbatim.
        const assetContent = fs.readFileSync(assetPath, 'utf8');
        return assetContent.includes(anchor);
      });

      if (!reachableViaAsset) missing.push(anchor);
    }

    assert.deepEqual(
      missing,
      [],
      `${skill}: anchors no longer reachable (neither in SKILL.md body nor ` +
        `in a referenced asset): ${JSON.stringify(missing)}`,
    );
  }
});

test('AC3: every asset file is referenced by its relative path in its SKILL.md (no orphans)', () => {
  for (const skill of SKILLS) {
    const skillContent = readSkillMd(skill);
    for (const assetPath of listAssetFiles(skill)) {
      const skillsDirRel = relFromSkillsDir(assetPath);
      if (ORPHAN_EXEMPT_ASSETS.has(skillsDirRel)) continue;

      const rel = relFromSkillMd(skill, assetPath);
      assert.ok(
        skillContent.includes(rel),
        `${skill}: asset not referenced by relative path in SKILL.md: ${rel}`,
      );
    }
  }
});
