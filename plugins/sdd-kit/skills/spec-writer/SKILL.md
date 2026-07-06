---
name: spec-writer
description: Use this skill whenever the user wants to draft, flesh out, or "grill me until it's done" a software specification (spec.md) before any planning or coding happens. Trigger on requests like "ayúdame a definir la spec de...", "quiero especificar esta feature", "hazme preguntas hasta sacar los requisitos", "necesito la spec funcional y técnica de X", "vamos a nailar los criterios de aceptación antes de implementar", or any request to turn a rough feature idea into a structured requirements document via an interview instead of writing it themselves. Also use this whenever the user references spec-driven development, OpenSpec-style requirements/scenarios, or wants to avoid vibe-coding by locking down scope first. Do NOT use this for writing implementation plans, task breakdowns, architecture decisions, or code — this skill stops at the finished spec.md artifact.
argument-hint: "[idea de la feature en una línea]"
allowed-tools: AskUserQuestion, Read, Write, Edit
---

# Spec Writer (grill-me interview)

## What this does

Runs a structured interview with the user to progressively fill in a standard
`spec.md` — purpose, scope, functional requirements with testable scenarios,
technical constraints, and acceptance criteria — then writes the finished
file. This is the first stage of a spec → plan → exec → verify workflow; it
deliberately stops at the spec and does not produce a plan or code. See
`assets/rationale.md` for the "why an interview" and "why this exact format"
background.

## Calibrate depth first: lite vs full

Before anything else, decide how much rigor this change actually needs. This
is the single biggest lever for keeping the interview — and its token cost —
proportional to the change. Ask this as the very first options question,
right after hearing the one-liner:

- **Lite** (recommend this by default) — short interview, 1 happy-path +
  1 edge-case scenario per requirement, compact acceptance checklist. Right
  for changes scoped to one component, low-risk, easy to reverse.
- **Full** — deeper interview, more scenarios per requirement (especially
  risky ones), fuller technical section. Reserve this for cross-team
  changes, API/contract changes, data migrations, or anything touching
  security/privacy/compliance.

Recommend Lite unless the one-liner already signals a full-mode trigger
(mentions another team, an external API/contract, a data migration, auth,
or compliance). State which mode you're recommending and why in one line,
let the user confirm or override, then hold that mode for the rest of the
interview — don't re-litigate it per section.

## The standard format (always use this, don't improvise a new one)

Always structure the final output using `assets/spec-template.md` verbatim —
same section headers, same order, every time. Read that file once, right
before you write the final output — don't re-read or re-print it mid
interview, it isn't needed until then.

Every requirement and scenario carries a stable ID (`R1`, `R1.S1`) and each
requirement states `Depende de: R2 | —`. The Acceptance Criteria section is a
flat checklist, one line per scenario, each tagged `[auto]` (mechanically
checkable) or `[manual]` (needs human judgment — justify why), plus the
observable probe to check. See `assets/rationale.md` for why this shape is
fixed across every spec.

A spec describes observable **behavior**, not implementation — if something
could change (which library, which internal function name, which file)
without changing what the user experiences, it belongs in a later
design/plan doc. Acceptance criteria follow the same rule: be **exact about
the observable** but agnostic about the mechanism. See `assets/rationale.md`
for the full reasoning.

## Interview process

Work through these steps in order, but stay conversational — this is an
interview, not a wizard with rigid pages. See `assets/interview-steps.md` for
the full per-step guidance (phrasing, edge cases, how the E2E scenario and
acceptance checklist get assembled); the essentials that must never be
skipped:

1. **Anchor first.** Ask for the one-liner: what is this feature/change, and
   why it needs to exist. Don't move on until it's a real answer.
2. **Calibrate depth** (above).
3. **Scope.** Push for at least one or two explicit non-goals, even if the
   user says "everything's in scope."
4. **Functional requirements, one capability at a time.** Draft `### R<n>`
   with SHALL/MUST/SHOULD language, then `#### R<n>.S<m>` scenarios in
   Given/When/Then form. Every THEN must name a concrete observable — never
   "shows an error" or "works correctly". Before moving on, settle two
   one-liners: does this requirement depend on another (`Depende de:`), and
   how would each scenario be checked mechanically (the `[auto]`/`[manual]`
   probe).
5. **Technical requirements** — only what's relevant; mark the rest N/A.
6. **End-to-end scenario (`R-E2E`), then the acceptance checklist** — one
   line per scenario. Maximize `[auto]`; treat every `[manual]` as a cost
   that needs justifying. Confirm the checklist explicitly with the user.
7. **Assumptions & open questions** — log anything deferred instead of
   silently guessing.
8. **Know when to stop.** Ready when every requirement has a scenario, scope
   is explicit, and there's no unresolved TBD the user cares about. In lite
   mode, don't exceed what lite mode calls for just for thoroughness's sake.

## Interview style

- **Default to multiple choice, with one recommendation.** For any question
  with a finite, guessable set of answers, present 2-4 concrete options,
  mark one recommended, give a one-line reason. Reserve genuinely open
  questions for things that can't be enumerated (the one-liner, exact
  wording, names).
- One question (or one tightly related set) at a time.
- **Reflect back short, and only what changed** — 1-3 bullet lines, not a
  restated wall of text.
- **Don't assemble the spec until the end.** Keep compact running notes
  instead of drafting or printing the full spec.md mid-interview —
  repeatedly regenerating the whole document is the single biggest token
  cost in this skill.
- Default to 1 happy-path + 1 edge case per requirement (lite mode); go
  beyond that only for a requirement the user flags high-risk, or in full
  mode.

See `assets/interview-steps.md` for the full version with phrasing examples.

## Output — where the spec lives

When the interview is complete, read `assets/spec-template.md` and write the
finished file to **`docs/specs/<slug>/spec.md`** (creating the directory,
`<slug>` a kebab-case slug from the feature name) — the shared home for the
whole chain: `plan-writer` later drops its `execution_plan.json` alongside.
This should be the first and only time the full document gets written out;
show the user the finished spec and ask if anything needs adjusting.

Two constraints on the written file: it must be **self-contained** — a
verification agent with no access to this interview must be able to run
the acceptance checklist from the file alone — and in lite mode it
should stay lean (~120 lines as a guide): the spec is itself context that
every later plan/verify session will carry.
