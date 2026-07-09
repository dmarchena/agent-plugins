#!/usr/bin/env bash
# Drift check: verifies every plugin's vendored copy of a shared script
# (plugins/<plugin>/scripts/<script>) is still byte-identical to its
# canonical original (shared/<script>). Drift means someone hand-edited the
# generated copy instead of editing shared/<script> and re-running
# shared/build.sh.
#
# Uses the same declaration convention as shared/build.sh: a plugin opts a
# script in via a top-level `sharedScripts` array in its
# `.claude-plugin/plugin.json`, e.g. `"sharedScripts": ["token-cost.mjs"]`.
#
# Usage: scripts/drift-check.sh [ROOT_DIR]
#   ROOT_DIR defaults to the repo root (parent of this script's directory).
#   An explicit ROOT_DIR is mainly for tests, to point at an isolated
#   fixture tree instead of the real repo.
#
# Exit codes: 0 if every declared vendored copy matches its shared/ original.
# Non-zero if any vendored copy differs from (or is missing relative to) its
# shared/ original; the message names the specific stale vendored path and
# instructs re-running shared/build.sh.
#
# Requires: jq, cmp. No network access.
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "✘ scripts/drift-check.sh requires 'jq' on PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SHARED_DIR="$ROOT/shared"
fail=0

for pj in "$ROOT"/plugins/*/.claude-plugin/plugin.json; do
  [ -e "$pj" ] || continue
  plugin_dir="$(dirname "$(dirname "$pj")")"
  plugin_name="$(basename "$plugin_dir")"

  while IFS= read -r script; do
    [ -n "$script" ] || continue
    src="$SHARED_DIR/$script"
    dest="$plugin_dir/scripts/$script"

    if [ ! -f "$dest" ]; then
      echo "✘ plugin '$plugin_name': vendored copy '$dest' is missing; re-run shared/build.sh" >&2
      fail=1
      continue
    fi
    if [ ! -f "$src" ]; then
      # Not this script's job to validate declarations (shared/build.sh
      # already does); skip so we don't double-report a missing source.
      continue
    fi

    if ! cmp -s "$src" "$dest"; then
      echo "✘ drift detected: '$dest' no coincide con '$src' — alguien editó la copia vendorizada a mano. Re-ejecuta shared/build.sh." >&2
      fail=1
    fi
  done < <(jq -r '.sharedScripts[]? // empty' "$pj")
done

if [ "$fail" -ne 0 ]; then
  echo "✘ drift check failed" >&2
  exit 1
fi
echo "✔ sin drift: todas las copias vendorizadas coinciden con shared/"
