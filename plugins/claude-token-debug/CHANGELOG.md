# Changelog

All notable changes to the `claude-token-debug` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.0

- Initial release: the `token-cost-debug` skill, covering two techniques
  discovered while deciding whether a lighter-weight subagent was worth
  building for `sdd-kit`'s `plan-writer` catalog — measuring real subagent
  token/turn cost from `~/.claude/projects/**/subagents/*.jsonl`, and
  inspecting the installed CLI binary to read a built-in agent's actual
  system prompt and tool list.
