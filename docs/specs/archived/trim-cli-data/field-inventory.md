# Field-consumer inventory — trim-cli-data (T1)

Refs: R1.S1, R1.S2 (`docs/specs/trim-cli-data/spec.md`).

Read-only audit of every field each sdd-kit CLI's stdout `data` payload can
emit, and its consumer(s). Per R1.S2, a field referenced only by the test
suite is classified `unused`. This is an intermediate working artifact
feeding `T3_contract_doc` (which writes the actual living contract at
`plugins/sdd-kit/docs/cli-data-contract.md`); it is not itself a spec
deliverable.

## budget-guard.mjs

`results -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`withinBudget -> unused`

## exec-tools.mjs (init subcommand)

`plan_id -> unused`
`branch -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`branch_created -> unused`
`first_batch -> unused`
`total_tasks -> unused`
`note -> unused`

## exec-tools.mjs (next subcommand)

`status -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`batch -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`counts -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`note -> unused`

## exec-tools.mjs (complete single-task subcommand)

`status -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`task_id -> unused`
`commit -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`actual_tokens -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`deviation -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`reason -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`incidencia -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`rerun_output -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`
`error -> unused`

## exec-tools.mjs (complete --batch subcommand)

`status -> plugins/sdd-kit/skills/plan-executor/assets/task-brief-detail.md`
`results -> plugins/sdd-kit/skills/plan-executor/assets/task-brief-detail.md`

## exec-tools.mjs (block subcommand)

`status -> unused`

## exec-tools.mjs (resume subcommand)

`status -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`
`next_batch -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`
`counts -> unused`
`brokenTask -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`
`brokenTest -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`

## exec-tools.mjs (report subcommand)

`status -> unused`
`branch -> unused`
`counts -> unused`
`tokens -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`per_task -> plugins/sdd-kit/skills/plan-executor/SKILL.md`
`acs_satisfechos -> unused`
`pause -> unused`
`real_cost -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`
`real_cost_over_budget -> plugins/sdd-kit/skills/plan-executor/assets/failures-and-resume.md`

## exec-tools.mjs (extract subcommand)

`ids -> unused`
`blocks -> plugins/sdd-kit/skills/plan-executor/assets/task-brief-detail.md`

## forensics-analysis-validate.mjs

`ok -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`errors -> unused`

## forensics.mjs

`tasks -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`orchestrator -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`subagents_total -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`pause_timeline -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`signals -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`incomplete -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`incomplete_reason -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`

Within `tasks` subdocument:
`resolved -> unused`
`real_tokens -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`real_cost_usd -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`estimated_tokens -> unused`
`deviation_real -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`

Within `signals` subdocument:
`per_model -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`orchestrator_share -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`orchestrator_token_ratio -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`deviations -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`incidences -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`session_count -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`

## plan-tools.mjs (inspect-spec subcommand)

`requirements -> plugins/sdd-kit/skills/plan-writer/SKILL.md`
`acs -> plugins/sdd-kit/skills/plan-writer/SKILL.md`

## plan-tools.mjs (check-plan subcommand)

`tasks -> plugins/sdd-kit/skills/plan-writer/SKILL.md`
`message -> unused`

## token-cost.mjs

`session -> plugins/sdd-kit/skills/spec-forensics/SKILL.md`
`subs -> plugins/claude-token-debug/skills/token-cost-debug/SKILL.md`
`orchestrator -> plugins/claude-token-debug/skills/token-cost-debug/SKILL.md`
`subTotal -> plugins/claude-token-debug/skills/token-cost-debug/SKILL.md`
`orchAll -> plugins/claude-token-debug/skills/token-cost-debug/SKILL.md`

## tokenizer.mjs

No CLI entry point — library module only, not itself an envelope-emitting
CLI (confirmed empirically by T2_baseline_measurements: `node
plugins/sdd-kit/scripts/tokenizer.mjs` exits 0 with empty stdout). It
exports `estimateTokens()`, consumed directly by `budget-guard.mjs` and by
the measurement tooling itself.

## verify-tools.mjs (ground-check subcommand)

`status -> unused`
`green -> unused`
`drift -> unused`

## verify-tools.mjs (report subcommand)

`status -> plugins/sdd-kit/skills/verify/SKILL.md`
`allGreen -> plugins/sdd-kit/skills/verify/SKILL.md`
`acs -> plugins/sdd-kit/skills/verify/SKILL.md`
`deviatedTasks -> plugins/sdd-kit/skills/verify/SKILL.md`
`real_cost -> plugins/sdd-kit/skills/verify/SKILL.md`

## verify-tools.mjs (archive subcommand)

`status -> plugins/sdd-kit/skills/verify/assets/archiving-detail.md`
`archived -> plugins/sdd-kit/skills/verify/SKILL.md, plugins/sdd-kit/skills/verify/assets/archiving-detail.md`
`destination -> plugins/sdd-kit/skills/verify/assets/archiving-detail.md`
`commit -> plugins/sdd-kit/skills/verify/assets/archiving-detail.md`
`versioningWarnings -> plugins/sdd-kit/skills/verify/assets/versioning-gate-detail.md`
`reason -> plugins/sdd-kit/skills/verify/assets/archiving-detail.md`
`notGreenAcs -> unused`

## versioning-report.mjs

`warnings -> unused`
