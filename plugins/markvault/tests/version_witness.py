"""Records the dependency versions this suite last passed green with.

markvault deliberately does *not* pin its extraction dependencies: the
skill and commands invoke `uv run --with pymupdf4llm` (and
`--with 'markitdown[pdf]'`) without a version, so every environment
resolves the newest release and extraction quality improves for free.

The cost of that choice is that a future release of `pymupdf4llm` or
`markitdown` can change a strategy's Markdown -- turning these tests red
with no local change to blame, which is the slowest kind of failure to
diagnose. This module makes that failure explain itself: assertions in a
`VersionWitnessTestCase` carry a note naming every tracked dependency
whose version moved since the suite was last recorded green, so an
output-shaped failure points at the upgrade immediately instead of
sending someone hunting through a diff that does not exist.

The baseline is a record, not a constraint -- nothing here pins, installs
or rejects a version. After reviewing a failure caused by an upgrade and
accepting the new output (regenerating goldens if needed), re-record it:

    python -m tests.version_witness --record
"""
from __future__ import annotations

import json
import sys
import unittest
from datetime import date
from importlib import metadata
from pathlib import Path
from typing import Dict, Optional

BASELINE_PATH = Path(__file__).resolve().parent / "versions_baseline.json"

#: Distributions whose releases can change a strategy's extracted Markdown.
#: `pymupdf` and `pdfminer.six` are tracked because they are the engines
#: under `pymupdf4llm` and `markitdown[pdf]` respectively: an output change
#: can originate there while the top-level version stands still.
TRACKED = ("pymupdf4llm", "pymupdf", "markitdown", "pdfminer.six")


def installed_version(dist: str) -> Optional[str]:
    """Return `dist`'s installed version, or None when it is absent."""
    try:
        return metadata.version(dist)
    except metadata.PackageNotFoundError:
        return None


def is_installed(dist: str) -> bool:
    """Whether `dist` is importable in the environment running the tests."""
    return installed_version(dist) is not None


def current_versions() -> Dict[str, Optional[str]]:
    """Map every tracked distribution to its version here and now."""
    return {dist: installed_version(dist) for dist in TRACKED}


def _read_baseline() -> Dict[str, object]:
    if not BASELINE_PATH.is_file():
        return {}
    try:
        return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def baseline_versions() -> Dict[str, Optional[str]]:
    """The tracked versions recorded the last time the suite was green."""
    data = _read_baseline()
    versions = data.get("versions", {})
    return versions if isinstance(versions, dict) else {}


def drift_note() -> str:
    """Describe every tracked version that moved since the last green run.

    Returns the empty string when there is nothing useful to say -- no
    baseline recorded yet, or nothing moved -- so callers can append it
    unconditionally without dressing failures in noise.
    """
    baseline = baseline_versions()
    if not baseline:
        return ""

    current = current_versions()
    moved = [
        (dist, baseline.get(dist), current.get(dist))
        for dist in TRACKED
        if baseline.get(dist) != current.get(dist)
    ]
    if not moved:
        return ""

    recorded_on = _read_baseline().get("recorded", "an unrecorded date")
    lines = [
        "--- version witness ---",
        f"Dependency versions moved since this suite was last green ({recorded_on}).",
        "If the failure above is a difference in extracted output, suspect these first:",
    ]
    for dist, was, now in moved:
        lines.append(f"  {dist}: last green {was or '(absent)'} -> now {now or '(absent)'}")
    lines.append(
        "These are not pinned on purpose (newest release = best extraction). "
        "After accepting the new output, re-record with: "
        "python -m tests.version_witness --record"
    )
    return "\n".join(lines)


def record() -> Path:
    """Write the current versions to the baseline as the new last-green mark."""
    payload = {
        "comment": (
            "Versions this suite last passed green with. A record, not a pin: "
            "see version_witness.py. Re-record with "
            "`python -m tests.version_witness --record` after accepting an upgrade."
        ),
        "recorded": date.today().isoformat(),
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "versions": current_versions(),
    }
    BASELINE_PATH.write_text(
        json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )
    return BASELINE_PATH


class VersionWitnessTestCase(unittest.TestCase):
    """A TestCase whose failures name any dependency version that moved.

    Subclass it instead of `unittest.TestCase` for tests whose assertions
    depend on what an extraction library actually produced.
    """

    def _formatMessage(self, msg: Optional[str], standardMsg: str) -> str:
        formatted = super()._formatMessage(msg, standardMsg)
        note = drift_note()
        return f"{formatted}\n\n{note}" if note else formatted


if __name__ == "__main__":
    if "--record" in sys.argv[1:]:
        path = record()
        print(f"recorded {path}")
        for dist, version in current_versions().items():
            print(f"  {dist}=={version or '(absent)'}")
    else:
        note = drift_note()
        print(note or "no version drift since the last recorded green run")
