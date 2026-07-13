# Spec: Trim CLI `data` payloads to consumed fields

## Purpose

Phase 2 of the CLI I/O unification (issue #29, follow-up to #20): every sdd-kit
CLI now speaks the canonical `{ ok, data, error }` envelope, but each token a
script writes to stdout is re-read on every subsequent agent tool call (cost =
payload size × trips). Many payloads carry fields no consumer reads. This spec
audits the field↔consumer contract of all nine CLIs, removes dead fields, and
moves heavy consumed detail to file artifacts — so the agent re-drags only what
it actually uses. For sdd-kit maintainers.

Change type: refactor

## Scope

**In scope:**
- Field↔consumer audit of all nine CLIs under `plugins/sdd-kit/scripts/`:
  `budget-guard.mjs`, `exec-tools.mjs`, `forensics-analysis-validate.mjs`,
  `forensics.mjs`, `plan-tools.mjs`, `token-cost.mjs`, `tokenizer.mjs`,
  `verify-tools.mjs`, `versioning-report.mjs`, documented as a living contract
  in `plugins/sdd-kit/docs/cli-data-contract.md`.
- Baseline and after token measurements of each serialized `data` payload.
- Removal of every `data` field no consumer reads (trim applies only where the
  audit or measurement justifies it — untouched CLIs stay untouched).
- Moving detail to a file artifact where the *consumed* payload still exceeds
  the token threshold, following the existing pattern (e.g. `forensics.json`).
- Updating every affected consumer (SKILL.md, skill assets, commands, other
  scripts) and tests in the same change.

**Out of scope (non-goals):**
- The envelope shape `{ ok, data, error }` and the `scripts/lib/cli.mjs` API —
  this spec changes only the *content* of `data`.
- Per-CLI verbosity flags (`--verbose`/`--full`) to keep fat payloads available
  on demand; rich detail goes to file, period.

## Functional Requirements

### R1 — Field↔consumer contract audit

Depende de: —

The system SHALL document, for each of the nine CLIs, every field its `data`
payload emits and which repo file(s) consume it. Consumers are skills
(SKILL.md and assets), commands, and other scripts; the test suite is NOT a
consumer (tests follow the contract, they don't define it).

#### R1.S1 — Contract doc covers all nine CLIs
- GIVEN the nine CLI scripts under `plugins/sdd-kit/scripts/`
- WHEN the audit is complete
- THEN `plugins/sdd-kit/docs/cli-data-contract.md` exists with one section per
  CLI, and every field emitted in that CLI's `data` payload appears as a row
  naming its consumer file path(s) or the literal marker `unused`

#### R1.S2 — Test-only fields classified as unused
- GIVEN a `data` field referenced only by the test suite and no skill,
  command, or script
- WHEN the field is classified
- THEN its contract row reads `unused`

### R2 — Baseline token measurement

Depende de: —

The system SHALL record the token weight of each CLI's serialized `data`
payload, measured with the kit's own tokenizer, before any trimming.

#### R2.S1 — Per-payload baseline recorded
- GIVEN a representative invocation of each CLI
- WHEN its serialized `data` is measured with
  `plugins/sdd-kit/scripts/tokenizer.mjs`
- THEN `docs/specs/trim-cli-data/measurements.md` records a baseline token
  figure per payload, and the contract doc carries the weight per CLI

#### R2.S2 — Multi-payload CLIs measured per shape
- GIVEN a CLI whose subcommands emit distinct `data` shapes (e.g.
  `exec-tools.mjs`)
- WHEN measured
- THEN each distinct payload shape gets its own baseline figure

### R3 — Dead-field removal

Depende de: R1

The system SHALL remove from stdout every `data` field whose contract row is
`unused`; CLIs with nothing to trim are left unchanged.

#### R3.S1 — Unused fields disappear from stdout
- GIVEN a CLI whose contract lists one or more `unused` fields
- WHEN the trim lands
- THEN a representative invocation's stdout `data` no longer contains those
  field names, and the plugin's test suite (`scripts/validate.sh` and the
  sdd-kit tests) passes

#### R3.S2 — Clean CLIs are not touched
- GIVEN a CLI with no `unused` fields and a consumed payload at or under the
  threshold
- WHEN the trim pass evaluates it
- THEN its script and payload are unchanged and its contract section records
  `no change`

### R4 — Heavy consumed detail moves to file

Depende de: R1, R2

The system SHALL, for any CLI whose *consumed* `data` exceeds 200 tokens,
move the rich detail to a file artifact and keep stdout lean with the file
path — unless every field is read on every invocation, in which case moving
it would only add a read trip.

#### R4.S1 — Restructured payload fits the threshold
- GIVEN a CLI whose consumed `data` measures over 200 tokens
- WHEN it is restructured
- THEN its stdout `data` measures ≤ 200 tokens with `tokenizer.mjs`, includes
  the path of a file containing the full detail, and every consumer reads the
  file only when it needs the detail

#### R4.S2 — Fully-consumed heavy payloads stay on stdout
- GIVEN a heavy payload whose every field is read by its consumer on every
  invocation
- WHEN evaluated for restructure
- THEN it stays on stdout and its contract section records the justification

### R-E2E — Measured reduction with no consumer broken

Depende de: R1, R2, R3, R4

The system SHALL show, after all trims land, a net token reduction across the
measured payloads while every consumed field remains reachable (on stdout or
in the referenced file) and the full test suite stays green.

#### R-E2E.S1 — After-measurement confirms the diet
- GIVEN the branch with all audit, trim, and restructure work applied
- WHEN each payload is re-measured and the full suite runs
- THEN `docs/specs/trim-cli-data/measurements.md` shows before/after figures
  with a total reduction > 0, every field marked consumed in the contract is
  present in stdout or in the referenced detail file, and `scripts/validate.sh`
  exits 0

## Technical Requirements

- **Stack / framework:** Node.js ESM (`.mjs`) scripts, as today; envelope
  served from `scripts/lib/cli.mjs` (unchanged).
- **Integraciones:** N/A — measurement uses the kit's own `tokenizer.mjs`.
- **Rendimiento:** threshold = 200 tokens of serialized `data`, measured with
  `tokenizer.mjs`; restructured CLIs must land at ≤ 200.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** living contract at
  `plugins/sdd-kit/docs/cli-data-contract.md`; measurement evidence at
  `docs/specs/trim-cli-data/measurements.md`; detail files follow the existing
  file-artifact pattern (e.g. `forensics.json`).
- **Restricciones adicionales:** envelope shape and `cli.mjs` public API
  untouched; no new verbosity flags; all artifacts in English.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — `plugins/sdd-kit/docs/cli-data-contract.md` has a
      section for each of the nine CLIs and every payload field row names a
      consumer path or `unused`
- [ ] AC2 → R1.S2 [auto] — fields referenced only by tests carry the `unused`
      marker in the contract doc
- [ ] AC3 → R2.S1 [auto] — `docs/specs/trim-cli-data/measurements.md` lists a
      baseline token figure for every CLI payload
- [ ] AC4 → R2.S2 [auto] — multi-shape CLIs have one baseline figure per
      distinct payload shape
- [ ] AC5 → R3.S1 [auto] — for each trimmed CLI, a representative invocation's
      stdout contains none of its `unused` field names and the test suite
      passes
- [ ] AC6 → R3.S2 [auto] — CLIs with nothing to trim show no script diff and a
      `no change` contract entry
- [ ] AC7 → R4.S1 [auto] — each restructured CLI's stdout `data` measures
      ≤ 200 tokens via `tokenizer.mjs` and names an existing detail file
- [ ] AC8 → R4.S2 [auto] — heavy-but-fully-consumed payloads have a recorded
      justification in the contract doc instead of a detail file
- [ ] AC-E2E → R-E2E.S1 [auto] — measurements.md shows total after < before,
      every consumed field is reachable, and `scripts/validate.sh` exits 0

## Assumptions & Open Questions

- Representative invocations can be synthesized from repo fixtures and
  archived `docs/specs/archived/*/` execution states; no live session capture
  is required for the measurements.
- All consumers of these CLIs live inside this repo (skills, commands,
  scripts); no external consumer contract exists.
- The 200-token threshold applies to the serialized `data` value, not the
  whole envelope; the fixed envelope overhead (~10-15 tokens) is accepted as
  is (non-goal per issue #29).
- The audit is delegable to an austere model (mechanical grep of field names
  across consumers); the trim/restructure decisions stay with the orchestrator
  — noted for the plan stage, not binding.
