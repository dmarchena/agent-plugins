# Spec: token-diet — resolve the real source between CLAUDE.md / AGENTS.md

## Purpose

`token-diet:install` resolves its target only as `./CLAUDE.md` or
`~/.claude/CLAUDE.md` and then analyzes and writes to that exact file. Two
gaps follow. First, a repo whose instructions live in `AGENTS.md` (a common
convention, including this repo) is never offered as a target. Second, when
the resolved file is not the real source but a *pointer* to it — a filesystem
symlink, or a Claude-Code `@path` import whose body lives elsewhere (e.g. a
`CLAUDE.md` whose only content is `@AGENTS.md`) — the command reads the wrong
place (misses the policy/mark that lives in the source), recommends the wrong
action, and writes the token-diet block into the pointer instead of the
source, breaking idempotency-by-mark. This change makes Phase 1 pick a single
**effective source** from the project's `CLAUDE.md` and `AGENTS.md`: use
whichever exists, and when both exist, follow pointers so the file that holds
the real text — not a symlink or `@`-import shell — is the one analyzed and
written. Audience: anyone running the install flow on a repo that uses
`AGENTS.md` and/or keeps `CLAUDE.md` as a thin `@AGENTS.md` pointer.

Change type: feat

## Scope

**In scope:**
- Choosing the effective source between project `./CLAUDE.md` and
  `./AGENTS.md`: the sole existing file, or — when both exist — the one
  holding the real content once pointers are followed.
- Detecting that a file is a filesystem **symlink** and using its real
  destination as the effective source.
- Detecting that a file is a **pure `@`-import pointer** (its content is only
  Claude-Code `@path` import line(s), no own policy content) and using the
  imported file as the effective source.
- Resolving a **chained** pointer (symlink→symlink, or a pointer whose source
  is itself a pointer) to the final real source, with a bounded hop guard.
- **Warning and confirming** before any redirect; on rejection, no redirect.
- Handling **ambiguity** (multiple imports, two independent sources) and
  **unresolvable** pointers (dangling symlink, missing import) without
  aborting.

**Out of scope (non-goals):**
- Pointer mechanisms other than filesystem symlinks and Claude-Code `@path`
  imports (no HTTP includes, no globbed/wildcard imports, no other syntaxes).
- User-scope `AGENTS.md` (`~/.claude/AGENTS.md`): the `CLAUDE.md`/`AGENTS.md`
  pairing is resolved at **project** scope only; user scope stays
  `~/.claude/CLAUDE.md` as today.
- Redirecting when the target has its **own** policy content alongside an
  import (mixed content stays on the target — see R3.S2).
- Changing the recommend (R2), copy (R3), or apply (R4) *phases* of the
  existing flow beyond swapping *which file* is the effective source.

## Functional Requirements

### R1 — Resolve the effective source between CLAUDE.md and AGENTS.md

Depende de: R2

The command SHALL choose a single effective source file from the project's
`./CLAUDE.md` and `./AGENTS.md`: use whichever one exists, and when both
exist, follow pointers (R2) so the file holding the real content is the one
analyzed (Phase 1) and written (Phase 4).

#### R1.S1 — Only one of the two exists
- GIVEN a project where exactly one of `./CLAUDE.md` and `./AGENTS.md` exists
- WHEN the command resolves the target in Phase 1
- THEN it uses that existing file as the source, without asking which and
  without reporting the target as missing

#### R1.S2 — Both exist, one points to the other
- GIVEN both `./CLAUDE.md` and `./AGENTS.md` exist and one of them is a
  pointer (symlink or pure `@`-import, per R2) to the other
- WHEN the command resolves the target in Phase 1
- THEN it identifies the file that holds the real text as the source and,
  after the R2 warn-and-confirm, analyzes and writes to that source, not the
  pointer — without asking the user to choose between the two

#### R1.S3 — Both exist with independent content
- GIVEN both `./CLAUDE.md` and `./AGENTS.md` exist, each with its own content,
  and neither is a pointer to the other
