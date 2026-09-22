// 2xShift Goto secret wp-admin — content script
// Détection paresseuse : au chargement, on ne fait rien d'autre qu'écouter le
// clavier. Rien n'est lu dans le DOM tant qu'un double Shift n'a pas eu lieu.

let debugEnabled = null; // null = pas encore lu, sinon booléen mis en cache pour la page
let pageKind = null; // null = pas encore évalué, 'wp' ou 'other'

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

// Lit le drapeau debug une seule fois (au premier double Shift), puis le met en cache.
const readDebugFlagOnce = () => {
	if (debugEnabled !== null) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		try {
			chrome.storage.sync.get('debug', (data) => {
				debugEnabled = !!(data && data.debug);
				resolve();
			});
		} catch (error) {
			debugEnabled = false;
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

let shiftPressedTime = 0;

document.addEventListener('keydown', (event) => {
	// Sous Windows, maintenir Shift répète les keydown : ignorer les répétitions
	// pour ne pas déclencher la redirection en boucle.
	if (event.repeat) {
		return;
	}

	// Ignorer le double Shift si la cible est un champ de saisie.
	const target = event.target;
	const isFormField = target && ['input', 'textarea', 'select'].includes(target.tagName ? target.tagName.toLowerCase() : '');
	if (isFormField || (target && target.isContentEditable)) {
		return;
	}

	if (event.key !== 'Shift') {
		return;
	}

	const currentTime = new Date().getTime();

	if (currentTime - shiftPressedTime < 275) {
		readDebugFlagOnce().then(handleDoubleShift).catch((error) => {
			log('Error handling double Shift:', error);
		});
	}

	shiftPressedTime = currentTime;
});
