#!/usr/bin/env node
// Generates cross-platform packaging artifacts (Codex, Copilot) from the
// existing Claude plugin manifests (plugins/<name>/.claude-plugin/plugin.json).
//
// Two modes are implemented:
//   - `derive`: non-interactive, deterministic, never prompts.
//     Reads each plugin's .claude-plugin/plugin.json and emits:
//       1) plugins/<name>/.codex-plugin/plugin.json  (Codex per-plugin manifest)
//       2) plugins/<name>/plugin.json                (Copilot per-plugin manifest)
//       3) <root>/.codex-plugin/marketplace.json      (Codex-consumable catalog)
//   - `create`: scaffolds a brand-new plugins/<name>/ from --name/--description
//     /--author (+ optional --version, default 0.1.0): writes the Claude
//     manifest (the single source of truth) and an example skill, registers
//     the plugin in the shared .claude-plugin/marketplace.json, then calls
//     the SAME emit-core used by `derive` (emitPluginManifests /
//     buildCatalogEntry / runDerive) to generate the Codex/Copilot per-plugin
//     manifests and the Codex catalog entry — it never writes those
//     independently. Non-interactive when all three required flags are
//     given; refuses to clobber an existing plugin name or accept a
//     non-kebab-case name (validated BEFORE any filesystem write, so a
//     rejected run touches nothing). See `promptForMissing` below for the
//     intended interactive behavior (prompts for any omitted required field
//     when stdin is a TTY); it is not covered by automated tests here.
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
//   node scripts/generate-cross-platform.mjs create --name <n> --description <d> \
//     --author <a> [--version <v>] [--root <path>]
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
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEFAULT_CREATE_VERSION = '0.1.0';

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

// --- create mode -----------------------------------------------------------
//
// Prompts for any omitted required field (--name/--description/--author)
// when running interactively (a TTY attached to stdin). This is the intended
// UX for a human running `create` with no/partial flags; it is deliberately
// NOT exercised by the automated test suite (which always runs
// non-interactively, e.g. under `node --test`, where stdin is not a TTY).
// In a non-interactive context (tests, CI, scripts), missing required flags
// must never hang or crash waiting on stdin — see the `interactive` guard in
// `parseCreateArgs`/`main` below, which raises a clear error instead.
async function promptForMissing(opts) {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!opts.name) opts.name = (await rl.question('Plugin name (kebab-case): ')).trim();
    if (!opts.description) opts.description = (await rl.question('Description: ')).trim();
    if (!opts.author) opts.author = (await rl.question('Author: ')).trim();
  } finally {
    rl.close();
  }
  return opts;
}

export function validatePluginNameShape(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error("missing required '--name'");
  }
  if (!KEBAB_CASE_RE.test(name)) {
    throw new Error(`invalid plugin name '${name}': must be kebab-case (lowercase letters, digits, single hyphens)`);
  }
}

// Validates every precondition for `create` WITHOUT touching the filesystem
// (beyond read-only checks), so a rejected run never creates or modifies any
// file. Throws with the offending name/value in the message.
export function validateCreateInputs(root, { name, description, author, version }) {
  validatePluginNameShape(name);

  if (typeof description !== 'string' || description.length === 0) {
    throw new Error("missing required '--description'");
  }
  if (typeof author !== 'string' || author.length === 0) {
    throw new Error("missing required '--author'");
  }
  if (typeof version !== 'string' || version.length === 0 || !SEMVER_RE.test(version)) {
    throw new Error(`invalid '--version' value '${version}': must be semver X.Y.Z`);
  }

  const pluginDir = path.join(root, 'plugins', name);
  if (fs.existsSync(pluginDir)) {
    throw new Error(`plugin '${name}' already exists at ${pluginDir}; refusing to clobber it`);
  }

  const marketplacePath = path.join(root, '.claude-plugin', 'marketplace.json');
  if (fs.existsSync(marketplacePath)) {
    let marketplace;
    try {
      marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
    } catch (err) {
      throw new Error(`invalid JSON in ${marketplacePath}: ${err.message}`);
    }
    if (Array.isArray(marketplace.plugins) && marketplace.plugins.some((p) => p.name === name)) {
      throw new Error(`plugin '${name}' already registered in ${marketplacePath}; refusing to clobber it`);
    }
  }
}

