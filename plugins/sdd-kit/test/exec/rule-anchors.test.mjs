// Self-check for the rule-anchors manifest (docs/specs/sdd-kit-token-reduction):
// asserts the manifest is well-formed and that every literal anchor it lists
// still appears verbatim in its corresponding skill's SKILL.md. This is the
// guard a later token-reduction pass (R1-slim) reads before trimming those
// files — if an anchor silently stops matching, this test goes red first.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');
const MANIFEST_PATH = path.join(
  SKILLS_DIR,
  'plan-executor',
  'assets',
  'rule-anchors.json',
);

const EXPECTED_SKILLS = ['spec-writer', 'plan-writer', 'plan-executor', 'verify'];

test('rule-anchors.json exists and is valid JSON', () => {
  assert.ok(fs.existsSync(MANIFEST_PATH), `missing manifest at ${MANIFEST_PATH}`);
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('rule-anchors.json has exactly the 4 expected skill keys', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), [...EXPECTED_SKILLS].sort());
});

test('every skill maps to a non-empty array of strings', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  for (const skill of EXPECTED_SKILLS) {
    const anchors = manifest[skill];
    assert.ok(Array.isArray(anchors), `${skill}: value is not an array`);
    assert.ok(anchors.length > 0, `${skill}: array is empty`);
    for (const anchor of anchors) {
      assert.equal(typeof anchor, 'string', `${skill}: anchor is not a string: ${anchor}`);
      assert.ok(anchor.length > 0, `${skill}: anchor is an empty string`);
    }
  }
});

test('no duplicate anchors within each skill', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  for (const skill of EXPECTED_SKILLS) {
    const anchors = manifest[skill];
    assert.equal(
      new Set(anchors).size,
      anchors.length,
      `${skill}: duplicate anchor found`,
    );
  }
});

test('every anchor is reachable: literal in SKILL.md, or in a referenced asset', () => {
  // R1-slim (docs/specs/sdd-kit-token-reduction) may have since moved some
  // reference content out of a SKILL.md body into skills/<skill>/assets/,
  // per R1.S2: that's still a pass as long as the SKILL.md references the
  // asset by path and the anchor is verbatim inside it. See
  // test/skill-slimming.test.mjs for the dedicated AC1-3 guard.
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  for (const skill of EXPECTED_SKILLS) {
    const skillDir = path.join(SKILLS_DIR, skill);
    const skillPath = path.join(skillDir, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf8');
    const assetsDir = path.join(skillDir, 'assets');
    const assetFiles = fs.existsSync(assetsDir)
      ? fs
          .readdirSync(assetsDir, { withFileTypes: true })
          .filter((e) => e.isFile())
          .map((e) => path.join(assetsDir, e.name))
      : [];

    for (const anchor of manifest[skill]) {
      const inBody = content.includes(anchor);
      const inReferencedAsset = assetFiles.some((assetPath) => {
        const rel = path.relative(skillDir, assetPath).split(path.sep).join('/');
        if (!content.includes(rel)) return false;
        return fs.readFileSync(assetPath, 'utf8').includes(anchor);
      });
      assert.ok(
        inBody || inReferencedAsset,
        `${skill}: anchor not found verbatim in SKILL.md or a referenced asset: ${JSON.stringify(anchor)}`,
      );
    }
  }
});
