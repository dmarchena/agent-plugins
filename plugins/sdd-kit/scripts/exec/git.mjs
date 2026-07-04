// exec/git.mjs — T4.S2: rama y commit por tarea para la skill plan-executor.
// Node ESM puro, solo stdlib (node:child_process). Sin dependencias npm.
//
// Convención: los módulos lib no imprimen; devuelven datos (salvo el guard de
// commitTask, que lanza Error si se intenta commitear en main/master).

import { spawnSync } from 'node:child_process';

function run(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

export function currentBranch(cwd = process.cwd()) {
  const res = run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return res.stdout.trim();
}

export function ensureBranch(slug, cwd = process.cwd()) {
  const branch = `ia/${slug}`;
  const verify = run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], cwd);
  const exists = verify.status === 0;
  if (exists) {
    run(['checkout', branch], cwd);
    return { branch, created: false };
  }
  run(['checkout', '-b', branch], cwd);
  return { branch, created: true };
}

export function commitTask(taskId, message, cwd = process.cwd()) {
  const branch = currentBranch(cwd);
  if (branch === 'main' || branch === 'master') {
    throw new Error(`commitTask: no se puede commitear en la rama principal (${branch})`);
  }
  run(['add', '-A'], cwd);
  run(['commit', '-m', message], cwd);
  const hash = run(['rev-parse', '--short', 'HEAD'], cwd);
  return hash.stdout.trim();
}
