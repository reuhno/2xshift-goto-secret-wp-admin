chrome.runtime.onInstalled.addListener((details) => {
  // N'ouvrir la page de réglages qu'à la première installation :
  // onInstalled se déclenche aussi à chaque mise à jour de Chrome
  // et à chaque rechargement d'une extension non empaquetée.
  if (details.reason !== "install") {
    return;
  }
  console.log("Extension installed.");
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log("Received message:", message);

  if (message.action === "checkCookiesAndRedirect") {
	const { url } = message;

	if (sender.tab && sender.tab.id) {
	  try {
		const response = await sendMessageToTab(sender.tab.id, { action: 'checkIfWordPress' });

		if (response && response.isWordPress) {
		  console.log("Page is identified as WordPress.");
		  const data = await getStorageData(['adminUrl', 'exceptions']);
		  if (!data.adminUrl) {
			chrome.runtime.openOptionsPage();
			return;
		  }

		  const cookies = await getCookies(url);
		  const wpCookies = cookies.filter(cookie => cookie.name.startsWith("wordpress_logged_in"));

		  if (wpCookies.length === 0) {
			redirectToAdmin(url, data, sender.tab.id);
		  } else {
			const loginResponse = await sendMessageToTab(sender.tab.id, { action: 'verifyUserLoggedIn' });
			if (loginResponse && loginResponse.loggedIn) {
			  console.log("User is logged in.");
			} else {
			  redirectToAdmin(url, data, sender.tab.id);
			}
		  }
		} else {
		  console.log("Not a WordPress page, skipping cookie check.");
		}
	  } catch (error) {
		console.error("Error processing message:", error);
	  }
	} else {
	  console.error("Invalid tab context.");
	}
  }
});

function redirectToAdmin(url, data, tabId) {
  const adminUrl = data.adminUrl;
  const exceptions = data.exceptions || [];
  const exception = exceptions.find(e => url.includes(e.url));

  let newUrl = new URL(url);
  newUrl.pathname = exception ? exception.adminUrl : adminUrl;
  newUrl.searchParams.set('redirect_to', url);

  console.log("Redirecting to:", newUrl.toString());
  chrome.tabs.update(tabId, { url: newUrl.toString() });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
	chrome.tabs.sendMessage(tabId, message, (response) => {
	  if (chrome.runtime.lastError) {
		return reject(chrome.runtime.lastError);
	  }
	  resolve(response);
	});
  });
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
