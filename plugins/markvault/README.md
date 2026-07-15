# markvault

Deterministic, offline, ~0-token PDF-to-Markdown extraction for the
`agent-plugins` marketplace. A local CLI picks an extraction strategy,
writes a `.md` next to the PDF (or wherever you point it), and reports only
the path and statistics — the PDF's text never passes through the agent's
context unless you explicitly ask to read it.

## Install

### 1. Install the plugin

```
claude plugin marketplace add dmarchena/agent-plugins
claude plugin install markvault@agent-plugins
```

Then restart your session (or `/reload-plugins`).

### 2. Install `uv` (required)

markvault's Python extraction strategies are provisioned on demand by
[`uv`](https://docs.astral.sh/uv/), which must be on your `PATH`:

```
brew install uv
```

or, without Homebrew:

```
curl -LsSf https://astral.sh/uv/install.sh | sh
```

That is the whole setup. You do **not** create a virtualenv and you do
**not** `pip install` anything: each invocation runs through `uv run
--with <the package that strategy needs>`, which provisions it into a
cached ephemeral environment and downloads a suitable Python if you lack
one. The first run of a given strategy pays a one-off download; later ones
reuse uv's cache and need no network at all.

Both packages are provisioned together because both are links in the
default `auto` chain, so a single cached environment serves every
invocation.

Deliberately, nothing is installed into your system Python — on macOS that
Python is managed by Apple and marked externally-managed, so writing to it
is both awkward and unwise.

### 3. Optional: the `pdftotext` strategy

Only needed if you want the `pdftotext` strategy or the OCR recourse that
handles scanned PDFs. These are binaries, not Python packages, so uv does
not provide them:

```
brew install poppler tesseract
```

Without them, `pdftotext` reports itself unavailable and `auto` falls back
to the remaining strategies.

## Verify the install

```
command -v uv                                    # must print a path
claude plugin list                               # markvault should appear
```

Then extract one of the bundled fixtures — if this prints a `path=… chars=…
strategy=…` line, everything works:

```
/extract <path-to-any>.pdf --strategy pymupdf4llm
```

## Usage

| Entry point | What it does |
|-------------|--------------|
| `extract-pdf` skill | Triggers on natural requests ("extract this PDF to markdown"). Defaults to `auto`. |
| `/extract <pdf> --strategy <name> [--out <path>]` | Explicit extraction; `--strategy` is required, no `auto` mode. |
| `/benchmark [--corpus-dir <dir>] [--format table\|json]` | Runs every strategy over the bundled corpus and reports time/determinism/structure/golden-diff per row. |

### Strategies

| Strategy | Needs | Good for |
|----------|-------|----------|
| `pymupdf4llm` | uv (auto-provisioned) | Structured Markdown: headings, tables, layout. The default first choice. |
| `pdftotext` | `poppler` binary | Fast, plain, dependable text. The fallback. |
| `markitdown` | uv (auto-provisioned) | Second opinion via a different engine (pdfminer.six). Rescues PDFs PyMuPDF chokes on, keeping Markdown structure. |
| `auto` | — | Tries each of the above best-to-worst until one yields usable text: `pymupdf4llm` → `markitdown` → `pdftotext` → OCR. Right default for "just extract it". |

## Development

Run the test suite with its dependencies declared explicitly:

```
cd plugins/markvault
PYTHONPATH="scripts:tests" uv run \
  --with pymupdf4llm --with 'markitdown[pdf]' --with pyyaml \
  --python 3.13 python -m unittest discover -s tests
```

`pyyaml` is a test-only dependency (`test_skill_file.py` parses the skill's
frontmatter). Pass it explicitly even though `pymupdf4llm` happens to pull
it in transitively — that coincidence is not a contract.

The suite passes both with those extraction backends and without them: the
tests assert the benchmark's *reporting* contract against whatever is
actually installed, so dropping the `--with` flags turns real extraction
rows into honest skips rather than failures.

### Dependency versions are not pinned

Invocations resolve the newest release on purpose, so extraction improves
for free. The trade-off is that an upgrade can change a strategy's Markdown
and fail the goldens with no local change to blame. `tests/version_witness.py`
makes that diagnosable: it records the versions of the last green run in
`tests/versions_baseline.json` and names any that moved in the failure
message. After reviewing an upgrade and accepting its output:

```
python -m tests.version_witness --record
```

It is a record, not a pin — nothing there constrains what uv installs.

## Layout

- `skills/extract-pdf/SKILL.md` — the skill's prompt and its consent gate.
- `commands/extract.md`, `commands/benchmark.md` — explicit slash commands.
- `scripts/markvault/` — the CLI: strategies, registry, network barrier.
- `tests/` — unit + E2E tests and the benchmark corpus/goldens.
- `libs.md` — survey of local PDF→Markdown tooling behind the strategy choices.
- `CHANGELOG.md` — version history.

## Privacy

Extraction is fully local. `scripts/markvault/red_guard.py` enforces an
anti-network-leak barrier around the strategies, and the skill reports only
metadata by default: the `.md` content is read back into context only if you
explicitly ask for it.
