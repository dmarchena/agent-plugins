#!/usr/bin/env node

// Pricing core + session scanner/CLI for claude-token-debug's token-cost CLI
// (see docs/specs/token-cost-cli). stdlib only, no npm deps, no network.
//
// This file has three layers:
//  - Pricing core (PRICE table, tier detection, per-message costing) — pure,
//    takes no fs/path input itself.
//  - Session scanner (analyzeSession, kept for back-compat with its own
//    shape) plus target resolution (--project/--session/--projects-root,
//    defaulting to the newest session of the newest-active project) and a
//    pure, side-effect-free `analyze()` that adds --boundary slicing and
//    returns the exact shape the CLI emits under the envelope's `data`
//    (session/subs/orchestrator/subTotal/orchAll).
//  - A minimal CLI entry point that is a thin print wrapper over
//    `analyze()`: it never computes anything itself, only parses argv and
//    emits the shared {ok,data} envelope (see ./lib/cli.mjs) carrying
//    analyze()'s structured report.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { emitSuccess, emitError } from './lib/cli.mjs';

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

// Scans a session's sibling subagents/ directory (if any): every
// agent-<id>.jsonl paired with its agent-<id>.meta.json label. Shared by
// analyzeSession and analyze() so both report the exact same per-subagent
// numbers. Missing/non-directory subagentsDir (R1.S2): returns zero
// subagents and a zeroed subTotal, never throws.
function scanSubagentsDir(subagentsDir) {
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

  return {
    subagents,
    subTotal: {
      usage: subTotalUsage,
      cost: subTotalCost,
      tokens: totalTokens(subTotalUsage),
    },
  };
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
//
// Kept as-is (own shape: subagents/grand/percentages) for back-compat with
// existing callers/tests; analyze() below is the new pure function whose
// shape mirrors the CLI's emitted `data` output (R3).
export function analyzeSession(sessionFilePath) {
  const sessionDir = path.dirname(sessionFilePath);
  const sessionName = path.basename(sessionFilePath).replace(/\.jsonl$/, '');
  // Real Claude Code layout: a session's subagents/ dir is nested under a
  // directory named after the session id, sibling to the flat .jsonl file —
  // NOT directly under sessionDir (verified against a real
  // ~/.claude/projects/<project>/<session-uuid>/subagents/ tree).
  const subagentsDir = path.join(sessionDir, sessionName, 'subagents');

  const orchestrator = scanTranscript(sessionFilePath);
  const { subagents, subTotal } = scanSubagentsDir(subagentsDir);
  const subTotalCost = subTotal.cost;

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

// --- Target resolution (R4.S1) ----------------------------------------

// projects-root override precedence: explicit opts.projectsRoot wins, then
// the TOKEN_COST_PROJECTS_ROOT env var (so tests/CI never need to touch the
// real ~/.claude/projects), then the real default.
function projectsRootFrom(opts) {
  return (
    (opts && opts.projectsRoot) ||
    process.env.TOKEN_COST_PROJECTS_ROOT ||
    path.join(os.homedir(), '.claude', 'projects')
  );
}

function newestByMtime(paths) {
  return paths
    .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0].p;
}

// Newest *.jsonl file directly inside a project directory (flat session
// files live at the project dir's own top level; a session's subagents/
// dir sits alongside its .jsonl, not inside it).
function newestSessionInProjectDir(projectDir) {
  const sessionFiles = fs
    .readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => path.join(projectDir, f));
  if (sessionFiles.length === 0) {
    throw new Error(`No session files found under: ${projectDir}`);
  }
  return newestByMtime(sessionFiles);
}

// "Newest-active project" heuristic: the most recently modified directory
// directly under projectsRoot. Documented default, not a discovered fact —
// mtime is the only ordering signal readily available on a project dir.
function newestActiveProjectDir(projectsRoot) {
  if (!fs.existsSync(projectsRoot)) {
    throw new Error(`Projects root not found: ${projectsRoot}`);
  }
  const projectDirs = fs
    .readdirSync(projectsRoot)
    .map((name) => path.join(projectsRoot, name))
    .filter((p) => fs.statSync(p).isDirectory());
  if (projectDirs.length === 0) {
    throw new Error(`No projects found under: ${projectsRoot}`);
  }
  return newestByMtime(projectDirs);
}

// Resolves a CLI/analyze() target down to one concrete flat session .jsonl
// path. Precedence: an explicit opts.sessionPath wins outright (this is how
// the CLI's plain positional arg and directly-targeted analyze() calls stay
// simple); else --project/--session narrow within projectsRoot (either or
// both may be given — a session name alone is looked up inside the
// newest-active project); else fall back to the newest session of the
// newest-active project dir under projectsRoot (R4.S1's default).
function resolveSessionPath(opts) {
  if (opts && opts.sessionPath) {
    return opts.sessionPath;
  }

  const projectsRoot = projectsRootFrom(opts);

  if (opts && opts.project) {
    const projectDir = path.join(projectsRoot, opts.project);
    if (opts.session) {
      return path.join(projectDir, `${opts.session}.jsonl`);
    }
    return newestSessionInProjectDir(projectDir);
  }

  if (opts && opts.session) {
    const projectDir = newestActiveProjectDir(projectsRoot);
    return path.join(projectDir, `${opts.session}.jsonl`);
  }

  const projectDir = newestActiveProjectDir(projectsRoot);
  return newestSessionInProjectDir(projectDir);
}

// --- Boundary slicing (R4.S2) ------------------------------------------

