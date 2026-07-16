"""Minimal PDF fixture builder for markvault strategy tests.

Hand-writes valid, uncompressed single-page PDFs using raw PDF object
syntax, deliberately without a PDF-writing library: PyMuPDF is the engine
behind the `pymupdf4llm` strategy, so building fixtures with it would test
that engine against its own output. Raw bytes keep the fixtures neutral.
`pdftotext` can extract the embedded text from them directly.

Run as a script to (re)generate the benchmark corpus:

    python -m tests.pdf_fixtures --write-corpus
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

_CATALOG = b"<< /Type /Catalog /Pages 2 0 R >>"
_PAGES = b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
_HELVETICA = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
_HELVETICA_BOLD = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"


def _assemble_pdf(objects: Iterable[bytes], stream: bytes) -> bytes:
    """Wrap page `objects` plus a content `stream` into a valid PDF.

    The stream is appended as the last object, so a caller's `/Contents N 0 R`
    must point one past its own object list. Shared by every builder below:
    only the objects and the content stream differ, the xref bookkeeping is
    identical.
    """
    objects = list(objects)
    objects.append(
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n"
        + stream
        + b"\nendstream"
    )

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode()
        out += obj
        out += b"\nendobj\n"

    xref_offset = len(out)
    count = len(objects) + 1
    out += f"xref\n0 {count}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += b"trailer\n"
    out += f"<< /Size {count} /Root 1 0 R >>\n".encode()
    out += b"startxref\n"
    out += f"{xref_offset}\n".encode()
    out += b"%%EOF"
    return bytes(out)


def make_minimal_pdf(text: str) -> bytes:
    """Return the bytes of a minimal one-page PDF containing `text`."""
    objects = [
        _CATALOG,
        _PAGES,
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >>"
        b" /MediaBox [0 0 612 792] /Contents 5 0 R >>",
        _HELVETICA,
    ]
    stream = f"BT /F1 24 Tf 72 700 Td ({text}) Tj ET".encode("latin-1")
    return _assemble_pdf(objects, stream)


def write_minimal_pdf(path: Path, text: str) -> Path:
    """Write a minimal PDF containing `text` to `path` and return it."""
    path.write_bytes(make_minimal_pdf(text))
    return path


def make_blank_pdf() -> bytes:
    """Return the bytes of a minimal one-page PDF with NO text content.

    Simulates a scanned/image-only PDF for fallback-chain tests: the page
    has a valid structure (so `_looks_like_pdf`/pdftoppm accept it) but an
    empty content stream, so a text-extraction strategy (pymupdf4llm,
    pdftotext) genuinely extracts ~0 characters from it, the same
    observable signal a real scanned page without embedded text would
    produce.
    """
    objects = [
        _CATALOG,
        _PAGES,
        b"<< /Type /Page /Parent 2 0 R /Resources << >>"
        b" /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    ]
    return _assemble_pdf(objects, b"")


def write_blank_pdf(path: Path) -> Path:
    """Write a blank (no embedded text) PDF to `path` and return it."""
    path.write_bytes(make_blank_pdf())
    return path


def make_typographic_headings_pdf() -> bytes:
    """Return a PDF whose headings are typographic, not literal Markdown.

    Two bold headings (24pt, 18pt) over 10pt body text, with no `#` anywhere
    in the content stream. This is what separates the strategies: inferring
    a heading here requires reading the font size, which only `pymupdf4llm`
    does -- `markitdown` and `pdftotext` return the same words as flat text.

    The pre-existing `electronic.pdf` fixture cannot show that difference,
    because its text contains literal Markdown syntax that every strategy
    reproduces by simply extracting characters.
    """
    objects = [
        _CATALOG,
        _PAGES,
        b"<< /Type /Page /Parent 2 0 R"
        b" /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >>"
        b" /MediaBox [0 0 612 792] /Contents 6 0 R >>",
        _HELVETICA,
        _HELVETICA_BOLD,
    ]
    runs: Sequence[Tuple[str, int, int, str]] = (
        ("F2", 24, 700, "Informe Anual"),
        ("F1", 10, 670, "Este es el cuerpo del documento en tamano normal."),
        ("F2", 18, 640, "Segunda Seccion"),
        ("F1", 10, 610, "Mas cuerpo de texto normal bajo la segunda seccion."),
    )
    parts: List[str] = [
        f"BT /{font} {size} Tf 72 {y} Td ({text}) Tj ET"
        for font, size, y, text in runs
    ]
    return _assemble_pdf(objects, "\n".join(parts).encode("latin-1"))


def write_typographic_headings_pdf(path: Path) -> Path:
    """Write the typographic-headings PDF to `path` and return it."""
    path.write_bytes(make_typographic_headings_pdf())
    return path


def make_ruled_table_pdf() -> bytes:
    """Return a PDF with a real ruled table: drawn grid plus cell text.

    The grid is stroked lines, not characters, so reconstructing a Markdown
    table from it requires detecting the rules rather than just reading text
    (`pdftotext` yields space-aligned columns). Complements the headings
    fixture: together they let the benchmark's structure columns tell the
    strategies apart on the two axes where they actually differ.

    The surrounding body paragraphs are not decoration. Without them the
    page is a grid with a handful of short cells, and `pymupdf4llm`'s layout
    detector reads that as an image, routes the page to OCR and returns
    nothing -- making the fixture measure a false-positive heuristic rather
    than table reconstruction. With ordinary text density around it, the
    page is treated as the text page it is.
    """
    objects = [
        _CATALOG,
        _PAGES,
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >>"
        b" /MediaBox [0 0 612 792] /Contents 5 0 R >>",
        _HELVETICA,
    ]
    cols = (72, 200, 330, 460)
    rows = (700, 670, 640, 610)
    data: Sequence[Sequence[str]] = (
        ("Producto", "Unidades", "Importe"),
        ("Tornillos", "1200", "340.50"),
        ("Tuercas", "980", "127.75"),
    )
    body_before = (
        "El siguiente cuadro resume las unidades vendidas y el importe",
        "facturado por cada producto durante el ejercicio en curso.",
    )
    body_after = (
        "Los importes se expresan en euros e incluyen los impuestos",
        "aplicables en el momento de la facturacion de cada pedido.",
    )

    parts: List[str] = []
    for i, line in enumerate(body_before):
        parts.append(f"BT /F1 10 Tf 72 {750 - i * 14} Td ({line}) Tj ET")
    for i, line in enumerate(body_after):
        parts.append(f"BT /F1 10 Tf 72 {580 - i * 14} Td ({line}) Tj ET")
    for x in cols:
        parts.append(f"{x} {rows[0]} m {x} {rows[-1]} l S")
    for y in rows:
        parts.append(f"{cols[0]} {y} m {cols[-1]} {y} l S")
    for r, row in enumerate(data):
        for c, cell in enumerate(row):
            parts.append(f"BT /F1 10 Tf {cols[c] + 6} {rows[r] - 20} Td ({cell}) Tj ET")

    return _assemble_pdf(objects, "\n".join(parts).encode("latin-1"))


def write_ruled_table_pdf(path: Path) -> Path:
    """Write the ruled-table PDF to `path` and return it."""
    path.write_bytes(make_ruled_table_pdf())
    return path


#: The structure-discriminating corpus fixtures, as (filename, builder).
#: Deliberately excludes the pre-existing `electronic.pdf` and `scanned.pdf`:
#: they are committed binaries whose exact bytes back a golden file, and
#: `electronic.pdf` is not reproducible from any builder here (it carries
#: bullets, numbered items and a pipe table this module never wrote).
#: Regenerating them from a guess would silently invalidate their goldens.
CORPUS_BUILDERS = (
    ("typographic.pdf", make_typographic_headings_pdf),
    ("ruled_table.pdf", make_ruled_table_pdf),
)


def write_corpus(corpus_dir: Path) -> List[Path]:
    """(Re)generate the fixtures in `CORPUS_BUILDERS` into `corpus_dir`.

    Only those: the older corpus PDFs are left untouched (see the note on
    `CORPUS_BUILDERS`).
    """
    corpus_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name, builder in CORPUS_BUILDERS:
        path = corpus_dir / name
        path.write_bytes(builder())
        written.append(path)
    return written


if __name__ == "__main__":
    if "--write-corpus" in sys.argv[1:]:
        target = Path(__file__).resolve().parent / "fixtures" / "benchmark_corpus"
        for written_path in write_corpus(target):
            print(f"wrote {written_path}")
    else:
        print(__doc__)
