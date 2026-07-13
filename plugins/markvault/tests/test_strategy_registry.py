"""Registry-level contract tests for markvault's extraction strategies.

Covers the two refs this task must materialize:

- R1.S1: selecting an existing strategy by name returns extracted text and
  exposes the name of the strategy effectively used.
- R1.S2: selecting a non-existent strategy name produces an error that
  names the unknown strategy and lists the valid ones.

R1.S1 is exercised end-to-end against the "pdftotext" strategy: the
`pdftotext` binary (Poppler) is present on PATH in this environment. The
`pymupdf4llm` and `markitdown` strategies are not installed here and there
is no network access in this environment to install them (see
test_strategies.py for the per-strategy availability breakdown). R1.S2 is
pure registry logic and needs no external strategy dependency.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from markvault.registry import UnknownStrategyError, default_registry  # noqa: E402
from pdf_fixtures import write_minimal_pdf  # noqa: E402

PDFTOTEXT_AVAILABLE = shutil.which("pdftotext") is not None


class TestUnknownStrategySelection(unittest.TestCase):
    """R1.S2 -- selecting a non-existent strategy name."""

    def test_get_unknown_strategy_names_it_and_lists_valid_ones(self) -> None:
        registry = default_registry()

        with self.assertRaises(UnknownStrategyError) as ctx:
            registry.get("nosuch")

        message = str(ctx.exception)
        self.assertIn("unknown strategy: nosuch", message)
        for valid_name in registry.names():
            self.assertIn(valid_name, message)

    def test_extract_with_unknown_strategy_name_also_raises(self) -> None:
        registry = default_registry()

        with self.assertRaises(UnknownStrategyError):
            registry.extract("nosuch", "irrelevant.pdf")


@unittest.skipUnless(PDFTOTEXT_AVAILABLE, "pdftotext binary not found on PATH")
class TestExplicitStrategySelection(unittest.TestCase):
    """R1.S1 -- selecting an existing strategy by name."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "sample.pdf",
            "Hello markvault strategy test",
        )

    def test_get_by_name_returns_the_matching_strategy(self) -> None:
        registry = default_registry()

        strategy = registry.get("pdftotext")

        self.assertEqual(strategy.name, "pdftotext")

    def test_extract_by_name_returns_text_and_reports_used_strategy(self) -> None:
        registry = default_registry()

        result = registry.extract("pdftotext", self.pdf_path)

        self.assertIn("Hello markvault strategy test", result.text)
        self.assertEqual(result.strategy_name, "pdftotext")


if __name__ == "__main__":
    unittest.main()
