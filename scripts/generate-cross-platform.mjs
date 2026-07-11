#!/usr/bin/env node
// Generates cross-platform packaging artifacts (Codex, Copilot) from the
// existing Claude plugin manifests (plugins/<name>/.claude-plugin/plugin.json).
//
// Two modes are planned; only `derive` is implemented here:
//   - `derive` (this file): non-interactive, deterministic, never prompts.
//     Reads each plugin's .claude-plugin/plugin.json and emits:
//       1) plugins/<name>/.codex-plugin/plugin.json  (Codex per-plugin manifest)
//       2) plugins/<name>/plugin.json                (Copilot per-plugin manifest)
//       3) <root>/.codex-plugin/marketplace.json      (Codex-consumable catalog)
//   - `create` (future task): fields via flags, prompts only for omitted ones,
//     reuses the same emit-core (emitPluginManifests / buildCatalogEntry below)
//     so .claude-plugin/plugin.json stays the single source of truth.
//
// Catalog location: `.codex-plugin/marketplace.json` at the repo root, mirroring
// the per-plugin `.codex-plugin/plugin.json` convention (root config dir <->
// per-plugin config dir). It is derived solely from each plugin's
// .claude-plugin/plugin.json — intentionally decoupled from the shared
// .claude-plugin/marketplace.json (which is Claude/Copilot's own catalog) so
// each generated artifact has exactly one upstream source.
//
// Usage:
//   node scripts/generate-cross-platform.mjs derive [--check] [--root <path>]
//
// `--check` (the drift check wired into scripts/validate.sh) recomputes every
// artifact and compares it to what's on disk WITHOUT writing anything; it
// exits non-zero and names every out-of-sync path if regeneration would
// change something. Without `--check`, derive writes/overwrites the artifacts
// (only touching files whose content actually changed).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.join(__dirname, '..');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// Codex category per plugin, chosen to describe each plugin's primary purpose
// for a marketplace that browses/filters by category. Extend this map when a
// new plugin is added (or, for the future create mode, accept it via a
// --category flag); any plugin not listed here falls back to DEFAULT_CATEGORY
// so the catalog stays well-formed even for not-yet-categorized plugins.
export const CATEGORY_MAP = {
  // Spec -> plan -> exec pipeline: a development workflow, not a point tool.
  'sdd-kit': 'Workflow',
  // Diagnostics/measurement toolkit for Claude Code's own token spend.
  'claude-token-debug': 'Developer Tools',
  // Automated optimization of CLAUDE.md/AGENTS.md context.
  'token-diet': 'Productivity',
};
export const DEFAULT_CATEGORY = 'Utilities';

// All plugins in this marketplace are Markdown/skill packages installed by
// cloning the repo through the platform's own plugin-marketplace mechanism:
// no separate installer step and no external service credentials required.
// Hence a uniform policy across entries today; revisit per-plugin if a future
// plugin needs its own auth (e.g. calls an external API at install time).
export const DEFAULT_POLICY = { installation: 'manual', authentication: 'none' };

