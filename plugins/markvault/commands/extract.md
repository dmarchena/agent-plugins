---
description: Extracts a PDF's text/Markdown into a .md file using an explicit markvault strategy (pymupdf4llm, pdftotext, or markitdown).
argument-hint: "<path to PDF> --strategy <pymupdf4llm|pdftotext|markitdown> [--out <path to .md>]"
---
Run the local `markvault` extraction CLI against the PDF and options given
in `$ARGUMENTS`. This command wraps `plugins/markvault/scripts/markvault/cli.py`
(module `markvault.cli`) -- it does not implement extraction itself.

1. Invoke it with the `scripts/` directory on `PYTHONPATH` so the `markvault`
   package resolves, forwarding `$ARGUMENTS` verbatim as CLI arguments:

   ```
   PYTHONPATH="${CLAUDE_PLUGIN_ROOT}/scripts" python3 -m markvault.cli $ARGUMENTS
   ```

2. A `--strategy` name is **required** (`pymupdf4llm`, `pdftotext`, or
   `markitdown`); this command does not offer an `auto` mode. An unknown
   name exits non-zero and stderr names it plus the valid strategies.

3. On success (exit 0) report back only what the command printed to
   stderr -- the `.md` path, `chars=<N>`, and `strategy=<name>` -- never
   read the produced `.md` into context unless the user explicitly asks to
   see its content.

4. On failure (non-zero exit), relay the stderr message as-is (it never
   contains the input file's own content) and do not create or assume any
   `.md` output exists.
