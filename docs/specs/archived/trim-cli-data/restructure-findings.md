# Restructure findings — trim-cli-data (T5)

Refs: R4.S1, R4.S2 (`docs/specs/trim-cli-data/spec.md`).

Read-only investigation of every sdd-kit CLI whose consumed stdout `data`
payload exceeds 200 tokens (measured with `plugins/sdd-kit/scripts/tokenizer.mjs`'s
`estimateTokens()` applied to `JSON.stringify(data)`, post-T4-trim). This is
an intermediate working artifact feeding `T6_contract_annotations` (which
records these outcomes in `plugins/sdd-kit/docs/cli-data-contract.md`); it is
not itself a spec deliverable.

## Result: no CLI restructured — all five are R4.S2 justification candidates

Every over-200-token payload was found to be fully consumed by its skill on
every invocation, or structurally blocked from reaching ≤200 tokens without
dropping data an already-shipped, still-enforced acceptance criterion
requires. No script, consumer, or test file was changed by this task.

### exec-tools.mjs `report` — 612 tokens — R4.S2

`plan-executor/SKILL.md` §7 requires relaying real-vs-estimated tokens per
task, every invocation — that is `report`'s whole purpose. Even the barest
possible per-task subset (`task_id`+`actual_tokens`+`estimated_tokens`,
dropping `status`/`deviation`/`incidencia`/`commit`) measures 236 tokens for
a 6-task plan, before the required `tokens`/`real_cost` aggregate (152 tokens
alone). Cannot reach ≤200 without omitting data SKILL.md says must be
relayed every time.

### exec-tools.mjs `extract` — 318 tokens — R4.S2

`assets/task-brief-detail.md`: the executor runs this command itself to
fetch the verbatim spec text and derive its test contract from it — the
`blocks` payload IS the deliverable, there is no "detail" to defer to a file.

### verify-tools.mjs `report` — 728 tokens — R4.S2

`verify/SKILL.md`: verify always evaluates the whole AC checklist, never
stopping at the first not-green AC. Even the minimal per-AC shape
(`ac_id`/`ref`/`tag`/`green`, dropping all `reason`/`details` drift text)
measures 372 tokens for 10 ACs — over threshold from checklist size alone,
before any additional detail.

### token-cost.mjs — 441 tokens — R4.S2

The already-shipped, archived `token-cost-cli` spec's R3.S1/AC5 hard-requires
stdout to carry `session`/`subs`/`orchestrator`/`subTotal`/`orchAll` in full
— still enforced today by `shared/test/token-cost.test.mjs`'s AC5 test. Also
has no SPECDIR-like directory to anchor a detail file to (it analyzes an
arbitrary out-of-repo session transcript).

### forensics.mjs `report` (default) — 682 tokens — R4.S2

`spec-forensics/SKILL.md` reads `forensics.json` for the full report, and
that file already exists (a clean-looking R4.S1 candidate on the surface).
But the archived `docs/specs/archived/spec-forensics/spec.md`'s **AC4**
("stdout prints the same per-task figures" as `forensics.json`) is still
enforced today by `plugins/sdd-kit/test/exec/forensics.test.mjs`'s R2.S1
test. The `tasks` field alone already measures 239 tokens for a 5-task run —
over the 200-token ceiling by itself, growing with task count — so R4.S1's
target and archived AC4 are mutually incompatible for any realistically
sized run.

**Human decision recorded**: treat as an R4.S2 exception rather than
reopening the archived spec-forensics feature to relax AC4. Documented here
for T6 to record in the contract doc.

## Confirmed no-action items (measured, not assumed)

- `verify-tools.mjs archive`: measured against a disposable temp fixture
  (git init + minimal always-green spec/plan/state) — 76 tokens for the
  `archived:true` path. Well under threshold.
- `exec-tools.mjs` mutating subcommands (`init`, `complete`,
  `complete --batch`, `block`, `resume`): structurally small (single
  strings/ids/small counts, batches capped at 3 tasks); nothing flagged.
- `budget-guard.mjs`, `forensics-analysis-validate.mjs`, `plan-tools.mjs`
  (`inspect-spec`/`check-plan`), `versioning-report.mjs`,
  `exec-tools.mjs next`: all measured well under 200 tokens (52-158,
  post-T4-trim) — no action needed.
