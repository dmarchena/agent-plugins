# Spec: Scoped commit on single-task completion

## Purpose

`plan-executor`'s single-task `complete` path commits a task's work with
`git add -A`, staging the entire working tree. Any unrelated untracked
work sitting in the repo (a spec being drafted, another plugin being
prototyped) is silently swept into that task's commit — this has already
landed on `main` twice, attributed to the wrong feature, needing follow-up
cleanup. This change makes the single-task path commit **only the files
the task actually touched**, so unrelated work can never be captured. It
serves anyone running `plan-executor` in a repo that also holds unrelated
in-progress work — i.e. the normal case.

## Scope

**In scope:**
- The single-task `complete` path (`exec-tools.mjs complete SPECDIR <id>`)
  commits only the files the task touched, plus the plan's state file.
- A safe failure when the task's file list can't be determined, instead of
  falling back to staging the whole tree.
- Correct per-task commit content when more than one task completion runs
  against the same working tree.

**Out of scope (non-goals):**
- The batch-close path (`cmdCompleteBatch`) — it already accepts a scoped
  `files` list per entry.
- Retroactively renumbering or rewriting commits already made.
- Full working-tree isolation between concurrent plans (e.g. git
  worktrees) — this spec guarantees commit *content* correctness under
  concurrency, not process-level isolation.

## Functional Requirements

### R1 — Scoped single-task commit

Depende de: —

The system MUST, when completing a single task, commit only the files that
task touched together with the plan's state file, and MUST NOT stage any
other file present in the working tree.

#### R1.S1 — Task commit ignores unrelated working-tree changes
- GIVEN a feature branch whose working tree holds an unrelated untracked
  directory (e.g. `scratch/wip/`) and a task that touched exactly
  `a.mjs` and `b.mjs`
- WHEN the single-task `complete` path runs for that task
- THEN the resulting commit's file list (`git show --stat HEAD`) contains
  exactly `a.mjs`, `b.mjs` and the plan's state file — and nothing else
- AND `scratch/wip/` remains untracked after the commit
  (`git status --porcelain` still lists it as `??`)

#### R1.S2 — No file list means fail loud, never sweep
- GIVEN a task completion invoked with no resolvable list of touched files
  (list empty or absent)
- WHEN the single-task `complete` path runs
- THEN no commit is created, the working tree is left unchanged (nothing
  staged), and the process exits non-zero with the message
  `complete: refusing to commit without an explicit file list — pass the task's touched files`

#### R1.S3 — Concurrent completions don't cross contents
- GIVEN two task completions against the same working tree, one naming
  `a.mjs` and the other naming `b.mjs`, with both files present uncommitted
- WHEN each completion commits its own task
- THEN the first commit's file list contains `a.mjs` (plus state) and never
  `b.mjs`, and the second contains `b.mjs` (plus state) and never `a.mjs`

### R-E2E — Full task close with unrelated work present

Depende de: R1

The system SHALL run a real task to completion through the single-task
`complete` path in a repo that also holds unrelated uncommitted work, and
produce a commit scoped strictly to the task's own files.

#### R-E2E.S1 — End-to-end scoped close
- GIVEN a valid plan on a feature branch, one of its tasks having touched a
  known set of files, and an unrelated untracked file sitting in the tree
- WHEN the task is completed via `exec-tools.mjs complete` and the full
  suite is run
- THEN the task's commit contains only its own files plus the state file,
  the unrelated file is still uncommitted, and the suite is green

## Technical Requirements

- **Stack / framework:** Node ESM, stdlib only (`node:child_process`), no
  npm dependencies — consistent with existing `scripts/exec/*.mjs`.
- **Integraciones:** git CLI (already the only external dependency).
- **Rendimiento (coste en tokens):** The change MUST NOT introduce any new
  per-completion LLM step or reasoning. The touched-file list is consumed
  from the executor's existing happy-path return contract (already produced
  today), and every decision about *which* files to stage runs in the
  deterministic Node script — zero token cost. Expected net impact:
  token-neutral on the happy path; a net *saving* versus today by removing
  the contamination-remediation loop (spotting the wrong commit, writing a
  follow-up untrack commit, re-doing the close). The only added token cost
  is in the R1.S2 edge, where the caller reacts to one explicit error
  instead of a silent wrong commit.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** The touched-file list is sourced from the
  executor's existing happy-path return contract ("files touched"); the
  single-task path passes it through instead of the current hardcoded
  `files: null`. No new field or artifact is introduced.
- **Restricciones adicionales:** All logic that decides *what* gets staged
  — resolving the file list, the anti-`add -A` guard, and the commit
  itself — MUST live in the deterministic script, not in an LLM step; the
  LLM contributes only the already-required "files touched" field, never a
  new decision. The commit MUST be pathspec-scoped (commit the named paths
  explicitly, e.g. `git commit -- <files>`), not dependent on the total
  index state — otherwise a concurrent completion staging its own files
  could be swept into this commit (R1.S3). The whole-tree `git add -A`
  fallback MUST NOT be reachable from the single-task path.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — commit `--stat` after a scoped close lists only
  the task's files + state; unrelated untracked path stays `??`
- [ ] AC2 → R1.S2 [auto] — completing with no file list exits non-zero with
  the exact message and produces no commit and no staged changes
- [ ] AC3 → R1.S3 [auto] — two completions naming disjoint file sets yield
  two commits whose file lists don't cross
- [ ] AC-E2E → R-E2E.S1 [auto] — end-to-end close in a repo with unrelated
  uncommitted work commits only the task's files and leaves the suite green

## Assumptions & Open Questions

- Assumes the executor's happy-path return already yields the touched-file
  list (the minimal return contract from 0.3.2); this spec wires it into
  the single-task path, it does not redefine that contract.
- A task that legitimately touches no files (verification-only, the shape
  in issue #11) will hit R1.S2 and fail loudly rather than sweep. That is
  treated as correct here; giving no-code tasks their own commit path is
  issue #11's scope, not this spec's.
- Commit atomicity under concurrency relies on git's own `index.lock` to
  serialize concurrent commits; the pathspec-scoped commit guarantees
  content correctness regardless of interleaving.
- The `git add -A` fallback in `stage()` is shared with the batch path; a
  batch entry with no `files` still reaches it, but that is out of scope
  here.
- Token cost was weighed against a fully script-derived list (a
  start-vs-complete `git status` diff, which would be zero-token *and*
  needs no declared list). That option was rejected because it cannot be
  concurrency-safe on a shared working tree (R1.S3): a diff sweeps in
  whatever a parallel plan changed during the window. The allowlist sourced
  from the existing return contract wins on both axes — concurrency-safe
  and no *additional* token cost, since the list is already produced.
