"""End-to-end integration test tying together the full markvault CLI
pipeline (task: e2e-integration).

Covers R-E2E.S1: a single command-line invocation of `markvault.cli`
against an electronic PDF creates the `.md` next to it with non-empty
content and reports `path=... chars=<N> strategy=<name>` on stderr without
ever leaking a line of the PDF's own extracted text -- and the *same*
command, wrapped in the platform's OS-level network-denial mechanism
(`unshare -n` on Linux; `sandbox-exec -n 'deny network*'` on macOS, not
exercised here since this environment is Linux), still completes with
exit code 0.

This composes pieces already built by prior tasks -- `cli.py`'s strategy
registry/fallback chain and `red_guard.py`'s already-wired barrier -- it
does not reimplement any of their logic, only invokes the CLI as a real
subprocess, the same way test_cli_extract.py and test_cli_barrier_wiring.py
already do.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pdf_fixtures import write_minimal_pdf  # noqa: E402

_SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"


def run_cli(args, cmd_prefix=None, env_extra=None):
    """Invoke `python3 -m markvault.cli <args>` as a real subprocess.

    `cmd_prefix` optionally wraps the invocation (e.g. `["unshare", "-n"]`)
    so the *same* command can be exercised under an OS-level network-denial
    mechanism, per R-E2E.S1.
    """
    env = dict(os.environ)
    env["PYTHONPATH"] = str(_SCRIPTS_DIR)
    if env_extra:
        env.update(env_extra)
    cmd = list(cmd_prefix or []) + [sys.executable, "-m", "markvault.cli", *args]
    return subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=30)


def _detect_unshare_net_wrapper():
    """Probe whether `unshare -n` can run unprivileged in this environment.

    Tries plain `unshare -n` first, then `unshare -n --map-root-user` (the
    unprivileged-user-namespace variant), per R-E2E.S1's Linux mechanism.
    Returns `(argv_prefix, None)` for the first variant that actually works,
    or `(None, reason)` describing the concrete blocker if neither does --
    this must report that blocker rather than silently skipping.
    """
    if shutil.which("unshare") is None:
        return None, "the 'unshare' binary is not on PATH in this environment"

    last_stderr = ""
    for candidate in (["unshare", "-n"], ["unshare", "-n", "--map-root-user"]):
        try:
            probe = subprocess.run(
                candidate + ["true"], capture_output=True, text=True, timeout=10
            )
        except OSError as exc:  # pragma: no cover - defensive
            last_stderr = str(exc)
            continue
        if probe.returncode == 0:
            return candidate, None
        last_stderr = probe.stderr.strip()

    return None, (
        "unshare -n is not usable unprivileged in this environment (both "
        "'unshare -n' and 'unshare -n --map-root-user' failed) -- last "
        f"error: {last_stderr!r}. This machine enforces "
        "kernel.apparmor_restrict_unprivileged_userns=1 (confirmed via "
        "sysctl) and has no passwordless sudo to escalate, so an "
        "unprivileged process cannot create a network namespace here."
    )


_UNSHARE_NET_WRAPPER, _UNSHARE_NET_UNAVAILABLE_REASON = _detect_unshare_net_wrapper()
UNSHARE_NET_AVAILABLE = _UNSHARE_NET_WRAPPER is not None


class TestEndToEndCliProducesMdWithoutLeakingContent(unittest.TestCase):
    """R-E2E.S1 -- converting an electronic PDF via the CLI creates the
    `.md` with non-empty content, and the stderr report never contains any
    of the PDF's actual extracted text."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(prefix="markvault_e2e_test_")
        self.addCleanup(self._tmpdir.cleanup)
        self.distinctive_text = "Fenwick-8823-glorptastic e2e marker"
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "e2e_electronic.pdf", self.distinctive_text
        )

    def test_r_e2e_s1_cli_creates_md_and_reports_stats_without_leaking_text(
        self,
    ) -> None:
        proc = run_cli(["--strategy", "pdftotext", str(self.pdf_path)])

        self.assertEqual(proc.returncode, 0, proc.stderr)

        md_path = self.pdf_path.with_suffix(".md")
        self.assertTrue(md_path.is_file())
        content = md_path.read_text(encoding="utf-8")
        self.assertGreater(len(content), 0)
        # Sanity check the marker really made it into the .md, so the
        # "never in stderr" assertion below is meaningful, not vacuous.
        self.assertIn(self.distinctive_text, content)

        self.assertIn(f"path={md_path}", proc.stderr)
        self.assertRegex(proc.stderr, r"chars=\d+")
        self.assertIn("strategy=pdftotext", proc.stderr)
        for line in proc.stderr.splitlines():
            self.assertNotIn(self.distinctive_text, line)


@unittest.skipUnless(
    UNSHARE_NET_AVAILABLE,
    _UNSHARE_NET_UNAVAILABLE_REASON or "unshare -n unavailable in this environment",
)
class TestEndToEndCliUnderOsLevelNetworkDenial(unittest.TestCase):
    """R-E2E.S1 -- the same CLI command, run under the platform's OS-level
    network-denial mechanism (`unshare -n` on Linux), still exits 0."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory(
            prefix="markvault_e2e_netns_test_"
        )
        self.addCleanup(self._tmpdir.cleanup)
        self.pdf_path = write_minimal_pdf(
            Path(self._tmpdir.name) / "e2e_netns.pdf",
            "Network denial e2e integration content",
        )

    def test_r_e2e_s1_cli_under_unshare_net_denial_exits_zero(self) -> None:
        proc = run_cli(
            ["--strategy", "pdftotext", str(self.pdf_path)],
            cmd_prefix=_UNSHARE_NET_WRAPPER,
        )

        self.assertEqual(proc.returncode, 0, proc.stderr)
        md_path = self.pdf_path.with_suffix(".md")
        self.assertTrue(md_path.is_file())
        self.assertGreater(len(md_path.read_text(encoding="utf-8")), 0)


if __name__ == "__main__":
    unittest.main()
