// 2xShift Goto secret wp-admin — assistant de première installation
// Ouvert par background.js (onInstalled, reason === "install") ou relancé
// depuis la page de réglages (lien « Relancer l'assistant »). Un seul écran :
// définir la préférence d'URL de connexion (adminUrl), qui devient la
// proposition par défaut de l'overlay au cas par cas sur chaque site.

document.addEventListener('DOMContentLoaded', () => {

	const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage;

	const stepForm = document.getElementById('onboarding-step-form');
	const stepDone = document.getElementById('onboarding-step-done');
	const form = document.getElementById('onboarding-form');
	const pathInput = document.getElementById('onboarding-path');
	const advancedLink = document.getElementById('onboarding-advanced-link');
	const closeButton = document.getElementById('onboarding-close');
	const doneAddress = document.getElementById('onboarding-done-address');

	if (hasChrome) {
		document.documentElement.lang = chrome.i18n.getUILanguage();

		document.getElementById('onboarding-title').innerText = chrome.i18n.getMessage('onboardingTitle');
		document.getElementById('onboarding-intro').innerText = chrome.i18n.getMessage('onboardingIntro');
		document.getElementById('onboarding-field-label').innerText = chrome.i18n.getMessage('onboardingFieldLabel');
		document.getElementById('onboarding-field-help').innerText = chrome.i18n.getMessage('onboardingFieldHelp');
		document.getElementById('onboarding-infobox').innerText = chrome.i18n.getMessage('onboardingInfoBox');
		document.getElementById('onboarding-submit').innerText = chrome.i18n.getMessage('onboardingSubmit');
		advancedLink.innerText = chrome.i18n.getMessage('onboardingAdvancedSettingsLink');
		document.getElementById('onboarding-done-title').innerText = chrome.i18n.getMessage('onboardingDoneTitle');
		document.getElementById('onboarding-done-text').innerText = chrome.i18n.getMessage('onboardingDoneText');
		closeButton.innerText = chrome.i18n.getMessage('onboardingCloseTab');
	}

	// Hors extension (aperçu navigateur) : pas d'API chrome.* disponible, on
	// laisse le balisage de secours (état représentatif, libellés en dur en
	// français) et on n'attache aucun comportement de plus.
	if (!hasChrome) {
		return;
	}

	// Pré-remplit avec la valeur existante d'adminUrl (assistant relancé), ou
	// /wp-admin/ à défaut.
	chrome.storage.sync.get(['adminUrl'], (data) => {
		pathInput.value = data.adminUrl || '/wp-admin/';
		pathInput.focus();
	});

	advancedLink.addEventListener('click', (event) => {
		event.preventDefault();
		chrome.runtime.openOptionsPage();
	});

	form.addEventListener('submit', (event) => {
		event.preventDefault();

		const normalized = normalizePath(pathInput.value);

		chrome.storage.sync.set({ adminUrl: normalized }, () => {
			doneAddress.textContent = normalized;
			stepForm.hidden = true;
			stepDone.hidden = false;
		});
	});

	closeButton.addEventListener('click', () => {
		window.close();
	});

	// Trim, garantit un "/" initial, réduit une URL complète à son pathname,
	// vide -> /wp-admin/.
	function normalizePath(raw) {
		const trimmed = (raw || '').trim();
		if (!trimmed) {
			return '/wp-admin/';
		}
		if (/^https?:\/\//i.test(trimmed)) {
			try {
				const pathname = new URL(trimmed).pathname;
				return ensureLeadingSlash(pathname || '/wp-admin/');
			} catch (error) {
				return ensureLeadingSlash(trimmed);
			}
		}
		return ensureLeadingSlash(trimmed);
	}

	function ensureLeadingSlash(value) {
		return value.startsWith('/') ? value : `/${value}`;
	}
});
