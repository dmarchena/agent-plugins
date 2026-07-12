# Forensics analysis — fixture (degraded)

> Synthetic test fixture (not a real analysis). Join is incomplete: task
> t2-gamma could not be resolved against any transcript.

## 1. Cost reconstruction (deterministic — from forensics.json)

| Task | Real tokens | Real USD | Est. tokens | Real ÷ est. |
|---|--:|--:|--:|--:|
| t1-alpha | 500,000 | $1.50 | 50,000 | 10.0x |
| t2-gamma | **UNRESOLVED** | — | — | 40,000 | — |
| **Subagents total (resolved only)** | **500,000** | **$1.50** | — | — |
| **Orchestrator** | **4,000,000** | **$10.00** | — | — |

Total USD: $11.50
Orchestrator share: 87.0%

**This join is incomplete**: task t2-gamma is unresolved (no agentId/sessionId
match found), so no real figures are reported for it above — only its known
plan estimate (40,000 tokens) is shown.

## 2. Opportunities (judgment)

- **O1** — signal orchestrator_share is 87.0% even with one task unresolved,
  reinforcing that the orchestrator dominates regardless of subagent join gaps.
- **O2** — deviations shows t1-alpha at 10.0x real ÷ estimated tokens, the only
  deviation figure this degraded join can offer.

## 3. Bad practices / gaps (judgment)

- **B1** — t2-gamma appears in incidences (missing agentId/sessionId) and
  remains unresolved — no figures reported, only the join gap itself.

## 4. Signals this analysis used

Deterministic: orchestrator_share, deviations, incidences. Judgment (skill
layer): O1–O2, B1 — each anchored to one of those signals.
