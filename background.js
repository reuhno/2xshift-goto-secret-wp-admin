// 2xShift Goto secret wp-admin — service worker
// Un seul aller-retour de messages côté détection : le content script décide
// (page WordPress, utilisateur pas visiblement connecté) et envoie
// checkCookiesAndRedirect ; ce script vérifie les cookies, résout la règle du
// site (stockée par hôte) et redirige, ou demande à l'utilisateur via
// l'overlay du content script (message askSiteRule / saveSiteRule). Le popup
// de l'icône (popup.js) passe par le même service worker pour la lecture/
// écriture des règles (chrome.storage direct) et pour la redirection
// immédiate (message goToAdmin, avec tabId/url explicites car sender.tab est
// absent depuis un popup). Le clic sur l'icône ouvre ce popup (default_popup
// dans le manifest) : plus de chrome.action.onClicked ici, incompatible avec
// un popup.

let debugEnabled = false;

const log = (...args) => {
	if (debugEnabled) {
		console.log('[2xShift]', ...args);
	}
};

chrome.runtime.onInstalled.addListener((details) => {
	migrateExceptionsIfNeeded().catch((error) => {
		log('Migration error (onInstalled):', error);
	});

	// N'ouvrir l'assistant de première installation qu'à la première
	// installation : onInstalled se déclenche aussi à chaque mise à jour de
	// Chrome et à chaque rechargement d'une extension non empaquetée.
	if (details.reason !== "install") {
		return;
	}
	chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
});

// Normalise un hôte : minuscules, préfixe "www." retiré.
function normalizeHost(url) {
	const host = new URL(url).hostname.toLowerCase();
	return host.startsWith('www.') ? host.slice(4) : host;
}

// Migre l'ancien tableau `exceptions` [{ url, adminUrl }] vers une clé
// `site:<hôte>` par entrée. Idempotente : n'écrase jamais une clé `site:`
// déjà présente, et supprime `exceptions` une fois traité.
async function migrateExceptionsIfNeeded() {
	const data = await getStorageData(['exceptions']);
	const exceptions = data.exceptions;

	if (!Array.isArray(exceptions) || exceptions.length === 0) {
		if (exceptions !== undefined) {
			await removeStorageData('exceptions');
		}
		return;
	}

	for (const entry of exceptions) {
		if (!entry || !entry.url) {
			continue;
		}
		let host;
		try {
			const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(entry.url) ? entry.url : `https://${entry.url}`;
			host = normalizeHost(candidate);
		} catch (error) {
			log('Migration: URL invalide ignorée:', entry.url);
			continue;
		}

		const key = `site:${host}`;
		const existing = await getStorageData([key]);
		if (existing[key] !== undefined) {
			continue;
		}
		await setStorageData({ [key]: { path: entry.adminUrl || null } });
	}

	await removeStorageData('exceptions');
}

// Extrait l'expiration (secondes Unix) que WordPress inscrit dans la valeur
// d'un cookie wordpress_logged_in* (format `login|expiration|token|hmac`,
// séparateur "|" encodé "%7C"). Retourne null si le format est inconnu
// (valeur non décodable, pas de 2ᵉ champ, ou 2ᵉ champ non entier positif).
function parseLoginCookieExpiration(value) {
	let decoded;
	try {
		decoded = decodeURIComponent(value);
	} catch (error) {
		return null;
	}
	const parts = decoded.split('|');
	if (parts.length < 2) {
		return null;
	}
	const expiration = parseInt(parts[1], 10);
	return Number.isInteger(expiration) && expiration > 0 ? expiration : null;
}

// Classe les cookies wordpress_logged_in* d'un site : 'none' s'il n'y en a
// aucun ; 'valid' si au moins un a une expiration illisible (format inconnu
// → comportement historique prudent : on le garde pour valide) ou non encore
// atteinte ; 'expired' sinon (tous périmés selon leur propre valeur — Chrome
// garde pourtant le cookie en stockage après cette date).
function classifyLoginCookies(cookies) {
	const loginCookies = cookies.filter(cookie => cookie.name.startsWith("wordpress_logged_in"));
	if (loginCookies.length === 0) {
		return 'none';
	}
	const hasValid = loginCookies.some((cookie) => {
		const expiration = parseLoginCookieExpiration(cookie.value);
		return expiration === null || expiration * 1000 > Date.now();
	});
	return hasValid ? 'valid' : 'expired';
}

