# Forensics analysis — fixture (complete)

> Synthetic test fixture (not a real analysis). Mirrors the shape of
> `docs/specs/archived/token-diet/forensics-analysis.md`.

## 1. Cost reconstruction (deterministic — from forensics.json)

| Task | Real tokens | Real USD | Est. tokens | Real ÷ est. |
|---|--:|--:|--:|--:|
| t1-alpha | 500,000 | $1.50 | 50,000 | 10.0x |
| t2-beta | 300,000 | $0.50 | 40,000 | 7.5x |
| **Subagents total** | **800,000** | **$2.00** | 90,000 | 8.9x |
| **Orchestrator** | **4,000,000** | **$10.00** | — | — |

Total USD: $12.00
Orchestrator share: 83.3%

## 2. Opportunities (judgment)

- **O1** — signal orchestrator_share is 83.3%, meaning the orchestrator dominates
  total cost; splitting the session across `/clear` boundaries is the largest lever.
- **O2** — per_model shows sonnet accounts for all subagent spend; no model
  right-sizing opportunity exists in this run since only one model was used.

## 3. Bad practices / gaps (judgment)

- **B1** — deviations shows t1-alpha at 10.0x real ÷ estimated tokens, the worst
  deviation of this run; the plan's estimate for t1-alpha badly under-forecasts
  real spend.
- **B2** — t2-beta also deviates 7.5x, reinforcing that estimated_tokens is not a
  reliable spend forecast for this run's tasks.

## 4. Signals this analysis used

Deterministic: per_model, orchestrator_share, orchestrator_token_ratio, deviations.
Judgment (skill layer): O1–O2, B1–B2 — each anchored to one of those signals.
