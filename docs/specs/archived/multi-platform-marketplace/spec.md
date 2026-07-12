# Spec: Multi-platform plugin marketplace

## Purpose

This repo is a public Claude Code plugin marketplace, but the wider agent
ecosystem has converged: as of mid-2026 OpenAI Codex and GitHub Copilot CLI
both ship Git-based plugin marketplaces that reuse the same primitives Claude
uses — `SKILL.md` skills, `.mcp.json`, lifecycle hooks, and the
`.claude-plugin/marketplace.json` catalog (Codex and Copilot both read it as a
"legacy-compatible" source). The repo is therefore only a small delta away
from being installable on all three agents, yet today it only advertises and
packages for Claude. This change adds the missing packaging and legibility
files so the same repo installs on Claude, Codex, and Copilot, and reads
clearly to any LLM or human contributor. It also adds a single tooling script
that both derives that cross-platform compatibility from an existing plugin and
scaffolds a new plugin already compatible with all three, so the marketplace
stays consistent as it grows. It is for the marketplace's own maintainer and
for users/agents on any of the three platforms.

Change type: feat

## Scope

**In scope:**
- Enrich the shared `.claude-plugin/marketplace.json` with the metadata the
  three platforms' documented schemas expect, without breaking Claude.
- Package each plugin for Codex and Copilot: generated per-plugin manifests
  (`.codex-plugin/plugin.json` for Codex, root `plugin.json` for Copilot) plus
  a Codex-consumable marketplace catalog, produced by a deterministic script
  and kept in sync by CI.
- Scaffold a new tri-platform-ready plugin from the same tooling: create the
  Claude-side skeleton (manifest + example skill), register it in the catalog,
  and emit the Codex/Copilot artifacts through the same derivation path.
- Add a root `llms.txt` index (llmstxt.org convention) describing the
  marketplace and linking each plugin.
- Add `CONTRIBUTING.md`, `SECURITY.md`, and a cross-platform install matrix in
  `README.md`.

**Out of scope (non-goals):**
- Actually running `codex`/`copilot` installs as a gate — verification is
  automated format/schema checks only (no live install on Codex/Copilot).
- Wrapping any plugin as a standalone MCP server (the plugins are skill/prompt
  packages, not tool servers).
- Per-platform instruction adapters (`copilot-instructions.md`, `.cursor/rules`)
  derived from `AGENTS.md`.
- `CODE_OF_CONDUCT.md` and any changelog/changes to plugin behavior.

## Functional Requirements

### R1 — Shared marketplace catalog stays valid and enriched

Depende de: —

The system SHALL keep `.claude-plugin/marketplace.json` (the catalog Claude,
Copilot, and Codex all read) valid under `claude plugin validate --strict`
while carrying `owner.email` and `metadata.version` at the marketplace level.

#### R1.S1 — Enriched catalog validates
- GIVEN the repo after this change
- WHEN `bash scripts/validate.sh` runs
- THEN it exits 0, and `.claude-plugin/marketplace.json` parses as JSON with a
  non-empty `owner.email` and a semver `metadata.version`

#### R1.S2 — No enrichment field breaks strict validation
- GIVEN the final committed `.claude-plugin/marketplace.json` (including any
  extra per-entry fields added for cross-platform ergonomics)
- WHEN `claude plugin validate <repo> --strict` runs
- THEN it exits 0 (if a field is rejected as strict-invalid, that field is not
  in the committed file — it lives in the Codex-only catalog from R2 instead)

### R2 — Codex/Copilot packaging generated and in sync

Depende de: —

The system SHALL provide, for every plugin under `plugins/`, a Codex per-plugin
manifest (`.codex-plugin/plugin.json`), a Copilot per-plugin manifest (root
`plugins/<name>/plugin.json`), and a Codex-consumable marketplace catalog — all
generated deterministically from the existing `.claude-plugin/` manifests and
verified in sync by CI.

#### R2.S1 — Generated Codex plugin manifest
- GIVEN a plugin `plugins/<name>/` with a `.claude-plugin/plugin.json`
- WHEN the generator script runs
- THEN `plugins/<name>/.codex-plugin/plugin.json` exists, parses as JSON, and
  its `name` equals `<name>`, its `version` equals the `version` in that
  plugin's `.claude-plugin/plugin.json`, and it has a non-empty `description`

#### R2.S2 — Generated Copilot plugin manifest
- GIVEN the same plugin `plugins/<name>/`
- WHEN the generator script runs
- THEN a root `plugins/<name>/plugin.json` exists, parses as JSON, and its
  `name` equals `<name>`, its `version` equals the `.claude-plugin` version,
  and it has a non-empty `description`

