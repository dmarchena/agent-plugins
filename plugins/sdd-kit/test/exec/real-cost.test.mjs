// test/exec/real-cost.test.mjs — T4-real-cost-compute
//
// Fixture convention mirrors shared/test/token-cost.test.mjs (the vendored
// module this file wraps): a session tree is a tmpdir with a flat
// <session>.jsonl plus, optionally, a sibling subagents/ dir holding
// agent-<id>.jsonl + agent-<id>.meta.json per subagent. Fixtures are
// generated at test time rather than checked in as static files, since a
// "session fixture" here is really a small directory tree (session file +
// subagents/), not a single document.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { costForUsage } from '../../scripts/token-cost.mjs';
import { computeRealCost } from '../../scripts/exec/real-cost.mjs';

function makeFixtureDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'real-cost-fixture-'));
}

// Writes a full session tree: a flat <session>.jsonl plus, when `subagents`
// is provided, a subagents/agent-<id>.jsonl + agent-<id>.meta.json per
// entry. Mirrors shared/test/token-cost.test.mjs's writeSessionTree.
function writeSessionTree(orchestratorLines, subagents) {
  const dir = makeFixtureDir();
  const sessionFile = path.join(dir, 'session.jsonl');
  fs.writeFileSync(
    sessionFile,
    orchestratorLines.map((l) => JSON.stringify(l)).join('\n') + '\n',
  );

  if (Array.isArray(subagents)) {
    const subagentsDir = path.join(dir, 'session', 'subagents');
    fs.mkdirSync(subagentsDir, { recursive: true });
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

function sumUsageTokens(usage) {
  return (
    (usage.input_tokens || 0) +
    (usage.output_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0)
  );
}

test('R4.S1: for a fixture session with activity before the boundary and subagent transcripts, computeRealCost includes cache_read, separates orchestrator vs subagents, and excludes pre-boundary turns', () => {
  const preUsage = {
    input_tokens: 4000,
    output_tokens: 1000,
    cache_read_input_tokens: 500,
    cache_creation_input_tokens: 0,
  };
  const postUsage = {
    input_tokens: 2000,
    output_tokens: 600,
    cache_read_input_tokens: 300,
    cache_creation_input_tokens: 0,
  };
  const subUsage = {
    input_tokens: 1500,
    output_tokens: 400,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 0,
  };
  const subLabel = 'fixture code-review subagent';

  const sessionFile = writeSessionTree(
    [
      // Pre-boundary orchestrator activity — must be excluded.
      { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: preUsage } },
      // The boundary line itself: a tool-result-shaped line carrying the
      // run's branch name (the convention T5/T6 will use), found as a raw
      // substring match, not parsed as an assistant record.
      { type: 'user', tool_result: { branch: 'feat/shared-scripts-and-real-cost' } },
      // Post-boundary orchestrator activity — must be included.
      { type: 'assistant', message: { model: 'claude-sonnet-4-5-20250929', usage: postUsage } },
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

  const result = computeRealCost({ sessionPath: sessionFile, boundary: 'feat/shared-scripts-and-real-cost' });

  assert.equal(result.unavailable, undefined, 'expected a real result, not an unavailable fallback');

  // Orchestrator: post-boundary only (pre-boundary excluded).
  const expectedOrchTokens = sumUsageTokens(postUsage);
  const expectedOrchCost = costForUsage('sonnet', postUsage);
  assert.equal(result.orchestrator.tokens, expectedOrchTokens);
  assert.ok(Math.abs(result.orchestrator.usd - expectedOrchCost) < 0.0001);
  // Sanity: pre-boundary tokens must NOT have leaked in.
  assert.notEqual(result.orchestrator.tokens, sumUsageTokens(preUsage) + sumUsageTokens(postUsage));

  // Subagents: unsliced total across the subagents/ dir.
  const expectedSubTokens = sumUsageTokens(subUsage);
  const expectedSubCost = costForUsage('haiku', subUsage);
  assert.equal(result.subagents.tokens, expectedSubTokens);
  assert.ok(Math.abs(result.subagents.usd - expectedSubCost) < 0.0001);

  // cache_read must be folded into both totals (both fixtures used non-zero
  // cache_read_input_tokens, so a correct total is strictly greater than
  // input+output alone).
  assert.ok(result.orchestrator.usd > 0);
  assert.ok(postUsage.cache_read_input_tokens > 0, 'sanity: fixture must exercise cache_read');
  assert.ok(subUsage.cache_read_input_tokens > 0, 'sanity: fixture must exercise cache_read');

  // Total = orchestrator + subagents.
  assert.equal(result.total.tokens, result.orchestrator.tokens + result.subagents.tokens);
  assert.ok(Math.abs(result.total.usd - (result.orchestrator.usd + result.subagents.usd)) < 0.0001);
});

test('R4.S2: when the session transcript cannot be resolved, computeRealCost reports { unavailable: true, reason } instead of throwing', () => {
  const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'real-cost-missing-root-'));
  // projectsRoot exists but is empty: resolveSessionPath's "no projects
  // found" path inside analyze() must be caught, not thrown out of
  // computeRealCost.

  let result;
  assert.doesNotThrow(() => {
    result = computeRealCost({ projectsRoot, boundary: 'irrelevant' });
  }, 'computeRealCost must never throw, even when the session cannot be resolved');

  assert.equal(result.unavailable, true);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0, 'reason must be a non-empty human-readable string');
});
