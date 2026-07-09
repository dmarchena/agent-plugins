import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');
const DRIFT_CHECK_SH = path.join(REPO_ROOT, 'scripts', 'drift-check.sh');

function makeFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-fixture-'));
}

// Builds a fixture tree with one shared script and one plugin that declares
// it via shared/manifest.json, vendoring a copy with the given content
// (defaults to matching the shared original).
function buildFixture({ sharedContent, vendoredContent, omitVendored = false }) {
  const fixtureRoot = makeFixtureRoot();
  const sharedDir = path.join(fixtureRoot, 'shared');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(path.join(sharedDir, 'token-cost.mjs'), sharedContent);

  const pluginDir = path.join(fixtureRoot, 'plugins', 'fixture-plugin');
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'fixture-plugin',
        version: '0.0.1',
        description: 'fixture plugin for drift-check tests',
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(sharedDir, 'manifest.json'),
    JSON.stringify({ 'fixture-plugin': ['token-cost.mjs'] }, null, 2),
  );

  if (!omitVendored) {
    const scriptsDir = path.join(pluginDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'token-cost.mjs'), vendoredContent);
  }

  return { fixtureRoot, pluginDir };
}

test('R2.S1: con todas las copias vendorizadas en sincronia con su original en shared/, el paso de drift pasa (exit 0)', () => {
  const sharedContent = '// shared token-cost.mjs\nexport const VERSION = 1;\n';
  const { fixtureRoot } = buildFixture({
    sharedContent,
    vendoredContent: sharedContent, // byte-identical: no drift
  });

  const stdout = execFileSync('bash', [DRIFT_CHECK_SH, fixtureRoot], { encoding: 'utf8' });
  assert.ok(
    stdout.length >= 0,
    'drift-check.sh must succeed (not throw) when the vendored copy matches shared/',
  );
});

test('R2.S2: si una copia vendorizada difiere de su original en shared/, el drift check falla (exit != 0) y el mensaje identifica la ruta vendorizada obsoleta e indica re-ejecutar el build', () => {
  const sharedContent = '// shared token-cost.mjs\nexport const VERSION = 1;\n';
  const staleVendoredContent = '// HAND-EDITED copy, diverged from shared/\nexport const VERSION = 999;\n';
  const { fixtureRoot, pluginDir } = buildFixture({
    sharedContent,
    vendoredContent: staleVendoredContent,
  });

  const staleVendoredPath = path.join(pluginDir, 'scripts', 'token-cost.mjs');

  let threw = false;
  let output = '';
  try {
    execFileSync('bash', [DRIFT_CHECK_SH, fixtureRoot], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    threw = true;
    output = `${err.stdout || ''}${err.stderr || ''}`;
    assert.notEqual(err.status, 0, 'expected non-zero exit code when a vendored copy has drifted');
  }

  assert.ok(threw, 'expected drift-check.sh to fail (throw) when a vendored copy diverges from shared/');
  assert.ok(
    output.includes(staleVendoredPath) || output.includes(path.join('plugins', 'fixture-plugin', 'scripts', 'token-cost.mjs')),
    `expected failure message to name the stale vendored path, got: ${output}`,
  );
  assert.ok(
    /build\.sh/.test(output),
    `expected failure message to instruct re-running the build (mention build.sh), got: ${output}`,
  );
});
