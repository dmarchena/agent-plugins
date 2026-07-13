# Forensics analysis: markvault

## Deterministic cost reconstruction

The join is **incomplete** (`incomplete: true`, `incomplete_reason: "no
agentId recorded for any task"`) — none of the 8 tasks in
`execution_plan.json` have a resolvable `agentId`/`sessionId`, so no real
cost figures exist for this run. The figures below are the forensics-tool
output as-is, not a measurement of actual zero cost.

- Total USD: $0 (`orchestrator.real_cost_usd` $0 + `subagents_total.real_cost_usd` $0 — both zero because nothing resolved, not because the run was free)
- Orchestrator share: N/A (`signals.orchestrator_share` is `null`)

| task_id | resolved | real_tokens | real_cost_usd | estimated_tokens |
|---|---|---|---|---|
| barrier-red-guard | unresolved | — | — | 60000 |
| strategy-interface | unresolved | — | — | 90000 |
| cli-extract | unresolved | — | — | 95000 |
| fallback-chain | unresolved | — | — | 70000 |
| barrier-privacy-wiring | unresolved | — | — | 55000 |
| skill-file | unresolved | — | — | 40000 |
| benchmark-harness | unresolved | — | — | 100000 |
| e2e-integration | unresolved | — | — | 70000 |

`signals.per_model` is empty and `signals.session_count` is 0 — no session
transcript was joined for any task.

## Judgment

**Bad practices**

- Every task_id in `signals.incidences` (`barrier-red-guard`,
  `strategy-interface`, `cli-extract`, `fallback-chain`,
  `barrier-privacy-wiring`, `skill-file`, `benchmark-harness`,
  `e2e-integration`) carries the reason "missing agentId or sessionId" —
  `execution_state.json` never persisted either field for this run, which
  is why `incomplete`/`incomplete_reason` above is `true` and real-cost
  reconstruction is unusable for the whole spec, not just one task.

**Opportunities**

- None anchored: `signals.deviations` and `signals.per_model` are both
  empty, so there is no real-vs-estimated comparison or model-mix data to
  draw an opportunity from — see the incomplete-join finding above for the
  root cause.
