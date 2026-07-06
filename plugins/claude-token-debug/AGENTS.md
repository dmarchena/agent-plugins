# claude-token-debug

A debugging toolkit for Claude Code itself: answers "where is the token
spend actually going" by measuring real subagent transcripts and inspecting
the installed CLI's built-in agent prompts and tool schemas, instead of
guessing from documentation or assumptions.

This plugin is genuinely Claude Code-specific — it reads the
`~/.claude/projects/**` transcript layout and the installed `claude-code`
npm package's binary directly, so it presupposes the Claude Code CLI
runtime rather than a generic coding agent.

## Skills

| Skill | Input → Output | Details |
|-------|-----------------|---------|
| `token-cost-debug` | A cost/prompt question → measured answer + reproducible commands | [skills/token-cost-debug/SKILL.md](skills/token-cost-debug/SKILL.md) |

## Agent compatibility

Claude Code only — this plugin's entire purpose is introspecting Claude
Code's own runtime (session transcript layout, installed CLI binary), so it
cannot be agent-agnostic by design.
