# Spec: Change-type-driven branch naming and versioning policy

## Purpose

`plan-executor` hardcodes every plan's branch as `feat/<slug>` (`plugins/sdd-kit/scripts/exec/git.mjs`), and `AGENTS.md`'s versioning section requires a semver bump on landing without ever saying which segment (major/minor/patch) a given change should bump. In practice this produces branches and version bumps that don't reliably reflect a change's real nature — a bug fix landed as `feat/executor-scoped-commit` and was nearly bumped as `minor` before manual correction during this same session, and a separate landing (`feat/executor-scoped-commit` merging as PR #12) shipped with no version bump or changelog entry at all despite `AGENTS.md` requiring one.

This change makes the change's nature — decided once, explicitly, during `spec-writer`'s interview — the single source of truth for both the branch prefix and the semver segment expected at landing, with a per-project policy so `sdd-kit` (used across projects that aren't necessarily plugin monorepos) doesn't force every consumer into this repo's own `plugin.json` + `CHANGELOG.md` structure.

## Scope

**In scope:**
- `spec-writer` records an explicit `Change type` (`feat`/`fix`/`chore`/`refactor`/`docs`) in every `spec.md`, askable up front via an optional leading argument on `/sdd-kit:spec`.
- `plan-executor`'s branch creation derives its prefix from the spec's `Change type`, through a per-project configurable map (`.sdd-kit.json`), falling back to a built-in default when unconfigured.
- `AGENTS.md` documents the change-type → semver-segment rule for this repo, and renames the `spec/<slug>` branch prefix to `docs/<slug>`.
- A per-project `versioningPolicy` (`plugin-changelog` | `changelog-only` | `disabled`) in `.sdd-kit.json`, so the versioning checks below only assume `plugin.json`/`CHANGELOG.md` structure when a project opts into it.
- A non-blocking check in `scripts/validate.sh`, driven by `versioningPolicy`, that flags missing or misclassified version bumps for any plugin in the marketplace.
- `verify` (the archive-gating skill) runs the same policy-driven check before archiving a spec, and refuses to archive when the required bump/changelog is missing — not just warns.
- This repo's own `.sdd-kit.json`, declaring `versioningPolicy: "plugin-changelog"` and the `branchPrefixes` matching the renamed convention — otherwise the whole feature stays inert (default policy is `disabled`) for the very repo that surfaced the bug.

**Out of scope (non-goals):**
- Executing a function or regex supplied by a consuming project to decide prefixes or policy — `.sdd-kit.json` is a declarative JSON map only.
- Blocking `git push`/merges via a git hook — the checks live in `scripts/validate.sh` and `verify`, not in a pre-commit/pre-push hook.
- A generic "path to a version field in an arbitrary file" mechanism for projects that aren't `plugin-changelog` and want segment-level checking — `changelog-only` checks entry existence only, no segment matching. Logged as a possible future extension, not built here.
- Retroactively renumbering or rewriting already-published versions/changelog entries.
- Automatically inferring the change type from spec content without asking — `spec-writer` always records an explicit answer (from the interview or the leading argument), never a guess.

## Functional Requirements

### R1 — Change type recorded in the spec

Depende de: —

The system MUST require `spec-writer` to record one explicit `Change type` (`feat`|`fix`|`chore`|`refactor`|`docs`) in every `spec.md`, decided immediately after the one-liner/purpose is established, optionally pre-supplied as the leading word of the `/sdd-kit:spec` command argument.

#### R1.S1 — Interview asks the change type
- GIVEN a `spec-writer` interview where `/sdd-kit:spec` was invoked with no recognizable leading type word
- WHEN the interviewer finishes establishing the one-liner
- THEN it presents `feat`/`fix`/`chore`/`refactor`/`docs` as options with one recommended based on the one-liner, and records the chosen value as a `Change type: <value>` line near the top of the written `spec.md`

#### R1.S2 — Mixed change flags the tradeoff instead of guessing
- GIVEN a one-liner that describes both fixing a bug and adding new capability
- WHEN the interviewer reaches the change-type question
- THEN it presents the tradeoff explicitly (classify by the dominant/larger side of the change, or split into two separate specs) instead of silently picking one type

#### R1.S3 — Change type pre-supplied via command argument
- GIVEN `/sdd-kit:spec fix <rest of the explanation>` where the first word case-insensitively matches one of `feat`/`fix`/`chore`/`refactor`/`docs`
- WHEN `spec-writer` starts the interview
- THEN it does not ask the change-type question, treats the remaining text as the one-liner, and records `Change type: fix` in the written `spec.md`, echoing it back in one line without a separate confirmation question

#### R1.S4 — Leading word that isn't a valid type
- GIVEN `/sdd-kit:spec <text>` where the first word does not case-insensitively match any of the five valid types
- WHEN `spec-writer` starts the interview
- THEN the entire text is treated as the one-liner and the change-type question is asked interactively as in R1.S1

### R2 — `plan-executor` branch prefix follows the spec's change type and project config

Depende de: R1

The system MUST, when `plan-executor` creates a plan's branch, derive the prefix from the spec's recorded `Change type` mapped through the consuming project's `branchPrefixes` map in `.sdd-kit.json` (repo root) when present, falling back to the built-in default map (`feat`→`feat`, `fix`→`fix`, `chore`→`chore`, `refactor`→`refactor`, `docs`→`docs`) for any type missing from that config or when the file doesn't exist.

#### R2.S1 — Default mapping, no project config
- GIVEN a spec with `Change type: fix` and no `.sdd-kit.json` in the project
- WHEN `plan-executor`'s `init` creates the branch
- THEN the branch is named `fix/<slug>` (not `feat/<slug>`)

#### R2.S2 — Project override, including no-prefix
- GIVEN a `.sdd-kit.json` with `"branchPrefixes": {"fix": "bugfix", "chore": ""}` and a spec with `Change type: chore`
- WHEN `plan-executor`'s `init` creates the branch
- THEN the branch is named exactly `<slug>`, with no prefix and no leading slash

#### R2.S3 — Spec predates this feature (no `Change type` recorded)
- GIVEN a `spec.md` with no `Change type` line
- WHEN `plan-executor`'s `init` creates the branch
- THEN it defaults to `feat` (today's behavior), the branch is created successfully, and `init`'s output includes a note recommending the spec be updated with an explicit `Change type`

### R3 — Versioning rule documented in `AGENTS.md`

Depende de: —

`AGENTS.md`'s versioning section MUST document, for each `Change type`, which semver segment a landing on this repo bumps, and the `Branch naming` section's `spec/<slug>` entry MUST be renamed to `docs/<slug>`.

#### R3.S1 — Segment table present
- GIVEN a reader consulting `AGENTS.md`'s versioning section
- WHEN they check what segment to bump for a `fix/<slug>` landing
- THEN they find an explicit table: `fix`/`chore`/`refactor` → patch, `feat` → minor, `docs` → no bump required, major reserved and unused pre-`1.0.0` — not just "bump the version"

### R4 — Marketplace-level version/changelog check in `scripts/validate.sh`

Depende de: R2, R3

The system MUST, when `scripts/validate.sh` runs, apply a `versioningPolicy`-driven, non-blocking check (never changes the script's exit code) for every project it validates, reading `versioningPolicy` from that project's `.sdd-kit.json` (default `"disabled"` when absent or unset).

#### R4.S1 — Policy disabled skips the check
- GIVEN a project whose `.sdd-kit.json` has no `versioningPolicy` or sets it to `"disabled"`
- WHEN `scripts/validate.sh` runs
- THEN no version/changelog warning is printed for that project

#### R4.S2 — `plugin-changelog`, compliant landing
- GIVEN `versioningPolicy: "plugin-changelog"` and a branch that touched `plugins/sdd-kit/` files, bumped `plugins/sdd-kit/.claude-plugin/plugin.json`'s version by the segment matching the branch's type (per R3's table, reverse-mapped through `branchPrefixes`), and added a matching new heading to `plugins/sdd-kit/CHANGELOG.md`
- WHEN `scripts/validate.sh` runs
- THEN no warning is printed for `sdd-kit`

#### R4.S3 — `plugin-changelog`, missing bump or changelog entry
- GIVEN `versioningPolicy: "plugin-changelog"` and a branch that touched `plugins/sdd-kit/` files without bumping its `plugin.json` version and/or without adding a new `CHANGELOG.md` heading
- WHEN `scripts/validate.sh` runs
- THEN it prints a warning line naming the plugin and stating the bump and/or changelog entry is missing, and still exits 0

#### R4.S4 — `plugin-changelog`, wrong segment
- GIVEN `versioningPolicy: "plugin-changelog"` and a branch whose bumped segment for a touched plugin doesn't match the segment expected for that branch's type
- WHEN `scripts/validate.sh` runs
- THEN it prints a warning line naming the plugin, the branch's type, the segment actually bumped, and the segment expected, and still exits 0

#### R4.S5 — `changelog-only`, missing entry
- GIVEN `versioningPolicy: "changelog-only"` (optionally with a custom `changelogPath`, default `CHANGELOG.md`) and a branch with non-trivial code changes but no new heading/entry added to that changelog file
- WHEN `scripts/validate.sh` runs
- THEN it prints a warning line naming the missing changelog entry, with no segment-level check, and still exits 0

### R5 — `verify` gates archiving on the same policy

Depende de: R4

The system MUST, when the `verify` skill would otherwise archive a spec (all ACs green), first run the same `versioningPolicy`-driven check from R4 scoped to the files that spec's execution touched, and refuse to archive when a required bump or changelog entry is missing.

#### R5.S1 — Policy disabled, no extra friction
- GIVEN `versioningPolicy: "disabled"` (or unset)
- WHEN `verify` would archive a spec with all ACs green
- THEN it archives exactly as it does today, with no additional check

#### R5.S2 — `plugin-changelog`, compliant
- GIVEN `versioningPolicy: "plugin-changelog"` and every plugin touched by the spec's execution has a matching version bump and changelog entry
- WHEN `verify` would archive
- THEN it archives normally

#### R5.S3 — `plugin-changelog`, missing bump/changelog blocks archiving
- GIVEN `versioningPolicy: "plugin-changelog"` and a plugin touched by the spec's execution has no version bump and/or no new changelog entry
- WHEN `verify` would otherwise archive
- THEN it does NOT archive, and reports to the user exactly which plugin is missing its bump and/or changelog entry

#### R5.S4 — `plugin-changelog`, wrong segment warns but doesn't block
- GIVEN `versioningPolicy: "plugin-changelog"` and a touched plugin has a version bump and changelog entry, but the segment doesn't match the branch's type
- WHEN `verify` would archive
- THEN it prints a warning naming the mismatch but still archives

#### R5.S5 — `changelog-only`, missing entry blocks archiving
- GIVEN `versioningPolicy: "changelog-only"` and the spec's execution made non-trivial changes without a new entry in the configured changelog file
- WHEN `verify` would otherwise archive
- THEN it does NOT archive, and reports that the changelog entry is missing

## Technical Requirements

- **Stack / framework:** Node.js (`.mjs`), consistent with the existing `plugins/sdd-kit/scripts/exec/git.mjs` and `verify-tools.mjs`.
- **Integraciones:** N/A.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** `.sdd-kit.json` is a declarative JSON map only — no function, regex, or code from a consuming project is loaded or executed to decide prefixes or policy.
- **Datos / almacenamiento:** `.sdd-kit.json` at the consuming project's repo root, all fields optional:
  ```json
  {
    "branchPrefixes": { "feat": "feat", "fix": "fix", "chore": "chore", "refactor": "refactor", "docs": "docs" },
    "versioningPolicy": "plugin-changelog",
    "changelogPath": "CHANGELOG.md"
  }
  ```
  Missing `branchPrefixes` entries fall back per-key to the default map (R2). Missing/absent `versioningPolicy` defaults to `"disabled"` (R4, R5). `changelogPath` is only read when `versioningPolicy` is `"changelog-only"`, defaulting to `"CHANGELOG.md"` at the project root.
- **Restricciones adicionales:** Must not change behavior for a `spec.md` written before this feature shipped (R2.S3 fallback to `feat`) or for a project with no `.sdd-kit.json` at all (R2.S1 default map, R4/R5 `disabled` default).

### R-E2E — Full flow from classification to a compliant landing

Depende de: R1, R2, R3, R4, R5

The system SHALL, for a project configured with `versioningPolicy: "plugin-changelog"`, carry a change's classification from the spec through to a landing whose branch, version bump, and changelog entry are all consistent with each other.

#### R-E2E.S1 — Fix classified, wrong bump caught, then corrected
- GIVEN this repo's own `.sdd-kit.json` (`versioningPolicy: "plugin-changelog"`) and a spec authored with `Change type: fix` touching `plugins/sdd-kit/`
- WHEN `plan-executor` runs the plan (creating `fix/<slug>`), all tasks go green, and `verify` is invoked before any version bump exists
- THEN `verify` refuses to archive and reports the missing bump/changelog for `sdd-kit`
- WHEN a patch-segment version bump and a matching `CHANGELOG.md` entry are then added
- THEN `scripts/validate.sh` prints no warning for `sdd-kit`, and re-running `verify` archives the spec successfully

## Acceptance Criteria

- [ ] AC1 → R1.S1 [manual] — run `spec-writer` on a fresh one-liner with no leading type word; confirm it asks for `Change type` and the written `spec.md` contains a `Change type:` line matching the answer given
- [ ] AC2 → R1.S2 [manual] — run `spec-writer` on a one-liner mixing a fix and a new capability; confirm it surfaces the dominant-side/split tradeoff instead of silently choosing
- [ ] AC3 → R1.S3 [manual] — invoke `/sdd-kit:spec fix <text>`; confirm no change-type question is asked and the written `spec.md` contains `Change type: fix`. Manual because `spec-writer` is an interactive skill with no Bash/script surface — the leading-word classification is applied by the agent following `SKILL.md`, not by a re-runnable command — so `verify` cannot mechanically re-run it; same reason as AC1/AC2.
- [ ] AC4 → R1.S4 [manual] — invoke `/sdd-kit:spec widget <text>` (no matching leading word); confirm the change-type question is asked interactively. Manual for the same reason as AC3: it observes interactive-skill behavior, not a re-runnable command.
- [ ] AC5 → R2.S1 [auto] — with no `.sdd-kit.json`, run `plan-executor init` on a `Change type: fix` spec; confirm the created branch is `fix/<slug>`
- [ ] AC6 → R2.S2 [auto] — with `.sdd-kit.json` mapping `chore` to `""`, run `plan-executor init` on a `Change type: chore` spec; confirm the branch name is exactly `<slug>`
- [ ] AC7 → R2.S3 [auto] — run `plan-executor init` on a `spec.md` with no `Change type` line; confirm the branch is `feat/<slug>` and the output includes the update-recommendation note
- [ ] AC8 → R3.S1 [auto] — grep `AGENTS.md`'s versioning section for the fix/chore/refactor→patch, feat→minor, docs→no-bump table and the renamed `docs/<slug>` branch entry
- [ ] AC9 → R4.S1 [auto] — with `versioningPolicy: "disabled"`, run `scripts/validate.sh` on a branch with an uncommitted version bump gap; confirm no version/changelog warning is printed
- [ ] AC10 → R4.S2 [auto] — with `versioningPolicy: "plugin-changelog"` and a compliant `sdd-kit` bump+changelog+segment, run `scripts/validate.sh`; confirm no warning for `sdd-kit`
- [ ] AC11 → R4.S3 [auto] — same policy, a branch touching `plugins/sdd-kit/` with no version bump; confirm `scripts/validate.sh` prints a warning naming `sdd-kit` and still exits 0
- [ ] AC12 → R4.S4 [auto] — same policy, a `fix/<slug>` branch that bumped `sdd-kit`'s minor segment instead of patch; confirm `scripts/validate.sh` warns with expected vs. actual segment and still exits 0
- [ ] AC13 → R4.S5 [auto] — with `versioningPolicy: "changelog-only"`, a branch with code changes and no new `CHANGELOG.md` entry; confirm `scripts/validate.sh` warns and still exits 0
- [ ] AC14 → R5.S1 [auto] — with `versioningPolicy: "disabled"`, run `verify` on a spec with all ACs green; confirm it archives with no additional check
- [ ] AC15 → R5.S2 [auto] — with `plugin-changelog` and a compliant touched plugin, run `verify`; confirm it archives normally
- [ ] AC16 → R5.S3 [auto] — with `plugin-changelog` and a touched plugin missing its bump/changelog, run `verify`; confirm it does NOT archive and reports the specific plugin
- [ ] AC17 → R5.S4 [auto] — with `plugin-changelog` and a touched plugin with the wrong segment (bump+changelog present), run `verify`; confirm it warns but still archives
- [ ] AC18 → R5.S5 [auto] — with `versioningPolicy: "changelog-only"` and a missing required changelog entry, run `verify`; confirm it does NOT archive and reports the missing entry
- [ ] AC19 → In-scope repo config [auto] — confirm this repo's root `.sdd-kit.json` exists with `"versioningPolicy": "plugin-changelog"` and a `branchPrefixes` map consistent with `AGENTS.md`'s renamed `docs/<slug>` convention
- [ ] AC-E2E → R-E2E.S1 [manual] — run the full fix-classified flow end to end on a throwaway spec touching `plugins/sdd-kit/`: confirm `verify` blocks archiving before the bump exists, and archives successfully once a correct patch bump + changelog entry are added

## Assumptions & Open Questions

- Assumes `.sdd-kit.json` lives at the consuming project's repo root (not per-plugin, not per-spec) — one config per project.
- A generic "path to a version field in an arbitrary file" mechanism for segment-level checking outside `plugin-changelog` projects is deferred — not needed by any current consumer of `sdd-kit` and adds real parsing complexity; revisit as a follow-up if a non-plugin project actually asks for segment checking.
- R4/R5's `plugin-changelog` checks assume this repo's existing layout (`plugins/<name>/.claude-plugin/plugin.json`, `plugins/<name>/CHANGELOG.md`) for locating "the touched plugin's" version/changelog files; a differently laid-out monorepo would need its own adaptation, out of scope here.
- Exact wording of `scripts/validate.sh`'s warning messages and `verify`'s block/report messages is left to the plan/implementation stage, as long as they name the specific plugin (or changelog path) and the specific gap (missing vs. wrong-segment).
