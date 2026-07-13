"""Strategy registry: resolve extraction strategies by name or by file
capability, and report which strategy effectively produced a result.

Pattern: Strategy + Registry (no DDD layering) -- see the markvault spec's
"Extensibility architecture" note (docs/specs/markvault/spec.md).
"""
from __future__ import annotations

from typing import Dict, List

from .strategies.base import ExtractionStrategy, PathLike
from .strategies.markitdown_strategy import MarkitdownStrategy
from .strategies.pdftotext_strategy import PdftotextStrategy
from .strategies.pymupdf4llm_strategy import Pymupdf4llmStrategy


class UnknownStrategyError(LookupError):
    """Raised by `get()`/`extract()` for a strategy name that isn't registered.

    The message pins the exact stderr contract from the markvault spec's
    AC2 / R1.S2: it names the requested (unknown) strategy and lists the
    valid, registered strategy names.
    """

    def __init__(self, requested: str, valid_names: List[str]) -> None:
        self.requested = requested
        self.valid_names = valid_names
        message = (
            f"unknown strategy: {requested} "
            f"(valid strategies: {', '.join(valid_names)})"
        )
        super().__init__(message)


class ExtractionResult:
    """Extracted text plus the name of the strategy that produced it."""

    def __init__(self, text: str, strategy_name: str) -> None:
        self.text = text
        self.strategy_name = strategy_name


class StrategyRegistry:
    """Resolves extraction strategies by name and by capability."""

    def __init__(self) -> None:
        self._strategies: Dict[str, ExtractionStrategy] = {}

    def register(self, strategy: ExtractionStrategy) -> None:
        """Register (or replace) a strategy under its own `.name`."""
        self._strategies[strategy.name] = strategy

    def names(self) -> List[str]:
        """Return the registered strategy names, sorted for stable output."""
        return sorted(self._strategies)

    def get(self, name: str) -> ExtractionStrategy:
        """Resolve a strategy by its registered name.

        Raises:
            UnknownStrategyError: if `name` isn't registered; the message
                names the requested strategy and lists the valid ones.
        """
        try:
            return self._strategies[name]
        except KeyError:
            raise UnknownStrategyError(name, self.names()) from None

    def capable_for(self, path: PathLike) -> List[ExtractionStrategy]:
        """Return every registered strategy whose `supports(path)` is True."""
        return [s for s in self._strategies.values() if s.supports(path)]

    def extract(self, name: str, path: PathLike) -> ExtractionResult:
        """Resolve `name`, run it on `path`, and report the strategy used.

        Raises:
            UnknownStrategyError: if `name` isn't registered.
        """
        strategy = self.get(name)
        text = strategy.extract(path)
        return ExtractionResult(text=text, strategy_name=strategy.name)


def default_registry() -> StrategyRegistry:
    """Build a registry with all v1 strategies registered.

    `markitdown` is registered like any other strategy (explicit-selection
    only); it is deliberately NOT wired into any default "auto" fallback
    chain here -- that chain (R3) is a separate sibling task built on top
    of this registry.
    """
    registry = StrategyRegistry()
    registry.register(Pymupdf4llmStrategy())
    registry.register(PdftotextStrategy())
    registry.register(MarkitdownStrategy())
    return registry
