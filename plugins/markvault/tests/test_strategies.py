"""Per-strategy contract tests: supports() capability seam, determinism,
and structural-availability checks for strategies whose backing
library/binary is not installed in this environment.

These supplement the required registry-level tests in
test_strategy_registry.py (R1.S1, R1.S2) with coverage of the other
contract requirements called out in this task: format-agnostic
`supports(path)` and byte-identical determinism for the text-based
strategies.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from markvault.strategies.markitdown_strategy import MarkitdownStrategy  # noqa: E402
from markvault.strategies.pdftotext_strategy import PdftotextStrategy  # noqa: E402
from markvault.strategies.pymupdf4llm_strategy import (  # noqa: E402
    Pymupdf4llmStrategy,
)
from pdf_fixtures import write_minimal_pdf  # noqa: E402

PDFTOTEXT_AVAILABLE = shutil.which("pdftotext") is not None


class TestSupportsIsPdfOnlyInV1(unittest.TestCase):
    """Every v1 strategy declares PDF-only support (the format-detection
    seam itself -- supports() -- is real; the detection logic is not)."""

    def test_all_three_strategies_support_pdf_paths(self) -> None:
        for strategy in (
            Pymupdf4llmStrategy(),
            PdftotextStrategy(),
            MarkitdownStrategy(),
        ):
            with self.subTest(strategy=strategy.name):
                self.assertTrue(strategy.supports("document.pdf"))
                self.assertTrue(strategy.supports(Path("document.PDF")))

    def test_all_three_strategies_reject_non_pdf_paths(self) -> None:
        for strategy in (
            Pymupdf4llmStrategy(),
            PdftotextStrategy(),
            MarkitdownStrategy(),
        ):
            with self.subTest(strategy=strategy.name):
                self.assertFalse(strategy.supports("document.txt"))
                self.assertFalse(strategy.supports("document.docx"))


@unittest.skipUnless(PDFTOTEXT_AVAILABLE, "pdftotext binary not found on PATH")
class TestPdftotextStrategyDeterminism(unittest.TestCase):
    """R2: text-based strategies must be deterministic (identical bytes
    across two runs on the same input)."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "sample.pdf",
            "Determinism check text long enough",
        )

    def test_two_runs_on_the_same_input_are_byte_identical(self) -> None:
        strategy = PdftotextStrategy()

        first = strategy.extract(self.pdf_path)
        second = strategy.extract(self.pdf_path)

        self.assertEqual(first.encode("utf-8"), second.encode("utf-8"))


class TestPymupdf4llmStrategyAvailability(unittest.TestCase):
    def test_extracts_text_when_pymupdf4llm_is_installed(self) -> None:
        try:
            import pymupdf4llm  # noqa: F401
        except ImportError:
            self.skipTest(
                "pymupdf4llm is not installed and this environment has no "
                "network access to install it; Pymupdf4llmStrategy is "
                "structurally implemented against the documented API "
                "(pymupdf4llm.to_markdown) but not exercised here"
            )

        with tempfile.TemporaryDirectory(prefix="markvault_test_") as tmp:
            pdf_path = write_minimal_pdf(Path(tmp) / "sample.pdf", "pymupdf4llm check")
            strategy = Pymupdf4llmStrategy()
            text = strategy.extract(pdf_path)
            self.assertIn("pymupdf4llm check", text)


class TestMarkitdownStrategyAvailability(unittest.TestCase):
    def test_extracts_text_when_markitdown_is_installed(self) -> None:
        try:
            import markitdown  # noqa: F401
        except ImportError:
            self.skipTest(
                "markitdown is not installed and this environment has no "
                "network access to install it; MarkitdownStrategy is "
                "structurally implemented against the documented API "
                "(MarkItDown().convert(path).text_content), using only its "
                "local pdfminer.six/pdfplumber PDF path, but not exercised here"
            )

        with tempfile.TemporaryDirectory(prefix="markvault_test_") as tmp:
            pdf_path = write_minimal_pdf(Path(tmp) / "sample.pdf", "markitdown check")
            strategy = MarkitdownStrategy()
            text = strategy.extract(pdf_path)
            self.assertIn("markitdown check", text)


if __name__ == "__main__":
    unittest.main()
