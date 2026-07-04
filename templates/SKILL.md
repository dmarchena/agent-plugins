<!--
Template for a Claude Code skill. Copy to
plugins/<plugin>/skills/<skill-name>/SKILL.md and fill in every section.
Delete this comment block once done. See plugins/sdd-kit/skills/*/SKILL.md
for worked examples (plan-writer's is the most heavily annotated).
-->
---
name: <skill-name>
description: Use this skill whenever <the concrete triggers a user would say — quote 3-5 example phrases, in the language the user is likely to phrase them in>. It consumes <input artifact/state> and produces <output artifact>. Do NOT use this for <the adjacent thing this skill deliberately does not do — name the other skill that owns it, if any>.
argument-hint: "[<what the first free-text argument means>]"
allowed-tools: <comma-separated tool list this skill actually needs, e.g. Read, Write, Edit, Bash>
---

# <Skill Title>

## What this does

<One paragraph: where this sits in any multi-stage flow it's part of, what
it reads, what it writes, and what it deliberately leaves untouched.>

## Procedure

<Numbered or step-by-step instructions the agent follows. Be concrete about
file paths, commands to run, and exact validation/exit-code contracts —
this section is the skill's actual behavior, not a description of it.>

1. <Step>
2. <Step>

## Failure modes

<For each way the input can be invalid or incomplete: what the skill does
(usually: stop, name the exact problem, point at the upstream skill/step
that should fix it) — no silent best-effort degradation.>

## Output contract

<The exact shape/location of what this skill produces, so the next
consumer (human or skill) can rely on it without re-reading this file.>
