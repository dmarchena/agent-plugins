# Spec: spec-forensics report composition — delegate to Sonnet + conciseness rule

## Purpose

`spec-forensics`'s judgment layer composes `forensics-analysis.md` inline in
the main session today, reading `spec.md` + `execution_plan.json` +
`forensics.json`. That composition is schema-driven writing backed by a
mechanical validator (`forensics-analysis-validate.mjs`) — a Sonnet-level
task, not one that needs to run in the (more expensive) orchestrator
context. Separately, past runs of this judgment layer have re-explained the
same finding across multiple sections (deterministic §1, then again in
opportunities/bad-practices), which is wasted cost on a durable artifact
that gets re-read in future sessions. This spec covers moving the
composition step to a delegated subagent (with an inline fallback for runs
too small to benefit) and tightening the document's conciseness so each
finding is stated exactly once.

Change type: feat

## Scope

**In scope:**
- Delegating `forensics-analysis.md` composition to a `model: sonnet`
  subagent for a typical run, briefed with the three artifact paths, the
  full document contract, and the compose→validate→correct loop.
- An inline-fallback path for runs too small for delegation to pay off, the
  "small" determination left to the invoking agent's judgment.
- A conciseness rule for `forensics-analysis.md`: one finding = one bullet,
  never re-explained in another section (naming/citing it elsewhere is
  fine), and the deterministic section (§1) holds only figures/anchors.

**Out of scope (non-goals):**
- Changes to `forensics.mjs` or `forensics-analysis-validate.mjs` — the
  deterministic computation and validation logic are unchanged.
- Changes to the `forensics.json` schema/shape.
- Extending this delegation + conciseness pattern to other `sdd-kit`
  skills (`plan-writer`, `verify`, etc.) — this spec covers `spec-forensics`
  only.

## Functional Requirements

### R1 — Delegate forensics-analysis.md composition to a Sonnet subagent, with inline fallback

Depende de: —

The system SHALL delegate composition of `forensics-analysis.md` to a
subagent running `model: sonnet` for a typical run, and SHALL fall back to
composing it inline when the invoking agent judges the run too small for
delegation to pay off.

#### R1.S1 — Happy path: delegate a typical run
- GIVEN a run's `forensics.mjs` has already produced an enriched
  `forensics.json` with several tasks
- WHEN the judgment layer step composes `forensics-analysis.md`
- THEN `SKILL.md` instructs dispatching a subagent with `model: sonnet`,
  briefed with the three artifact paths (`spec.md`, `execution_plan.json`,
  `forensics.json`), the full document contract (deterministic/judgment
  separation, the two anchor figures, the signal-anchoring rule,
  degraded-case handling), and the compose→validate→correct loop (invoke
  `forensics-analysis-validate.mjs`, fix on failure, re-validate until
  `data.ok` is `true`)
- AND the subagent returns only `ok`/path to the orchestrator, not the
  document body

#### R1.S2 — Edge: inline fallback for a small run
- GIVEN a run judged small enough that a subagent's cold start would
  consume the delegation's savings
- WHEN the judgment layer step composes `forensics-analysis.md`
- THEN `SKILL.md` instructs composing the document inline instead of
  delegating, leaving the "small" determination to the invoking agent's
  judgment with no fixed numeric threshold, while requiring the identical
  document contract and compose→validate→correct loop as the delegated
  path

### R2 — Enforce a conciseness rule on forensics-analysis.md

Depende de: —

The system SHALL require that each finding in `forensics-analysis.md`
appears exactly once, as one bullet, in its natural section, and SHALL
restrict the deterministic section to figures and anchors only.

#### R2.S1 — Happy path: one finding, one bullet, cross-referenced not repeated
- GIVEN `forensics-analysis.md` is being composed, whether inline or by the
  delegated subagent
- WHEN a finding is written
- THEN it appears as exactly one bullet in its natural section (an anchor
  figure in the deterministic section, or an opportunity/bad-practice
  bullet in a judgment section)
- AND it is not re-explained in prose in any other section, though other
  sections may cite it by its signal name or figure without repeating the
  explanation

#### R2.S2 — Edge: deterministic section holds no narrative
- GIVEN the deterministic cost-reconstruction section (§1) is being
  composed
- WHEN its content is written
- THEN it contains only figures and anchors (at minimum `Total USD` and
  `Orchestrator share`, per the existing contract) with no narrative or
  explanatory prose
- AND any interpretation of those figures is deferred to the judgment
  sections

### R-E2E — Composing a concise, appropriately-delegated forensics-analysis.md

Depende de: R1, R2

The system SHALL produce, for any completed run, a `forensics-analysis.md`
that both follows the delegation-or-inline decision of R1 and satisfies the
conciseness rule of R2.

#### R-E2E.S1 — Integrative walkthrough
- GIVEN a `plan-executor` run has finished and its `execution_state.json`
  exists for `SPECDIR`
- WHEN `spec-forensics` runs `forensics.mjs` and then reaches the judgment
  layer
- THEN it composes `forensics-analysis.md` either via a Sonnet subagent or
  inline per the R1 decision, the resulting document has each finding in
  exactly one bullet in its natural section with §1 restricted to
  figures/anchors per R2, and it passes `forensics-analysis-validate.mjs`

## Technical Requirements

- **Stack / framework:** N/A — this is a Markdown-only change to
  `SKILL.md`'s instructions text; no application code changes.
- **Integraciones:** N/A
- **Rendimiento:** N/A — R1's point is a cost/token tradeoff, not a latency
  requirement; no measurable performance limit is being set.
- **Seguridad / privacidad:** N/A
- **Datos / almacenamiento:** N/A — `forensics.json`'s schema is unchanged
  (explicit non-goal).
- **Restricciones adicionales:** Must preserve every existing invariant
  already documented in `SKILL.md` (automatic write every run, degraded-case
  handling, signal-anchoring rule, CLI validation entry point) — this change
  adds delegation and conciseness instructions on top, it does not replace
  them.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — content-assertion test on `SKILL.md` asserts it
      documents: dispatching a subagent with `model: sonnet`, a brief
      naming the three artifact paths, the document contract, the
      compose→validate→correct loop, and that the subagent returns only
      `ok`/path
- [ ] AC2 → R1.S2 [auto] — content-assertion test on `SKILL.md` asserts it
      documents an inline-composition fallback for small runs, framed as
      the invoking agent's judgment call (no fixed numeric threshold),
      under the same document contract
- [ ] AC3 → R2.S1 [auto] — content-assertion test on `SKILL.md` asserts the
      "one finding = one bullet, not re-explained in another section"
      rule, and that cross-referencing a finding by name/figure (without
      re-explaining it) is explicitly allowed
- [ ] AC4 → R2.S2 [auto] — content-assertion test on `SKILL.md` asserts the
      deterministic section (§1) is restricted to figures/anchors only,
      with interpretation deferred to judgment sections

## Assumptions & Open Questions

- Assumed: "small run" for the R1.S2 fallback is intentionally left to
  agent judgment rather than a fixed task-count threshold, per the
  interview's answer — if this proves too vague in practice (inconsistent
  delegate/inline choices across runs), a follow-up could introduce a
  numeric threshold.
- Assumed: the new content-assertion test follows the existing
  `spec-forensics-skill-doc.test.mjs` pattern (one test per spec ref,
  substring/regex assertions against `SKILL.md` text) rather than
  introducing a new test style.
- Open: whether AC1-AC4 land in the existing
  `spec-forensics-skill-doc.test.mjs` file or a new one is a
  plan-writer/implementation decision, not fixed by this spec.
