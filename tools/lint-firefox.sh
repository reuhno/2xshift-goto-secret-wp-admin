#!/usr/bin/env bash
# Vérifie que le zip fabriqué pour le Chrome Web Store passe aussi le lint
# Firefox (web-ext). Fabrique le zip via build-zip.sh, le décompresse dans un
# dossier temporaire, lance `web-ext lint` dessus et affiche le résultat.
set -euo pipefail

cd "$(dirname "$0")/.."

./tools/build-zip.sh

version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
zip_path="dist/2xshift-${version}.zip"

workdir=$(mktemp -d "${TMPDIR:-/tmp}/2xshift-lint-firefox.XXXXXX")
trap 'rm -rf "$workdir"' EXIT

echo "Décompression de ${zip_path} dans ${workdir}"
unzip -q -o "$zip_path" -d "$workdir"

echo "Lint web-ext sur ${workdir}"
npx -y web-ext@latest lint --source-dir "$workdir" --warnings-as-errors=false