// Builds the Claude manifest and example skill content for a new plugin
// (pure, no filesystem writes). The Claude manifest is the single source of
// truth: everything else (Codex/Copilot manifests, Codex catalog) is derived
// from it via emitPluginManifests/buildCatalogEntry, never authored here.
export function computeCreateArtifacts(root, { name, description, author, version = DEFAULT_CREATE_VERSION }) {
  const pluginDir = path.join(root, 'plugins', name);

  const claudeManifest = {
    $schema: 'https://anthropic.com/claude-code/plugin.schema.json',
    name,
    version,
    description,
    author: { name: author },
  };

  const skillName = 'getting-started';
  const skillMd =
    `---\n` +
    `name: ${skillName}\n` +
    `description: Use this skill for an introduction to the ${name} plugin — what it does and how to use it. Replace this placeholder with a real trigger description once the plugin has actual functionality.\n` +
    `---\n\n` +
    `# Getting Started with ${name}\n\n` +
    `${description}\n\n` +
    `## Usage\n\n` +
    `Describe this skill's procedure here.\n`;

  return {
    pluginDir,
    claudeManifestFile: {
      absPath: path.join(pluginDir, '.claude-plugin', 'plugin.json'),
      content: toJson(claudeManifest),
    },
    skillFile: {
      absPath: path.join(pluginDir, 'skills', skillName, 'SKILL.md'),
      content: skillMd,
    },
    claudeManifest,
  };
}

// Adds `name` to the shared (Claude/Copilot) marketplace catalog, preserving
// the existing entries' shape (name/source/description).
export function registerInSharedMarketplace(root, name, description) {
  const marketplacePath = path.join(root, '.claude-plugin', 'marketplace.json');
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
  marketplace.plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  marketplace.plugins.push({ name, source: `./plugins/${name}`, description });
  fs.writeFileSync(marketplacePath, toJson(marketplace));
}

// Runs create mode end-to-end: validate (no writes) -> write the Claude
// manifest + example skill -> register in the shared marketplace -> re-run
// `derive` (t2's emit-core) so the Codex/Copilot per-plugin manifests and the
// Codex catalog entry are generated the exact same way as every other
// plugin, never authored independently here.
export function runCreate(root, opts) {
  validateCreateInputs(root, opts);

  const { pluginDir, claudeManifestFile, skillFile } = computeCreateArtifacts(root, opts);

  fs.mkdirSync(path.dirname(claudeManifestFile.absPath), { recursive: true });
  fs.writeFileSync(claudeManifestFile.absPath, claudeManifestFile.content);

  fs.mkdirSync(path.dirname(skillFile.absPath), { recursive: true });
  fs.writeFileSync(skillFile.absPath, skillFile.content);

  registerInSharedMarketplace(root, opts.name, opts.description);

  // Reuse t2's emit-core for every derived artifact (Codex/Copilot per-plugin
  // manifests + Codex catalog), for this plugin AND to keep every other
  // plugin's artifacts in sync.
  runDerive(root);

  return { pluginDir };
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

function parseCreateArgs(rest) {
  const opts = { root: DEFAULT_ROOT, version: DEFAULT_CREATE_VERSION };
  const FLAGS = { '--name': 'name', '--description': 'description', '--author': 'author', '--version': 'version', '--root': 'root' };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    let matched = false;
    for (const [flag, key] of Object.entries(FLAGS)) {
      if (arg === flag) {
        opts[key] = rest[++i];
        matched = true;
        break;
      } else if (arg.startsWith(`${flag}=`)) {
        opts[key] = arg.slice(flag.length + 1);
        matched = true;
        break;
      }
    }
    if (!matched) throw new Error(`unrecognized argument: ${arg}`);
  }
  return opts;
}

async function runCreateCli(rest) {
  const opts = parseCreateArgs(rest);
  const root = path.resolve(opts.root);

  // Interactive mode: only when a required field is missing AND stdin is a
  // TTY (a human at a terminal). Non-interactive contexts (tests, CI, a
  // script with a missing flag) fall through untouched and let
  // validateCreateInputs raise a clear, non-zero-exit error instead of
  // hanging on a prompt.
  if ((!opts.name || !opts.description || !opts.author) && process.stdin.isTTY) {
    await promptForMissing(opts);
  }

  try {
    const { pluginDir } = runCreate(root, opts);
    console.log(`✔ created plugin '${opts.name}' at ${path.relative(root, pluginDir)}`);
  } catch (err) {
    console.error(`✘ ${err.message}`);
    process.exit(1);
  }
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);

  if (mode === 'create') {
    runCreateCli(rest);
    return;
  }

  if (mode !== 'derive') {
    console.error(`✘ unknown or unimplemented mode '${mode ?? ''}' (expected 'derive' or 'create')`);
    process.exit(1);
  }

  const { opts } = parseArgs(process.argv.slice(2));
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
