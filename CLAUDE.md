# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ce que c'est

Extension Chrome **Manifest V3**, sans build, sans dépendance, sans tests. Nom public : « 2xShift Goto secret wp-admin ». Sur un site WordPress où l'on n'est pas connecté, un **double appui sur Shift (< 275 ms)** redirige vers l'URL de connexion cachée du site (préfixe global, ou exception par domaine), avec `?redirect_to=` vers la page d'origine.

## Dépôt git

- Remote `origin` : https://github.com/reuhno/2xshift-goto-secret-wp-admin.
- Une branche `feature/<slug>` par lot, fusionnée en avance rapide (fast-forward) dans `main`.
- `git push` réservé au propriétaire (Renaud) : un agent ne pousse pas de lui-même.

## Développement

- Chargée dans Chrome **directement depuis ce dossier** (« Charger l'extension non empaquetée », profil Default). Après toute modification : `chrome://extensions` → bouton ↻ de l'extension. Une page ouverte doit être rechargée pour recevoir le nouveau `content.js`.
- Journaux : sous l'option **Debug** de la page de réglages (case à cocher, `chrome.storage.sync.debug`). Rien ne s'écrit dans la console tant qu'elle n'est pas cochée. Le `console.log` de `content.js` est dans la console de la page ; celui de `background.js` dans « Inspecter les vues : service worker » sur `chrome://extensions`.
- Incrémenter `"version"` dans `manifest.json` à chaque modification livrée (SemVer, actuellement 1.1.0).
- Les libellés visibles passent par `_locales/{en,fr}/messages.json` (`__MSG_x__` dans le manifeste, `chrome.i18n.getMessage` dans `options.js`). Toute nouvelle chaîne s'ajoute **dans les deux langues**.

## Architecture : détection paresseuse, un seul aller-retour de messages

1. **`content.js`** (toutes les URLs) — au chargement, ne fait **rien** d'autre qu'attacher l'écouteur `keydown` (gardes : `event.repeat`, champs de saisie / contentEditable). Aucune lecture du DOM avant un double Shift. Au double Shift (< 275 ms) : mémo de page `pageKind` (null → évalué une fois par sélecteurs d'attributs uniquement — `link`/`script` pointant vers `/wp-content/`, `/wp-includes/`, `link[rel="https://api.w.org/"]`, `link[href*="/wp-json/"]`, meta `generator` — aucun `innerHTML`), puis mémorisé (`'wp'` ou `'other'`). Si `'wp'` et que l'utilisateur n'est **pas visiblement connecté** (`#wpadminbar` absent et pas de classe `logged-in` sur `<body>`), envoie `checkCookiesAndRedirect` au service worker. Ne répond plus à aucune requête du service worker : celui-ci fait confiance au résultat envoyé.
2. **`background.js`** (service worker) — reçoit `checkCookiesAndRedirect`, lit `chrome.storage.sync` (`adminUrl`, `exceptions`, `debug` — un seul read), regarde les cookies `wordpress_logged_in*` (permission `cookies`), puis `redirectToAdmin()` remplace le **pathname** de l'URL courante par le chemin d'admin. Si `adminUrl` est vide, ouvre la page d'options à la place.
3. **`options.html` / `options.js`** — formulaire qui écrit `adminUrl` (chaîne, ex. `/wp-admin/`), `exceptions` (tableau `{ url, adminUrl }`) et `debug` (booléen) dans `chrome.storage.sync`. Une exception matche par `url.includes(exception.url)` (sous-chaîne, pas de normalisation).

Cookies `wordpress_logged_in*` conservés délibérément (décision du propriétaire) : en édition de texte on appuie souvent deux fois sur Shift par inadvertance, et sans cette vérification la redirection serait insupportable.

Pièges connus :
- `chrome.runtime.onInstalled` se déclenche à l'installation **mais aussi** à chaque mise à jour de Chrome et à chaque rechargement d'une extension non empaquetée : la page d'options ne doit s'ouvrir que sur `details.reason === "install"` (corrigé en 1.0.2, ne pas retirer le garde).
- Le stockage est `chrome.storage.sync` : un profil sans synchro, ou un changement de profil, vide `adminUrl` et fait réapparaître la page d'options à la première visite d'un site WordPress.
- `content.js` et `background.js` ont chacun leur propre assistant `log()` local (pas de fichier partagé) ; celui de `content.js` lit `debug` au premier double Shift seulement, celui de `background.js` le lit au même appel `chrome.storage.sync.get` que `adminUrl`.
