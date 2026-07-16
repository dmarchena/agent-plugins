---
name: extract-pdf
description: Use this skill whenever the user wants a PDF turned into a Markdown file without its content ever entering the conversation's context -- e.g. "extract this PDF to markdown", "convert this PDF but don't show me the text", "run markvault on this file", "give me a .md of this document", or any request to extract/convert a PDF where the deliverable is the file itself, not a summary of it. It consumes a PDF path and produces a `.md` file plus a path+statistics report; it does NOT parse or extract PDF content itself (that's the `markvault.cli` command it wraps) and does NOT summarize or quote the extracted text back to the user in the default flow.
argument-hint: "<path to PDF> [--strategy <pymupdf4llm|pdftotext|markitdown|auto>] [--out <path to .md>]"
allowed-tools: Bash, Read
compatibility: Requires uv on PATH; uv provisions the pymupdf4llm and markitdown[pdf] strategies into a cached ephemeral environment, so no venv or system-Python install is needed. The pdftotext strategy needs the pdftotext binary (poppler) and its OCR recourse needs tesseract, both optional. Fully offline after uv's first dependency download.
---

# Extract PDF (markvault)

## What this does

Wraps the local `markvault.cli` extraction command (module `markvault.cli`,
see `plugins/markvault/scripts/markvault/cli.py`) so a PDF's text/Markdown
never has to pass through this skill's own reasoning to be produced. This
skill contains **no extraction logic of its own** -- it never reads PDF
bytes, never parses PDF structure, and never picks strategy internals; all
of that is delegated entirely to the CLI, which already runs behind an
anti-network-leak barrier (R4) and implements the R3 strategy fallback
chain. This skill's only job is: invoke the command, then report back the
metadata the command printed -- not the content it produced.

## Procedure

1. Check that `uv` is available before invoking anything:

   ```
   command -v uv
   ```

   If this exits non-zero, `uv` is not installed. Report that the skill
   cannot run without it, point the user at `README.md` for the install
   instructions, and stop. Do **not** fall back to a bare `python3` --
   the extraction dependencies are not installed there, so the structured
   strategies would report `not installed` and `auto` would silently
   degrade to `pdftotext`, quietly producing worse output than requested.

   The Python extraction dependencies themselves need no check: `uv run
   --with` provisions them on demand (step 2). The `pdftotext` strategy's
   binary (poppler) and its OCR recourse (tesseract) are optional; the CLI
   probes for them itself and reports their absence per-strategy, so do
   not pre-check them either.

2. Invoke the CLI with the `scripts/` directory on `PYTHONPATH` so the
   `markvault` package resolves, forwarding the PDF path and any
   `--strategy`/`--out` options given by the user:

   ```
   PYTHONPATH="${CLAUDE_PLUGIN_ROOT}/scripts" uv run --with pymupdf4llm --with 'markitdown[pdf]' --python 3.13 python -m markvault.cli <pdf> [--strategy <name>|auto] [--out <path>]
   ```

   `uv run --with` provisions both packages into a cached ephemeral
   environment, so the strategies work without a venv to maintain and
   without installing into the system Python. The first run downloads
   them; later runs reuse uv's cache and cost nothing measurable.

   Pass both flags exactly as written, including for a single explicit
   `--strategy`: the default `auto` chain is
   `pymupdf4llm` -> `markitdown` -> `pdftotext` -> OCR, so both packages
   belong to the default path, and keeping one dependency set means every
   invocation shares one cached environment. `markitdown` **must** carry
   its `[pdf]` extra -- without it the PDF converter is missing and every
   extraction through it fails with the pinned `could not read the PDF`
   message.

   Omit `--strategy` (or pass `auto`) unless the user names one explicitly
   -- `auto` runs the R3 fallback chain (structured strategy, then
   `pdftotext`, then its own OCR recourse) and is the right default for a
   plain "extract this PDF" request.

3. On success (exit code 0), the command's stderr contains a single
   pinned, greppable line: `path=<...> chars=<N> strategy=<name>` (with a
   trailing `fallback=yes|no` field when running in `auto` mode). Report
   back to the user **only** that path and those statistics -- the `.md`
   path, the character count, the strategy used, and whether a fallback
   occurred. Never quote, summarize, or otherwise surface the extracted
   text itself in this report; the command's own stderr contract exists
   precisely so this is possible without ever loading the PDF's content
   into context.

4. On failure (non-zero exit), relay the stderr message as-is -- it is a
   pinned, content-free message (e.g. "could not read the PDF at
   <path>") that never echoes fragments of the input file -- and do not
   create or assume any `.md` output exists.

## Consent gate: the `.md` content is never read by default

The `.md` file this command writes is a normal file on disk, and this
skill can `Read` it like any other file -- but it must not, unless the
user explicitly asks. In the default flow (a plain "extract this PDF")
this skill's job ends at step 3: report the path and statistics, and stop.
Do not open, `Read`, or otherwise load the `.md` file's content into
context in that default flow -- never do it as a courtesy, a sanity check,
or "just to confirm it worked". Reporting `chars=<N>` is itself the
confirmation that content was written.

Only if the user follows up with an **explicit** request to see, use, or
act on the produced Markdown -- e.g. "show me what's in the .md", "now
summarize that file", "read it back to me" -- does this skill then `Read`
the `.md` path from the prior report and bring its content into context.
Absent that explicit ask, the content is never read, for as many turns as
the conversation continues.

## Failure modes

- **Unknown `--strategy` name**: the CLI exits non-zero and names the
  invalid strategy plus the valid ones on stderr; relay that message
  as-is and stop -- do not guess a substitute strategy.
- **Input not readable as a PDF** (missing, corrupt, or not a PDF despite
  its extension): the CLI exits non-zero with the pinned
  `could not read the PDF at <path>` message; relay it as-is and do not
  assume any `.md` was written.
- **Extraction chain exhausted** (auto mode): same pinned failure message
  as above -- from this skill's perspective a fully-exhausted fallback
  chain is indistinguishable from an unreadable PDF, and is reported
  identically.

## Output contract

- A `.md` file on disk at the path the CLI reports (next to the input PDF
  by default, or at `--out` if given).
- A report to the user containing exactly: the `.md` path, `chars=<N>`,
  `strategy=<name>`, and (in `auto` mode) `fallback=yes|no` -- and nothing
  else, unless the user has explicitly asked to see the content, per the
  consent gate above.
