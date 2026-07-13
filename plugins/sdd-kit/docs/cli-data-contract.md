# sdd-kit CLI data contract

Living field-to-consumer contract for the nine sdd-kit CLIs under
`plugins/sdd-kit/scripts/`. Each `## <cliName>.mjs` section below lists every
field that CLI's stdout `data` payload can emit and names its consumer — a
skill/command/script file path, or the literal marker `unused` when the field
is referenced only by the test suite — plus the baseline token weight of its
payload shape(s) as measured in
`docs/specs/trim-cli-data/measurements.md`.

Source artifacts (do not duplicate by hand — regenerate this doc from them
if they change):
- `docs/specs/trim-cli-data/field-inventory.md` — field → consumer audit (T1).
- `docs/specs/trim-cli-data/measurements.md` — baseline token weights (T2).

## budget-guard.mjs

| Field | Consumer |
|---|---|
| results | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| withinBudget | unused |

Baseline: 158 tokens (payload shape "results", default skills/hwm dirs).

## exec-tools.mjs

### init subcommand

| Field | Consumer |
|---|---|
| plan_id | unused |
| branch | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| branch_created | unused |
| first_batch | unused |
| total_tasks | unused |
| note | unused |

### next subcommand

| Field | Consumer |
|---|---|
| status | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| batch | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| counts | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| note | unused |

Baseline: 52 tokens (payload shape "next").

### complete subcommand (single task)

| Field | Consumer |
|---|---|
| status | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| task_id | unused |
| commit | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| actual_tokens | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| deviation | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| reason | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| incidencia | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| rerun_output | unused |
| error | unused |

### complete subcommand (--batch)

| Field | Consumer |
|---|---|
| status | unused |
| results | unused |

### block subcommand

| Field | Consumer |
|---|---|
| status | unused |

### resume subcommand

| Field | Consumer |
|---|---|
| status | plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md |
| next_batch | plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md |
| counts | unused |
| brokenTask | plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md |
| brokenTest | plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md |

### report subcommand

| Field | Consumer |
|---|---|
| status | unused |
| branch | unused |
| counts | unused |
| tokens | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| per_task | plugins/sdd-kit/skills/plan-executor/SKILL.md |
| acs_satisfechos | unused |
| pause | unused |
| real_cost | plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md |
| real_cost_over_budget | unused |

Baseline: 734 tokens (payload shape "report").

### extract subcommand

| Field | Consumer |
|---|---|
| ids | unused |
| blocks | unused |

Baseline: 318 tokens (payload shape "extract").

Note: `init`, `complete`, `complete --batch`, `block` and `resume` were not
baseline-measured (see measurements.md's "Notes on shape selection") — they
mutate real state, which the T2 baseline task's read-only constraints ruled
out. Only `next`, `report` and `extract` carry a measured baseline above.

## forensics-analysis-validate.mjs

| Field | Consumer |
|---|---|
| ok | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| errors | unused |

Baseline: 15 tokens (payload shape "validate", default).

## forensics.mjs

| Field | Consumer |
|---|---|
| tasks | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| orchestrator | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| subagents_total | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| pause_timeline | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| signals | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| incomplete | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| incomplete_reason | plugins/sdd-kit/skills/spec-forensics/SKILL.md |

### Within `tasks` subdocument

| Field | Consumer |
|---|---|
| resolved | unused |
| real_tokens | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| real_cost_usd | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| estimated_tokens | unused |
| deviation_real | plugins/sdd-kit/skills/spec-forensics/SKILL.md |

### Within `signals` subdocument

| Field | Consumer |
|---|---|
| per_model | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| orchestrator_share | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| orchestrator_token_ratio | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| deviations | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| incidences | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| session_count | plugins/sdd-kit/skills/spec-forensics/SKILL.md |

Baseline: 767 tokens (payload shape "report", default; measured against a
temp-directory copy of the `docs/specs/archived/forensics-analysis` fixture).

## plan-tools.mjs

### inspect-spec subcommand

| Field | Consumer |
|---|---|
| requirements | plugins/sdd-kit/skills/plan-writer/SKILL.md |
| acs | plugins/sdd-kit/skills/plan-writer/SKILL.md |

Baseline: 15 tokens (payload shape "inspect-spec").

### check-plan subcommand

| Field | Consumer |
|---|---|
| tasks | plugins/sdd-kit/skills/plan-writer/SKILL.md |
| message | unused |

Baseline: 24 tokens (payload shape "check-plan").

## token-cost.mjs

| Field | Consumer |
|---|---|
| session | plugins/sdd-kit/skills/spec-forensics/SKILL.md |
| subs | plugins/claude-token-debug/skills/token-cost-debug/SKILL.md |
| orchestrator | plugins/claude-token-debug/skills/token-cost-debug/SKILL.md |
| subTotal | plugins/claude-token-debug/skills/token-cost-debug/SKILL.md |
| orchAll | plugins/claude-token-debug/skills/token-cost-debug/SKILL.md |

Baseline: 441 tokens (payload shape "session report").

## tokenizer.mjs

`tokenizer.mjs` is N/A as a CLI data payload — it is a library module only,
with no CLI entry point and no stdout envelope. Running it directly (`node
plugins/sdd-kit/scripts/tokenizer.mjs`) exits 0 with empty stdout (verified
empirically in `docs/specs/trim-cli-data/measurements.md`). It exports
`estimateTokens()`, consumed directly by `budget-guard.mjs` and by the
measurement tooling itself (used to produce every other baseline figure in
this document). There is no field table for it: it has no `data` payload to
audit.

## verify-tools.mjs

### ground-check subcommand

| Field | Consumer |
|---|---|
| status | unused |
| green | unused |
| drift | unused |

### report subcommand

| Field | Consumer |
|---|---|
| status | plugins/sdd-kit/skills/verify/SKILL.md |
| allGreen | plugins/sdd-kit/skills/verify/SKILL.md |
| acs | plugins/sdd-kit/skills/verify/SKILL.md |
| deviatedTasks | plugins/sdd-kit/skills/verify/SKILL.md |
| real_cost | plugins/sdd-kit/skills/verify/SKILL.md |

Baseline: 726 tokens (payload shape "report", default).

### archive subcommand

| Field | Consumer |
|---|---|
| status | plugins/sdd-kit/skills/verify/assets/archiving-detail.md |
| archived | plugins/sdd-kit/skills/verify/SKILL.md, plugins/sdd-kit/skills/verify/assets/archiving-detail.md |
| destination | plugins/sdd-kit/skills/verify/assets/archiving-detail.md |
| commit | plugins/sdd-kit/skills/verify/assets/archiving-detail.md |
| versioningWarnings | plugins/sdd-kit/skills/verify/assets/versioning-gate-detail.md |
| reason | plugins/sdd-kit/skills/verify/assets/archiving-detail.md |
| notGreenAcs | unused |

## versioning-report.mjs

| Field | Consumer |
|---|---|
| warnings | unused |

Baseline: 9 tokens (payload shape "warnings", default, run against `.`).
