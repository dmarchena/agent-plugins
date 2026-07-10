// test/exec/token-cost-cli-io.test.mjs — T8-token-cost (unify-cli-io)
//
// AC9: token-cost emite {ok:true,data:...} estructurado, sin la variante en
// prosa como contrato de salida.
// AC4: token-cost no define localmente helpers de I/O y usa el modulo
// compartido.
//
// Fixture conventions (a session's flat .jsonl plus its sibling
// <session>/subagents/ dir) are reused verbatim from
// test/exec/forensics-cli-io.test.mjs / scripts/token-cost.mjs's own
// analyzeSession/analyze comments.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', '..', 'scripts', 'token-cost.mjs');

function writeSessionFixture(rootDir) {
  const sessionId = 'session-a';
  const sessionFile = path.join(rootDir, `${sessionId}.jsonl`);
  fs.writeFileSync(
    sessionFile,
    JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-sonnet-4-5-20250929',
        usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 300, cache_creation_input_tokens: 0 },
      },
    }) + '\n',
  );

  const subagentsDir = path.join(rootDir, sessionId, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(subagentsDir, 'agent-agentA.jsonl'),
    JSON.stringify({
      type: 'assistant',
      message: {
        model: 'claude-haiku-4-5-20251001',
        usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }) + '\n',
  );
  fs.writeFileSync(
    path.join(subagentsDir, 'agent-agentA.meta.json'),
    JSON.stringify({ description: 'fixture subagent' }),
  );

  return sessionFile;
}

test('AC9: token-cost emite {ok:true,data:...} estructurado, sin la variante en prosa como contrato', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-cost-cli-io-'));
  try {
    const sessionFile = writeSessionFixture(rootDir);

    const result = spawnSync('node', [CLI, sessionFile], { encoding: 'utf8' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);

    // stdout must be exactly the one-line compact JSON envelope — no extra
    // prose lines (session summary table, "Grand total: ...", etc.).
    assert.equal(result.stdout.split('\n').length, 2, 'exactly one line plus the trailing newline');
    assert.ok(!result.stdout.includes('  '), 'must not be indented (compact JSON)');
    assert.ok(!/^Session:/m.test(result.stdout), 'must not contain the old prose "Session:" line');
    assert.ok(!/Grand total:/.test(result.stdout), 'must not contain the old prose "Grand total:" line');

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.ok(parsed.data, 'data must carry the structured report');
    assert.equal(parsed.data.session, sessionFile);
    assert.ok(Array.isArray(parsed.data.subs));
    assert.equal(parsed.data.subs.length, 1);
    assert.equal(parsed.data.subs[0].id, 'agentA');
    assert.ok(parsed.data.orchestrator, 'data.orchestrator must be present');
    assert.ok(parsed.data.subTotal, 'data.subTotal must be present');
    assert.ok(parsed.data.orchAll, 'data.orchAll must be present');
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('AC4: token-cost no define localmente helpers de I/O y usa el modulo compartido', () => {
  const source = fs.readFileSync(CLI, 'utf8');

  assert.match(
    source,
    /import\s*\{\s*[^}]*emitSuccess[^}]*\}\s*from\s*['"]\.\/lib\/cli\.mjs['"]/,
    'token-cost.mjs must import emitSuccess from the shared lib/cli.mjs module',
  );
  assert.ok(
    !/process\.stdout\.write/.test(source),
    'token-cost.mjs must not write to stdout directly; it must delegate to emitSuccess/emitError',
  );
  assert.ok(
    !/function renderReport/.test(source),
    'token-cost.mjs must not keep a local prose-rendering helper as the CLI output contract',
  );
});
