# ADR 0001 — Feature artifacts live together in `docs/specs/<slug>/`

- **Status:** Accepted (2026-07-04)
- **Scope:** `sdd-kit` plugin

## Context

The `spec-writer → plan-writer → exec → verify` chain produces several
artifacts per feature: `spec.md`, `execution_plan.json`, and (future) task
and verification outputs. Two questions were open:

1. **Where** do these artifacts live?
2. Do the spec and the plan **share a directory**, or split into separate
   `specs/` and `plans/` trees?

## Decision

Every feature gets **one directory, `docs/specs/<slug>/`** (a kebab-case slug
from the feature name), holding the whole chain's artifacts together:

- `spec-writer` writes `docs/specs/<slug>/spec.md`.
- `plan-writer` writes `docs/specs/<slug>/execution_plan.json` alongside it.

While in progress the directory is committed on the feature branch — git is
the handoff between stages and sessions. **On completion** (every acceptance
criterion green) it is archived to **`docs/specs/archived/<slug>/`**.

## Rationale

- **Grouped by feature, not by artifact type** — this matches the dominant
  spec-driven-development convention. GitHub **spec-kit** puts `spec.md` +
  `plan.md` + `tasks.md` together in `specs/<feature>/`; AWS **Kiro** groups
  `requirements.md` + `design.md` + `tasks.md` under `specs/<feature>/`. In
  both, "spec" denotes the **whole feature bundle**, not just the requirements
  file — so a plan living inside a `specs/` directory is idiomatic, not a
  category error.
- **`docs/` prefix** (vs spec-kit's repo-root `specs/`) keeps the SDD
  artifacts out of the repo root, consistent with the rest of a project's
  documentation. Same `specs/` token, same grouping; only nested under `docs/`.
- **Archive on completion** rather than delete or leave in place. A finished
  spec is the durable record of intended behavior and its acceptance criteria
  (worth keeping for regressions and audits), but it shouldn't sit in the
  active `docs/specs/` path that every later plan/verify session reloads — a
  context cost. Archiving preserves the history off the hot path.

## Alternatives considered

- **Split by type (`docs/specs/` + `docs/plans/`)** — rejected. It scatters one
  feature's artifacts across two trees and breaks the "git = handoff of the
  whole feature" model.
- **Repo-root `specs/`** (exact spec-kit layout) — viable and equally standard;
  rejected only to keep artifacts under `docs/`.
- **Naming the parent `feature-specs/` or `spec-driven-dev/`** — rejected. No
  reference tool uses these; `specs/` is the standard token.

## Consequences

- Consumers of `sdd-kit` get one predictable directory per feature.
- The `verify` stage will perform the archive `git mv` once it lands; until
  then it is a manual `git mv`.
