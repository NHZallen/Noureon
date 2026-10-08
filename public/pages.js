// The language of the public pages (terms, privacy, updates), and the month that is lit in the list at the side of the update notes. Every language is in the page; this shows one of them: the one the reader
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
    var top = document.querySelector('.pg-go[data-lang="' + lang + '"]');
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

  // The index at the side of the update notes follows the page: the version that is at the top of the window is lit, and so is its month, which is the one
  // that is open (the other months are folded).
  var links = document.querySelectorAll('.pg-toc a');
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    var versions = [];
    for (var k = 0; k < links.length; k += 1) {
      var id = links[k].getAttribute('href').slice(1);
      byId[id] = links[k];
      if (id.charAt(0) === 'v') versions.push(id);
    }
    var light = function (current) {
      var link = byId[current];
      var month = link.getAttribute('data-month');
      for (var key in byId) if (Object.prototype.hasOwnProperty.call(byId, key)) byId[key].className = '';
      link.className = 'is-active';
      if (month && byId[month]) byId[month].className = 'is-active';
      var folds = document.querySelectorAll('.pg-toc details');
      for (var f = 0; f < folds.length; f += 1) folds[f].open = false;
      var fold = link.closest ? link.closest('details') : null;
      if (fold) fold.open = true;
    };
    var seen = {};
    var observer = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e += 1) seen[entries[e].target.id] = entries[e].isIntersecting;
      // The versions are in the page from the newest down; of those that touch the top of the window, the last is the one being read.
      var current = '';
      for (var v = 0; v < versions.length; v += 1) if (seen[versions[v]]) current = versions[v];
      if (current) light(current);
    }, { rootMargin: '0px 0px -85% 0px' });
    for (var m = 0; m < versions.length; m += 1) { var article = document.getElementById(versions[m]); if (article) observer.observe(article); }
  }
}());
