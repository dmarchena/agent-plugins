# Design rationale — the standards behind sdd-kit's artifacts

sdd-kit's pipeline is only as reliable as the artifacts it hands between
stages. None of their formats is accidental: each one borrows an established
standard where one exists, and each choice of *medium* (Markdown vs JSON)
follows from who consumes the artifact — a human reviewer or a machine.
This document records those choices and their reasons.

## The core principle: match the medium to the consumer

| Artifact | Primary consumer | Medium | Validated by |
|----------|------------------|--------|--------------|
| `spec.md` | humans (review, PR diff) | Markdown | `plan-tools.mjs inspect-spec` (structure) |
| `execution_plan.json` | machines (orchestrator, validator) | JSON | JSON Schema + `plan-tools.mjs check-plan` |
| `execution_state.json` | machines (resume, forensics) | JSON | JSON Schema + `exec-tools.mjs` |

A spec is an agreement between people — it must be readable, diffable and
reviewable in a PR, so it is prose with enforced structure. A plan is an
instruction stream for an orchestrator — it must be parseable and provable,
so it is data. Blurring that line (a prose plan, a JSON spec) would sacrifice
exactly the property each stage depends on.

## `spec.md` — prose with enforced structure

The spec format deliberately combines several established practices rather
than inventing its own:

- **RFC 2119-style normative keywords** — every requirement is a single
  "The system SHALL/MUST/SHOULD …" sentence, which forces one observable
  behavior per requirement and makes vagueness ("handles errors gracefully")
  stick out during the interview.
