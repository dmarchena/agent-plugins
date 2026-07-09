// Guard test for the R1 token-reduction pass (docs/specs/sdd-kit-token-reduction,
// task R1-slim) and the R2 token-budget guard (docs/specs/sdd-kit-skill-token-budget,
// task T2-budget-guard). Verifies the slimmed SKILL.md files still satisfy
// R1.S1/R1.S2/R2.S1/R2.S2:
//
//   AC2 - every rule anchor in plan-executor/assets/rule-anchors.json (the
//         manifest captured from the SKILL.md files BEFORE slimming) is still
//         reachable: either it's a literal substring of the SKILL.md body, or
//         the SKILL.md references (by relative path) an asset file that
//         contains it.
//   AC3 - every asset file under skills/*/assets/ is referenced by its
//         relative path somewhere in its skill's SKILL.md (no orphans) -
//         except rule-anchors.json itself, which is a meta manifest consumed
//         by tests, not skill content moved out of a SKILL.md.
//   AC4 (R2) - checkBudgets() from budget-guard.mjs correctly reports skills
//         under/over their derived per-skill token ceiling (synthetic data
//         only; the real SKILL.md vs. HWM-fixture comparison is runGuard(),
//         covered by a later task, not here).
//
// Run against the pre-slimming state, this test is RED (AC1 fails: 702 > 491).
// After slimming, it must be GREEN.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBudgets, runGuard } from '../scripts/budget-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'skills');
const MANIFEST_PATH = path.join(
  SKILLS_DIR,
  'plan-executor',
  'assets',
  'rule-anchors.json',
);

const SKILLS = ['spec-writer', 'plan-writer', 'plan-executor', 'verify'];

// Assets that are meta-artifacts consumed by the guard tests themselves,
// not reference content moved out of a SKILL.md body - exempt from the
// "must be referenced by path" orphan check in AC3.
const ORPHAN_EXEMPT_ASSETS = new Set(['plan-executor/assets/rule-anchors.json']);

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

test('R2.S1 (AC3): checkBudgets reports no exceeded skill when every body is under its ceiling', () => {
  const counts = {
    'spec-writer': 100,
    'plan-writer': 200,
    'plan-executor': 300,
    verify: 50,
  };
  const ceilings = {
    'spec-writer': 105,
    'plan-writer': 210,
    'plan-executor': 315,
    verify: 52,
  };

  const { exceeded } = checkBudgets(counts, ceilings);

  assert.deepEqual(exceeded, []);
});

test('R2.S2 (AC4): checkBudgets flags the skill whose body exceeds its ceiling, naming it with its current count and its ceiling', () => {
  const counts = {
    'spec-writer': 100,
    'plan-writer': 220,
    'plan-executor': 300,
    verify: 50,
  };
  const ceilings = {
    'spec-writer': 105,
    'plan-writer': 210,
    'plan-executor': 315,
    verify: 52,
  };

  const { exceeded } = checkBudgets(counts, ceilings);

  assert.deepEqual(exceeded, [{ skill: 'plan-writer', count: 220, ceiling: 210 }]);
});

test('R3.S1 (AC5): runGuard reports no exceeded skill once SKILL.md bodies are trimmed under their derived ceiling', () => {
  const { exceeded } = runGuard();
  assert.deepEqual(exceeded, [], `skills over their token ceiling: ${JSON.stringify(exceeded)}`);
});
