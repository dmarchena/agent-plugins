# Spec Writer — rationale (why the interview, why this format)

Referenced from `SKILL.md`. This is background/design rationale, not a
step-by-step procedure — read it if you want the "why" behind the shape of
the interview or the spec format; it doesn't gate any decision in the flow.

## Why an interview instead of a form

Asking "give me your requirements" produces vague, gappy answers; pushing on
them one question at a time is how real specs get extracted. Keep it cheap —
fast to answer, light on tokens — so it scales to many small features a day.

## Why the standard format is fixed (don't improvise a new one)

The format combines two things on purpose:
- **Requirements + Scenarios** (Given/When/Then, SHALL/MUST/SHOULD language)
  — a behavior contract that's testable, borrowed from how OpenSpec and
  similar spec-driven-development tools structure requirements. Every
  requirement and scenario carries a stable ID (`R1`, `R1.S1`) and each
  requirement states its behavioral dependencies (`Depende de: R2 | —`) —
  later stages reference IDs instead of re-quoting text, and the plan stage
  partitions work from the dependency lines (independent requirements can
  become parallel tasks; dependent ones get sequenced).
- **A flat Acceptance Criteria checklist** — one criterion per scenario,
  referenced by ID (never re-worded: rewording drifts), each tagged
  `[auto]` (mechanically checkable) or `[manual]` (needs human judgment —
  justify why), plus the observable probe to check. This is what a later
  verification step (human or agent) runs to confirm the work is done; the
  feature counts as satisfied when every AC is green, including the
  end-to-end one.

Keeping every spec.md in this same shape is the whole point: any future
planning/implementation/verification step (in this or another project) can
rely on the structure without re-learning it each time.

## Behavior, not implementation

A spec describes observable **behavior**, not implementation. If something
could change (which library, which internal function name, which file) without
changing what the user or system experiences, it belongs in a later design/plan
doc, not here. When in doubt, ask "would this still be true if we rewrote the
whole implementation?" — if yes, it belongs in the spec.

The same altitude rule applies to acceptance criteria: be **exact about the
observable** (the precise output, status code, message, produced artifact)
but **agnostic about the mechanism** — naming the concrete test file or
command is the plan stage's job, as is breaking requirements into task-level
specs with their TDD tests and parallelization. The spec's IDs and dependency
lines exist precisely so the plan can derive those task specs mechanically
instead of re-interviewing the user.
