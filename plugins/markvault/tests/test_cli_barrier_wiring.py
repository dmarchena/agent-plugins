"""Tests for wiring `red_guard`'s anti-network-leak barrier into the
`markvault.cli` entrypoint (task: barrier-privacy-wiring).

Covers the two refs this task must materialize:

- R4.S1: a real extraction with any v1 strategy, with the barrier active,
  completes with exit code 0 and no network error -- i.e. wiring the
  barrier into `main()` must not itself break normal offline extraction.
  Exit code 0 alone would trivially hold even before wiring (extraction
  never opens a network connection), so this also asserts the barrier's
  own activated state and offline env vars as an observable side effect
  of running `main()`, which is the part that only holds once the barrier
  is actually wired in.
- R5.S1: the CLI's metadata report on stderr (`path=... chars=...
  strategy=...`) never contains any line of the extracted PDF's own text.

Both cases invoke the CLI as a real subprocess: R4.S1 needs a fresh
process because `red_guard.activate()` patches process-global `socket`
state, and R5.S1 is a CLI contract (stderr framing) like the rest of
test_cli_extract.py.
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


def run_cli(args):
    """Invoke `python3 -m markvault.cli <args>` as a real subprocess."""
    import os

    env = dict(os.environ)
    env["PYTHONPATH"] = str(_SCRIPTS_DIR)
    return subprocess.run(
        [sys.executable, "-m", "markvault.cli", *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )


class TestBarrierActiveDuringRealExtraction(unittest.TestCase):
    """R4.S1 -- barrier wired in front of a real v1-strategy extraction."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_barrier_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "sample.pdf",
            "Barrier wiring extraction content",
        )

    def test_r4_s1_main_activates_barrier_and_extraction_still_exits_zero(
        self,
    ) -> None:
        # Drive `cli.main()` in-process (inside a throwaway subprocess) so we
        # can inspect `red_guard`'s own post-run state -- not just the exit
        # code, which would trivially be 0 even without the barrier wired in
        # since extraction never opens a network connection.
        script = (
            "import sys\n"
            f"sys.path.insert(0, {str(_SCRIPTS_DIR)!r})\n"
            "from markvault import cli, red_guard\n"
            f"rc = cli.main(['--strategy', 'pdftotext', {str(self.pdf_path)!r}])\n"
            "print('EXIT_CODE=' + str(rc))\n"
            "print('BARRIER_ACTIVE=' + str(red_guard.is_active()))\n"
            "import os\n"
            "print('HF_HUB_OFFLINE=' + os.environ.get('HF_HUB_OFFLINE', ''))\n"
            "print('TRANSFORMERS_OFFLINE=' + os.environ.get('TRANSFORMERS_OFFLINE', ''))\n"
            "print('HF_DATASETS_OFFLINE=' + os.environ.get('HF_DATASETS_OFFLINE', ''))\n"
        )
        proc = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=30,
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("EXIT_CODE=0", proc.stdout)
        self.assertIn(
            "BARRIER_ACTIVE=True",
            proc.stdout,
            "red_guard.activate() must run before/inside cli.main()",
        )
        self.assertIn("HF_HUB_OFFLINE=1", proc.stdout)
        self.assertIn("TRANSFORMERS_OFFLINE=1", proc.stdout)
        self.assertIn("HF_DATASETS_OFFLINE=1", proc.stdout)

    def test_r4_s1_cli_subprocess_exits_zero_with_barrier_wired(self) -> None:
        proc = run_cli(["--strategy", "pdftotext", str(self.pdf_path)])

        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(self.pdf_path.with_suffix(".md").is_file())


class TestMetadataReportNeverLeaksPdfText(unittest.TestCase):
    """R5.S1 -- the stderr metadata report never contains the PDF's text."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_barrier_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.distinctive_text = "Zzyzx-9271-quorlanthium unique marker string"
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "secret.pdf",
            self.distinctive_text,
        )

    def test_r5_s1_stderr_report_never_contains_extracted_pdf_text(self) -> None:
        proc = run_cli(["--strategy", "pdftotext", str(self.pdf_path)])

        self.assertEqual(proc.returncode, 0, proc.stderr)
        # Sanity check: the distinctive text really was extracted into the
        # .md file, so the "never in stderr" assertion below is meaningful.
        md_content = self.pdf_path.with_suffix(".md").read_text(encoding="utf-8")
        self.assertIn(self.distinctive_text, md_content)

        for line in proc.stderr.splitlines():
            self.assertNotIn(self.distinctive_text, line)
        self.assertIn("strategy=pdftotext", proc.stderr)
        self.assertRegex(proc.stderr, r"chars=\d+")


if __name__ == "__main__":
    unittest.main()
