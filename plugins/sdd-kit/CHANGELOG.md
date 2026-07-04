# Changelog

All notable changes to the `sdd-kit` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
