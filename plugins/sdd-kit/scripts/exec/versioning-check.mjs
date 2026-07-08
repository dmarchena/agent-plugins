// exec/versioning-check.mjs — R4.S2/R4.S3/R4.S4/R4.S5 (change-type-versioning-policy
// spec): a `versioningPolicy`-driven check for whether touched plugins carry a
// compliant version bump / changelog entry. Pure Node ESM, stdlib only. No npm
// dependencies. Convention: modules return data, they don't print (see
// git.mjs's header comment) — this module never throws or exits for a
// warning; it only ever returns an array of warning objects (possibly empty).
//
// Design choice (kept intentionally pure/testable, per the task brief): this
// module does NOT shell out to git itself to diff a branch. Callers (e.g. the
// scripts/validate.sh and `verify` wiring built by sibling tasks
// t5-validate-wiring/t6-verify-gate) are responsible for supplying:
//   - `touchedFiles`: the branch's changed/touched file paths (repo-relative),
//   - `branchPrefix`: the literal prefix segment of the branch name (e.g. the
//     `fix` in `fix/<slug>`, or a project's custom-configured prefix),
//   - `before`: the pre-change baseline state (a plugin's prior `version` +
//     changelog headings, or the changelog's prior headings under
//     changelog-only) — read however the caller likes (e.g. `git show
//     <baseRef>:path`), never assumed to come from a real git repo here.
// This keeps versioning-check.mjs unit-testable against plain temp
// directories (see test/exec/versioning-check.test.mjs) rather than requiring
// a real git history in its own tests.
//
// Repo layout assumption (from the spec's Assumptions section): a touched
// plugin's version and changelog live at
// `plugins/<name>/.claude-plugin/plugin.json` (a `version` field) and
// `plugins/<name>/CHANGELOG.md` (one `## <heading>` per entry).

import fs from 'node:fs';
import path from 'node:path';

// Change-type -> semver segment, from AGENTS.md's "Plugin structure &
// versioning" table: fix/chore/refactor bump patch, feat bumps minor, docs
// requires no bump, major is reserved and unused pre-1.0.0 (never expected
// here).
const CHANGE_TYPE_SEGMENT = Object.freeze({
  fix: 'patch',
  chore: 'patch',
  refactor: 'patch',
  feat: 'minor',
  docs: null,
});

const PLUGIN_PATH_RE = /^plugins\/([^/]+)\//;

/**
 * Groups touched files by the plugin directory (`plugins/<name>/`) they fall
 * under, per the repo's layout convention. Files outside `plugins/` are
 * ignored (R4/R5 only care about plugin-changelog for touched plugins).
 *
 * @param {string[]} touchedFiles
 * @returns {string[]} unique plugin names, in first-seen order
 */
function touchedPlugins(touchedFiles) {
  const seen = [];
  for (const file of touchedFiles) {
    const match = PLUGIN_PATH_RE.exec(file.replace(/\\/g, '/'));
    if (match && !seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}

/**
 * Reverse-maps a branch's literal prefix (as it appears in the branch name)
 * back to the change type it represents, via the project's `branchPrefixes`
 * map (R2's config), so a renamed prefix (e.g. `chore` -> `bugfix`) still
 * resolves to the right expected segment. Falls back to treating the prefix
 * itself as the change type when no map entry produces it (covers the
 * default identity map, and any prefix a caller passes that isn't itself a
 * configured value).
 *
 * @param {string} branchPrefix
 * @param {Record<string,string>} branchPrefixes
 * @returns {string}
 */
function changeTypeForPrefix(branchPrefix, branchPrefixes) {
  const entry = Object.entries(branchPrefixes || {}).find(([, prefix]) => prefix === branchPrefix);
  return entry ? entry[0] : branchPrefix;
}

function expectedSegmentForBranch(branchPrefix, branchPrefixes) {
  const changeType = changeTypeForPrefix(branchPrefix, branchPrefixes);
  return Object.prototype.hasOwnProperty.call(CHANGE_TYPE_SEGMENT, changeType)
    ? CHANGE_TYPE_SEGMENT[changeType]
    : null;
}

function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/**
 * Diffs two semver strings and returns which segment changed
 * (`'major'|'minor'|'patch'`), or `null` if they're equal or unparsable.
 * Only the highest-order differing segment is reported (matches how a real
 * bump is authored: exactly one segment moves).
 */
function diffSegment(before, after) {
  const b = parseSemver(before);
  const a = parseSemver(after);
  if (!b || !a) return null;
  if (a.major !== b.major) return 'major';
  if (a.minor !== b.minor) return 'minor';
  if (a.patch !== b.patch) return 'patch';
  return null;
}

function readPluginVersion(cwd, pluginName) {
  const manifestPath = path.join(cwd, 'plugins', pluginName, '.claude-plugin', 'plugin.json');
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return typeof raw.version === 'string' ? raw.version : null;
  } catch {
    return null;
  }
}

/**
 * Reads `## <heading>` lines from a changelog file. Returns `[]` if the file
 * is missing or has no such headings.
 *
 * @param {string} changelogFile absolute path
 * @returns {string[]}
 */
function readChangelogHeadings(changelogFile) {
  let text;
  try {
    text = fs.readFileSync(changelogFile, 'utf8');
  } catch {
    return [];
  }
  const headings = [];
  for (const line of text.split('\n')) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) headings.push(match[1]);
  }
  return headings;
}

