#!/usr/bin/env node
// versioning-report.mjs — R4 (change-type-versioning-policy spec): the CLI
// entry point scripts/validate.sh shells out to for the non-blocking
// versioning/changelog check (R4.S1-R4.S5).
//
// Design: this file owns everything scripts/exec/versioning-check.mjs
// deliberately does NOT (per that module's header comment) — shelling out to
// git to find touched files and to read the pre-change ("before") baseline
// via `git show <baseRef>:path`. versioning-check.mjs itself stays pure and
// untouched.
//
// Contract with scripts/validate.sh (R4): this script ALWAYS exits 0 and
// prints warnings as plain text to stdout — never JSON, never a non-zero
// exit — so it can never affect validate.sh's own exit code. When
// `versioningPolicy` is `disabled` or absent (the default), it prints
// nothing at all (R4.S1). Any internal error (e.g. git not available, no
// commits yet) is swallowed the same way: no warning is safer than a false
// positive breaking every consumer of validate.sh by default.
//
// Usage: node versioning-report.mjs <repoRoot> [baseRef]
//   <repoRoot>  - project root to check (validate.sh passes its own $ROOT).
//   [baseRef]   - optional git ref to diff against; falls back to
//                 $VERSIONING_BASE_REF, then an autodetected merge-base with
//                 the default branch, then the repo's first commit.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { readConfig } from './exec/config.mjs';
import { currentBranch } from './exec/git.mjs';
import { checkVersioning } from './exec/versioning-check.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

function branchPrefixFromBranchName(branch) {
  const idx = branch.indexOf('/');
  return idx === -1 ? branch : branch.slice(0, idx);
}

// Best-effort base ref: explicit arg/env wins; otherwise try a merge-base
// against common default-branch names (skipped when we're already on one of
// them, so the diff is just the uncommitted gap); last resort is the repo's
// very first commit so the diff still means something in a single-branch
// fixture/test repo.
function resolveBaseRef(cwd, explicit) {
  if (explicit) return explicit;
  if (process.env.VERSIONING_BASE_REF) return process.env.VERSIONING_BASE_REF;

  const branch = currentBranch(cwd);
  if (branch === 'main' || branch === 'master') return 'HEAD';

  for (const candidate of ['main', 'master', 'origin/main', 'origin/master']) {
    if (candidate === branch) continue;
    const base = git(['merge-base', 'HEAD', candidate], cwd);
    if (base) return base;
  }
  return git(['rev-list', '--max-parents=0', 'HEAD'], cwd) || 'HEAD';
}

function touchedFilesSince(cwd, baseRef) {
  const out = git(['diff', '--name-only', baseRef], cwd);
  return out ? out.split('\n').filter(Boolean) : [];
}

function showFile(cwd, ref, relPath) {
  const res = spawnSync('git', ['show', `${ref}:${relPath}`], { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout : null;
}

function beforePluginVersion(cwd, ref, pluginName) {
  const raw = showFile(cwd, ref, path.posix.join('plugins', pluginName, '.claude-plugin', 'plugin.json'));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

function changelogHeadings(text) {
  if (!text) return [];
  const headings = [];
  for (const line of text.split('\n')) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) headings.push(match[1]);
  }
  return headings;
}

function beforePluginChangelogHeadings(cwd, ref, pluginName) {
  return changelogHeadings(showFile(cwd, ref, path.posix.join('plugins', pluginName, 'CHANGELOG.md')));
}

function buildBefore(cwd, ref, config, touchedFiles) {
  if (config.versioningPolicy === 'plugin-changelog') {
    const before = {};
    const pluginRe = /^plugins\/([^/]+)\//;
    for (const file of touchedFiles) {
      const match = pluginRe.exec(file.replace(/\\/g, '/'));
      if (!match) continue;
      const name = match[1];
      if (before[name]) continue;
      before[name] = {
        version: beforePluginVersion(cwd, ref, name),
        changelogHeadings: beforePluginChangelogHeadings(cwd, ref, name),
      };
    }
    return before;
  }
  if (config.versioningPolicy === 'changelog-only') {
    return { changelogHeadings: changelogHeadings(showFile(cwd, ref, config.changelogPath)) };
  }
  return {};
}

function main(argv) {
  const cwd = argv[2] ? path.resolve(argv[2]) : process.cwd();
  const explicitBaseRef = argv[3] || null;

  let config;
  try {
    config = readConfig(cwd);
  } catch {
    return; // never let a config-read error surface as a warning or exit != 0
  }

  // R4.S1: disabled (or absent, which readConfig already defaults to
  // 'disabled') skips the check entirely — no warning, ever.
  if (!config.versioningPolicy || config.versioningPolicy === 'disabled') return;

  try {
    const baseRef = resolveBaseRef(cwd, explicitBaseRef);
    const touchedFiles = touchedFilesSince(cwd, baseRef);
    const branch = currentBranch(cwd);
    const branchPrefix = branchPrefixFromBranchName(branch);
    const before = buildBefore(cwd, baseRef, config, touchedFiles);

    const warnings = checkVersioning({
      cwd, touchedFiles, config, branchPrefix, before,
    });
    for (const warning of warnings) {
      process.stdout.write(`⚠ versioning: ${warning.message}\n`);
    }
  } catch {
    // Any git/parsing failure degrades to "no warning" rather than risking
    // a false positive or a crash that could ever change validate.sh's exit
    // code — see this file's header.
  }
}

main(process.argv);
process.exit(0);
