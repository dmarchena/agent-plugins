# Spec: Shared-script vendoring + real (cache_read-inclusive) cost signal

## Purpose

Two entangled needs, both blocking on the same missing piece. First, `token-cost.mjs`
lives only inside the `claude-token-debug` plugin, yet `sdd-kit` now needs its cost logic
too; copying it by hand or importing across plugin directories would couple the plugins.
Second, issue #15 items 2 and 3 remain open: sdd-kit's exec/verify still report only the
orchestrator-supplied `actual_tokens` (blind to `cache_read`), so the run's real dominant
cost — orchestrator + subagent context re-reads — is invisible and the over-budget
indicator fires on the wrong signal. This spec introduces a `shared/` source-of-truth
folder with a `build.sh` that **vendors (copies)** shared scripts into each declaring
plugin (making `token-cost.mjs` available inside sdd-kit while keeping plugins
self-contained and decoupled), then uses that now-available logic to compute and surface
real, `cache_read`-inclusive run cost in the exec and verify reports.

Change type: feat

## Scope

**In scope:**
- A repo-root `shared/` folder as source of truth for cross-plugin scripts, plus a
  `build.sh` that vendors declared shared scripts into `plugins/<plugin>/scripts/`.
- A per-plugin declaration of which shared scripts it consumes, honored by `build.sh`.
- Drift detection in `validate.sh`: a vendored copy that differs from its `shared/`
  original fails validation.
- Relocating `token-cost.mjs` (and its authoritative test) into `shared/` as the first
  shared citizen, vendored into both `claude-token-debug` and `sdd-kit`.
- Computing real per-run cost (orchestrator + subagents, incl. `cache_read`, in tokens
  and USD) via the vendored `token-cost.mjs` over the session transcript, sliced to the
  SDD run.
- Surfacing that real-cost block in both the exec `report` and the verify report,
  alongside the existing `actual_tokens`; any over-budget/deviation indicator derives
  from the real cost, not the blind `2× actual_tokens` check.

