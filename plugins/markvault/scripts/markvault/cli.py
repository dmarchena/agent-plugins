"""CLI entry point for markvault's PDF-to-Markdown extraction command.

Wraps the strategy registry (see `registry.py`) behind a small command-line
interface: given a PDF path and an explicit `--strategy` name, extract text
and write it to a `.md` file (next to the input by default, or at
`--out`). Reports the character count and the strategy used on stderr in a
pinned, greppable `key=value` format so a driving skill can read metadata
without ever loading the extracted content into its own context (see R5 in
docs/specs/markvault/spec.md).

Scope note: this module does NOT select a strategy automatically
(`--strategy auto` is a separate sibling task, R3/fallback-chain) and does
NOT activate the anti-network barrier (a separate sibling task,
barrier-privacy-wiring, wires `red_guard.activate()` in front of this
entrypoint) -- both are out of scope here by design.

Usage:
    python3 -m markvault.cli document.pdf --strategy pymupdf4llm
    python3 -m markvault.cli document.pdf --strategy pdftotext --out /tmp/out.md
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from .registry import UnknownStrategyError, default_registry
from .strategies.base import ExtractionError

#: Magic bytes every valid PDF starts with; used for a real structural
#: readability check independent of file extension (R2.S3: "missing,
#: corrupt, or a non-PDF file passed in").
PDF_MAGIC = b"%PDF-"

#: Exact, greppable prefix pinned by R2.S3/AC5 -- must never be followed by
#: any of the input file's own content.
UNREADABLE_PDF_MESSAGE = "could not read the PDF at {path}"


def _looks_like_pdf(path: Path) -> bool:
    """Return True if `path` is a file starting with the PDF magic header.

    A structural check, not just an extension check: it correctly rejects
    a corrupt/non-PDF file that happens to be named `*.pdf`, and a genuine
    PDF is accepted regardless of its extension.
    """
    try:
        with path.open("rb") as fh:
            header = fh.read(len(PDF_MAGIC))
    except OSError:
        return False
    return header == PDF_MAGIC


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser for the `markvault` extraction command."""
    parser = argparse.ArgumentParser(
        prog="markvault",
        description="Extract a PDF's text/Markdown using an explicit strategy.",
    )
    parser.add_argument("pdf", help="Path to the input PDF.")
    parser.add_argument(
        "--strategy",
        required=True,
        help=(
            "Registered extraction strategy name (e.g. pymupdf4llm, "
            "pdftotext, markitdown). 'auto' selection is not implemented here."
        ),
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output .md path. Defaults to the input PDF's path with a .md suffix.",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    """Run the extraction CLI; returns the process exit code (0 = success)."""
    parser = build_parser()
    args = parser.parse_args(argv)

    pdf_path = Path(args.pdf)
    out_path = Path(args.out) if args.out is not None else pdf_path.with_suffix(".md")

    registry = default_registry()

    try:
        strategy = registry.get(args.strategy)
    except UnknownStrategyError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if not pdf_path.is_file() or not _looks_like_pdf(pdf_path):
        print(UNREADABLE_PDF_MESSAGE.format(path=pdf_path), file=sys.stderr)
        return 1

    try:
        text = strategy.extract(pdf_path)
    except ExtractionError:
        # Normalize any backend failure (corrupt-but-magic-valid PDF,
        # missing extraction binary, etc.) to the same pinned message --
        # never forward the backend's own error text, which could echo
        # fragments of the input.
        print(UNREADABLE_PDF_MESSAGE.format(path=pdf_path), file=sys.stderr)
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")

    print(
        f"path={out_path} chars={len(text)} strategy={strategy.name}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
