#!/usr/bin/env node

// Pricing core for claude-token-debug's token-cost CLI (see docs/specs/token-cost-cli).
// stdlib only, no npm deps, no network — this module itself needs none of
// node:fs/node:path/node:os (pure pricing math), but stays free of any
// non-stdlib dependency so later tasks can add the session scanner (which
// will need those) on top without introducing a new dependency boundary.
// This file intentionally stops at the pricing primitives (PRICE table,
// tier detection, per-message costing) — the session scanner / CLI / --json
// output are later tasks built on top of this.

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
