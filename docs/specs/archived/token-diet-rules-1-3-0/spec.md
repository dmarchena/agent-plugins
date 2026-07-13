# Spec: token-diet rules upgrade (v1.2.0 → v1.3.0)

## Purpose

The token-diet base decalogue states each saving rule generically, but real-world usage
(a heavily tuned user CLAUDE.md, cross-checked by an independent model review) surfaced
decision-level nuances that change concrete agent behavior — when NOT to use the cheap
explorer, when delegating costs more than inline, pinning the model on delegation, exact
batching thresholds, resume-vs-continue numbers, applying the "keep always-loaded minimal"
principle to plans/docs, and batching reader-updates when a shared datum changes shape.
This release folds those validated, agnostic nuances into the ruleset the plugin installs,
so every installation benefits without per-user customization. It also renames the shipped
rules document from `rules.md` to `token-diet-rules.md`, so the copy installed into a
target (e.g. `docs/` or `~/.claude/`) self-identifies its origin instead of landing as a
generic `rules.md`.

Change type: feat

## Scope

**In scope:**
- Rename the rules document `plugins/token-diet/assets/rules.md` to
  `assets/token-diet-rules.md`, updating every in-repo reference to the old path
  (`commands/install.md`, `README.md`, `AGENTS.md`, tests). New installs therefore
  copy a file named `token-diet-rules.md` by default (the command keeps the source
  file name).
- Extend the base inline block of `plugins/token-diet/assets/token-diet-rules.md`
  from 10 to 11 bullet lines: 5 existing lines enriched with a decision nuance,
  1 new line added.
- Add a detail section to `token-diet-rules.md` (loaded on demand, never inline)
  expanding each incorporated rule with its rationale and figures.
- Version bump 1.2.0 → 1.3.0 across manifests, command literals, and CHANGELOG.
- Update the plugin's tests to the new content and version.

**Out of scope (non-goals):**
- Any change to the `/token-diet:install` command flow (its phases R1–R4 stay as-is;
  only version literals and the inline-block content it installs change).
- Automatic migration of already-installed rulesets (the existing `update`
  recommendation path covers them on the next explicit invocation).
- User-environment-specific rules (handoff templates, hooks, `_local/` paths, git/PR
  policy) — only agnostic, validated rules are added.
- A "measured feedback loop" rule (writing findings to a living report). Rules ship
  static and validated; optimization dynamism arrives via new plugin versions.
- Changes to the "scrooge" profile content.
- Cleanup or migration of already-copied `rules.md` documents in existing
  installations: the `update` path copies the new `token-diet-rules.md` and
  re-points the pointer; the old copied `rules.md` is left in place.

## Functional Requirements

### R1 — Extended base inline block (11 lines)

Depende de: R5

The rules document's base section ("Base decalogue (caveman)") SHALL contain exactly
11 bullet lines, each a single schematic line in English, preserving the semantic
content of the current 10 rules and incorporating these decision nuances:

1. Cheap-explorer guardrail (into the exploring/locating line): the cheap explorer
   locates, it does NOT audit; paying more for the correct answer is cheap, paying
   less for one that forces a redo is expensive.
2. Delegation cost nuance + pin the model (into the delegate line): delegating is not
   free — the subagent cold-starts; for short tasks or already-loaded context, inline
   is cheaper; always pin the cheap model explicitly when delegating (the default
   inherits the expensive one).
3. Batching threshold (into the batch line): ≥2 independent operations with no
   deciding test between them → one message; test between edits only when the result
   decides the next step.
4. Resume decision with figures (into the cut-context line): after a pause at a task
   boundary, resume from disk in a fresh session (~5K tokens) instead of "continue"
   (re-drags the full context, potentially 100× more).
5. Hierarchy for plans/docs (into the keep-minimal line): the principle extends
   beyond CLAUDE.md — long plans/docs load whole into every session that touches
   them; keep a thin index and move detail to on-demand documents.
6. NEW line: before changing the shape of a shared datum, grep ALL its
   readers/consumers at once and fix them in the same batch — don't discover them
   through serial test failures.

#### R1.S1 — Base block has 11 lines with the new nuances
- GIVEN `plugins/token-diet/assets/token-diet-rules.md`
- WHEN its base section (from the "base"/"caveman" heading to the next heading) is read
- THEN it contains exactly 11 non-empty bullet lines
- AND the six nuances above are each identifiable by content (guardrail, delegation
  cost + model pinning, ≥2 threshold, resume-from-disk, plans/docs hierarchy,
  grep-all-readers) in their corresponding lines

