"""CLI-level contract tests for markvault's `--strategy auto` fallback
chain (task: fallback-chain).

Covers:
- R3.S1: a readable electronic PDF in auto mode is extracted with the
  structured strategy and no fallback is reported.
- R3.S2: an image/scanned PDF (no embedded text) in auto mode falls
  through the chain to OCR, reports that a fallback occurred, and
  produces a non-empty `.md`.

Environment note: neither `pymupdf4llm` nor a real `tesseract` binary is
installed in this environment (`pymupdf4llm` -- no network access to
install it, same as `test_strategies.py`'s own skip pattern; `tesseract`
is simply absent from PATH here, confirmed via `shutil.which`, while
`pdftotext` and `pdftoppm` ARE present). To still exercise the *real*
`cli.py` fallback-chain logic end-to-end rather than skipping, both
missing pieces are faked at the narrowest possible seam:

- R3.S1 provides a fake `pymupdf4llm` module on PYTHONPATH satisfying the
  exact `to_markdown(path) -> str` contract `Pymupdf4llmStrategy.extract()`
  calls, so the real strategy and the real `cli.py` chain-selection code
  run unmodified and succeed.
- R3.S2 provides a fake `tesseract` *executable* on PATH (a tiny script
  that prints fixed text) so `PdftotextStrategy`'s real, unmodified
  internal OCR recourse runs against a genuinely `pdftoppm`-rendered page
  image (pdftoppm IS installed here) -- only the final OCR
  text-recognition step is stubbed.

Neither fake touches `cli.py` or the strategies' own code; they only
substitute the optional third-party dependency / binary this environment
lacks, so the chain-selection logic under test in `cli.py` runs for real.
"""
from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pdf_fixtures import write_blank_pdf, write_minimal_pdf  # noqa: E402

_SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"

PDFTOPPM_AVAILABLE = shutil.which("pdftoppm") is not None


def run_cli(args, env_extra=None):
    """Invoke `python3 -m markvault.cli <args>` as a real subprocess."""
    env = dict(os.environ)
    env["PYTHONPATH"] = str(_SCRIPTS_DIR)
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        [sys.executable, "-m", "markvault.cli", *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )


def _write_fake_pymupdf4llm_module(directory: Path, markdown_text: str) -> None:
    """Write a fake `pymupdf4llm` module exposing `to_markdown()`.

    Satisfies the exact call contract `Pymupdf4llmStrategy.extract()` uses
    (`pymupdf4llm.to_markdown(str(path)) -> str`), so the real strategy
    code runs unmodified. Needed because the real `pymupdf4llm` package is
    not installed in this environment (no network access to install it).
    """
    module_path = directory / "pymupdf4llm.py"
    module_path.write_text(
        "def to_markdown(path):\n"
        f"    return {markdown_text!r}\n",
        encoding="utf-8",
    )


def _write_fake_tesseract_binary(directory: Path, fixed_text: str) -> Path:
    """Write a fake `tesseract` executable on PATH that always prints
    `fixed_text` to stdout, ignoring its arguments.

    Needed because the real `tesseract` binary is not installed in this
    environment; the real `pdftoppm` step upstream of it still runs for
    real, so only the final OCR text-recognition step is stubbed.
    """
    script_path = directory / "tesseract"
    script_path.write_text(
        "#!/bin/sh\n"
        f'printf \'%s\' "{fixed_text}"\n',
        encoding="utf-8",
    )
    script_path.chmod(
        script_path.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH
    )
    return script_path


class TestAutoModeStructuredSuccess(unittest.TestCase):
    """R3.S1 -- auto mode on a readable electronic PDF: structured
    strategy used, no fallback reported."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_auto_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "electronic.pdf",
            "Electronic PDF content long enough for auto mode structured success",
        )
        self._fake_pkg_dir = Path(self._tmpdir.name) / "fake_pymupdf4llm_pkg"
        self._fake_pkg_dir.mkdir()
        _write_fake_pymupdf4llm_module(
            self._fake_pkg_dir,
            "# Fake structured markdown\n\nEnough characters to clear the "
            "auto-mode threshold easily.",
        )
        self._fake_pythonpath = os.pathsep.join(
            [str(self._fake_pkg_dir), str(_SCRIPTS_DIR)]
        )

    def test_r3_s1_auto_mode_default_selects_structured_strategy_no_fallback(
        self,
    ) -> None:
        proc = run_cli(
            [str(self.pdf_path)], env_extra={"PYTHONPATH": self._fake_pythonpath}
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        md_path = self.pdf_path.with_suffix(".md")
        self.assertTrue(md_path.is_file())
        self.assertGreater(len(md_path.read_text(encoding="utf-8")), 0)
        self.assertIn("strategy=pymupdf4llm fallback=no", proc.stderr)

    def test_r3_s1_auto_mode_explicit_flag_selects_structured_strategy_no_fallback(
        self,
    ) -> None:
        proc = run_cli(
            ["--strategy", "auto", str(self.pdf_path)],
            env_extra={"PYTHONPATH": self._fake_pythonpath},
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("strategy=pymupdf4llm fallback=no", proc.stderr)


@unittest.skipUnless(PDFTOPPM_AVAILABLE, "pdftoppm binary not found on PATH")
class TestAutoModeFallsBackThroughOcr(unittest.TestCase):
    """R3.S2 -- auto mode on an image/scanned PDF (no embedded text) falls
    through the chain to OCR, reports fallback, produces a non-empty `.md`.
    """

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_auto_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_blank_pdf(Path(self._tmpdir.name) / "scanned.pdf")

        # pymupdf4llm is genuinely absent in this environment already (no
        # fake needed): the structured strategy fails for real, exactly as
        # it would for anyone without the optional package installed.

        # tesseract is absent here too, but pdftoppm (upstream of it) is
        # installed and runs for real; only the final OCR text step below
        # is stubbed with a fake executable.
        self._fake_bin_dir = Path(self._tmpdir.name) / "fake_bin"
        self._fake_bin_dir.mkdir()
        self._ocr_marker_text = (
            "OCR FAKE MARKER decoded page text for markvault auto chain test"
        )
        _write_fake_tesseract_binary(self._fake_bin_dir, self._ocr_marker_text)

    def test_r3_s2_auto_mode_falls_back_to_ocr_reports_fallback_nonempty_md(
        self,
    ) -> None:
        fake_path = os.pathsep.join(
            [str(self._fake_bin_dir), os.environ.get("PATH", "")]
        )
        proc = run_cli([str(self.pdf_path)], env_extra={"PATH": fake_path})

        self.assertEqual(proc.returncode, 0, proc.stderr)
        md_path = self.pdf_path.with_suffix(".md")
        self.assertTrue(md_path.is_file())
        content = md_path.read_text(encoding="utf-8")
        self.assertGreater(len(content), 0)
        self.assertIn(self._ocr_marker_text, content)

        self.assertIn("strategy=ocr fallback=yes", proc.stderr)


if __name__ == "__main__":
    unittest.main()
