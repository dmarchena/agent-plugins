"""CLI entry point for markvault's PDF-to-Markdown extraction command.

Wraps the strategy registry (see `registry.py`) behind a small command-line
interface: given a PDF path and an explicit `--strategy` name, extract text
and write it to a `.md` file (next to the input by default, or at
`--out`). Reports the character count and the strategy used on stderr in a
pinned, greppable `key=value` format so a driving skill can read metadata
without ever loading the extracted content into its own context (see R5 in
docs/specs/markvault/spec.md).

`main()` activates the anti-network-leak barrier (`red_guard.activate()`)
before importing any extractor-related module, so no strategy or its
backend library can ever attempt an outbound connection.

`--strategy` defaults to (and can be explicitly passed as) `"auto"`: the R3
fallback chain tries the structured strategy (pymupdf4llm) first and, if it
fails or produces text below a minimum length threshold, falls back to
pdftotext -- whose own internal OCR recourse (see
`strategies/pdftotext_strategy.py`) is the deepest link in the chain.
`markitdown` is never part of this chain; it stays an explicit-selection-only
strategy (unaffected by any of the auto logic below).

Usage:
    python3 -m markvault.cli document.pdf
    python3 -m markvault.cli document.pdf --strategy pymupdf4llm
    python3 -m markvault.cli document.pdf --strategy pdftotext --out /tmp/out.md
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from . import red_guard

#: Registered name of the strategy that requests fallback-chain selection
#: instead of an explicit, single named strategy.
AUTO_STRATEGY_NAME = "auto"

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
        default=AUTO_STRATEGY_NAME,
        help=(
            "Registered extraction strategy name (e.g. pymupdf4llm, "
            "pdftotext, markitdown), or 'auto' (the default) to run the R3 "
            "fallback chain: structured -> pdftotext -> pdftotext's own "
            "internal OCR recourse."
        ),
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output .md path. Defaults to the input PDF's path with a .md suffix.",
    )
    return parser


def _run_auto_chain(pdf_path: Path, registry: "StrategyRegistry") -> Tuple[str, str, bool]:
    """Run the R3 automatic fallback chain: structured -> pdftotext -> OCR.

    Tries the structured strategy (pymupdf4llm) first. If it raises
    `ExtractionError`, or its output is shorter than the shared minimum
    threshold (`pdftotext_strategy.MIN_CHARS`, ~20 chars per the spec's
    Assumptions section), falls back to `pdftotext`.

    `PdftotextStrategy.extract()` already folds its own internal OCR
    recourse into one call (see strategies/pdftotext_strategy.py), which
    would report as plain `strategy=pdftotext` even when OCR is what
    actually produced the text. To report the deepest link genuinely used,
    per R3.S2's `strategy=ocr` stderr contract, this replicates the same
    threshold check the strategy makes internally, via its own helpers,
    instead of duplicating its subprocess logic here.

    `markitdown` is deliberately never part of this chain (R3).

    Returns:
        (text, effective_strategy_name, fallback_occurred) -- fallback_occurred
        is False only when the structured strategy succeeds outright.

    Raises:
        ExtractionError: if every link in the chain is exhausted without
            producing usable text (mirrors the single-strategy failure
            contract, so callers can handle it identically).
    """
    from .strategies.base import ExtractionError
    from .strategies.pdftotext_strategy import MIN_CHARS as AUTO_MIN_CHARS

    structured = registry.get("pymupdf4llm")
    try:
        text = structured.extract(pdf_path)
        if len(text.strip()) >= AUTO_MIN_CHARS:
            return text, structured.name, False
    except ExtractionError:
        pass

    plain_strategy = registry.get("pdftotext")
    # Private helpers, deliberately reused rather than duplicated (see
    # docstring above) -- strategies/pdftotext_strategy.py is not modified.
    plain_text = plain_strategy._pdftotext(pdf_path)  # type: ignore[attr-defined]
    if len(plain_text.strip()) >= plain_strategy.min_chars:
        return plain_text, "pdftotext", True

    ocr_text = plain_strategy._ocr(pdf_path)  # type: ignore[attr-defined]
    return ocr_text, "ocr", True


def main(argv: Optional[List[str]] = None) -> int:
    """Run the extraction CLI; returns the process exit code (0 = success)."""
    # Activate the anti-network-leak barrier before importing anything that
    # could open a connection (extraction strategies and their backend
    # libraries) -- see docs/specs/markvault/spec.md R4.
    red_guard.activate()

    from .registry import UnknownStrategyError, default_registry
    from .strategies.base import ExtractionError

    parser = build_parser()
    args = parser.parse_args(argv)

    pdf_path = Path(args.pdf)
    out_path = Path(args.out) if args.out is not None else pdf_path.with_suffix(".md")

    registry = default_registry()
    is_auto = args.strategy == AUTO_STRATEGY_NAME

    strategy = None
    if not is_auto:
        try:
            strategy = registry.get(args.strategy)
        except UnknownStrategyError as exc:
            print(str(exc), file=sys.stderr)
            return 1

    if not pdf_path.is_file() or not _looks_like_pdf(pdf_path):
        print(UNREADABLE_PDF_MESSAGE.format(path=pdf_path), file=sys.stderr)
        return 1

    fallback_occurred = False
    try:
        if is_auto:
            text, strategy_name, fallback_occurred = _run_auto_chain(pdf_path, registry)
        else:
            text = strategy.extract(pdf_path)
            strategy_name = strategy.name
    except ExtractionError:
        # Normalize any backend failure (corrupt-but-magic-valid PDF,
        # missing extraction binary, chain fully exhausted, etc.) to the
        # same pinned message -- never forward the backend's own error
        # text, which could echo fragments of the input.
        print(UNREADABLE_PDF_MESSAGE.format(path=pdf_path), file=sys.stderr)
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")

    # The fallback=yes/no field is only meaningful (and only reported) in
    # auto mode -- explicit named-strategy invocations keep the exact
    # pre-existing stderr format, unaffected by any of the fallback logic
    # above (per this task's constraints).
    fallback_field = (
        f" fallback={'yes' if fallback_occurred else 'no'}" if is_auto else ""
    )
    print(
        f"path={out_path} chars={len(text)} strategy={strategy_name}{fallback_field}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
