# Assigning the `R-E2E`/`AC-E2E` task

The task backing the spec's mandated `R-E2E`/`AC-E2E` requirement depends on
whether the end-to-end path is **already covered by the union of the
per-requirement `code_writer` tests** or needs a **new integration test
authored**:

- **Covered by composition** — `AC-E2E` only re-runs what the per-task tests
  already exercise (run the whole suite, confirm it's green, no code to write):
  emit that task with `agent_type: "verifier"` (not `terminal_operator`),
  `test_contract: null` same as any other non-`code_writer` role.
- **Requires a new integration test** — `AC-E2E` describes a
  cross-stage/cross-requirement walkthrough that **no per-task test covers**
  (e.g. exec→verify→archive), so the integration test has to be *written*: emit
  a `code_writer` node that authors it (with its `test_contract`), optionally
  followed by a `verifier` node as the final green gate. A `verifier` cannot
  author code, so the verifier-only shape is wrong for this case.

See `assets/agent-roles.md`'s `verifier` and `code_writer` rows.
