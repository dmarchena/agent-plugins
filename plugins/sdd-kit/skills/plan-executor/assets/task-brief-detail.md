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
  descriptions (R2.S2 / AC3). The brief passes the executor those IDs
  plus the deterministic extraction command,
  `node scripts/exec-tools.mjs extract SPECDIR <ID...>`; it
  MUST NOT quote the scenario/AC text verbatim into the brief. The
  executor runs the command itself to get the verbatim text and derives
  the contract from it. If the command exits non-zero naming a missing
  ID, the executor bounces the task as an unresolved ambiguity instead of inventing a contract, rather than resolving it itself.

## The happy-path return contract (§2)

When a task goes green via the TDD cycle, the executor's return
MUST contain exactly: `task_id`, files touched (paths only), test-cmd,
rojo flag, verde flag, and tokens consumed — it MUST NOT include the body of any test or implementation file it created or edited.
When `--rojo fail`, the return also carries a red excerpt: ≤ 3 lines quoting the actual failing assertion, not just a boolean.
This trim applies only to the happy path — a bounced ambiguity or a
`no-red` incidence (below) keeps its full explanatory prose instead of
this compact form.

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
