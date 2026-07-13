# Forensics Analysis: token-diet-rules-1-3-0

## Deterministic Cost Reconstruction

- Total USD: $24.91854835 (orchestrator.real_cost_usd 16.361803350000002 + subagents_total.real_cost_usd 8.556744999999994)
- Orchestrator share: 65.66%
- signals.orchestrator_share (raw): 0.6566114173340281
- signals.orchestrator_token_ratio: 0.7125830671239272
- signals.session_count: 1
- signals.incidences: empty (no entries)
- pause_timeline: empty (no entries)

### Per-task figures (all 6 tasks, all resolved: true)

| task_id | real_tokens | real_cost_usd | estimated_tokens | deviation_real |
|---|---|---|---|---|
| t1-rename-rules-doc | 4,497,827 | 0.5635145599999998 | 15,000 | 4,482,827 |
| t2-extend-base-block | 1,415,860 | 1.2041062500000002 | 25,000 | 1,390,860 |
| t3-add-detail-section | 1,004,080 | 0.7106260499999999 | 28,000 | 976,080 |
| t4-version-bump | 1,830,433 | 0.31958148000000003 | 20,000 | 1,810,433 |
| t5-update-tests | 6,685,248 | 5.581220699999994 | 45,000 | 6,640,248 |
| t6-e2e-consistency | 949,746 | 0.17769596 | 18,000 | 931,746 |

### Orchestrator vs subagents_total

| | real_tokens | real_cost_usd |
|---|---|---|
| orchestrator | 40,618,298 | 16.361803350000002 |
| subagents_total | 16,383,194 | 8.556744999999994 |

### signals.per_model

| model | tokens | cost |
|---|---|---|
| claude-haiku-4-5-20251001 | 7,278,006 | 1.0607919999999997 |
| claude-sonnet-5 | 9,105,188 | 7.495952999999994 |

### signals.deviations (sorted descending by ratio)

| task_id | real_tokens | estimated_tokens | ratio |
|---|---|---|---|
| t1-rename-rules-doc | 4,497,827 | 15,000 | 299.85513333333336 |
| t5-update-tests | 6,685,248 | 45,000 | 148.56106666666668 |
| t4-version-bump | 1,830,433 | 20,000 | 91.52165 |
| t2-extend-base-block | 1,415,860 | 25,000 | 56.6344 |
| t6-e2e-consistency | 949,746 | 18,000 | 52.763666666666666 |
| t3-add-detail-section | 1,004,080 | 28,000 | 35.86 |

## Judgment: Opportunities

- Per `signals.per_model`, `claude-sonnet-5` carried only ~1.25x the tokens of `claude-haiku-4-5-20251001` (9,105,188 vs 7,278,006) but ~7.07x the cost (7.495952999999994 vs 1.0607919999999997) — the two sonnet-pinned doc_writer tasks, `t2-extend-base-block` and `t3-add-detail-section`, authored schematic Markdown against a fixed line/entry-count schema and are candidates for a cheaper model on a future run.
- `t6-e2e-consistency` is a haiku verifier task that writes no code or content, yet per `signals.deviations` it still deviated 52.763666666666666x from its estimate — read-only/verification tasks may need a structurally higher estimation baseline, not just a per-task nudge.

## Judgment: Bad practices

- `orchestrator_share` is 65.66%, meaning the orchestrator did roughly two-thirds of the run's total token/cost work versus the delegated `subagents_total` — more raw orchestrator work than delegated subagent work, the inverse of what delegation is meant to achieve.
- `signals.deviations` shows all 6 tasks deviated between 35.86x and 299.85513333333336x from their `estimated_tokens` — a systemic plan-writer estimation problem across the whole plan, not one bad estimate on an isolated task.
- `t5-update-tests` is both the single most expensive task (real_cost_usd 5.581220699999994) and carries the second-highest ratio in `signals.deviations` (148.56106666666668x) — the single biggest cost driver of this run, worth flagging for tighter test-task estimation specifically.
