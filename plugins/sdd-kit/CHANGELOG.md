# Changelog

All notable changes to the `sdd-kit` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.3.3

- Added a deterministic `extract` subcommand (`exec-tools.mjs extract
  SPECDIR <ID...>`) that prints the verbatim spec.md block for a
  scenario or AC ID, failing clearly on an unknown ID. `plan-executor`'s
  brief for `test_contract: null` tasks now passes the executor these
  IDs plus the extraction command instead of quoting the scenario/AC
  text into the brief itself — the orchestrator no longer reads or
  drags scenario bodies across every brief; the disposable executor
  extracts them itself and bounces the task if an ID doesn't exist.

## 0.3.2

- `plan-executor`'s task brief now documents a minimal happy-path return
  contract: on a green TDD cycle the executor's return must contain
  exactly `task_id`, files touched (paths only), test-cmd, rojo/verde
  flags, and tokens consumed — no file bodies, and a ≤3-line red excerpt
  only when `--rojo fail`. Trims what a disposable executor drags back
  into the orchestrator's persistent context on the happy path; a
  bounced ambiguity or a `no-red` incidence still keeps full prose.

## 0.3.1

- `plan-writer`'s agent-roles catalog now documents *why* the role-to-model
  mapping is the right lever: measured on real `general-purpose` invocations
  in this repo, subagent cost is almost entirely `cache_read` accumulated
  across turns within a task, not the agent's fixed system prompt (~0.4-2%
  of total). Recommends keeping each plan task scoped to one verifiable
  deliverable and splitting tasks expected to need more than ~15-20 turns,
  rather than reaching for a lighter-weight agent.

## 0.3.0

- Added the `verify` skill: checks a spec's Acceptance Criteria one by one
  against a `docs/specs/<slug>/` that `plan-executor` already ran —
  deterministic re-run ground check for done tasks' auto ACs, degraded
  manual-confirmation flow when `execution_state.json` is missing,
  not-green status for ACs whose covering tasks are incomplete, an
  informative token-deviation report, and, only once every AC is green,
  archives the spec dir to `docs/specs/archived/<slug>/`. Shortcut:
  `/sdd-kit:verify`.
- Fixed a `plan-executor` bug where a task's own state flip could be
  dropped: the task's state was committed before it was persisted to
  disk, so a same-commit read raced the write. State is now persisted
  before the commit that records it.

## 0.2.1

- Fixed `plan-executor`'s feature-branch prefix: it hardcoded the old
  `ia/<slug>` convention, contradicting the branch-naming convention now
  documented in the repo-wide `AGENTS.md`. Branches created by `exec` are
  now `feat/<slug>`.
- Translated Spanish comments, error/log strings, and test descriptions
  across `plugins/sdd-kit/scripts` and `test/*.mjs` to English, per the
  artifact-language convention (existing prose specs under `docs/specs/**`
  are intentionally left untranslated).

## 0.2.0

- Added the `plan-executor` skill: an integration layer (CLI + `SKILL.md` +
  the `/sdd-kit:exec` shortcut) that runs an `execution_plan.json`'s task
  DAG to completion via a validation gate, batched dependency-ordered
  dispatch, a single TDD-executor brief per task (plan test-contract or a
  fallback to the spec's own scenarios, red→green evidence, exact re-run
  command, token reporting), deterministic re-run verification, one retry
  plus branch-blocking on failure, a budget pause, resume, and a final
  report.

## 0.1.0

- Migrated `spec-writer` from its own standalone plugin into `sdd-kit`, a
  multi-skill spec-driven development kit.
- Added the `plan-writer` skill: converts a spec-writer-format `spec.md`
  into `execution_plan.json`, a DAG of atomic, agent-assigned tasks.
- Added `execution_plan.schema.json`, the published JSON Schema for a
  valid execution plan.
- Added `scripts/plan-tools.mjs`, a deterministic validator
  (`inspect-spec`, `check-plan`) used by `plan-writer` and CI to gate spec
  ingestion and plan output.
- Defined the artifact convention: each feature's `spec.md` and
  `execution_plan.json` live together in `docs/specs/<slug>/`, committed on
  the feature branch, and are archived to `docs/specs/archived/<slug>/` once
  every acceptance criterion is green. Rationale and alternatives recorded in
  [ADR 0001](docs/adr/0001-artifact-location.md).
