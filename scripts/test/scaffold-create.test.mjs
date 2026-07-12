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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-create-fixture-'));
}

// Builds a fixture tree mirroring the real repo layout: one pre-existing
// plugin, the shared (Claude/Copilot) marketplace catalog, and (after an
// initial `derive` run) the Codex-consumable artifacts — all hermetic, none
// of it touches the real repo's plugins/.
function buildFixture() {
  const fixtureRoot = makeFixtureRoot();

  const existingManifest = {
    name: 'alpha-tool',
    version: '1.2.3',
    description: 'Pre-existing fixture plugin for scaffold-create tests.',
    author: { name: 'fixture', email: 'fixture@example.com' },
  };
  const pluginDir = path.join(fixtureRoot, 'plugins', 'alpha-tool');
  fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(existingManifest, null, 2) + '\n',
  );

  const sharedMarketplace = {
    name: 'fixture-marketplace',
    description: 'Fixture shared marketplace catalog.',
    owner: { name: 'fixture', email: 'fixture@example.com' },
    metadata: { version: '1.0.0' },
    plugins: [
      { name: 'alpha-tool', source: './plugins/alpha-tool', description: existingManifest.description },
    ],
  };
  fs.mkdirSync(path.join(fixtureRoot, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(sharedMarketplace, null, 2) + '\n',
  );

  // Seed the Codex-consumable artifacts (per-plugin manifests + catalog) via
  // derive, mirroring the real repo's already-committed generated state.
  runDerive(fixtureRoot);

  return { fixtureRoot };
}

function runDerive(fixtureRoot, extraArgs = []) {
  return execFileSync('node', [GENERATOR, 'derive', '--root', fixtureRoot, ...extraArgs], {
    encoding: 'utf8',
  });
}

function runCreate(fixtureRoot, flags) {
  return execFileSync('node', [GENERATOR, 'create', '--root', fixtureRoot, ...flags], {
    encoding: 'utf8',
  });
}

// Recursively snapshots every file's relative path -> content under root, to
// assert "no files touched" after a rejected run without depending on git.
function snapshotTree(root) {
  const snapshot = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else {
        snapshot[path.relative(root, abs)] = fs.readFileSync(abs, 'utf8');
      }
    }
  }
  walk(root);
  return snapshot;
}

