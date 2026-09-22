document.addEventListener('DOMContentLoaded', () => {

	document.documentElement.lang = chrome.i18n.getUILanguage();

	document.getElementById('welcome-text').innerText = chrome.i18n.getMessage("welcomeMessage");
	document.getElementById('admin-url-label').innerText = chrome.i18n.getMessage("adminUrlLabel");
	document.getElementById('ask-on-new-sites-label').innerText = chrome.i18n.getMessage("askOnNewSitesLabel");
	document.getElementById('ask-on-new-sites-help').innerText = chrome.i18n.getMessage("askOnNewSitesHelp");
	document.getElementById('save-button').innerText = chrome.i18n.getMessage("saveButton");
	document.getElementById('explainations').innerText = chrome.i18n.getMessage("explainations");
	document.getElementById('debug-label').innerText = chrome.i18n.getMessage("debugLabel");
	document.getElementById('sites-section-title').innerText = chrome.i18n.getMessage("sitesSectionTitle");
	document.getElementById('sites-table-host-header').innerText = chrome.i18n.getMessage("sitesTableHostHeader");
	document.getElementById('sites-table-path-header').innerText = chrome.i18n.getMessage("sitesTablePathHeader");
	document.getElementById('sites-table-actions-header').innerText = chrome.i18n.getMessage("sitesTableActionsHeader");
	document.getElementById('sites-empty').innerText = chrome.i18n.getMessage("sitesEmpty");
	document.getElementById('add-site-host').placeholder = chrome.i18n.getMessage("sitesAddHostPlaceholder");
	document.getElementById('add-site-path').placeholder = chrome.i18n.getMessage("sitesAddPathPlaceholder");
	document.getElementById('add-site-button').innerText = chrome.i18n.getMessage("addSiteButton");

	const form = document.getElementById('options-form');
	const adminUrlInput = document.getElementById('admin-url');
	const askOnNewSitesCheckbox = document.getElementById('ask-on-new-sites');
	const debugCheckbox = document.getElementById('debug');

	const sitesList = document.getElementById('sites-list');
	const sitesEmpty = document.getElementById('sites-empty');
	const sitesStatus = document.getElementById('sites-status');
	const siteRowTemplate = document.getElementById('site-row-template').content;
	const addSiteHostInput = document.getElementById('add-site-host');
	const addSitePathInput = document.getElementById('add-site-path');
	const addSiteButton = document.getElementById('add-site-button');

	const SITE_PREFIX = 'site:';

	// Load saved options
	chrome.storage.sync.get(['adminUrl', 'askOnNewSites', 'debug'], (data) => {
		adminUrlInput.value = data.adminUrl || '';
		askOnNewSitesCheckbox.checked = data.askOnNewSites !== false;
		debugCheckbox.checked = !!data.debug;
	});

	loadSitesTable();

	function loadSitesTable() {
		chrome.storage.sync.get(null, (data) => {
			const hosts = Object.keys(data)
				.filter(key => key.startsWith(SITE_PREFIX))
				.map(key => key.slice(SITE_PREFIX.length))
				.sort();

			sitesList.innerHTML = '';

			hosts.forEach(host => {
				addSiteRow(host, data[SITE_PREFIX + host]);
			});

			sitesEmpty.style.display = hosts.length === 0 ? '' : 'none';
		});
	}

	function addSiteRow(host, rule) {
		const clone = document.importNode(siteRowTemplate, true);
		const row = clone.querySelector('.site-row');
		const hostCell = clone.querySelector('.site-host');
		const pathCell = clone.querySelector('.site-path');
		const removeButton = clone.querySelector('.remove-site');

		hostCell.textContent = host;
		removeButton.innerText = chrome.i18n.getMessage('deleteButton');

		const path = rule && rule.path !== undefined ? rule.path : null;

		if (path === null) {
			const mention = document.createElement('span');
			mention.className = 'site-none-mention';
			mention.textContent = chrome.i18n.getMessage('sitesNoneMention');
			pathCell.appendChild(mention);
		} else {
			const pathInput = document.createElement('input');
			pathInput.type = 'text';
			pathInput.value = path;
			pathInput.addEventListener('change', () => {
				const raw = pathInput.value.trim();
				if (!raw) {
					pathInput.value = path;
					return;
				}
				const normalized = normalizePath(raw);
				chrome.storage.sync.set({ [SITE_PREFIX + host]: { path: normalized } }, () => {
					pathInput.value = normalized;
					showSitesStatus(chrome.i18n.getMessage('siteAddedMessage'));
				});
			});
			pathCell.appendChild(pathInput);
		}

		removeButton.addEventListener('click', () => {
			chrome.storage.sync.remove(SITE_PREFIX + host, () => {
				row.remove();
				if (sitesList.children.length === 0) {
					sitesEmpty.style.display = '';
				}
				showSitesStatus(chrome.i18n.getMessage('siteRemovedMessage'));
			});
		});

		sitesList.appendChild(clone);
	}

	// Mirrors background.js's normalizeHost(): lowercase hostname, "www." stripped.
	function normalizeHostInput(value) {
		const trimmed = value.trim();
		if (!trimmed) {
			return '';
		}
		const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
		try {
			const host = new URL(candidate).hostname.toLowerCase();
			return host.startsWith('www.') ? host.slice(4) : host;
		} catch (error) {
			return '';
		}
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

	function showSitesStatus(message) {
		sitesStatus.textContent = message;
		setTimeout(() => {
			sitesStatus.textContent = '';
		}, 2000);
	}

	addSiteButton.addEventListener('click', () => {
		const host = normalizeHostInput(addSiteHostInput.value);
		if (!host) {
			addSiteHostInput.focus();
			return;
		}

		const rawPath = addSitePathInput.value.trim();
		const path = rawPath ? normalizePath(rawPath) : null;

		chrome.storage.sync.set({ [SITE_PREFIX + host]: { path } }, () => {
			addSiteHostInput.value = '';
			addSitePathInput.value = '';
			showSitesStatus(chrome.i18n.getMessage('siteAddedMessage'));
			loadSitesTable();
		});
	});

	// Save options
	form.addEventListener('submit', (event) => {
		event.preventDefault();

		const adminUrl = adminUrlInput.value;
		const askOnNewSites = !!askOnNewSitesCheckbox.checked;
		const debug = !!debugCheckbox.checked;

		chrome.storage.sync.set({ adminUrl, askOnNewSites, debug }, () => {
			const saveStatus = document.getElementById('save-status');
			saveStatus.textContent = chrome.i18n.getMessage('savedMessage');
			setTimeout(() => {
				saveStatus.textContent = '';
			}, 2000);
		});
	});
});
