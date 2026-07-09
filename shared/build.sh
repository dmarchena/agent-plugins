#!/usr/bin/env bash
# Vendoring build: copies each shared script into every plugin that declares
# it as a dependency, so each plugin ships a self-contained, byte-identical
# copy without a runtime cross-plugin import.
#
# Declaration format: shared/manifest.json maps each plugin name to the list
# of shared scripts it consumes, e.g.:
#
#   { "claude-token-debug": ["token-cost.mjs"] }
#
# (Not declared as a field inside plugin.json: `claude plugin validate
# --strict` rejects unknown top-level fields there, so the manifest lives
# under shared/ instead.)
#
# Each entry is a filename that must exist directly under shared/ (this
# directory). For every plugin/script pair this build copies
# shared/<script> -> plugins/<plugin>/scripts/<script>, overwriting the
# destination. The destination file is therefore GENERATED — do not hand-edit
# it; edit shared/<script> and re-run this build instead.
#
# Usage: shared/build.sh [ROOT_DIR]
#   ROOT_DIR defaults to the repo root (parent of this script's directory).
#   An explicit ROOT_DIR is mainly for tests, to point at an isolated
#   fixture tree instead of the real repo.
#
# Exit codes: 0 on success. Non-zero if any plugin declares a shared script
# that doesn't exist under shared/ (message names both the missing
# shared/<script> path and the declaring plugin) or on missing dependencies.
#
# Requires: jq, cp, mkdir. No network access.
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "✘ shared/build.sh requires 'jq' on PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SHARED_DIR="$ROOT/shared"
MANIFEST="$SHARED_DIR/manifest.json"
fail=0

if [ ! -f "$MANIFEST" ]; then
  echo "✔ vendoring build complete (no shared/manifest.json, nothing to vendor)"
  exit 0
fi

for plugin_name in $(jq -r 'keys[]' "$MANIFEST"); do
  plugin_dir="$ROOT/plugins/$plugin_name"

  while IFS= read -r script; do
    [ -n "$script" ] || continue
    src="$SHARED_DIR/$script"
    if [ ! -f "$src" ]; then
      echo "✘ plugin '$plugin_name' declares shared script '$script' but 'shared/$script' does not exist (expected at $src)" >&2
      fail=1
      continue
    fi
    dest_dir="$plugin_dir/scripts"
    mkdir -p "$dest_dir"
    cp "$src" "$dest_dir/$script"
    echo "✔ vendored $script -> plugins/$plugin_name/scripts/$script"
  done < <(jq -r --arg p "$plugin_name" '.[$p][]? // empty' "$MANIFEST")
done

if [ "$fail" -ne 0 ]; then
  echo "✘ vendoring build failed" >&2
  exit 1
fi
echo "✔ vendoring build complete"
