// 2xShift Goto secret wp-admin — content script
// Détection paresseuse : au chargement, on ne fait rien d'autre qu'écouter le
// clavier. Rien n'est lu (DOM ou stockage) avant le premier appui sur une touche modificatrice.

let debugEnabled = null; // null = pas encore lu, sinon booléen mis en cache pour la page
let triggerKey = null; // null = pas encore lu ; sinon 'Shift'/'Control'/'Alt'/'Meta' mis en cache pour la page
let pageKind = null; // null = pas encore évalué, 'wp' ou 'other'
let overlayOpen = false; // un seul overlay « première utilisation » à la fois

// Touches modificatrices éligibles au double appui (réglage `triggerKey`).
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

const log = (...args) => {
	if (debugEnabled) {
		console.log('[2xShift]', ...args);
	}
};

// Signatures WordPress détectées uniquement par sélecteurs d'attributs
// (aucune lecture d'innerHTML).
const WP_SELECTOR = [
	'link[href*="/wp-content/"]',
	'link[href*="/wp-includes/"]',
	'script[src*="/wp-content/"]',
	'script[src*="/wp-includes/"]',
	'link[rel="https://api.w.org/"]',
	'link[href*="/wp-json/"]',
	'meta[name="generator"][content*="WordPress"]'
].join(', ');

const isWordPressPage = () => document.querySelector(WP_SELECTOR) !== null;

const isVisiblyLoggedIn = () => {
	return document.getElementById('wpadminbar') !== null ||
		document.body.classList.contains('logged-in');
};

// Lit le drapeau debug et la touche modificatrice choisie en un seul appel
// (au premier appui sur une modificatrice), puis les met en cache.
const readSettingsOnce = () => {
	if (debugEnabled !== null) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		try {
			chrome.storage.sync.get(['debug', 'triggerKey'], (data) => {
				debugEnabled = !!(data && data.debug);
				triggerKey = (data && MODIFIER_KEYS.includes(data.triggerKey)) ? data.triggerKey : 'Shift';
				resolve();
			});
		} catch (error) {
			debugEnabled = false;
			triggerKey = 'Shift';
			resolve();
		}
	});
};

const handleDoubleShift = () => {
	if (pageKind === null) {
		pageKind = isWordPressPage() ? 'wp' : 'other';
		log('Page kind evaluated:', pageKind);
	}

	if (pageKind !== 'wp') {
		return;
	}

	if (isVisiblyLoggedIn()) {
		log('User visibly logged in, no message sent.');
		return;
	}

	log('Sending checkCookiesAndRedirect.');
	chrome.runtime.sendMessage({
		action: 'checkCookiesAndRedirect',
		url: window.location.href
	});
};

let lastModifierPress = null; // dernier appui sur une touche modificatrice : { key, time } ou null

document.addEventListener('keydown', (event) => {
	// Overlay « première utilisation » ouvert : aucun double appui ne doit
	// être détecté tant qu'il est là (radios et boutons ne sont pas des
	// champs de saisie, la garde ci-dessous ne suffit pas à elle seule).
	if (overlayOpen) {
		return;
	}

	// Sous Windows, maintenir une touche répète les keydown : ignorer les répétitions
	// pour ne pas déclencher la redirection en boucle.
	if (event.repeat) {
		return;
	}

	// Ignorer le double appui si la cible est un champ de saisie.
	const target = event.target;
	const isFormField = target && ['input', 'textarea', 'select'].includes(target.tagName ? target.tagName.toLowerCase() : '');
	if (isFormField || (target && target.isContentEditable)) {
		return;
	}

	if (!MODIFIER_KEYS.includes(event.key)) {
		return;
	}

	// Timestamps capturés de façon synchrone (avant l'attente de la lecture du
	// stockage) pour ne pas rater le tout premier double appui de la page.
	const now = Date.now();
	const previous = lastModifierPress; // { key, time } ou null
	lastModifierPress = { key: event.key, time: now };

	readSettingsOnce().then(() => {
		if (event.key !== triggerKey) {
			return;
		}
		if (previous && previous.key === triggerKey && now - previous.time < 275) {
			handleDoubleShift();
		}
	}).catch((error) => {
		log('Error handling double press:', error);
	});
});

