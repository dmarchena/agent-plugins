# Changelog

All notable changes to the `sdd-kit` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.5.4

- Fixed a token-size regression across the 4 `SKILL.md` files (spec-writer,
  plan-writer, plan-executor, verify): later PRs had reinflated them +31% in
  tokens (`verify` doubled, 1220→2607 tok-approx) undetected, because the
  guard meant to catch this (`skill-slimming.test.mjs`) was never wired into
  `scripts/validate.sh`. Replaced the guard's size metric from line count
  (`wc -l`) to a per-skill **token budget**, measured with a new
  stdlib-only, dependency-free deterministic tokenizer
  (`plugins/sdd-kit/scripts/tokenizer.mjs`); each skill's ceiling derives
  from its token count at a known high-water-mark commit plus a maintenance
  margin, rather than a hardcoded number. Trimmed all 4 `SKILL.md` bodies
  back under their derived ceilings (moving content to `assets/` with no
  loss of rule-anchor accessibility) and wired the budget guard into
  `scripts/validate.sh` so both CI and local runs fail loudly on any future
  inflation.

## 0.5.3

- Fixed `verify-tools.mjs`'s AC checklist parser silently dropping any list
  line under `## Acceptance Criteria` that didn't match the expected AC
  item format — an AC with a malformed or non-standard reference simply
  vanished from verification instead of counting as not-green, letting a
  spec archive (`allGreen === true`) with a criterion that was never really
  checked (issue #8). `loadSpecdir` now aborts loudly with
  `VerifyInputError` naming the offending line, and separately cross-checks
  the parsed checklist's `ac_id`s against `plan.coverage.acs`, aborting and
  naming any AC the plan expects but the checklist never received.

## 0.5.2

- Fixed `exec-tools.mjs`'s `complete --batch` path: a batch entry for a
  non-verifier task with no `files` list fell through to `git add -A`
  (whole-tree stage), the exact hazard the single-task `complete` path's
  issue-#9 guard exists to prevent — that guard was never mirrored into the
  batch path. Now a missing `files` list for a non-verifier entry refuses
  the WHOLE batch up front (no partial commits), and an entry that
  legitimately has none (a `verifier` task) defaults to `[]` (stage only
  the state file) instead of `null` (no restriction).
- `plan-executor`'s `SKILL.md` now documents the `complete --batch` path
  (§3): closing a ready batch of 2-3 tasks in ONE invocation (heredoc +
  command in the same Bash call) instead of one `complete` per task,
  cutting orchestrator round-trips — the CLI capability already existed
  but was undocumented, so the orchestrator never used it (issue #15,
  residual item after 0.5.0/0.5.1).

## 0.5.1

- Fixed `plan-executor`'s `SKILL.md` and `assets/failures-and-resume.md`,
  which still documented a `{ status: "paused", reason: "budget" }` path
  and instructed the orchestrating agent to stop the loop and ask the user
  on a 2x token deviation — that pause behavior was removed from
  `exec-tools.mjs`'s `next` in 0.4.1 (it only ever returns `run`/`complete`/
  `stalled`), but the skill docs were never updated to match, causing the
  agent to (wrongly) stop and ask on healthy over-budget runs. Token
  deviation is now documented as purely informational, exactly matching
  the code.

## 0.5.0

- `exec-tools.mjs`'s `report` subcommand now wires `exec/real-cost.mjs`'s
  `computeRealCost()` in: its JSON output gains a `real_cost` block
  (orchestrator/subagents/total, USD and tokens, cache_read included),
  sliced to this run via the state's own git branch as the boundary, and a
  `real_cost_over_budget` indicator from a new `exec/budget.mjs` export,
  `realCostOverBudget(realCost, estimatedTokensTotal)`. Both fields are
  purely additive — the pre-existing `tokens.real`/`tokens.estimated`
  fields are unchanged, and `realCostOverBudget()` is a pure function that
  never touches state or halts a run: the budget-triggered pause path was
  already removed from `next` in a prior change, and this only replaces the
  blind "2x actual_tokens" comparison for the *reported* indicator with one
  driven by the transcript-measured real_cost total instead.
- `verify-tools.mjs`'s `report`/`archive` pipeline now also wires in
  `exec/real-cost.mjs`'s `computeRealCost()`: the printed report gains a
  top-level `real_cost` block (orchestrator/subagents/total, USD and
  tokens, cache_read included), sliced via the SPECDIR's own
  `execution_state.json` `branch` as the boundary. Purely additive — the
  pre-existing per-task `deviatedTasks` (`actual_tokens`/
  `estimated_tokens`) reporting is unchanged.
- Adds `scripts/token-cost.mjs`, vendored from the repo-root `shared/`
  directory via `shared/build.sh` (a new cross-plugin vendoring mechanism):
  `sdd-kit` opts in with a `"sharedScripts": ["token-cost.mjs"]` field in
  `.claude-plugin/plugin.json`, and the build copies it in byte-identical
  from `shared/token-cost.mjs`. This is the same shared script
  `claude-token-debug` consumes; `token-cost.mjs` is not yet wired into any
  `sdd-kit` skill by this change.
