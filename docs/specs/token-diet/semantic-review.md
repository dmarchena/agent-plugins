# AC9 — Semantic review of R2 classification (manual)

**Spec:** `docs/specs/token-diet/spec.md` — AC9 → R2 `[manual]`
**Under review:** `plugins/token-diet/commands/install.md`, Fase 2 (R2), recommendation logic (lines 71-85).

AC9 requires human judgment that the semantic classification `add` / `replace` /
`extend` is correct for one case of each type. This is genuine free-text
interpretation, not a literal match: the only literal install.md looks for
mechanically is the attribution mark `Produced with token-diet (v...)`. Whether a
policy exists at all (hecho a) and whether it is *foreign* vs *token-diet's own*
is agent judgment. Below, each fixture is traced against install.md's ordered
rules 1→2→3. None of the three fixtures carries the mark, so rules 4/5
(`update`/`none`) never fire — the trio is decided purely by rules 1-3.

## R2 logic under review (install.md, in order)

1. hecho (a) = no policy → `add`
2. hecho (a) = yes, but foreign or conflicting → `replace`
3. hecho (a) = yes, is token-diet's own but incomplete → `extend`
4. mark present, older version → `update`
5. mark present, current version → `none`

---

### Case A — Foreign / conflicting token-saving policy

**Fixture** (target `CLAUDE.md`):

```
# Project rules

## Cost control
- Never read more than one file per task; if unsure, skip reading and guess.
- Disable all subagents; do everything in the main thread to save spend.
- Batch nothing — answer immediately with the shortest possible reply.
```

This is unmistakably a token-saving policy (hecho a = yes), but it is authored by
someone else and its advice actively conflicts with token-diet's ruleset
(token-diet *delegates* mechanical work to cheap subagents and *batches* tool
calls; this fixture forbids both). No `Produced with token-diet (v` mark.

- **Expected recommendation:** `replace`
- **Trace:** rule 1 skipped (policy present); rule 2 fires — foreign/conflicting
  policy → `replace`.
- **Verdict:** correct — install.md rule 2 maps a foreign/conflicting policy to
  `replace`, which is what this fixture should yield.

### Case B — Own but incomplete token-diet policy

**Fixture** (target `CLAUDE.md`):

```
# Project rules

## Token saving
- Agrupa llamadas a herramientas independientes en un solo turno; no las secuencies una a una.
- Delega trabajo mecánico (búsquedas, renombrados, checks) al modelo más barato que lo resuelva.
```

These are two verbatim bullets from token-diet's own "Resumen base (caveman)"
(`plugins/token-diet/assets/rules.md`), so the policy is recognizably
token-diet's own (hecho a = yes, own), but the remaining ~6 base bullets and all
profiles are missing → incomplete. Crucially there is **no** attribution mark, so
rules 4/5 do not apply; the own-vs-foreign call rests on the semantic judgment
that the content derives from token-diet.

- **Expected recommendation:** `extend`
- **Trace:** rule 1 skipped; rule 2 skipped (it *is* token-diet's own, not
  foreign); rule 3 fires — own but incomplete → `extend`.
- **Verdict:** correct — install.md rule 3 maps an own-but-incomplete policy to
  `extend`. The distinction "own vs foreign" without a mark is exactly the
  free-text judgment AC9 is `[manual]` for; install.md's mapping, once that
  judgment is made, is sound.

### Case C — No token-saving policy

**Fixture** (target `CLAUDE.md`):

```
# Project rules

## Style
- Use 2-space indentation.
- Write commit messages in the imperative mood.
- Prefer descriptive variable names over abbreviations.
```

Ordinary project conventions with nothing about token/cost economy, conciseness,
avoiding re-reads, cheap tools, or delegation (hecho a = no). No mark.

- **Expected recommendation:** `add`
- **Trace:** rule 1 fires immediately — no policy → `add`.
- **Verdict:** correct — install.md rule 1 maps the no-policy case to `add`.

---

## Overall AC9 verdict

**correct.** install.md's R2 classification is correct for one case of each type:
foreign/conflicting → `replace` (Case A), own-but-incomplete → `extend` (Case B),
and no policy → `add` (Case C). The ordered evaluation (rules 1→2→3) is
unambiguous for these three inputs because none carries the attribution mark, so
the `update`/`none` rules cannot pre-empt the semantic trio. The one point that
genuinely depends on human interpretation — deciding that an *unmarked* policy is
token-diet's own (Case B) rather than foreign (Case A) — is precisely why AC9 is
`[manual]`; install.md correctly delegates that call to agent judgment and maps
each resolved case to the right action.
