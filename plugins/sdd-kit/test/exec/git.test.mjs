// Test unitario de exec/git.mjs. Trabaja SIEMPRE contra un repo git temporal
// aislado (fs.mkdtempSync) — nunca contra el repo real del proyecto.

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
    throw new Error(`git ${args.join(' ')} fallo: ${res.stderr}`);
  }
  return res.stdout.trim();
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-git-'));

test('setup: repo temporal con commit inicial en rama "work"', () => {
  git(['init'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'Test'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'inicial\n');
  git(['add', '-A'], repo);
  git(['commit', '-m', 'init'], repo);
  // Renombra la rama inicial (main/master/lo que sea por config global) a
  // "work", una rama neutra que no dispara el guard de commitTask.
  git(['checkout', '-b', 'work'], repo);
  assert.equal(currentBranch(repo), 'work');
});

test('ensureBranch crea ia/demo la primera vez', () => {
  const result = ensureBranch('demo', repo);
  assert.deepEqual(result, { branch: 'ia/demo', created: true });
  assert.equal(currentBranch(repo), 'ia/demo');
});

test('ensureBranch reutiliza ia/demo la segunda vez', () => {
  // Nos movemos a "work" para forzar que ensureBranch tenga que hacer checkout.
  git(['checkout', 'work'], repo);
  const result = ensureBranch('demo', repo);
  assert.deepEqual(result, { branch: 'ia/demo', created: false });
  assert.equal(currentBranch(repo), 'ia/demo');
});

test('commitTask commitea en una rama no principal y devuelve el hash', () => {
  assert.equal(currentBranch(repo), 'ia/demo');
  fs.writeFileSync(path.join(repo, 'feature.txt'), 'contenido T1\n');
  const hash = commitTask('T1', 'test+impl T1', repo);
  assert.ok(typeof hash === 'string' && hash.length > 0);
  const log = git(['log', '--oneline'], repo);
  assert.ok(log.includes('test+impl T1'));
  assert.ok(log.includes(hash));
});

test('commitTask lanza Error si la rama actual es main', () => {
  git(['checkout', '-B', 'main'], repo);
  assert.equal(currentBranch(repo), 'main');
  assert.throws(() => commitTask('T1', 'no deberia commitear', repo));
});

test('commitTask lanza Error si la rama actual es master', () => {
  git(['checkout', '-B', 'master'], repo);
  assert.equal(currentBranch(repo), 'master');
  assert.throws(() => commitTask('T1', 'no deberia commitear', repo));
});

test('cleanup: borra el repo temporal', () => {
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(fs.existsSync(repo), false);
});
