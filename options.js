document.addEventListener('DOMContentLoaded', () => {

	document.documentElement.lang = chrome.i18n.getUILanguage();

	document.getElementById('welcome-text').innerText = chrome.i18n.getMessage("welcomeMessage");
	document.getElementById('text-exception').innerText = chrome.i18n.getMessage("textException");
	document.getElementById('admin-url-label').innerText = chrome.i18n.getMessage("adminUrlLabel");
	document.getElementById('add-exception').innerText = chrome.i18n.getMessage("addExceptionButton");
	document.getElementById('save-button').innerText = chrome.i18n.getMessage("saveButton");
	document.getElementById('explainations').innerText = chrome.i18n.getMessage("explainations");
	document.getElementById('helperException').innerText = chrome.i18n.getMessage("helperException");
	document.getElementById('debug-label').innerText = chrome.i18n.getMessage("debugLabel");
	
	
	
	
	
	
  const form = document.getElementById('options-form');
  const adminUrlInput = document.getElementById('admin-url');
  const debugCheckbox = document.getElementById('debug');
  const exceptionsList = document.getElementById('exceptions-list');
  const addExceptionButton = document.getElementById('add-exception');
  const exceptionTemplate = document.getElementById('exception-template').content;

  // Load saved options
  chrome.storage.sync.get(['adminUrl', 'exceptions', 'debug'], (data) => {
	adminUrlInput.value = data.adminUrl || '';
	debugCheckbox.checked = !!data.debug;
	(data.exceptions || []).forEach(exception => {
	  addException(exception.url, exception.adminUrl);
	});
  });

  // Add exception
  addExceptionButton.addEventListener('click', () => {
	addException();
  });

  function addException(url = '', adminUrl = '') {
	const clone = document.importNode(exceptionTemplate, true);
	const exceptionElement = clone.querySelector('.exception');
	const exceptionUrlInput = clone.querySelector('.exception-url');
	const exceptionAdminUrlInput = clone.querySelector('.exception-admin-url');
	const removeButton = clone.querySelector('.remove-exception');

	exceptionUrlInput.value = url;
	exceptionAdminUrlInput.value = adminUrl;

	removeButton.addEventListener('click', () => {
	  exceptionElement.remove();
	});

	exceptionsList.appendChild(clone);
  }

  // Save options
  form.addEventListener('submit', (event) => {
	event.preventDefault();

	const adminUrl = adminUrlInput.value;
	const debug = !!debugCheckbox.checked;
	const exceptions = Array.from(exceptionsList.querySelectorAll('.exception')).map(exception => ({
	  url: exception.querySelector('.exception-url').value,
	  adminUrl: exception.querySelector('.exception-admin-url').value
	}));

	chrome.storage.sync.set({ adminUrl, exceptions, debug }, () => {
	  const saveStatus = document.getElementById('save-status');
	  saveStatus.textContent = chrome.i18n.getMessage('savedMessage');
	  setTimeout(() => {
		saveStatus.textContent = '';
	  }, 2000);
	});
  });
});


