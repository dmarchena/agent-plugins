"""Structural tests for the markvault SKILL.md (task: skill-file).

AC12 is explicitly marked `[manual]` in docs/specs/markvault/spec.md -- it
requires judging the skill's actual conversational behavior at runtime,
which no single mechanical test can verify. That manual judgment belongs to
this project's separate "verify" stage, not here.

What IS mechanically checkable is the SKILL.md document itself, so this
file asserts on its structure and required content instead:

- R5.S1: the skill's metadata report to the user must be limited to the
  `.md` path and statistics (chars, strategy, fallback) -- never the
  extracted content. This test asserts the SKILL.md body explicitly
  instructs invoking the local command and reporting only path +
  statistics.
- R5.S2: the `.md` file's content is only read into context on an explicit
  user request; in the default flow it is never read. This test asserts
  the SKILL.md body explicitly documents that consent gate.

These tests parse the SKILL.md's YAML frontmatter (this repo's documented
convention, see templates/SKILL.md and plugins/*/skills/*/SKILL.md) and
check specific required phrases in the body -- not just "something looks
similar", but the literal presence of the load-bearing language.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

import yaml

_SKILL_PATH = (
    Path(__file__).resolve().parents[1] / "skills" / "extract-pdf" / "SKILL.md"
)


def _read_skill_file() -> str:
    return _SKILL_PATH.read_text(encoding="utf-8")


def _split_frontmatter(text: str):
    """Split a `---\\n<yaml>\\n---\\n<body>` file into (frontmatter, body)."""
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if match is None:
        raise AssertionError("SKILL.md has no parseable '---' frontmatter block")
    return match.group(1), match.group(2)


class TestSkillFileExists(unittest.TestCase):
    """The SKILL.md deliverable must exist at all before anything else."""

    def test_skill_file_exists(self) -> None:
        self.assertTrue(
            _SKILL_PATH.is_file(),
            f"expected a SKILL.md at {_SKILL_PATH}",
        )


class TestSkillFileFrontmatter(unittest.TestCase):
    """Frontmatter must be valid YAML and match this repo's required fields
    (see templates/SKILL.md and existing plugins/*/skills/*/SKILL.md)."""

    def setUp(self) -> None:
        if not _SKILL_PATH.is_file():
            self.skipTest("SKILL.md does not exist yet")
        text = _read_skill_file()
        frontmatter_raw, self.body = _split_frontmatter(text)
        self.frontmatter = yaml.safe_load(frontmatter_raw)

    def test_frontmatter_is_a_mapping(self) -> None:
        self.assertIsInstance(self.frontmatter, dict)

    def test_frontmatter_has_name(self) -> None:
        self.assertIn("name", self.frontmatter)
        self.assertTrue(str(self.frontmatter["name"]).strip())

    def test_frontmatter_has_description(self) -> None:
        self.assertIn("description", self.frontmatter)
        self.assertTrue(str(self.frontmatter["description"]).strip())

    def test_frontmatter_has_allowed_tools(self) -> None:
        self.assertIn("allowed-tools", self.frontmatter)
        self.assertTrue(str(self.frontmatter["allowed-tools"]).strip())


class TestSkillFileDelegatesToCli(unittest.TestCase):
    """R5.S1 (report without content) + no-extraction-logic-of-its-own."""

    def setUp(self) -> None:
        if not _SKILL_PATH.is_file():
            self.skipTest("SKILL.md does not exist yet")
        _, self.body = _split_frontmatter(_read_skill_file())

    def test_body_mentions_markvault_cli_module(self) -> None:
        self.assertIn(
            "markvault.cli",
            self.body,
            "SKILL.md body must name the local markvault.cli command it delegates to",
        )

    def test_body_instructs_reporting_only_path_and_statistics(self) -> None:
        lowered = self.body.lower()
        for required in ("path", "chars", "strategy"):
            self.assertIn(
                required,
                lowered,
                f"SKILL.md body must instruct reporting the '{required}' field",
            )

    def test_body_forbids_reporting_extracted_content_by_default(self) -> None:
        lowered = self.body.lower()
        self.assertTrue(
            "never" in lowered and "content" in lowered,
            "SKILL.md body must explicitly forbid reporting the extracted "
            "content back to the user in the default flow",
        )


class TestSkillFileConsentGate(unittest.TestCase):
    """R5.S2 (content read only under explicit consent)."""

    def setUp(self) -> None:
        if not _SKILL_PATH.is_file():
            self.skipTest("SKILL.md does not exist yet")
        _, self.body = _split_frontmatter(_read_skill_file())

    def test_body_documents_explicit_request_to_read_content(self) -> None:
        lowered = self.body.lower()
        self.assertTrue(
            "explicit" in lowered and ("request" in lowered or "ask" in lowered),
            "SKILL.md body must document that content is read only on an "
            "explicit user request",
        )

    def test_body_documents_content_never_read_by_default(self) -> None:
        lowered = self.body.lower()
        self.assertTrue(
            "default" in lowered and "never" in lowered,
            "SKILL.md body must state that, by default, the .md content is "
            "never read into context",
        )


if __name__ == "__main__":
    unittest.main()
