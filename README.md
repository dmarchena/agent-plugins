# agent-plugins

**A public plugin marketplace for AI coding agents** — a monorepo of
Markdown plugins installable with Claude Code's native marketplace
mechanism, with agent-agnostic docs (`AGENTS.md`) so the plugins aren't tied
to a single agent.

[![validate](https://github.com/dmarchena/agent-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/dmarchena/agent-plugins/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Plugins

| Plugin | What it does |
|--------|--------------|
| [**`sdd-kit`**](plugins/sdd-kit/README.md) | Spec-driven development pipeline: **spec → plan → exec → verify**. An interview produces a testable `spec.md`, a planner derives a validated task DAG, an executor implements it via TDD with one commit per task, and a verifier archives the feature only when every acceptance criterion is green — plus `spec-forensics` for real per-task cost. |
| [**`markvault`**](plugins/markvault/README.md) | Deterministic, offline, ~0-token PDF-to-Markdown extraction: a local CLI with an interchangeable strategy chain (`pymupdf4llm` → `markitdown` → `pdftotext` → OCR) and a fail-closed anti-network-leak guardrail. The agent sees only the output path and statistics, never the document's text. |
| [**`token-diet`**](plugins/token-diet/README.md) | One explicit command that analyzes a `CLAUDE.md`/`AGENTS.md` (following symlinks and `@`-imports to the real source), recommends exactly one action, and — on confirmation — installs an opt-in, versioned token-saving ruleset. |
| [**`claude-token-debug`**](plugins/claude-token-debug/README.md) | Debugging toolkit for Claude Code itself: measures where the real token spend goes from session transcripts and inspects the installed CLI's built-in agent prompts and tool schemas. |

> Note: `spec-writer` was a standalone plugin up to version 0.1.x; it now
> lives as a skill inside `sdd-kit`.

## Install

```sh
claude plugin marketplace add dmarchena/agent-plugins
claude plugin install sdd-kit@agent-plugins
```

Then restart your session (or `/reload-plugins`).

### Install matrix

This marketplace is agent-agnostic; the same catalog installs from any of
the supported platforms:

| Platform | Add marketplace | Install a plugin |
|----------|------------------|-------------------|
| Claude Code | `claude plugin marketplace add dmarchena/agent-plugins` | `claude plugin install sdd-kit@agent-plugins` |
| Codex | `codex plugin marketplace add dmarchena/agent-plugins` | `codex plugin install sdd-kit@agent-plugins` |
| Copilot | `copilot plugin marketplace add dmarchena/agent-plugins` | `copilot plugin install sdd-kit@agent-plugins` |

## Conventions

- Repo-wide rules for any agent working here — language (English artifacts,
  bilingual chat), branch naming, git flow — live in [`AGENTS.md`](AGENTS.md).
- Each plugin lives in `plugins/<name>/` with a `.claude-plugin/plugin.json`
  manifest (`version` in **semver `X.Y.Z`**, bumped manually on every
  change), a `README.md` for humans, and an `AGENTS.md` describing its
  purpose and use to any agent without presupposing a specific one.
  Cross-platform manifests (`plugin.json` at the plugin root,
  `.codex-plugin/plugin.json`) are **generated** from the Claude manifest by
  `scripts/generate-cross-platform.mjs` — edit the source, not the derived
  copies.
- The marketplace catalog is `.claude-plugin/marketplace.json`.
- Versioning lives **only** in the manifests — no git tags/releases.
- Reusable skeletons (ADR, `SKILL.md`, command, changelog, manifest) live in
  [`templates/`](templates/).

## Validation

`scripts/validate.sh` is the single gate, run locally and in CI (GitHub
Actions) on every push, so an uninstallable state never reaches `main`. It
runs `claude plugin validate --strict` on the marketplace, checks every
plugin's `version` against semver, runs the plugin test suites, and checks
for drift in shared scripts and generated cross-platform artifacts.

```sh
bash scripts/validate.sh
```

## License

[MIT](LICENSE).