- WHEN the command resolves the target in Phase 1
- THEN it asks the user which of the two to use as the source, picking neither
  on its own

### R2 — Detect and resolve a pointer to its real source

Depende de: —

The command SHALL detect whether a file is a symlink or a pure `@`-import
pointer and, on user confirmation, resolve it to the real source file used
for both the Phase-1 analysis and any Phase-4 write.

#### R2.S1 — Symlink pointer, confirmed
- GIVEN a target file that is a symlink whose destination is an existing
  regular file `real.md`
- WHEN the command inspects it in Phase 1
- THEN it reports that the file is a symlink pointing to `real.md` and asks
  for confirmation before continuing
- AND on confirmation, the file it reads for analysis and (in Phase 4) writes
  the token-diet block into is `real.md`, not the symlink path

#### R2.S2 — Pure single-import pointer, confirmed
- GIVEN a target file whose only non-blank, non-comment content is one import
  line `@AGENTS.md` and `AGENTS.md` exists
- WHEN the command inspects it in Phase 1
- THEN it reports that the file is a pure import pointer to `AGENTS.md` and
  asks for confirmation
- AND on confirmation, the effective source for analysis and writes is
  `AGENTS.md`

#### R2.S3 — Chained pointer resolved to final source
- GIVEN a target that points (via symlink or a pure `@`-import) to a file that
  is itself a pointer, forming a finite chain to a real source
- WHEN the command resolves the pointer
- THEN it follows the chain to the final real source file, and if the chain
  loops or exceeds 3 hops it stops and reports the pointer as unresolvable
  (R4) rather than looping

#### R2.S4 — Redirect rejected
- GIVEN a detected pointer for which the command has asked to redirect
- WHEN the user rejects the redirect
- THEN the command does not read from or write to the source file; it reports
  that no redirect was applied and continues on the literal file, modifying
  nothing without the normal Phase-4 confirmation

### R3 — Ambiguous and non-pointer targets

Depende de: R2

The command SHALL NOT redirect silently when the source is ambiguous or when
the target is not a pure pointer.

#### R3.S1 — Multiple imports, user chooses
- GIVEN a pure-pointer file whose content is two or more import lines (e.g.
  `@AGENTS.md` and `@extra.md`) with no single obvious source
- WHEN the command inspects it in Phase 1
- THEN it lists the candidate import destinations and asks the user which one
  to use as the effective source, picking none on its own

#### R3.S2 — Mixed content stays on the file
- GIVEN a file that contains its own policy/instruction text AND an `@import`
  line
- WHEN the command inspects it in Phase 1
- THEN it treats the file as a non-pure-pointer, uses that file itself as the
  effective source (no redirect), and notes that an import is present

### R4 — Unresolvable pointer falls back to the literal file

Depende de: R2

The command SHALL, when a detected pointer cannot be resolved to an existing
file, report it and continue on the literal file without aborting.

