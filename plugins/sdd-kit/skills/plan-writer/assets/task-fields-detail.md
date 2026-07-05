# Plan Writer — full per-task field reference

Referenced from `SKILL.md` §"Output contract, test contract, and token
budget per task". Full detail on the exact shape of the less-frequently
re-derived fields; the main document keeps only the load-bearing rules.

## Output contract per task

Every task needs:

- `expected_output_schema` — a non-empty string describing the exact
  artifact or format the task produces (not just "the code" — be specific
  enough that the executor and a later verifier can both recognize done).
- `satisfies_acs` — an array with at least one `AC<n>` from the spec that
  this task's output satisfies.

## Test contract per task

Every task also needs a `test_contract` field — the external source of truth
the exec stage's TDD executor materializes its tests from, which is what
makes a per-task review subagent unnecessary:

- **`agent_type: code_writer` tasks** — a non-empty array of cases, each
  `{ ref, assertion }`:
  - `ref` — an existing ID from the source spec (`R<n>.S<m>` or `AC<n>`)
    that this task derives from; it must match one of the spec's real IDs,
    never an invented one.
  - `assertion` — an observable assertion in prose: what should be
    checkable, not how to check it. Same rule as `instructions`: reference
    spec IDs, never copy the spec's text verbatim. Code and test-file names
    are forbidden in `assertion`.
- **Any other `agent_type`** — `test_contract: null`.

Derive the cases from the scenarios (`R<n>.S<m>`) and ACs the task already
lists in `satisfies_acs` — don't invent cases unrelated to what the task
covers.

## Token budget estimate

Give every task an `estimated_tokens` integer, and the plan an
`estimated_tokens_total`. Set `confidence: "low"` on the plan — this is a
baseline for measuring deviation later, not a commitment. Set
`actual_tokens` and `deviation` to `null` on every task and leave them
there: the plan is immutable once the exec stage starts, so these fields
never get filled in on the plan itself. Real token consumption and
deviation are recorded separately, in the exec stage's
`execution_state.json` — not in this plan.
