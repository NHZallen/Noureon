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

  // ---- the update notes: the index, the bar of the index, the way back to the top ----

  var hasClass = function (node, name) { return !!node && (' ' + node.className + ' ').indexOf(' ' + name + ' ') >= 0; };
  var setClass = function (node, name, on) {
    if (!node) return;
    var classes = String(node.className || '').split(/\s+/).filter(function (item) { return item && item !== name; });
    if (on) classes.push(name);
    node.className = classes.join(' ');
  };
  var all = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };

  // A fold of the index (a year or a month) opens or shuts; the button of the fold says so.
  var setOpen = function (fold, open) {
    setClass(fold, 'is-open', open);
    var button = fold.querySelector('.pg-iy-h') || fold.querySelector('.pg-im-t');
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  // Only one month is open at a time, and the year that holds it: the index stays short however long the notes get.
  var openOnly = function (root, month) {
    var open = null;
    all('.pg-im', root).forEach(function (fold) {
      var link = fold.querySelector('.pg-im-a');
      var here = !!link && link.getAttribute('href') === '#' + month;
      if (here) open = fold;
      setOpen(fold, here);
    });
    all('.pg-iy', root).forEach(function (fold) {
      var holds = false;
      var months = all('.pg-im', fold);
      for (var m = 0; m < months.length; m += 1) if (months[m] === open) holds = true;
      setOpen(fold, holds);
    });
  };

  var label = document.getElementById('pg-cur');
  var firstMonth = label ? label.textContent : '';
  var shownMonth = firstMonth;
  var setLabel = function (text) {
    if (!label || !text || label.textContent === text) return;
    label.textContent = text;
    setClass(label, 'is-swap', false);
    if (label.offsetWidth !== undefined) void label.offsetWidth; // so that the move starts again
    setClass(label, 'is-swap', true);
  };

  // The version at the top of the window is lit in the index, and so is its month; when the month changes, that month is the one that is open.
  var lastMonth = '';
  var light = function (id) {
    var link = document.querySelector('.pg-toc a[href="#' + id + '"]');
    var month = link ? link.getAttribute('data-month') : '';
    all('.pg-idx a.is-active').forEach(function (node) { setClass(node, 'is-active', false); });
    all('.pg-idx a[href="#' + id + '"]').forEach(function (node) { setClass(node, 'is-active', true); });
    if (month) all('.pg-idx a.pg-im-a[href="#' + month + '"]').forEach(function (node) { setClass(node, 'is-active', true); });
    if (month && month !== lastMonth) {
      lastMonth = month;
      all('.pg-idx').forEach(function (root) { openOnly(root, month); });
    }
    if (month) { shownMonth = month.slice(1); setLabel(shownMonth); }
  };

  var versions = all('.pg-toc .pg-iv a').map(function (node) { return node.getAttribute('href').slice(1); });
  if (versions.length && 'IntersectionObserver' in window) {
    var seen = {};
    var observer = new IntersectionObserver(function (entries) {
      for (var e = 0; e < entries.length; e += 1) seen[entries[e].target.id] = entries[e].isIntersecting;
      // The versions are in the page from the newest down; of those that touch the top of the window, the last is the one being read.
      var current = '';
      for (var v = 0; v < versions.length; v += 1) if (seen[versions[v]]) current = versions[v];
      if (current) light(current);
    }, { rootMargin: '0px 0px -85% 0px' });
    versions.forEach(function (id) { var article = document.getElementById(id); if (article) observer.observe(article); });
  }

  var up = document.querySelector('.pg-up');
  var stick = document.querySelector('.pg-stick');
  var sheet = document.getElementById('pg-sheet');
  var indexButton = document.querySelector('.pg-ix-btn');
  var tree = document.querySelector('.pg-toc .pg-idx');
  var closeSheet = function () {
    if (!sheet || !hasClass(sheet, 'is-open')) return;
    setClass(sheet, 'is-open', false);
    if (indexButton) indexButton.setAttribute('aria-expanded', 'false');
  };
  var openSheet = function () {
    if (!sheet) return;
    // The sheet opens at the month that is being read.
    all('.pg-idx', sheet).forEach(function (root) { openOnly(root, lastMonth || ('m' + firstMonth)); });
    setClass(sheet, 'is-open', true);
    if (indexButton) indexButton.setAttribute('aria-expanded', 'true');
  };
  if (sheet && tree) sheet.appendChild(tree.cloneNode(true));

  // One listener for the folds and the links of every copy of the index (the side and the sheet), for the button and for a tap elsewhere.
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var yearButton = target.closest('.pg-iy-h');
    if (yearButton) { var year = yearButton.parentNode; setOpen(year, !hasClass(year, 'is-open')); return; }
    var monthButton = target.closest('.pg-im-t');
    if (monthButton) { var month = monthButton.closest('.pg-im'); setOpen(month, !hasClass(month, 'is-open')); return; }
    if (target.closest('.pg-ix-btn')) { if (hasClass(sheet, 'is-open')) closeSheet(); else openSheet(); return; }
    if (target.closest('#pg-sheet')) { if (target.closest('a')) closeSheet(); return; }
    closeSheet();
  });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeSheet(); });
  if (up) up.addEventListener('click', function () { window.scrollTo({ top: 0 }); });

  // The way back to the top comes in once the page has been scrolled; the bar of the index gets a shadow once it sticks to the top of the window.
  var update = function () {
    var y = window.pageYOffset || (document.documentElement && document.documentElement.scrollTop) || 0;
    if (up) setClass(up, 'is-on', y > 480);
    if (stick) {
      var stuck = stick.getBoundingClientRect().top <= 0.5;
      setClass(stick, 'is-stuck', stuck);
      if (!stuck) setLabel(firstMonth);
    }
  };
  if (up || stick) {
    var waiting = false;
    window.addEventListener('scroll', function () {
      if (waiting) return;
      waiting = true;
      var frame = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
      frame(function () { waiting = false; update(); });
    }, { passive: true });
    update();
  }
}());
