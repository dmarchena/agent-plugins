// test/repo-config.test.mjs — AC19 (change-type-versioning-policy spec):
// "The repo root .sdd-kit.json exists with versioningPolicy plugin-changelog
// and a branchPrefixes map consistent with AGENTS.md's docs/<slug> branch
// convention" (spec.md AC19: In-scope repo config).
//
// Confirms this repo's own root `.sdd-kit.json`:
// - exists
// - has `versioningPolicy` exactly `"plugin-changelog"`
// - has a `branchPrefixes` map covering feat/fix/chore/refactor/docs,
//   matching AGENTS.md's Branch naming section (feat/fix/chore/refactor map
//   to themselves; docs maps to "docs" per the renamed docs/<slug> convention).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// plugins/sdd-kit/test/ -> repo root is three levels up.
const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const CONFIG_PATH = path.join(REPO_ROOT, '.sdd-kit.json');

const EXPECTED_BRANCH_PREFIXES = Object.freeze({
  feat: 'feat',
  fix: 'fix',
  chore: 'chore',
  refactor: 'refactor',
  docs: 'docs',
});

test(
  'ref AC19: repo root .sdd-kit.json exists with versioningPolicy plugin-changelog and a branchPrefixes map matching AGENTS.md\'s docs/<slug> convention',
  () => {
    assert.ok(fs.existsSync(CONFIG_PATH), `.sdd-kit.json should exist at repo root (${CONFIG_PATH})`);

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    assert.strictEqual(config.versioningPolicy, 'plugin-changelog');

    assert.ok(config.branchPrefixes && typeof config.branchPrefixes === 'object', 'branchPrefixes should be a map');
    for (const [type, prefix] of Object.entries(EXPECTED_BRANCH_PREFIXES)) {
      assert.strictEqual(
        config.branchPrefixes[type],
        prefix,
        `branchPrefixes.${type} should be "${prefix}" per AGENTS.md's Branch naming section`
      );
    }
  }
);
