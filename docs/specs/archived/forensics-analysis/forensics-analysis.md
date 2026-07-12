# Forensics analysis — forensics-analysis

> Durable artifact produced by the `spec-forensics` judgment layer over
> `forensics.json` (transcript join + `signals` block). §1 is a deterministic
> cost reconstruction copied/derived from `forensics.json`; §2–§3 are
> interpretation, kept strictly separate, and every finding cites a named
> signal that exists in `forensics.json`. Regenerated 2026-07-12 after fixing
> the multi-session aggregation bug in `forensics.mjs` (aggregates used to
> come from only the first analyzed session); this version reflects the whole
> 2-session run.

## 1. Cost reconstruction (deterministic — from `forensics.json`)

Per-task figures (all five tasks `resolved: true`), sorted by `real ÷ estimated`
descending — the same order as `signals.deviations`:

| Task | Real tokens | Real USD | Est. tokens | Real ÷ est. |
|---|--:|--:|--:|--:|
| t3-skill-judgment-layer | 964,404 | $0.759 | 40,000 | 24.1× |
| t5-e2e-integration | 1,167,815 | $1.255 | 50,000 | 23.4× |
| t1-signals-block | 1,570,469 | $1.677 | 80,000 | 19.6× |
| t2-analysis-validation | 1,660,133 | $1.616 | 90,000 | 18.4× |
| t4-token-diet-analysis | 444,134 | $4.721 | 50,000 | 8.9× |
| **Subagents total** | **5,806,955** | **$10.03** | 310,000 | — |

Whole-run aggregate (both sessions — `subagents_total` equals the per-task sum
above exactly):

| | Real tokens | Real USD |
|---|--:|--:|
| Orchestrator | 9,271,911 | $4.897 |
| Subagents | 5,806,955 | $10.028 |
| **Total** | **15,078,866** | **$14.92** |

**Anchor figures (match `forensics.json` exactly):**

- **Total USD: $14.92** (`orchestrator.real_cost_usd` $4.897 +
  `subagents_total.real_cost_usd` $10.028).
- **Orchestrator share: 32.8%** (`signals.orchestrator_share` = 0.3281).
- **Orchestrator token ratio: 61.5%** (`signals.orchestrator_token_ratio` = 0.6149).
- `signals.per_model`: **claude-sonnet-5** 5,362,821 tok / $5.306 and
  **claude-opus-4-8** 444,134 tok / $4.721.
- `signals.session_count` = **2**; `signals.incidences` = [] — every task's
  join is complete.

## 2. Opportunities (judgment)

- **O1 — Model choice dominates `t4-token-diet-analysis`'s cost.** `per_model`
  shows it is the only task on **claude-opus-4-8**: 7.6% of the subagent tokens
  but 47% of the subagent spend ($4.72, nearly matching the $5.31 of ALL the
  claude-sonnet-5 work combined). It was a compose-against-schema task with a
  mechanical validator behind it — Sonnet-profile work; running it there would
  have cut the run's subagent cost roughly in half.
- **O2 — `orchestrator_token_ratio` (61.5%) marks the orchestrator as the
  token pool to shrink.** The orchestrator re-dragged more tokens
  across the run than all five subagents combined (9.27M vs 5.81M). Cache
  pricing keeps its cost share lower (`orchestrator_share` 32.8%), but thinner
  briefs and earlier `/clear` boundaries between tasks attack the biggest
  token mass directly.
- **O3 — `signals.deviations` tracks session growth, not bad scoping.** Every
  entry is 9–24× its `estimated_tokens` (`t3-skill-judgment-layer` worst at
  24.1×, `t4-token-diet-analysis` least at 8.9×) — consistent with the
  estimator modelling generation only, not context re-read. Treat the ratios
  as a relative baseline, not a scoping failure.

## 3. Bad practices (judgment)

- **B1 — Silent model escalation on `t4-token-diet-analysis`.** Nothing in
  the plan or state records why it ran on claude-opus-4-8 while its four
  siblings ran on claude-sonnet-5 (`per_model` is the only place it surfaces). A model
  choice that multiplies a task's cost ~6× per token should be an explicit,
  recorded decision — default the `Agent` call to the austere model and note
  any escalation in the plan.
