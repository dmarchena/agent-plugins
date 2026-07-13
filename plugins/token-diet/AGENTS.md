# token-diet

A single, explicit-invocation command that installs an opt-in token-saving
ruleset into a project's or user's instructions file (`CLAUDE.md`, and the
same flow applies to `AGENTS.md`).

Unlike `sdd-kit`, this plugin has no skill layer: the whole flow —
**analyze → recommend → copy the rules doc → apply on confirmation** — lives
directly in `commands/install.md`'s prompt body. It is never auto-invoked by
an LLM or a hook; the user must run the command explicitly.

## The flow

1. **Analyze (R1)** — resolve the target file (`./CLAUDE.md` project vs
   `~/.claude/CLAUDE.md` user, asking at runtime when both exist) and report
   two facts: whether it already contains any token-saving policy (written
   any way) and whether it already carries this plugin's attribution mark
   `Produced with token-diet (vX.Y.Z)` and which version. A missing target
   is reported, not treated as an error — the command offers to create it.
2. **Recommend (R2)** — from that analysis, emit exactly one recommendation
   (`add` / `replace` / `extend` / `update` / `none`) with a one-line reason.
3. **Copy the rules doc (R3)** — copy `assets/token-diet-rules.md` (base "caveman"
   decalogue + a more restrictive overspend profile) to the chosen destination (default:
   project → `docs/`, user → `~/.claude/`), warning when the destination
   falls outside the current repo (won't be versioned, pointer becomes an
   absolute path).
4. **Apply on confirmation (R4)** — only after explicit user confirmation,
   write the base summary + a pointer to the copied doc + the versioned
   attribution mark into the target file, replacing (not duplicating) an
   existing token-diet block.

All four steps are implemented in the command prompt.

## Commands

| Command | Purpose |
|---------|---------|
| `/token-diet:install` | Runs the full analyze → recommend → copy → apply flow against a chosen target file. |

## Agent compatibility

Markdown-only and agent-agnostic: the command's prompt body assumes no
Claude-specific runtime beyond a general coding agent that can read/write
local files and ask the user a question.