export function toJson(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

export function listPluginDirs(pluginsRoot) {
  if (!fs.existsSync(pluginsRoot)) return [];
  return fs
    .readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function readClaudeManifest(pluginDir, name) {
  const manifestPath = path.join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`plugin '${name}': missing .claude-plugin/plugin.json at ${manifestPath}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`plugin '${name}': invalid JSON in ${manifestPath}: ${err.message}`);
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`plugin '${name}': missing/empty 'version' in ${manifestPath}`);
  }
  if (typeof manifest.description !== 'string' || manifest.description.length === 0) {
    throw new Error(`plugin '${name}': missing/empty 'description' in ${manifestPath}`);
  }
  return manifest;
}

// Shared emit-core: derives the Codex and Copilot per-plugin manifest contents
// (and their target paths) for a single plugin from its Claude manifest. Pure
// (no filesystem writes) so both `derive` and the future `create` mode can
// call it and decide independently whether/how to persist the result.
export function emitPluginManifests(pluginDir, claudeManifest) {
  const name = path.basename(pluginDir);
  if (typeof claudeManifest?.version !== 'string' || claudeManifest.version.length === 0) {
    throw new Error(`plugin '${name}': missing/empty 'version' in Claude manifest`);
  }
  if (typeof claudeManifest?.description !== 'string' || claudeManifest.description.length === 0) {
    throw new Error(`plugin '${name}': missing/empty 'description' in Claude manifest`);
  }

  const codexManifest = {
    name,
    version: claudeManifest.version,
    description: claudeManifest.description,
  };
  const copilotManifest = {
    name,
    version: claudeManifest.version,
    description: claudeManifest.description,
  };

  return {
    codex: {
      absPath: path.join(pluginDir, '.codex-plugin', 'plugin.json'),
      content: toJson(codexManifest),
    },
    copilot: {
      absPath: path.join(pluginDir, 'plugin.json'),
      content: toJson(copilotManifest),
    },
  };
}

export function buildCatalogEntry(name, claudeManifest) {
  if (!SEMVER_RE.test(claudeManifest.version)) {
    throw new Error(`plugin '${name}': version '${claudeManifest.version}' is not semver X.Y.Z`);
  }
  return {
    name,
    source: `./plugins/${name}`,
    version: claudeManifest.version,
    description: claudeManifest.description,
    policy: { ...DEFAULT_POLICY },
    category: CATEGORY_MAP[name] ?? DEFAULT_CATEGORY,
  };
}

export function buildCatalog(root, entries) {
  return {
    name: path.basename(root),
    description:
      'Codex-consumable marketplace catalog, generated from plugins/<name>/.claude-plugin/plugin.json ' +
      '(derive mode of scripts/generate-cross-platform.mjs). Do not hand-edit; re-run the generator.',
    plugins: entries,
  };
}

// Computes every generated artifact (absolute path + final content) for the
// given repo root, without touching the filesystem. This is the single
// source both write-mode and check-mode diff against.
export function computeArtifacts(root) {
  const pluginsRoot = path.join(root, 'plugins');
  const names = listPluginDirs(pluginsRoot);
  const files = [];
  const catalogEntries = [];

  for (const name of names) {
    const pluginDir = path.join(pluginsRoot, name);
    const claudeManifest = readClaudeManifest(pluginDir, name);
    const { codex, copilot } = emitPluginManifests(pluginDir, claudeManifest);
    files.push(codex, copilot);
    catalogEntries.push(buildCatalogEntry(name, claudeManifest));
  }

  const catalog = buildCatalog(root, catalogEntries);
  files.push({
    absPath: path.join(root, '.codex-plugin', 'marketplace.json'),
    content: toJson(catalog),
  });

  return files;
}

// Runs derive mode. In check mode, nothing is written; the returned array
// lists every out-of-sync path (empty means fully in sync). In write mode,
// only files whose content actually changed are touched.
export function runDerive(root, { check = false } = {}) {
  const files = computeArtifacts(root);
  const changed = [];

  for (const { absPath, content } of files) {
    const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null;
    if (existing !== content) {
      changed.push(path.relative(root, absPath));
      if (!check) {
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content);
      }
    }
  }

  return changed;
}

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = { check: false, root: DEFAULT_ROOT };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--check') {
      opts.check = true;
    } else if (arg === '--root') {
      opts.root = rest[++i];
    } else if (arg.startsWith('--root=')) {
      opts.root = arg.slice('--root='.length);
    } else {
      throw new Error(`unrecognized argument: ${arg}`);
    }
  }
  return { mode, opts };
}

function main() {
  const { mode, opts } = parseArgs(process.argv.slice(2));

  if (mode !== 'derive') {
    console.error(
      `✘ unknown or unimplemented mode '${mode ?? ''}' (only 'derive' is implemented; 'create' is a future task)`,
    );
    process.exit(1);
  }

  const root = path.resolve(opts.root);

  try {
    const changed = runDerive(root, { check: opts.check });

    if (opts.check) {
      if (changed.length > 0) {
        console.error(`✘ cross-platform artifacts out of sync (${changed.length} file(s)):`);
        for (const rel of changed) console.error(`  - ${rel}`);
        console.error('  Re-run: node scripts/generate-cross-platform.mjs derive');
        process.exit(1);
      }
      console.log('✔ cross-platform artifacts in sync (no drift)');
    } else {
      if (changed.length > 0) {
        console.log(`✔ cross-platform artifacts generated/updated (${changed.length} file(s)):`);
        for (const rel of changed) console.log(`  - ${rel}`);
      } else {
        console.log('✔ cross-platform artifacts already up to date (no changes)');
      }
    }
  } catch (err) {
    console.error(`✘ ${err.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
