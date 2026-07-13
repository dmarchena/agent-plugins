"""TDD contract tests for markvault's benchmark harness (task: benchmark-harness).

Covers:
- R6.S1: the benchmark emits one row per PDF-strategy combination with
  columns for time, determinism, structure counts, and the diff result
  against the golden, and exits with code 0 when all strategies complete.
- R6.S2: if a strategy's output differs from its expected golden file,
  the row marks the diff as failed and the summary reports at least one
  golden failure while the exit code is still 0.

Environment note (checked directly, same approach as test_strategies.py /
test_strategy_registry.py): this environment has `pdftotext` (Poppler) on
PATH but NOT `tesseract`, `pymupdf4llm`, or `markitdown`, and there is no
network access to install any of them. That means, over this task's
bundled corpus:
- `pdftotext` on `electronic.pdf` (has an embedded text layer) is the one
  combination genuinely exercised end-to-end, with byte-identical output
  checked against a real golden file.
- `pymupdf4llm` and `markitdown` are structurally wired -- the benchmark
  still calls them -- but both report `status="error"` here because their
  backing libraries aren't installed.
- `scanned.pdf` (no embedded text layer) drives every strategy into an
  error here too: `pdftotext`'s own OCR fallback needs `tesseract`, which
  is also not installed in this environment.
These are asserted explicitly below so the "genuinely exercised vs.
structurally wired but untestable" split is documented in the suite
itself, not just in prose.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from markvault import benchmark  # noqa: E402
from markvault.registry import default_registry  # noqa: E402

PDFTOTEXT_AVAILABLE = shutil.which("pdftotext") is not None

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
CORPUS_DIR = FIXTURES_DIR / "benchmark_corpus"
GOLDEN_DIR = FIXTURES_DIR / "benchmark_golden"


@unittest.skipUnless(PDFTOTEXT_AVAILABLE, "pdftotext binary not found on PATH")
class TestBenchmarkEmitsOneRowPerCombination(unittest.TestCase):
    """R6.S1."""

    def setUp(self) -> None:
        self.corpus = benchmark.discover_corpus(CORPUS_DIR)
        self.registry = default_registry()

    def test_r6_s1_corpus_has_electronic_and_scanned_fixtures(self) -> None:
        names = {p.name for p in self.corpus}
        self.assertIn("electronic.pdf", names)
        self.assertIn("scanned.pdf", names)

    def test_r6_s1_one_row_per_pdf_strategy_combination(self) -> None:
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)

        self.assertEqual(len(rows), len(self.corpus) * len(self.registry.names()))
        seen = {(r.pdf, r.strategy) for r in rows}
        expected = {
            (p.name, name) for p in self.corpus for name in self.registry.names()
        }
        self.assertEqual(seen, expected)

    def test_r6_s1_rows_carry_time_determinism_structure_and_diff_columns(
        self,
    ) -> None:
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)

        for row in rows:
            with self.subTest(pdf=row.pdf, strategy=row.strategy):
                self.assertIn(row.deterministic, {"yes", "no", "n/a"})
                self.assertIn(row.diff_ok, {"yes", "no", "n/a"})
                if row.status == "ok":
                    self.assertIsInstance(row.time_ms, float)
                    self.assertGreaterEqual(row.time_ms, 0.0)
                    self.assertIsInstance(row.headings, int)
                    self.assertIsInstance(row.tables, int)
                    self.assertIsInstance(row.lists, int)

    def test_r6_s1_pdftotext_electronic_pdf_matches_golden_and_structure_counts(
        self,
    ) -> None:
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)
        row = next(
            r for r in rows if r.pdf == "electronic.pdf" and r.strategy == "pdftotext"
        )

        self.assertEqual(row.status, "ok")
        self.assertEqual(row.deterministic, "yes")
        self.assertEqual(row.diff_ok, "yes")
        self.assertEqual(row.headings, 1)
        self.assertEqual(row.tables, 2)
        self.assertEqual(row.lists, 4)

    def test_r6_s1_pymupdf4llm_and_markitdown_report_error_status_here(self) -> None:
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)
        for strategy_name in ("pymupdf4llm", "markitdown"):
            row = next(
                r
                for r in rows
                if r.pdf == "electronic.pdf" and r.strategy == strategy_name
            )
            with self.subTest(strategy=strategy_name):
                self.assertEqual(row.status, "error")
                self.assertIn("not installed", row.error)
                self.assertEqual(row.diff_ok, "n/a")

    def test_r6_s1_scanned_pdf_has_no_successful_strategy_in_this_environment(
        self,
    ) -> None:
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)
        for row in rows:
            if row.pdf != "scanned.pdf":
                continue
            with self.subTest(strategy=row.strategy):
                self.assertEqual(row.status, "error")
                self.assertEqual(row.diff_ok, "n/a")
                self.assertEqual(row.deterministic, "n/a")

    def test_r6_s1_main_exits_zero_when_all_strategies_complete(self) -> None:
        exit_code = benchmark.main(
            ["--corpus-dir", str(CORPUS_DIR), "--golden-dir", str(GOLDEN_DIR)]
        )
        self.assertEqual(exit_code, 0)


@unittest.skipUnless(PDFTOTEXT_AVAILABLE, "pdftotext binary not found on PATH")
class TestBenchmarkReportsGoldenMismatchWithoutFailingExit(unittest.TestCase):
    """R6.S2 -- deliberately corrupt a temp golden to force a real mismatch."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_bench_golden_")
        self.addCleanup(self._tmpdir.cleanup)
        self.golden_dir = Path(self._tmpdir.name)
        # Deliberately wrong golden content: cannot match the real
        # pdftotext output for electronic.pdf, forcing a genuine mismatch.
        (self.golden_dir / "electronic__pdftotext.md").write_text(
            "this is deliberately wrong golden content\n", encoding="utf-8"
        )

    def test_r6_s2_mismatched_golden_marks_row_failed_and_summary_counts_it(
        self,
    ) -> None:
        corpus = benchmark.discover_corpus(CORPUS_DIR)
        registry = default_registry()

        rows = benchmark.run_benchmark(corpus, registry, self.golden_dir)
        summary = benchmark.summarize(rows)

        row = next(
            r for r in rows if r.pdf == "electronic.pdf" and r.strategy == "pdftotext"
        )
        self.assertEqual(row.diff_ok, "no")
        self.assertGreaterEqual(summary["golden_failures"], 1)

    def test_r6_s2_main_still_exits_zero_with_a_golden_mismatch_present(self) -> None:
        exit_code = benchmark.main(
            ["--corpus-dir", str(CORPUS_DIR), "--golden-dir", str(self.golden_dir)]
        )
        self.assertEqual(exit_code, 0)


if __name__ == "__main__":
    unittest.main()
