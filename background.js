// 2xShift Goto secret wp-admin — service worker
// Un seul aller-retour de messages : le content script décide (page WordPress,
// utilisateur pas visiblement connecté) et envoie checkCookiesAndRedirect ;
// ce script se contente de vérifier les cookies et de rediriger.

let debugEnabled = false;

const log = (...args) => {
	if (debugEnabled) {
		console.log('[2xShift]', ...args);
	}
};

chrome.runtime.onInstalled.addListener((details) => {
	// N'ouvrir la page de réglages qu'à la première installation :
	// onInstalled se déclenche aussi à chaque mise à jour de Chrome
	// et à chaque rechargement d'une extension non empaquetée.
	if (details.reason !== "install") {
		return;
	}
	chrome.runtime.openOptionsPage();
});

async function handleCheckCookiesAndRedirect(message, sender) {
	const { url } = message;

	if (!sender.tab || !sender.tab.id) {
		log("Invalid tab context.");
		return;
	}

	try {
		const data = await getStorageData(['adminUrl', 'exceptions', 'debug']);
		debugEnabled = !!data.debug;

		if (!data.adminUrl) {
			chrome.runtime.openOptionsPage();
			return;
		}

		const cookies = await getCookies(url);
		const wpCookies = cookies.filter(cookie => cookie.name.startsWith("wordpress_logged_in"));

		if (wpCookies.length === 0) {
			redirectToAdmin(url, data, sender.tab.id);
		} else {
			log("User is logged in.");
		}
	} catch (error) {
		log("Error processing message:", error);
	}
}

chrome.runtime.onMessage.addListener((message, sender) => {
	if (message.action === "checkCookiesAndRedirect") {
		handleCheckCookiesAndRedirect(message, sender);
	}
});

function redirectToAdmin(url, data, tabId) {
	const adminUrl = data.adminUrl;
	const exceptions = data.exceptions || [];
	const exception = exceptions.find(e => url.includes(e.url));

	let newUrl = new URL(url);
	newUrl.pathname = exception ? exception.adminUrl : adminUrl;
	newUrl.searchParams.set('redirect_to', url);

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

function getCookies(url) {
	return new Promise((resolve) => {
		chrome.cookies.getAll({ url }, (cookies) => {
			resolve(cookies);
		});
	});
}
