#!/usr/bin/env sh
# Installer for shotport (macOS + Linux).
# Builds the standalone binary from source with Bun.
# Usage:  curl -fsSL https://raw.githubusercontent.com/edihasaj/shotport/main/scripts/install.sh | sh
set -eu

REPO="https://github.com/edihasaj/shotport.git"
PREFIX="${PREFIX:-/usr/local}"
BIN_DIR="$PREFIX/bin"
WORK_DIR="$(mktemp -d)"

say()  { printf "[shotport] %s\n" "$*"; }
die()  { printf "[shotport] ERROR: %s\n" "$*" 1>&2; exit 1; }

cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

UNAME_S="$(uname -s)"
case "$UNAME_S" in
  Darwin|Linux) ;;
  *) die "Unsupported OS: $UNAME_S. macOS + Linux only." ;;
esac

if ! command -v bun >/dev/null 2>&1; then
  die "Bun not found. Install it from https://bun.sh and re-run (curl -fsSL https://bun.sh/install | bash)."
fi

if ! command -v git >/dev/null 2>&1; then
  die "git not found. Install it and retry."
fi

say "Cloning shotport…"
git clone --depth 1 "$REPO" "$WORK_DIR/shotport" >/dev/null 2>&1 || die "git clone failed."

cd "$WORK_DIR/shotport"
say "Installing dependencies…"
bun install >/dev/null 2>&1 || die "bun install failed."

say "Building standalone binary…"
bun run build >/dev/null 2>&1 || die "build failed."

if [ ! -w "$BIN_DIR" ] && [ ! -w "$PREFIX" ]; then
  say "Installing to $BIN_DIR (sudo)…"
  sudo install -d "$BIN_DIR"
  sudo install -m 0755 ./dist/shotport "$BIN_DIR/shotport"
else
  install -d "$BIN_DIR"
  install -m 0755 ./dist/shotport "$BIN_DIR/shotport"
fi

say "Installed: $BIN_DIR/shotport"
say "Try: shotport browser https://example.com --text-only"
