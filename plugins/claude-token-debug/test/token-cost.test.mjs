import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  PRICE,
  tierForModel,
  costForUsage,
  priceMessage,
  analyzeSession,
} from '../scripts/token-cost.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.join(__dirname, '..', 'scripts', 'token-cost.mjs');

function makeFixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'token-cost-fixture-'));
}

function writeSessionFixture(lines) {
  const dir = makeFixtureDir();
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

// Writes a full session tree: a flat <session>.jsonl plus, when `subagents`
// is provided, a subagents/agent-<id>.jsonl + agent-<id>.meta.json per entry.
// `subagents` is an array of { id, description, lines }. Passing an empty
// array or omitting it entirely means "no subagents/ dir at all" (R1.S2
// fixture case) — the caller controls that by omitting the argument.
function writeSessionTree(orchestratorLines, subagents) {
  const dir = makeFixtureDir();
  const sessionFile = path.join(dir, 'session.jsonl');
  fs.writeFileSync(
    sessionFile,
    orchestratorLines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );

  if (Array.isArray(subagents)) {
    const subagentsDir = path.join(dir, 'subagents');
    fs.mkdirSync(subagentsDir);
    for (const sub of subagents) {
      const transcriptFile = path.join(subagentsDir, `agent-${sub.id}.jsonl`);
      fs.writeFileSync(
        transcriptFile,
        sub.lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
      );
      const metaFile = path.join(subagentsDir, `agent-${sub.id}.meta.json`);
      fs.writeFileSync(metaFile, JSON.stringify({ description: sub.description }));
    }
  }

  return sessionFile;
}

function readAssistantMessages(sessionFile) {
  const raw = fs.readFileSync(sessionFile, 'utf8');
  return raw
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l))
    .filter((record) => record.type === 'assistant');
}

// Independent cost formula (does not call costForUsage/priceMessage) so the
// test does not just re-assert the implementation's own arithmetic back at
// itself.
function expectedCost(tierName, usage) {
  const rates = PRICE[tierName];
  if (!rates) return 0;
  return (
    ((usage.input_tokens || 0) / 1e6) * rates.input +
    ((usage.output_tokens || 0) / 1e6) * rates.output +
    ((usage.cache_read_input_tokens || 0) / 1e6) * rates.cache_read +
    ((usage.cache_creation_input_tokens || 0) / 1e6) * rates.cache_creation
  );
}

test('AC3: mixed-model fixture session — total cost equals the sum of each message priced at its own model tier, and the model list contains every distinct model string seen', () => {
  const opusUsage = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 50,
  };
  const sonnetUsage = {
    input_tokens: 2000,
    output_tokens: 800,
    cache_read_input_tokens: 300,
    cache_creation_input_tokens: 0,
  };
  const haikuUsage = {
    input_tokens: 500,
    output_tokens: 100,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  const sessionFile = writeSessionFixture([
    { type: 'assistant', message: { model: 'claude-opus-4-1-20250805', usage: opusUsage } },
    { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: sonnetUsage } },
    { type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: haikuUsage } },
  ]);

  const messages = readAssistantMessages(sessionFile);
  const priced = messages.map((m) => priceMessage(m));

  const totalCost = priced.reduce((sum, p) => sum + p.cost, 0);
  const modelsSeen = new Set(priced.map((p) => p.model));

  const expectedTotal =
    expectedCost('opus', opusUsage) +
    expectedCost('sonnet', sonnetUsage) +
    expectedCost('haiku', haikuUsage);

  assert.ok(expectedTotal > 0, 'sanity: fixture rates must be non-zero');
  assert.equal(totalCost, expectedTotal);

  assert.equal(modelsSeen.size, 3);
  assert.ok(modelsSeen.has('claude-opus-4-1-20250805'));
  assert.ok(modelsSeen.has('claude-sonnet-4-5-20250929'));
  assert.ok(modelsSeen.has('claude-haiku-4-5-20251001'));
});

