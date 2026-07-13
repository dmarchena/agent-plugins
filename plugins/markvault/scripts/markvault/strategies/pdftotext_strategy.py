"""Plain-text extraction strategy: pdftotext (Poppler), with tesseract OCR
as a recourse/fallback when pdftotext yields insufficient text.

Ported from the `ia/` project's `extraccion.py` pattern described in
plugins/markvault/PDF_EXTRACCION_Y_ANONIMIZACION.md section 2.2: try
pdftotext first (fast, exact for embedded text); if the result is shorter
than `min_chars`, treat the PDF as image-only and fall back to
pdftoppm + tesseract.

External binaries (pdftotext, pdftoppm, tesseract) are located via PATH
with `shutil.which` -- cross-platform, no hardcoded install paths (e.g.
no assumption of Homebrew's /opt/homebrew/bin as in the ia/ original).
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .base import ExtractionError, ExtractionStrategy, PathLike, is_pdf

#: Below this many characters, pdftotext's output is treated as "no
#: embedded text" and OCR is attempted instead (mirrors ia/extraccion.py).
MIN_CHARS = 20

#: Default OCR render resolution and tesseract page-segmentation mode,
#: matching the ia/ project's ocr_pdf() defaults.
DEFAULT_DPI = 300
DEFAULT_PSM = 6
DEFAULT_LANG = "spa"


class PdftotextStrategy(ExtractionStrategy):
    """pdftotext as the primary path, tesseract OCR as recourse."""

    name = "pdftotext"

    def __init__(
        self,
        dpi: int = DEFAULT_DPI,
        psm: int = DEFAULT_PSM,
        lang: str = DEFAULT_LANG,
        min_chars: int = MIN_CHARS,
    ) -> None:
        self.dpi = dpi
        self.psm = psm
        self.lang = lang
        self.min_chars = min_chars

    def supports(self, path: PathLike) -> bool:
        return is_pdf(path)

    def extract(self, path: PathLike) -> str:
        pdf_path = Path(path)
        if not pdf_path.is_file():
            raise ExtractionError(f"{self.name}: could not read the PDF at {pdf_path}")

        text = self._pdftotext(pdf_path)
        if len(text.strip()) >= self.min_chars:
            return text
        return self._ocr(pdf_path)

    def _pdftotext(self, pdf_path: Path) -> str:
        binary = shutil.which("pdftotext")
        if binary is None:
            raise ExtractionError(f"{self.name}: pdftotext binary not found on PATH")

        try:
            result = subprocess.run(
                [binary, "-layout", str(pdf_path), "-"],
                capture_output=True,
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.decode("utf-8", errors="replace") if exc.stderr else ""
            raise ExtractionError(f"{self.name}: pdftotext failed: {stderr}") from exc

        return result.stdout.decode("utf-8", errors="replace")

    def _ocr(self, pdf_path: Path) -> str:
        pdftoppm = shutil.which("pdftoppm")
        tesseract = shutil.which("tesseract")
        if pdftoppm is None or tesseract is None:
            missing = [
                binary_name
                for binary_name, binary_path in (
                    ("pdftoppm", pdftoppm),
                    ("tesseract", tesseract),
                )
                if binary_path is None
            ]
            raise ExtractionError(
                f"{self.name}: OCR fallback requires {', '.join(missing)} on PATH"
            )

        with tempfile.TemporaryDirectory(prefix="markvault_ocr_") as tmp:
            tmp_path = Path(tmp)
            prefix = tmp_path / "page"
            try:
                subprocess.run(
                    [pdftoppm, "-r", str(self.dpi), "-png", str(pdf_path), str(prefix)],
                    capture_output=True,
                    check=True,
                )
            except subprocess.CalledProcessError as exc:
                stderr = (
                    exc.stderr.decode("utf-8", errors="replace") if exc.stderr else ""
                )
                raise ExtractionError(
                    f"{self.name}: pdftoppm failed: {stderr}"
                ) from exc

            pages = sorted(tmp_path.glob("page-*.png"))
            if not pages:
                raise ExtractionError(f"{self.name}: OCR produced no page images")

            chunks = []
            for page in pages:
                try:
                    result = subprocess.run(
                        [
                            tesseract,
                            str(page),
                            "stdout",
                            "--psm",
                            str(self.psm),
                            "-l",
                            self.lang,
                        ],
                        capture_output=True,
                        check=True,
                    )
                except subprocess.CalledProcessError as exc:
                    stderr = (
                        exc.stderr.decode("utf-8", errors="replace")
                        if exc.stderr
                        else ""
                    )
                    raise ExtractionError(
                        f"{self.name}: tesseract failed: {stderr}"
                    ) from exc
                chunks.append(result.stdout.decode("utf-8", errors="replace"))

        return "\n".join(chunks)
