# token-diet

**Put your agent's instructions file on a diet** — one explicit command that
analyzes a `CLAUDE.md`/`AGENTS.md`, recommends exactly one action, and (only
after you confirm) installs an opt-in, versioned token-saving ruleset.

[![version](https://img.shields.io/badge/dynamic/json?label=version&query=%24.version&url=https%3A%2F%2Fraw.githubusercontent.com%2Fdmarchena%2Fagent-plugins%2Fmain%2Fplugins%2Ftoken-diet%2F.claude-plugin%2Fplugin.json&color=blue)](CHANGELOG.md)
[![validate](https://github.com/dmarchena/agent-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/dmarchena/agent-plugins/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](../../LICENSE)

> Every token in an always-loaded instructions file is re-billed on **every
> turn** of **every session**. token-diet installs a compact 10-rule inline
> decalogue plus a pointer to the full rules document (including a stricter
> *overspend* profile) copied alongside it — signal in context, detail on
> demand.

It is never auto-invoked by an LLM or a hook — **only explicit invocation**.

## Install

```sh
claude plugin marketplace add dmarchena/agent-plugins
claude plugin install token-diet@agent-plugins
```

Then restart your session (or `/reload-plugins`).

## Usage

```text
/token-diet:install                       # resolve target, analyze, recommend, apply
/token-diet:install path/to/AGENTS.md     # analyze an explicit target
```

## The flow

The whole flow lives in a single command prompt — no skill layer, no hooks:

1. **Analyze** — resolve the target (project `./CLAUDE.md`/`./AGENTS.md` vs
   user `~/.claude/CLAUDE.md`, asking when both exist) and report two facts:
   whether it already contains *any* token-saving policy, and whether it
   already carries this plugin's attribution mark and at which version.
2. **Recommend** — emit exactly one recommendation (`add` / `replace` /
   `extend` / `update` / `none`) with a one-line reason.
3. **Copy the rules doc** — place `assets/token-diet-rules.md` at the chosen
   destination (project → `docs/`, user → `~/.claude/`), warning when it
   falls outside the current repo.
4. **Apply on confirmation** — only after an explicit yes, write the base
   summary + pointer + versioned mark `Produced with token-diet (vX.Y.Z)`
   into the target, replacing (never duplicating) an existing token-diet
   block.

### Pointer-aware target resolution

Real instructions files are often shells: a `CLAUDE.md` that is just a
symlink or a single `@path` import of an `AGENTS.md`. token-diet follows
those pointers (with a bounded hop guard, warning before any redirect) so
the file holding the **real content** is the one analyzed and written.
Ambiguous or dangling pointers fall back to the literal file instead of
aborting.

## Layout

- [`commands/install.md`](commands/install.md) — the command's prompt (single entry point).
- [`assets/token-diet-rules.md`](assets/token-diet-rules.md) — the full ruleset copied to the destination (base decalogue + overspend profile).
- [`AGENTS.md`](AGENTS.md) — the flow documented for agents.
- [`CHANGELOG.md`](CHANGELOG.md) — version history.

## Agent compatibility

Markdown-only and agent-agnostic: the command assumes nothing beyond a
coding agent that can read/write local files and ask the user a question.

## License

[MIT](../../LICENSE) — part of the [`agent-plugins`](../../README.md)
marketplace.
