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
	const noSiteEl = document.getElementById('popup-no-site');
	const mainEl = document.getElementById('popup-main');
	const hostEl = document.getElementById('popup-host');
	const stateEl = document.getElementById('popup-state');
	const pathLabelEl = document.getElementById('popup-path-label');
	const pathInput = document.getElementById('popup-path');
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
		saveButton.textContent = chrome.i18n.getMessage('popupSaveForSite');
		goButton.textContent = chrome.i18n.getMessage('popupGoNow');
		disableButton.textContent = chrome.i18n.getMessage('sitesNoneMention');
		forgetButton.textContent = chrome.i18n.getMessage('popupForgetSite');
		settingsLink.textContent = chrome.i18n.getMessage('popupSettingsLink');
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

		function refresh() {
			chrome.storage.sync.get(['adminUrl', siteKey], (data) => {
				const rule = data[siteKey];
				const defaultProposal = data.adminUrl || '';

				if (rule && rule.path !== undefined) {
					forgetButton.style.display = '';
					if (rule.path === null) {
						stateEl.textContent = chrome.i18n.getMessage('sitesNoneMention');
						pathInput.value = defaultProposal || '/wp-admin/';
					} else {
						stateEl.textContent = chrome.i18n.getMessage('popupRuleActive', [rule.path]);
						pathInput.value = rule.path;
					}
				} else {
					forgetButton.style.display = 'none';
					if (defaultProposal) {
						stateEl.textContent = chrome.i18n.getMessage('popupRuleSuggested', [defaultProposal]);
						pathInput.value = defaultProposal;
					} else {
						stateEl.textContent = chrome.i18n.getMessage('popupRuleNoSuggestion');
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
			chrome.storage.sync.set({ [siteKey]: { path } }, () => {
				pathInput.value = path;
				showStatus(chrome.i18n.getMessage('siteAddedMessage'));
				refresh();
			});
		});

		goButton.addEventListener('click', () => {
			const raw = pathInput.value.trim();
			const path = raw ? normalizePath(raw) : '/wp-admin/';
			chrome.runtime.sendMessage({ action: 'goToAdmin', path, tabId, url });
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
