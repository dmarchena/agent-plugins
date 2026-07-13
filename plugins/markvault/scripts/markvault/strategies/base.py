"""Format-agnostic extraction strategy interface.

Every concrete strategy receives an input path (never assumed to be a
PDF specifically) and returns extracted text/Markdown. `supports(path)`
declares which formats/paths the strategy accepts, so a registry can
route by capability in addition to explicit name lookup.

v1 note: every concrete strategy in this package declares PDF-only
support via the shared `is_pdf()` helper below. This is a deliberate seam
(a real capability check tied to the registry), not real multi-format
detection -- see plugins/markvault/PDF_EXTRACCION_Y_ANONIMIZACION.md and
docs/specs/markvault/spec.md (R1) for why the contract stays
format-agnostic ahead of any non-PDF strategy actually being added.
"""
from __future__ import annotations

import abc
from pathlib import Path
from typing import Union

PathLike = Union[str, Path]


class ExtractionError(RuntimeError):
    """Raised when a strategy fails to read or extract text from its input."""


class ExtractionStrategy(abc.ABC):
    """Common contract every extraction strategy must implement."""

    #: Unique, stable name used for registry lookup (e.g. "pymupdf4llm").
    name: str

    @abc.abstractmethod
    def supports(self, path: PathLike) -> bool:
        """Return True if this strategy declares support for `path`."""
        raise NotImplementedError

    @abc.abstractmethod
    def extract(self, path: PathLike) -> str:
        """Extract text/Markdown from `path`.

        Raises:
            ExtractionError: if the input cannot be read or extracted.
        """
        raise NotImplementedError


def is_pdf(path: PathLike) -> bool:
    """Shared v1 capability check: PDF-only, by file extension.

    All three v1 strategies are PDF-only (see module docstring); this
    helper centralizes that check so a future non-PDF strategy does not
    need to duplicate it.
    """
    return Path(path).suffix.lower() == ".pdf"
