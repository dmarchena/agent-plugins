# token-diet — token-saving rules

Agent-friendly token-optimization decalogue. Two parts:

1. **Base decalogue ("caveman")** — 10 schematic rules meant to be always
   loaded (inline in `CLAUDE.md`/`AGENTS.md`).
2. **Scrooge profile** — temporary hardening once a task has already
   overspent; lives only here, never loaded inline.

Sources: Anthropic guidance (context engineering, Claude Code costs/best
practices) + measurements from real sessions.

## Base decalogue (caveman)

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

## Profile: scrooge (overspend detected)

When a specific task has already spent more than expected, on top of the decalogue:

- Freeze exploration: work ONLY on paths/lines already identified; no "looking around just in case".
- Drop the model one tier for every remaining mechanical delegation.
- Verify between edits only if the result decides the next step; report once, at the end.
- After a long pause at a task boundary: cut context and resume from disk, not "continue".
- Wide sweeps (whole repo, full history, regenerating an entire doc): only with prior warning and confirmation.