#### R4.S1 — Dangling symlink
- GIVEN a target file that is a symlink whose destination does not exist
- WHEN the command inspects it in Phase 1
- THEN it reports that the pointer does not resolve and continues the flow on
  the literal file path (which then follows the existing base "target does
  not exist" / offer-to-create behavior), never aborting with an error

#### R4.S2 — Missing import target
- GIVEN a pure-pointer file whose single import `@missing.md` names a file
  that does not exist
- WHEN the command inspects it in Phase 1
- THEN it reports that the import target does not resolve and continues on the
  literal file, without aborting

### R-E2E — Install onto a `@`-import pointer, end to end

Depende de: R1, R2, R3, R4

The command SHALL, run against a project whose `CLAUDE.md` is a pure
`@AGENTS.md` pointer and whose `AGENTS.md` has no token-diet block, install
the ruleset into `AGENTS.md` and leave the pointer untouched, and be
idempotent on re-run.

#### R-E2E.S1 — Pointer install then re-run
- GIVEN `CLAUDE.md` whose only content is `@AGENTS.md`, and `AGENTS.md` with
  its own content but no token-diet policy or mark
- WHEN the user runs the command, confirms the redirect to `AGENTS.md`, and
  confirms the recommended `add`
- THEN the base decalogue, the doc pointer, and the mark
  `Produced with token-diet (v<current>)` are written into `AGENTS.md`, and
  `CLAUDE.md` still contains only `@AGENTS.md`
- AND a second run re-detects the pointer, finds the mark at the current
  version in `AGENTS.md`, and per the base flow recommends `none`, adding no
  second block

## Technical Requirements

- **Stack / framework:** N/A — the whole flow is the prompt body of
  `plugins/token-diet/commands/install.md`; this change edits that prompt
  (plus `AGENTS.md`/`README.md`/`CHANGELOG.md` and Node `node:test` specs).
- **Integraciones:** N/A.
- **Rendimiento:** N/A.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** operates on local files only (`CLAUDE.md`,
  `AGENTS.md`, symlink destinations, imported files).
- **Restricciones adicionales:** must not regress the existing four-phase
  flow (R1–R4) documented in `install.md`; source resolution and pointer
  redirection are additive steps between resolving the target and analyzing
  it. Repo language rule: all artifacts in English. Landing bumps `token-diet`
  minor version + CHANGELOG.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — `install.md` instructs to use the sole existing
  file of `./CLAUDE.md`/`./AGENTS.md` as the source, without asking and
  without reporting a missing target.
- [ ] AC2 → R1.S2 [auto] — `install.md` instructs that, when both exist and
  one is a pointer to the other, the file holding the real text is the source
  (redirect, don't ask which).
- [ ] AC3 → R1.S3 [auto] — `install.md` instructs to ask which of
  `CLAUDE.md`/`AGENTS.md` to use when both hold independent own content.
- [ ] AC4 → R2.S1 [auto] — `install.md` instructs to detect a symlink and use
  its real destination as the effective source for analysis/write.
- [ ] AC5 → R2.S2 [auto] — `install.md` instructs to detect a pure `@`-import
  pointer and use the imported file as the effective source.
- [ ] AC6 → R2.S3 [auto] — `install.md` instructs to follow a pointer chain to
  the final source with a bounded guard of 3 hops.
- [ ] AC7 → R2.S4 [auto] — `install.md` instructs that a rejected redirect
  reads/writes nothing in the source and falls back to the literal file.
- [ ] AC8 → R3.S1 [auto] — `install.md` instructs to ask the user which import
  to use when there is more than one.
- [ ] AC9 → R3.S2 [auto] — `install.md` instructs that mixed content (own text
  + import) is not a pure pointer and stays on the file.
- [ ] AC10 → R4.S1 [auto] — `install.md` instructs to report a dangling
  symlink and continue on the literal file without aborting.
- [ ] AC11 → R4.S2 [auto] — `install.md` instructs to report a missing import
  target and continue on the literal file without aborting.
- [ ] AC-E2E → R-E2E.S1 [manual] — a real run against a `@AGENTS.md`-pointer
  `CLAUDE.md` writes the block+mark into `AGENTS.md`, leaves `CLAUDE.md` as
  only `@AGENTS.md`, and a second run recommends `none` with no duplicate
  block. Manual because it exercises the LLM-driven prompt end to end, which
  the semantic-review tests can only partially proxy.

## Assumptions & Open Questions

- "Pure pointer" = a file whose only non-blank, non-comment content is one or
  more Claude-Code `@path` import lines. A single import → redirect; multiple
  → ask (R3.S1); any own policy text present → mixed content, no redirect
  (R3.S2).
- The `@path` import syntax recognized is Claude-Code's `@`-prefixed file
  reference; other agents' include mechanisms are out of scope.
- The `CLAUDE.md`/`AGENTS.md` pairing (R1) is resolved at **project** scope
  (`./`); user-scope resolution stays `~/.claude/CLAUDE.md` as today.
- Two-independent-sources (R1.S3) is the residual case where neither file
  points to the other and both carry real content; the command asks the user
  which to use rather than guessing (decided; no fixed precedence).
- The chained-pointer hop guard (R2.S3) is a fixed bound of **3 hops**.
