---
description: Runs every registered markvault extraction strategy over the bundled test-PDF corpus and reports time/determinism/structure/golden-diff per row.
argument-hint: "[--corpus-dir <dir>] [--golden-dir <dir>] [--format table|json]"
---
Run the local `markvault` benchmark harness with the options given in
`$ARGUMENTS`. This command wraps
`plugins/markvault/scripts/markvault/benchmark.py` (module
`markvault.benchmark`) -- it does not implement extraction or benchmarking
itself, and it is a separate entrypoint from `/extract` (`markvault.cli`).

1. Invoke it with the `scripts/` directory on `PYTHONPATH` so the
   `markvault` package resolves, forwarding `$ARGUMENTS` verbatim as CLI
   arguments:

   ```
   PYTHONPATH="${CLAUDE_PLUGIN_ROOT}/scripts" uv run --with pymupdf4llm --with 'markitdown[pdf]' --python 3.13 python -m markvault.benchmark $ARGUMENTS
   ```

   Both `--with` flags belong here, unlike in `/extract` (which passes only
   the one its `--strategy` needs): the benchmark's whole job is to run
   *every* registered strategy, so a missing package would surface as a
   spurious `error` row rather than a real comparison. `markitdown` must
   carry its `[pdf]` extra or its rows all fail. Requires `uv` on `PATH`.

2. With no arguments it benchmarks the bundled corpus/goldens under
   `plugins/markvault/tests/fixtures/` (`benchmark_corpus/`,
   `benchmark_golden/`). Pass `--corpus-dir`/`--golden-dir` to point at a
   different set of `*.pdf` fixtures and `<pdf-stem>__<strategy>.md`
   goldens.

3. The command always exits 0 when it runs to completion, even when a
   strategy errored (missing dependency/binary, or a PDF it couldn't
   read) or a row's output didn't match its golden -- those are reported
   as data (`status=error` rows, `diff_ok=no` rows, and a summary line on
   stderr), not process failures. A non-zero exit means the harness
   itself could not run (e.g. `--corpus-dir` doesn't exist).

4. Report back only what the command printed: the per-row table/JSON on
   stdout and the `summary: rows=... errors=... golden_failures=...`
   line on stderr. Never treat a reported error/diff-mismatch row as a
   reason to say the command itself failed.
