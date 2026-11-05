// A tool for looking into a page that jumps while it is scrolled (loaded only when the address has ?scrolldebug=1: public/startup-language.js). It writes nothing anywhere and sends nothing: it shows, over the page, the last
// moves of the scroll that were too big to be a finger (more than 250 px between two scroll events less than 120 ms apart, or more than 600 px at once), with what the page looked like at that moment, and the shifts of layout
// the browser reports. The list is also in `window.__scrollJumps`, and a tap on it copies it as text (to be pasted in the report).
(function () {
  var jumps = [];
  var shifts = [];
  var last = { y: window.scrollY, t: performance.now(), h: document.documentElement.scrollHeight };
  var box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;z-index:2147483647;margin:0;max-height:34vh;overflow:hidden;padding:6px 8px;border-radius:8px;font:10px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.82);color:#9ef;white-space:pre-wrap;word-break:break-all';
  var draw = function () {
    var lines = ['scrolldebug: ' + jumps.length + ' jump(s), ' + shifts.length + ' layout shift(s) (tap to copy)'];
    jumps.slice(-5).forEach(function (j) { lines.push(j); });
    shifts.slice(-3).forEach(function (s) { lines.push(s); });
    box.textContent = lines.join('\n');
  };
  var describe = function () {
    var vv = window.visualViewport;
    var active = document.activeElement;
    var widget = document.querySelector('.turnstile-widget');
    return 'inner=' + window.innerHeight + ' vv=' + (vv ? Math.round(vv.height) + '@' + Math.round(vv.offsetTop) : '-') + ' doc=' + document.documentElement.scrollHeight
      + ' active=' + (active && active.tagName) + ' widget=' + (widget ? Math.round(widget.getBoundingClientRect().height) : '-');
  };
  var onScroll = function () {
    var now = performance.now();
    var y = window.scrollY;
    var h = document.documentElement.scrollHeight;
    var dy = y - last.y;
    if ((Math.abs(dy) > 250 && now - last.t < 120) || Math.abs(dy) > 600) {
      jumps.push((now / 1000).toFixed(2) + 's ' + Math.round(last.y) + '->' + Math.round(y) + ' (' + Math.round(dy) + ') dt=' + Math.round(now - last.t) + 'ms docBefore=' + last.h + ' ' + describe());
      window.__scrollJumps = jumps;
      draw();
    }
    last = { y: y, t: now, h: h };
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.value < 0.01) return;
        var names = (entry.sources || []).map(function (source) { var node = source.node; return node ? ((node.className && String(node.className).slice(0, 30)) || node.nodeName) : '?'; }).join(',');
        shifts.push((entry.startTime / 1000).toFixed(2) + 's shift ' + entry.value.toFixed(3) + ' ' + names);
      });
      draw();
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (error) { /* this browser does not report them */ }
  box.addEventListener('click', function () {
    var text = jumps.concat(shifts).join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
  });
  draw();
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(box); });
  if (document.body) document.body.appendChild(box);
})();