#### R2.S3 — Regeneration is a no-op (drift guard)
- GIVEN committed Codex manifests, Copilot manifests, and the Codex catalog
- WHEN the generator script is re-run and `git diff --exit-code` is checked
- THEN there is no diff (regeneration reproduces the committed files byte-for-byte)

#### R2.S4 — Codex catalog entries match the documented schema
- GIVEN the Codex-consumable marketplace catalog
- WHEN each entry under `plugins[]` is inspected
- THEN every entry has a `source`, a semver `version`, `policy.installation`,
  `policy.authentication`, and `category`

### R3 — LLM-legible root index

Depende de: —

The system SHALL provide a root `llms.txt` following the llmstxt.org shape (an
H1 title, a one-line/blockquote summary, then linked sections) that lists every
plugin in the marketplace.

#### R3.S1 — llms.txt lists every plugin
- GIVEN the repo after this change
- WHEN `llms.txt` at the repo root is read
- THEN it is non-empty, starts with a single `# ` H1 line, and contains one
  Markdown link for each plugin directory under `plugins/` (by plugin name)

### R4 — Contributor docs and install matrix

Depende de: R1, R2

The system SHALL provide `CONTRIBUTING.md`, `SECURITY.md`, and an install
matrix in `README.md` covering all three platforms.

#### R4.S1 — Community-health files and tri-platform install commands present
- GIVEN the repo after this change
- WHEN `CONTRIBUTING.md`, `SECURITY.md`, and `README.md` are read
- THEN `CONTRIBUTING.md` and `SECURITY.md` are non-empty, and `README.md`
  contains an install command for each platform: `claude plugin marketplace
  add`, `codex plugin marketplace add`, and `copilot plugin marketplace add`

### R5 — Scaffold a new tri-platform plugin

Depende de: R2

The system SHALL, from a single command run non-interactively (all fields via
flags), create under `plugins/<name>/` a new plugin already compatible with all
three platforms — Claude manifest, an example skill, catalog registration, and
the Codex/Copilot artifacts derived through the same path as R2 — and SHOULD
prompt for any field a human omits when run interactively. It MUST NOT overwrite
an existing plugin.

#### R5.S1 — Create a new plugin non-interactively
- GIVEN a `<name>` not present under `plugins/` and `--name`, `--description`,
  `--author` supplied as flags (`--version` optional, defaulting to `0.1.0`)
- WHEN the create command runs
- THEN `plugins/<name>/.claude-plugin/plugin.json` exists with `name`==`<name>`,
  a semver `version`, and the given `description`/`author`; an example
  `plugins/<name>/skills/<skill>/SKILL.md` exists; `plugins/<name>/.codex-plugin/plugin.json`
  and `plugins/<name>/plugin.json` exist and satisfy the same checks as R2.S1/R2.S2;
  `<name>` appears as an entry in `.claude-plugin/marketplace.json` and in the
  Codex catalog
- AND `bash scripts/validate.sh` exits 0 and re-running the generator leaves
  `git diff --exit-code` clean

#### R5.S2 — Refuse to clobber or accept a bad name
- GIVEN a `<name>` that already exists under `plugins/`, or a `<name>` that is
  not kebab-case
- WHEN the create command runs
- THEN it exits non-zero, prints an error message naming the offending `<name>`,
  and creates or modifies no files

### R-E2E — Same repo, three agents, all checks green

Depende de: R1, R2, R3, R4, R5

The system SHALL leave a fresh checkout that passes the repo's validation and
carries every cross-platform artifact in a consistent, regenerable state, and
SHALL let a maintainer add a new tri-platform plugin with one command.

#### R-E2E.S1 — Clean checkout validates end to end
- GIVEN a fresh checkout of the branch
- WHEN `bash scripts/validate.sh` runs, the generator is re-run, and
  `git diff --exit-code` is checked
- THEN `validate.sh` exits 0, there is no git diff, and `llms.txt`,
  `CONTRIBUTING.md`, `SECURITY.md`, each `plugins/<name>/.codex-plugin/plugin.json`,
  each root `plugins/<name>/plugin.json`, and the Codex catalog all exist

#### R-E2E.S2 — Scaffold then validate
- GIVEN a fresh checkout and a new plugin name not yet under `plugins/`
- WHEN the create command runs non-interactively with the required flags and
  then `bash scripts/validate.sh` runs
- THEN the new `plugins/<name>/` carries all three per-plugin manifests, is
  listed in `.claude-plugin/marketplace.json` and the Codex catalog, and
  `validate.sh` exits 0 with no drift

