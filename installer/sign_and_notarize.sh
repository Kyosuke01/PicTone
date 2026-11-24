#!/usr/bin/env bash
# Signe, notarise et agrafe PicTone.app, puis produit le .dmg signé et notarisé.
# Usage : installer/sign_and_notarize.sh <version> <chemin_du_.app> <sortie.dmg>
#
# Variables d'environnement requises :
#   MACOS_SIGN_IDENTITY   nom du certificat « Developer ID Application: … (TEAMID) »
#   APPLE_API_KEY_PATH    chemin du fichier AuthKey_XXXX.p8
#   APPLE_API_KEY_ID      identifiant de la clé API (Key ID)
#   APPLE_API_ISSUER_ID   Issuer ID de l'équipe App Store Connect
set -euo pipefail

VERSION="$1"
APP="$2"
DMG="$3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTITLEMENTS="$ROOT/installer/entitlements.plist"

: "${MACOS_SIGN_IDENTITY:?MACOS_SIGN_IDENTITY manquant}"
: "${APPLE_API_KEY_PATH:?APPLE_API_KEY_PATH manquant}"
: "${APPLE_API_KEY_ID:?APPLE_API_KEY_ID manquant}"
: "${APPLE_API_ISSUER_ID:?APPLE_API_ISSUER_ID manquant}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

sign() {
    codesign --force --timestamp --options runtime \
        --entitlements "$ENTITLEMENTS" --sign "$MACOS_SIGN_IDENTITY" "$1"
}

# Soumet un fichier à Apple et exige le statut « Accepted ».
notarize() {
    local file="$1" json="$WORK/notary.json" id
    xcrun notarytool submit "$file" \
        --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID" \
        --wait --output-format json > "$json"
    id="$(plutil -extract id raw -o - "$json" 2>/dev/null || true)"
    if [ "$(plutil -extract status raw -o - "$json" 2>/dev/null || true)" != "Accepted" ]; then
        echo "::error::Notarisation refusée pour $file"
        [ -n "$id" ] && xcrun notarytool log "$id" \
            --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER_ID"
        exit 1
    fi
    echo "Notarisation acceptée : $file"
}

# 1. Signature de l'intérieur vers l'extérieur : binaires Mach-O, puis frameworks, puis l'app.
while IFS= read -r -d '' f; do
    if file -b "$f" | grep -q 'Mach-O'; then
        sign "$f"
    fi
done < <(find "$APP" -type f -print0)

while IFS= read -r -d '' bundle; do
    sign "$bundle"
done < <(find "$APP/Contents" -depth -name '*.framework' -print0)

sign "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

# 2. Notarisation de l'app (zip), puis agrafage du ticket dans l'app.
ditto -c -k --keepParent "$APP" "$WORK/PicTone-notarize.zip"
notarize "$WORK/PicTone-notarize.zip"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"

# 3. DMG contenant l'app agrafée, signé puis notarisé à son tour.
"$ROOT/installer/make_dmg.sh" "$VERSION" "$APP" "$DMG"
codesign --force --timestamp --sign "$MACOS_SIGN_IDENTITY" "$DMG"
notarize "$DMG"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"

# 4. Vérification finale côté Gatekeeper.
spctl -a -vv -t open --context context:primary-signature "$DMG"
echo "DMG signé et notarisé : $DMG"
