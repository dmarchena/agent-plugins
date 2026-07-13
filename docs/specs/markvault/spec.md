# Spec: markvault

## Purpose

Package as a plugin a **deterministic, offline, ~0-token** flow to extract the
text of a document into a Markdown file. Its reason to exist is a strict privacy
guardrail: the document's content must **never** leave the machine (e.g. to the
model provider's servers) without explicit consent. The heavy lifting is done by
a local script; the skill only invokes it and reports metadata, so that no word
of the document enters the model context by default. It reuses the anti-network-leak
architecture already proven in the `ia/` project (`red_guard` + extraction with
Poppler/Tesseract) and generalizes it with interchangeable extraction strategies
comparable through a benchmark. **v1 only processes PDF**; the brand identity not
tied to PDF (`markvault`) and the strategy contract are deliberate so that other
formats (xlsx, docx, pptx, odt via `markitdown`) can be added in the future **as
an addition, not a breaking change**, without redesign.

Change type: feat

## Scope

**In scope:**
- A local `markvault` command that converts **one** document into **one** `.md`
  file. In **v1 the only supported format is PDF** (the corpus, the ACs and the
  benchmark are PDF-based).
- A **format-agnostic** strategy contract: each strategy receives an input path
  and declares which formats it supports (`supports(path)`), so the registry can
  route by capability. In v1 every strategy supports only PDF; adding a future
  format means registering a strategy that supports it, without touching the
  contract or the CLI.
- Interchangeable extraction strategies behind a common interface; in v1:
  `pymupdf4llm` (structured Markdown), `pdftotext`→OCR (plain text, from `ia/`)
  and `markitdown` (Microsoft, local base path `pdfminer.six`+`pdfplumber`, no
  network).
- Configurable strategy selection and an automatic **fallback chain**
  (structured → plain text → OCR).
- **Fail-closed** anti-network-leak guardrail: any connection attempt aborts the
  run; 100% offline execution verifiable with a no-egress test.
- Thin skill that invokes the command and returns to the model **only path +
  statistics**, never the extracted content (consent gate / 0 tokens).
- Benchmark command that compares strategies by: time, determinism (hash of 2
  runs), detected structure (headings/tables/lists) and diff against golden
  files over a test corpus.

**Out of scope (non-goals):**
- **Official Windows support:** v1 officially targets **Linux and macOS** only
  (both CI-verified, per AC-E2E). Code SHALL remain Windows-compatible where
  that costs no extra complexity (e.g. use `pathlib`/`shutil.which` instead of
  hardcoded POSIX paths), but Windows is not tested, not covered by any AC, and
  not guaranteed to work.
