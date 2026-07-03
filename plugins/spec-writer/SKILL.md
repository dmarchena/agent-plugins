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
deliberately stops at the spec and does not produce a plan or code.

## Why an interview instead of a form

Asking "give me your requirements" produces vague, gappy answers; pushing on
them one question at a time is how real specs get extracted. Keep it cheap —
fast to answer, light on tokens — so it scales to many small features a day.

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

## Interview process

Work through these steps in order, but stay conversational — this is an
interview, not a wizard with rigid pages.

1. **Anchor first.** Ask for the one-liner: what is this feature/change, and
   why does it need to exist (the problem, the user, or the driver behind
   it). This is genuinely open-ended — there's nothing sensible to offer as
   multiple choice yet. Don't move on until this is a real answer, not just
   a title.

2. **Calibrate depth.** Run the lite/full check above.

3. **Scope next.** Ask what's *out* of scope / non-goals, framed as options
   when you can already guess likely exclusions from the one-liner (see
   "Ask with options" below). This step is the one people skip and it's the
   biggest source of rework later — push for at least one or two explicit
   exclusions, even if the user says "everything's in scope."

4. **Functional requirements, one capability at a time.** For each distinct
   capability the user mentions, draft a requirement (`### R<n> — <name>`)
   with SHALL/MUST/SHOULD language, then get the happy path and (in lite
   mode) one edge case or failure mode — offer your best guess at the likely
   edge case as the recommended option rather than asking "what edge cases
   matter?" cold. Convert each into a `#### R<n>.S<m>` scenario in
   Given/When/Then form. Every THEN must name a concrete observable — exact
   message, status code, produced artifact, queryable state — never "shows
   an error" or "works correctly". If an answer is vague ("it should just
   work"), don't accept it — force specifics via options: e.g. "if it fails,
   should it (A, recommended) show an inline error and let them retry, or
   (B) silently roll back?". Before moving on, settle two one-liners
   (as options where guessable): does this requirement depend on another
   (`Depende de:`), and how would each scenario be checked mechanically —
   that answer becomes the `[auto]` probe in the acceptance criteria, or
   `[manual]` with a stated reason if it genuinely can't be automated.

5. **Technical requirements.** Ask about stack/framework, integrations,
   performance, security/privacy, data/storage — but only what's actually
   relevant to this change, and only in as much depth as lite/full calls
   for. Mark a field "N/A" rather than inventing content just to fill the
   section. If the user indicates there are no special constraints at all,
   mark every remaining technical field N/A in one pass instead of asking
   about each field individually.

6. **End-to-end scenario, then acceptance criteria.** Once the functional
   requirements feel solid, draft one integrative scenario (`R-E2E`) that
   walks the whole feature end to end — per-requirement checks can all pass
   while the composition fails, so this is what decides "feature complete".
   Then assemble the acceptance checklist: one line per scenario,
   `- [ ] AC<n> → R<x>.S<y> [auto|manual] — <observable probe>`, reusing
   the probes gathered in step 4 instead of re-asking. Maximize `[auto]`;
   treat every `[manual]` as a cost that needs justifying. Confirm the
   checklist explicitly with the user — this is what "done" will mean once
   someone (or some agent) checks the work later.

7. **Assumptions & open questions.** Anything the user is unsure about or
   wants to defer, log it explicitly instead of silently guessing on their
   behalf. Offer "resolve now" vs "flag for later" as the options here too.

8. **Know when to stop.** The spec is ready when every requirement has at
   least one scenario, scope/non-goals are explicit, and there's no
   unresolved TBD the user actually cares about. In lite mode, don't exceed
   what lite mode calls for just for thoroughness's sake. Summarize what you
   have and confirm completeness before writing the file.

## Interview style

- **Default to multiple choice, with one recommendation.** For any question
  with a finite, guessable set of reasonable answers — scope boundaries,
  tech choices, priority tradeoffs, which edge case matters most, what an
  error should do — present 2-4 concrete options instead of an open
  question, mark one as recommended, and give a one-line reason tied to
  what you already know about this feature. This is faster for the user to
  answer than free text, keeps the transcript unambiguous, and avoids
  burning turns on back-and-forth clarification. If the environment
  provides a structured multiple-choice question tool, use it; otherwise
  present compact lettered options in plain text (A/B/C, recommended one
  marked) and let the user just reply with a letter, "recomendada", or
  their own alternative.
- Reserve genuinely open questions for things that can't be enumerated: the
  initial one-liner, exact wording of messages, specific data shapes,
  names.
- One question (or one set of tightly related options) at a time — don't
  dump an unrelated multi-part questionnaire in a single message.
- When an answer is vague, drill down with a concrete follow-up (ideally
  itself framed as options) instead of accepting it and moving on.
- **Reflect back short, and only what changed.** After closing out a
  requirement or section, confirm it in 1-3 short bullet lines, not a
  restated wall of text — the user already knows what they just told you.
- **Don't assemble the spec until the end.** Keep your own compact running
  notes (a short list of confirmed requirements/decisions) instead of
  drafting or printing the full spec.md mid-interview. Repeatedly
  regenerating the whole document is the single biggest token cost in this
  skill and adds nothing until the interview is actually done.
- Default to 1 happy-path scenario + 1 edge case per requirement (lite
  mode). Only go beyond that for a requirement the user flags as high-risk
  (payments, auth, data loss, irreversible actions) or when running in full
  mode.

## Output

When the interview is complete, read `assets/spec-template.md` and write the
final file as `spec.md` (or `<feature-slug>-spec.md` if the user is managing
several specs in the same place) following that template's structure
exactly — this should be the first and only time the full document gets
written out. Show the user the finished spec and ask if anything needs
adjusting before treating it as final.

Two constraints on the written file: it must be **self-contained** — a
verification agent with no access to this interview must be able to run the
acceptance checklist from the file alone (no "as discussed", no references
to the conversation) — and in lite mode it should stay lean (~120 lines as
a guide): the spec is itself context that every later plan/verify session
will carry.