test('R5.S1: Running the create command non-interactively with name/description/author flags produces a plugin directory with a Claude manifest (matching name, a semver version, the given description and author), an example skill file, both Codex and Copilot per-plugin manifests, and an entry in the shared marketplace catalog and the Codex catalog; afterward the repo validation passes and re-running the generator leaves no drift.', () => {
  const { fixtureRoot } = buildFixture();

  const name = 'new-widget';
  const description = 'A brand new fixture plugin created via scaffold create.';
  const author = 'Fixture Author';

  runCreate(fixtureRoot, ['--name', name, '--description', description, '--author', author]);

  // Claude manifest: single source of truth.
  const claudeManifestPath = path.join(fixtureRoot, 'plugins', name, '.claude-plugin', 'plugin.json');
  assert.ok(fs.existsSync(claudeManifestPath), `expected Claude manifest at ${claudeManifestPath}`);
  const claudeManifest = JSON.parse(fs.readFileSync(claudeManifestPath, 'utf8'));
  assert.equal(claudeManifest.name, name);
  assert.match(claudeManifest.version, SEMVER_RE, 'version must be semver X.Y.Z');
  assert.equal(claudeManifest.description, description);
  assert.ok(claudeManifest.author, 'manifest must have an author');
  assert.equal(claudeManifest.author.name ?? claudeManifest.author, author);

  // Example skill file.
  const skillsDir = path.join(fixtureRoot, 'plugins', name, 'skills');
  assert.ok(fs.existsSync(skillsDir), `expected skills dir at ${skillsDir}`);
  const skillNames = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(skillNames.length >= 1, 'expected at least one example skill directory');
  const skillMdPath = path.join(skillsDir, skillNames[0].name, 'SKILL.md');
  assert.ok(fs.existsSync(skillMdPath), `expected ${skillMdPath} to exist`);
  const skillMd = fs.readFileSync(skillMdPath, 'utf8');
  assert.match(skillMd, /^---\n/, 'SKILL.md must start with YAML frontmatter');
  assert.match(skillMd, /\nname:\s*\S+/, 'SKILL.md frontmatter must have a name');
  assert.match(skillMd, /\ndescription:\s*\S+/, 'SKILL.md frontmatter must have a description');

  // Codex + Copilot per-plugin manifests, generated through the same emit-core as t2.
  const codexManifestPath = path.join(fixtureRoot, 'plugins', name, '.codex-plugin', 'plugin.json');
  const copilotManifestPath = path.join(fixtureRoot, 'plugins', name, 'plugin.json');
  assert.ok(fs.existsSync(codexManifestPath), `expected Codex manifest at ${codexManifestPath}`);
  assert.ok(fs.existsSync(copilotManifestPath), `expected Copilot manifest at ${copilotManifestPath}`);
  const codexManifest = JSON.parse(fs.readFileSync(codexManifestPath, 'utf8'));
  const copilotManifest = JSON.parse(fs.readFileSync(copilotManifestPath, 'utf8'));
  for (const m of [codexManifest, copilotManifest]) {
    assert.equal(m.name, name);
    assert.equal(m.version, claudeManifest.version);
    assert.equal(m.description, description);
  }

  // Shared marketplace catalog entry.
  const sharedMarketplace = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
  );
  const sharedEntry = sharedMarketplace.plugins.find((p) => p.name === name);
  assert.ok(sharedEntry, 'expected new plugin entry in shared marketplace.json');
  assert.equal(sharedEntry.source, `./plugins/${name}`);
  assert.equal(sharedEntry.description, description);

  // Codex catalog entry.
  const codexCatalog = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, '.codex-plugin', 'marketplace.json'), 'utf8'),
  );
  const codexEntry = codexCatalog.plugins.find((p) => p.name === name);
  assert.ok(codexEntry, 'expected new plugin entry in Codex catalog');
  assert.equal(codexEntry.source, `./plugins/${name}`);
  assert.match(codexEntry.version, SEMVER_RE);
  assert.equal(typeof codexEntry.policy?.installation, 'string');
  assert.ok(codexEntry.policy.installation.length > 0);
  assert.equal(typeof codexEntry.policy?.authentication, 'string');
  assert.ok(codexEntry.policy.authentication.length > 0);
  assert.equal(typeof codexEntry.category, 'string');
  assert.ok(codexEntry.category.length > 0);

  // Repo validation equivalent: derive --check must report no drift now.
  let checkThrew = false;
  try {
    runDerive(fixtureRoot, ['--check']);
  } catch (err) {
    checkThrew = true;
  }
  assert.equal(checkThrew, false, 'derive --check must pass (no drift) after create');

  // Re-running the generator must be a no-op (no further drift).
  const before = snapshotTree(fixtureRoot);
  runDerive(fixtureRoot);
  const after = snapshotTree(fixtureRoot);
  assert.deepEqual(after, before, 're-running derive after create must leave no drift');
});

test('R5.S2: Running the create command with an already-existing plugin name or a non-kebab-case name exits non-zero, names the offending name in the error message, and leaves the working tree unchanged.', () => {
  const { fixtureRoot } = buildFixture();
  const before = snapshotTree(fixtureRoot);

  // Case A: clobbering an existing plugin name.
  let clobberError;
  try {
    runCreate(fixtureRoot, [
      '--name', 'alpha-tool',
      '--description', 'Attempt to clobber the existing plugin.',
      '--author', 'Someone',
    ]);
    assert.fail('expected create to exit non-zero for an existing plugin name');
  } catch (err) {
    clobberError = err;
  }
  assert.notEqual(clobberError.status, 0, 'expected non-zero exit code for clobber attempt');
  const clobberStderr = clobberError.stderr?.toString() ?? '';
  assert.ok(clobberStderr.includes('alpha-tool'), `expected stderr to name 'alpha-tool', got: ${clobberStderr}`);
  assert.deepEqual(snapshotTree(fixtureRoot), before, 'clobber attempt must not touch any files');

  // Case B: non-kebab-case name.
  const badName = 'NotKebab_Case';
  let kebabError;
  try {
    runCreate(fixtureRoot, [
      '--name', badName,
      '--description', 'Attempt with a bad name.',
      '--author', 'Someone',
    ]);
    assert.fail('expected create to exit non-zero for a non-kebab-case name');
  } catch (err) {
    kebabError = err;
  }
  assert.notEqual(kebabError.status, 0, 'expected non-zero exit code for non-kebab-case name');
  const kebabStderr = kebabError.stderr?.toString() ?? '';
  assert.ok(kebabStderr.includes(badName), `expected stderr to name '${badName}', got: ${kebabStderr}`);
  assert.deepEqual(snapshotTree(fixtureRoot), before, 'non-kebab-case attempt must not touch any files');
});
