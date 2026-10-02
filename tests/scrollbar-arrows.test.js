import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { installScrollbarArrows, scrollbarArrowAt } from '../src/app/ui/scroll/scrollbar-arrows.js';

// A scroller 300 wide and 400 tall at (100, 50), its scrollbar 11 wide, its content 2000 tall.
function scene() {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  const list = document.createElement('div');
  list.style.overflowY = 'auto';
  document.body.append(list);
  const set = (name, value) => Object.defineProperty(list, name, { value, configurable: true });
  set('offsetWidth', 300);
  set('clientWidth', 289);
  set('clientHeight', 400);
  set('scrollHeight', 2000);
  set('clientLeft', 0);
  set('clientTop', 0);
  list.getBoundingClientRect = () => ({ left: 100, top: 50, right: 400, bottom: 450, width: 300, height: 400 });
  return { window, document, list };
}

test('a press on a scrollbar arrow is told from a press on the content', () => {
  const { list, window } = scene();
  try {
    assert.equal(scrollbarArrowAt(list, 395, 55), 'top');
    assert.equal(scrollbarArrowAt(list, 395, 445), 'bottom');
    assert.equal(scrollbarArrowAt(list, 395, 250), '', 'the middle of the bar is the browser\'s');
    assert.equal(scrollbarArrowAt(list, 200, 55), '', 'the content is not the bar');
    assert.equal(scrollbarArrowAt(list, 395, 49), '', 'outside the scroller');
  } finally {
    window.close();
  }
});

test('nothing scrolls, nothing to press', () => {
  const { list, window } = scene();
  try {
    Object.defineProperty(list, 'scrollHeight', { value: 400, configurable: true });
    assert.equal(scrollbarArrowAt(list, 395, 55), '');
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'clientWidth', { value: 300, configurable: true });
    assert.equal(scrollbarArrowAt(list, 395, 55), '', 'an overlay scrollbar takes no room and has no arrows');
  } finally {
    window.close();
  }
});

test('pressing the arrows takes the list to its top and to its end', () => {
  const { document, list, window } = scene();
  try {
    const remove = installScrollbarArrows(document);
    list.scrollTop = 700;
    list.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 395, clientY: 55 }));
    assert.equal(list.scrollTop, 0);
    list.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 395, clientY: 445 }));
    assert.equal(list.scrollTop, 2000);
    list.scrollTop = 700;
    list.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: 55 }));
    assert.equal(list.scrollTop, 700, 'a press on the content leaves it');
    list.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 2, clientX: 395, clientY: 55 }));
    assert.equal(list.scrollTop, 700, 'only the main button');
    remove();
    list.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 395, clientY: 55 }));
    assert.equal(list.scrollTop, 700, 'taken away');
  } finally {
    window.close();
  }
});
