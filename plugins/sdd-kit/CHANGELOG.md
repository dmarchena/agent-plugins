# Changelog

All notable changes to the `sdd-kit` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
