#!/usr/bin/env bash
# Build the plugin and sync it into the MaPC Wine bottle's Millennium plugins folder.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGINS="$HOME/Library/Application Support/MaPC/Bottles/steam/drive_c/Program Files (x86)/Steam/millennium/plugins"
DEST="$PLUGINS/mapc-compat"

cd "$ROOT"
bun run build

mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'tests' --exclude 'docs' \
  --exclude 'scripts' --exclude 'bun.lock' --exclude '.superpowers' \
  "$ROOT/" "$DEST/"

# Throwaway spike plugin created by this project; the only other folder this script touches.
if [ -d "$PLUGINS/mapc-compat-spike" ]; then
  rm -rf "$PLUGINS/mapc-compat-spike"
fi

echo "Installed to: $DEST"
