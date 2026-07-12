# Baseline token measurements — trim-cli-data (T2)

Refs: R2.S1, R2.S2, AC3, AC4 (`docs/specs/trim-cli-data/spec.md`).

Baseline = the token weight of a representative invocation's stdout `data`
payload, measured **before** any trimming work (R3/R4) lands, using
`estimateTokens()` from `plugins/sdd-kit/scripts/tokenizer.mjs` (imported
directly — see "Method" below) applied to `JSON.stringify(data)`, i.e. the
same compact serialization `scripts/lib/cli.mjs#emitSuccess` writes to
stdout.

All commands below are run from the repo root
(`/Users/dmarchena/ai/agent-plugins`) and are read-only against the working
tree unless noted otherwise (`forensics.mjs` writes a `forensics.json` next
to the SPECDIR it's pointed at, so its command below runs against a
temp-directory copy of the fixture, never the tracked archived spec).

## Method

`tokenizer.mjs` (`plugins/sdd-kit/scripts/tokenizer.mjs`) exports
`estimateTokens(text)` but has no CLI/argv handling and never wires into
`scripts/lib/cli.mjs` — running it directly (`node
plugins/sdd-kit/scripts/tokenizer.mjs`) exits 0 with **empty stdout**
(verified empirically, see its own row below). It is the shared measurement
*instrument* the other eight CLIs' payloads are measured with (R2.S1's own
wording: "measured with `plugins/sdd-kit/scripts/tokenizer.mjs`"), not
itself an envelope-emitting CLI with a `data` payload to baseline. Its row
below documents this as `N/A` rather than inventing a figure.

For every other CLI: the command is run for real, stdout's single JSON line
is parsed, `.data` is re-serialized with `JSON.stringify` (compact, matching
`emitSuccess`'s own serialization) and fed to `estimateTokens()`.

## Baseline table

| CLI | Payload shape | Baseline tokens | Command |
|---|---|---|---|
| budget-guard.mjs | results (default skills/hwm dirs) | 158 | `node plugins/sdd-kit/scripts/budget-guard.mjs` |
| exec-tools.mjs | next | 52 | `node plugins/sdd-kit/scripts/exec-tools.mjs next docs/specs/archived/spec-forensics` |
| exec-tools.mjs | report | 734 | `node plugins/sdd-kit/scripts/exec-tools.mjs report docs/specs/archived/spec-forensics` |
| exec-tools.mjs | extract | 318 | `node plugins/sdd-kit/scripts/exec-tools.mjs extract docs/specs/trim-cli-data R2.S1 R2.S2 AC3 AC4` |
| forensics-analysis-validate.mjs | validate (default) | 15 | `node plugins/sdd-kit/scripts/forensics-analysis-validate.mjs docs/specs/archived/forensics-analysis` |
| forensics.mjs | report (default) | 767 | `TMPDIR_FX=$(mktemp -d) && cp -r docs/specs/archived/forensics-analysis "$TMPDIR_FX/forensics-analysis" && node plugins/sdd-kit/scripts/forensics.mjs "$TMPDIR_FX/forensics-analysis"` |
| plan-tools.mjs | inspect-spec | 15 | `node plugins/sdd-kit/scripts/plan-tools.mjs inspect-spec docs/specs/archived/spec-forensics/spec.md` |
| plan-tools.mjs | check-plan | 24 | `node plugins/sdd-kit/scripts/plan-tools.mjs check-plan docs/specs/archived/spec-forensics/spec.md docs/specs/archived/spec-forensics/execution_plan.json` |
| token-cost.mjs | session report | 441 | `node plugins/sdd-kit/scripts/token-cost.mjs docs/specs/trim-cli-data/fixtures/token-cost/session-a.jsonl` |
| tokenizer.mjs | N/A (no stdout envelope) | 0 | `node plugins/sdd-kit/scripts/tokenizer.mjs` |
| verify-tools.mjs | report (default) | 726 | `node plugins/sdd-kit/scripts/verify-tools.mjs report docs/specs/archived/spec-forensics` |
| versioning-report.mjs | warnings (default) | 9 | `node plugins/sdd-kit/scripts/versioning-report.mjs .` |

## Notes on shape selection

- **exec-tools.mjs** is the multi-shape CLI called out by R2.S2/AC4: `next`,
  `report` and `extract` each emit a structurally distinct `data` payload.
  `init`, `complete`, `complete --batch`, `block` and `resume` were
  deliberately **not** invoked for this baseline — they mutate real state
  (git branch creation/checkout, git commits, `execution_state.json`
  writes, or re-running a task's stored test command), which this task's
  constraints (no commits, no branch switches, read/invoke only) rule out.
  Their `data` shapes remain unmeasured until a later pass can safely
  exercise them against disposable fixtures.
- **forensics.mjs** and **forensics-analysis-validate.mjs** both require a
  SPECDIR with pre-existing `execution_state.json` (and, for
  `forensics-analysis-validate.mjs`, a `forensics-analysis.md`); the
  archived `docs/specs/archived/forensics-analysis/` spec provides both.
  `forensics.mjs` additionally writes `forensics.json` into its SPECDIR, so
  it was run against a `cp -r` temp copy rather than the tracked archived
  directory to avoid touching committed files.
- **token-cost.mjs** needs a session transcript; rather than pointing it at
  a real (non-reproducible, ephemeral) `~/.claude/projects/...` session
  file, a small fixture session was committed at
  `docs/specs/trim-cli-data/fixtures/token-cost/` (one orchestrator message
  plus one `agentA` subagent message), mirroring the fixture-construction
  pattern already used by
  `plugins/sdd-kit/test/exec/token-cost-cli-io.test.mjs`.
- **budget-guard.mjs** and **versioning-report.mjs** run with no
  flags/against `.` respectively — both have real, in-repo defaults
  (`SKILLS_DIR`/`HWM_FIXTURES_DIR` under `plugins/sdd-kit/`, and `.` as
  `repoRoot`), so no synthetic fixture was needed.
- **verify-tools.mjs**'s `report` subcommand reruns every `[auto]` AC's
  stored test command against the current working tree (read-only — the
  mutating `git mv`/`git commit` path lives only in its `archive`
  subcommand, which was not invoked here).
