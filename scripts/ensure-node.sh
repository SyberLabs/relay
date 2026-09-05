#!/usr/bin/env bash
# Fail if Node 24+ is not first on PATH. Prints install guidance; no secrets.
set -euo pipefail

required_major=24

print_guidance() {
  cat <<'EOF'

Relay needs Node >= 24 on PATH (see package.json engines and .nvmrc).
Put that Node first on PATH, then use pnpm. Do not hardcode /absolute/path/to/node.

  nvm:  nvm install && nvm use
  fnm:  fnm install && fnm use
  mise: mise use node@24
  asdf: asdf install nodejs 24 && asdf set nodejs 24

Then: pnpm install --frozen-lockfile && pnpm dev
EOF
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node is not on PATH."
  print_guidance
  exit 1
fi

version="$(node -v 2>/dev/null || true)"
major="${version#v}"
major="${major%%.*}"

if ! [[ "${major}" =~ ^[0-9]+$ ]] || ((major < required_major)); then
  echo "Node ${version:-unknown} is on PATH ($(command -v node)). Relay needs Node >= ${required_major}."
  print_guidance
  exit 1
fi

echo "Node ${version} ($(command -v node))"
