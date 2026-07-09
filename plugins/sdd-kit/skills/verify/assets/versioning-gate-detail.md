# Verify — versioning-policy gate before archiving, R5 (full detail)

Referenced from `SKILL.md`'s "Versioning-policy gate before archiving (R5)" section.

Immediately before `archiveIfGreen` would otherwise archive an all-green SPECDIR — after the
not-all-ACs-green check, before any `git mv` — it runs the same `versioningPolicy`-driven check
`scripts/validate.sh` runs (R4), scoped to the files this spec's own commits touched. Pass
`readConfig(cwd)`'s result (`exec/config.mjs`) as `options.versioning.config`; the current branch's
prefix (e.g. `fix` in `fix/<slug>`) is auto-derived unless you pass `options.versioning.branchPrefix`
explicitly. Omit `versioning` entirely (or leave `versioningPolicy` at its `'disabled'` default) and
`archiveIfGreen` behaves exactly as R7 always has — it doesn't even run the check (R5.S1).

With `versioningPolicy: "plugin-changelog"`: a touched plugin missing its version bump and/or
changelog entry BLOCKS archiving — nothing is moved or committed, and the result names the specific
plugin and which piece is missing (R5.S3). A touched plugin whose bump+changelog are both present but
land on the wrong semver segment (per `AGENTS.md`'s change-type table) does NOT block — archiving
proceeds and the mismatch rides along as a `versioningWarnings` entry for you to surface to the user
(R5.S4). Fully compliant plugins archive with no warning at all (R5.S2).

With `versioningPolicy: "changelog-only"`: non-trivial changes with no new entry in the configured
changelog file (default `CHANGELOG.md`) BLOCK archiving the same way, reporting the missing entry
(R5.S5).
