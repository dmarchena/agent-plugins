# Changelog

All notable changes to the `markvault` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.3.0

### Changed

- `markitdown` is now the **second link** of the `auto` chain, which runs
  `pymupdf4llm` → `markitdown` → `pdftotext` → OCR, each tried until one
  yields text above the minimum threshold. It reads the text layer with a
  different engine (pdfminer.six) than `pymupdf4llm` (PyMuPDF), so it
  rescues PDFs the first link chokes on while preserving Markdown structure
  that `pdftotext` would flatten. It sits *before* `pdftotext` deliberately:
  below it the link would be unreachable, since `pdftotext` succeeds
  whenever a text layer exists and, when none does, `markitdown` cannot help
  either (it performs no OCR). Supersedes the R3 exclusion in
  `docs/specs/archived/markvault/spec.md`, annotated there.
- The skill and `/extract` now invoke the CLI through
  `uv run --with pymupdf4llm --with 'markitdown[pdf]'`, which provisions the
  extraction dependencies into a cached ephemeral environment instead of
  requiring a virtualenv or a system-Python install. `uv` is therefore a
  requirement (declared in the skill's `compatibility` field), and the
  `markitdown[pdf]` extra is mandatory: plain `markitdown` installs fine but
  cannot read a PDF at all, failing with `could not read the PDF`.

### Fixed

- The 0.2.0 entry below described the `auto` chain as ending in
  `markitdown`, but no released code ever did that: the shipped chain
  stopped at `pdftotext`+OCR, and R3 excluded `markitdown` explicitly. That
  entry is left as published; this release is what actually puts
  `markitdown` in the chain — second, not last.
- Benchmark and fallback-chain tests no longer hard-code one machine's
  missing dependencies as the expected behaviour; they assert the
  reporting contract against whatever backend is actually installed, so the
  suite passes both with and without the extraction packages.

### Added

- `tests/version_witness.py` + `tests/versions_baseline.json`: dependency
  versions are deliberately unpinned (newest release = best extraction), so
  a failure caused by an upstream upgrade now names the versions that moved
  since the suite was last green, instead of leaving no local change to
  blame. Re-record with `python -m tests.version_witness --record`.
- `README.md`: install (including `uv`), verification, the strategy table,
  and the test command — whose `pyyaml` test-only dependency is now declared
  explicitly instead of arriving transitively via `pymupdf4llm`.

## 0.2.0

- First release. Added a deterministic, offline, ~0-token PDF-to-Markdown
  extraction command (`markvault.cli`) with a format-agnostic strategy
  contract (`supports(path)`) and an `auto` fallback chain — `pymupdf4llm`
  (structured Markdown) → `pdftotext`+OCR (plain text) → `markitdown`
  (Microsoft, local `pdfminer.six`+`pdfplumber` base, no network) — plus a
  fail-closed anti-network-leak barrier (`HF_HUB_OFFLINE`,
  `TRANSFORMERS_OFFLINE`, `HF_DATASETS_OFFLINE`) verifiable with a no-egress
  test.
- Added the `extract-pdf` skill, a thin wrapper with no extraction logic of
  its own: it invokes the CLI and reports back only the `.md` path and
  statistics (`chars=`, `strategy=`, `fallback=`), never the extracted
  content, unless the user explicitly asks to see it (consent gate).
- Added a strategy benchmark harness that runs every strategy over a golden
  PDF corpus and reports per-(PDF, strategy) execution time, determinism,
  detected structure counts, and diff-against-golden result, with no model
  judgment and no network use.
