# Plan Executor — full task brief and verify-result detail

Referenced from `SKILL.md` §2 (Execute a task) and §3 (Verify the task).
Full detail on how the test contract is sourced and how each `not-done`
reason should be handled; the main document keeps only the compact
always-needed version.

## Where the test contract comes from (§2)

The contract is never invented by the implementer:

- **Task carries a `test_contract`** (array of `{ref, assertion}` in the
  plan) → the tests must materialize exactly those assertions, one test per
  ref, and cite the `ref` ID in each test's description (R2.S1).
- **Task has no contract** (`test_contract: null`) → the brief instructs
  the executor to **derive** the contract from the `spec.md` scenarios
  referenced by the task's `source_ids` / `satisfies_acs`, and the tests
  **must cite those scenario/AC IDs** (e.g. `R2.S1`, `AC3`) in their
  descriptions (R2.S2 / AC3). Read those scenarios from `SPECDIR/spec.md`
  and quote them into the brief so the executor doesn't re-explore.

## The three `not-done` reasons (§3)

- `reason: "no-red"` (`incidencia: "sin evidencia de rojo"`) — the test
  passed without implementing anything. **Do not** count this as a failed
  attempt or retry blindly: it's flagged for the **user's decision**
  (R2.S3 / AC4). Surface it.
- `reason: "rerun-failed"` — the executor claimed green but the
  orchestrator's re-run failed; `rerun_output` holds the failing output.
- `reason: "not-green"` — the executor itself didn't report green.

For the last two, this counts as a failed attempt → see
`assets/failures-and-resume.md` §5.1 (one retry, then block).