// --- Overlay « première utilisation » -------------------------------------
// Reçoit askSiteRule du service worker quand aucune règle n'existe pour ce
// site. Ne répond rien : envoie saveSiteRule séparément une fois validé.

chrome.runtime.onMessage.addListener((message) => {
	if (!message || message.action !== 'askSiteRule') {
		return;
	}
	if (overlayOpen) {
		log('Overlay already open, ignoring askSiteRule.');
		return;
	}
	showSiteRuleOverlay(message.host, message.usualPath);
});

const OVERLAY_CSS = `
	.rux-overlay-root {
		all: initial;
		position: fixed;
		inset: 0;
		z-index: 2147483647;
		display: grid;
		place-items: center;
		background: rgba(0, 0, 0, .45);
		font: 15px/1.4 system-ui, sans-serif;
		color: #222;
	}
	.rux-overlay-box {
		box-sizing: border-box;
		width: 90%;
		max-width: 420px;
		max-height: 90vh;
		overflow: auto;
		background: #fff;
		border-radius: 10px;
		padding: 20px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, .25);
	}
	.rux-overlay-title {
		margin: 0 0 14px;
		font-size: 17px;
		font-weight: 600;
		color: #222;
	}
	.rux-overlay-choice {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px;
		margin-bottom: 10px;
	}
	.rux-overlay-choice input[type="radio"] {
		margin-top: 3px;
		flex: none;
	}
	.rux-overlay-choice label {
		flex: 1;
		cursor: pointer;
	}
	.rux-overlay-custom-field {
		box-sizing: border-box;
		flex: 1 1 100%;
		width: calc(100% - 24px);
		margin-left: 24px;
		margin-top: 4px;
		padding: 7px 8px;
		border: 1px solid #ccc;
		border-radius: 4px;
		font: inherit;
	}
	.rux-overlay-help {
		margin: 14px 0 16px;
		font-size: 12.5px;
		color: #666;
	}
	.rux-overlay-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	.rux-overlay-actions button {
		font: inherit;
		padding: 8px 14px;
		border-radius: 5px;
		border: 1px solid transparent;
		cursor: pointer;
	}
	.rux-overlay-cancel {
		background: #f0f0f0;
		color: #333;
		border-color: #ddd;
	}
	.rux-overlay-cancel:hover {
		background: #e4e4e4;
	}
	.rux-overlay-submit {
		background: #4c7aaf;
		color: #fff;
	}
	.rux-overlay-submit:hover {
		background: #3c649a;
	}
`;

