// test/verify-tools-cli-io.test.mjs — T3-verify-tools: verify-tools.mjs's
// CLI must use the shared I/O envelope helpers from scripts/lib/cli.mjs
// (emitSuccess/emitError/parseFlags) instead of defining its own local
// die/out/parseFlags. Subprocess pattern mirrors test/verify-cli.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'scripts', 'verify-tools.mjs');
const CLI_SOURCE_PATH = CLI;

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function initRepo(repo) {
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
}

// A SPECDIR whose single [auto] AC is fully covered by a 'done' task with a
// trivially-passing test_cmd — used to trigger a plain success path (AC1).
function buildGreenFixture(repo, slug) {
  if (!fs.existsSync(path.join(repo, '.git'))) initRepo(repo);
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });

  const spec = `# Spec: ${slug}\n\n## Purpose\n\nFixture for verify-tools CLI I/O tests.\n\n## Acceptance Criteria\n\n- [ ] AC1 → R1.S1 [auto] — sample automatic criterion.\n`;
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), spec);

  const plan = {
    plan_id: `${slug}-plan`,
    source_spec: 'spec.md',
    tasks: [{ task_id: 'T1' }],
    coverage: { acs: { AC1: ['T1'] } },
  };
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(plan, null, 2));

  const state = {
    plan_id: `${slug}-plan`,
    branch: `feat/${slug}`,
    pause: null,
    tasks: {
      T1: {
        status: 'done', estimated_tokens: 100, actual_tokens: 100, deviation: 0,
        test_cmd: 'true', commit: 'abc1234', incidencia: null,
      },
    },
  };
  fs.writeFileSync(path.join(absSpecDir, 'execution_state.json'), JSON.stringify(state, null, 2));

  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture: ' + slug]);

  return specDir;
}

// A minimal SPECDIR with NO execution_state.json at all: loadSpecdir returns
// taskState === null, so degradedManualRouting routes the whole checklist to
// manual confirmation and (with no --verdicts file) it stays 'unanswered' —
// report.allGreen is false, so `archive` must refuse and report the
// 'not-archived' status (AC2) without ever touching git.
function buildNotArchivedFixture(repo, slug) {
  if (!fs.existsSync(path.join(repo, '.git'))) initRepo(repo);
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });

  const spec = `# Spec: ${slug}\n\n## Purpose\n\nFixture for verify-tools CLI I/O tests.\n\n## Acceptance Criteria\n\n- [ ] AC1 → R1.S1 [auto] — sample automatic criterion.\n`;
  fs.writeFileSync(path.join(absSpecDir, 'spec.md'), spec);

  const plan = {
    plan_id: `${slug}-plan`,
    source_spec: 'spec.md',
    tasks: [{ task_id: 'T1' }],
    coverage: { acs: { AC1: ['T1'] } },
  };
  fs.writeFileSync(path.join(absSpecDir, 'execution_plan.json'), JSON.stringify(plan, null, 2));
  // execution_state.json intentionally absent -> degraded mode.

  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture: ' + slug]);

  return specDir;
}

function runCli(repo, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: repo, encoding: 'utf8', input: '', timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// AC1: a successful verify command emits a compact single-line
// {ok:true,data:...} envelope and exits 0.
// ---------------------------------------------------------------------------

test("AC1: un comando de exito de verify emite un envelope {ok:true,data:...} compacto de una linea y termina con codigo 0", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-tools-cli-ac1-'));
  try {
    const specDir = buildGreenFixture(repo, 'ac1-demo');

    const result = runCli(repo, ['ground-check', specDir]);
    assert.equal(result.status, 0, `must exit 0; stderr: ${result.stderr}`);

    const stdout = result.stdout;
    assert.equal(stdout.split('\n').length, 2, 'exactly one line plus trailing newline');
    assert.ok(!stdout.includes('  '), 'must not be indented (compact JSON)');

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data && typeof parsed.data === 'object', 'must carry a data payload');
    // status/green/drift are trimmed from ground-check's stdout as of
    // T4-trim-cli-data (only the test suite ever read them there) — its
    // data payload is now an empty object; this test's own point (envelope
    // shape: compact single line, ok:true, data is an object) is still
    // checked above.
    assert.deepEqual(parsed.data, {});
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC2: the `archive` subcommand reporting 'not-archived' status emits
// {ok:true,data:{status:'not-archived',...}} with exit code 0.
// ---------------------------------------------------------------------------

test("AC2: el comando de verify que reporta estado not-archived emite {ok:true,data:{status:'not-archived',...}} con codigo 0", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-tools-cli-ac2-'));
  try {
    const specDir = buildNotArchivedFixture(repo, 'ac2-demo');

    const result = runCli(repo, ['archive', specDir]);
    assert.equal(result.status, 0, `must exit 0; stderr: ${result.stderr}`);

    const stdout = result.stdout;
    assert.equal(stdout.split('\n').length, 2, 'exactly one line plus trailing newline');
    assert.ok(!stdout.includes('  '), 'must not be indented (compact JSON)');

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data && typeof parsed.data === 'object', 'must carry a data payload');
    assert.equal(parsed.data.status, 'not-archived');
    assert.equal(parsed.data.archived, false);

    const destination = path.join(repo, 'docs', 'specs', 'archived', 'ac2-demo');
    assert.equal(fs.existsSync(destination), false, 'must never archive when not all ACs are green');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC4: verify-tools.mjs must not define its own I/O helpers locally — it
// must import them from the shared module (static source check).
// ---------------------------------------------------------------------------

test('AC4: verify-tools no define localmente los helpers de I/O y los importa del modulo compartido', () => {
  const source = fs.readFileSync(CLI_SOURCE_PATH, 'utf8');

  assert.doesNotMatch(source, /function\s+die\s*\(/, 'must not define a local die() helper');
  assert.doesNotMatch(source, /function\s+out\s*\(/, 'must not define a local out() helper');
  assert.doesNotMatch(source, /function\s+parseFlags\s*\(/, 'must not define a local parseFlags() helper');

  assert.match(
    source,
    /import\s*\{[^}]*\}\s*from\s*['"]\.\/lib\/cli\.mjs['"]/,
    'must import the I/O helpers from ./lib/cli.mjs'
  );
  assert.match(source, /\bemitSuccess\b/, 'must reference emitSuccess');
  assert.match(source, /\bemitError\b/, 'must reference emitError');
  assert.match(source, /\bparseFlags\b/, 'must reference the imported parseFlags');
});
