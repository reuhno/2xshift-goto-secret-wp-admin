# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ce que c'est

Extension Chrome **Manifest V3**, sans build, sans dépendance, sans tests. Nom public : « 2xShift Goto secret wp-admin ». Sur un site WordPress où l'on n'est pas connecté, un **double appui sur Shift (< 275 ms)** redirige vers l'URL de connexion cachée du site (règle mémorisée par hôte, ou proposition par défaut), avec `?redirect_to=` vers la page d'origine. Sur un site sans règle, un **overlay de première utilisation** propose de mémoriser l'accès.

## Dépôt git

- Remote `origin` : https://github.com/reuhno/2xshift-goto-secret-wp-admin.
- Une branche `feature/<slug>` par lot, fusionnée en avance rapide (fast-forward) dans `main`.
- `git push` réservé au propriétaire (Renaud) : un agent ne pousse pas de lui-même.

## Développement

- Chargée dans Chrome **directement depuis ce dossier** (« Charger l'extension non empaquetée », profil Default). Après toute modification : `chrome://extensions` → bouton ↻ de l'extension. Une page ouverte doit être rechargée pour recevoir le nouveau `content.js`.
- Journaux : sous l'option **Debug** de la page de réglages (case à cocher, `chrome.storage.sync.debug`). Rien ne s'écrit dans la console tant qu'elle n'est pas cochée. Le `console.log` de `content.js` est dans la console de la page ; celui de `background.js` dans « Inspecter les vues : service worker » sur `chrome://extensions`.
- Incrémenter `"version"` dans `manifest.json` à chaque modification livrée (SemVer, actuellement 1.2.0).
- Les libellés visibles passent par `_locales/{en,fr}/messages.json` (`__MSG_x__` dans le manifeste, `chrome.i18n.getMessage` dans `options.js` et dans `content.js` pour l'overlay). Toute nouvelle chaîne s'ajoute **dans les deux langues**.
- Page de réglages intégrée : `manifest.json` déclare `options_ui: { page: "options.html", open_in_tab: false }` (plus `options_page`) — la page s'affiche dans la boîte de dialogue de `chrome://extensions`, d'où le `body` sans `max-width` fixe. Un clic sur l'icône de la barre d'outils (`action`, pas de `default_popup`) ouvre aussi les réglages (`chrome.action.onClicked` → `chrome.runtime.openOptionsPage()`).

## Modèle de stockage (`chrome.storage.sync`)

- `adminUrl` (chaîne) : **proposition par défaut**, peut être vide.
- `site:<hôte>` : une clé par site, `{ path: '/chemin/' }` ou `{ path: null }` (`null` = ne jamais rediriger sur ce site). Une clé par site plutôt qu'un tableau, à cause de la limite de 8 Ko par élément du stockage synchronisé. Hôte normalisé par `normalizeHost(url)` dans `background.js` (`new URL(url).hostname.toLowerCase()`, préfixe `www.` retiré) ; le content script reçoit toujours l'hôte déjà normalisé.
- `askOnNewSites` (booléen, **défaut `true` quand absent**) : à `false` et `adminUrl` non vide, un site sans règle est redirigé directement avec `adminUrl`, sans overlay.
- `debug` : inchangé.
- **Migration** de l'ancien tableau `exceptions` `[{ url, adminUrl }]` : `migrateExceptionsIfNeeded()` dans `background.js`, appelée au début de `handleCheckCookiesAndRedirect` et dans `onInstalled` (toutes raisons). Idempotente : n'écrase jamais une clé `site:` déjà présente, supprime `exceptions` une fois traité.

## Architecture : détection paresseuse, overlay de première utilisation

1. **`content.js`** (toutes les URLs) — au chargement, ne fait **rien** d'autre qu'attacher l'écouteur `keydown` (gardes : `event.repeat`, champs de saisie / contentEditable, `overlayOpen`). Aucune lecture du DOM avant un double Shift. Au double Shift (< 275 ms) : mémo de page `pageKind` (null → évalué une fois par sélecteurs d'attributs uniquement — `link`/`script` pointant vers `/wp-content/`, `/wp-includes/`, `link[rel="https://api.w.org/"]`, `link[href*="/wp-json/"]`, meta `generator` — aucun `innerHTML`), puis mémorisé (`'wp'` ou `'other'`). Si `'wp'` et que l'utilisateur n'est **pas visiblement connecté** (`#wpadminbar` absent et pas de classe `logged-in` sur `<body>`), envoie `checkCookiesAndRedirect` au service worker.
2. **`background.js`** (service worker), sur `checkCookiesAndRedirect` ({ url }) : migration si besoin → `host = normalizeHost(url)` → une lecture `chrome.storage.sync.get(['adminUrl', 'askOnNewSites', 'debug', 'site:' + host])` → cookie `wordpress_logged_in*` présent : rien ; règle de site présente : `path === null` → rien, sinon `redirectToAdmin()` ; pas de règle et `askOnNewSites === false` et `adminUrl` non vide → `redirectToAdmin()` direct ; sinon → `chrome.tabs.sendMessage(tabId, { action: 'askSiteRule', host, defaultPath, usualPath })`. `redirectToAdmin(url, path, tabId)` accepte un chemin ou une URL complète (n'en garde que le `pathname`), pose toujours `redirect_to`.
3. **Overlay** (`content.js`, message `askSiteRule`) — n'existe pas avant le message. Un seul à la fois (`overlayOpen`). `<div>` hôte ajouté à `document.documentElement` (pas `body`), `attachShadow({ mode: 'closed' })`. **Jamais de `<style>` injectée directement** (CSP `style-src` de certains sites) : `new CSSStyleSheet()` + `replaceSync()` + `shadowRoot.adoptedStyleSheets`, repli sur une balise `<style>` dans le shadow si l'API est absente. `<form>` : Entrée valide, Échap et clic sur le voile annulent sans rien enregistrer et rendent le focus à `document.activeElement` d'avant ouverture. Choix : `/wp-admin/`, « choix habituel » (si `usualPath` défini et différent de `/wp-admin/`), chemin personnalisé (case cochée automatiquement à la saisie), ou « ne pas rediriger ». Validation → `chrome.runtime.sendMessage({ action: 'saveSiteRule', host, path, redirect })` ; c'est le service worker qui redirige, pas le content script.
4. **`options.html` / `options.js`** — `adminUrl` (proposition par défaut), `askOnNewSites`, `debug` dans un formulaire classique (bouton Enregistrer). Section « Sites mémorisés » séparée : tableau construit depuis `chrome.storage.sync.get(null)` filtré sur les clés `site:`, écritures/suppressions **immédiates** (pas besoin d'Enregistrer).

Cookies `wordpress_logged_in*` conservés délibérément (décision du propriétaire) : en édition de texte on appuie souvent deux fois sur Shift par inadvertance, et sans cette vérification la redirection serait insupportable.

Pièges connus :
- `chrome.runtime.onInstalled` se déclenche à l'installation **mais aussi** à chaque mise à jour de Chrome et à chaque rechargement d'une extension non empaquetée : la page d'options ne doit s'ouvrir que sur `details.reason === "install"` (corrigé en 1.0.2, ne pas retirer le garde). La migration `exceptions`, elle, tourne à chaque `onInstalled`, toutes raisons confondues.
- Le stockage est `chrome.storage.sync` : un profil sans synchro, ou un changement de profil, vide `adminUrl` et les `site:*`.
- `content.js` et `background.js` ont chacun leur propre assistant `log()` local (pas de fichier partagé) ; celui de `content.js` lit `debug` au premier double Shift seulement, celui de `background.js` le lit au même appel `chrome.storage.sync.get` que `adminUrl`.
- L'overlay est dans un Shadow DOM **fermé** (`mode: 'closed'`) : inaccessible depuis la page hôte, y compris pour un script de la page qui tenterait de le lire.
