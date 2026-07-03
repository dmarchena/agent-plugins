# agent-plugins

Public plugin marketplace for AI coding agents — a monorepo of Markdown plugins
installable with Claude Code's native marketplace mechanism, with agent-agnostic
docs (AGENTS.md) so the plugins aren't tied to a single agent.

## Install

```sh
claude plugin marketplace add dmarchena/agent-plugins
claude plugin install spec-writer@agent-plugins
```

Then restart your session (or `/reload-plugins`).

## Plugins

| Plugin | What it does |
|--------|--------------|
| [`spec-writer`](plugins/spec-writer/AGENTS.md) | Interview-driven skill that grills you into a complete, testable `spec.md` before any planning or coding. |

## Conventions

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
