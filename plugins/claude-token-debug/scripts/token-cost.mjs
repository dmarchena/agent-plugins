#!/usr/bin/env node

// Pricing core + session scanner/CLI for claude-token-debug's token-cost CLI
// (see docs/specs/token-cost-cli). stdlib only, no npm deps, no network.
//
// This file has two layers:
//  - Pricing core (PRICE table, tier detection, per-message costing) — pure,
//    takes no fs/path input itself.
//  - Session scanner (analyzeSession) + a minimal CLI entry point, built on
//    top of the pricing core. --json, --boundary and target resolution
//    (--project/--session/projects-root) are explicitly NOT implemented here
//    — a later task adds them; this CLI takes its target as a plain
//    positional session-file path for now.

import fs from 'node:fs';
import path from 'node:path';

// USD per 1,000,000 tokens, list prices (directional, not billing-exact).
// Edit these inline to update rates. cache_read is the discounted read-hit
// rate; cache_creation is the write/creation rate.
export const PRICE = {
  opus: {
    input: 15,
    output: 75,
    cache_read: 1.5,
    cache_creation: 18.75,
  },
  sonnet: {
    input: 3,
    output: 15,
    cache_read: 0.3,
    cache_creation: 3.75,
  },
  haiku: {
    input: 0.8,
    output: 4,
    cache_read: 0.08,
    cache_creation: 1,
  },
};

// Ordered list of known tiers; also doubles as the match order for
// tierForModel (first substring match wins).
export const KNOWN_TIERS = ['opus', 'sonnet', 'haiku'];

// Derive a price tier from a message's own `model` string. No hardcoded
// per-session model: every message is classified independently. Returns
// null when the string matches no known tier — callers must NOT guess a
// tier in that case.
export function tierForModel(modelString) {
  if (typeof modelString !== 'string' || modelString.length === 0) {
    return null;
  }
  const lower = modelString.toLowerCase();
  for (const tier of KNOWN_TIERS) {
    if (lower.includes(tier)) {
      return tier;
    }
  }
  return null;
}

// Normalize a raw usage object (possibly missing fields) into the four
// counters this module costs: input, output, cache_read, cache_creation.
export function normalizeUsage(usage) {
  const u = usage || {};
  return {
    input_tokens: u.input_tokens || 0,
    output_tokens: u.output_tokens || 0,
    cache_read_input_tokens: u.cache_read_input_tokens || 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens || 0,
  };
}

// Cost in USD for a given tier + usage. Returns exactly 0 for an unknown
// tier (null/undefined/anything not in PRICE) — never throws, never guesses.
export function costForUsage(tier, usage) {
  const rates = PRICE[tier];
  if (!rates) {
    return 0;
  }
  const u = normalizeUsage(usage);
  return (
    (u.input_tokens / 1e6) * rates.input +
    (u.output_tokens / 1e6) * rates.output +
    (u.cache_read_input_tokens / 1e6) * rates.cache_read +
    (u.cache_creation_input_tokens / 1e6) * rates.cache_creation
  );
}

// Price a single assistant message record. Accepts either a raw Claude Code
// transcript record (`{ type: 'assistant', message: { model, usage } }`) or
// the inner `message` object directly (`{ model, usage }`).
//
// Never drops a message: when its model matches no known tier, the returned
// usage still carries its (normalized) token counts and `model` still
// carries the original string, but `cost` is exactly 0 and `tier` is null.
export function priceMessage(record) {
  const message = record && typeof record === 'object' && 'message' in record
    ? record.message
    : record;

  const model = message && typeof message.model === 'string' ? message.model : null;
  const usage = normalizeUsage(message && message.usage);
  const tier = tierForModel(model);
  const cost = tier ? costForUsage(tier, usage) : 0;

  return { model, tier, cost, usage };
}

// --- Session scanner (R1) ---------------------------------------------

function zeroUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

// Mutates `target` in place, adding `usage` into it. Used only on locally
// created accumulators (never a shared/module-level object), so repeated
// calls to analyzeSession never leak state across sessions.
function addUsageInto(target, usage) {
  target.input_tokens += usage.input_tokens || 0;
  target.output_tokens += usage.output_tokens || 0;
  target.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  target.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
}

// Total token count across all four counters, cache_read included.
function totalTokens(usage) {
  return (
    usage.input_tokens +
    usage.output_tokens +
    usage.cache_read_input_tokens +
    usage.cache_creation_input_tokens
  );
}

// Reads a flat transcript .jsonl (a session's own file, or a subagent's own
// agent-<id>.jsonl) and returns only its assistant-message records. Missing
// file -> empty array (callers decide whether that's an error); malformed
// lines are skipped rather than throwing, so one bad line never aborts the
// whole scan.
function readAssistantRecords(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const records = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record && record.type === 'assistant') {
      records.push(record);
    }
  }
  return records;
}

