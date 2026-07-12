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
- Batch all independent tool calls into ONE message; every extra turn re-pays the entire context.
- Deterministic or repeatable? → script/CLI (0 tokens), never an agent.
- Verbose output (tests, logs, builds, web pages) → filter BEFORE it enters the context (grep/head/hook); keep only what decides something.
- Delegate to the cheapest model that guarantees the result, with a self-contained brief (exact paths, zero open decisions); have it return a summary, not a dump.
- Exploring/locating/inventorying → read-only subagent with its own context; read yourself only what you will judge or modify.
- New task or 2 failed corrections → cut context (/clear or fresh session) and rephrase; persistent state goes to disk/commit, not the conversation.
- Keep always-loaded instructions minimal (short CLAUDE.md/AGENTS.md); move occasional material to skills/docs loaded on demand.
- Don't break the cache: no model switch mid-thread, no rewriting stable context; breaking it re-bills everything at full price.

## Profile: scrooge (overspend detected)

When a specific task has already spent more than expected, on top of the decalogue:

- Freeze exploration: work ONLY on paths/lines already identified; no "looking around just in case".
- Drop the model one tier for every remaining mechanical delegation.
- Verify between edits only if the result decides the next step; report once, at the end.
- After a long pause at a task boundary: cut context and resume from disk, not "continue".
- Wide sweeps (whole repo, full history, regenerating an entire doc): only with prior warning and confirmation.
