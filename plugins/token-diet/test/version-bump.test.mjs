import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

// R3.S1 — All current-version literals updated
test('t4-version-bump: R3.S1 / AC5 — plugins/token-diet/plugin.json declares "version": "1.3.0"', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'plugin.json'), 'utf8');
  assert.match(content, /"version":\s*"1\.3\.0"/, 'plugin.json should have "version": "1.3.0"');
  assert(!/"version":\s*"1\.2\.0"/.test(content), 'plugin.json should not have "version": "1.2.0"');
});

test('t4-version-bump: R3.S1 / AC5 — plugins/token-diet/.claude-plugin/plugin.json declares "version": "1.3.0"', () => {
  const content = readFileSync(join(PLUGIN_ROOT, '.claude-plugin/plugin.json'), 'utf8');
  assert.match(content, /"version":\s*"1\.3\.0"/, '.claude-plugin/plugin.json should have "version": "1.3.0"');
  assert(!/"version":\s*"1\.2\.0"/.test(content), '.claude-plugin/plugin.json should not have "version": "1.2.0"');
});

test('t4-version-bump: R3.S1 / AC5 — plugins/token-diet/.codex-plugin/plugin.json declares "version": "1.3.0"', () => {
  const content = readFileSync(join(PLUGIN_ROOT, '.codex-plugin/plugin.json'), 'utf8');
  assert.match(content, /"version":\s*"1\.3\.0"/, '.codex-plugin/plugin.json should have "version": "1.3.0"');
  assert(!/"version":\s*"1\.2\.0"/.test(content), '.codex-plugin/plugin.json should not have "version": "1.2.0"');
});

test('t4-version-bump: R3.S1 / AC5 — install.md contains mark literal "Produced with token-diet (v1.3.0)"', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'commands/install.md'), 'utf8');
  assert.match(
    content,
    /Produced with token-diet \(v1\.3\.0\)/,
    'install.md should contain "Produced with token-diet (v1.3.0)"'
  );
});

test('t4-version-bump: R3.S1 / AC5 — install.md contains reason literal "already covered by token-diet v1.3.0"', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'commands/install.md'), 'utf8');
  assert.match(
    content,
    /already covered by token-diet v1\.3\.0/,
    'install.md should contain "already covered by token-diet v1.3.0"'
  );
});

test('t4-version-bump: R3.S1 / AC5 — CHANGELOG.md contains "## 1.3.0" entry', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(content, /## 1\.3\.0/, 'CHANGELOG.md should contain "## 1.3.0"');
});

test('t4-version-bump: R3.S2 / AC6 — install.md R2.S2 example shows v1.2.0 → v1.3.0 version jump', () => {
  const content = readFileSync(join(PLUGIN_ROOT, 'commands/install.md'), 'utf8');

  // Find the R2.S2 section
  const r2s2Match = content.match(
    /### R2\.S2 — Mark present with an older version\n([\s\S]*?)(?=###|##|$)/
  );

  assert.ok(r2s2Match && r2s2Match[1], 'R2.S2 section should exist in install.md');

  const r2s2Section = r2s2Match[1];

  // Should contain the example with v1.2.0 → v1.3.0
  assert.match(
    r2s2Section,
    /v1\.2\.0\s*(→|->)\s*v1\.3\.0/,
    'R2.S2 section should contain version jump example from v1.2.0 to v1.3.0'
  );

  // Verify it mentions token-diet mark at the older version
  assert.ok(
    /Produced with token-diet \(v1\.2\.0\)/.test(r2s2Section),
    'R2.S2 example should reference mark at v1.2.0'
  );
});
