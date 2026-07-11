# Forensics analysis — token-diet

> **Prototype artifact.** Hand-authored as the worked example of what an enhanced
> `spec-forensics` skill should generate automatically (see the tracking issue).
> All figures are taken verbatim from `forensics.json` (transcript join); the
> **judgment** sections (Opportunities, Bad practices) are interpretation, clearly
> separated from the deterministic **Cost reconstruction**.

## 1. Cost reconstruction (deterministic — from `forensics.json`)

| Task | Model | Real tokens | Real USD | Est. tokens | Real ÷ est. |
|---|---|--:|--:|--:|--:|
| rules-doc | sonnet | 566,875 | $0.604 | 50,000 | 11.3× |
| cmd-base | sonnet | 2,447,005 | $1.561 | 90,000 | 27.2× |
| cmd-recommend | sonnet | 789,086 | $0.636 | 50,000 | 15.8× |
| cmd-apply | sonnet | 1,495,451 | $0.981 | 60,000 | 24.9× |
| e2e-verify | haiku | 162,985 | $0.087 | 30,000 | 5.4× |
| semantic-review | opus | 977,878 | $4.688 | 40,000 | 24.4× |
| **Subagents total** | — | **6,439,280** | **$8.558** | 320,000 | 20.1× |
| **Orchestrator** | opus | **16,204,092** | **$51.936** | — | — |
| **Total** | — | **22,643,372** | **$60.49** | — | — |

**Per-model rollup (subagent side):**

| Model | Tasks | Tokens | Share tok | USD | Share $ | $ / 1M tok |
|---|--:|--:|--:|--:|--:|--:|
| sonnet | 4 | 5,298,417 | 82.3% | $3.782 | 44.2% | $0.71 |
| opus | 1 | 977,878 | 15.2% | $4.688 | 54.8% | $4.79 |
| haiku | 1 | 162,985 | 2.5% | $0.087 | 1.0% | $0.54 |

- **Orchestrator share of total cost: 85.9%** ($51.94 of $60.49); its 16.2M tokens
  are **2.5×** all subagent tokens combined.
- **opus costs ≈6.7× sonnet per token** ($4.79 vs $0.71 / 1M) — one opus task is
  more than half the subagent spend on 15% of the subagent tokens.

## 2. Opportunities (judgment)

- **O1 — Orchestrator re-drag is the dominant lever, not model choice.** 86% of the
  cost is the orchestrator, because this run bundled exec + verify + local-install +
  forensics + two issues + the PR into **one long session**: context grows
  monotonically and every tool call re-reads it. The SDD stages are already separate
  skills precisely so they can be split across `/clear` boundaries; doing so here
  would have cut orchestrator cost materially. (Directional — no counterfactual
  measured, so no savings figure claimed.)
- **O2 — Model right-sizing of `semantic-review`.** opus cost $4.69 (7.7% of the whole
  run) to trace three fixtures against a documented rule table. At sonnet's $/token
  that work is ~$0.70 — a ~$4 saving. AC9 is genuine free-text judgment, so opus was
  defensible, but this is the single clearest right-sizing candidate to evaluate.
- **O3 — Plan estimates are not spend forecasts.** Real is 20–27× `estimated_tokens`
  because the estimate models generation only, not context/cache read. Either
  recalibrate the estimator or relabel it explicitly as a relative baseline.

## 3. Bad practices / gaps (judgment)

- **B1 — agentId/sessionId not persisted** → forensics first resolved empty; this
  whole analysis was only recoverable by a manual back-fill. Tracked as a separate
  issue; it is a hard prerequisite for any reliable analysis layer.
- **B2 — Monolithic session** (see O1): running every stage in one thread is the
  concrete behaviour behind the 86% orchestrator share.

## 4. Signals this analysis used

Deterministic (should live in `forensics.mjs`): per-model rollup, orchestrator share,
real÷est deviation per task, `$ / 1M tok` by model, the missing-agentId incidence.
Judgment (skill layer): O1–O3, B1–B2 — each anchored to one of those signals.
