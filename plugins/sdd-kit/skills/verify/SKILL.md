---
name: verify
description: Use this skill whenever the user has a docs/specs/<slug>/ that plan-executor already ran and wants to check whether it's really done — e.g. "verifica esta spec", "comprueba los AC de este plan", "archiva la spec si está completa", "verify", "cierra y archiva esta feature", or any request to run the spec-driven-development verify stage over an existing SPECDIR. It consumes spec.md + execution_plan.json + (optional) execution_state.json and does NOT write the plan (plan-writer) nor execute its tasks (plan-executor); it checks the spec's Acceptance Criteria checklist AC by AC and, only when every AC is green, archives the SPECDIR to docs/specs/archived/<slug>/.
argument-hint: "[ruta a docs/specs/<slug>/]"
allowed-tools: Read, Write, Edit, Bash, Task
---

# Verify

## What this does

Fourth and last stage of the spec → plan → exec → **verify** workflow. Given
a `docs/specs/<slug>/` (`SPECDIR`) already run by plan-executor, it checks,
AC by AC, against the plain Acceptance Criteria checklist in `spec.md`,
whether the feature is really finished — re-running the stored test command
of every `done` task for `[auto]` ACs, asking the user to confirm `[manual]`
ACs one by one, and degrading the whole checklist to manual confirmation
when no `execution_state.json` exists. Only once every AC is green does it
archive the SPECDIR (`git mv` + commit) to `docs/specs/archived/<slug>/`.
See the full spec at `docs/specs/verify/spec.md`.

## Invocation

`verify` is invoked with a single argument: the path to a `docs/specs/<slug>/`
directory (`SPECDIR`) — the same directory plan-writer produced the
`execution_plan.json` in and plan-executor ran against. It does not take a
plan or spec file path directly; always pass the directory.

All deterministic loading/parsing logic lives in
`${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs`, starting with
`loadSpecdir(specDir)`, which loads `spec.md`'s AC checklist, the plan's
`coverage.acs` map, and (when present) `execution_state.json`'s per-task
status. It does not re-validate the plan against the spec — that already
happened in plan-executor's `init`. When `execution_plan.json` or `spec.md`
is missing from `SPECDIR`, `loadSpecdir` throws before evaluating or
archiving anything, naming the exact missing file.
