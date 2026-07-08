# Spec Writer — full interview process and style

Referenced from `SKILL.md` §"Interview process" and §"Interview style". The
SKILL.md keeps the compact, must-not-skip essentials inline; this file has
the fuller per-step guidance, phrasing examples, and edge cases.

## Interview process

Work through these steps in order, but stay conversational — this is an
interview, not a wizard with rigid pages.

1. **Anchor first.** Before asking anything, check whether `/sdd-kit:spec`'s
   argument text has a leading word that case-insensitively matches one of
   `feat`/`fix`/`chore`/`refactor`/`docs`.
   - If it matches, the change type is pre-supplied: strip that word, treat
     the remaining text as the one-liner, and echo the recognized type back
     in a single line (e.g. "Change type: fix (from the command argument)")
     — no separate confirmation question, and skip step 2 entirely.
   - If it doesn't match (including when there's no argument at all), treat
     the whole argument text — including that non-matching leading word,
     which is not stripped — as the one-liner if present, otherwise ask for
     it: what is this feature/change, and why does it need to exist (the
     problem, the user, or the driver behind it). This is genuinely
     open-ended — there's nothing sensible to offer as multiple choice yet.
     Don't move on until this is a real answer, not just a title.

2. **Change type.** Skip this step if step 1 already recorded the type from
   the leading word. Otherwise, right after the one-liner is settled, present
   `feat`/`fix`/`chore`/`refactor`/`docs` as lettered options (A/B/C/D/E),
   mark one recommended based on the one-liner's content, and record the
   chosen value as a `Change type: <value>` line near the top of the written
   spec. If the one-liner clearly mixes a bug fix with new capability (e.g.
   "fix the crash and also add X"), don't silently classify it — present the
   tradeoff explicitly: (A, recommended when one side is clearly bigger)
   classify by the dominant/larger side of the change, or (B) split this into
   two separate specs, one per side. Let the user decide; don't guess.

3. **Calibrate depth.** Run the lite/full check in the main document.

4. **Scope next.** Ask what's *out* of scope / non-goals, framed as options
   when you can already guess likely exclusions from the one-liner (see
   "Ask with options" below). This step is the one people skip and it's the
   biggest source of rework later — push for at least one or two explicit
   exclusions, even if the user says "everything's in scope."

5. **Functional requirements, one capability at a time.** For each distinct
   capability the user mentions, draft a requirement (`### R<n> — <name>`)
   with SHALL/MUST/SHOULD language, then get the happy path and (in lite
   mode) one edge case or failure mode — offer your best guess at the likely
   edge case as the recommended option rather than asking "what edge cases
   matter?" cold. Convert each into a `#### R<n>.S<m>` scenario in
   Given/When/Then form. Every THEN must name a concrete observable — exact
   message, status code, produced artifact, queryable state — never "shows
   an error" or "works correctly". If an answer is vague ("it should just
   work"), don't accept it — force specifics via options: e.g. "if it fails,
   should it (A, recommended) show an inline error and let them retry, or
   (B) silently roll back?". Before moving on, settle two one-liners
   (as options where guessable): does this requirement depend on another
   (`Depende de:`), and how would each scenario be checked mechanically —
   that answer becomes the `[auto]` probe in the acceptance criteria, or
   `[manual]` with a stated reason if it genuinely can't be automated.

6. **Technical requirements.** Ask about stack/framework, integrations,
   performance, security/privacy, data/storage — but only what's actually
   relevant to this change, and only in as much depth as lite/full calls
   for. Mark a field "N/A" rather than inventing content just to fill the
   section. If the user indicates there are no special constraints at all,
   mark every remaining technical field N/A in one pass instead of asking
   about each field individually.

7. **End-to-end scenario, then acceptance criteria.** Once the functional
   requirements feel solid, draft one integrative scenario (`R-E2E`) that
   walks the whole feature end to end — per-requirement checks can all pass
   while the composition fails, so this is what decides "feature complete".
   Then assemble the acceptance checklist: one line per scenario,
   `- [ ] AC<n> → R<x>.S<y> [auto|manual] — <observable probe>`, reusing
   the probes gathered in step 5 instead of re-asking. Maximize `[auto]`;
   treat every `[manual]` as a cost that needs justifying. Confirm the
   checklist explicitly with the user — this is what "done" will mean once
   someone (or some agent) checks the work later.

8. **Assumptions & open questions.** Anything the user is unsure about or
   wants to defer, log it explicitly instead of silently guessing on their
   behalf. Offer "resolve now" vs "flag for later" as the options here too.

9. **Know when to stop.** The spec is ready when every requirement has at
   least one scenario, scope/non-goals are explicit, and there's no
   unresolved TBD the user actually cares about. In lite mode, don't exceed
   what lite mode calls for just for thoroughness's sake. Summarize what you
   have and confirm completeness before writing the file.

## Interview style (full)

- **Default to multiple choice, with one recommendation.** For any question
  with a finite, guessable set of reasonable answers — scope boundaries,
  tech choices, priority tradeoffs, which edge case matters most, what an
  error should do — present 2-4 concrete options instead of an open
  question, mark one as recommended, and give a one-line reason tied to
  what you already know about this feature. This is faster for the user to
  answer than free text, keeps the transcript unambiguous, and avoids
  burning turns on back-and-forth clarification. If the environment
  provides a structured multiple-choice question tool, use it; otherwise
  present compact lettered options in plain text (A/B/C, recommended one
  marked) and let the user just reply with a letter, "recomendada", or
  their own alternative.
- Reserve genuinely open questions for things that can't be enumerated: the
  initial one-liner, exact wording of messages, specific data shapes,
  names.
- One question (or one set of tightly related options) at a time — don't
  dump an unrelated multi-part questionnaire in a single message.
- When an answer is vague, drill down with a concrete follow-up (ideally
  itself framed as options) instead of accepting it and moving on.
- **Reflect back short, and only what changed.** After closing out a
  requirement or section, confirm it in 1-3 short bullet lines, not a
  restated wall of text — the user already knows what they just told you.
- **Don't assemble the spec until the end.** Keep your own compact running
  notes (a short list of confirmed requirements/decisions) instead of
  drafting or printing the full spec.md mid-interview. Repeatedly
  regenerating the whole document is the single biggest token cost in this
  skill and adds nothing until the interview is actually done.
- Default to 1 happy-path scenario + 1 edge case per requirement (lite
  mode). Only go beyond that for a requirement the user flags as high-risk
  (payments, auth, data loss, irreversible actions) or when running in full
  mode.
