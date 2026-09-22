#!/usr/bin/env bash
# Fabrique l'archive à envoyer sur le Chrome Web Store.
# N'embarque QUE les fichiers d'exécution de l'extension : ni .git, ni .claude,
# ni CLAUDE.md, ni tools/, ni .gitignore. Sortie : dist/2xshift-<version>.zip
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
out="dist/2xshift-${version}.zip"

# Liste explicite : un fichier oublié ici ne part pas sur le store (volontaire).
files=(
	manifest.json
	background.js
	content.js
	options.html
	options.js
	popup.html
	popup.js
	onboarding.html
	onboarding.js
	ui.css
	icons
	_locales
)

for f in "${files[@]}"; do
	[ -e "$f" ] || { echo "Manquant : $f" >&2; exit 1; }
done

python3 -m json.tool manifest.json >/dev/null
for l in _locales/*/messages.json; do python3 -m json.tool "$l" >/dev/null; done
for js in background.js content.js options.js popup.js onboarding.js; do node --check "$js"; done

mkdir -p dist
rm -f "$out"
zip -q -r -X "$out" "${files[@]}" -x '*.DS_Store'

echo "Archive : $out"
unzip -l "$out" | tail -1
