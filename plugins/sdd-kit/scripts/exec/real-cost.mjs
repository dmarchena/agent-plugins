// exec/real-cost.mjs — T4-real-cost-compute
//
// Computes the "real cost" of one plan-executor run: orchestrator +
// subagent token/USD spend for a session, sliced so only activity at/after
// a caller-supplied run boundary counts on the orchestrator side.
//
// Pure Node ESM, stdlib only + the vendored ../token-cost.mjs. Does not
// print, does not throw: returns data (or an { unavailable, reason }
// fallback — see computeRealCost below).
//
// Design notes (do not re-derive, this is intentional):
//  - Orchestrator slicing: analyze()'s `boundary` option finds the first
//    RAW transcript line containing a caller-supplied substring and splits
//    the orchestrator's own assistant messages into pre/post buckets at
//    that point. This module always reports the POST-boundary slice as
//    "this run's" orchestrator cost. When the boundary substring matches no
//    line (orchestrator.boundary.split === false — e.g. no boundary was
//    given, or the run hasn't reached the point that stamps the marker
//    yet), there is nothing to exclude, so we fall back to the
//    orchestrator's full unsliced totals rather than reporting zero.
//  - Subagent slicing: token-cost.mjs's subagent scan
//    (scanSubagentsDir/analyze()'s `subs`/`subTotal`) has no
//    boundary-awareness — it always reports every agent-<id>.jsonl under
//    the session's subagents/ dir in full. This is a real, documented
//    limitation of the vendored module (see the brief for T4), not
//    something fixable without editing token-cost.mjs (out of scope here).
//    subagents.tokens/usd below is therefore the full, unsliced subTotal.
//    A prior run's subagents sharing the same session would double-count;
//    this module does not attempt to work around that.
//  - cache_read: already folded into every usage/cost total token-cost.mjs
//    produces (via costForUsage/normalizeUsage), so no extra handling is
//    needed here to include it, and no double-counting risk from adding it
//    twice.

import { analyze } from '../token-cost.mjs';

/**
 * Computes the real (post-boundary orchestrator + full subagents) cost of
 * one plan-executor run from a session transcript.
 *
 * @param {object} opts - same targeting options analyze() accepts:
 *   { sessionPath, project, session, projectsRoot } to locate the session,
 *   plus `boundary`: a substring marking where this run's activity starts
 *   in the orchestrator's raw transcript (e.g. the run's git branch name,
 *   which plan-executor's `init` subcommand echoes into a tool-result once
 *   — see exec-tools.mjs; any substring unique to the run's first turn
 *   works equally well, this module does not require that specific
 *   convention).
 * @returns {{orchestrator:{tokens:number,usd:number},subagents:{tokens:number,usd:number},total:{tokens:number,usd:number}}|{unavailable:true,reason:string}}
 *   Never throws: when the target session can't be located or parsed,
 *   returns { unavailable: true, reason } instead (R4.S2).
 */
export function computeRealCost(opts) {
  let result;
  try {
    result = analyze(opts || {});
  } catch (err) {
    return {
      unavailable: true,
      reason: (err && err.message) || String(err),
    };
  }

  const { orchestrator, subTotal } = result;

  const orchSlice = orchestrator.boundary && orchestrator.boundary.split
    ? orchestrator.boundary.post
    : { tokens: orchestrator.tokens, cost: orchestrator.cost };

  const orchestratorOut = { tokens: orchSlice.tokens, usd: orchSlice.cost };
  const subagentsOut = { tokens: subTotal.tokens, usd: subTotal.cost };
  const totalOut = {
    tokens: orchestratorOut.tokens + subagentsOut.tokens,
    usd: orchestratorOut.usd + subagentsOut.usd,
  };

  return {
    orchestrator: orchestratorOut,
    subagents: subagentsOut,
    total: totalOut,
  };
}
