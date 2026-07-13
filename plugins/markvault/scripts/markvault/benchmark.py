"""Benchmark harness for markvault's extraction strategies.

Runs every strategy registered in `registry.default_registry()` against
every PDF in a small corpus (see `plugins/markvault/tests/fixtures/
benchmark_corpus/`) and reports, per (PDF, strategy) row:

- `time_ms`: wall-clock time for that strategy's first `extract()` call
  on that PDF.
- `deterministic`: whether running the same strategy twice on the same
  PDF produces byte-identical output ("yes"/"no"), or "n/a" if the
  strategy could not produce text at all (nothing to compare).
- Structure counts (`headings`, `tables`, `lists`): simple line-based
  heuristics over the extracted text -- NOT real Markdown/DOM parsing.
  A line counts as:
    * heading -- its first non-whitespace character is "#".
    * table row -- it contains at least one "|" character.
    * list item -- it starts with "-", "*", or a decimal-number-dot
      marker ("1.", "12.", ...).
  These are cheap, mechanical proxies good enough to compare strategies
  against each other; they will happily miscount a literal "#"/"|" in
  body text as structure, and won't detect structure a strategy encodes
  some other way. Documented here because it's a deliberate
  simplification, not an oversight.
- `diff_ok`: whether the strategy's output for that PDF matches its
  golden `.md` file (see `plugins/markvault/tests/fixtures/
  benchmark_golden/<pdf-stem>__<strategy>.md`), if one is defined for
  that (pdf, strategy) pair ("yes"/"no"). If no golden is defined for
  the combination, `diff_ok` is "n/a" -- there is nothing to diff
  against, and that is a deliberate choice (not every strategy has a
  golden for every fixture; see the module's own test suite for which
  combinations do).

Design notes:
- No network use anywhere in this module.
- A strategy that raises `ExtractionError` (missing dependency/binary,
  or a genuinely unreadable input) is caught PER ROW and reported with
  `status="error"`; it does not abort the run or affect the process
  exit code. `ExtractionError` is a strategy's own documented "I cannot
  handle this input" signal (see `strategies/base.py`), not a harness
  crash.
- The process only exits non-zero if the harness itself fails to run
  (e.g. the corpus directory doesn't exist) -- never for a content
  mismatch against golden (R6.S2) and never for an ordinary, caught
  `ExtractionError`.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .registry import StrategyRegistry, default_registry
from .strategies.base import ExtractionError

#: Repo-relative default corpus/golden locations. These are test
#: fixtures, not shipped package data: `Path(__file__).parents[2]` is
#: the plugin root (`plugins/markvault`), so this resolves to
#: `plugins/markvault/tests/fixtures/...` regardless of cwd.
_PLUGIN_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CORPUS_DIR = _PLUGIN_ROOT / "tests" / "fixtures" / "benchmark_corpus"
DEFAULT_GOLDEN_DIR = _PLUGIN_ROOT / "tests" / "fixtures" / "benchmark_golden"

#: A list-item line starts with "-", "*", or a decimal-number-dot marker
#: followed by whitespace (e.g. "- item", "* item", "1. item").
_LIST_MARKER_RE = re.compile(r"^\s*(?:[-*]|\d+\.)\s")


@dataclass
class BenchmarkRow:
    """One (PDF, strategy) result row. See module docstring for column
    semantics."""

    pdf: str
    strategy: str
    status: str  # "ok" | "error"
    error: Optional[str]
    time_ms: Optional[float]
    deterministic: str  # "yes" | "no" | "n/a"
    headings: Optional[int]
    tables: Optional[int]
    lists: Optional[int]
    diff_ok: str  # "yes" | "no" | "n/a"

    def as_dict(self) -> Dict[str, object]:
        return asdict(self)


def count_structure(text: str) -> Dict[str, int]:
    """Line-based heading/table/list heuristic counts. See module
    docstring for the exact rule behind each count."""
    headings = tables = lists = 0
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            headings += 1
        if "|" in line:
            tables += 1
        if _LIST_MARKER_RE.match(line):
            lists += 1
    return {"headings": headings, "tables": tables, "lists": lists}


def golden_path_for(golden_dir: Path, pdf_path: Path, strategy_name: str) -> Path:
    """The golden file convention: `<pdf-stem>__<strategy-name>.md`."""
    return golden_dir / f"{pdf_path.stem}__{strategy_name}.md"


def discover_corpus(corpus_dir: Path) -> List[Path]:
    """Every `*.pdf` fixture under `corpus_dir`, sorted for stable output."""
    return sorted(Path(corpus_dir).glob("*.pdf"))


def _run_once(strategy, pdf_path: Path):
    """Run `strategy.extract(pdf_path)` once.

    Returns `(text, error_message)`: exactly one is `None`. A caught
    `ExtractionError` yields `(None, str(exc))`; anything else (a bug
    that is not the strategy's own documented failure mode) is left to
    propagate -- that is the "a strategy literally crashing" case this
    harness does not swallow.
    """
    try:
        return strategy.extract(pdf_path), None
    except ExtractionError as exc:
        return None, str(exc)


def benchmark_one(strategy, pdf_path: Path, golden_dir: Path) -> BenchmarkRow:
    """Run one (pdf, strategy) combination and build its report row."""
    start = time.perf_counter()
    first_text, error = _run_once(strategy, pdf_path)
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    if error is not None:
        return BenchmarkRow(
            pdf=pdf_path.name,
            strategy=strategy.name,
            status="error",
            error=error,
            time_ms=None,
            deterministic="n/a",
            headings=None,
            tables=None,
            lists=None,
            diff_ok="n/a",
        )

    second_text, second_error = _run_once(strategy, pdf_path)
    deterministic = "yes" if second_error is None and first_text == second_text else "no"

    counts = count_structure(first_text)

    golden_file = golden_path_for(golden_dir, pdf_path, strategy.name)
    if golden_file.is_file():
        golden_text = golden_file.read_text(encoding="utf-8")
        diff_ok = "yes" if first_text == golden_text else "no"
    else:
        diff_ok = "n/a"

    return BenchmarkRow(
        pdf=pdf_path.name,
        strategy=strategy.name,
        status="ok",
        error=None,
        time_ms=elapsed_ms,
        deterministic=deterministic,
        headings=counts["headings"],
        tables=counts["tables"],
        lists=counts["lists"],
        diff_ok=diff_ok,
    )


def run_benchmark(
    corpus: List[Path],
    registry: StrategyRegistry,
    golden_dir: Path,
) -> List[BenchmarkRow]:
    """Run every registered strategy over every PDF in `corpus`.

    One row per (pdf, strategy) combination, in corpus order then
    registry-name order (both already stable/sorted by their producers).
    """
    rows: List[BenchmarkRow] = []
    for pdf_path in corpus:
        for strategy_name in registry.names():
            strategy = registry.get(strategy_name)
            rows.append(benchmark_one(strategy, pdf_path, golden_dir))
    return rows


def summarize(rows: List[BenchmarkRow]) -> Dict[str, int]:
    """Aggregate counts used for the trailing summary line (R6.S2:
    `golden_failures` must be reported even though it never affects the
    exit code)."""
    return {
        "rows": len(rows),
        "errors": sum(1 for r in rows if r.status == "error"),
        "golden_failures": sum(1 for r in rows if r.diff_ok == "no"),
    }


_COLUMNS = [
    "pdf",
    "strategy",
    "status",
    "time_ms",
    "deterministic",
    "headings",
    "tables",
    "lists",
    "diff_ok",
    "error",
]


def format_table(rows: List[BenchmarkRow]) -> str:
    """Render rows as a pipe-delimited, mechanical (greppable) table."""

    def fmt(value: object) -> str:
        if value is None:
            return "n/a"
        if isinstance(value, float):
            return f"{value:.3f}"
        return str(value)

    lines = [" | ".join(_COLUMNS)]
    for row in rows:
        data = row.as_dict()
        lines.append(" | ".join(fmt(data[col]) for col in _COLUMNS))
    return "\n".join(lines)


def format_json(rows: List[BenchmarkRow]) -> str:
    """Render rows as a JSON array of objects (one per row)."""
    return json.dumps([row.as_dict() for row in rows], indent=2)


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser for the `markvault` benchmark command."""
    parser = argparse.ArgumentParser(
        prog="markvault-benchmark",
        description=(
            "Run every registered markvault extraction strategy over every "
            "PDF in a corpus and report time/determinism/structure/golden-"
            "diff per (PDF, strategy) row."
        ),
    )
    parser.add_argument(
        "--corpus-dir",
        default=str(DEFAULT_CORPUS_DIR),
        help="Directory of *.pdf fixtures to benchmark (default: bundled test corpus).",
    )
    parser.add_argument(
        "--golden-dir",
        default=str(DEFAULT_GOLDEN_DIR),
        help=(
            "Directory of golden `<pdf-stem>__<strategy>.md` files "
            "(default: bundled goldens)."
        ),
    )
    parser.add_argument(
        "--format",
        choices=("table", "json"),
        default="table",
        help="Output format for the per-row report (default: table).",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    """Run the benchmark CLI; returns the process exit code (0 = success).

    Exit code stays 0 even when rows report `status="error"` or
    `diff_ok="no"` -- see module docstring's "Design notes". Only a
    harness-level setup problem (e.g. a missing corpus directory) returns
    non-zero.
    """
    parser = build_parser()
    args = parser.parse_args(argv)

    corpus_dir = Path(args.corpus_dir)
    golden_dir = Path(args.golden_dir)

    if not corpus_dir.is_dir():
        print(f"corpus directory not found: {corpus_dir}", file=sys.stderr)
        return 1

    corpus = discover_corpus(corpus_dir)
    registry = default_registry()

    rows = run_benchmark(corpus, registry, golden_dir)
    summary = summarize(rows)

    if args.format == "json":
        print(format_json(rows))
    else:
        print(format_table(rows))

    print(
        f"summary: rows={summary['rows']} errors={summary['errors']} "
        f"golden_failures={summary['golden_failures']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
