// The two lines of the page that shows while the app loads, in the language the person last used (src/app/runtime/features/login-language.js keeps the
// one picked on the sign-in page, core-tail-lifecycle.js the one in use). Nothing changes when none is stored: the lines stay as the page has them.
// The app's own words are not loaded yet, so the lines are kept here. Keep the five languages in step with the ones of src/data/i18n.
(function () {
  try {
    var texts = {
      en: ['Getting your workspace ready', 'One moment'],
      fr: ['Préparation de votre espace de travail', 'Un instant'],
      ru: ['Подготовка рабочего пространства', 'Минутку'],
      es: ['Preparando tu espacio de trabajo', 'Un momento']
    };
    var language = localStorage.getItem('noureon_login_language') || localStorage.getItem('noureon_ui_language');
    var chosen = texts[language];
    if (!chosen) return;
    var title = document.getElementById('startup-skeleton-title');
    var label = document.querySelector('.startup-skeleton__message-label');
    if (title) title.textContent = chosen[0];
    if (label && label.firstChild) label.firstChild.nodeValue = chosen[1];
  } catch (error) {
    // The lines stay in Traditional Chinese.
  }
})();
