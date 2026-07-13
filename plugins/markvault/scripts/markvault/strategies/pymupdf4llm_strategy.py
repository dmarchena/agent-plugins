"""Structured Markdown extraction strategy backed by pymupdf4llm (PyMuPDF).

Pure local, no network: pymupdf4llm renders text/structure straight from
the PDF's own object model using traditional extraction algorithms (no
heavy ML models). See plugins/markvault/PDF_EXTRACCION_Y_ANONIMIZACION.md
section 2.2 and libs.md section 4.
"""
from __future__ import annotations

from pathlib import Path

from .base import ExtractionError, ExtractionStrategy, PathLike, is_pdf


class Pymupdf4llmStrategy(ExtractionStrategy):
    """Extracts structured Markdown (headings/tables where detectable)."""

    name = "pymupdf4llm"

    def supports(self, path: PathLike) -> bool:
        return is_pdf(path)

    def extract(self, path: PathLike) -> str:
        try:
            import pymupdf4llm
        except ImportError as exc:
            raise ExtractionError(
                f"{self.name}: pymupdf4llm is not installed"
            ) from exc

        pdf_path = Path(path)
        if not pdf_path.is_file():
            raise ExtractionError(f"{self.name}: could not read the PDF at {pdf_path}")

        try:
            return pymupdf4llm.to_markdown(str(pdf_path))
        except Exception as exc:  # noqa: BLE001 - normalize any backend failure
            raise ExtractionError(f"{self.name}: extraction failed: {exc}") from exc
