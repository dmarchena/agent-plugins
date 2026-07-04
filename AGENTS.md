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
- `spec/<slug>` — spec/documentation-only work (e.g. an sdd-kit `spec.md`
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
- Open a PR to `main` for review; merge once CI (`scripts/validate.sh` via
  GitHub Actions) is green. Don't push directly to `main`.
- After a PR merges, switch to `main` and pull; don't delete the
  now-merged feature branch unless asked.

## Plugin structure & versioning

See `README.md`'s "Conventions" and "Validation" sections — plugin layout,
manifest `version` (semver, bumped manually), and the `scripts/validate.sh`
gate are documented there and not repeated here.
