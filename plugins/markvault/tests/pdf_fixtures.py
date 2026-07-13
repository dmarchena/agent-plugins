"""Minimal PDF fixture builder for markvault strategy tests.

No PDF-writing library is available offline in this environment (no
reportlab/fpdf, no network to install one), so this hand-writes a valid,
uncompressed single-page PDF with one text run using raw PDF object
syntax. `pdftotext` can extract the embedded text from it directly.
"""
from __future__ import annotations

from pathlib import Path


def make_minimal_pdf(text: str) -> bytes:
    """Return the bytes of a minimal one-page PDF containing `text`."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >>"
        b" /MediaBox [0 0 612 792] /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    stream = f"BT /F1 24 Tf 72 700 Td ({text}) Tj ET".encode("latin-1")
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
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /Resources << >>"
        b" /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    ]
    stream = b""
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


def write_blank_pdf(path: Path) -> Path:
    """Write a blank (no embedded text) PDF to `path` and return it."""
    path.write_bytes(make_blank_pdf())
    return path
