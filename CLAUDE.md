# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ce que c'est

Extension Chrome **Manifest V3**, sans build, sans dépendance, sans tests, **pas de dépôt git**. Nom public : « 2xShift Goto secret wp-admin ». Sur un site WordPress où l'on n'est pas connecté, un **double appui sur Shift (< 275 ms)** redirige vers l'URL de connexion cachée du site (préfixe global, ou exception par domaine), avec `?redirect_to=` vers la page d'origine.

## Développement

- Chargée dans Chrome **directement depuis ce dossier** (« Charger l'extension non empaquetée », profil Default). Après toute modification : `chrome://extensions` → bouton ↻ de l'extension. Une page ouverte doit être rechargée pour recevoir le nouveau `content.js`.
- Journaux : le `console.log` de `content.js` est dans la console de la page ; celui de `background.js` dans « Inspecter les vues : service worker » sur `chrome://extensions`.
- Incrémenter `"version"` dans `manifest.json` à chaque modification livrée (SemVer, actuellement 1.0.2).
- Les libellés visibles passent par `_locales/{en,fr}/messages.json` (`__MSG_x__` dans le manifeste, `chrome.i18n.getMessage` dans `options.js`). Toute nouvelle chaîne s'ajoute **dans les deux langues**.

## Architecture : trois scripts, un aller-retour de messages

1. **`content.js`** (toutes les URLs) — au chargement, décide s'il écoute le clavier : uniquement si la page **ressemble à WordPress** (signatures `wp-json`, `admin-ajax.php`, `wp-content/plugins`, `wp-includes/js/dist` dans `<head>`/`<script>`/`<style>`, ou meta `generator`) **et** que l'utilisateur **n'est pas connecté** (`#wpadminbar` absent). Sur double Shift, envoie `checkCookiesAndRedirect` au service worker. Répond aussi aux requêtes `checkIfWordPress` / `verifyUserLoggedIn` du service worker.
2. **`background.js`** (service worker) — reçoit `checkCookiesAndRedirect`, **re-vérifie** via le content script que la page est WordPress, lit `chrome.storage.sync` (`adminUrl`, `exceptions`), regarde les cookies `wordpress_logged_in*` (permission `cookies`), puis `redirectToAdmin()` remplace le **pathname** de l'URL courante par le chemin d'admin. Si `adminUrl` est vide, ouvre la page d'options à la place.
3. **`options.html` / `options.js`** — formulaire qui écrit `adminUrl` (chaîne, ex. `/wp-admin/`) et `exceptions` (tableau `{ url, adminUrl }`) dans `chrome.storage.sync`. Une exception matche par `url.includes(exception.url)` (sous-chaîne, pas de normalisation).

Pièges connus :
- `chrome.runtime.onInstalled` se déclenche à l'installation **mais aussi** à chaque mise à jour de Chrome et à chaque rechargement d'une extension non empaquetée : la page d'options ne doit s'ouvrir que sur `details.reason === "install"` (corrigé en 1.0.2, ne pas retirer le garde).
- Le stockage est `chrome.storage.sync` : un profil sans synchro, ou un changement de profil, vide `adminUrl` et fait réapparaître la page d'options à la première visite d'un site WordPress.
