---
description: Extracts a PDF's text/Markdown into a .md file using an explicit markvault strategy (pymupdf4llm, pdftotext, or markitdown).
argument-hint: "<path to PDF> --strategy <pymupdf4llm|pdftotext|markitdown> [--out <path to .md>]"
---
Run the local `markvault` extraction CLI against the PDF and options given
in `$ARGUMENTS`. This command wraps `plugins/markvault/scripts/markvault/cli.py`
(module `markvault.cli`) -- it does not implement extraction itself.

1. Requires `uv` on `PATH` (`command -v uv`); if it is missing, say so,
   point at the plugin's `README.md`, and stop -- do not fall back to a
   bare `python3`, which has no extraction dependencies installed.

2. Invoke it with the `scripts/` directory on `PYTHONPATH` so the `markvault`
   package resolves, forwarding `$ARGUMENTS` verbatim as CLI arguments:

   ```
   PYTHONPATH="${CLAUDE_PLUGIN_ROOT}/scripts" uv run --with pymupdf4llm --with 'markitdown[pdf]' --python 3.13 python -m markvault.cli $ARGUMENTS
   ```

   Keep both `--with` flags whatever `--strategy` the user names, so every
   markvault invocation shares one cached uv environment. `markitdown` must
   carry its `[pdf]` extra -- without it every extraction through it fails
   with `could not read the PDF`.

3. A `--strategy` name is **required** (`pymupdf4llm`, `pdftotext`, or
   `markitdown`); this command does not offer an `auto` mode. An unknown
   name exits non-zero and stderr names it plus the valid strategies.

4. On success (exit 0) report back only what the command printed to
   stderr -- the `.md` path, `chars=<N>`, and `strategy=<name>` -- never
   read the produced `.md` into context unless the user explicitly asks to
   see its content.

5. On failure (non-zero exit), relay the stderr message as-is (it never
   contains the input file's own content) and do not create or assume any
   `.md` output exists.
