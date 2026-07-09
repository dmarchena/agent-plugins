import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');
const BUILD_SH = path.join(REPO_ROOT, 'shared', 'build.sh');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function makeFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vendoring-build-fixture-'));
}

test('R1.S1: after running the vendoring build, each declaring plugin\'s copy of the shared script is byte-identical to shared/, and the build exits successfully', () => {
  // Runs against the real repo tree: claude-token-debug and sdd-kit both
  // declare token-cost.mjs as a shared dep (per this task's step 4).
  execFileSync('bash', [BUILD_SH, REPO_ROOT], { encoding: 'utf8' });

  const sharedScript = path.join(REPO_ROOT, 'shared', 'token-cost.mjs');
  const sharedHash = sha256(sharedScript);

  const copies = [
    path.join(REPO_ROOT, 'plugins', 'claude-token-debug', 'scripts', 'token-cost.mjs'),
    path.join(REPO_ROOT, 'plugins', 'sdd-kit', 'scripts', 'token-cost.mjs'),
  ];

  for (const copy of copies) {
    assert.ok(fs.existsSync(copy), `expected vendored copy at ${copy}`);
    assert.equal(
      sha256(copy),
      sharedHash,
      `expected ${copy} to be byte-identical (same sha256) to ${sharedScript}`,
    );
  }
});

test('R1.S2: if a plugin declares a shared script that does not exist under shared/, the build fails with a non-zero exit code naming the missing source and the declaring plugin', () => {
  const fixtureRoot = makeFixtureRoot();
  fs.mkdirSync(path.join(fixtureRoot, 'shared'), { recursive: true });

  const pluginDir = path.join(fixtureRoot, 'plugins', 'ghost-plugin');
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: 'ghost-plugin',
        version: '0.0.1',
        description: 'fixture plugin for R1.S2',
        sharedScripts: ['does-not-exist.mjs'],
      },
      null,
      2,
    ),
  );

  let threw = false;
  let output = '';
  try {
    execFileSync('bash', [BUILD_SH, fixtureRoot], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    threw = true;
    output = `${err.stdout || ''}${err.stderr || ''}`;
    assert.notEqual(err.status, 0, 'expected non-zero exit code');
  }

  assert.ok(threw, 'expected build.sh to fail (throw) when a declared shared script is missing');
  assert.ok(
    output.includes('shared/does-not-exist.mjs') || output.includes('does-not-exist.mjs'),
    `expected failure message to name the missing shared/<script> path, got: ${output}`,
  );
  assert.ok(
    output.includes('ghost-plugin'),
    `expected failure message to name the declaring plugin, got: ${output}`,
  );
});
