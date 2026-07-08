// exec/config.mjs — R2/R4/R5 (change-type-versioning-policy spec): reads the
// optional per-project `.sdd-kit.json` at the repo root and the spec.md's
// recorded `Change type:` line. Pure Node ESM, stdlib only. No npm
// dependencies. Convention: modules return data, they don't print.
//
// This module is intentionally generic/reusable: it's read by cmdInit today
// (branch-prefix resolution, R2) and will be read again by the later
// versioning-policy checks (t4-versioning-check, t5-validate-wiring,
// t6-verify-gate) for `versioningPolicy`/`changelogPath` — keep new fields
// here rather than re-deriving `.sdd-kit.json` reads elsewhere.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_BRANCH_PREFIXES = Object.freeze({
  feat: 'feat', fix: 'fix', chore: 'chore', refactor: 'refactor', docs: 'docs',
});
export const DEFAULT_VERSIONING_POLICY = 'disabled';
export const DEFAULT_CHANGELOG_PATH = 'CHANGELOG.md';

function repoRoot(cwd) {
  const res = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : cwd;
}

/**
 * Reads `.sdd-kit.json` from the repo root (resolved from `cwd` via `git
 * rev-parse --show-toplevel`, falling back to `cwd` itself if that fails).
 * All fields are optional; missing file or missing fields fall back to
 * defaults. `branchPrefixes` is returned fully merged with the built-in
 * identity map, so every known change-type key is always present unless
 * explicitly overridden (including to `''`).
 *
 * @param {string} [cwd]
 * @returns {{ branchPrefixes: Record<string,string>, versioningPolicy: string, changelogPath: string }}
 */
export function readConfig(cwd = process.cwd()) {
  const root = repoRoot(cwd);
  const configPath = path.join(root, '.sdd-kit.json');
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    raw = {};
  }
  const branchPrefixes = { ...DEFAULT_BRANCH_PREFIXES, ...(raw.branchPrefixes || {}) };
  const versioningPolicy = raw.versioningPolicy || DEFAULT_VERSIONING_POLICY;
  const changelogPath = raw.changelogPath || DEFAULT_CHANGELOG_PATH;
  return { branchPrefixes, versioningPolicy, changelogPath };
}

/**
 * Reads a spec.md's `Change type: <value>` line (format from
 * skills/spec-writer/assets/spec-template.md). Returns the trimmed value, or
 * `null` if the file can't be read or the line is absent (R2.S3).
 *
 * @param {string} specPath
 * @returns {string|null}
 */
export function readChangeType(specPath) {
  let text;
  try {
    text = fs.readFileSync(specPath, 'utf8');
  } catch {
    return null;
  }
  const match = text.match(/^Change type:\s*(\S+)\s*$/m);
  return match ? match[1] : null;
}

/**
 * Resolves the branch prefix for a change type against a config's
 * `branchPrefixes` map, falling back to the built-in default for that key
 * when the type itself is unknown (defensive; spec-writer only ever records
 * one of the five known types).
 *
 * @param {string|null} changeType
 * @param {{ branchPrefixes: Record<string,string> }} config
 * @returns {string}
 */
export function resolvePrefix(changeType, config) {
  const type = changeType || 'feat';
  const prefixes = (config && config.branchPrefixes) || DEFAULT_BRANCH_PREFIXES;
  const prefix = prefixes[type];
  return prefix !== undefined ? prefix : (DEFAULT_BRANCH_PREFIXES[type] ?? type);
}
