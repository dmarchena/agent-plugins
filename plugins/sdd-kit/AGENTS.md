# spec-writer

An interview-driven skill that turns a rough feature idea into a complete,
testable `spec.md` **before** any planning or coding happens.

## Purpose

Asking "give me your requirements" produces vague, gappy answers. This skill
runs a structured, one-question-at-a-time interview and only then writes a
single well-formed spec. It deliberately **stops at the spec** — it does not
produce an implementation plan, a task breakdown, or code.

The output follows a fixed template (`assets/spec-template.md`): purpose,
scope/non-goals, functional requirements with Given/When/Then scenarios and
stable IDs (`R1`, `R1.S1`), a technical section, and a flat acceptance-criteria
checklist tagged `[auto]`/`[manual]`. Keeping every spec in this shape lets a
later planning or verification step rely on the structure without re-learning it.

## How to use it

- **Trigger:** ask to draft/flesh out a spec — e.g. "ayúdame a definir la spec
  de…", "quiero especificar esta feature", "hazme preguntas hasta sacar los
  requisitos", or any request to nail requirements/acceptance criteria before
  implementing (spec-driven development, avoiding vibe-coding).
- **Optional argument:** a one-line description of the feature.
- **What happens:** the agent interviews you (scope, requirements, edge cases,
  technical constraints, acceptance criteria), calibrating depth **lite** vs
  **full**, then writes `spec.md` and asks you to confirm.
- **Do not use it** for writing plans, architecture decisions, or code.

## Agent compatibility

This plugin is Markdown-only and agent-agnostic. It targets Claude Code's skill
format (`SKILL.md` + `assets/`), but its instructions assume no Claude-specific
runtime beyond a general "coding agent that can ask the user questions and write
files"; the `SKILL.md` body documents the full interview procedure.
