# token-diet — token-saving rules

Agent-friendly token-optimization decalogue. Two parts:

1. **Base decalogue ("caveman")** — 10 schematic rules meant to be always
   loaded (inline in `CLAUDE.md`/`AGENTS.md`).
2. **Scrooge profile** — temporary hardening once a task has already
   overspent; lives only here, never loaded inline.

Sources: Anthropic guidance (context engineering, Claude Code costs/best
practices) + measurements from real sessions.

## Base decalogue (caveman)

Schematic, one line per rule — see § Decision rules (detail) below for the rationale/figures behind each rule.

- Context = cost: every context token is re-billed on EVERY turn. Carry only signal; drop dead weight.
- Read just enough: grep before read, fragment before whole file; never re-read what has not changed.
- Batch all independent tool calls into ONE message: ≥2 independent operations with no deciding test between them → one message; only test between edits when the result decides the next step; every extra turn re-pays the entire context.
- Deterministic or repeatable? → script/CLI (0 tokens), never an agent.
- Verbose output (tests, logs, builds, web pages) → filter BEFORE it enters the context (grep/head/hook); keep only what decides something.
- Delegate to the cheapest model that guarantees the result, with a self-contained brief (exact paths, zero open decisions); have it return a summary, not a dump — but delegation is not free (the subagent cold-starts), so for short tasks or context you already loaded inline, doing it yourself is cheaper; always pin the cheap model explicitly, since the default inherits the expensive one.
- Exploring/locating/inventorying → read-only subagent with its own context; read yourself only what you will judge or modify — it locates, it does not audit: paying more for the correct answer is cheap, paying less for one that forces a redo is expensive.
- New task or 2 failed corrections → cut context (/clear or fresh session) and rephrase; persistent state goes to disk/commit, not the conversation — after a pause at a task boundary, resume from disk in a fresh session (~5K tokens) instead of "continue", which re-drags the full context, potentially 100× more.
- Keep always-loaded instructions minimal (short CLAUDE.md/AGENTS.md); move occasional material to skills/docs loaded on demand — the same applies to plans/docs: a long plan/doc loaded whole into every session that touches it is expensive too, so keep a thin index and move detail to documents loaded on demand.
- Don't break the cache: no model switch mid-thread, no rewriting stable context; breaking it re-bills everything at full price.
- Before changing the shape of a shared datum (a function's return type, a schema field), grep ALL its readers/consumers at once and fix them in the same batch — don't discover them one at a time through serial test failures.

## Decision rules (detail)

Rationale and figures behind six of the decalogue's rules — load this section
only when you (or the agent) need the "why", not for routine work.

1. **Cheap-explorer guardrail.** Exploring/locating/inventorying is delegated to
   a read-only subagent instead of being done inline because a wrong "it locates,
   it does not audit" boundary is expensive to recover from: a subagent explore
   pass costs roughly 1× the tokens of the area it scans, while a redo forced by
   an unverified claim it smuggled in as fact costs on the order of 6× that —
   the ~6× explore-cost ratio is the reason the subagent is trusted to locate
   but never to judge or modify.
2. **Delegation cost + model pinning.** Spinning up a subagent has a real
   cold-start cost (fresh context, no shared history), so delegating a short,
   already-inline task is a net loss; delegation only pays off past a size/risk
   threshold. When it does pay off, the cheap model must be pinned explicitly —
   the default inherits the caller's (expensive) model, so an unpinned
   delegation silently re-bills at full price instead of the cheaper tier.
3. **Batching threshold (≥2 ops).** Two or more independent tool calls with no
   deciding test between them belong in one message because the cost is not the
   payload but the round trip: every extra turn re-sends and re-bills the whole
   context. The ≥2-independent-operations threshold is deliberately low —
   even a pair of unrelated reads is cheaper batched than serialized.
4. **Resume-from-disk figures.** Resuming a paused task from a fresh session
   plus its on-disk state (spec, plan, execution log) costs on the order of
   ~5K tokens to reload. Saying "continue" in the same long-running thread
   instead re-drags the accumulated context, which in real sessions has ranged
   from roughly 0.4M to 1M tokens — a 100×-plus difference for the same
   resumed work, purely from where the state was kept.
5. **Plans/docs hierarchy.** The same always-loaded-minimal principle that
   keeps `CLAUDE.md`/`AGENTS.md` short also applies to plans and specs: a long
   plan/doc loaded whole into every session that touches it re-bills its full
   length on every turn. The fix is the same shape as this file itself — a
   thin index the caller always loads, with detail sections like this one
   pulled in only on demand.
6. **Grep-all-readers before a shape change.** Changing what a shared datum
   looks like (a function's return type, a schema field) breaks every reader
   of the old shape at once, but discovering them one at a time via serial
   test failures pays the full edit-run-fail loop per reader. Grepping ALL
   readers/consumers up front and fixing them in the same batch turns N
   round trips into one.

## Profile: scrooge (overspend detected)

When a specific task has already spent more than expected, on top of the decalogue:

- Freeze exploration: work ONLY on paths/lines already identified; no "looking around just in case".
- Drop the model one tier for every remaining mechanical delegation.
- Verify between edits only if the result decides the next step; report once, at the end.
- After a long pause at a task boundary: cut context and resume from disk, not "continue".
- Wide sweeps (whole repo, full history, regenerating an entire doc): only with prior warning and confirmation.