function showSiteRuleOverlay(host, usualPath) {
	overlayOpen = true;

	const previousActiveElement = document.activeElement;

	const overlayHost = document.createElement('div');
	document.documentElement.appendChild(overlayHost);
	const shadowRoot = overlayHost.attachShadow({ mode: 'closed' });

	if (typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
		try {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(OVERLAY_CSS);
			shadowRoot.adoptedStyleSheets = [sheet];
		} catch (error) {
			appendFallbackStyleTag(shadowRoot);
		}
	} else {
		appendFallbackStyleTag(shadowRoot);
	}

	const root = document.createElement('div');
	root.className = 'rux-overlay-root';

	const form = document.createElement('form');
	const box = document.createElement('div');
	box.className = 'rux-overlay-box';

	const title = document.createElement('h2');
	title.className = 'rux-overlay-title';
	title.textContent = chrome.i18n.getMessage('overlayTitle', [host]);
	box.appendChild(title);

	const groupName = 'rux-site-rule-choice';
	const showUsual = !!usualPath && usualPath !== '/wp-admin/';

	const defaultChoice = buildChoice(groupName, 'default', chrome.i18n.getMessage('overlayOptionDefault'));
	box.appendChild(defaultChoice.row);

	let usualChoice = null;
	if (showUsual) {
		usualChoice = buildChoice(groupName, 'usual', chrome.i18n.getMessage('overlayOptionUsual', [usualPath]));
		box.appendChild(usualChoice.row);
	}

	const customChoice = buildChoice(groupName, 'custom', chrome.i18n.getMessage('overlayOptionCustom'));
	const customField = document.createElement('input');
	customField.type = 'text';
	customField.className = 'rux-overlay-custom-field';
	customField.placeholder = chrome.i18n.getMessage('overlayCustomPlaceholder');
	customChoice.row.appendChild(customField);
	box.appendChild(customChoice.row);

	const noneChoice = buildChoice(groupName, 'none', chrome.i18n.getMessage('overlayOptionNone'));
	box.appendChild(noneChoice.row);

	customField.addEventListener('input', () => {
		customChoice.input.checked = true;
	});

	// Présélection : le choix habituel s'il existe, sinon /wp-admin/.
	const preselected = usualChoice || defaultChoice;
	preselected.input.checked = true;

	const help = document.createElement('p');
	help.className = 'rux-overlay-help';
	help.textContent = chrome.i18n.getMessage('overlayHelp');
	box.appendChild(help);

	const actions = document.createElement('div');
	actions.className = 'rux-overlay-actions';

	const cancelButton = document.createElement('button');
	cancelButton.type = 'button';
	cancelButton.className = 'rux-overlay-cancel';
	cancelButton.textContent = chrome.i18n.getMessage('overlayCancel');

	const submitButton = document.createElement('button');
	submitButton.type = 'submit';
	submitButton.className = 'rux-overlay-submit';
	submitButton.textContent = chrome.i18n.getMessage('overlaySubmit');

	actions.appendChild(cancelButton);
	actions.appendChild(submitButton);
	box.appendChild(actions);

	form.appendChild(box);
	root.appendChild(form);
	shadowRoot.appendChild(root);

	const closeOverlay = () => {
		overlayHost.remove();
		overlayOpen = false;
		if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
			previousActiveElement.focus();
		}
	};

	const cancel = () => {
		log('Overlay cancelled, nothing saved.');
		closeOverlay();
	};

	cancelButton.addEventListener('click', cancel);

	// Clic sur le voile (en dehors de la boîte) = annuler.
	root.addEventListener('click', (event) => {
		if (event.target === root) {
			cancel();
		}
	});

	// Échap = annuler. Le champ overlayOpen bloque déjà la détection du
	// double Shift, mais on empête aussi l'événement de fuiter vers la page.
	form.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			cancel();
		} else {
			event.stopPropagation();
		}
	});

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		const choice = form.querySelector(`input[name="${groupName}"]:checked`);
		const value = choice ? choice.value : 'default';

		let path;
		if (value === 'default') {
			path = '/wp-admin/';
		} else if (value === 'usual') {
			path = usualPath;
		} else if (value === 'none') {
			path = null;
		} else {
			const raw = customField.value.trim();
			if (!raw) {
				customField.focus();
				return;
			}
			if (/^https?:\/\//i.test(raw)) {
				try {
					path = new URL(raw).pathname;
				} catch (error) {
					path = raw;
				}
			} else {
				path = raw.startsWith('/') ? raw : `/${raw}`;
			}
		}

		chrome.runtime.sendMessage({
			action: 'saveSiteRule',
			host,
			path,
			redirect: path !== null
		});

		closeOverlay();
	});

	preselected.input.focus();
}

function buildChoice(groupName, value, labelText) {
	const row = document.createElement('div');
	row.className = 'rux-overlay-choice';

	const id = `rux-choice-${value}`;

	const input = document.createElement('input');
	input.type = 'radio';
	input.name = groupName;
	input.value = value;
	input.id = id;

	const label = document.createElement('label');
	label.setAttribute('for', id);
	label.textContent = labelText;

	row.appendChild(input);
	row.appendChild(label);

	return { row, input };
}

function appendFallbackStyleTag(shadowRoot) {
	const style = document.createElement('style');
	style.textContent = OVERLAY_CSS;
	shadowRoot.appendChild(style);
}