function hasNewHeading(beforeHeadings, afterHeadings) {
  const before = new Set(beforeHeadings || []);
  return (afterHeadings || []).some((h) => !before.has(h));
}

// R4.S5's "non-trivial" heuristic (documented per the task brief, no single
// universally-correct definition exists): a touched file counts as
// non-trivial unless it IS the configured changelog file itself, or is a
// pure doc file (`.md`) or a test file (path contains a `test`/`tests`
// segment, or matches `*.test.*`/`*.spec.*`). Any remaining touched file
// triggers the check.
function isTrivialFile(file, changelogPath) {
  const normalized = file.replace(/\\/g, '/');
  const normalizedChangelog = changelogPath.replace(/\\/g, '/');
  if (normalized === normalizedChangelog) return true;
  if (/\.md$/i.test(normalized)) return true;
  if (/(^|\/)tests?(\/|$)/.test(normalized)) return true;
  if (/\.(test|spec)\.[cm]?[jt]s$/.test(normalized)) return true;
  return false;
}

/**
 * Runs the versioning-policy check (R4.S2-R4.S5). Returns an array of
 * warnings (never throws, never exits) — `[]` means "nothing to flag",
 * including whenever `config.versioningPolicy` is `'disabled'` or unset.
 *
 * @param {object} args
 * @param {string} args.cwd - project root; used to read "after" state
 *   (current plugin.json version, current CHANGELOG.md headings).
 * @param {string[]} args.touchedFiles - repo-relative paths changed on the
 *   branch being checked.
 * @param {{versioningPolicy: string, branchPrefixes: Record<string,string>, changelogPath: string}} args.config
 *   - as returned by `readConfig` (see exec/config.mjs).
 * @param {string} [args.branchPrefix] - the literal branch-name prefix (e.g.
 *   `fix` in `fix/<slug>`); required for `plugin-changelog`'s segment check.
 * @param {object} [args.before] - baseline state, shape depends on policy:
 *   - `plugin-changelog`: `{ [pluginName]: { version: string|null, changelogHeadings: string[] } }`
 *   - `changelog-only`: `{ changelogHeadings: string[] }`
 * @returns {{plugin: string|null, kind: string, message: string}[]}
 */
export function checkVersioning({ cwd, touchedFiles = [], config, branchPrefix, before = {} }) {
  const policy = (config && config.versioningPolicy) || 'disabled';

  if (policy === 'plugin-changelog') {
    const warnings = [];
    for (const plugin of touchedPlugins(touchedFiles)) {
      const baseline = before[plugin] || { version: null, changelogHeadings: [] };
      const afterVersion = readPluginVersion(cwd, plugin);
      const afterHeadings = readChangelogHeadings(path.join(cwd, 'plugins', plugin, 'CHANGELOG.md'));

      const bumped = Boolean(baseline.version) && Boolean(afterVersion) && baseline.version !== afterVersion;
      const changelogAdded = hasNewHeading(baseline.changelogHeadings, afterHeadings);

      if (bumped && changelogAdded) {
        const actualSegment = diffSegment(baseline.version, afterVersion);
        const expectedSegment = expectedSegmentForBranch(branchPrefix, config.branchPrefixes);
        if (expectedSegment && actualSegment !== expectedSegment) {
          warnings.push({
            plugin,
            kind: 'wrong-segment',
            message: `${plugin}: branch type '${branchPrefix}' expects a ${expectedSegment} bump, but ${actualSegment} was bumped instead (${baseline.version} -> ${afterVersion}).`,
          });
        }
        // Fully compliant (or docs with no expected segment): no warning (R4.S2).
      } else {
        const gaps = [];
        if (!bumped) gaps.push('missing bump');
        if (!changelogAdded) gaps.push('missing changelog entry');
        warnings.push({
          plugin,
          kind: !bumped && !changelogAdded ? 'missing-bump-and-changelog' : (!bumped ? 'missing-bump' : 'missing-changelog'),
          message: `${plugin}: ${gaps.join(' and ')}.`,
        });
      }
    }
    return warnings;
  }

  if (policy === 'changelog-only') {
    const changelogPath = (config && config.changelogPath) || 'CHANGELOG.md';
    const nonTrivialTouched = touchedFiles.some((file) => !isTrivialFile(file, changelogPath));
    if (!nonTrivialTouched) return [];

    const afterHeadings = readChangelogHeadings(path.join(cwd, changelogPath));
    const changelogAdded = hasNewHeading(before.changelogHeadings, afterHeadings);
    if (changelogAdded) return [];

    return [{
      plugin: null,
      kind: 'missing-changelog-entry',
      message: `Non-trivial changes are missing a new entry in ${changelogPath}.`,
    }];
  }

  return [];
}