- **Gherkin-style Given/When/Then scenarios (BDD)** — each requirement
  carries at least a happy path and, where applicable, an edge/error case,
  written as GIVEN/WHEN/THEN with **concrete observables** (the exact
  message, status code, produced artifact — never "it works" or "shows an
  error"). This is the shape OpenSpec and similar spec-driven-development
  tools use for requirements, and it is what makes a scenario mechanically
  checkable later.
- **A flat Acceptance Criteria checklist** — one criterion per scenario,
  each tagged `[auto]` (mechanically checkable) or `[manual]` (needs human
  judgment, with a justification) plus the observable probe to run. This is
  the exact list the `verify` stage walks to decide completion.
- **The spec-kit / Kiro directory convention** — one `docs/specs/<slug>/`
  directory per feature holding the whole chain's artifacts, as GitHub's
  spec-kit and AWS Kiro do; the full trade-off analysis is
  [ADR 0001](adr/0001-artifact-location.md).

Two rules of the format do the heavy anti-drift lifting:

- **Stable IDs, never re-quoted prose.** Every requirement (`R<n>`),
  scenario (`R<n>.S<m>`) and acceptance criterion (`AC<n>`) has an ID, and
  every later stage references the ID instead of paraphrasing the text —
  because paraphrase is where an LLM quietly rewrites a requirement into
  something adjacent but different. An ID either resolves or it doesn't.
- **Behavior, not implementation.** If something could change (a library, a
  function name, a file) without changing what the user observes, it does
  not belong in the spec. The litmus test: "would this still be true if we
  rewrote the whole implementation?" This keeps the spec durable and leaves
  mechanism decisions to the plan, where they belong.

Requirements also carry an explicit dependency line (`Depende de: R2 | —`)
stating *behavioral* dependencies. That single line is what lets the plan
stage partition independent requirements into parallel tasks and sequence
dependent ones — mechanically, without re-interviewing anyone.

## `execution_plan.json` — data, because plans get executed, not read

The plan is JSON, validated against a published
**[JSON Schema (draft 2020-12)](../skills/plan-writer/assets/execution_plan.schema.json)**,
and the reason is worth stating plainly:

**A constrained, schema-validated format turns LLM hallucination from a
silent failure into a hard, mechanical rejection.** An LLM writing a plan as
free prose can invent a task, drop a requirement, rename a dependency or
drift a detail, and nothing downstream will notice until execution goes
wrong. The same LLM writing JSON against a schema with
`additionalProperties: false` and per-field `required` lists cannot: an
invented field, a missing one, a wrong type or a malformed ID fails
`check-plan` **before a single task runs**. The format does not make the
model hallucinate less — it makes hallucination *detectable and
non-executable*, which is the property that actually matters.

The schema encodes the plan's guarantees as data, not prose conventions:

- **Traceability is a field, not a promise.** Every task declares the spec
  IDs it derives from (`source_ids`) and the acceptance criteria it
  satisfies (`satisfies_acs`), and a top-level `coverage` map inverts that
  (requirement → covering tasks, AC → covering tasks). The validator proves
  every `R<n>` and `AC<n>` is covered by at least one task — an incomplete
  plan is rejected, not discovered at verify time.
- **The DAG is explicit.** The plan's tasks form a *directed acyclic graph*
  (DAG): each task is a node, each `dependencies` entry is an arrow
  ("task B needs task A's output first"), and no chain of arrows may loop
  back on itself. That acyclicity is not pedantry — it is what guarantees a
  valid execution order always exists (task A before B before C), and it is
  what reveals parallelism for free: tasks with no path between them can
  safely run at the same time on different subagents. The validator rejects
  cycles, and the executor derives runnable order topologically instead of
  trusting a narrated sequence.
- **Staffing is data.** Each task carries `agent_type`, `subagent` and
  `model`, drawn from a
  [published catalog](../skills/plan-writer/assets/agent-roles.md) with a
  written `justification` — so "which model runs what, and why" is auditable
  per task, not a vibe.
- **Tests are part of the contract.** Every code-writing task must ship a
  non-empty `test_contract`: `{ref, assertion}` pairs binding a spec ID to
  the observable assertion its test must check. The exec stage's TDD loop
  (red → green) starts from that contract, so tests trace to the spec by
  construction.
- **Instructions are self-contained.** A task's `instructions` field must be
  executable by a cold-started subagent with no access to the planning
  conversation — the plan file *is* the handoff, which is also what makes
  runs resumable and sessions disposable.
- **Cost is estimated up front.** Per-task `estimated_tokens` (calibrated
  against snapshots of previously executed plans) plus `actual_tokens` /
  `deviation` slots that the exec and forensics stages fill in — the
  estimate/reality loop is built into the artifact.

`execution_state.json` follows the same logic for the exec journal: a
[schema-validated](../skills/plan-executor/assets/execution_state.schema.json)
record of per-task status, commits and agent ids, appended as tasks complete
— which is what makes pausing, resuming and forensic cost auditing possible
at all. It even refuses convenience over integrity: completing a delegated
task without its agent id is rejected unless the gap is explicitly
acknowledged, because a hole in the journal silently corrupts the later
cost report.

## One envelope for every CLI

All the deterministic scripts print a single canonical envelope on stdout —
`{ ok: true, data: … }` / `{ ok: false, error: … }` — with a
[living field-to-consumer contract](cli-data-contract.md) documenting every
emitted field and who reads it. Two effects: any stage (or external tooling)
can consume any other stage mechanically, and fields nobody consumes get
identified and trimmed instead of taxing every invocation's context.

## Process standards

The pipeline leans on the same public conventions the surrounding repo uses,
so its output looks like normal engineering, not agent exhaust:

- **TDD (red → green)** per task, seeded from the task's `test_contract`.
- **[Conventional Commits](https://www.conventionalcommits.org/)**, one
  commit per completed task on the plan's own branch — git, not the
  conversation, is the handoff between stages and sessions.
- **[Semantic Versioning](https://semver.org/)** +
  **[Keep a Changelog](https://keepachangelog.com/)** for the plugin itself.
- **Architecture Decision Records** for structural choices
  ([`docs/adr/`](adr/)).

## Prior art, in one table

| Standard / tool | Where sdd-kit uses it |
|-----------------|------------------------|
| RFC 2119 keywords | requirement sentences in `spec.md` |
| Gherkin / BDD | Given/When/Then scenarios |
| OpenSpec | requirement + scenario + ID structure |
| GitHub spec-kit, AWS Kiro | per-feature `specs/<slug>/` bundle (ADR 0001) |
| JSON Schema draft 2020-12 | `execution_plan.json`, `execution_state.json` |
| DAG / topological ordering | task dependencies and parallelization |
| TDD | per-task red → green loop in exec |
| Conventional Commits | per-task commits |
| SemVer + Keep a Changelog | plugin versioning |
| ADR (Nygard) | recorded design decisions |