- Adds `scripts/exec/real-cost.mjs` with `computeRealCost(opts)`: computes
  the real cost of one plan-executor run (orchestrator + subagents, USD and
  tokens, cache_read included) by calling the vendored `token-cost.mjs`'s
  `analyze()`. The orchestrator side is sliced to its post-boundary portion
  when a caller-supplied `boundary` substring matches a line in the
  session's raw transcript (falling back to the orchestrator's full totals
  when it doesn't); the subagents side is the full, unsliced total across
  the session's `subagents/` dir, per a documented limitation of
  `token-cost.mjs` (it has no boundary-awareness for subagent transcripts).
  Degrades gracefully: when the target session can't be located or parsed,
  returns `{ unavailable: true, reason }` instead of throwing. Standalone
  module only — not yet wired into `exec-tools.mjs report` or
  `verify-tools.mjs`.

## 0.4.1

- `verify-tools.mjs` exposes its deterministic stages as CLI subcommands
  (`ground-check`, `report`, `archive`), each printing JSON with a `status`
  field and using process exit codes, mirroring `exec-tools.mjs`'s shape —
  so the `verify` skill drives verification with one-line `node` commands
  instead of importing the ~900-line module or authoring a driver script.
  `report`/`archive` accept a `--verdicts <path>` file to resolve
  `[manual]`-tagged ACs without ever blocking on interactive stdin. The
  `verify` `SKILL.md` is updated to drive every deterministic step this
  way.
- The exec `next`-batch path no longer pauses (nor records a `pause` entry)
  when a task's real tokens exceed 2x its estimate but every task is
  otherwise healthy — the deviation still surfaces in the report, but a
  healthy over-budget plan now runs to completion instead of halting for a
  `resume` round-trip. Genuine-failure blocking (retry once, then block
  dependents) is unchanged.
- Fixed the AC checklist parser to accept ACs that reference a bare
  requirement (e.g. `AC6 → R1 [manual]`) rather than only a scenario
  (`R1.S1`) — previously such a line was silently dropped from the
  checklist, so it never appeared in `ground-check`/`report` output and
  never blocked `allGreen`.
- Fixed `archive`'s CLI subcommand to read `.sdd-kit.json` via
  `readConfig()` and pass it into `archiveIfGreen`'s versioning gate —
  previously the gate was wired only when calling `archiveIfGreen`
  directly, so driving `archive` through the CLI silently skipped the
  `versioningPolicy` check.

## 0.4.0

- Added a `verifier` `agent_type` for the spec-mandated end-to-end
  confirmation task. `plan-writer` now emits it (instead of
  `terminal_operator`) for the task backing every spec's `R-E2E`/`AC-E2E`.
  A `verifier` task runs the pre-existing suite and confirms it green with
  no code and no red phase: `plan-executor`'s `complete` waives the
  red-phase requirement for it — deterministically re-running the suite
  rather than classifying `--rojo pass` as `no-red` — scoped strictly to
  `verifier` tasks so other roles keep the `no-red` guard, and commits it
  staging only the executor state file (no `--files` needed, never a
  whole-tree `git add -A`). `verify` closes the backing `AC-E2E` green
  through its normal report/archive flow. Removes the recurring `no-red`
  wall that forced a manual override on the final task of every plan
  (issue #11).

## 0.3.5

- `spec-writer` now records an explicit `Change type` (feat/fix/chore/
  refactor/docs) per spec, recommending one from the one-liner, surfacing
  a dominant-side/split tradeoff for a mixed fix+feature one-liner, and
  honoring a valid leading type word on `/sdd-kit:spec` (skips the
  question and echoes the type back) instead of always assuming `feat`.
- `plan-executor`'s `init` resolves the created branch's prefix from that
  `Change type` through an optional repo-root `.sdd-kit.json`
  `branchPrefixes` map (falling back to the identity default, or to
  `feat` with a recommendation note when no `Change type` is recorded),
  instead of always hardcoding `feat/<slug>`. An explicit empty-string
  prefix produces a branch named exactly `<slug>`.
- `AGENTS.md` now documents which semver segment each change type bumps
  at landing (fix/chore/refactor → patch, feat → minor, docs → no bump,
  major reserved pre-1.0.0) and renames the `spec/<slug>` branch entry to
  `docs/<slug>`.
- Added an optional, policy-driven versioning check (`.sdd-kit.json`'s
  `versioningPolicy`: `disabled` (default) / `plugin-changelog` /
  `changelog-only`) reused in two places: a non-blocking warning in
  `scripts/validate.sh`, and a pre-archive gate in `verify` that blocks
  archiving when a touched plugin is missing its version bump or
  changelog entry (warning-only, still archiving, when only the bumped
  segment is wrong).
- This repo's own root `.sdd-kit.json` now opts itself into
  `versioningPolicy: "plugin-changelog"`.

## 0.3.4

- Fixed the single-task `complete` path (`exec-tools.mjs complete SPECDIR
  <id>`) staging the entire working tree (`git add -A`), which could
  sweep unrelated in-progress work into a task's commit — it now commits
  only the files that task touched plus the plan's state file. Also
  refuses to commit (non-zero exit, working tree untouched) when the
  task's touched-file list can't be resolved, rather than falling back
  to staging the whole tree.

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
