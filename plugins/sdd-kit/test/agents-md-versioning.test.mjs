// Test for R3.S1: AGENTS.md's versioning section documents the
// change-type -> semver-segment rule, and the branch-naming section uses
// docs/<slug> instead of the old spec/<slug>.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// plugins/sdd-kit/test/ -> repo root is three levels up.
const AGENTS_MD = path.join(__dirname, '..', '..', '..', 'AGENTS.md');

const content = fs.readFileSync(AGENTS_MD, 'utf8');

function section(name) {
  const re = new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = content.match(re);
  assert.ok(match, `AGENTS.md should have a "## ${name}" section`);
  return match[1];
}

test(
  "ref R3.S1: AGENTS.md's versioning section states the per-type segment rule (fix/chore/refactor to patch, feat to minor, docs no bump, major reserved pre-1.0.0) and its branch-naming section lists docs/<slug> instead of spec/<slug>",
  () => {
    const versioningSection = section('Plugin structure & versioning');

    // fix/chore/refactor -> patch
    assert.match(versioningSection, /`?fix`?[\s\S]{0,40}patch/i);
    assert.match(versioningSection, /`?chore`?[\s\S]{0,40}patch/i);
    assert.match(versioningSection, /`?refactor`?[\s\S]{0,40}patch/i);
    // feat -> minor
    assert.match(versioningSection, /`?feat`?[\s\S]{0,40}minor/i);
    // docs -> no bump required
    assert.match(versioningSection, /`?docs`?[\s\S]{0,40}no bump required/i);
    // major reserved and unused pre-1.0.0
    assert.match(
      versioningSection,
      /`?major`?[\s\S]{0,80}reserved[\s\S]{0,40}pre-`?1\.0\.0`?/i
    );

    const branchSection = section('Branch naming');
    assert.match(branchSection, /`docs\/<slug>`/);
    assert.doesNotMatch(branchSection, /`spec\/<slug>`/);
  }
);
