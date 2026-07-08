import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PRICE,
  tierForModel,
  costForUsage,
  priceMessage,
} from '../scripts/token-cost.mjs';

function makeFixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'token-cost-fixture-'));
}

function writeSessionFixture(lines) {
  const dir = makeFixtureDir();
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
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
