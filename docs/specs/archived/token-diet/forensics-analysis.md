# Forensics analysis — token-diet

> Durable artifact produced by the `spec-forensics` judgment layer over the
> regenerated `forensics.json` (transcript join + `signals` block). §1 is a
> deterministic cost reconstruction copied/derived from `forensics.json`; the
> judgment sections (§2, §3) are interpretation and are kept strictly separate
> from it. Every judgment finding cites a named signal that exists in
> `forensics.json`.

## 1. Cost reconstruction (deterministic — from `forensics.json`)

| Task | Model | Real tokens | Real USD | Est. tokens | Real ÷ est. |
|---|---|--:|--:|--:|--:|
| rules-doc | claude-sonnet-5 | 566,875 | $0.604 | 50,000 | 11.3× |
| cmd-base | claude-sonnet-5 | 2,447,005 | $1.561 | 90,000 | 27.2× |
| cmd-recommend | claude-sonnet-5 | 789,086 | $0.636 | 50,000 | 15.8× |
| cmd-apply | claude-sonnet-5 | 1,495,451 | $0.981 | 60,000 | 24.9× |
| e2e-verify | claude-haiku-4-5 | 162,985 | $0.087 | 30,000 | 5.4× |
| semantic-review | claude-opus-4-8 | 977,878 | $4.688 | 40,000 | 24.4× |
| **Subagents total** | — | **6,439,280** | **$8.558** | 320,000 | 20.1× |
| **Orchestrator** | claude-opus-4-8 | **26,591,642** | **$83.190** | — | — |
| **Total** | — | **33,030,922** | **$91.75** | — | — |

**Per-model rollup (`signals.per_model`, subagent side only):**

| Model | Tasks | Tokens | Share tok | USD | Share $ | $ / 1M tok |
|---|--:|--:|--:|--:|--:|--:|
| claude-sonnet-5 | 4 | 5,298,417 | 82.3% | $3.782 | 44.2% | $0.71 |
| claude-opus-4-8 | 1 | 977,878 | 15.2% | $4.688 | 54.8% | $4.79 |
| claude-haiku-4-5 | 1 | 162,985 | 2.5% | $0.087 | 1.0% | $0.54 |

**Anchor figures (must match `forensics.json` exactly):**

- **Total USD: $91.75** (`orchestrator.real_cost_usd` $83.190 + `subagents_total.real_cost_usd` $8.558).
- **Orchestrator share: 90.7%** (`signals.orchestrator_share` = 0.9067).
- **Orchestrator token ratio: 80.5%** (`signals.orchestrator_token_ratio` = 0.8050) — the orchestrator alone
  holds 26.6M of the 33.0M total tokens, i.e. **4.1×** all subagent tokens combined.
- `signals.session_count` = 1; `signals.incidences` = [] (no automatic incidences flagged);
  all six tasks `resolved: true` — the join is complete.

## 2. Opportunities (judgment)

- **O1 — `orchestrator_share` is the dominant lever, and it grew.** At **90.7%**
  (`orchestrator_share` = 0.9067) the orchestrator is now nearly the entire run;
  the earlier hand-authored prototype recorded 85.9% on a $60 run, and the same
  monolithic session has since climbed to $83.19 orchestrator / $91.75 total.
  Subagent spend never moved ($8.558) — the whole $31 increase is re-dragged
  orchestrator context. Splitting exec / verify / install / forensics / PR across
  `/clear` boundaries is the concrete fix; the SDD stages are already separate
  skills to make that possible. (Directional — no counterfactual measured.)
- **O2 — Right-size `semantic-review`.** The `semantic-review` task ran on
  `claude-opus-4-8` for $4.688 — 54.8% of all subagent cost on 15% of subagent
  tokens. The work was tracing three fixtures against a documented rule table;
  at sonnet's rate that is ≈$0.70, a ~$4 saving. AC9 is genuine free-text
  judgment so opus was defensible, but this is the single clearest downgrade
  candidate to re-evaluate.
- **O3 — Treat `deviations` as a re-drag signal, not a generation estimate.**
  Every entry in `signals.deviations` is 5–27× its `estimated_tokens`, with
  `cmd-base` worst at 27.2×. The estimator models generation only, not the
  context/cache re-read that dominates a long session — so the deviations track
  session growth, not bad task scoping. Either recalibrate or relabel the
  estimate as a relative baseline.

## 3. Bad practices / gaps (judgment)

- **B1 — Monolithic single session (`orchestrator_token_ratio` = 0.805).** The
  orchestrator carrying 80.5% of all tokens (`orchestrator_token_ratio`) is the
  mechanical footprint of running every stage in one ever-growing thread; it is
  the same behaviour behind O1 and the reason total cost kept rising after the
  work itself was done.
- **B2 — Cost concentration on the priciest model (`per_model`).** In
  `signals.per_model`, `claude-opus-4-8` is $4.79 / 1M tok vs `claude-sonnet-5`
  at $0.71 / 1M — ~6.7× — so a single opus task carries more than half the
  subagent cost. Any opus task that isn't strictly judgment work is
  disproportionately expensive here.
- **B3 — No automatic guardrail fired despite the 90.7% share.** `session_count`
  is 1 and `signals.incidences` is empty: nothing in the pipeline flagged a run
  that is 90.7% orchestrator. The share is high enough that an `incidences`-style
  threshold (e.g. flag when `orchestrator_share` exceeds a bound) would have
  surfaced it without manual review.

## 4. Signals this analysis used

- Deterministic (from `forensics.mjs`): `per_model` rollup, `orchestrator_share`,
  `orchestrator_token_ratio`, per-task `deviations` (real ÷ est), `session_count`,
  `incidences` (empty).
- Judgment (this skill layer): O1–O3 and B1–B3, each anchored to one of the
  signals above by name.
