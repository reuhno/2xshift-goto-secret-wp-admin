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
		const openButton = clone.querySelector('.site-open-btn');
		const removeButton = clone.querySelector('.remove-site');

		hostCell.textContent = host;

		const openLabel = chrome.i18n.getMessage('openAdminAction');
		openButton.setAttribute('aria-label', openLabel);
		openButton.title = openLabel;

		const deleteLabel = chrome.i18n.getMessage('deleteSiteAction');
		removeButton.setAttribute('aria-label', deleteLabel);
		removeButton.title = deleteLabel;

		const path = rule && rule.path !== undefined ? rule.path : null;

		renderPathCell(pathCell, host, path, openButton);

		// Lit le champ chemin de LA LIGNE au moment du clic (pas une valeur
		// figée à la construction) : la cellule est reconstruite par
		// renderPathCell/renderPathInput à chaque bascule, donc on interroge
		// pathCell plutôt que de garder une référence à un <input> périmé.
		openButton.addEventListener('click', () => {
			if (openButton.getAttribute('aria-disabled') === 'true') {
				return;
			}
			const input = pathCell.querySelector('input[type="text"]');
			if (!input) {
				return;
			}
			const raw = input.value.trim();
			if (!raw) {
				return;
			}
			const normalized = normalizePath(raw);
			chrome.tabs.create({ url: `https://${host}${normalized}` });
		});

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

	// Active/désactive le bouton « ouvrir » selon l'état de la ligne : absent
	// de fonction (pas de handler actif) quand path === null (« Ne pas
	// rediriger »), actif sinon. Appelé à chaque (re)rendu de la cellule
	// chemin pour rester synchronisé avec la bascule mention <-> champ texte.
	function syncOpenButtonState(openButton, path) {
		if (!openButton) {
			return;
		}
		openButton.setAttribute('aria-disabled', path === null ? 'true' : 'false');
	}

	// Rend le contenu de la cellule « Chemin d'admin » : soit un champ texte
	// (règle avec chemin), soit la mention « Ne pas rediriger » + un lien
	// « Définir un chemin » qui transforme la mention en champ texte.
	function renderPathCell(pathCell, host, path, openButton) {
		pathCell.innerHTML = '';
		syncOpenButtonState(openButton, path);

		if (path === null) {
			const mention = document.createElement('span');
			mention.className = 'site-none-mention';
			mention.textContent = chrome.i18n.getMessage('sitesNoneMention');

			const defineLink = document.createElement('button');
			defineLink.type = 'button';
			defineLink.className = 'btn-text define-path-link';
			defineLink.innerText = chrome.i18n.getMessage('sitesDefinePathLink');
			defineLink.addEventListener('click', () => {
				renderPathInput(pathCell, host, '', true, openButton);
			});

			pathCell.appendChild(mention);
			pathCell.appendChild(document.createTextNode(' '));
			pathCell.appendChild(defineLink);
			return;
		}

		renderPathInput(pathCell, host, path, false, openButton);
	}

	function renderPathInput(pathCell, host, path, wasNone, openButton) {
		pathCell.innerHTML = '';
		syncOpenButtonState(openButton, path);

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
					renderPathCell(pathCell, host, null, openButton);
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
