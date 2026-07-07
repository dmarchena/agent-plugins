# AGENTS.md

Project-wide conventions for any agent (or human) working in this repo, at
the repo level — as opposed to `plugins/<name>/AGENTS.md`, which documents
one plugin's purpose and usage for its own users.

## Language

**Every artifact produced in this repo is written in English** — code,
comments, commit messages, PR titles/descriptions, issue text, `spec.md` /
`execution_plan.json` content, `SKILL.md` files, `CHANGELOG.md` entries, ADRs,
docstrings, error messages. No exceptions, regardless of which language the
interview or conversation that produced them happened in.

**Interaction with the user (chat) may be in Spanish or English**, following
the user's own language per turn — this rule is about what gets committed to
the repo, not about how the agent talks to the user while producing it.

Rationale: this is a *public* marketplace repo (`README.md`'s own framing:
"agent-agnostic docs so the plugins aren't tied to a single agent"); anything
that ships — specs, commits, PR history — is part of that public surface and
should read naturally to any English-speaking contributor or user, even when
the working session that produced it was in Spanish.

## Branch naming

Prefix every working branch with the semantic type of change it carries:

- `feat/<slug>` — new functionality.
- `fix/<slug>` — bug fix.
- `docs/<slug>` — spec/documentation-only work (e.g. an sdd-kit `spec.md`
  authored on its own, before any plan or code).
- `chore/<slug>` — maintenance with no user-facing behavior change (deps,
  CI, formatting).
- `refactor/<slug>` — internal restructuring with no behavior change.

`<slug>` is kebab-case and names the feature/fix, not the plugin (e.g.
`feat/plan-executor-exec-plan`, not `feat/sdd-kit`). Do not use the older
`ia/<slug>` pattern still visible in this repo's earliest history (e.g.
`ia/plan-writer`, PR #1) — that was a loose example, not a rule, and has
been superseded by the prefixes above.

## Git flow

- One commit per completed, verifiable checkpoint (a subplan closing, a task
  going green) — not one giant commit per feature.
- Commit messages follow **[Conventional Commits](https://www.conventionalcommits.org/)**:
  `<type>(<scope>): <subject>`.
  - `<type>` — one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`,
    `style`, `ci`, `build`, `perf`. Matches the branch prefix for the change
    that produced the commit (a `feat/<slug>` branch produces `feat:` commits).
  - `<scope>` — the plugin or area touched (`sdd-kit`, `plan-executor`,
    `agents-md`...); omit only for changes with no single scope (e.g. a
    repo-wide rename).
  - `<subject>` — imperative mood, lowercase after the colon, no trailing
    period, in English (per "Language" above).
  - Example: `fix(plan-executor): use feat/ branch prefix instead of ia/`.
- Open a PR to `main` for review; merge once CI (`scripts/validate.sh` via
  GitHub Actions) is green. Don't push directly to `main` for feat/fix work.
  Small, self-contained doc/chore changes (a version bump, a changelog
  entry, an `AGENTS.md` fix) may be committed directly to `main`.
- After a PR merges, switch to `main` and pull; don't delete the
  now-merged feature branch unless asked.

## Plugin structure & versioning

See `README.md`'s "Conventions" and "Validation" sections — plugin layout,
manifest `version` (semver, bumped manually), and the `scripts/validate.sh`
gate are documented there and not repeated here.

**Bump that plugin's `version` and add a `CHANGELOG.md` entry when a branch's
work lands** — merging a `feat/`/`fix/`/... branch into `main`, or committing
a fix directly onto `main` — **not on every intermediate commit** on the
branch itself (those stay small, per-task checkpoints as usual). The bump
and changelog entry are part of that landing commit/merge, not a follow-up
chore to do later. `scripts/validate.sh` only checks that `version` is
well-formed semver, not that it was bumped — nothing else catches a missed
one, so this has to be deliberate at merge time.

**Which segment to bump is determined by the change type of the landing
branch**, not a judgment call:

| Change type                    | Segment bumped        |
| ------------------------------- | ---------------------- |
| `fix`, `chore`, `refactor`      | patch                  |
| `feat`                          | minor                  |
| `docs`                          | no bump required       |
| `major`                         | reserved and unused pre-`1.0.0` |

## Templates

Reusable skeletons for the recurring artifacts in this repo live in
[`templates/`](templates/): a new ADR, `SKILL.md`, slash command,
`CHANGELOG.md`, or plugin manifest starts by copying the matching file there
rather than an existing example. PRs use the template GitHub picks up
automatically, [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md).
