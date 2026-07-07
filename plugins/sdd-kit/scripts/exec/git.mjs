// exec/git.mjs — T4.S2: per-task branch and commit for the plan-executor skill.
// Pure Node ESM, stdlib only (node:child_process). No npm dependencies.
//
// Convention: lib modules don't print; they return data (except commitTask's
// guard, which throws if a commit is attempted on main/master).

import { spawnSync } from 'node:child_process';

function run(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

export function currentBranch(cwd = process.cwd()) {
  const res = run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return res.stdout.trim();
}

// `prefix` (R2): the branch-prefix resolved from the spec's Change type
// through the project's `.sdd-kit.json` (see exec/config.mjs). Defaults to
// 'feat' for backward compatibility with callers that don't resolve one. An
// explicit empty string (R2.S2 — a project config maps a type to '') drops
// the prefix entirely: the branch is then exactly `slug`, no leading slash.
export function ensureBranch(slug, cwd = process.cwd(), prefix = 'feat') {
  const branch = prefix === '' ? slug : `${prefix}/${slug}`;
  const verify = run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd);
  const exists = verify.status === 0;
  if (exists) {
    run(['checkout', branch], cwd);
    return { branch, created: false };
  }
  run(['checkout', '-b', branch], cwd);
  return { branch, created: true };
}

// `files`, when given (non-empty array of paths relative to cwd), stages only
// those paths (`git add <files...>`) instead of the whole tree (`git add -A`).
// This is what lets a batch close (multiple tasks whose files already sit
// uncommitted together in the tree, e.g. after N parallel subagents
// returned) still produce one atomic commit per task: each entry in the
// batch names its own files so its commit doesn't swallow a sibling task's
// pending changes. The single-task path now requires `files` too (R1) — the
// caller in exec-tools.mjs refuses to call commitTask at all without an
// explicit list, so `files === null` here only ever happens for the batch
// path's own historical null case (files omitted in a batch entry), which
// keeps the `add -A` fallback exactly as it was.
//
// `statePath`, when given, is always added to the staged set on top of
// `files` — a restricted `files` list would otherwise leave the task's own
// state-file flip (recorded via recordResult+persist just before this call)
// out of its commit.
function pathspecList(files, statePath) {
  return Array.isArray(files) && files.length > 0
    ? (statePath ? [...files, statePath] : files)
    : null;
}

function stage(cwd, list) {
  if (list) run(['add', '--', ...list], cwd);
  else run(['add', '-A'], cwd);
}

export function commitTask(taskId, message, cwd = process.cwd(), files = null, statePath = null) {
  const branch = currentBranch(cwd);
  if (branch === 'main' || branch === 'master') {
    throw new Error(`commitTask: cannot commit on the main branch (${branch})`);
  }
  const list = pathspecList(files, statePath);
  stage(cwd, list);
  // R1.S3: when a file list is known, scope the COMMIT itself to that
  // pathspec (not just the preceding `git add`). Two completions racing
  // (e.g. a concurrent single-task complete, or two batch entries) could
  // otherwise each stage their own files and then have the second `git
  // commit` (no pathspec) sweep in whatever the first left staged if the
  // first hasn't committed yet. `git commit -- <pathspec>` only commits the
  // pathspec-matched staged changes, leaving anything else staged untouched
  // for its own commit.
  if (list) run(['commit', '-m', message, '--', ...list], cwd);
  else run(['commit', '-m', message], cwd);
  const hash = run(['rev-parse', '--short', 'HEAD'], cwd);
  return hash.stdout.trim();
}