test('AC4: fixture with an unknown-tier model — its tokens are included in token totals and its model string appears in the model list, while it contributes zero to cost', () => {
  const knownUsage = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 10,
  };
  const unknownUsage = {
    input_tokens: 777,
    output_tokens: 333,
    cache_read_input_tokens: 11,
    cache_creation_input_tokens: 22,
  };

  const sessionFile = writeSessionFixture([
    { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: knownUsage } },
    { type: 'assistant', message: { model: 'some-mystery-model-9000', usage: unknownUsage } },
  ]);

  const messages = readAssistantMessages(sessionFile);
  const priced = messages.map((m) => priceMessage(m));

  const unknown = priced.find((p) => p.model === 'some-mystery-model-9000');
  assert.ok(unknown, 'the unknown-tier message must not be dropped');

  // Never dropped and never guessed into a known tier.
  assert.equal(tierForModel('some-mystery-model-9000'), null);
  assert.equal(unknown.tier, null);

  // Zero cost contribution for the unknown-tier message.
  assert.equal(unknown.cost, 0);

  // Tokens still counted in whatever totals are being computed.
  const totalInputTokens = priced.reduce((sum, p) => sum + p.usage.input_tokens, 0);
  const totalOutputTokens = priced.reduce((sum, p) => sum + p.usage.output_tokens, 0);
  assert.equal(totalInputTokens, knownUsage.input_tokens + unknownUsage.input_tokens);
  assert.equal(totalOutputTokens, knownUsage.output_tokens + unknownUsage.output_tokens);

  // Model string still surfaced in the model list.
  const modelsSeen = new Set(priced.map((p) => p.model));
  assert.ok(modelsSeen.has('some-mystery-model-9000'));
  assert.ok(modelsSeen.has('claude-sonnet-4-5-20250929'));

  // Grand total cost equals only the known message's cost (unknown contributes 0).
  const totalCost = priced.reduce((sum, p) => sum + p.cost, 0);
  assert.equal(totalCost, costForUsage('sonnet', knownUsage));
});

test('tierForModel: recognizes opus/sonnet/haiku tiers regardless of full version string, and returns null for unrecognized strings', () => {
  assert.equal(tierForModel('claude-opus-4-1-20250805'), 'opus');
  assert.equal(tierForModel('claude-3-5-sonnet-20241022'), 'sonnet');
  assert.equal(tierForModel('claude-haiku-4-5-20251001'), 'haiku');
  assert.equal(tierForModel('gpt-4o'), null);
  assert.equal(tierForModel(undefined), null);
  assert.equal(tierForModel(null), null);
});

function sumUsageTokens(usage) {
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

test('AC1: CLI over a fixture session with one labeled subagent prints a per-subagent line (meta description label + token total), an orchestrator total line, and a grand-total line whose orchestrator% and subagents% sum to 100, with cache_read included in every total', () => {
  const orchMsg1Usage = {
    input_tokens: 4000,
    output_tokens: 1000,
    cache_read_input_tokens: 1000,
    cache_creation_input_tokens: 0,
  };
  const orchMsg2Usage = {
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  const subUsage = {
    input_tokens: 2000,
    output_tokens: 1000,
    cache_read_input_tokens: 500,
    cache_creation_input_tokens: 0,
  };
  const subLabel = 'fixture code-review subagent';

  const sessionFile = writeSessionTree(
    [
      { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: orchMsg1Usage } },
      { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: orchMsg2Usage } },
    ],
    [
      {
        id: 'abc123',
        description: subLabel,
        lines: [
          { type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: subUsage } },
        ],
      },
    ],
  );

  const stdout = execFileSync('node', [CLI_PATH, sessionFile], { encoding: 'utf8' });

  // Independent expectations, cross-checked against T1's cost primitives
  // (not the analysis function under test).
  const expectedOrchCost = costForUsage('sonnet', orchMsg1Usage) + costForUsage('sonnet', orchMsg2Usage);
  const expectedOrchTokens = sumUsageTokens(orchMsg1Usage) + sumUsageTokens(orchMsg2Usage);
  const expectedSubCost = costForUsage('haiku', subUsage);
  const expectedSubTokens = sumUsageTokens(subUsage);
  const expectedGrandCost = expectedOrchCost + expectedSubCost;
  const expectedSubsPct = (expectedSubCost / expectedGrandCost) * 100;
  const expectedOrchPct = 100 - expectedSubsPct;

  const subLine = new RegExp(`${subLabel}:\\s*tokens=(\\d+)\\s*cost=\\$([\\d.]+)`);
  const subMatch = stdout.match(subLine);
  assert.ok(subMatch, `expected a subagent line with the meta description label; got:\n${stdout}`);
  assert.equal(Number(subMatch[1]), expectedSubTokens);
  assert.ok(Math.abs(Number(subMatch[2]) - expectedSubCost) < 0.001);

  const orchLine = stdout.match(/Orchestrator total:\s*tokens=(\d+)\s*cost=\$([\d.]+)/);
  assert.ok(orchLine, `expected an orchestrator total line; got:\n${stdout}`);
  assert.equal(Number(orchLine[1]), expectedOrchTokens);
  assert.ok(Math.abs(Number(orchLine[2]) - expectedOrchCost) < 0.001);

  const grandLine = stdout.match(/Grand total:.*orchestrator ([\d.]+)% subagents ([\d.]+)%/);
  assert.ok(grandLine, `expected a grand-total line with orchestrator/subagents percentages; got:\n${stdout}`);
  const orchPct = Number(grandLine[1]);
  const subsPct = Number(grandLine[2]);
  assert.ok(Math.abs(orchPct - expectedOrchPct) < 1, `orchestrator% ${orchPct} should be close to ${expectedOrchPct}`);
  assert.ok(Math.abs(subsPct - expectedSubsPct) < 1, `subagents% ${subsPct} should be close to ${expectedSubsPct}`);
  assert.equal(orchPct + subsPct, 100, 'orchestrator% and subagents% must sum to exactly 100');
});

