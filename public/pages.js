// The language of the public pages (terms, privacy, updates). Every language is in the page; this shows one of them: the one the reader
// chose here before (kept in this site's own storage), else the one of the browser, else Traditional Chinese.
(function () {
  var LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
  var KEY = 'noureon:pages-lang';

  function fromBrowser() {
    var wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (var i = 0; i < wanted.length; i += 1) {
      var tag = String(wanted[i] || '').toLowerCase();
      if (tag.indexOf('zh') === 0) return 'zh-TW';
      for (var j = 1; j < LANGUAGES.length; j += 1) if (tag.indexOf(LANGUAGES[j]) === 0) return LANGUAGES[j];
    }
    return 'zh-TW';
  }

  function remembered() {
    try {
      var value = window.localStorage.getItem(KEY);
      return LANGUAGES.indexOf(value) >= 0 ? value : '';
    } catch (error) { return ''; }
  }

  function show(lang) {
    var nodes = document.querySelectorAll('[data-lang]');
    for (var i = 0; i < nodes.length; i += 1) nodes[i].hidden = nodes[i].getAttribute('data-lang') !== lang;
    document.documentElement.lang = lang;
    var top = document.querySelector('.pg-top[data-lang="' + lang + '"]');
    if (top) {
      document.title = top.getAttribute('data-title') || document.title;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', top.getAttribute('data-description') || '');
    }
    var select = document.getElementById('pg-lang');
    if (select) select.value = lang;
  }

  show(remembered() || fromBrowser());

  var select = document.getElementById('pg-lang');
  if (select) {
    select.addEventListener('change', function () {
      var lang = select.value;
      if (LANGUAGES.indexOf(lang) < 0) return;
      show(lang);
      try { window.localStorage.setItem(KEY, lang); } catch (error) { /* the choice is only not remembered */ }
    });
  }
}());