## Technical Requirements

- **Stack / framework:** JSON manifests + Markdown; generator script in the
  existing `scripts/` style (Bash or Node, matching `drift-check.sh`).
- **Integraciones:** targets three plugin ecosystems (Claude Code, Codex,
  Copilot CLI) via their documented marketplace/manifest formats; no runtime
  network calls.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** `SECURITY.md` states the vulnerability-reporting
  channel; no secrets added.
- **Datos / almacenamiento:** Codex/Copilot manifests are generated artifacts
  derived from `.claude-plugin/plugin.json`; the derivation is the single source
  of truth (mirrors the `shared/` → vendored-copy drift pattern).
- **Restricciones adicionales:** all artifacts in English (repo `AGENTS.md`
  rule); must not change any existing plugin's behavior or break existing Claude
  installs; the sync check integrates into `scripts/validate.sh` so CI blocks
  drift. **Preferred (not mandated): a single tooling script with a shared
  emit-core and two modes** — a non-interactive *derive* mode (extract fields
  from existing `.claude-plugin/plugin.json`; used by the drift check, so it
  never prompts) and a *create* mode (fields via flags, prompting only for
  omitted ones). The create mode reuses the same emit-core rather than writing
  manifests independently, so `.claude-plugin/plugin.json` stays the only source.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — `bash scripts/validate.sh` exits 0; `.claude-plugin/marketplace.json` has non-empty `owner.email` and semver `metadata.version`
- [ ] AC2 → R1.S2 [auto] — `claude plugin validate <repo> --strict` exits 0 on the committed marketplace file
- [ ] AC3 → R2.S1 [auto] — for each `plugins/<name>/`, `.codex-plugin/plugin.json` parses and has `name`==`<name>`, `version`==`.claude-plugin` version, non-empty `description`
- [ ] AC4 → R2.S2 [auto] — for each `plugins/<name>/`, root `plugin.json` parses and has `name`==`<name>`, `version`==`.claude-plugin` version, non-empty `description`
- [ ] AC5 → R2.S3 [auto] — re-running the generator leaves `git diff --exit-code` clean
- [ ] AC6 → R2.S4 [auto] — every Codex catalog entry has `source`, semver `version`, `policy.installation`, `policy.authentication`, `category`
- [ ] AC7 → R3.S1 [auto] — `llms.txt` is non-empty, starts with one `# ` H1, and has a Markdown link per plugin dir
- [ ] AC8 → R4.S1 [auto] — `CONTRIBUTING.md`/`SECURITY.md` non-empty; `README.md` contains `claude`/`codex`/`copilot plugin marketplace add`
- [ ] AC9 → R5.S1 [auto] — create command (flags) yields `plugins/<name>/` with all three per-plugin manifests + example `SKILL.md`, a `.claude-plugin/marketplace.json` and Codex-catalog entry for `<name>`; then `validate.sh` exits 0 with no drift
- [ ] AC10 → R5.S2 [auto] — create command with an existing or non-kebab-case `<name>` exits non-zero, names `<name>` in the error, and leaves the working tree unchanged (`git status --porcelain` empty)
- [ ] AC11 → R-E2E.S1 [auto] — fresh checkout: `validate.sh` exits 0, generator re-run yields no git diff, and all new artifacts exist
- [ ] AC12 → R-E2E.S2 [auto] — scaffold a new plugin non-interactively, then `validate.sh` exits 0 with the new plugin fully wired and no drift

## Assumptions & Open Questions

- **Strict tolerance of extra entry fields (drives single-vs-split catalog):**
  unknown whether `claude plugin validate --strict` rejects extra per-entry
  fields (`version`, `policy`, `category`) in `.claude-plugin/marketplace.json`.
  Copilot reads that same file and wants per-entry `version`. Default: attempt a
  single shared `.claude-plugin/marketplace.json`; if strict rejects the fields,
  keep it lean and move the enriched entries to the platforms' own catalog paths
  (`.agents/plugins/marketplace.json` for Codex, `.github/plugin/marketplace.json`
  for Copilot). AC2 holds either way.
- **Per-plugin manifest fallback (Codex & Copilot):** both docs mark their own
  native per-plugin manifest (`.codex-plugin/plugin.json` / root `plugin.json`)
  as the expected layout and neither confirms a fallback to
  `.claude-plugin/plugin.json` via legacy-compat. We generate both regardless
  (safe, near-zero cost), so install does not depend on the fallback; live
  behavior is not tested (verification is auto-format only).
- **Codex `category` values:** pick a sensible documented category per plugin
  (e.g. `Productivity`); exact allowed set not enumerated here.
