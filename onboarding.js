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
	const permissionWarning = document.getElementById('onboarding-permission-warning');
	const permissionWarningText = document.getElementById('onboarding-permission-warning-text');
	const permissionRetryButton = document.getElementById('onboarding-permission-retry');

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
		permissionWarningText.innerText = chrome.i18n.getMessage('onboardingPermissionWarning');
		permissionRetryButton.innerText = chrome.i18n.getMessage('onboardingPermissionRetry');
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

		// Sur Firefox (MV3), <all_urls> n'est pas accordé d'office : sans cet
		// accord, content.js ne s'injecte pas et le double Shift ne fait
		// rien. Sur Chrome, host_permissions accorde déjà tout : l'appel
		// répond `true` sans dialogue. adminUrl est enregistrée dans tous
		// les cas, y compris en cas de refus.
		requestAllUrlsPermission().then((granted) => {
			chrome.storage.sync.set({ adminUrl: normalized }, () => {
				doneAddress.textContent = normalized;
				stepForm.hidden = true;
				stepDone.hidden = false;
				permissionWarning.hidden = granted;
			});
		});
	});

	permissionRetryButton.addEventListener('click', () => {
		requestAllUrlsPermission().then((granted) => {
			permissionWarning.hidden = granted;
		});
	});

	closeButton.addEventListener('click', () => {
		window.close();
	});

	// Demande l'accès à tous les sites. Forme promesse (API native `browser.*`
	// de Firefox) avec repli en callbacks (`chrome.*`, seule forme disponible
	// sur Chrome) ; toute exception est traitée comme un accord, pour ne
	// jamais bloquer Chrome où l'origine est de toute façon déjà accordée via
	// host_permissions.
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
