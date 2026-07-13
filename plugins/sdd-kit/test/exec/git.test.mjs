// Unit test for exec/git.mjs. Always works against an isolated temporary git
// repo (fs.mkdtempSync) — never against the project's real repo.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { currentBranch, ensureBranch, commitTask } from '../../scripts/exec/git.mjs';

function git(args, cwd) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
  }
  return res.stdout.trim();
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-git-'));

test('setup: temporary repo with an initial commit on the "work" branch', () => {
  git(['init'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'Test'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'initial\n');
  git(['add', '-A'], repo);
  git(['commit', '-m', 'init'], repo);
  // Renames the initial branch (main/master/whatever the global config uses)
  // to "work", a neutral branch that doesn't trip commitTask's guard.
  git(['checkout', '-b', 'work'], repo);
  assert.equal(currentBranch(repo), 'work');
});

test('ensureBranch creates feat/demo the first time', () => {
  const result = ensureBranch('demo', repo);
  assert.deepEqual(result, { branch: 'feat/demo', created: true });
  assert.equal(currentBranch(repo), 'feat/demo');
});

test('ensureBranch reuses feat/demo the second time', () => {
  // Move to "work" to force ensureBranch to perform a checkout.
  git(['checkout', 'work'], repo);
  const result = ensureBranch('demo', repo);
  assert.deepEqual(result, { branch: 'feat/demo', created: false });
  assert.equal(currentBranch(repo), 'feat/demo');
});

test('commitTask commits on a non-main branch and returns the hash', () => {
  assert.equal(currentBranch(repo), 'feat/demo');
  fs.writeFileSync(path.join(repo, 'feature.txt'), 'T1 content\n');
  const hash = commitTask('T1', 'test+impl T1', repo);
  assert.ok(typeof hash === 'string' && hash.length > 0);
  const log = git(['log', '--oneline'], repo);
  assert.ok(log.includes('test+impl T1'));
  assert.ok(log.includes(hash));
});

test('commitTask throws an Error if the current branch is main', () => {
  git(['checkout', '-B', 'main'], repo);
  assert.equal(currentBranch(repo), 'main');
  assert.throws(() => commitTask('T1', 'should not commit', repo));
});

test('commitTask throws an Error if the current branch is master', () => {
  git(['checkout', '-B', 'master'], repo);
  assert.equal(currentBranch(repo), 'master');
  assert.throws(() => commitTask('T1', 'should not commit', repo));
});

test('commitTask throws instead of silently no-op-ing when a --files pathspec matches nothing (R-git-silent-failure)', () => {
  git(['checkout', '-B', 'feat/silent-failure'], repo);
  const before = git(['rev-parse', 'HEAD'], repo);
  fs.writeFileSync(path.join(repo, 'real.txt'), 'real change\n');
  assert.throws(
    () => commitTask('T-silent', 'should not silently no-op', repo, ['real.txt', 'does-not-exist.txt']),
    /git add/,
  );
  const after = git(['rev-parse', 'HEAD'], repo);
  assert.equal(after, before, 'HEAD must not move when git add could not stage the full pathspec');
});

test('cleanup: removes the temporary repo', () => {
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(fs.existsSync(repo), false);
});
