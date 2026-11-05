// The screen inspector (loaded only when the address has ?scrolldebug=1: public/startup-language.js). For a page that jumps while it is scrolled: it watches the page at every frame and, when the scroll moves further than a finger can in one
// frame (300 px), or the height of the page changes by itself, it writes a report: the last second of the scroll, the height of the page and of the seen area frame by frame, and what happened in that second (touches, resizes of the seen area, scroll
// events, changes of the page's markup, pictures that finished loading, shifts of layout, the size of the security check). It writes nothing anywhere and sends nothing. A small box at the foot of the screen shows how many reports there are;
// "複製 / Copy" puts everything in the clipboard as text (or shows it in a box to select, when the browser refuses), to be pasted in the report to the developer. `window.__scrollDebug.text()` gives the same text.
(function () {
  var JUMP_PX = 300;
  var HEIGHT_PX = 40;
  var KEEP_SAMPLES = 90;
  var KEEP_EVENTS = 160;
  var MAX_REPORTS = 8;
  var WINDOW_MS = 1200;

  var root = document.documentElement;
  var started = performance.now();
  var samples = [];
  var events = [];
  var reports = [];
  var counters = { frames: 0, touches: 0, scrolls: 0, resizes: 0, vvResizes: 0, vvScrolls: 0, shifts: 0, mutations: 0 };
  var prev = null;
  var ui = null;
  var lastTouch = null;

  var now = function () { return performance.now() - started; };
  var r = function (n) { return Math.round(n); };
  var name = function (node) {
    if (!node || !node.nodeName) return '?';
    var id = node.id ? '#' + node.id : '';
    var cls = node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return node.nodeName.toLowerCase() + id + cls;
  };
  var inOwnBox = function (node) { return ui && ui.box && node && ui.box.contains && ui.box.contains(node); };
  var note = function (type, detail) {
    events.push({ t: now(), type: type, detail: detail || '' });
    if (events.length > KEEP_EVENTS) events.shift();
  };
  var vv = function () { return window.visualViewport || null; };
  var snapshot = function () {
    var v = vv();
    return { t: now(), y: window.scrollY, inner: window.innerHeight, vvH: v ? v.height : 0, vvTop: v ? v.offsetTop : 0, doc: root.scrollHeight };
  };

  // ---- what is watched
  var onTouch = function (event) {
    var touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0]);
    counters.touches += 1;
    lastTouch = touch ? { x: r(touch.clientX), y: r(touch.clientY), target: name(event.target) } : lastTouch;
    if (event.type !== 'touchmove') note(event.type, lastTouch ? lastTouch.x + ',' + lastTouch.y + ' on ' + lastTouch.target : '');
  };
  ['touchstart', 'touchend', 'touchcancel', 'touchmove'].forEach(function (type) { document.addEventListener(type, onTouch, { capture: true, passive: true }); });
  window.addEventListener('scroll', function () { counters.scrolls += 1; }, { passive: true });
  window.addEventListener('resize', function () { counters.resizes += 1; note('resize', window.innerWidth + 'x' + window.innerHeight); });
  window.addEventListener('orientationchange', function () { note('orientationchange'); });
  document.addEventListener('visibilitychange', function () { note('visibility', document.visibilityState); });
  document.addEventListener('focusin', function (event) { note('focusin', name(event.target)); }, true);
  document.addEventListener('load', function (event) {
    var node = event.target;
    if (node && node.nodeName === 'IMG') note('img-load', name(node) + ' h=' + r(node.getBoundingClientRect().height) + ' ' + String(node.currentSrc || node.src).slice(-28));
  }, true);
  var v0 = vv();
  if (v0) {
    v0.addEventListener('resize', function () { counters.vvResizes += 1; note('vv-resize', 'h=' + r(v0.height) + ' top=' + r(v0.offsetTop) + ' scale=' + v0.scale); });
    v0.addEventListener('scroll', function () { counters.vvScrolls += 1; });
  }
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.value < 0.005) return;
        counters.shifts += 1;
        note('layout-shift', entry.value.toFixed(3) + ' ' + (entry.sources || []).map(function (s) { return name(s.node) + ' ' + r(s.previousRect.y) + '->' + r(s.currentRect.y); }).slice(0, 3).join(', '));
      });
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (error) { /* this browser does not report them */ }
  try {
    var pending = { count: 0, targets: [] };
    var flushTimer = 0;
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (inOwnBox(m.target)) return;
        counters.mutations += 1;
        pending.count += 1;
        if (m.type === 'childList' || m.attributeName === 'style' || m.attributeName === 'hidden' || m.attributeName === 'src') {
          var label = m.type + ':' + (m.attributeName || '') + ' ' + name(m.target);
          if (pending.targets.indexOf(label) < 0 && pending.targets.length < 4) pending.targets.push(label);
        }
      });
      if (!flushTimer) flushTimer = setTimeout(function () {
        flushTimer = 0;
        if (pending.targets.length) note('markup', pending.count + ' changes: ' + pending.targets.join(' | '));
        pending = { count: 0, targets: [] };
      }, 50);
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'hidden', 'src', 'class'] });
  } catch (error) { /* no observer */ }
  try {
    var widgetWatch = new ResizeObserver(function (entries) {
      entries.forEach(function (entry) { note('size', name(entry.target) + ' ' + r(entry.contentRect.width) + 'x' + r(entry.contentRect.height)); });
    });
    var watched = function () {
      ['.turnstile-widget', '.hm-login', '.hm-footer', '.hm-nav'].forEach(function (selector) {
        var node = document.querySelector(selector);
        if (node && !node.__sizeWatched) { node.__sizeWatched = true; widgetWatch.observe(node); }
      });
    };
    watched();
    setInterval(watched, 1500);
  } catch (error) { /* no observer */ }

  // ---- the frame by frame look
  var describeAt = function () {
    var cx = r(window.innerWidth / 2);
    var cy = r(window.innerHeight / 2);
    var el = document.elementFromPoint ? document.elementFromPoint(cx, cy) : null;
    var nav = document.querySelector('.hm-nav');
    return 'centre=' + name(el) + ' navTop=' + (nav ? r(nav.getBoundingClientRect().top) : '-');
  };
  var report = function (kind, from, to) {
    if (reports.length >= MAX_REPORTS) return;
    var cutoff = now() - WINDOW_MS;
    var widget = document.querySelector('.turnstile-widget');
    reports.push({
      kind: kind, at: now(), from: from, to: to, where: describeAt(), touch: lastTouch,
      widget: widget ? r(widget.getBoundingClientRect().height) : '-',
      samples: samples.slice(-40).map(function (s) { return [r(s.t), r(s.y), s.inner, r(s.vvH), r(s.vvTop), s.doc].join(' '); }),
      events: events.filter(function (e) { return e.t >= cutoff; }).map(function (e) { return r(e.t) + ' ' + e.type + ' ' + e.detail; })
    });
    draw();
  };
  var frame = function () {
    counters.frames += 1;
    var s = snapshot();
    samples.push(s);
    if (samples.length > KEEP_SAMPLES) samples.shift();
    if (prev) {
      var dy = s.y - prev.y;
      var dh = s.doc - prev.doc;
      if (Math.abs(dy) > JUMP_PX) report('scroll jump ' + r(dy) + ' px in one frame', r(prev.y), r(s.y));
      else if (Math.abs(dh) > HEIGHT_PX && Math.abs(dy) < 5) report('page height changed ' + r(dh) + ' px', r(prev.doc), r(s.doc));
    }
    prev = s;
    window.requestAnimationFrame(frame);
  };

  // ---- the text
  var environment = function () {
    var v = vv();
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;top:env(safe-area-inset-top,0px);left:env(safe-area-inset-left,0px);bottom:0';
    document.body.appendChild(probe);
    var inset = r(probe.getBoundingClientRect().top);
    probe.remove();
    var cs = function (el) { return el ? getComputedStyle(el) : { overscrollBehaviorY: '?', overflowY: '?' }; };
    return [
      'Noureon ' + (window.PRODUCT_VERSION || '?') + ' | ' + location.pathname + ' | ' + new Date().toISOString(),
      'UA: ' + navigator.userAgent,
      'screen ' + screen.width + 'x' + screen.height + ' dpr=' + window.devicePixelRatio + ' inner=' + window.innerWidth + 'x' + window.innerHeight + ' client=' + root.clientWidth + 'x' + root.clientHeight
        + (v ? ' vv=' + r(v.width) + 'x' + r(v.height) + '@' + r(v.offsetTop) + ' scale=' + v.scale : ' (no visualViewport)'),
      'standalone=' + (window.navigator.standalone === true) + ' safe-top=' + inset + ' scrollHeight=' + root.scrollHeight + ' theme=' + (root.getAttribute('data-theme') || '-') + ' lang=' + root.lang,
      'overscroll html=' + cs(root).overscrollBehaviorY + ' body=' + cs(document.body).overscrollBehaviorY + ' overflow html=' + cs(root).overflowY + ' body=' + cs(document.body).overflowY,
      'counters ' + Object.keys(counters).map(function (k) { return k + '=' + counters[k]; }).join(' ') + ' | recorded ' + r(now() / 1000) + ' s'
    ].join('\n');
  };
  var text = function () {
    var out = [environment(), '', reports.length + ' report(s)'];
    reports.forEach(function (rp, i) {
      out.push('', '--- #' + (i + 1) + ' ' + rp.kind + ' at ' + r(rp.at) + ' ms: ' + rp.from + ' -> ' + rp.to);
      out.push('under the centre: ' + rp.where + ' | last touch: ' + (rp.touch ? rp.touch.x + ',' + rp.touch.y + ' on ' + rp.touch.target : '-') + ' | security check height: ' + rp.widget);
      out.push('frames (ms scrollY inner vvHeight vvTop pageHeight):');
      out.push(rp.samples.join('\n'));
      out.push('events in the last second:');
      out.push(rp.events.length ? rp.events.join('\n') : '(none)');
    });
    if (!reports.length) {
      out.push('(nothing jumped yet; the last events:)');
      out.push(events.slice(-25).map(function (e) { return r(e.t) + ' ' + e.type + ' ' + e.detail; }).join('\n'));
    }
    return out.join('\n');
  };
  window.__scrollDebug = { reports: reports, events: events, text: text };

  // ---- the box
  var draw = function () { if (ui) ui.label.textContent = 'scrolldebug  ' + reports.length + ' report(s)  ' + counters.shifts + ' shift(s)'; };
  var show = function (content) {
    var area = document.createElement('textarea');
    area.value = content;
    area.style.cssText = 'position:fixed;inset:6px;z-index:2147483647;width:calc(100% - 12px);height:calc(100% - 12px);font:10px/1.3 ui-monospace,Menlo,monospace;background:#111;color:#9ef;border:1px solid #9ef;border-radius:8px;padding:8px';
    var close = document.createElement('button');
    close.textContent = 'close';
    close.style.cssText = 'position:fixed;right:14px;top:14px;z-index:2147483647;padding:6px 12px;border-radius:8px;border:0;background:#9ef;color:#000;font:12px system-ui';
    close.addEventListener('click', function () { area.remove(); close.remove(); });
    document.body.appendChild(area);
    document.body.appendChild(close);
    area.focus();
    area.select();
  };
  var build = function () {
    var box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:2147483646;display:flex;gap:6px;align-items:center;padding:5px 8px;border-radius:999px;background:rgba(0,0,0,.82);color:#9ef;font:11px system-ui;pointer-events:none';
    var label = document.createElement('span');
    var button = function (title, fn) {
      var b = document.createElement('button');
      b.textContent = title;
      b.style.cssText = 'pointer-events:auto;border:1px solid #9ef;background:none;color:#9ef;border-radius:999px;padding:3px 9px;font:11px system-ui';
      b.addEventListener('click', fn);
      return b;
    };
    box.appendChild(label);
    box.appendChild(button('複製 / Copy', function () {
      var content = text();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(content).then(function () { label.textContent = 'copied (' + content.length + ' chars)'; }, function () { show(content); });
      else show(content);
    }));
    box.appendChild(button('顯示 / Show', function () { show(text()); }));
    box.appendChild(button('清除 / Clear', function () { reports.length = 0; events.length = 0; draw(); }));
    document.body.appendChild(box);
    ui = { box: box, label: label };
    draw();
  };
  var begin = function () {
    build();
    prev = snapshot();
    window.requestAnimationFrame(frame);
  };
  if (document.body) begin(); else document.addEventListener('DOMContentLoaded', begin);
})();
