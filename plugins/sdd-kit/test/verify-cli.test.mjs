// test/verify-cli.test.mjs — T1-verify-cli: CLI dispatcher wrapping
// verify-tools.mjs's deterministic exports into one-line
// `node verify-tools.mjs <sub> SPECDIR [args]` subcommands (R1.S1, R1.S2/AC2,
// R1.S3/AC3). Subprocess pattern mirrors test/exec/e2e.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'scripts', 'verify-tools.mjs');

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function initRepo(repo) {
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@t.t']);
  git(repo, ['config', 'user.name', 'test']);
}

// Builds a green SPECDIR fixture under docs/specs/<slug>/ (all [auto] ACs
// covered by a single 'done' task whose test_cmd trivially passes). When
// withManual is true, an extra [manual] AC is appended so callers can
// exercise --verdicts (R1.S3/AC3).
function buildFixture(repo, slug, { withManual = false } = {}) {
  if (!fs.existsSync(path.join(repo, '.git'))) initRepo(repo);
  const specDir = path.join('docs', 'specs', slug);
  const absSpecDir = path.join(repo, specDir);
  fs.mkdirSync(absSpecDir, { recursive: true });

  const acLines = ['- [ ] AC1 → R1.S1 [auto] — sample automatic criterion.'];
  if (withManual) {
    acLines.push('- [ ] AC2 → R1.S2 [manual] — sample manual criterion, needs human confirmation.');
  }
  const spec = `# Spec: ${slug}\n\n## Purpose\n\nFixture for verify CLI tests.\n\n## Acceptance Criteria\n\n${acLines.join('\n')}\n`;
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

function cli(repo, args, opts = {}) {
  return execFileSync('node', [CLI, ...args], {
    cwd: repo, encoding: 'utf8', input: '', timeout: 10000, ...opts,
  });
}

// ---------------------------------------------------------------------------
// R1.S1 — one-line ground-check/report/archive subcommands against a green
// fixture print a JSON object with `status` and exit 0; archive actually
// relocates the SPECDIR.
// ---------------------------------------------------------------------------

test('R1.S1: ground-check, report and archive each print a JSON status object and exit 0 for a green fixture; archive relocates the SPECDIR', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-r1s1-'));
  try {
    const specDir = buildFixture(repo, 'r1s1-demo');

    const groundOut = cli(repo, ['ground-check', specDir]);
    const groundParsed = JSON.parse(groundOut);
    assert.equal(groundParsed.ok, true);
    // status/green/drift are trimmed from ground-check's stdout as of
    // T4-trim-cli-data (only the test suite ever read them there) — a green
    // re-run is instead confirmed below via `report`'s allGreen, which
    // internally re-derives the same groundCheck() result.
    assert.deepEqual(groundParsed.data, {});

    const reportOut = cli(repo, ['report', specDir]);
    const reportParsed = JSON.parse(reportOut);
    assert.equal(reportParsed.ok, true);
    const report = reportParsed.data;
    assert.equal(report.status, 'report');
    assert.equal(report.allGreen, true);

    const archiveOut = cli(repo, ['archive', specDir]);
    const archiveParsed = JSON.parse(archiveOut);
    assert.equal(archiveParsed.ok, true);
    const archived = archiveParsed.data;
    assert.equal(archived.status, 'archived');
    assert.equal(archived.archived, true);

    const destination = path.join(repo, 'docs', 'specs', 'archived', 'r1s1-demo');
    assert.equal(fs.existsSync(destination), true, 'SPECDIR must be relocated under docs/specs/archived/<slug>/');
    assert.equal(fs.existsSync(path.join(repo, specDir)), false, 'original SPECDIR must no longer exist');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC2 — a SPECDIR missing execution_plan.json fails loudly, never archives.
// ---------------------------------------------------------------------------

test('AC2: a SPECDIR missing execution_plan.json makes every verify subcommand exit non-zero, naming VerifyInputError and the missing file, with no archive side effect', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-ac2-'));
  try {
    const specDir = path.join('docs', 'specs', 'ac2-demo');
    const absSpecDir = path.join(repo, specDir);
    fs.mkdirSync(absSpecDir, { recursive: true });
    fs.writeFileSync(path.join(absSpecDir, 'spec.md'), '# Spec: ac2-demo\n\n## Acceptance Criteria\n\n- [ ] AC1 → R1.S1 [auto] — x.\n');
    // execution_plan.json intentionally absent.
    initRepo(repo);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'fixture: missing plan']);

    for (const sub of ['ground-check', 'report', 'archive']) {
      let threw = false;
      let combined = '';
      try {
        cli(repo, [sub, specDir]);
      } catch (err) {
        threw = true;
        combined = (err.stdout || '') + (err.stderr || '');
        assert.notEqual(err.status, 0, `${sub}: must exit non-zero`);
      }
      assert.ok(threw, `${sub}: must exit non-zero (throw from execFileSync)`);
      assert.match(combined, /VerifyInputError/, `${sub}: output must mention VerifyInputError`);
      assert.match(combined, /execution_plan\.json/, `${sub}: output must name the missing file`);
    }

    const destination = path.join(repo, 'docs', 'specs', 'archived', 'ac2-demo');
    assert.equal(fs.existsSync(destination), false, 'archive must never run when loadSpecdir throws');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC3 — `report --verdicts <file>` resolves [manual] ACs without a human in
// the loop, and never blocks on interactive stdin.
// ---------------------------------------------------------------------------

test('AC3: report --verdicts confirms a [manual] AC from a file (no interactive prompt) and never hangs on stdin', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-ac3-'));
  try {
    const specDir = buildFixture(repo, 'ac3-demo', { withManual: true });

    const verdictsPath = path.join(repo, 'verdicts.json');
    fs.writeFileSync(verdictsPath, JSON.stringify([{ ac_id: 'AC2', verdict: 'confirmed' }], null, 2));

    let reportOut;
    assert.doesNotThrow(() => {
      reportOut = cli(repo, ['report', specDir, '--verdicts', verdictsPath], { timeout: 5000, input: '' });
    }, 'report --verdicts must complete promptly without blocking on stdin');

    const reportParsed = JSON.parse(reportOut);
    assert.equal(reportParsed.ok, true);
    const report = reportParsed.data;
    assert.equal(report.status, 'report');
    const ac2 = report.acs.find((a) => a.ac_id === 'AC2');
    assert.ok(ac2, 'AC2 must be present in the report');
    assert.equal(ac2.green, true, 'AC2 must be reported green once confirmed via --verdicts');
    assert.equal(report.allGreen, true, 'AC1 (auto, done) + AC2 (confirmed) => fully green');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Regression: the `archive` subcommand must read the repo's .sdd-kit.json
// and enforce its versioning-policy gate (R5, change-type-versioning-policy
// spec) — not silently skip it. Caught during verify of
// sdd-verify-cli-and-budget-pause: cmdArchive called archiveIfGreen without
// ever passing `versioning`, so the gate was dead code once driven via CLI.
// ---------------------------------------------------------------------------

test('R5 regression: archive subcommand reads .sdd-kit.json and enforces the versioning-policy gate', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cli-versioning-'));
  try {
    initRepo(repo);
    fs.writeFileSync(
      path.join(repo, '.sdd-kit.json'),
      JSON.stringify({ versioningPolicy: 'plugin-changelog' }, null, 2)
    );
    const pluginDir = path.join(repo, 'plugins', 'demo-plugin');
    fs.mkdirSync(path.join(pluginDir, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'demo-plugin', version: '0.1.0' }, null, 2)
    );
    fs.writeFileSync(path.join(pluginDir, 'CHANGELOG.md'), '# Changelog\n\n## 0.1.0\n\n- Initial.\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-qm', 'add plugin + versioning config']);

    git(repo, ['checkout', '-b', 'fix/versioning-demo']);
    fs.mkdirSync(path.join(pluginDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'scripts', 'foo.mjs'), '// touch, no bump\n');
    const specDir = buildFixture(repo, 'versioning-demo');

    const archiveOut = cli(repo, ['archive', specDir]);
    const archiveParsed = JSON.parse(archiveOut);
    assert.equal(archiveParsed.ok, true);
    const archived = archiveParsed.data;
    assert.equal(archived.status, 'not-archived');
    assert.equal(archived.archived, false);
    assert.equal(archived.reason, 'versioning policy not satisfied');
    assert.ok(Array.isArray(archived.versioningWarnings));
    assert.ok(archived.versioningWarnings.some((w) => w.plugin === 'demo-plugin'));

    const destination = path.join(repo, 'docs', 'specs', 'archived', 'versioning-demo');
    assert.equal(fs.existsSync(destination), false, 'must not archive when the touched plugin lacks a bump/changelog');
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
