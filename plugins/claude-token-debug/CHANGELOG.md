# Changelog

All notable changes to the `claude-token-debug` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.2.0

- Added `scripts/token-cost.mjs`, a runnable CLI (and importable `analyze()`)
  that turns "where did a session's tokens go" into a one-liner: model-aware
  pricing per assistant message, orchestrator/subagent split with cost-based
  percentages, `--json` output, `--project`/`--session`/`--projects-root`
  target resolution (defaulting to the newest session of the newest-active
  project), and `--boundary <substr>` pre/post slicing.
- The `token-cost-debug` skill's subagent-cost technique now invokes
  `${CLAUDE_PLUGIN_ROOT}/scripts/token-cost.mjs` instead of instructing a
  hand-rolled `.jsonl` scan; the built-in-agent binary-inspection technique
  (`strings`/`dd`) is unchanged.

## 0.1.0

- Initial release: the `token-cost-debug` skill, covering two techniques
  discovered while deciding whether a lighter-weight subagent was worth
  building for `sdd-kit`'s `plan-writer` catalog — measuring real subagent
  token/turn cost from `~/.claude/projects/**/subagents/*.jsonl`, and
  inspecting the installed CLI binary to read a built-in agent's actual
  system prompt and tool list.