// First raw (unparsed) line index whose text contains `substr`. Matching
// against the raw line text — not just assistant records — because R4
// slices at "the first flat-session line" containing the substring, which
// may live on a non-assistant line (user/tool-result/etc). Returns -1 when
// no --boundary was requested or no line matches; callers treat -1 as
// "unsplit" (R4.S2), never as an error.
function findBoundaryLineIndex(rawLines, substr) {
  if (!substr) {
    return -1;
  }
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].includes(substr)) {
      return i;
    }
  }
  return -1;
}

// Scans the orchestrator's own flat transcript, optionally slicing its
// assistant messages into pre/post buckets at the first raw line containing
// `boundarySubstr`. Always returns the full (unsplit) usage/cost/tokens/
// models totals — exactly like scanTranscript — plus a `boundary` object
// describing whether/where the split fired. Missing file -> zeroed totals,
// unsplit boundary, never throws (mirrors readAssistantRecords).
function scanOrchestratorTranscript(filePath, boundarySubstr) {
  if (!fs.existsSync(filePath)) {
    return {
      usage: zeroUsage(),
      cost: 0,
      tokens: 0,
      models: [],
      boundary: { substr: boundarySubstr || null, split: false, pre: null, post: null },
    };
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const rawLines = raw.split('\n').filter((l) => l.trim().length > 0);
  const boundaryIndex = findBoundaryLineIndex(rawLines, boundarySubstr);
  const split = boundaryIndex !== -1;

  const usage = zeroUsage();
  let cost = 0;
  const models = new Set();

  const preUsage = zeroUsage();
  let preCost = 0;
  const postUsage = zeroUsage();
  let postCost = 0;

  rawLines.forEach((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }
    if (!record || record.type !== 'assistant') {
      return;
    }

    const priced = priceMessage(record);
    addUsageInto(usage, priced.usage);
    cost += priced.cost;
    if (priced.model) {
      models.add(priced.model);
    }

    if (split) {
      if (index < boundaryIndex) {
        addUsageInto(preUsage, priced.usage);
        preCost += priced.cost;
      } else {
        addUsageInto(postUsage, priced.usage);
        postCost += priced.cost;
      }
    }
  });

  return {
    usage,
    cost,
    tokens: totalTokens(usage),
    models: Array.from(models),
    boundary: {
      substr: boundarySubstr || null,
      split,
      pre: split ? { usage: preUsage, cost: preCost, tokens: totalTokens(preUsage) } : null,
      post: split ? { usage: postUsage, cost: postCost, tokens: totalTokens(postUsage) } : null,
    },
  };
}

// --- Pure analysis (R3) -------------------------------------------------

// The pure, side-effect-free analysis function (R3.S2): writes nothing to
// stdout/stderr, and returns exactly the shape the CLI emits under the
// envelope's `data` (R3.S1) — top-level keys
// session/subs/orchestrator/subTotal/orchAll.
// `target` is either a plain session-file-path string (the common case for
// direct/importable callers and for the CLI's positional arg) or an options
// object: { sessionPath, project, session, projectsRoot, boundary }.
//
// subTotal/orchAll carry the cost-based percentage split (`pct`) that used
// to live in analyzeSession's separate `percentages` field — paired here so
// each total is self-describing. subsPct is computed first (from cost),
// orchPct is its exact complement, so the two always sum to exactly 100.
export function analyze(target) {
  const opts = typeof target === 'string' ? { sessionPath: target } : target || {};
  const sessionFilePath = resolveSessionPath(opts);

  const sessionDir = path.dirname(sessionFilePath);
  const sessionName = path.basename(sessionFilePath).replace(/\.jsonl$/, '');
  // See analyzeSession()'s comment: subagents/ nests under a
  // session-id-named directory, not directly under sessionDir.
  const subagentsDir = path.join(sessionDir, sessionName, 'subagents');

  const orchestrator = scanOrchestratorTranscript(sessionFilePath, opts.boundary);
  const { subagents, subTotal } = scanSubagentsDir(subagentsDir);

  const grandCost = orchestrator.cost + subTotal.cost;
  const subsPct = grandCost > 0 ? Math.round((subTotal.cost / grandCost) * 1000) / 10 : 0;
  const orchPct = Math.round((100 - subsPct) * 10) / 10;

  return {
    session: sessionFilePath,
    subs: subagents,
    orchestrator,
    subTotal: { ...subTotal, pct: subsPct },
    orchAll: {
      usage: orchestrator.usage,
      cost: orchestrator.cost,
      tokens: orchestrator.tokens,
      pct: orchPct,
    },
  };
}

// --- CLI -----------------------------------------------------------------

// Minimal argv parser. Supports a plain positional session-path arg (kept
// for back-compat with the pre-T3 CLI contract) alongside --project,
// --session, --projects-root and --boundary flags.
function parseArgs(argv) {
  const opts = {};
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--project':
        opts.project = argv[++i];
        break;
      case '--session':
        opts.session = argv[++i];
        break;
      case '--projects-root':
        opts.projectsRoot = argv[++i];
        break;
      case '--boundary':
        opts.boundary = argv[++i];
        break;
      default:
        rest.push(arg);
    }
  }

  if (rest.length > 0) {
    opts.sessionPath = rest[0];
  }

  return opts;
}

// The CLI is a thin print wrapper: it only parses argv, calls the pure
// analyze(), and emits its structured report via the shared {ok,data}
// envelope (./lib/cli.mjs). No cost/scan logic lives here.
function main() {
  const opts = parseArgs(process.argv.slice(2));

  let result;
  try {
    result = analyze(opts);
  } catch (err) {
    emitError(err.message, 1);
    return;
  }

  emitSuccess(result);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
