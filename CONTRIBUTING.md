# Contributing

Thanks for your interest in contributing to `agent-plugins`, a public plugin
marketplace for AI coding agents.

## Ground rules

- Read [`AGENTS.md`](AGENTS.md) first — it documents repo-wide conventions
  (language, branch naming, git flow, plugin structure & versioning,
  templates) that apply to every contribution, human or agent-authored.
- Every artifact committed to this repo (code, comments, commit messages, PR
  titles/descriptions, docs) is written in **English**, regardless of the
  language used during the conversation that produced it.

## Workflow

1. Fork or branch from `main`, using the branch prefix that matches your
   change (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/` — see
   `AGENTS.md`'s "Branch naming" section).
2. Make your change. If you're adding or modifying a plugin, follow the
   layout and manifest conventions in `README.md`'s "Conventions" section,
   and start new files from the matching skeleton in [`templates/`](templates/).
3. Run the validation gate locally before opening a PR:

   ```sh
   bash scripts/validate.sh
   ```

4. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
   (`<type>(<scope>): <subject>`), one commit per completed, verifiable
   checkpoint.
5. Open a PR to `main` using the repo's PR template
   (`.github/PULL_REQUEST_TEMPLATE.md`). CI runs `scripts/validate.sh`; merge
   once it's green.
6. If your change lands a `feat/`/`fix/`/`refactor/`/`chore/` branch, bump the
   affected plugin's `version` (semver) and add a `CHANGELOG.md` entry as
   part of that landing commit/merge — see AGENTS.md's "Plugin structure &
   versioning" section for which segment to bump.

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/dmarchena/agent-plugins/issues)
using the applicable issue template under `.github/ISSUE_TEMPLATE/`.

## Reporting security vulnerabilities

Do not open a public issue for security vulnerabilities — see
[`SECURITY.md`](SECURITY.md) for the private reporting process.