#### R1.S2 — No original rule is lost
- GIVEN the 10 semantic points of the v1.2.0 decalogue (context=cost, read just
  enough, batch calls, deterministic→script, filter verbose output, delegate cheap,
  explore via read-only subagent, cut context, keep instructions minimal, don't
  break cache)
- WHEN the new base section is read
- THEN each of the 10 points remains present (enriched or verbatim) — none dropped

### R2 — On-demand detail section

Depende de: R1

The rules document SHALL contain a new detail section, placed after the base section
and before the "scrooge" profile section, with one entry per incorporated rule (the
6 of R1) giving its rationale and figures (e.g. the ~6× explore-cost ratio, the ~5K
resume vs 0.4–1M continue comparison), and the base section SHALL state in its intro
that the detail section expands its rules.

#### R2.S1 — Detail section present and linked
- GIVEN `plugins/token-diet/assets/token-diet-rules.md`
- WHEN read in full
- THEN a heading for the detail section exists between the base section and the
  profile section, with 6 identifiable entries mapping to R1's nuances
- AND the base section's introductory text references the detail section by name

#### R2.S2 — Scrooge profile untouched
- GIVEN the v1.2.0 "Profile: scrooge" section content
- WHEN the new `token-diet-rules.md` is read
- THEN a `profile` heading still exists after the base section and its 5 bullet
  lines are unchanged

### R3 — Version bump to 1.3.0

Depende de: R1, R2

All version pins SHALL move from 1.2.0 to 1.3.0: the three manifests
(`plugin.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`), the
version literals in `commands/install.md` (current-version references, the mark
`Produced with token-diet (v1.3.0)`, the R2.S1 reason literal
"already covered by token-diet v1.3.0"), and a new `## 1.3.0` CHANGELOG entry
describing the change (both the rule nuances and the rename to
`token-diet-rules.md`).

#### R3.S1 — All current-version literals updated
- GIVEN the plugin directory `plugins/token-diet/`
- WHEN grepping manifests, `commands/install.md` and `CHANGELOG.md`
- THEN the three manifests declare `"version": "1.3.0"`, `commands/install.md`
  contains the mark literal `Produced with token-diet (v1.3.0)` and the reason
  literal "already covered by token-diet v1.3.0", and `CHANGELOG.md` has a `## 1.3.0`
  entry
- AND no occurrence of `1.2.0` remains that denotes the CURRENT plugin version

#### R3.S2 — Older-version example preserved for the update path
- GIVEN `commands/install.md`'s R2.S2 (older mark → recommend `update`)
- WHEN read after the bump
- THEN it still specifies an older-version example naming a concrete jump to v1.3.0
  (e.g. v1.2.0 → v1.3.0), so the `update` recommendation path stays fully specified

### R4 — Test suite updated and green

Depende de: R1, R2, R3

The plugin's tests SHALL be updated to the new content, path and version — the
rules-doc test asserting the `assets/token-diet-rules.md` path, 11 base lines and
the presence of the detail section, and the command tests (`cmd-apply`, `cmd-base`,
`cmd-recommend`) asserting the v1.3.0 literals and the new path — and the whole
suite SHALL pass.

#### R4.S1 — Suite passes on the new content
- GIVEN the updated plugin files and tests
- WHEN `node --test plugins/token-diet/test/` runs from the repo root
- THEN all tests pass (exit code 0, 0 failures)

#### R4.S2 — Tests reject the old shape
- GIVEN the updated tests run against the OLD v1.2.0 `rules.md`/`install.md` content
- WHEN the assertions execute
- THEN they fail (missing `assets/token-diet-rules.md`, 10 ≠ 11 base lines,
  missing detail section, missing v1.3.0 literals) — proving the tests pin the
  new contract, not a tautology

### R5 — Rules document renamed to token-diet-rules.md

Depende de: —

The shipped rules document SHALL be renamed from `assets/rules.md` to
`assets/token-diet-rules.md`, and every in-repo reference to the old path
(`commands/install.md`, `README.md`, `AGENTS.md`, tests) SHALL point to the new
name, so the copy installed into a target self-identifies its origin.

#### R5.S1 — File renamed
- GIVEN the plugin directory `plugins/token-diet/`
- WHEN listing `assets/`
- THEN `assets/token-diet-rules.md` exists and `assets/rules.md` does not

#### R5.S2 — No stale references to the old path
- GIVEN the plugin directory `plugins/token-diet/`
- WHEN grepping it for `assets/rules.md`
- THEN no occurrence remains outside pre-1.3.0 `CHANGELOG.md` history entries

### R-E2E — Full release consistency