async function handleCheckCookiesAndRedirect(message, sender) {
	const { url } = message;

	if (!sender.tab || !sender.tab.id) {
		log("Invalid tab context.");
		return;
	}

	try {
		await migrateExceptionsIfNeeded();

		const host = normalizeHost(url);
		const siteKey = `site:${host}`;
		const data = await getStorageData(['adminUrl', 'askOnNewSites', 'debug', 'redirectBack', siteKey]);
		debugEnabled = !!data.debug;

		const cookies = await getCookies(url);
		const cookieStatus = classifyLoginCookies(cookies);

		if (cookieStatus === 'valid') {
			log("User is logged in.");
			return;
		}
		if (cookieStatus === 'expired') {
			log("Expired login cookie ignored.");
		}

		const siteRule = data[siteKey];

		if (siteRule) {
			if (siteRule.path === null) {
				log("Site rule: no redirect for", host);
				return;
			}
			redirectToAdmin(url, siteRule.path, sender.tab.id, resolveRedirectBack(data, siteRule));
			return;
		}

		const askOnNewSites = data.askOnNewSites !== false;
		const adminUrl = data.adminUrl || '';

		if (!askOnNewSites && adminUrl) {
			redirectToAdmin(url, adminUrl, sender.tab.id, resolveRedirectBack(data, null));
			return;
		}

		chrome.tabs.sendMessage(sender.tab.id, {
			action: 'askSiteRule',
			host,
			defaultPath: adminUrl || '/wp-admin/',
			usualPath: adminUrl || null
		});
	} catch (error) {
		log("Error processing message:", error);
	}
}

// Redirection immédiate demandée depuis le popup (« Y aller maintenant »).
// Contrairement à saveSiteRule/checkCookiesAndRedirect, ce message ne vient
// pas d'un content script : sender.tab est absent, tabId et url sont donc
// transmis explicitement par popup.js. `redirectBack` est aussi transmis par
// popup.js : c'est lui qui affiche la surcharge (le <select> de la ligne) et
// connaît déjà le réglage global au moment du clic (lu à chaque refresh()),
// il calcule donc la valeur effective plutôt que de la faire recalculer ici
// à partir d'une règle qui ne reflète pas forcément le choix affiché (pas
// encore enregistré). Repli sur true si le message ne le transmet pas
// (compatibilité, comportement historique).
async function handleGoToAdmin(message) {
	const { path, tabId, url, redirectBack } = message;

	if (!tabId || !url) {
		log("goToAdmin sans tabId/url, ignoré.");
		return;
	}

	redirectToAdmin(url, path, tabId, typeof redirectBack === 'boolean' ? redirectBack : true);
}

async function handleSaveSiteRule(message, sender) {
	const { host, path, redirect } = message;

	if (!host) {
		log("saveSiteRule sans hôte, ignoré.");
		return;
	}

	await setStorageData({ [`site:${host}`]: { path } });
	log("Site rule saved for", host, "->", path);

	if (path !== null && redirect && sender.tab && sender.tab.id && sender.tab.url) {
		// La règle tout juste créée par l'overlay ne porte pas de surcharge
		// redirectBack (content.js ne le propose pas) : c'est le réglage
		// global qui s'applique.
		const data = await getStorageData(['redirectBack']);
		redirectToAdmin(sender.tab.url, path, sender.tab.id, resolveRedirectBack(data, null));
	}
}

// Interroge le content script de l'onglet pour le type de page et l'état
// visible de connexion. Forme callback (pas de Promise chrome.tabs.sendMessage
// native fiable côté MV3 pour lire lastError) : toute erreur (content script
// non injecté, onglet fermé, page ouverte avant le dernier rechargement de
// l'extension…) ou absence de réponse vaut pageKind 'unreachable'.
function getPageKindFromTab(tabId) {
	return new Promise((resolve) => {
		try {
			chrome.tabs.sendMessage(tabId, { action: 'getPageKind' }, (response) => {
				if (chrome.runtime.lastError || !response) {
					resolve({ pageKind: 'unreachable', visiblyLoggedIn: false });
					return;
				}
				resolve({
					pageKind: response.pageKind === 'wp' || response.pageKind === 'other' ? response.pageKind : 'unreachable',
					visiblyLoggedIn: !!response.visiblyLoggedIn
				});
			});
		} catch (error) {
			resolve({ pageKind: 'unreachable', visiblyLoggedIn: false });
		}
	});
}

