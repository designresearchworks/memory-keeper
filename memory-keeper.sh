#!/usr/bin/env bash
set -euo pipefail

NODE_MAJOR="${NODE_MAJOR:-20}"

log() {
  printf '%s\n' "$1"
}

if command -v node >/dev/null 2>&1; then
  log "Node is already installed: $(node --version)"
else
  if command -v brew >/dev/null 2>&1; then
    log "Installing Node.js with Homebrew..."
    brew install node
  else
    VERSION="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o "\"version\":\"v${NODE_MAJOR}\\.[^\"]*\"" | head -n 1 | cut -d '\"' -f 4)"
    if [[ -z "${VERSION}" ]]; then
      log "Could not determine the latest Node.js ${NODE_MAJOR}.x release."
      exit 1
    fi

    PKG_URL="https://nodejs.org/dist/${VERSION}/node-${VERSION}.pkg"
    PKG_PATH="/tmp/node-${VERSION}.pkg"

    log "Downloading Node.js ${VERSION}..."
    curl -fsSL "${PKG_URL}" -o "${PKG_PATH}"

    log "Installing Node.js ${VERSION}..."
    log "macOS may prompt for your password."
    sudo installer -pkg "${PKG_PATH}" -target /
  fi
fi

log ""
log "Installed Node.js: $(node --version)"
log "Node.js is ready."
log "Starting Memory Keeper..."
node scripts/run-memory-keeper.mjs
