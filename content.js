// Fonction pour vérifier si le texte est présent dans les balises <head>, <script> ou <style>
const containsWordPressSignatures = (element) => {
  const wpSignatures = ['wp-json', 'admin-ajax.php', 'wp-content/plugins', 'wp-includes/js/dist'];
  for (let signature of wpSignatures) {
	if (element.innerHTML.includes(signature)) {
	  return true;
	}
  }
  return false;
};

// Vérifier si des traces de WordPress sont présentes dans le code source
const isWordPressPage = () => {
  const headContent = document.head.innerHTML;
  const scripts = document.getElementsByTagName('script');
  const styles = document.getElementsByTagName('style');

  // Vérifier les signatures WordPress dans <head>
  if (containsWordPressSignatures(document.head)) {
	return true;
  }

  // Vérifier les signatures WordPress dans <script>
  for (let script of scripts) {
	if (containsWordPressSignatures(script)) {
	  return true;
	}
  }

  // Vérifier les signatures WordPress dans <style>
  for (let style of styles) {
	if (containsWordPressSignatures(style)) {
	  return true;
	}
  }

  // Vérifier la meta tag "generator" pour WordPress
  if (document.querySelector('meta[name="generator"][content*="WordPress"]') !== null) {
	return true;
  }

  return false;
};

// Vérifier si l'utilisateur est connecté en cherchant des éléments spécifiques aux utilisateurs connectés
const isLoggedInUser = () => {
  return document.querySelector('#wpadminbar') !== null ||
		 document.body.innerHTML.includes('plugins/commandui');
};

// Fonction pour initialiser l'écouteur keydown
const initializeKeydownListener = () => {
  let shiftPressedTime = 0;

  document.addEventListener("keydown", (event) => {
	if (event.key === "Shift") {
	  const currentTime = new Date().getTime();

	  if (currentTime - shiftPressedTime < 275) {
		chrome.runtime.sendMessage({
		  action: "checkCookiesAndRedirect",
		  url: window.location.href
		});
	  }

	  shiftPressedTime = currentTime;
	}
  });
};

// Vérifier si la page est une page WordPress et si l'utilisateur est connecté
const checkPageAndUserStatus = () => {
  if (isWordPressPage()) {
	console.log("This is a WordPress page.");
	if (!isLoggedInUser()) {
	  console.log("User is not logged in. Initializing keydown listener.");
	  initializeKeydownListener();
	} else {
	  console.log("User is logged in. Keydown listener not initialized.");
	}
  } else {
	console.log("This is not a WordPress page. Keydown listener not initialized.");
  }
};

// Initialiser la vérification de la page et de l'utilisateur
checkPageAndUserStatus();

// Envoyer un message au script de fond avec le résultat
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkIfWordPress') {
	const isWordPress = isWordPressPage();
	console.log("Is WordPress page:", isWordPress);
	sendResponse({ isWordPress });
  } else if (request.action === 'verifyUserLoggedIn') {
	const loggedIn = isLoggedInUser();
	console.log("User is logged in:", loggedIn);
	sendResponse({ loggedIn });
  }
});
