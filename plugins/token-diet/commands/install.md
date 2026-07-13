---
description: Analyzes the target CLAUDE.md/AGENTS.md, recommends an action and, on confirmation, installs the token-diet token-saving ruleset.
argument-hint: "[optional path to the target file; if omitted, asks project vs user]"
---

You are the single entry point of the `token-diet` plugin. This command runs
only on explicit user invocation — never trigger it yourself nor suggest it
as a side effect of another task; if it was not explicitly invoked, do not
run this flow.

Arguments received: $ARGUMENTS

The full flow has four phases. This version of the command implements all
four (R1, R2, R3, R4).

## Phase 1 — Analyze the target file (R1)

1. **Resolve the target.** The two possible candidates are the project
   `CLAUDE.md` (`./CLAUDE.md`, relative to the current working directory)
   and the user `CLAUDE.md` (`~/.claude/CLAUDE.md`). If an explicit path was
   passed in `$ARGUMENTS`, use it as the target without asking. Otherwise:
   - If only one of the two exists, use it directly.
   - If **both** exist, **ask the user** (project `./CLAUDE.md` vs user
     `~/.claude/CLAUDE.md`) before continuing — do not assume which one
     they want.
   - If neither exists yet, treat the project one (`./CLAUDE.md`) as the
     default target for the rest of the flow.

2. **R1.S2 — The target file does not exist.** If the resolved file does
   not exist on disk: clearly report that the target file does not exist
   and offer to create a new CLAUDE.md before continuing with the rest of
   the flow. This is NOT an error: continue without aborting (do not abort
   with an error) — if the user accepts, create it empty (or with a minimal
   heading) and proceed with the analysis on the freshly created file; if
   they decline, stop the flow here without touching anything else.

