# Verify — verify-tools.mjs CLI internals (full detail)

Referenced from `SKILL.md`'s "Invocation" section. Useful context for
interpreting a subcommand's JSON output; you still invoke everything via
the CLI one-liners, never via `import`, and never by authoring a throwaway
driver script that imports these functions — that reloads the whole
~900-line library into the conversation for no reason the CLI doesn't
already cover.

`node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs <sub> SPECDIR [args]` —
mirroring the shape `exec-tools.mjs` already uses for plan-executor. Each
subcommand prints one JSON object with a `status` field to stdout and uses
process exit codes.

Internally these subcommands wrap `loadSpecdir(specDir)` (loads `spec.md`'s
AC checklist, the plan's `coverage.acs` map, and — when present —
`execution_state.json`'s per-task status), `groundCheck`,
`degradedManualRouting`, `incompleteCoverage`, `tokenDeviations`, and
`assembleReport`. It does not re-validate the plan against the spec — that already happened in
plan-executor's `init`. When `execution_plan.json` or `spec.md` is missing,
`loadSpecdir` throws before evaluating or archiving anything, naming the
exact missing file; each CLI subcommand surfaces that as a non-zero exit
code and a printed `VerifyInputError: <message naming the missing file>` —
nothing is evaluated or archived.
