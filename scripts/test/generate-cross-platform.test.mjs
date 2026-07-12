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
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'generate-cross-platform.mjs');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function makeFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'generate-cross-platform-fixture-'));
}

// Builds a fixture tree with two fake plugins under plugins/<name>/.claude-plugin/plugin.json,
// mirroring the real repo layout (plugins/sdd-kit, plugins/claude-token-debug, ...) without
// depending on it, so the tests are hermetic.
function buildFixture() {
  const fixtureRoot = makeFixtureRoot();
  const plugins = {
    'alpha-tool': {
      name: 'alpha-tool',
      version: '1.2.3',
      description: 'Fixture plugin alpha for generate-cross-platform tests.',
      author: { name: 'fixture', email: 'fixture@example.com' },
    },
    'beta-widget': {
      name: 'beta-widget',
      version: '0.4.0',
      description: 'Fixture plugin beta for generate-cross-platform tests.',
      author: { name: 'fixture', email: 'fixture@example.com' },
    },
  };

  for (const [name, manifest] of Object.entries(plugins)) {
    const pluginDir = path.join(fixtureRoot, 'plugins', name);
    fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
  }

  return { fixtureRoot, plugins };
}

function runDerive(fixtureRoot, extraArgs = []) {
  return execFileSync(
    'node',
    [GENERATOR, 'derive', '--root', fixtureRoot, ...extraArgs],
    { encoding: 'utf8' },
  );
}

test('R2.S1: For each plugin directory, a generated Codex per-plugin manifest exists, parses as JSON, and its name matches the directory name, its version matches that plugin\'s Claude manifest version, and its description is non-empty.', () => {
  const { fixtureRoot, plugins } = buildFixture();
  runDerive(fixtureRoot);

  for (const [name, claudeManifest] of Object.entries(plugins)) {
    const codexManifestPath = path.join(fixtureRoot, 'plugins', name, '.codex-plugin', 'plugin.json');
    assert.ok(fs.existsSync(codexManifestPath), `expected ${codexManifestPath} to exist`);

    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(fs.readFileSync(codexManifestPath, 'utf8'));
    }, `${codexManifestPath} must parse as valid JSON`);

    assert.equal(parsed.name, name, `codex manifest name must equal directory name '${name}'`);
    assert.equal(
      parsed.version,
      claudeManifest.version,
      `codex manifest version must equal the Claude manifest version for '${name}'`,
    );
    assert.equal(typeof parsed.description, 'string', 'description must be a string');
    assert.ok(parsed.description.length > 0, 'description must be non-empty');
  }
});

test('R2.S2: For each plugin directory, a generated Copilot root per-plugin manifest exists, parses as JSON, with name matching the directory, version matching the Claude manifest version, and a non-empty description.', () => {
  const { fixtureRoot, plugins } = buildFixture();
  runDerive(fixtureRoot);

  for (const [name, claudeManifest] of Object.entries(plugins)) {
    const copilotManifestPath = path.join(fixtureRoot, 'plugins', name, 'plugin.json');
    assert.ok(fs.existsSync(copilotManifestPath), `expected ${copilotManifestPath} to exist`);

    let parsed;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(fs.readFileSync(copilotManifestPath, 'utf8'));
    }, `${copilotManifestPath} must parse as valid JSON`);

    assert.equal(parsed.name, name, `copilot manifest name must equal directory name '${name}'`);
    assert.equal(
      parsed.version,
      claudeManifest.version,
      `copilot manifest version must equal the Claude manifest version for '${name}'`,
    );
    assert.equal(typeof parsed.description, 'string', 'description must be a string');
    assert.ok(parsed.description.length > 0, 'description must be non-empty');
  }
});

test('R2.S3: Re-running the generator produces no change to the committed Codex manifests, Copilot manifests, or Codex catalog, and the drift check integrated into the repo validation reports no diff.', () => {
  const { fixtureRoot } = buildFixture();

  runDerive(fixtureRoot); // first run: generates the artifacts ("committed" state)

  const targets = [
    path.join(fixtureRoot, 'plugins', 'alpha-tool', '.codex-plugin', 'plugin.json'),
    path.join(fixtureRoot, 'plugins', 'alpha-tool', 'plugin.json'),
    path.join(fixtureRoot, 'plugins', 'beta-widget', '.codex-plugin', 'plugin.json'),
    path.join(fixtureRoot, 'plugins', 'beta-widget', 'plugin.json'),
    path.join(fixtureRoot, '.codex-plugin', 'marketplace.json'),
  ];
  const before = targets.map((p) => fs.readFileSync(p, 'utf8'));

  runDerive(fixtureRoot); // second run: must be a byte-for-byte no-op

  const after = targets.map((p) => fs.readFileSync(p, 'utf8'));
  assert.deepEqual(after, before, 'regenerating must not change any tracked output file');

  // The drift check mode (--check) must also report no diff without rewriting anything.
  let checkOutput = '';
  let threw = false;
  try {
    checkOutput = runDerive(fixtureRoot, ['--check']);
  } catch (err) {
    threw = true;
    checkOutput = `${err.stdout || ''}${err.stderr || ''}`;
  }
  assert.equal(threw, false, `expected --check to exit 0 when in sync, got: ${checkOutput}`);

  const afterCheck = targets.map((p) => fs.readFileSync(p, 'utf8'));
  assert.deepEqual(afterCheck, before, '--check must never rewrite files');
});

test('R2.S4: Every entry in the Codex-consumable catalog carries a source, a semver version, an installation policy, an authentication policy, and a category.', () => {
  const { fixtureRoot, plugins } = buildFixture();
  runDerive(fixtureRoot);

  const catalogPath = path.join(fixtureRoot, '.codex-plugin', 'marketplace.json');
  assert.ok(fs.existsSync(catalogPath), `expected Codex catalog at ${catalogPath}`);

  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(Array.isArray(catalog.plugins), 'catalog.plugins must be an array');
  assert.equal(catalog.plugins.length, Object.keys(plugins).length);

  for (const entry of catalog.plugins) {
    assert.equal(typeof entry.source, 'string', 'entry.source must be a string');
    assert.ok(entry.source.length > 0, 'entry.source must be non-empty');

    assert.equal(typeof entry.version, 'string', 'entry.version must be a string');
    assert.match(entry.version, SEMVER_RE, `entry.version '${entry.version}' must be semver X.Y.Z`);

    assert.equal(typeof entry.policy?.installation, 'string', 'entry.policy.installation must be a string');
    assert.ok(entry.policy.installation.length > 0, 'entry.policy.installation must be non-empty');

    assert.equal(typeof entry.policy?.authentication, 'string', 'entry.policy.authentication must be a string');
    assert.ok(entry.policy.authentication.length > 0, 'entry.policy.authentication must be non-empty');

    assert.equal(typeof entry.category, 'string', 'entry.category must be a string');
    assert.ok(entry.category.length > 0, 'entry.category must be non-empty');
  }
});