test('AC2: CLI over a fixture session with no subagents/ directory prints the orchestrator total and a grand total reporting subagents at 0 percent, exits 0, and never borrows another session numbers', () => {
  const usageA = {
    input_tokens: 3000,
    output_tokens: 900,
    cache_read_input_tokens: 400,
    cache_creation_input_tokens: 0,
  };
  const sessionFileA = writeSessionTree([
    { type: 'assistant', message: { model: 'claude-opus-4-1-20250805', usage: usageA } },
  ]);
  // No subagents/ directory at all for session A.
  assert.equal(fs.existsSync(path.join(path.dirname(sessionFileA), 'subagents')), false);

  // A second, unrelated fixture with very different numbers and a subagent,
  // to prove the CLI never leaks state across separate invocations.
  const usageB = {
    input_tokens: 999999,
    output_tokens: 999999,
    cache_read_input_tokens: 999999,
    cache_creation_input_tokens: 999999,
  };
  writeSessionTree(
    [{ type: 'assistant', message: { model: 'claude-opus-4-1-20250805', usage: usageB } }],
    [
      {
        id: 'zzz999',
        description: 'unrelated other-session subagent',
        lines: [{ type: 'assistant', message: { model: 'claude-haiku-4-5-20251001', usage: usageB } }],
      },
    ],
  );

  const stdout = execFileSync('node', [CLI_PATH, sessionFileA], { encoding: 'utf8' });

  const expectedTokens = sumUsageTokens(usageA);
  const expectedCostA = costForUsage('opus', usageA);

  const orchLine = stdout.match(/Orchestrator total:\s*tokens=(\d+)\s*cost=\$([\d.]+)/);
  assert.ok(orchLine, `expected an orchestrator total line; got:\n${stdout}`);
  assert.equal(Number(orchLine[1]), expectedTokens);
  assert.ok(Math.abs(Number(orchLine[2]) - expectedCostA) < 0.001);

  const grandLine = stdout.match(/Grand total:.*orchestrator ([\d.]+)% subagents ([\d.]+)%/);
  assert.ok(grandLine, `expected a grand-total line; got:\n${stdout}`);
  assert.equal(Number(grandLine[2]), 0, 'subagents percentage must be exactly 0 when there is no subagents/ dir');
  assert.equal(Number(grandLine[1]), 100);

  // Numbers from the unrelated session B must not appear.
  assert.ok(!stdout.includes('unrelated other-session subagent'));
  assert.ok(!stdout.includes('999999'));
});

test('analyzeSession: importable function returns the same numbers for a fixture with no subagents/ dir without throwing, and does not leak state across calls', () => {
  const usage = {
    input_tokens: 1200,
    output_tokens: 300,
    cache_read_input_tokens: 100,
    cache_creation_input_tokens: 0,
  };
  const sessionFile = writeSessionTree([
    { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage } },
  ]);

  // Call it once for an unrelated fixture first, to prove no shared state.
  const otherUsage = {
    input_tokens: 50000,
    output_tokens: 50000,
    cache_read_input_tokens: 50000,
    cache_creation_input_tokens: 0,
  };
  const otherSessionFile = writeSessionTree([
    { type: 'assistant', message: { model: 'claude-opus-4-1-20250805', usage: otherUsage } },
  ]);
  analyzeSession(otherSessionFile);

  const result = analyzeSession(sessionFile);
  assert.equal(result.subagents.length, 0);
  assert.equal(result.percentages.subagents, 0);
  assert.equal(result.percentages.orchestrator, 100);
  assert.equal(result.orchestrator.tokens, sumUsageTokens(usage));
  assert.ok(Math.abs(result.orchestrator.cost - costForUsage('sonnet', usage)) < 0.001);
});
