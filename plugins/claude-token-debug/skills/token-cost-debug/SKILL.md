---
name: token-cost-debug
description: Use this skill when you need to measure the real token/turn cost of Claude Code subagents, or inspect a built-in agent's actual system prompt/tool schema — e.g. "cuánto pesa el prompt de general-purpose", "mide qué fracción de las llamadas a X son tareas cortas", "how many turns does our general-purpose usage actually take", "is a lighter-weight agent worth building", or any question about where Claude Code's own token spend is really going. Do NOT use this for reducing token cost in your own current conversation (context management, /clear, /compact) — this skill measures past usage, it doesn't manage the live context.
allowed-tools: Bash, Read
---

# Token Cost Debug

## What this does

Answers "where is the token spend actually going" for Claude Code usage on
this machine, using two techniques: (1) parsing real subagent transcripts to
measure per-invocation cost and turn count, grouped by `subagent_type`; (2)
inspecting the installed CLI binary to read a built-in agent's actual system
prompt and tool list, instead of guessing from its `whenToUse` description.

## Procedure

### 1. Measuring real subagent cost

Subagent transcripts are not in the flat session `.jsonl` — they live at:

```
~/.claude/projects/<project-slug>/<sessionId>/subagents/agent-<agentId>.jsonl
```

For each file, sum every assistant message's `usage` fields
(`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`) for total cost, and count assistant messages
for turns.

To find which `subagent_type` an invocation used (to group/filter by role),
link across the *parent* session's flat `.jsonl`:

1. Find the `Agent` tool_use block: an assistant message with
   `message.content[].type == "tool_use"` and `name == "Agent"`; its
   `input.subagent_type` is the role, its `id` is the tool_use id.
2. Find the matching result: a later record with
   `message.content[].type == "tool_result"` whose `tool_use_id` equals that
   id, or (for async agents) a `toolUseResult.agentId` on the same record.
3. `toolUseResult.agentId` is the `<agentId>` in the subagent filename above
   — that's the join key back to step 1's `subagent_type`.

Scope the scan to one project (`~/.claude/projects/<project-slug>/`) unless
the question is explicitly about usage across all projects.

### 2. Inspecting a built-in agent's real prompt/tools

The installed CLI (`@anthropic-ai/claude-code`) ships as a compiled binary
(`bin/claude.exe`, typically under
`$(npm root -g)/@anthropic-ai/claude-code/bin/claude.exe` or wherever
`readlink -f "$(which claude)"` points) but embeds its JS bundle as
readable strings:

1. `strings -n 8 claude.exe | grep -n "<a distinctive phrase from the
   agent's whenToUse description>"` to find where the agent is registered
   — look for `agentType:"<name>", ..., getSystemPrompt:<fnName>`.
2. `grep -aob "function <fnName>" claude.exe` to get its byte offset.
3. `dd if=claude.exe bs=1 skip=<offset> count=6000 | strings -n 4` to read
   the function body — this is the actual prompt text (and, nearby, the
   `tools` array) sent for that agent type.

Built-in agents typically *replace* the default system prompt with this
short agent-specific text rather than appending it — don't assume they
inherit the full main-thread prompt without checking.

## Failure modes

- No `subagents/` directory for a project: that project has no recorded
  subagent invocations to measure — say so, don't extrapolate from a
  different project's numbers without flagging that it's a different
  project.
- Can't resolve a `subagent_type` for some transcripts: report those token
  totals as "type unknown" rather than guessing or silently dropping them
  from the count.
- Binary layout changes across CLI versions (function names, byte offsets
  are not stable identifiers): always re-locate the offset by string search
  in the currently-installed binary, never hardcode one from a prior run.

## Output contract

A plain-language answer to the cost question asked (token/turn totals, a
percentage breakdown, a fixed-cost estimate) plus the concrete numbers and
commands used to get there, so the analysis is reproducible — not just a
conclusion.
