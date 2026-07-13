# Changelog

All notable changes to the `markvault` plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
