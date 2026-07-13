# token-diet

A single, explicit-invocation command for the `agent-plugins` marketplace
that analyzes a `CLAUDE.md`/`AGENTS.md` file, judges whether it already has
a token-saving policy, recommends an action, and — with explicit
confirmation — installs an opt-in, versioned token-saving ruleset: a 10-rule
inline "caveman" decalogue plus a pointer to a full rules document (with a
more restrictive overspend profile) copied alongside it.

It is never auto-invoked by an LLM or a hook — only explicit invocation.

## Usage

```
/token-diet:install
```

The command asks which target to analyze when both a project `./CLAUDE.md`
and a user `~/.claude/CLAUDE.md` exist, reports whether a token-saving
policy and this plugin's attribution mark are already present, and — for
now — copies `assets/token-diet-rules.md` to the chosen destination. Recommending an
action and applying it with confirmation are covered by later work on this
same command (see `AGENTS.md`).

## Layout

- `commands/install.md` — the command's prompt (single entry point).
- `assets/token-diet-rules.md` — the rules document copied to the target's destination.
- `AGENTS.md` — the full analyze → recommend → copy → apply flow.
- `CHANGELOG.md` — version history.

## Agent compatibility

Markdown-only and agent-agnostic; see `AGENTS.md`.
