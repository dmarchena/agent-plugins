#!/usr/bin/env bash
# Valida el marketplace y todos sus plugins. Es la validación única que corre
# tanto en local como en CI. Dos comprobaciones:
#   1) `claude plugin validate --strict` del marketplace (desciende a cada plugin):
#      falla ante campos ausentes (version, description, author) o manifiestos rotos.
#   2) Formato semver X.Y.Z de la `version` de cada plugin.json: `--strict` avisa si
#      falta pero NO valida el formato, así que lo comprobamos aquí explícitamente.
# Requisitos: `claude` CLI y `jq` en el PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

echo "▶ Validando marketplace (claude plugin validate --strict)…"
claude plugin validate "$ROOT" --strict || fail=1

for pj in "$ROOT"/plugins/*/.claude-plugin/plugin.json; do
  [ -e "$pj" ] || continue
  name="$(basename "$(dirname "$(dirname "$pj")")")"
  ver="$(jq -r '.version // empty' "$pj")"
  if [[ ! "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "✘ plugin '$name': version '$ver' no cumple semver X.Y.Z" >&2
    fail=1
  else
    echo "✔ plugin '$name': version $ver"
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "✘ Validación fallida" >&2
  exit 1
fi
echo "✔ Todo válido"
