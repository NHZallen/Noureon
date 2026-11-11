import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { installIconTooltips } from '../../src/app/ui/tooltips/icon-tooltips.js';

const setup = (html) => {
  const window = new Window({ width: 1000, height: 700 });
  window.matchMedia = (query) => ({ matches: query === '(hover: hover)', addEventListener() {}, removeEventListener() {} });
  window.document.body.innerHTML = html;
  const off = installIconTooltips(window.document);
  const over = (selector, pointerType = 'mouse') => {
    const element = window.document.querySelector(selector);
    const event = new window.Event('pointerover', { bubbles: true });
    event.pointerType = pointerType;
    element.dispatchEvent(event);
  };
  const out = (selector) => window.document.querySelector(selector).dispatchEvent(new window.Event('pointerout', { bubbles: true }));
  const tip = () => window.document.querySelector('.icon-tip');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return { window, off, over, out, tip, wait };
};

test('an icon button shows its word after a short wait, and the browser bubble is not left beside it', async () => {
  const t = setup('<button id="a" title="Attach"><svg></svg></button>');
  try {
    t.over('#a');
    assert.equal(t.tip(), null, 'not at once');
    await t.wait(420);
    assert.equal(t.tip()?.textContent, 'Attach');
    assert.equal(t.window.document.querySelector('#a').getAttribute('title'), null);
    assert.equal(t.window.document.querySelector('#a').getAttribute('aria-label'), 'Attach', 'a screen reader still gets the word');
    t.out('#a');
    assert.equal(t.tip(), null);
  } finally { t.off(); await t.window.happyDOM.abort(); }
});

test('the next button along the row shows its word at once and with no motion; a button with words, a finger and a data-no-tip show nothing', async () => {
  const t = setup('<button id="a" aria-label="One"><svg></svg></button><button id="b" aria-label="Two"><svg></svg></button><button id="c" aria-label="Three">Words</button><button id="d" aria-label="Four" data-no-tip><svg></svg></button>');
  try {
    t.over('#a');
    await t.wait(420);
    t.out('#a');
    t.over('#b');
    assert.equal(t.tip()?.textContent, 'Two', 'at once');
    assert.ok(t.tip().classList.contains('is-instant'));
    t.out('#b');
    t.over('#c');
    await t.wait(420);
    assert.equal(t.tip(), null, 'it already says what it does');
    t.over('#d');
    await t.wait(420);
    assert.equal(t.tip(), null);
    t.over('#a', 'touch');
    await t.wait(420);
    assert.equal(t.tip(), null, 'a finger has no hover');
  } finally { t.off(); await t.window.happyDOM.abort(); }
});

test('data-tip (the microphone with its key) is the word when there is one', async () => {
  const t = setup('<button id="m" title="Voice" data-tip="Voice  Ctrl+Shift+D"><svg></svg></button>');
  try {
    t.over('#m');
    await t.wait(420);
    assert.equal(t.tip()?.textContent, 'Voice  Ctrl+Shift+D');
  } finally { t.off(); await t.window.happyDOM.abort(); }
});
