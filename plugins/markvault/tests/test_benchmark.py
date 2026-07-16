"""TDD contract tests for markvault's benchmark harness (task: benchmark-harness).

Covers:
- R6.S1: the benchmark emits one row per PDF-strategy combination with
  columns for time, determinism, structure counts, and the diff result
  against the golden, and exits with code 0 when all strategies complete.
- R6.S2: if a strategy's output differs from its expected golden file,
  the row marks the diff as failed and the summary reports at least one
  golden failure while the exit code is still 0.

Environment note (checked directly, same approach as test_strategies.py /
test_strategy_registry.py): what this suite can exercise depends on which
extraction backends the environment running it actually has, so the tests
below assert *the benchmark's reporting contract* against that
availability rather than hard-coding one machine's state:
- `pdftotext` on `electronic.pdf` (has an embedded text layer) is the one
  combination guaranteed end-to-end wherever Poppler is installed, with
  byte-identical output checked against a real golden file.
- `pymupdf4llm` and `markitdown` are exercised for real when their
  libraries are importable, and must report `status="error"` naming them
  as `not installed` when they are not. Both are provisioned on demand by
  `uv run --with` (see the plugin's README), so a plain `python3` run of
  this suite legitimately takes the second branch.
- `scanned.pdf` is a deliberately blank page (`pdf_fixtures.make_blank_pdf`)
  with no text to find, so no strategy extracts structure from it however
  well-equipped the environment is -- not even via OCR.
- `typographic.pdf` and `ruled_table.pdf` are what make the corpus able to
  rank the strategies at all: `electronic.pdf` carries literal Markdown
  syntax inside its text, so every strategy reproduces it by extracting
  characters and they all score alike. Headings inferred from font size and
  a table drawn as rules cannot be faked that way.

Versions are deliberately unpinned, so an upgrade can change extracted
output and turn output-shaped assertions red with no local change to
blame. Tests whose assertions depend on what a library produced subclass
`version_witness.VersionWitnessTestCase`, which names any moved dependency
version in the failure message. See `version_witness.py`.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import version_witness  # noqa: E402
from markvault import benchmark  # noqa: E402
from markvault.registry import default_registry  # noqa: E402

PDFTOTEXT_AVAILABLE = shutil.which("pdftotext") is not None

#: Which Python strategy each backing distribution belongs to. `markitdown`
#: needs its `[pdf]` extra (pdfminer.six) to read a PDF at all, so both are
#: required before its rows can be expected to succeed.
PYTHON_STRATEGY_DISTS = {
    "pymupdf4llm": ("pymupdf4llm",),
    "markitdown": ("markitdown", "pdfminer.six"),
}


def _strategy_backend_installed(strategy_name: str) -> bool:
    return all(
        version_witness.is_installed(dist)
        for dist in PYTHON_STRATEGY_DISTS[strategy_name]
    )

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
CORPUS_DIR = FIXTURES_DIR / "benchmark_corpus"
GOLDEN_DIR = FIXTURES_DIR / "benchmark_golden"


@unittest.skipUnless(PDFTOTEXT_AVAILABLE, "pdftotext binary not found on PATH")
class TestBenchmarkEmitsOneRowPerCombination(version_witness.VersionWitnessTestCase):
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

    def test_r6_s1_python_strategies_report_per_backend_availability(self) -> None:
        """Each Python strategy either runs, or says which library is missing.

        Asserts the reporting contract both ways rather than one machine's
        state: with the backend installed (as `uv run --with` provides) the
        row must genuinely run; without it, the row must fail loudly naming
        it `not installed`, never a silent skip or a fake success.
        """
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)
        for strategy_name in PYTHON_STRATEGY_DISTS:
            row = next(
                r
                for r in rows
                if r.pdf == "electronic.pdf" and r.strategy == strategy_name
            )
            with self.subTest(strategy=strategy_name):
                if _strategy_backend_installed(strategy_name):
                    self.assertEqual(row.status, "ok")
                    self.assertEqual(row.deterministic, "yes")
                else:
                    self.assertEqual(row.status, "error")
                    self.assertIn("not installed", row.error)
                    self.assertEqual(row.diff_ok, "n/a")

    def test_r6_s1_blank_scanned_pdf_yields_no_structure_from_any_strategy(
        self,
    ) -> None:
        """A blank page has nothing to find, however good the backend is.

        `scanned.pdf` is `pdf_fixtures.make_blank_pdf()`: valid structure,
        empty content stream. So a strategy that runs must report zero
        structure counts, and one whose backend is absent must report an
        error -- but no strategy may ever claim to have found headings,
        tables or lists in it. That holds with pymupdf4llm, markitdown,
        Poppler and tesseract all installed, which is why it no longer
        asserts a blanket `error` the way it did when this environment
        simply lacked every backend.
        """
        rows = benchmark.run_benchmark(self.corpus, self.registry, GOLDEN_DIR)
        scanned_rows = [r for r in rows if r.pdf == "scanned.pdf"]
        self.assertEqual(len(scanned_rows), len(self.registry.names()))

        for row in scanned_rows:
            with self.subTest(strategy=row.strategy):
                self.assertIn(row.status, {"ok", "error"})
                if row.status == "ok":
                    self.assertEqual(row.headings, 0)
                    self.assertEqual(row.tables, 0)
                    self.assertEqual(row.lists, 0)
                self.assertEqual(row.diff_ok, "n/a")

    def test_r6_s1_main_exits_zero_when_all_strategies_complete(self) -> None:
        exit_code = benchmark.main(
            ["--corpus-dir", str(CORPUS_DIR), "--golden-dir", str(GOLDEN_DIR)]
        )
        self.assertEqual(exit_code, 0)


@unittest.skipUnless(PDFTOTEXT_AVAILABLE, "pdftotext binary not found on PATH")
@unittest.skipUnless(
    _strategy_backend_installed("pymupdf4llm")
    and _strategy_backend_installed("markitdown"),
    "needs both Python backends to compare them",
)
class TestCorpusDiscriminatesStrategies(version_witness.VersionWitnessTestCase):
    """The corpus must be able to tell the strategies apart.

    This is the evidence behind the `auto` chain's order, kept executable
    instead of asserted in prose: `pymupdf4llm` first because it is the only
    one that infers headings, `markitdown` second because it matches it on
    tables but not headings, `pdftotext` after both because it reconstructs
    neither.

    It doubles as a canary. These assertions describe third-party behaviour
    at unpinned versions, so a failure here is not necessarily a bug: it may
    mean an upgrade changed what a strategy can do, and that the chain's
    order should be reconsidered. `VersionWitnessTestCase` names the moved
    version in that case.
    """

    def setUp(self) -> None:
        self.rows = benchmark.run_benchmark(
            benchmark.discover_corpus(CORPUS_DIR), default_registry(), GOLDEN_DIR
        )

    def _row(self, pdf: str, strategy: str):
        return next(
            r for r in self.rows if r.pdf == pdf and r.strategy == strategy
        )

    def test_only_pymupdf4llm_infers_typographic_headings(self) -> None:
        """`typographic.pdf` has no literal `#`: headings must be inferred."""
        self.assertGreater(
            self._row("typographic.pdf", "pymupdf4llm").headings,
            0,
            "pymupdf4llm should infer headings from font size; if it no longer "
            "does, it may not deserve the chain's first position",
        )
        for strategy in ("markitdown", "pdftotext"):
            with self.subTest(strategy=strategy):
                self.assertEqual(
                    self._row("typographic.pdf", strategy).headings,
                    0,
                    f"{strategy} is not expected to reconstruct headings; if it "
                    "now does, the chain's order is worth revisiting",
                )

    def test_markitdown_matches_pymupdf4llm_on_ruled_tables_and_pdftotext_does_not(
        self,
    ) -> None:
        """A drawn grid: rebuilding it needs rule detection, not just text."""
        for strategy in ("pymupdf4llm", "markitdown"):
            with self.subTest(strategy=strategy):
                self.assertGreater(
                    self._row("ruled_table.pdf", strategy).tables,
                    0,
                    f"{strategy} should rebuild a ruled table as Markdown",
                )
        self.assertEqual(
            self._row("ruled_table.pdf", "pdftotext").tables,
            0,
            "pdftotext yields space-aligned columns, not a Markdown table; "
            "that gap is why markitdown sits above it in the chain",
        )


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
