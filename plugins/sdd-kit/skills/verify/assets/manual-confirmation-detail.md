# Verify — manual AC confirmation protocol (full detail)

Referenced from `SKILL.md`'s "Manual AC confirmation protocol" section.

Every `[manual]`-tagged AC (and, in degraded mode with no
`execution_state.json`, every AC regardless of tag — see R4) MUST be
confirmed **one by one, in this main conversation thread, directly with the user**:
present its `ac_id`/`description` (the probe text) and wait for an explicit
answer before moving to the next one. Only an explicit "yes, this is met" from the user justifies
calling `.confirm(ac_id)`; anything else — an explicit "no", or the
conversation moving on without an answer — leaves it `'unanswered'` or
`.reject(ac_id)`, and either way it is **not** green (R3, R3.S1, R3.S2).

This confirmation step **MUST NOT be delegated to a subagent** and **MUST
NOT be resolved unilaterally** by the orchestrating agent guessing or
inferring the answer from code/tests. A subagent has no standing to give
informed consent on the user's behalf — a `[manual]` AC exists precisely
because it needs a human judgment call that automation cannot make. If you
find yourself tempted to mark a manual AC green without an explicit
back-and-forth with the user in this thread, stop: that is a spec violation, not a shortcut.

The bookkeeping (each AC's `'unanswered'`/`'confirmed'`/`'rejected'` status
and which ones count green) is `manualConfirmation(items)` inside
`verify-tools.mjs` — pure bookkeeping with no I/O of its own; the actual
presenting and waiting for a reply happens here, in the conversation, AC
by AC, driven by this protocol. What changed is only the plumbing that
carries the resolved answers into the deterministic pipeline: after each
`[manual]` AC (or, in degraded mode, every AC — see R4) has been confirmed
or rejected in this conversation, write the resolved answers to a JSON
verdicts file —

```json
[
  { "ac_id": "AC6", "verdict": "confirmed" },
  { "ac_id": "AC9", "verdict": "rejected" }
]
```

— and pass it to `report`/`archive` via `--verdicts <path>`
(`node ${CLAUDE_PLUGIN_ROOT}/scripts/verify-tools.mjs report SPECDIR --verdicts <path>`),
the same file-based convention `exec-tools.mjs complete --batch` uses. The
CLI never prompts interactively (R1.S3): an AC with no matching entry in the
file simply stays `'unanswered'` — not green — rather than the command
blocking on stdin. You do not call `manualConfirmation(items).confirm(ac_id)`
yourself; that call now happens inside the `report`/`archive` subcommand
when it reads your verdicts file.
