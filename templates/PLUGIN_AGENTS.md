<!--
Template for a plugin-level AGENTS.md. Copy to plugins/<plugin>/AGENTS.md
and fill in every section. Delete this comment block once done. See
plugins/sdd-kit/AGENTS.md for a worked example (a multi-skill plugin with a
staged pipeline) — a single-skill plugin can trim the "chain" framing down
to just "What this does" + the skills table.
-->
# <plugin-name>

<One paragraph: what problem this plugin solves and for whom, agent-agnostic
(don't presuppose Claude Code specifically unless the plugin is genuinely
Claude-only).>

## Skills

| Skill | Input → Output | Details |
|-------|-----------------|---------|
| `<skill-name>` | <input> → <output> | [skills/<skill-name>/SKILL.md](skills/<skill-name>/SKILL.md) |

## Agent compatibility

<State what runtime assumptions this plugin makes beyond a general coding
agent that can read/write files and run a script — if none, say so
explicitly, the way sdd-kit's AGENTS.md does.>
