// 2xShift Goto secret wp-admin — popup de l'icône
// Lit l'onglet actif (activeTab au clic sur l'icône + host_permissions) et
// permet de consulter/modifier la règle du site courant sans ouvrir les
// réglages complets. N'écrit jamais directement : passe par
// chrome.storage.sync (mêmes clés que background.js/options.js) et, pour la
// redirection immédiate, par un message `goToAdmin` — depuis un popup
// `sender.tab` est absent côté service worker, donc tabId et url sont
// transmis explicitement dans le message.

document.addEventListener('DOMContentLoaded', () => {
	const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage;

	const extNameEl = document.getElementById('popup-ext-name');
	const permissionWarningEl = document.getElementById('popup-permission-warning');
	const permissionWarningTextEl = document.getElementById('popup-permission-warning-text');
	const permissionButtonEl = document.getElementById('popup-permission-button');
	const noSiteEl = document.getElementById('popup-no-site');
	const mainEl = document.getElementById('popup-main');
	const hostEl = document.getElementById('popup-host');
	const stateEl = document.getElementById('popup-state');
	const pathLabelEl = document.getElementById('popup-path-label');
	const pathInput = document.getElementById('popup-path');
	const redirectBackLabelEl = document.getElementById('popup-redirect-back-label');
	const redirectBackSelect = document.getElementById('popup-redirect-back');
	const saveButton = document.getElementById('popup-save');
	const goButton = document.getElementById('popup-go');
	const disableButton = document.getElementById('popup-disable');
	const forgetButton = document.getElementById('popup-forget');
	const settingsLink = document.getElementById('popup-settings-link');
	const statusEl = document.getElementById('popup-status');

	if (hasChrome) {
		document.documentElement.lang = chrome.i18n.getUILanguage();
		extNameEl.textContent = chrome.i18n.getMessage('extensionName');
		noSiteEl.textContent = chrome.i18n.getMessage('popupNoHttpSite');
		pathLabelEl.textContent = chrome.i18n.getMessage('popupPathLabel');
		redirectBackLabelEl.textContent = chrome.i18n.getMessage('popupRedirectBackLabel');
		redirectBackSelect.options[0].textContent = chrome.i18n.getMessage('redirectBackOptionGlobal');
		redirectBackSelect.options[1].textContent = chrome.i18n.getMessage('redirectBackOptionYes');
		redirectBackSelect.options[2].textContent = chrome.i18n.getMessage('redirectBackOptionNo');
		saveButton.textContent = chrome.i18n.getMessage('popupSaveForSite');
		goButton.textContent = chrome.i18n.getMessage('popupGoNow');
		disableButton.textContent = chrome.i18n.getMessage('sitesNoneMention');
		forgetButton.textContent = chrome.i18n.getMessage('popupForgetSite');
		settingsLink.textContent = chrome.i18n.getMessage('popupSettingsLink');
		permissionWarningTextEl.textContent = chrome.i18n.getMessage('popupPermissionWarning');
		permissionButtonEl.textContent = chrome.i18n.getMessage('popupPermissionButton');
	}

	settingsLink.addEventListener('click', (event) => {
		event.preventDefault();
		if (!hasChrome) {
			return;
		}
		chrome.runtime.openOptionsPage();
		window.close();
	});

	// Hors extension (aperçu navigateur) : pas d'API chrome.* disponible,
	// on laisse le balisage de secours (état représentatif, en français).
	if (!hasChrome) {
		return;
	}

	// Garde d'accès aux sites (Firefox MV3) : <all_urls> n'y est pas accordé
	// d'office, contrairement à Chrome où host_permissions accorde déjà
	// tout — l'encart n'apparaît donc jamais sur Chrome. Sans cet accord,
	// content.js ne s'injecte pas et le double Shift reste inactif ; ce
	// popup est l'endroit indiqué par l'assistant pour le rattraper.
	function checkAllUrlsPermission() {
		try {
			if (typeof browser !== 'undefined' && browser.permissions && browser.permissions.contains) {
				return browser.permissions.contains({ origins: ['<all_urls>'] })
					.then((has) => !!has)
					.catch(() => true);
			}
			return new Promise((resolve) => {
				chrome.permissions.contains({ origins: ['<all_urls>'] }, (has) => {
					resolve(!!has);
				});
			}).catch(() => true);
		} catch (error) {
			return Promise.resolve(true);
		}
	}

	// Forme promesse (API native `browser.*` de Firefox) avec repli en
	// callbacks (`chrome.*`, seule forme disponible sur Chrome) ; toute
	// exception vaut accord, pour ne jamais bloquer Chrome.
	function requestAllUrlsPermission() {
		try {
			if (typeof browser !== 'undefined' && browser.permissions && browser.permissions.request) {
				return browser.permissions.request({ origins: ['<all_urls>'] })
					.then((granted) => !!granted)
					.catch(() => true);
			}
			return new Promise((resolve) => {
				chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
					resolve(!!granted);
				});
			}).catch(() => true);
		} catch (error) {
			return Promise.resolve(true);
		}
	}

	checkAllUrlsPermission().then((has) => {
		permissionWarningEl.hidden = has;
	});

	permissionButtonEl.addEventListener('click', () => {
		requestAllUrlsPermission().then((granted) => {
			permissionWarningEl.hidden = granted;
		});
	});

	const SITE_PREFIX = 'site:';

	// Mirrors background.js's normalizeHost(): lowercase hostname, "www." stripped.
	function normalizeHost(url) {
		const host = new URL(url).hostname.toLowerCase();
		return host.startsWith('www.') ? host.slice(4) : host;
	}

	function normalizePath(raw) {
		if (/^https?:\/\//i.test(raw)) {
			try {
				return new URL(raw).pathname;
			} catch (error) {
				return raw;
			}
		}
		return raw.startsWith('/') ? raw : `/${raw}`;
	}

	function showStatus(message) {
		statusEl.textContent = message;
		setTimeout(() => {
			statusEl.textContent = '';
		}, 1500);
	}

	// État "règle active" : texte courant (--text) + chemin en gras, plutôt
	// que le --muted par défaut de .popup-state. stateEl.textContent était du
	// texte brut ; on reconstruit en DOM en repérant la sous-chaîne exacte du
	// chemin dans le message résolu par chrome.i18n.getMessage (elle y a été
	// injectée via le placeholder $PATH$), pour l'entourer d'un <span> sans
	// ajouter de nouvelle clé de traduction.
	function setStateText(message) {
		stateEl.classList.remove('popup-state--active');
		stateEl.textContent = message;
	}

	function setStateActive(fullMessage, pathValue) {
		stateEl.classList.add('popup-state--active');
		stateEl.textContent = '';

		const index = fullMessage.indexOf(pathValue);
		if (index === -1) {
			// Repli : coupe impossible (ne devrait pas arriver), texte brut.
			stateEl.appendChild(document.createTextNode(fullMessage));
			return;
		}

		const before = fullMessage.slice(0, index);
		const after = fullMessage.slice(index + pathValue.length);

		if (before) {
			stateEl.appendChild(document.createTextNode(before));
		}
		const pathSpan = document.createElement('span');
		pathSpan.className = 'popup-state-path';
		pathSpan.textContent = pathValue;
		stateEl.appendChild(pathSpan);
		if (after) {
			stateEl.appendChild(document.createTextNode(after));
		}
	}

	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		const tab = tabs && tabs[0];

		if (!tab || !tab.url || !/^https?:\/\//i.test(tab.url)) {
			mainEl.style.display = 'none';
			noSiteEl.style.display = '';
			return;
		}

		noSiteEl.style.display = 'none';
		mainEl.style.display = '';

		const tabId = tab.id;
		const url = tab.url;
		const host = normalizeHost(url);
		const siteKey = SITE_PREFIX + host;

		hostEl.textContent = host;

		// Valeur effective du réglage global redirectBack, mise à jour à
		// chaque refresh() : sert à calculer le comportement de « Y aller
		// maintenant » quand le select est sur « Réglage global », sans
		// avoir à relire le stockage à ce moment-là (mêmes données que
		// celles déjà affichées).
		let currentGlobalRedirectBack = true;

		function refresh() {
			chrome.storage.sync.get(['adminUrl', 'redirectBack', siteKey], (data) => {
				const rule = data[siteKey];
				const defaultProposal = data.adminUrl || '';
				currentGlobalRedirectBack = data.redirectBack !== false;

				if (rule && rule.path !== undefined) {
					forgetButton.style.display = '';
					if (rule.path === null) {
						setStateText(chrome.i18n.getMessage('sitesNoneMention'));
						pathInput.value = defaultProposal || '/wp-admin/';
						redirectBackSelect.value = '';
						redirectBackSelect.disabled = true;
					} else {
						setStateActive(chrome.i18n.getMessage('popupRuleActive', [rule.path]), rule.path);
						pathInput.value = rule.path;
						redirectBackSelect.disabled = false;
						redirectBackSelect.value = typeof rule.redirectBack === 'boolean' ? String(rule.redirectBack) : '';
					}
				} else {
					forgetButton.style.display = 'none';
					redirectBackSelect.disabled = false;
					redirectBackSelect.value = '';
					if (defaultProposal) {
						setStateText(chrome.i18n.getMessage('popupRuleSuggested', [defaultProposal]));
						pathInput.value = defaultProposal;
					} else {
						setStateText(chrome.i18n.getMessage('popupRuleNoSuggestion'));
						pathInput.value = '/wp-admin/';
					}
				}
			});
		}

		refresh();

		saveButton.addEventListener('click', () => {
			const raw = pathInput.value.trim();
			if (!raw) {
				pathInput.focus();
				return;
			}
			const path = normalizePath(raw);
			const rule = { path };
			if (redirectBackSelect.value === 'true') {
				rule.redirectBack = true;
			} else if (redirectBackSelect.value === 'false') {
				rule.redirectBack = false;
			}
			chrome.storage.sync.set({ [siteKey]: rule }, () => {
				pathInput.value = path;
				showStatus(chrome.i18n.getMessage('siteAddedMessage'));
				refresh();
			});
		});

		goButton.addEventListener('click', () => {
			const raw = pathInput.value.trim();
			const path = raw ? normalizePath(raw) : '/wp-admin/';
			// Respecte le choix affiché dans le select sans l'enregistrer :
			// « Oui »/« Non » l'emportent, « Réglage global » retombe sur la
			// valeur globale lue au dernier refresh().
			const redirectBack = redirectBackSelect.value === 'true' ? true
				: redirectBackSelect.value === 'false' ? false
				: currentGlobalRedirectBack;
			chrome.runtime.sendMessage({ action: 'goToAdmin', path, tabId, url, redirectBack });
			window.close();
		});

		disableButton.addEventListener('click', () => {
			chrome.storage.sync.set({ [siteKey]: { path: null } }, () => {
				showStatus(chrome.i18n.getMessage('siteAddedMessage'));
				refresh();
			});
		});

		forgetButton.addEventListener('click', () => {
			chrome.storage.sync.remove(siteKey, () => {
				showStatus(chrome.i18n.getMessage('siteRemovedMessage'));
				refresh();
			});
		});
	});
});
