# agent-plugins

Public plugin marketplace for AI coding agents — a monorepo of Markdown plugins
installable with Claude Code's native marketplace mechanism, with agent-agnostic
docs (AGENTS.md) so the plugins aren't tied to a single agent.

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

## Plugins

| Plugin | What it does |
|--------|--------------|
| [`sdd-kit`](plugins/sdd-kit/AGENTS.md) | Spec-driven development kit: `spec-writer` (grills you into a complete, testable `spec.md`) and `plan-writer` (turns that `spec.md` into a validated `execution_plan.json` task DAG), with future exec/verify stages planned. |

> Note: `spec-writer` was a standalone plugin up to version 0.1.x; it now lives as a skill inside `sdd-kit`.

## Conventions

- Repo-wide rules for any agent working here — language (English artifacts,
  bilingual chat), branch naming, git flow — live in [`AGENTS.md`](AGENTS.md).
- Each plugin lives in `plugins/<name>/` with a `.claude-plugin/plugin.json`
  manifest (`version` in **semver `X.Y.Z`**, bumped manually on every change)
  and an `AGENTS.md` (or `README.md`) describing its purpose and use without
  presupposing any specific agent.
- The marketplace catalog is `.claude-plugin/marketplace.json`.
- Versioning lives **only** in the manifests — no git tags/releases.

## Validation

`scripts/validate.sh` runs `claude plugin validate --strict` on the marketplace
and checks every plugin's `version` against semver. CI (GitHub Actions) runs it
on every push, so an uninstallable state never reaches `main`.

```sh
bash scripts/validate.sh
```

## License

[MIT](LICENSE).
