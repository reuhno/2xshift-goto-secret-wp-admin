document.addEventListener('DOMContentLoaded', () => {

	const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage;

	if (hasChrome) {
		document.documentElement.lang = chrome.i18n.getUILanguage();

		document.getElementById('page-title').innerText = chrome.i18n.getMessage("extensionName");
		document.getElementById('fonctionnement-title').innerText = chrome.i18n.getMessage("optionsFonctionnementTitle");
		document.getElementById('fonctionnement-p1').innerText = chrome.i18n.getMessage("optionsFonctionnementP1");
		document.getElementById('fonctionnement-p2').innerText = chrome.i18n.getMessage("optionsFonctionnementP2");
		document.getElementById('explainations').innerText = chrome.i18n.getMessage("explainations");
		document.getElementById('reglages-title').innerText = chrome.i18n.getMessage("optionsReglagesTitle");
		document.getElementById('admin-url-label').innerText = chrome.i18n.getMessage("adminUrlLabel");
		document.getElementById('ask-on-new-sites-label').innerText = chrome.i18n.getMessage("askOnNewSitesLabel");
		document.getElementById('ask-on-new-sites-help').innerText = chrome.i18n.getMessage("askOnNewSitesHelp");
		document.getElementById('save-button').innerText = chrome.i18n.getMessage("saveButton");
		document.getElementById('debug-label').innerText = chrome.i18n.getMessage("debugLabel");
		document.getElementById('sites-section-title').innerText = chrome.i18n.getMessage("sitesSectionTitle");
		document.getElementById('sites-table-host-header').innerText = chrome.i18n.getMessage("sitesTableHostHeader");
		document.getElementById('sites-table-path-header').innerText = chrome.i18n.getMessage("sitesTablePathHeader");
		document.getElementById('sites-table-actions-header').innerText = chrome.i18n.getMessage("sitesTableActionsHeader");
		document.getElementById('sites-empty').innerText = chrome.i18n.getMessage("sitesEmpty");
		document.getElementById('add-site-host').placeholder = chrome.i18n.getMessage("sitesAddHostPlaceholder");
		document.getElementById('add-site-path').placeholder = chrome.i18n.getMessage("sitesAddPathPlaceholder");
		document.getElementById('add-site-button').innerText = chrome.i18n.getMessage("addSiteButton");
		document.getElementById('credits-title').innerText = chrome.i18n.getMessage("optionsCreditsTitle");
		document.getElementById('credits-made-by').innerHTML = chrome.i18n.getMessage("creditsMadeBy");
		document.getElementById('credits-coffee').innerHTML = chrome.i18n.getMessage("creditsCoffee");
	}

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

	// Hors extension (aperçu navigateur) : pas d'API chrome.* disponible, on
	// laisse le balisage de secours (état vide, libellés en dur en français).
	if (!hasChrome) {
		return;
	}

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

		renderPathCell(pathCell, host, path);

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

	// Rend le contenu de la cellule « Chemin d'admin » : soit un champ texte
	// (règle avec chemin), soit la mention « Ne pas rediriger » + un lien
	// « Définir un chemin » qui transforme la mention en champ texte.
	function renderPathCell(pathCell, host, path) {
		pathCell.innerHTML = '';

		if (path === null) {
			const mention = document.createElement('span');
			mention.className = 'site-none-mention';
			mention.textContent = chrome.i18n.getMessage('sitesNoneMention');

			const defineLink = document.createElement('button');
			defineLink.type = 'button';
			defineLink.className = 'btn-text define-path-link';
			defineLink.innerText = chrome.i18n.getMessage('sitesDefinePathLink');
			defineLink.addEventListener('click', () => {
				renderPathInput(pathCell, host, '', true);
			});

			pathCell.appendChild(mention);
			pathCell.appendChild(document.createTextNode(' '));
			pathCell.appendChild(defineLink);
			return;
		}

		renderPathInput(pathCell, host, path, false);
	}

	function renderPathInput(pathCell, host, path, wasNone) {
		pathCell.innerHTML = '';

		const pathInput = document.createElement('input');
		pathInput.type = 'text';
		pathInput.value = path;
		pathInput.placeholder = chrome.i18n.getMessage('sitesAddPathPlaceholder');

		pathInput.addEventListener('change', () => {
			const raw = pathInput.value.trim();
			if (!raw) {
				if (wasNone) {
					// Laissé vide après « Définir un chemin » : on revient à
					// la mention, sans rien enregistrer.
					renderPathCell(pathCell, host, null);
				} else {
					pathInput.value = path;
				}
				return;
			}
			const normalized = normalizePath(raw);
			chrome.storage.sync.set({ [SITE_PREFIX + host]: { path: normalized } }, () => {
				path = normalized;
				wasNone = false;
				pathInput.value = normalized;
				showSitesStatus(chrome.i18n.getMessage('siteAddedMessage'));
			});
		});

		pathCell.appendChild(pathInput);

		if (wasNone) {
			pathInput.focus();
		}
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