- Automating or documenting the installation of native binary dependencies
  (Poppler's `pdftotext`/`pdftoppm`, `tesseract`) per operating system: assumed
  already present on `PATH`; left to each user's own setup, not a v1 deliverable.
- PII anonymization / sanitization (Presidio, spaCy, `identidad.local.json`):
  left as a future plugin/phase.
- Batch or folder processing (beyond the benchmark's internal corpus).
- The `marker` strategy (deep learning, ~2-3 GB of models): documented as a
  future strategy only, not implemented in v1.
- Returning the PDF content to the model context (only on explicit user request,
  outside the default flow).
- Perfect reconstruction of complex layout (exotic multi-column, formulas).
- **Non-PDF format support** (xlsx, docx, pptx, odt…): NOT implemented in v1.
  The architecture is left **ready** to admit them (strategy contract with
  `supports()` + capability-based registry + non-PDF-bound identity `markvault`),
  but format detection, a multi-format corpus and per-format `auto` chains are a
  future phase.

## Functional Requirements

### R1 — Extraction strategy interface

Depende de: —

The system SHALL expose a common, **format-agnostic** extraction interface such
that each strategy receives an input path, exposes `supports(path) -> bool`
(which formats it accepts) and returns text/Markdown; the registry SHALL be able
to resolve strategies by name and by capability. In v1 every strategy declares
PDF-only support. It SHALL include in v1 at least three selectable concrete
strategies: one producing structured Markdown (`pymupdf4llm`), a plain-text one
based on `pdftotext` with OCR as recourse, and `markitdown` (100% local base
path; **only** its default PDF extractor is used, `pdfminer.six`+`pdfplumber`,
with its LLM-Vision OCR and the Azure Document Intelligence path **excluded**
for violating the network/0-token guardrail).

#### R1.S1 — Explicit strategy selection
- GIVEN an electronic PDF with embedded text
- WHEN the command is invoked with `--strategy pymupdf4llm`
- THEN the `.md` is produced using that strategy
- AND stderr names the effective strategy used (`strategy=pymupdf4llm`)

#### R1.S2 — Unknown strategy
- GIVEN any PDF
- WHEN invoked with `--strategy nosuch`
- THEN the command exits with code ≠ 0 and stderr contains `unknown strategy: nosuch`
- AND lists the available valid strategies

#### R1.S3 — markitdown selection
- GIVEN an electronic PDF with embedded text
- WHEN the command is invoked with `--strategy markitdown`
- THEN the `.md` is produced using markitdown's base PDF extractor (no network)
- AND stderr names the effective strategy used (`strategy=markitdown`)

### R2 — PDF-to-Markdown extraction

Depende de: R1

The system SHALL, given an input PDF, write a `.md` file with the extracted text
**without making any network connection**. For the **text-based strategies**
(`pymupdf4llm`, `pdftotext`, `markitdown`) the output SHALL be **deterministic**
(two runs with the same input and strategy produce identical bytes); for OCR,
determinism is **measured** by the benchmark's `deterministic` column, not
required (Tesseract's stability with fixed parameters is verified there, see
Assumptions).

#### R2.S1 — Electronic happy path
- GIVEN a PDF with embedded text and no `--out`
- WHEN `markvault document.pdf` is invoked
- THEN `document.md` is created next to the PDF with the extracted text (length > 0)
- AND stderr reports `chars=<N>` and `strategy=<name>`
- AND the exit code is 0

#### R2.S2 — Explicit output path
- GIVEN a valid PDF
- WHEN invoked with `--out /path/output.md`
- THEN the `.md` is written exactly at `/path/output.md`

#### R2.S3 — Missing or corrupt PDF
- GIVEN a path that is not a readable PDF
- WHEN the command is invoked on it
- THEN it exits with code ≠ 0 and stderr contains `could not read the PDF` (without dumping content)
- AND no `.md` is created

### R3 — Automatic fallback chain

Depende de: R1

The system SHALL, in `--strategy auto` mode (the default), try the structured
Markdown strategy and, if it fails or produces text below a minimum threshold,
fall back to `pdftotext` and, if the result is still insufficient, to OCR; the
strategy that finally produces the output SHALL be reported. `markitdown` is NOT
part of the default `auto` chain (to keep it simple and deterministic): it is an
**explicitly selectable** strategy and a benchmark participant, not a link in
the automatic fallback.

#### R3.S1 — Structured success
- GIVEN a readable electronic PDF in `auto` mode
- WHEN the command runs
- THEN the output is produced with the structured strategy
- AND stderr reports `strategy=pymupdf4llm fallback=no`

#### R3.S2 — Fallback to OCR on image PDF
- GIVEN a PDF that is a scanned image (no embedded text) in `auto` mode
- WHEN the command runs
- THEN the insufficient result of the text strategies triggers OCR
- AND stderr reports the traversed chain ending in `strategy=ocr fallback=yes`
- AND the resulting `.md` has length > 0

### R4 — Anti-network-leak guardrail (fail-closed)

Depende de: —

The system SHALL activate, before any extraction, a barrier that intercepts the
opening of network sockets in the process, such that any connection attempt
**aborts the run** with an error, and SHALL force offline-mode environment
variables for model libraries; legitimate extraction (Poppler, Tesseract,
PyMuPDF) makes NO network use and therefore does not trip the barrier.

#### R4.S1 — Normal extraction does not trip the barrier
- GIVEN the barrier active and a valid PDF
- WHEN a real extraction runs (any v1 strategy)
- THEN the extraction completes with exit code 0 and no network error

#### R4.S2 — Connection attempt aborts (fail-closed)
- GIVEN the barrier active
- WHEN the code attempts to open a network connection (`socket.connect`/`create_connection`)
- THEN a blocking error is raised and the process exits with code ≠ 0
- AND stderr contains a message identifying the network block (e.g. `BLOCKED: network connection attempt`)

#### R4.S3 — Forced offline mode
- GIVEN the barrier active
- WHEN the process environment is inspected
- THEN `HF_HUB_OFFLINE`, `TRANSFORMERS_OFFLINE` and `HF_DATASETS_OFFLINE` equal `1`

### R5 — Privacy gate / 0 tokens in the skill

Depende de: R2

The system (the skill) SHALL, when processing a PDF, invoke the local command
and return to the model context **only** the path of the produced `.md` and
statistics (character count, strategy, whether fallback occurred), taken
verbatim from the command's metadata report; it SHALL NOT read or include the
extracted content unless the user explicitly requests it.

#### R5.S1 — Report without content
- GIVEN a PDF processed via the command
- WHEN the run finishes
- THEN the command's metadata report (stderr) contains the `.md` path and the statistics
- AND contains NO line of the text extracted from the PDF

#### R5.S2 — Content read only under consent
- GIVEN an already generated `.md`
- WHEN the user explicitly asks to see/use its content
- THEN (and only then) the skill reads the `.md` into context
- AND in the default flow (without that request) the content is never read

### R6 — Strategy benchmark

Depende de: R1, R2

The system SHALL offer a benchmark command that, over a corpus of test PDFs with
their expected golden `.md` files, runs every strategy and emits, per
(PDF × strategy): execution time, determinism result (identical hash across 2
runs), detected structure counts (headings/tables/lists) and the diff result
against the golden file. The output SHALL be mechanical (no model judgment) and
make no network use. The exit code SHALL be 0 whenever every strategy completed,
even if golden diffs failed (failures are surfaced in the rows and the summary);
a non-zero exit code is reserved for a strategy crashing or the harness failing.

#### R6.S1 — Benchmark run
- GIVEN the test corpus with its golden files
- WHEN the benchmark command runs
- THEN it emits a table/JSON with one row per (PDF, strategy) including columns
  `time_ms`, `deterministic` (yes/no), `headings`, `tables`, `lists`, `diff_ok` (yes/no)
- AND the exit code is 0 if every strategy completed

#### R6.S2 — Regression caught by golden diff
- GIVEN a strategy whose output differs from its expected golden file
- WHEN the benchmark runs
- THEN the corresponding row marks `diff_ok=no`
- AND the final summary reports at least one golden failure
- AND the exit code is still 0 (all strategies completed)

### R-E2E — Extract a PDF to Markdown privately and verifiably

Depende de: R1, R2, R3, R4, R5

The system SHALL, from the skill invocation on a PDF, produce the `.md` locally
through the strategy chain, with no network egress, returning only metadata to
the model.

#### R-E2E.S1 — Integrative walkthrough
- GIVEN an electronic PDF and the `markvault` skill
- WHEN the user asks to convert it to Markdown
- THEN the `.md` is created next to the PDF with content (length > 0)
- AND the skill reports path + `chars=<N>` + `strategy=<name>` without dumping content
- AND a run of the same command under the platform's network-denial mechanism
  (`sandbox-exec -n 'deny network*'` on macOS; `unshare -n` on Linux) completes
  with exit code 0 (no egress)

## Technical Requirements

- **Supported platforms:** Linux and macOS, officially required and CI-verified
  (see AC-E2E, whose OS-level no-egress check already only names these two:
  `unshare -n` on Linux, `sandbox-exec -n 'deny network*'` on macOS). Windows
  is not officially supported: the code should stay Windows-compatible where
  it's cheap to do so, but nothing in v1 tests, verifies, or guarantees
  Windows behavior.
- **Stack / framework:** Python 3 + CLI. Claude Code plugin (thin skill +
  command/script). Extraction dependencies: `pymupdf4llm` (PyMuPDF, pure local),
  `pdftotext`/`pdftoppm` (Poppler), `tesseract` (OCR, configurable language,
  default `spa`), `pdf2image`, and `markitdown[pdf]` (`pdfminer.six`+`pdfplumber`,
  pure local). Only markitdown's base PDF converter is invoked; its LLM OCR and
  Azure Document Intelligence extras are neither installed nor invoked.
- **Integraciones:** No external network/API (that is a requirement, not an
  integration). The skill invokes the command via shell; it calls no models.
- **Rendimiento:** No hard SLA. The benchmark measures `time_ms` per strategy as
  comparative data, not as a pass threshold.
- **Seguridad / privacidad:** Anti-network barrier `red_guard` ported from `ia/`
  (patching of `socket.connect`/`connect_ex`/`create_connection`, fail-closed) +
  `*_OFFLINE=1` variables. The in-process barrier does not cover external-binary
  subprocesses (pdftotext, tesseract); those are covered by the OS-level
  network-denial run in AC-E2E (`sandbox-exec -n 'deny network*'` on macOS,
  `unshare -n` on Linux — the leg CI can run). The PDF content never enters the
  model context by default (R5). Automated no-egress test mandatory.
- **Datos / almacenamiento:** Input = one PDF; output = one `.md` (next to the
  PDF or at `--out`). Benchmark test corpus (PDFs + golden `.md`) versioned
  inside the plugin; must be non-sensitive/public content.
- **Restricciones adicionales:** The default flow's token cost must be ~0 (just
  the command invocation). Determinism required of v1 text strategies (see R2;
  OCR is measured, not required). Version bump in `plugin.json` + `CHANGELOG.md`
  entry **when the branch lands on `main`** (per AGENTS.md), not on every
  intermediate commit. `marker` documented but not implemented.
- **Extensibility architecture:** lightweight patterns (Strategy + Registry +
  Chain of Responsibility for `auto` + format-agnostic interface), **not DDD**
  (no domain with invariants justifying aggregates/repositories; it would add
  ceremony against the goal of a deterministic script and a thin skill). The
  `supports(path)` contract is the only seam generalized in v1 to avoid
  redesigning when formats are added; `markitdown` is the broad-coverage adapter
  foreseen for those future formats.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — `--strategy pymupdf4llm` on electronic PDF: `.md` created and stderr contains `strategy=pymupdf4llm`
- [ ] AC2 → R1.S2 [auto] — `--strategy nosuch`: exit ≠ 0 and stderr `unknown strategy: nosuch` + list of valid ones
- [ ] AC3 → R2.S1 [auto] — `markvault document.pdf`: creates `document.md` (len>0), stderr `chars=N` and `strategy=…`, exit 0
- [ ] AC4 → R2.S2 [auto] — `--out path.md`: the file exists exactly at that path
- [ ] AC5 → R2.S3 [auto] — unreadable input: exit ≠ 0, stderr `could not read the PDF`, no `.md` created
- [ ] AC6 → R3.S1 [auto] — `auto` mode on electronic PDF: stderr `strategy=pymupdf4llm fallback=no`
- [ ] AC7 → R3.S2 [auto] — `auto` mode on image PDF: stderr ends in `strategy=ocr fallback=yes`, `.md` len>0
- [ ] AC8 → R4.S1 [auto] — real extraction with barrier active: exit 0, no network error
- [ ] AC9 → R4.S2 [auto] — no-egress test: a `socket.connect` with the barrier active aborts (exit ≠ 0, block message)
- [ ] AC10 → R4.S3 [auto] — with the barrier active, the 3 `*_OFFLINE` env vars equal `1`
- [ ] AC11 → R5.S1 [auto] — the command's metadata report (stderr) contains the `.md` path and `chars=`; grep of the PDF's known text in that report = 0 matches
- [ ] AC12 → R5.S2 [manual] — verify that without an explicit request the `.md` is not read into context; requires judging the skill's conversational behavior, not mechanizable with a single command
- [ ] AC13 → R6.S1 [auto] — benchmark emits one row per (PDF, strategy) with `time_ms`, `deterministic`, `headings`, `tables`, `lists`, `diff_ok`; exit 0
- [ ] AC14 → R6.S2 [auto] — golden altered on purpose: row with `diff_ok=no`, summary with ≥1 failure, exit still 0
- [ ] AC15 → R1.S3 [auto] — `--strategy markitdown` on electronic PDF: `.md` created (len>0) and stderr contains `strategy=markitdown`, no network
- [ ] AC-E2E → R-E2E.S1 [auto] — skill on electronic PDF: `.md` created (len>0), report with path+stats without content, and the command under the platform's network-denial mechanism (`sandbox-exec -n 'deny network*'` on macOS; `unshare -n` on Linux) completes exit 0

## Assumptions & Open Questions

- "Insufficient text" threshold that triggers the fallback: assumed ~20
  characters (as in `ia/`); tunable in the plan.
- Default OCR language `spa`; exposed as an option in the plan if needed.
- The benchmark test corpus consists of **public/non-sensitive** PDFs created
  for the plugin (at minimum one electronic, one image/scanned).
- Command and skill name: `markvault` (brand identity, not PDF-bound, deliberate
  for future multi-format); confirmable at planning time.
- `red_guard`, `pdftotext` and `pymupdf4llm` are deterministic. Tesseract is
  assumed stable with fixed parameters but determinism is NOT required of OCR
  (see R2); the benchmark's `deterministic` column records the observed result
  either way.
- `markitdown` for PDF produces plain text (`pdfminer.six`), with tables via
  `pdfplumber`; it does **not reconstruct Markdown headings** like `pymupdf4llm`.
  Assumed deterministic (pdfminer base); confirmed in the benchmark's
  `deterministic` column. Its value here is comparative (one more row), not
  beating the structured strategy.
- How "detected structure" is reconstructed for plain-text strategies (no real
  markdown headings): assumed 0/heuristic count; the plan decides.
- The committed `execution_plan.json` predates this revision (it was derived
  from the Spanish spec and pins the old Spanish stderr strings): it must be
  regenerated with plan-writer from this spec before running plan-executor.
