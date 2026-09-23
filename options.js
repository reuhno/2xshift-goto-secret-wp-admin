document.addEventListener('DOMContentLoaded', () => {

	const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage;

	if (hasChrome) {
		document.documentElement.lang = chrome.i18n.getUILanguage();

		document.getElementById('page-title').innerText = chrome.i18n.getMessage("extensionName");
		document.getElementById('fonctionnement-title').innerText = chrome.i18n.getMessage("optionsFonctionnementTitle");
		document.getElementById('fonctionnement-p1').innerText = chrome.i18n.getMessage("optionsFonctionnementP1");
		document.getElementById('fonctionnement-p2').innerText = chrome.i18n.getMessage("optionsFonctionnementP2");
		document.getElementById('explainations').innerText = chrome.i18n.getMessage("explainations");
		document.getElementById('relaunch-assistant').innerText = chrome.i18n.getMessage("relaunchAssistant");
		document.getElementById('reglages-title').innerText = chrome.i18n.getMessage("optionsReglagesTitle");
		document.getElementById('trigger-key-label').innerText = chrome.i18n.getMessage("triggerKeyLabel");
		document.getElementById('trigger-key-help').innerText = chrome.i18n.getMessage("triggerKeyHelp");
		document.getElementById('trigger-key-option-shift').innerText = chrome.i18n.getMessage("triggerKeyOptionShift");
		document.getElementById('trigger-key-option-control').innerText = chrome.i18n.getMessage("triggerKeyOptionControl");
		document.getElementById('trigger-key-option-alt').innerText = chrome.i18n.getMessage("triggerKeyOptionAlt");
		document.getElementById('trigger-key-option-meta').innerText = chrome.i18n.getMessage("triggerKeyOptionMeta");
		document.getElementById('admin-url-label').innerText = chrome.i18n.getMessage("adminUrlLabel");
		document.getElementById('ask-on-new-sites-label').innerText = chrome.i18n.getMessage("askOnNewSitesLabel");
		document.getElementById('ask-on-new-sites-help').innerText = chrome.i18n.getMessage("askOnNewSitesHelp");
		document.getElementById('redirect-back-label').innerText = chrome.i18n.getMessage("redirectBackLabel");
		document.getElementById('redirect-back-help').innerText = chrome.i18n.getMessage("redirectBackHelp");
		document.getElementById('save-button').innerText = chrome.i18n.getMessage("saveButton");
		document.getElementById('debug-label').innerText = chrome.i18n.getMessage("debugLabel");
		document.getElementById('sites-section-title').innerText = chrome.i18n.getMessage("sitesSectionTitle");
		document.getElementById('sites-table-host-header').innerText = chrome.i18n.getMessage("sitesTableHostHeader");
		document.getElementById('sites-table-path-header').innerText = chrome.i18n.getMessage("sitesTablePathHeader");
		document.getElementById('sites-table-redirect-back-header').innerText = chrome.i18n.getMessage("sitesTableRedirectBackHeader");
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
	const triggerKeySelect = document.getElementById('trigger-key');
	const adminUrlInput = document.getElementById('admin-url');
	const askOnNewSitesCheckbox = document.getElementById('ask-on-new-sites');
	const redirectBackCheckbox = document.getElementById('redirect-back');
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

	document.getElementById('relaunch-assistant').addEventListener('click', () => {
		chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
	});

	const SITE_PREFIX = 'site:';

	const TRIGGER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

	// Load saved options
	chrome.storage.sync.get(['triggerKey', 'adminUrl', 'askOnNewSites', 'redirectBack', 'debug'], (data) => {
		triggerKeySelect.value = TRIGGER_KEYS.includes(data.triggerKey) ? data.triggerKey : 'Shift';
		adminUrlInput.value = data.adminUrl || '';
		askOnNewSitesCheckbox.checked = data.askOnNewSites !== false;
		redirectBackCheckbox.checked = data.redirectBack !== false;
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
		const redirectBackSelect = clone.querySelector('.site-redirect-back-select');
		const openButton = clone.querySelector('.site-open-btn');
		const removeButton = clone.querySelector('.remove-site');

		hostCell.textContent = host;

		const openLabel = chrome.i18n.getMessage('openAdminAction');
		openButton.setAttribute('aria-label', openLabel);
		openButton.title = openLabel;

		const deleteLabel = chrome.i18n.getMessage('deleteSiteAction');
		removeButton.setAttribute('aria-label', deleteLabel);
		removeButton.title = deleteLabel;

		populateRedirectBackSelect(redirectBackSelect);
		redirectBackSelect.setAttribute('aria-label', chrome.i18n.getMessage('popupRedirectBackLabel'));

		const path = rule && rule.path !== undefined ? rule.path : null;
		const redirectBackOverride = rule && typeof rule.redirectBack === 'boolean' ? rule.redirectBack : null;
		redirectBackSelect.value = redirectBackOverride === null ? '' : String(redirectBackOverride);

		renderPathCell(pathCell, host, path, openButton, redirectBackSelect);

		// Écrit la surcharge redirectBack de la ligne, en réutilisant le
		// chemin actuellement affiché (lu en direct dans le DOM, comme le
		// bouton « ouvrir » ci-dessous : la cellule chemin peut avoir été
		// reconstruite depuis le rendu initial de la ligne).
		redirectBackSelect.addEventListener('change', () => {
			const input = pathCell.querySelector('input[type="text"]');
			const currentPath = input ? input.value.trim() : null;
			if (!currentPath) {
				// Ne devrait pas arriver : le select est désactivé quand il
				// n'y a pas de champ chemin (path === null).
				return;
			}
			const newRule = { path: currentPath };
			if (redirectBackSelect.value === 'true') {
				newRule.redirectBack = true;
			} else if (redirectBackSelect.value === 'false') {
				newRule.redirectBack = false;
			}
			chrome.storage.sync.set({ [SITE_PREFIX + host]: newRule }, () => {
				showSitesStatus(chrome.i18n.getMessage('siteAddedMessage'));
			});
		});

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

	// Remplit les libellés des trois options du sélecteur de surcharge
	// « Retour » (valeurs déjà posées dans le gabarit : "", "true", "false").
	function populateRedirectBackSelect(select) {
		if (!select) {
			return;
		}
		select.options[0].textContent = chrome.i18n.getMessage('redirectBackOptionGlobal');
		select.options[1].textContent = chrome.i18n.getMessage('redirectBackOptionYes');
		select.options[2].textContent = chrome.i18n.getMessage('redirectBackOptionNo');
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

	// Désactive le sélecteur de surcharge « Retour » quand la ligne est en
	// « Ne pas rediriger » (path === null) : la surcharge n'a alors aucun
	// sens. Le remet aussi sur « Réglage global » dans ce cas, pour ne pas
	// laisser affiché un choix qui ne sera pas enregistré. Appelé à chaque
	// (re)rendu de la cellule chemin, comme syncOpenButtonState.
	function syncRedirectBackSelectState(select, path) {
		if (!select) {
			return;
		}
		select.disabled = path === null;
		if (path === null) {
			select.value = '';
		}
	}

	// Rend le contenu de la cellule « Chemin d'admin » : soit un champ texte
	// (règle avec chemin), soit la mention « Ne pas rediriger » + un lien
	// « Définir un chemin » qui transforme la mention en champ texte.
	function renderPathCell(pathCell, host, path, openButton, redirectBackSelect) {
		pathCell.innerHTML = '';
		syncOpenButtonState(openButton, path);
		syncRedirectBackSelectState(redirectBackSelect, path);

		if (path === null) {
			const mention = document.createElement('span');
			mention.className = 'site-none-mention';
			mention.textContent = chrome.i18n.getMessage('sitesNoneMention');

			const defineLink = document.createElement('button');
			defineLink.type = 'button';
			defineLink.className = 'btn-text define-path-link';
			defineLink.innerText = chrome.i18n.getMessage('sitesDefinePathLink');
			defineLink.addEventListener('click', () => {
				renderPathInput(pathCell, host, '', true, openButton, redirectBackSelect);
			});

			pathCell.appendChild(mention);
			pathCell.appendChild(document.createTextNode(' '));
			pathCell.appendChild(defineLink);
			return;
		}

		renderPathInput(pathCell, host, path, false, openButton, redirectBackSelect);
	}

	function renderPathInput(pathCell, host, path, wasNone, openButton, redirectBackSelect) {
		pathCell.innerHTML = '';
		syncOpenButtonState(openButton, path);
		syncRedirectBackSelectState(redirectBackSelect, path);

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
					renderPathCell(pathCell, host, null, openButton, redirectBackSelect);
				} else {
					pathInput.value = path;
				}
				return;
			}
			const normalized = normalizePath(raw);
			// Le chemin peut changer sans passer par le select de surcharge :
			// on relit sa valeur courante pour ne pas écraser une surcharge
			// déjà enregistrée (chrome.storage.sync.set remplace tout
			// l'objet de la règle, il n'y a pas de fusion partielle).
			const newRule = { path: normalized };
			if (redirectBackSelect && redirectBackSelect.value === 'true') {
				newRule.redirectBack = true;
			} else if (redirectBackSelect && redirectBackSelect.value === 'false') {
				newRule.redirectBack = false;
			}
			chrome.storage.sync.set({ [SITE_PREFIX + host]: newRule }, () => {
				path = normalized;
				wasNone = false;
				pathInput.value = normalized;
				syncRedirectBackSelectState(redirectBackSelect, path);
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

		const triggerKey = TRIGGER_KEYS.includes(triggerKeySelect.value) ? triggerKeySelect.value : 'Shift';
		const adminUrl = adminUrlInput.value;
		const askOnNewSites = !!askOnNewSitesCheckbox.checked;
		const redirectBack = !!redirectBackCheckbox.checked;
		const debug = !!debugCheckbox.checked;

		chrome.storage.sync.set({ triggerKey, adminUrl, askOnNewSites, redirectBack, debug }, () => {
			const saveStatus = document.getElementById('save-status');
			saveStatus.textContent = chrome.i18n.getMessage('savedMessage');
			setTimeout(() => {
				saveStatus.textContent = '';
			}, 2000);
		});
	});
});