3. **R1.S1 — Analyze the content.** If the file does exist, read it in full
   and determine, using your own semantic judgment over free text, two
   independent facts:
   - **(a) Does it already contain any token-saving policy?** — written in
     any form (do not look for a fixed literal; judge the content:
     instructions about being concise, avoiding unnecessary re-reads,
     preferring cheap tools, etc. count as policy, whether or not they come
     from `token-diet`).
   - **(b) Does it contain the token-diet attribution mark?** — the only
     literal searched mechanically is `Produced with token-diet (v` (the
     pattern `Produced with token-diet (vX.Y.Z)`); if it appears, extract
     the exact version between parentheses.
   - If the file does **not** mention any token-saving policy and does not
     contain the mark, report it with these two exact literals (do not
     paraphrase them, they are R1.S1's output contract):
     - `no token-saving policy detected`
     - `no token-diet mark`
   - If there is a policy and/or a mark, report it just as explicitly:
     state whether the detected policy is foreign or token-diet's own, and
     if there is a mark, which exact version.

At the end of phase 1 you must hold, in conversation memory: the resolved
target (absolute path), fact (a) policy yes/no, and fact (b) mark yes/no +
version if any. This feeds phase 2.

## Phase 2 — Recommend an action (R2)

From the two facts of phase 1 (policy yes/no + whose, mark yes/no +
version), emit **exactly one recommendation** — never more than one — from
`{add, replace, extend, update, none}`, together with a one-line reason
derived from the analysis. Apply this logic, in this order:

1. **No token-saving policy detected** (fact (a) = no) → recommend `add`.
   Reason: there is nothing to install on top of.
2. **Foreign or conflicting policy** (fact (a) = yes, but it is not
   token-diet's, or it clashes with what token-diet would install) →
   recommend `replace`. Reason: the detected policy is not token-diet's and
   must be replaced.
3. **Own but incomplete policy** (fact (a) = yes and it is token-diet's,
   but parts of the ruleset are missing) → recommend `extend`. Reason: an
   own base exists, it needs completing.
4. **Mark present with a version older than the current one (1.3.0)** →
   recommend `update`, explicitly naming the detected version jump (for
   example, v1.2.0 → v1.3.0).
5. **Mark present with a version equal to the current one (1.3.0)** →
   recommend `none` with the reason "already covered by token-diet v1.3.0"
   and **propose no change**.

### R2.S1 — Mark present at the current version (do not re-analyze in a loop)
If the target file contains the mark `Produced with token-diet (v1.3.0)`
and the installed plugin is also at v1.3.0: recommend `none` with the exact
reason "already covered by token-diet v1.3.0" and propose no change — there
is no need to continue with phases 3-4.

### R2.S2 — Mark present with an older version
If the target file contains the mark `Produced with token-diet (v1.2.0)`
and the installed plugin is at v1.3.0: recommend `update`, naming the
version jump v1.2.0 → v1.3.0.

## Phase 3 — Copy the full rules document (R3)

The rules document lives at `${CLAUDE_PLUGIN_ROOT}/assets/token-diet-rules.md` (path
inside the plugin: `plugins/token-diet/assets/token-diet-rules.md`). This phase only
references that path — it does not depend on its content existing yet.

1. **Choose the destination.** By default:
   - If the target resolved in phase 1 is the **project** one
     (`./CLAUDE.md`), the default destination is `docs/` (inside the
     current repository, next to the project root).
   - If the resolved target is the **user** one (`~/.claude/CLAUDE.md`),
     the default destination is `~/.claude/`.
   - Ask the user whether to confirm that default destination or pick a
     different one before copying.

2. **Copy.** Copy `assets/token-diet-rules.md` (the whole file, unmodified) to the
   chosen destination, keeping the same file name unless the user asks for
   another.

3. **R3.S1 — Destination inside the repo.** If the chosen destination falls
   inside the current git repository tree (for example, the default `docs/`
   for a project target), the pointer to be inserted later into the target
   file (phase 4) will be a **relative path** from the target to the copied
   document.

4. **R3.S2 — Destination outside the repo.** If the chosen destination
   falls **outside** the current git repository tree (for example,
   `~/.claude/` for a user target, or any absolute path outside the repo),
   explicitly warn about two things before copying:
   - that the copied document will **not be versioned** (it is not under
     version control) because it falls outside the repo;
   - that the pointer to be inserted will be an **absolute path**, not a
     relative one, because there is no useful relative path outside the
     repo tree (absolute pointer).

At the end of phase 3 you must hold: the final path of the copied document
and whether the pointer to insert will be relative (R3.S1) or absolute
(R3.S2, with the not-versioned warning already shown to the user).

## Phase 4 — Apply with confirmation and idempotency by mark (R4)

This phase consumes the recommendation from phase 2 (R2) and the
destination/pointer resolved in phase 3 (R3). **It ONLY runs after explicit
confirmation by the user** on the concrete action to apply (the recommended
one or another the user picks from `{add, replace, extend, update}`; `none`
never applies anything). Always show the proposed diff before asking for
that explicit confirmation.

### R4.S2 — User rejection (check first)
If the user **rejects** the proposed action, or never gives explicit
confirmation: the command **modifies nothing**. Neither the target file nor
the copy destination changes — not a single line is written to the target
file and `assets/token-diet-rules.md` is not copied anywhere; nothing changes. Report
that no change was applied and end the flow here.

### Apply (only with explicit confirmation)

1. **Build the block to insert**, made of three parts, in this order:
   - The **inline base decalogue** ("caveman", the 10-line list): exactly
     the lines of the "Base decalogue (caveman)" section of
     `${CLAUDE_PLUGIN_ROOT}/assets/token-diet-rules.md`, copied verbatim (do not
     paraphrase them).
   - The **pointer** to the full document copied in phase 3: relative path
     (R3.S1) or absolute path (R3.S2), as resolved then.
   - The **versioned attribution mark**, with the exact literal
     `Produced with token-diet (v1.3.0)` (the plugin's pinned version, see
     `plugins/token-diet/.claude-plugin/plugin.json`).

2. **R4.S1 — Idempotency by mark: replace, do not duplicate.** Before
   writing, check whether the target file already contains a token-diet
   block of its own (delimited by the mark `Produced with token-diet (v`).
   - If **no** own block exists yet: append the full block (base decalogue
     + pointer + mark) to the target file.
   - If an own block **already** exists (from this version or an older
     one): **replace it instead of duplicating it** — substitute the whole
     block (from its start down to the mark line) with the new block. Never
     insert a second block next to the existing one.

3. **Copy the rules document** to the destination confirmed in phase 3 (if
   it had not been copied yet).

4. **Confirm to the user** which file was modified, where the copy landed
   and which version mark was installed.

### R4.S1 — Confirming an `add` and not duplicating on the second pass
- GIVEN a file without a policy and the user confirms the recommended `add`
- WHEN the command applies the change
- THEN the target file contains the base decalogue, the pointer to the doc
  and the mark `Produced with token-diet (v1.3.0)`
- AND a **second invocation** with the same plugin version (1.3.0)
  re-analyzes the file (phase 1), finds the mark at a version equal to the
  current one, and per R2.S1 recommends `none` — that second pass does
  **not add a second block**: the file keeps a single token-diet block.

### R4.S2 — User rejection (detail)
- GIVEN any recommendation shown with its diff
- WHEN the user rejects it (or does not explicitly confirm)
- THEN neither the target file nor the copy destination changes: without
  explicit confirmation, the command does not modify the file nor copy
  anything.

## Output contract summary for this version

By the time this command finishes (phases 1 through 4 complete), you must
have communicated to the user, in this order:

1. Which target file was resolved and how (project/user, asked or the only
   existing candidate).
2. If the target did not exist, that creating it was offered and what the
   user decided, without ever aborting with an error.
3. The two R1.S1 facts (policy yes/no, mark yes/no + version), using the
   exact literals `no token-saving policy detected` and
   `no token-diet mark` when applicable.
4. The single recommendation (phase 2) from `{add, replace, extend, update,
   none}` with its one-line reason.
5. Where `assets/token-diet-rules.md` was (or would be) copied and whether the pointer
   is relative (R3.S1, destination inside the repo) or absolute with the
   not-versioned warning (R3.S2, destination outside the repo).
6. The outcome of phase 4: if the user confirmed, which file was modified
   and which version mark was installed; if they rejected or never
   confirmed, that nothing was modified nor copied (R4.S2).
