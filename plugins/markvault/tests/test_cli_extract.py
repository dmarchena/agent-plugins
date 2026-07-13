"""CLI-level contract tests for markvault's `markvault.cli` extraction command.

Covers the refs this task (cli-extract) must materialize:

- R1.S1: invoking the command with an explicit strategy produces the `.md`
  with that strategy and reports its name on stderr.
- R2.S1: invoking the command on an electronic PDF without an output path
  creates a `.md` next to the PDF with non-empty content, reports chars and
  strategy on stderr, and exits with code 0.
- R2.S2: with an explicit output path the `.md` is written exactly at that
  path.
- R2.S3: on an input not readable as a PDF the command exits with a
  non-zero code, warns without dumping content, and creates no `.md`.

Also exercises R1.S3 (markitdown) as a bonus, skipped when markitdown is not
installed (same availability pattern used by test_strategies.py), because
the task explicitly requires `--strategy markitdown` to behave like any
other registered strategy.

Every case invokes the real CLI as a subprocess (`python3 -m markvault.cli`)
rather than calling `main()` in-process: this is a CLI contract (argv
parsing, process exit code, stderr framing, filesystem side effects), and a
subprocess is the only way to observe the actual exit code the way an
operator or a driving skill would.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pdf_fixtures import write_minimal_pdf  # noqa: E402

_SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"

try:
    import markitdown  # noqa: F401

    MARKITDOWN_AVAILABLE = True
except ImportError:
    MARKITDOWN_AVAILABLE = False


def run_cli(args, cwd=None):
    """Invoke `python3 -m markvault.cli <args>` as a real subprocess."""
    import os

    env = dict(os.environ)
    env["PYTHONPATH"] = str(_SCRIPTS_DIR)
    return subprocess.run(
        [sys.executable, "-m", "markvault.cli", *args],
        capture_output=True,
        text=True,
        cwd=cwd,
        env=env,
        timeout=30,
    )


class TestExplicitStrategySelection(unittest.TestCase):
    """R1.S1 -- invoking the command with an explicit strategy."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_cli_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "sample.pdf",
            "Hello markvault CLI test",
        )

    def test_r1_s1_explicit_strategy_produces_md_and_reports_strategy_name(
        self,
    ) -> None:
        proc = run_cli(["--strategy", "pdftotext", str(self.pdf_path)])

        self.assertEqual(proc.returncode, 0, proc.stderr)
        md_path = self.pdf_path.with_suffix(".md")
        self.assertTrue(md_path.is_file())
        self.assertIn("strategy=pdftotext", proc.stderr)


class TestElectronicHappyPath(unittest.TestCase):
    """R2.S1 -- electronic PDF, no --out: .md created next to the PDF."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_cli_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "document.pdf",
            "Electronic happy path content for markvault",
        )

    def test_r2_s1_creates_md_next_to_pdf_reports_chars_and_strategy_exit_0(
        self,
    ) -> None:
        proc = run_cli(["--strategy", "pdftotext", str(self.pdf_path)])

        self.assertEqual(proc.returncode, 0, proc.stderr)

        expected_md = self.pdf_path.with_suffix(".md")
        self.assertTrue(expected_md.is_file())
        content = expected_md.read_text(encoding="utf-8")
        self.assertGreater(len(content), 0)

        self.assertIn("strategy=pdftotext", proc.stderr)
        self.assertRegex(proc.stderr, r"chars=\d+")
        # chars=0 would technically match \d+, so also assert non-empty count.
        self.assertNotIn("chars=0 ", proc.stderr)


class TestExplicitOutputPath(unittest.TestCase):
    """R2.S2 -- explicit --out: the .md is written exactly at that path."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_cli_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "input.pdf",
            "Explicit output path content",
        )
        self.out_path = Path(self._tmpdir.name) / "custom_output.md"

    def test_r2_s2_md_written_exactly_at_explicit_out_path(self) -> None:
        default_md = self.pdf_path.with_suffix(".md")

        proc = run_cli(
            ["--strategy", "pdftotext", str(self.pdf_path), "--out", str(self.out_path)]
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(self.out_path.is_file())
        self.assertFalse(default_md.exists())


class TestUnreadablePdfInput(unittest.TestCase):
    """R2.S3 -- input not readable as a PDF: missing, corrupt, or non-PDF."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_cli_test_")
        self.addCleanup(self._tmpdir.cleanup)

    def test_r2_s3_missing_file_exits_nonzero_warns_without_content_no_md(
        self,
    ) -> None:
        missing_path = Path(self._tmpdir.name) / "does_not_exist.pdf"

        proc = run_cli(["--strategy", "pdftotext", str(missing_path)])

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("could not read the PDF", proc.stderr)
        self.assertFalse(missing_path.with_suffix(".md").exists())

    def test_r2_s3_corrupt_pdf_exits_nonzero_warns_without_content_no_md(
        self,
    ) -> None:
        corrupt_path = Path(self._tmpdir.name) / "corrupt.pdf"
        corrupt_path.write_bytes(b"this is not a real PDF, just garbage bytes")

        proc = run_cli(["--strategy", "pdftotext", str(corrupt_path)])

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("could not read the PDF", proc.stderr)
        self.assertNotIn("this is not a real PDF", proc.stderr)
        self.assertFalse(corrupt_path.with_suffix(".md").exists())

    def test_r2_s3_non_pdf_file_exits_nonzero_warns_without_content_no_md(
        self,
    ) -> None:
        text_path = Path(self._tmpdir.name) / "notes.txt"
        secret_content = "SECRET file content that must never reach stderr"
        text_path.write_text(secret_content, encoding="utf-8")

        proc = run_cli(["--strategy", "pdftotext", str(text_path)])

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("could not read the PDF", proc.stderr)
        self.assertNotIn(secret_content, proc.stderr)
        self.assertFalse(text_path.with_suffix(".md").exists())


class TestUnknownStrategyName(unittest.TestCase):
    """R1.S2 (surfaced via the CLI) -- unknown --strategy name."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_cli_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "sample.pdf", "Unknown strategy test"
        )

    def test_unknown_strategy_surfaces_registry_error_and_exits_nonzero(
        self,
    ) -> None:
        proc = run_cli(["--strategy", "nosuch", str(self.pdf_path)])

        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("unknown strategy: nosuch", proc.stderr)
        self.assertFalse(self.pdf_path.with_suffix(".md").exists())


@unittest.skipUnless(
    MARKITDOWN_AVAILABLE,
    "markitdown is not installed and this environment has no network access "
    "to install it",
)
class TestMarkitdownStrategySelection(unittest.TestCase):
    """R1.S3 -- --strategy markitdown works like any other registry strategy."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_cli_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "sample.pdf", "markitdown CLI check"
        )

    def test_markitdown_produces_md_and_reports_strategy_name(self) -> None:
        proc = run_cli(["--strategy", "markitdown", str(self.pdf_path)])

        self.assertEqual(proc.returncode, 0, proc.stderr)
        md_path = self.pdf_path.with_suffix(".md")
        self.assertTrue(md_path.is_file())
        self.assertIn("strategy=markitdown", proc.stderr)


if __name__ == "__main__":
    unittest.main()