// Diagnostic demandé par le popup : cookieStatus par lecture directe des
// cookies, pageKind/visiblyLoggedIn via le content script de l'onglet.
async function handleDiagnoseSite(message, sendResponse) {
	const { url, tabId } = message;
	try {
		const cookies = await getCookies(url);
		const cookieStatus = classifyLoginCookies(cookies);
		const { pageKind, visiblyLoggedIn } = await getPageKindFromTab(tabId);
		sendResponse({ cookieStatus, pageKind, visiblyLoggedIn });
	} catch (error) {
		log('Error diagnosing site:', error);
		sendResponse({ cookieStatus: 'none', pageKind: 'unreachable', visiblyLoggedIn: false });
	}
}

function removeCookieData(details) {
	return new Promise((resolve) => {
		chrome.cookies.remove(details, (removed) => {
			resolve(removed);
		});
	});
}

// Supprime les cookies de connexion (wordpress_logged_in* et
// wordpress_sec_*) d'un site, à la demande du popup (cas cookie périmé). Le
// `path` de chaque cookie est repris tel quel : wordpress_sec_* est posé sur
// /wp-admin ou /wp-content/plugins, pas sur /.
async function handleClearLoginCookies(message, sendResponse) {
	const { url } = message;
	try {
		const cookies = await getCookies(url);
		const toRemove = cookies.filter(cookie =>
			cookie.name.startsWith("wordpress_logged_in") || cookie.name.startsWith("wordpress_sec_")
		);
		const origin = new URL(url).origin;
		let removed = 0;
		for (const cookie of toRemove) {
			await removeCookieData({ url: origin + cookie.path, name: cookie.name });
			removed += 1;
		}
		log("Login cookies cleared:", removed);
		sendResponse({ removed });
	} catch (error) {
		log('Error clearing login cookies:', error);
		sendResponse({ removed: 0 });
	}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "checkCookiesAndRedirect") {
		handleCheckCookiesAndRedirect(message, sender);
	} else if (message.action === "saveSiteRule") {
		handleSaveSiteRule(message, sender).catch((error) => {
			log('Error saving site rule:', error);
		});
	} else if (message.action === "goToAdmin") {
		handleGoToAdmin(message).catch((error) => {
			log('Error handling goToAdmin:', error);
		});
	} else if (message.action === "diagnoseSite") {
		handleDiagnoseSite(message, sendResponse);
		return true;
	} else if (message.action === "clearLoginCookies") {
		handleClearLoginCookies(message, sendResponse);
		return true;
	}
});

// Rend la valeur effective de redirectBack : la surcharge de la règle de
// site (rule.redirectBack) prime si c'est un booléen, sinon le réglage
// global (stored.redirectBack) si c'est un booléen, sinon true (comportement
// historique : redirect_to toujours ajouté). `rule` peut être null/undefined
// (aucune règle de site).
function resolveRedirectBack(stored, rule) {
	if (rule && typeof rule.redirectBack === 'boolean') {
		return rule.redirectBack;
	}
	if (stored && typeof stored.redirectBack === 'boolean') {
		return stored.redirectBack;
	}
	return true;
}

function redirectToAdmin(url, path, tabId, redirectBack) {
	// `path` peut être un chemin ("/x/") ou une URL complète : dans ce cas on
	// ne garde que son pathname.
	let pathname = path;
	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(path)) {
		try {
			pathname = new URL(path).pathname;
		} catch (error) {
			pathname = path;
		}
	}

	const newUrl = new URL(url);
	newUrl.pathname = pathname;
	if (redirectBack) {
		newUrl.searchParams.set('redirect_to', url);
	}

	log("Redirecting to:", newUrl.toString());
	chrome.tabs.update(tabId, { url: newUrl.toString() });
}

function getStorageData(keys) {
	return new Promise((resolve) => {
		chrome.storage.sync.get(keys, (data) => {
			resolve(data);
		});
	});
}

function setStorageData(items) {
	return new Promise((resolve) => {
		chrome.storage.sync.set(items, () => {
			resolve();
		});
	});
}

function removeStorageData(keys) {
	return new Promise((resolve) => {
		chrome.storage.sync.remove(keys, () => {
			resolve();
		});
	});
}

function getCookies(url) {
	return new Promise((resolve) => {
		chrome.cookies.getAll({ url }, (cookies) => {
			resolve(cookies);
		});
	});
}
