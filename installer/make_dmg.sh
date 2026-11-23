#!/usr/bin/env bash
# Crée le .dmg macOS (fenêtre standard : icône de l'app, flèche, lien vers Applications).
# Usage : installer/make_dmg.sh <version> <chemin_du_.app> <sortie.dmg>
# Prérequis : brew install create-dmg
set -euo pipefail

VERSION="$1"
APP="$2"
OUT="$3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

STAGE="$(mktemp -d)"
TMP_BG="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$TMP_BG"' EXIT

cp -R "$APP" "$STAGE/PicTone.app"
# Fond haute résolution (Retina) : une seule image contenant 1x et 2x.
tiffutil -cathidpicheck "$ROOT/installer/dmg_background.png" "$ROOT/installer/dmg_background@2x.png" \
  -out "$TMP_BG/background.tiff"

rm -f "$OUT"
create-dmg \
  --volname "PicTone ${VERSION}" \
  --volicon "$ROOT/pictone.icns" \
  --background "$TMP_BG/background.tiff" \
  --window-pos 200 120 \
  --window-size 660 400 \
  --icon-size 128 \
  --icon "PicTone.app" 180 190 \
  --hide-extension "PicTone.app" \
  --app-drop-link 480 190 \
  --no-internet-enable \
  "$OUT" "$STAGE"
