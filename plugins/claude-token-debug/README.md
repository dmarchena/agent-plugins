# claude-token-debug

**Find out where Claude Code's token spend actually goes** — by measuring
real session transcripts and inspecting the installed CLI's built-in agent
prompts and tool schemas, instead of guessing from documentation.

[![version](https://img.shields.io/badge/dynamic/json?label=version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2Fdmarchena%2Fagent-plugins%2Fmain%2Fplugins%2Fclaude-token-debug%2F.claude-plugin%2Fplugin.json&color=blue)](CHANGELOG.md)
[![validate](https://github.com/dmarchena/agent-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/dmarchena/agent-plugins/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)

> "How much does a `general-purpose` subagent really cost per call?" "What is
> actually inside a built-in agent's system prompt?" "Are most of our
> subagent calls short tasks that a lighter agent could handle?" This plugin
> answers those questions with **measured numbers and reproducible
> commands**, not estimates.

## What it measures

| Question | Source of truth |
|----------|-----------------|
| Real cost/turn count of past subagent calls | `~/.claude/projects/**` session transcripts, analyzed by `scripts/token-cost.mjs` |
| A built-in agent's actual system prompt and tool schema | The installed `claude-code` npm package's binary, inspected directly |
| Whether a lighter-weight agent is worth building | The measured distribution of task lengths across your real usage |

`scripts/token-cost.mjs` emits a single machine-readable envelope
(`{ ok: true, data: … }`) on stdout, so its findings can be piped into `jq`
or consumed by other tooling.

## Install

```sh
claude plugin marketplace add dmarchena/agent-plugins
claude plugin install claude-token-debug@agent-plugins
```

Then restart your session (or `/reload-plugins`).

## Usage

The [`token-cost-debug`](skills/token-cost-debug/SKILL.md) skill triggers on
natural questions about Claude Code's own spend:

- "How much does the `general-purpose` agent's prompt weigh?"
- "What fraction of our subagent calls are short tasks?"
- "How many turns does our subagent usage actually take?"
- "Show me the built-in Explore agent's real system prompt."

It is **not** for managing the live conversation's context (`/clear`,
`/compact`) — it measures past usage; it doesn't trim the current session.

## Skills

| Skill | Input → Output |
|-------|----------------|
| [`token-cost-debug`](skills/token-cost-debug/SKILL.md) | a cost/prompt question → measured answer + the reproducible commands behind it |

## Agent compatibility

**Claude Code only — by design.** This plugin's entire purpose is
introspecting Claude Code's own runtime (the `~/.claude/projects/**`
transcript layout, the installed CLI binary), so unlike its siblings in this
marketplace it cannot be agent-agnostic.

## License

[MIT](../../LICENSE) — part of the [`agent-plugins`](../../README.md)
marketplace.
