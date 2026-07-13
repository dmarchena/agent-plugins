// test/exec/forensics-cli-io.test.mjs — T7-forensics (unify-cli-io)
//
// AC8: forensics writes forensics.json and emits {ok:true,data:...} on
// stdout, with no prose summary lines.
// AC4: forensics does not define its own I/O helpers locally and uses the
// shared cli.mjs module instead.
//
// Fixture conventions (projects-root layout, TOKEN_COST_PROJECTS_ROOT env
// var, spawning forensics.mjs as a child process) are reused verbatim from
// test/exec/forensics.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'forensics.mjs');
const CLI_SOURCE_PATH = CLI;

function writeProjectFixture(projectsRoot, projectName, sessionId, agentId, subUsage) {
  const projectDir = path.join(projectsRoot, projectName);
  fs.mkdirSync(projectDir, { recursive: true });

  const sessionFile = path.join(projectDir, `${sessionId}.jsonl`);
  fs.writeFileSync(
    sessionFile,
    JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    }) + '\n',
  );

  const subagentsDir = path.join(projectDir, sessionId, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(subagentsDir, `agent-${agentId}.jsonl`),
    JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: subUsage } }) + '\n',
  );
  fs.writeFileSync(
    path.join(subagentsDir, `agent-${agentId}.meta.json`),
    JSON.stringify({ description: 'fixture subagent' }),
  );
}

function taskEntry(overrides) {
  return {
    status: 'done',
    estimated_tokens: 1000,
    actual_tokens: null,
    deviation: null,
    test_cmd: null,
    commit: null,
    incidencia: null,
    agentId: null,
    sessionId: null,
    ...overrides,
  };
}

function makeSpecDir(tasks, pause) {
  const specDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-cli-io-specdir-'));
  fs.writeFileSync(
    path.join(specDir, 'execution_state.json'),
    JSON.stringify({
      plan_id: 'plan-forensics-cli-io-fixture',
      source_spec: 'spec.md',
      branch: null,
      started_at: new Date().toISOString(),
      tasks,
      pause: pause === undefined ? null : pause,
    }, null, 2),
  );
  return specDir;
}

function runCli(specDir, env) {
  return spawnSync('node', [CLI, specDir], {
    encoding: 'utf8',
    env: { ...process.env, ...(env || {}) },
  });
}

test('AC8: forensics escribe forensics.json y emite {ok:true,data:...} en stdout, sin el resumen en prosa', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forensics-cli-io-root-'));

  const subUsageA = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 };
  writeProjectFixture(projectsRoot, 'project-a', 'session-a', 'agentA', subUsageA);

  const specDir = makeSpecDir({
    'task-a': taskEntry({ estimated_tokens: 1000, agentId: 'agentA', sessionId: 'session-a' }),
    'task-unresolved': taskEntry({ estimated_tokens: 300, agentId: null, sessionId: null }),
  });

  try {
    const result = runCli(specDir, { TOKEN_COST_PROJECTS_ROOT: projectsRoot });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    // (a) forensics.json escrito con los datos completos.
    const forensicsPath = path.join(specDir, 'forensics.json');
    assert.ok(fs.existsSync(forensicsPath), 'forensics.json must be written');
    const forensics = JSON.parse(fs.readFileSync(forensicsPath, 'utf8'));
    assert.equal(forensics.tasks['task-a'].resolved, true);
    assert.equal(forensics.tasks['task-unresolved'].resolved, false);
    assert.ok(forensics.orchestrator, 'forensics.json must include orchestrator');
    assert.ok(forensics.subagents_total, 'forensics.json must include subagents_total');
    assert.ok(Array.isArray(forensics.pause_timeline));

    // (b) stdout es exactamente el envelope JSON de una linea, sin prosa.
    assert.equal(result.stdout.split('\n').length, 2, 'exactly one line plus the trailing newline');
    assert.ok(!result.stdout.includes('  '), 'must not be indented (compact JSON)');
    assert.ok(!/resolved:|unresolved:|real_tokens=/.test(result.stdout), 'must not contain the old prose summary line format');

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    // T4-trim-cli-data: stdout no longer mirrors forensics.json byte-for-byte
    // — `resolved`/`estimated_tokens` are trimmed from each stdout task entry
    // (only the test suite ever read them there; spec-forensics/SKILL.md
    // explicitly reads them from the written forensics.json file instead).
    // The written file itself keeps both fields in full.
    const { tasks: stdoutTasks, ...stdoutRest } = parsed.data;
    const { tasks: fileTasks, ...fileRest } = forensics;
    assert.deepEqual(stdoutRest, fileRest, 'stdout data (minus tasks) must match the written forensics.json content');
    assert.deepEqual(Object.keys(stdoutTasks), Object.keys(fileTasks), 'stdout must report the same task ids as the file');
    for (const [taskId, fileEntry] of Object.entries(fileTasks)) {
      const { resolved, estimated_tokens, ...restOfFileEntry } = fileEntry;
      assert.deepEqual(stdoutTasks[taskId], restOfFileEntry, `stdout data.tasks["${taskId}"] must match the file entry minus resolved/estimated_tokens`);
    }
  } finally {
    fs.rmSync(specDir, { recursive: true, force: true });
    fs.rmSync(projectsRoot, { recursive: true, force: true });
  }
});

test('AC4: forensics no define localmente helpers de I/O y usa el modulo compartido', () => {
  const source = fs.readFileSync(CLI_SOURCE_PATH, 'utf8');

  assert.match(
    source,
    /import\s*\{\s*[^}]*emitSuccess[^}]*\}\s*from\s*['"]\.\/lib\/cli\.mjs['"]/,
    'forensics.mjs must import emitSuccess from the shared lib/cli.mjs module',
  );
  assert.ok(
    !/process\.stdout\.write/.test(source),
    'forensics.mjs must not write to stdout directly; it must delegate to emitSuccess/emitError',
  );
  assert.ok(
    !/function formatSummaryLine/.test(source),
    'forensics.mjs must not keep a local prose-summary-line helper',
  );
});