Depende de: R1, R2, R3, R4, R5

The plugin SHALL be internally consistent as a v1.3.0 release: content, version
pins, and tests all agree.

#### R-E2E.S1 — Release-consistency sweep
- GIVEN the repo at the completed change
- WHEN running the full test suite and grepping for the version/content invariants
- THEN `node --test plugins/token-diet/test/` exits 0, `assets/token-diet-rules.md`
  exists (and `assets/rules.md` does not), its base section has 11 bullets, the
  detail heading exists, all three manifests say 1.3.0, the mark literal is
  `Produced with token-diet (v1.3.0)`, no stale `assets/rules.md` reference remains
  outside pre-1.3.0 CHANGELOG history, and no stale current-version `1.2.0` remains
  outside CHANGELOG history and the R3.S2 older-version example

## Technical Requirements

- **Stack / framework:** Node built-in test runner (`node --test`), plain Markdown
  assets. No new dependencies.
- **Integraciones:** N/A (marketplace catalogs reference the plugin by path, no
  version pin — no catalog change needed).
- **Rendimiento:** the inline base block stays ≤ 12 lines (~≤450 tokens estimated);
  all added depth goes to the on-demand detail section.
- **Seguridad / privacidad:** N/A.
- **Datos / almacenamiento:** N/A.
- **Restricciones adicionales:** all shipped content in English (plugin convention
  since v1.2.0); rules must remain user-agnostic (no personal paths, hooks, or
  workflow names).

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — grep/count over `assets/token-diet-rules.md` base section: exactly 11
      bullets; keyword probes match each of the 6 nuances (e.g. "does not audit"/
      "locates", "pin"/"inherits", "≥2"/"independent", "~5K", "index", "grep"+"readers").
- [ ] AC2 → R1.S2 [auto] — keyword probe per original rule (context/re-billed, grep
      before read, batch/ONE message, script/CLI, filter verbose, cheapest model,
      read-only subagent, /clear, always-loaded minimal, cache) all still match.
- [ ] AC3 → R2.S1 [auto] — a heading matching the detail section exists between the
      base heading and the `profile` heading; 6 entries present; base intro references it.
- [ ] AC4 → R2.S2 [auto] — diff of the "Profile: scrooge" section vs v1.2.0: identical
      (content-wise; the file path changes per R5).
- [ ] AC5 → R3.S1 [auto] — grep: 3 manifests at `"1.3.0"`; `install.md` contains the
      v1.3.0 mark and reason literals; `CHANGELOG.md` contains `## 1.3.0`; no
      current-version `1.2.0` outside CHANGELOG history and the R3.S2 example.
- [ ] AC6 → R3.S2 [auto] — grep `install.md`: an explicit older→current jump example
      ending in `v1.3.0` exists in the R2.S2 section.
- [ ] AC7 → R4.S1 [auto] — `node --test plugins/token-diet/test/` exits 0.
- [ ] AC8 → R4.S2 [auto] — running the new rules-doc/cmd tests against the v1.2.0
      file contents (e.g. via `git stash`/worktree on the old revision) yields failures.
- [ ] AC9 → R5.S1 [auto] — `test -f plugins/token-diet/assets/token-diet-rules.md`
      succeeds and `test -e plugins/token-diet/assets/rules.md` fails.
- [ ] AC10 → R5.S2 [auto] — grep `assets/rules.md` over `plugins/token-diet/`: no
      hits outside pre-1.3.0 CHANGELOG entries.
- [ ] AC-E2E → R-E2E.S1 [auto] — single sweep script/commands combining AC1, AC3,
      AC5, AC9, AC10 greps + full test run, all green.

## Assumptions & Open Questions

- Exact English wording of the 6 enriched/new lines is left to the exec stage; the
  spec pins the semantic content and the one-line-per-rule caveman style, not the
  literal phrasing.
- The detail section's name (e.g. "Decision rules (detail)") is an exec-stage choice;
  the spec only fixes its position (between base and profile) and its 6 entries.
- The "measured feedback loop" rule was evaluated and explicitly rejected by the
  plugin owner: shipped rules are static and validated; dynamism arrives via versions.
- Source of the incorporated nuances: the plugin owner's tuned CLAUDE.md, cross-checked
  by an independent model review on 2026-07-13; sibling spec of
  `docs/specs/archived/token-diet/`.
- The install command copies the rules document "keeping the same file name", so the
  rename propagates to new installs automatically — no change to the command's copy
  logic is needed, only its path literals. Existing installs keep their old copied
  `rules.md` until the user removes it (explicitly out of scope).
