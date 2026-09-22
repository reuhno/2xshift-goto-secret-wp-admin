#!/usr/bin/env bash
# Vérifie que la variante Firefox passe le lint AMO (web-ext). Fabrique les
# archives via build-zip.sh (qui reconstruit dist/firefox/), puis lance
# `web-ext lint` directement sur dist/firefox/ — plus besoin de décompresser.
set -euo pipefail

cd "$(dirname "$0")/.."

./tools/build-zip.sh

echo "Lint web-ext sur dist/firefox"
npx -y web-ext@latest lint --source-dir dist/firefox --warnings-as-errors=false
