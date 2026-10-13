// The two lines of the page that shows while the app loads, in the language the person last used (src/app/runtime/features/login-language.js keeps the
// one picked on the sign-in page, core-tail-lifecycle.js the one in use), and on a first visit in the language of the browser or the system (the same
// rule as detectSystemLanguage in login-language.js: any Chinese stays as the page has it). Nothing changes when none of the five fits: the lines stay as the page has them.
// The app's own words are not loaded yet, so the lines are kept here. Keep the five languages in step with the ones of src/data/i18n.
(function () {
  // Nobody signed in before (a first visit, or someone who signed out) has no workspace to get ready: the lines are not shown. They are for the ones who come back
  // to a workspace: the app writes `noureon_workspace_hint` once it knows who is there (src/app/bootstrap/startup-hint.js); a session of the cloud account that
  // is still kept in the browser (Supabase's `sb-…-auth-token`) counts too, for the first visit after this was added.
  try {
    var returning = localStorage.getItem('noureon_workspace_hint') === '1';
    for (var at = 0; !returning && at < localStorage.length; at += 1) returning = /^sb-.+-auth-token$/.test(localStorage.key(at) || '');
    var cover = document.querySelector('[data-startup-skeleton]');
    if (!returning && cover) cover.className += ' startup-skeleton--quiet';
  } catch (error) {
    // The lines are shown.
  }
})();
(function () {
  try {
    var texts = {
      en: ['Getting your workspace ready', 'One moment'],
      fr: ['Préparation de votre espace de travail', 'Un instant'],
      ru: ['Подготовка рабочего пространства', 'Минутку'],
      es: ['Preparando tu espacio de trabajo', 'Un momento']
    };
    var language = localStorage.getItem('noureon_login_language') || localStorage.getItem('noureon_ui_language');
    if (!texts[language] && language !== 'zh-TW') {
      language = '';
      var wanted = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < wanted.length && !language; i += 1) {
        var tag = String(wanted[i] || '').toLowerCase();
        if (tag.indexOf('zh') === 0) break;
        for (var name in texts) if (tag === name || tag.indexOf(name + '-') === 0) { language = name; break; }
      }
    }
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
