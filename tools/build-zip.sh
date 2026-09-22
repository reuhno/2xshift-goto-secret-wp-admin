#!/usr/bin/env bash
# Fabrique les archives à envoyer sur le Chrome Web Store et sur AMO (Firefox).
# N'embarque QUE les fichiers d'exécution de l'extension : ni .git, ni .claude,
# ni CLAUDE.md, ni tools/, ni .gitignore.
#
# Sorties :
#   - dist/2xshift-<version>.zip          : archive Chrome, depuis les fichiers
#     du dépôt tels quels (manifest.json = manifeste pur Chrome).
#   - dist/firefox/                       : mêmes fichiers, manifest.json fusionné
#     avec tools/manifest-firefox.json (surcharges Firefox : background.scripts,
#     browser_specific_settings). Fusion peu profonde : chaque clé de premier
#     niveau des surcharges remplace celle du manifeste Chrome (donc
#     "background" est remplacé en entier, sans service_worker). Dossier vidé
#     puis reconstruit à chaque exécution.
#   - dist/2xshift-<version>-firefox.zip  : zip de dist/firefox/ (fabriqué depuis
#     l'intérieur du dossier, pour que manifest.json soit à la racine de l'archive).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
out="dist/2xshift-${version}.zip"
firefox_dir="dist/firefox"
firefox_out="dist/2xshift-${version}-firefox.zip"

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

# --- Archive Chrome (inchangée) --------------------------------------------

mkdir -p dist
rm -f "$out"
zip -q -r -X "$out" "${files[@]}" -x '*.DS_Store'

# --- Dossier + archive Firefox ----------------------------------------------

rm -rf "$firefox_dir"
mkdir -p "$firefox_dir"

for f in "${files[@]}"; do
	cp -R "$f" "$firefox_dir/"
done
find "$firefox_dir" -name '.DS_Store' -delete

python3 - <<'PY'
import json

with open("manifest.json", encoding="utf-8") as f:
	chrome_manifest = json.load(f)

with open("tools/manifest-firefox.json", encoding="utf-8") as f:
	overrides = json.load(f)

merged = dict(chrome_manifest)
merged.update(overrides)

with open("dist/firefox/manifest.json", "w", encoding="utf-8") as f:
	json.dump(merged, f, indent=2, ensure_ascii=False)
	f.write("\n")
PY

python3 -m json.tool "$firefox_dir/manifest.json" >/dev/null
for js in background.js content.js options.js popup.js onboarding.js; do node --check "$firefox_dir/$js"; done

# Contrôles de cohérence du manifeste Firefox généré.
python3 - <<'PY'
import json
import sys

with open("manifest.json", encoding="utf-8") as f:
	chrome_manifest = json.load(f)

with open("dist/firefox/manifest.json", encoding="utf-8") as f:
	firefox_manifest = json.load(f)

errors = []

if firefox_manifest.get("version") != chrome_manifest.get("version"):
	errors.append(
		"version différente : chrome=%r firefox=%r"
		% (chrome_manifest.get("version"), firefox_manifest.get("version"))
	)

background = firefox_manifest.get("background", {})
if "service_worker" in background:
	errors.append("manifest.json Firefox contient encore background.service_worker")

extra_keys = set(firefox_manifest) - set(chrome_manifest) - {"browser_specific_settings"}
if extra_keys:
	errors.append("clé(s) inattendue(s) dans le manifeste Firefox : %s" % ", ".join(sorted(extra_keys)))

if errors:
	for e in errors:
		print("Erreur : " + e, file=sys.stderr)
	sys.exit(1)
PY

rm -f "$firefox_out"
(cd "$firefox_dir" && zip -q -r -X "../../$firefox_out" . -x '*.DS_Store')

echo "Archive Chrome  : $out"
unzip -l "$out" | tail -1
echo "Archive Firefox : $firefox_out"
unzip -l "$firefox_out" | tail -1
