# Spec: token-cost CLI for claude-token-debug

## Purpose

`claude-token-debug` today ships its cost analysis as a prose procedure: every
investigation forces the operator to hand-write a bespoke transcript parser and
load that logic into the (expensive) orchestrator context. This ships that
analysis as a runnable, model-aware CLI plus an importable function, so "where
did a session's tokens go" is a one-liner whose parser never enters the
orchestrator context, and whose structured result is consumable by other
tooling (e.g. sdd-kit's proposed `spec-forensics`). It targets developers of
this plugin repo debugging their own Claude Code token spend. Closes #16.

Change type: feat

## Scope

**In scope:**
- A `token-cost` CLI that reports, for one Claude Code session, a per-subagent
  and orchestrator cost breakdown, including `cache_read`, cost-weighted by each
  assistant message's own `message.model`, with a grand total and an
  orchestrator-vs-subagent percentage split.
- Zero model hardcoding: price tier derived from `message.model`; subagent
  labels/types read from `agent-<id>.meta.json`.
- Machine-readable output via `--json`; a human-readable table by default.
- An importable function returning the same structured result the CLI prints
  with `--json` (CLI is a thin wrapper over it).
- Optional `--boundary <substr>` to slice orchestrator turns pre/post the first
  matching flat-session line.
- Target selection: default to newest session of newest-active project under
  `~/.claude/projects`; overridable by an explicit project/session and an
  explicit projects root.
- An inline, editable `PRICE` table (public list USD/Mtok; directional).
- Rewriting the skill's subagent-cost technique to invoke the CLI.
- Automated tests driving the CLI over a fixture transcript tree.

**Out of scope (non-goals):**
- The SDD-specific task↔transcript join and per-task deviation — belongs to
  sdd-kit `spec-forensics`, which will *consume* this CLI.
- Billing-exact pricing — list prices are directional; the editable table is
  the whole mechanism.
- Packaging the "inspect a built-in agent's binary prompt/tools" technique as a
  CLI — it stays as prose in the skill.

## Functional Requirements

### R1 — Per-session cost breakdown and orchestrator/subagent split

Depende de: R2

The system SHALL, given one session, sum each assistant message's `input`,
`output`, `cache_read` and `cache_creation` token usage and, costing every
message by its own model's tier, report each subagent (by its label) and the
orchestrator separately, plus a grand total and an orchestrator-vs-subagent
cost percentage split.

#### R1.S1 — Session with a subagent
- GIVEN a session whose flat `.jsonl` has orchestrator assistant messages and a
  `subagents/agent-<id>.jsonl` with a matching `agent-<id>.meta.json`
- WHEN the CLI runs against that session
- THEN the output contains one line per subagent (showing its meta
  `description` label and per-subagent token total), an orchestrator total line,
  and a grand-total line stating both `orchestrator N%` and `subagents M%` where
  the two percentages sum to 100
- AND `cache_read` tokens are included in every total (not omitted)

#### R1.S2 — Session with no subagents
- GIVEN a session whose flat `.jsonl` exists but which has no `subagents/`
  directory
- WHEN the CLI runs against that session
- THEN it prints the orchestrator total and a grand total with `subagents 0%`,
  and exits 0 without error and without borrowing another session's numbers

### R2 — Model auto-detection with graceful unknown tiers

Depende de: —

The system SHALL derive each message's price tier from its own `message.model`
string (opus/sonnet/haiku), with no hardcoded per-session model, and MUST NOT
silently drop tokens whose model maps to no known tier.

#### R2.S1 — Mixed-model session is weighted per message
- GIVEN a session containing assistant messages tagged with different models
  (e.g. one `claude-sonnet-5`, one `claude-haiku-4-5-...`)
- WHEN the CLI runs against that session
- THEN each message's cost is computed at its own model's tier (so the reported
  cost equals the sum of each message priced by its own tier), and the reported
  model list includes every distinct model string seen

#### R2.S2 — Unknown model tier
- GIVEN a session with an assistant message whose `message.model` matches no
  known tier
- WHEN the CLI runs against that session
- THEN that message's tokens are still counted in the token totals and its model
  string still appears in the model list, while contributing 0 to the cost — it
  is neither dropped from token counts nor guessed into a tier

### R3 — Output modes and importable function

Depende de: R1

The system SHALL print a human-readable breakdown by default, emit a structured
JSON document with `--json`, and expose an importable function that returns that
same structure without printing.

#### R3.S1 — JSON output
- GIVEN any resolvable session
- WHEN the CLI runs with `--json`
- THEN stdout is a single valid JSON document with top-level keys `session`,
  `subs`, `orchestrator`, `subTotal` and `orchAll`

#### R3.S2 — Importable function
- GIVEN the module is imported by another Node program with an explicit target
- WHEN its exported analysis function is called
- THEN it returns an object with the same shape as the `--json` document and
  writes nothing to stdout

### R4 — Target resolution and boundary slicing

Depende de: R1

The system SHALL resolve a default target (newest session of the newest-active
project under `~/.claude/projects`), accept an explicit project, session, and
projects-root override, and optionally split the orchestrator's own turns at a
`--boundary` substring.

#### R4.S1 — Boundary found
- GIVEN a session whose flat `.jsonl` has a line containing the substring passed
  as `--boundary`
- WHEN the CLI runs with that `--boundary`
- THEN the orchestrator section reports a pre-boundary and a post-boundary
  subtotal, and the orchestrator grand total equals pre + post

#### R4.S2 — Boundary absent
- GIVEN a `--boundary` substring that appears in no flat-session line
- WHEN the CLI runs with that `--boundary`
- THEN it reports a single unsplit orchestrator total (split flag false) and
  exits 0 without error

### R5 — Skill wired to the CLI

Depende de: R1, R3

The system SHALL rewrite the skill's subagent-cost technique to invoke the
shipped CLI instead of describing a hand-written parser, while keeping the
built-in-agent binary-inspection technique as prose.

#### R5.S1 — Skill invokes the CLI, keeps technique 2
- GIVEN the updated `token-cost-debug` SKILL.md
- WHEN its text is read
- THEN the subagent-cost technique invokes the CLI via
  `${CLAUDE_PLUGIN_ROOT}/scripts/token-cost.mjs`, and the binary-inspection
  technique (`strings`/`dd` offset reading) is still present as prose

### R-E2E — One-command session cost breakdown

Depende de: R1, R2, R3, R4

The system SHALL turn a recorded session transcript tree into a complete,
model-weighted cost breakdown from a single command invocation.

#### R-E2E.S1 — Full breakdown from a fixture tree
- GIVEN a fixture projects tree with one project, one flat session `.jsonl`
  (mixed models) and one labeled subagent transcript
- WHEN the CLI runs once against that tree with `--json`
- THEN it emits a valid JSON breakdown whose subagent entry carries the meta
  label, whose totals include `cache_read`, whose per-message cost is
  model-weighted, and whose `orchAll`/`subTotal` costs yield the reported
  percentage split

## Technical Requirements

- **Stack / framework:** Node.js ESM, standard library only (`node:fs`,
  `node:path`, `node:os`) — no npm dependencies, no network. Shebang
  `#!/usr/bin/env node`. Script at `plugins/claude-token-debug/scripts/token-cost.mjs`.
- **Integraciones:** Reads Claude Code transcript files under
  `~/.claude/projects/**` (flat `<session>.jsonl`, `<session>/subagents/agent-*.jsonl`,
  `agent-*.meta.json`). No external services. Consumed downstream by sdd-kit
  `spec-forensics` via the importable function.
- **Rendimiento:** N/A (single-session, local file read).
- **Seguridad / privacidad:** Read-only over local transcripts; no writes, no
  network egress.
- **Datos / almacenamiento:** No persistence. Prices live in an inline, editable
  `PRICE` constant (USD per 1M tokens; list prices, directional).
- **Restricciones adicionales:** Tests are Node ESM stdlib-only with a fixture
  transcript tree, mirroring the sdd-kit `test/*.test.mjs` + `fixtures/` pattern;
  runnable without touching the real `~/.claude/projects`.

## Acceptance Criteria

- [ ] AC1 → R1.S1 [auto] — fixture session with one labeled subagent: output has a subagent line (meta label + total), an orchestrator line, and a grand total whose `orchestrator N%` + `subagents M%` = 100; `cache_read` is included in totals.
- [ ] AC2 → R1.S2 [auto] — fixture session with no `subagents/`: prints orchestrator + grand total with `subagents 0%`, exit code 0, no other session's numbers appear.
- [ ] AC3 → R2.S1 [auto] — mixed-model fixture: total cost equals the sum of each message priced at its own tier, and the model list contains every distinct model string.
- [ ] AC4 → R2.S2 [auto] — fixture with an unknown-tier model: its tokens appear in token totals and its model string in the model list, but it adds 0 to cost.
- [ ] AC5 → R3.S1 [auto] — running with `--json` yields a single parseable JSON document with keys `session`, `subs`, `orchestrator`, `subTotal`, `orchAll`.
- [ ] AC6 → R3.S2 [auto] — importing the module and calling its analysis function on an explicit fixture target returns an object matching the `--json` shape and prints nothing.
- [ ] AC7 → R4.S1 [auto] — with `--boundary <substr>` matching a flat line, orchestrator output shows pre- and post-boundary subtotals whose costs sum to the orchestrator total.
- [ ] AC8 → R4.S2 [auto] — with a `--boundary` matching no line, output is a single unsplit orchestrator total (split false), exit code 0.
- [ ] AC9 → R5.S1 [auto] — SKILL.md contains the `${CLAUDE_PLUGIN_ROOT}/scripts/token-cost.mjs` invocation for the subagent-cost technique and still contains the binary-inspection (`strings`/`dd`) prose.
- [ ] AC-E2E → R-E2E.S1 [auto] — one `--json` run over the fixture tree emits a breakdown with a meta-labeled subagent entry, `cache_read`-inclusive totals, model-weighted per-message cost, and a consistent orchestrator/subagent percentage split.

## Assumptions & Open Questions

- The `analyze()` function accepts an explicit target (projects root / project /
  session) so tests and downstream tooling can run it against an arbitrary
  transcript tree without depending on `~/.claude/projects`. Default resolution
  (newest session of newest project) applies only when no explicit target is
  given.
- The exported function's name is left to the plan/implementation; the spec only
  fixes its return shape (the `--json` structure) and that it prints nothing.
- Plugin version bump (semver) is handled by the exec/verify stages per repo
  convention; not pinned here.
