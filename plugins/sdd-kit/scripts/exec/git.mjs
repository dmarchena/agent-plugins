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

export function ensureBranch(slug, cwd = process.cwd()) {
  const branch = `feat/${slug}`;
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
// pending changes. The single-task path (files omitted) keeps today's
// `add -A` behavior unchanged.
export function commitTask(taskId, message, cwd = process.cwd(), files = null) {
  const branch = currentBranch(cwd);
  if (branch === 'main' || branch === 'master') {
    throw new Error(`commitTask: cannot commit on the main branch (${branch})`);
  }
  if (Array.isArray(files) && files.length > 0) {
    run(['add', '--', ...files], cwd);
  } else {
    run(['add', '-A'], cwd);
  }
  run(['commit', '-m', message], cwd);
  const hash = run(['rev-parse', '--short', 'HEAD'], cwd);
  return hash.stdout.trim();
}
