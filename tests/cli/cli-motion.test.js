import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { canAnimate, enterMenu, leaveMenu, leavePage, measureRows, playRows } from '../../src/app/ui/cli/cli-motion.js';

// happy-dom has no `animate`: the tests give the elements one that only writes down what it was asked to play.
function page({ reduced = false, animate = true } = {}) {
  const window = new Window({ url: 'https://example.test/' });
  window.matchMedia = (query) => ({ matches: reduced && /reduce/.test(query), media: query });
  const { document } = window;
  const played = [];
  // The classes of happy-dom are shared by its windows: each page sets the method, or takes it away, for itself.
  delete window.HTMLElement.prototype.animate;
  if (animate) {
    window.HTMLElement.prototype.animate = function animateElement(keyframes, options) {
      const animation = { element: this, keyframes, options, onfinish: null, oncancel: null };
      played.push(animation);
      return animation;
    };
  }
  document.body.innerHTML = '<div id="list"></div>';
  const list = document.getElementById('list');
  // Places and heights are given by the test (the box of an element is not measured in happy-dom).
  const boxes = new Map();
  const addRow = (key, top, height = 60, extra = '') => {
    const row = document.createElement('div');
    row.className = 'cs-row';
    if (key.startsWith('c:')) row.dataset.cliId = key.slice(2);
    else row.dataset.skillName = key.slice(2);
    row.innerHTML = extra;
    boxes.set(row, { top, height });
    row.getBoundingClientRect = () => ({ ...boxes.get(row), bottom: boxes.get(row).top + boxes.get(row).height });
    list.append(row);
    return row;
  };
  const redraw = (rows) => {
    list.replaceChildren();
    return rows.map(([key, top, height, extra]) => addRow(key, top, height, extra));
  };
  return { window, document, list, played, addRow, redraw };
}

test('nothing moves when the browser cannot animate or the person asked for less motion, and nothing is waited for', () => {
  assert.equal(canAnimate(page({ animate: false }).list), false);
  assert.equal(canAnimate(page({ reduced: true }).list), false);
  assert.equal(canAnimate(page().list), true);

  for (const options of [{ animate: false }, { reduced: true }]) {
    const t = page(options);
    const menu = t.document.createElement('div');
    const backdrop = t.document.createElement('div');
    t.document.body.append(menu, backdrop);
    leaveMenu(menu, backdrop);
    assert.equal(menu.isConnected || backdrop.isConnected, false, 'taken out at once');
    let done = 0;
    leavePage(t.list, () => { done += 1; });
    assert.equal(done, 1, 'the page leaves at once');
    t.addRow('c:one', 0);
    const before = measureRows(t.list);
    t.redraw([['c:one', 40]]);
    playRows(t.list, before);
    enterMenu(menu, backdrop);
    assert.equal(t.played.length, 0, 'no animation was asked for');
  }
});

test('the menu of a row slides up as a sheet or grows from its button, and is taken out only when it has left', () => {
  const t = page();
  const menu = t.document.createElement('div');
  menu.className = 'cs-menu is-sheet';
  const backdrop = t.document.createElement('div');
  t.document.body.append(backdrop, menu);
  enterMenu(menu, backdrop);
  assert.equal(t.played.length, 2);
  assert.equal(t.played[0].keyframes[0].transform, 'translateY(100%)', 'the sheet comes from below');
  assert.equal(t.played[1].keyframes[0].opacity, 0, 'the backdrop fades in');

  t.played.length = 0;
  leaveMenu(menu, backdrop);
  assert.equal(menu.isConnected && backdrop.isConnected, true, 'still there while it leaves');
  assert.equal(menu.classList.contains('is-leaving'), true);
  assert.equal(menu.style.pointerEvents, 'none', 'and it cannot be pressed');
  assert.equal(t.played.length, 2);
  for (const animation of t.played) animation.onfinish();
  assert.equal(menu.isConnected || backdrop.isConnected, false, 'taken out when the animation ends');

  const pop = t.document.createElement('div');
  pop.className = 'cs-menu';
  t.document.body.append(pop);
  t.played.length = 0;
  enterMenu(pop, null);
  assert.equal(t.played.length, 1);
  assert.match(t.played[0].keyframes[0].transform, /scale/, 'a menu next to its button grows');
});

test('the page leaves with a fade and is taken out when it is gone', () => {
  const t = page();
  let removed = 0;
  leavePage(t.list, () => { removed += 1; });
  assert.equal(removed, 0, 'not yet');
  assert.equal(t.played[0].keyframes[1].opacity, 0);
  t.played[0].oncancel();
  assert.equal(removed, 1, 'a cancelled animation takes it out as well');
});

test('the first drawing does not move; a row that stays slides from where it was, a new row fades in one after the other', () => {
  const t = page();
  playRows(t.list, measureRows(t.list));
  assert.equal(t.played.length, 0, 'nothing before: the page arrives as a whole');

  t.redraw([['s:a', 0], ['s:b', 60], ['s:c', 120]]);
  const before = measureRows(t.list);
  assert.deepEqual([...before.keys()], ['s:a', 's:b', 's:c']);
  const rows = t.redraw([['s:b', 0], ['s:a', 60], ['s:d', 120], ['s:e', 180]]);
  playRows(t.list, before);
  const byElement = (row) => t.played.filter((animation) => animation.element === row);
  assert.equal(byElement(rows[0]).length, 1, 'b moved up');
  assert.equal(byElement(rows[0])[0].keyframes[0].transform, 'translateY(60px)', 'from where it was');
  assert.equal(byElement(rows[1])[0].keyframes[0].transform, 'translateY(-60px)', 'a moved down');
  const [d, e] = [byElement(rows[2])[0], byElement(rows[3])[0]];
  assert.equal(d.keyframes[0].opacity, 0);
  assert.equal(d.options.delay, 0);
  assert.ok(e.options.delay > d.options.delay, 'one after the other');
});

test('a row that opens grows from its old height with its new parts fading in, and the other rows follow instead of moving by themselves', () => {
  const t = page();
  t.redraw([['c:a', 0, 60], ['c:b', 60, 60]]);
  const before = measureRows(t.list);
  const rows = t.redraw([['c:a', 0, 200, '<p class="cs-about">x</p><dl class="cs-details"></dl>'], ['c:b', 200, 60]]);
  playRows(t.list, before, { open: 'c:a' });
  const grow = t.played.find((animation) => animation.element === rows[0]);
  assert.deepEqual(grow.keyframes, [{ height: '60px' }, { height: '200px' }]);
  assert.equal(rows[0].style.overflow, 'hidden', 'clipped while it grows');
  grow.onfinish();
  assert.equal(rows[0].style.overflow, '', 'and free after');
  assert.equal(t.played.filter((animation) => animation.element === rows[1]).length, 0, 'the row below is moved by the layout, not by a second animation');
  assert.equal(t.played.filter((animation) => animation.element.className === 'cs-about' || animation.element.className === 'cs-details').length, 2, 'the new parts fade in');
});

test('the styles do the small changes of colour, fade the logos in, and give no motion to a person who asked for less', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../src/app/ui/cli/cli-store.css', import.meta.url), 'utf8');
  assert.match(css, /\.cs-row \{[^}]*box-sizing: border-box/, 'the height of a row is the one that is measured');
  assert.match(css, /\.cs-mark \.cli-tool-img \{[^}]*opacity: 0[^}]*transition: opacity/);
  assert.match(css, /\.cs-mark \.cli-tool-img\.is-loaded \{ opacity: 1/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.cs \*[^}]*transition: none/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgb\(|rgba\(/, 'the colours are the names of tokens.css');
});
