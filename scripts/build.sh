#!/usr/bin/env bash
# Deploy / CI build: install Python deps, then sync i18n locales from en.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pip install -r requirements.txt

should_skip_translate() {
  [[ "${SKIP_I18N_TRANSLATE:-}" == "1" ]] || [[ "${TRANSLATE_I18N:-}" == "0" ]]
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi

  # Render's Python runtime has no Node; bootstrap a portable binary for the translate step.
  local ver="${NODE_VERSION:-20.18.1}"
  local os arch platform
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "Cannot bootstrap Node on unsupported arch: $arch" >&2
      exit 1
      ;;
  esac
  case "$os" in
    linux) platform="linux-${arch}" ;;
    darwin) platform="darwin-${arch}" ;;
    *)
      echo "Cannot bootstrap Node on unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  local dir="$ROOT/.node"
  if [[ ! -x "$dir/bin/node" ]]; then
    echo "Bootstrapping Node ${ver} (${platform}) for i18n translate..."
    mkdir -p "$dir"
    curl -fsSL "https://nodejs.org/dist/v${ver}/node-v${ver}-${platform}.tar.gz" \
      | tar -xz -C "$dir" --strip-components=1
  fi
  export PATH="$dir/bin:$PATH"
}

if should_skip_translate; then
  echo "Skipping i18n translate (SKIP_I18N_TRANSLATE=1 or TRANSLATE_I18N=0)."
  exit 0
fi

ensure_node
echo "Running i18n translate (node $(node -v))..."
node scripts/translate/index.js
