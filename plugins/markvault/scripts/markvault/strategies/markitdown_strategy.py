"""markitdown extraction strategy -- BASE PDF PATH ONLY.

Uses markitdown's default PDF converter (pdfminer.six + pdfplumber, no
network). markitdown's optional LLM-Vision OCR plugin and its Azure
Document Intelligence path are intentionally never installed or invoked
here: both require network/API access and would violate this project's
zero-network guardrail (see libs.md section 5 and
PDF_EXTRACCION_Y_ANONIMIZACION.md section 3). Concretely, this means:
`MarkItDown` is constructed with `enable_plugins=False` and no
`llm_client`/`docintel_endpoint` is ever passed to it or to `.convert()`.
"""
from __future__ import annotations

from pathlib import Path

from .base import ExtractionError, ExtractionStrategy, PathLike, is_pdf


class MarkitdownStrategy(ExtractionStrategy):
    """Delegates to markitdown's local pdfminer.six/pdfplumber PDF converter."""

    name = "markitdown"

    def supports(self, path: PathLike) -> bool:
        return is_pdf(path)

    def extract(self, path: PathLike) -> str:
        try:
            from markitdown import MarkItDown
        except ImportError as exc:
            raise ExtractionError(f"{self.name}: markitdown is not installed") from exc

        pdf_path = Path(path)
        if not pdf_path.is_file():
            raise ExtractionError(f"{self.name}: could not read the PDF at {pdf_path}")

        # enable_plugins=False, and no llm_client / docintel_endpoint passed
        # anywhere below: that is what keeps this strategy on the
        # 100%-local pdfminer.six/pdfplumber path instead of markitdown's
        # network-calling OCR extras.
        converter = MarkItDown(enable_plugins=False)
        try:
            result = converter.convert(str(pdf_path))
        except Exception as exc:  # noqa: BLE001 - normalize any backend failure
            raise ExtractionError(f"{self.name}: extraction failed: {exc}") from exc

        return result.text_content