**Out of scope (non-goals):**
- Recalibrating `estimated_tokens` per task — remains `plan-writer-token-estimator`.
- Reintroducing any budget gate / auto-pause — the signal stays informative (auto-pause
  was removed in PR #19); healthy runs never halt.
- Migrating any other script to `shared/` — `token-cost.mjs` is the only citizen here;
  exec-tools/plan-tools/verify-tools stay put.
- Changing `token-cost.mjs`'s own logic/CLI — it is only relocated and vendored.

## Functional Requirements

### R1 — Vendoring build

Depende de: —

The system SHALL provide `shared/build.sh` that, for each plugin declaring one or more
shared scripts, writes a byte-identical copy of each declared script from `shared/` into
that plugin's `scripts/` directory.

#### R1.S1 — Declared script is vendored
- GIVEN `shared/token-cost.mjs` exists and both `claude-token-debug` and `sdd-kit`
  declare `token-cost.mjs` as a shared dependency
- WHEN `shared/build.sh` runs
- THEN `plugins/claude-token-debug/scripts/token-cost.mjs` and
  `plugins/sdd-kit/scripts/token-cost.mjs` both exist and are byte-identical to
  `shared/token-cost.mjs` (identical `shasum`)
- AND `build.sh` exits 0

#### R1.S2 — Declared source missing
- GIVEN a plugin declares a shared script `nope.mjs` that does not exist under `shared/`
- WHEN `shared/build.sh` runs
- THEN it exits non-zero and prints a message naming the missing source
  (`shared/nope.mjs`) and the plugin that declared it

### R2 — Drift detection

Depende de: R1

The system SHALL make `scripts/validate.sh` fail when any vendored copy in
`plugins/<plugin>/scripts/` differs from its `shared/` original.

#### R2.S1 — In-sync passes
- GIVEN every vendored shared script matches its `shared/` original
- WHEN `scripts/validate.sh` runs
- THEN the drift check passes (contributes no failure) and validation exits 0

#### R2.S2 — Drift fails naming the file
- GIVEN `plugins/sdd-kit/scripts/token-cost.mjs` has been edited to differ from
  `shared/token-cost.mjs`
- WHEN `scripts/validate.sh` runs
- THEN it exits non-zero and prints a message identifying the stale vendored path
  (`plugins/sdd-kit/scripts/token-cost.mjs`) and instructs to re-run `shared/build.sh`

### R3 — token-cost.mjs as first shared citizen

Depende de: R1, R2

The system SHALL hold `token-cost.mjs` and its authoritative test suite under `shared/`
as the single source of truth, with no separate per-plugin test duplicated for the
vendored copies.

#### R3.S1 — Source of truth is tested and vendored
- GIVEN `token-cost.mjs` and its test live under `shared/` and both plugins declare it
- WHEN the shared test suite runs and `shared/build.sh` has run
- THEN the shared `token-cost` test passes, and no `token-cost.test.mjs` remains under
  any `plugins/*/test/` (the drift check alone guarantees copies equal the tested
  original)

### R4 — Real (cache_read-inclusive) run cost computation

Depende de: R3

The system SHALL compute the real cost of an SDD run — orchestrator plus subagents,
including `cache_read` tokens — via the vendored `token-cost.mjs` over the session
transcript, sliced to the run so earlier non-SDD activity is excluded.

#### R4.S1 — Real cost is computed and sliced
- GIVEN a completed run whose session transcript includes orchestrator turns and
  subagent transcripts, and pre-run activity before the SDD boundary
- WHEN exec/verify computes the run's real cost
- THEN it yields a `real_cost` object with total tokens (incl. `cache_read`) and USD,
  split into orchestrator and subagent portions, counting only turns at/after the run
  boundary (pre-boundary activity excluded)

#### R4.S2 — Transcript unavailable degrades gracefully
- GIVEN the session transcript cannot be located/parsed (e.g. run outside the projects
  root)
- WHEN exec/verify computes the run's real cost
- THEN `real_cost` is reported as unavailable with a short reason and the command still
  exits 0 (no crash, `actual_tokens` still reported)

### R5 — Reports surface real cost

Depende de: R4

The system SHALL include the `real_cost` block in both the exec `report` and the verify
report, alongside the existing `actual_tokens`, and any over-budget/deviation indicator
SHALL be derived from `real_cost`, not from a `real > 2× estimated` check on
`actual_tokens`.

#### R5.S1 — Both reports carry real_cost beside actual_tokens
- GIVEN a completed run with a resolvable transcript
- WHEN exec `report` and the verify report are produced
- THEN each output contains both the pre-existing `actual_tokens`/`estimated` fields and
  the new `real_cost` block (orchestrator + subagent, incl. `cache_read`, tokens + USD)

#### R5.S2 — Over-budget indicator derives from real cost
- GIVEN a run whose `actual_tokens` sum exceeds `2× estimated` but whose `real_cost` is
  within the run's expected envelope (and vice-versa)
- WHEN the report's over-budget/deviation indicator is produced
- THEN the indicator reflects `real_cost`, not the blind `2× actual_tokens` comparison,
  and in no case does it halt or pause the run

### R-E2E — Shared cost logic drives a decoupled, cost-honest SDD report

Depende de: R1, R2, R3, R4, R5

The system SHALL let an operator vendor the shared cost script into sdd-kit and obtain,
from an ordinary exec/verify run, a report whose real (cache_read-inclusive) cost is
visible — without sdd-kit importing anything from another plugin's directory.

#### R-E2E.S1 — End-to-end run
- GIVEN a fresh checkout where `shared/token-cost.mjs` is declared by both plugins
- WHEN `shared/build.sh` runs, `scripts/validate.sh` passes, and an SDD exec+verify run
  completes on a session with a resolvable transcript
- THEN sdd-kit's own `scripts/token-cost.mjs` is byte-identical to `shared/`, sdd-kit
  contains no cross-plugin import path, and both reports show a `real_cost` block
  (orchestrator + subagent, incl. `cache_read`) beside `actual_tokens`

## Technical Requirements

- **Stack / framework:** Node ESM, stdlib only; POSIX `sh`/`bash` for `build.sh` and
  `validate.sh`. No network dependencies.
- **Integraciones:** Reads Claude Code session/subagent transcripts under the projects
  root (`~/.claude/projects/<slug>/<session>/...`) via the existing `token-cost.mjs`
  target-resolution + `--boundary` slicing; no new external service.
- **Rendimiento:** N/A (bounded by transcript size already handled by `token-cost.mjs`).
- **Seguridad / privacidad:** N/A — only reads local transcripts already on disk.
- **Datos / almacenamiento:** Per-plugin shared-dependency declaration (format decided at
  plan stage); vendored copies committed into each plugin so plugins stay self-contained.
- **Restricciones adicionales:** `versioningPolicy: plugin-changelog` (CHANGELOG entry per
  touched plugin); tests live beside each plugin as `test/*.test.mjs`, except the shared
  script's authoritative test which lives under `shared/`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — after `shared/build.sh`, both plugins' `scripts/token-cost.mjs` `shasum` equals `shared/token-cost.mjs`; exit 0
- [ ] AC2 → R1.S2 [auto] — declaring a non-existent `shared/nope.mjs` makes `build.sh` exit non-zero with a message naming `shared/nope.mjs` + the plugin
- [ ] AC3 → R2.S1 [auto] — with copies in sync, `scripts/validate.sh` exits 0
- [ ] AC4 → R2.S2 [auto] — editing a vendored copy makes `validate.sh` exit non-zero, naming the stale path and telling the user to re-run `build.sh`
- [ ] AC5 → R3.S1 [auto] — shared `token-cost` test passes AND no `token-cost.test.mjs` exists under any `plugins/*/test/`
- [ ] AC6 → R4.S1 [auto] — for a fixture session with pre-boundary activity, computed `real_cost` includes `cache_read`, splits orchestrator/subagent, and excludes pre-boundary turns
- [ ] AC7 → R4.S2 [auto] — with an unresolvable transcript, `real_cost` is `unavailable` with a reason and the command exits 0
- [ ] AC8 → R5.S1 [auto] — exec `report` and verify report JSON each contain both `actual_tokens`/`estimated` and a `real_cost` block
- [ ] AC9 → R5.S2 [auto] — a fixture where `2× actual_tokens` and `real_cost` disagree yields an over-budget indicator that tracks `real_cost`; the run never pauses/halts
- [ ] AC-E2E → R-E2E.S1 [auto] — full build → validate → exec+verify run: sdd-kit copy byte-identical to shared, no cross-plugin import in sdd-kit, both reports show `real_cost` beside `actual_tokens`

## Assumptions & Open Questions

- **Run boundary marker:** `token-cost.mjs` already supports `--boundary` slicing; the
  exact marker that delimits an SDD run within the session transcript (e.g. the exec
  `init` line, plan_id, or spec slug) is left to the plan stage. Default assumption: slice
  from the first turn that references the run's `plan_id`/spec slug.
- **Declaration format:** whether a plugin declares its shared deps in `plugin.json`, a
  dedicated per-plugin file, or a central `shared/manifest.json` is a plan-stage decision;
  the spec only fixes that a declaration exists and `build.sh`/`validate.sh` honor it.
- **USD prices:** reuse `token-cost.mjs`'s existing per-tier price table
  (`costForUsage`); no new pricing source introduced here.
- **Orchestrator cost attribution:** the orchestrator portion of `real_cost` reflects the
  main-loop turns within the boundary; it is directional (list-price based), not billing-exact, consistent with issue #15's framing.