// Scans one transcript file (session-level or subagent-level) and returns
// its usage totals, cost, distinct models seen, and token total. Pure
// function of `filePath`'s own content — never reads any other file.
function scanTranscript(filePath) {
  const usage = zeroUsage();
  let cost = 0;
  const models = new Set();

  for (const record of readAssistantRecords(filePath)) {
    const priced = priceMessage(record);
    addUsageInto(usage, priced.usage);
    cost += priced.cost;
    if (priced.model) {
      models.add(priced.model);
    }
  }

  return { usage, cost, tokens: totalTokens(usage), models: Array.from(models) };
}

// Reads a subagent's agent-<id>.meta.json for a human-readable label.
//
// Convention (no real-world example ships with this repo yet, so this is a
// documented, reasonable default rather than a discovered fact): the meta
// file is a JSON object carrying a `description` string field — mirroring
// the same field name the Agent tool itself takes for a subagent's one-line
// task description. Falls back to the raw agent id when the meta file is
// missing, unreadable, or has no usable `description`.
function readSubagentLabel(metaFilePath, agentId) {
  if (!fs.existsSync(metaFilePath)) {
    return agentId;
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
    if (meta && typeof meta.description === 'string' && meta.description.trim().length > 0) {
      return meta.description;
    }
  } catch {
    // fall through to the id-based fallback below
  }
  return agentId;
}

// Scans one session: its own flat transcript (the orchestrator) plus every
// agent-<id>.jsonl under its sibling subagents/ directory (if any), labeling
// each subagent from its agent-<id>.meta.json. Cost-based percentages: the
// orchestrator/subagents split is computed from cost totals, not raw token
// counts. cache_read tokens/cost are included in every total because
// scanTranscript's `usage`/`cost` already fold cache_read in (see
// costForUsage/normalizeUsage above).
//
// Missing subagents/ directory (R1.S2): reported as zero subagents at 0%,
// never thrown. All accumulators here are local to this call, so nothing
// leaks between calls (R1.S2's "never borrow another session's numbers").
export function analyzeSession(sessionFilePath) {
  const sessionDir = path.dirname(sessionFilePath);
  const sessionName = path.basename(sessionFilePath).replace(/\.jsonl$/, '');
  const subagentsDir = path.join(sessionDir, 'subagents');

  const orchestrator = scanTranscript(sessionFilePath);

  const subagents = [];
  const subTotalUsage = zeroUsage();
  let subTotalCost = 0;

  if (fs.existsSync(subagentsDir) && fs.statSync(subagentsDir).isDirectory()) {
    const agentIds = new Set();
    for (const entry of fs.readdirSync(subagentsDir)) {
      const match = entry.match(/^agent-(.+)\.jsonl$/);
      if (match) {
        agentIds.add(match[1]);
      }
    }

    for (const id of Array.from(agentIds).sort()) {
      const transcriptFile = path.join(subagentsDir, `agent-${id}.jsonl`);
      const metaFile = path.join(subagentsDir, `agent-${id}.meta.json`);
      const label = readSubagentLabel(metaFile, id);
      const scanned = scanTranscript(transcriptFile);

      subagents.push({ id, label, ...scanned });
      addUsageInto(subTotalUsage, scanned.usage);
      subTotalCost += scanned.cost;
    }
  }

  const subTotal = {
    usage: subTotalUsage,
    cost: subTotalCost,
    tokens: totalTokens(subTotalUsage),
  };

  const grandCost = orchestrator.cost + subTotalCost;
  const grandTokens = orchestrator.tokens + subTotal.tokens;

  // Cost-based split. subsPct is computed first (from cost), then
  // orchPct is its exact complement — guaranteeing the two displayed
  // percentages always sum to exactly 100, including the grandCost === 0
  // edge case (subsPct 0 / orchPct 100).
  const subsPct = grandCost > 0 ? Math.round((subTotalCost / grandCost) * 1000) / 10 : 0;
  const orchPct = Math.round((100 - subsPct) * 10) / 10;

  return {
    session: sessionName,
    orchestrator,
    subagents,
    subTotal,
    grand: { cost: grandCost, tokens: grandTokens },
    percentages: { orchestrator: orchPct, subagents: subsPct },
  };
}

// --- CLI (human-readable default output only; --json is a later task) --

function formatUsd(amount) {
  return `$${amount.toFixed(4)}`;
}

export function renderReport(result) {
  const lines = [];
  lines.push(`Session: ${result.session}`);

  if (result.subagents.length > 0) {
    lines.push('Subagents:');
    for (const sub of result.subagents) {
      lines.push(`  ${sub.label}: tokens=${sub.tokens} cost=${formatUsd(sub.cost)}`);
    }
  }

  lines.push(`Orchestrator total: tokens=${result.orchestrator.tokens} cost=${formatUsd(result.orchestrator.cost)}`);
  lines.push(
    `Grand total: cost=${formatUsd(result.grand.cost)} orchestrator ${result.percentages.orchestrator}% subagents ${result.percentages.subagents}%`,
  );

  return lines.join('\n');
}

function main() {
  const target = process.argv[2];
  if (!target) {
    process.stderr.write('Usage: token-cost.mjs <session.jsonl>\n');
    process.exitCode = 1;
    return;
  }
  const result = analyzeSession(target);
  process.stdout.write(renderReport(result) + '\n');
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
