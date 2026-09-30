import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { animateDetails, keepEndInView, setCollapsed } from '../src/app/ui/motion/collapse-motion.js';
import { createLedger } from '../src/app/ui/ledger/ledger.js';

// happy-dom cannot animate: give elements a small fake that records what was asked.
const withAnimation = (window, { reduced = false } = {}) => {
  const runs = [];
  window.HTMLElement.prototype.animate = function animate(frames, options) {
    const animation = { frames, options, node: this, cancel() { this.oncancel?.(); }, finish() { this.onfinish?.(); } };
    runs.push(animation);
    return animation;
  };
  window.matchMedia = () => ({ matches: reduced });
  return runs;
};

test('a folded part eases open and shut, and only when it changes', () => {
  const window = new Window();
  const runs = withAnimation(window);
  const node = window.document.createElement('div');
  node.hidden = true;
  window.document.body.append(node);
  setCollapsed(node, true);
  assert.equal(node.hidden, false, 'shown at once, then eased in from nothing');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].frames[0].height, '0px');
  assert.equal(runs[0].frames[0].opacity, 0);
  assert.equal(runs[0].frames[1].opacity, 1);
  assert.equal(node.style.overflow, 'hidden', 'nothing spills while it moves');
  runs[0].finish();
  assert.equal(node.style.overflow, '');
  setCollapsed(node, true);
  assert.equal(runs.length, 1, 'already open: nothing to animate');
  setCollapsed(node, false);
  assert.equal(node.hidden, false, 'still there while it closes');
  assert.equal(runs[1].frames[2].height, '0px');
  runs[1].finish();
  assert.equal(node.hidden, true);
  setCollapsed(node, false);
  assert.equal(runs.length, 2);
  window.happyDOM.abort();
});

test('less motion, or the first drawing, switches at once', () => {
  const window = new Window();
  const runs = withAnimation(window, { reduced: true });
  const node = window.document.createElement('div');
  node.hidden = true;
  setCollapsed(node, true);
  assert.equal(node.hidden, false);
  setCollapsed(node, false);
  assert.equal(node.hidden, true);
  assert.equal(runs.length, 0, 'someone who asked for less motion sees none');
  const other = new Window();
  const otherRuns = withAnimation(other);
  const still = other.document.createElement('div');
  still.hidden = true;
  setCollapsed(still, true, { animate: false });
  assert.equal(still.hidden, false);
  assert.equal(otherRuns.length, 0);
  window.happyDOM.abort();
  other.happyDOM.abort();
});

test('a step list row eases its body open once it is on screen, but starts in place', () => {
  const window = new Window();
  const runs = withAnimation(window);
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const ledger = createLedger({ document: window.document, host });
  const row = ledger.addRow('Step', { body: true });
  assert.equal(runs.length, 0, 'a row that is drawn does not animate');
  row.enableBody(true);
  assert.equal(runs.length, 1, 'opening its body eases');
  assert.equal(row.body.hidden, false);
  runs[0].finish();
  row.node.querySelector('.ledger-row-head').click();
  assert.equal(runs.length, 2, 'and so does closing it');
  runs[1].finish();
  assert.equal(row.body.hidden, true);
  ledger.remove();
  window.happyDOM.abort();
});

test('a details element eases open and shut when its summary is clicked', () => {
  const window = new Window();
  const runs = withAnimation(window);
  const details = window.document.createElement('details');
  const summary = window.document.createElement('summary');
  const part = window.document.createElement('div');
  details.append(summary, part);
  window.document.body.append(details);
  animateDetails(details);
  const click = () => {
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    summary.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(click(), true, 'the browser\'s own instant toggle is replaced');
  assert.equal(details.open, true);
  runs[0].finish();
  click();
  assert.equal(details.open, true, 'it stays open while it closes');
  runs[1].finish();
  assert.equal(details.open, false);
  window.happyDOM.abort();
});

test('text added to a scrolling box follows the end only for a reader who is at the end', () => {
  const box = { scrollHeight: 500, scrollTop: 300, clientHeight: 200 };
  keepEndInView(box, () => { box.scrollHeight = 600; });
  assert.equal(box.scrollTop, 398, 'reading the newest line: it keeps up, a little short of the end');
  const reading = { scrollHeight: 500, scrollTop: 40, clientHeight: 200 };
  keepEndInView(reading, () => { reading.scrollHeight = 700; });
  assert.equal(reading.scrollTop, 40, 'reading further up: not pulled down');
  const reset = { scrollHeight: 500, scrollTop: 40, clientHeight: 200 };
  keepEndInView(reset, () => { reset.scrollHeight = 700; reset.scrollTop = 0; });
  assert.equal(reset.scrollTop, 40, 'and where they were is kept if rewriting the text moved it');
});

test('the thinking keeps coming while the reader scrolls, and the box is not moved under their finger', () => {
  const listeners = {};
  const box = {
    scrollHeight: 500, scrollTop: 40, clientHeight: 200,
    addEventListener: (type, handler) => { listeners[type] = handler; }
  };
  let writes = 0;
  keepEndInView(box, () => { writes += 1; });
  assert.equal(writes, 1);
  listeners.touchstart();
  const held = box.scrollTop;
  keepEndInView(box, () => { writes += 1; box.scrollHeight += 100; box.scrollTop = 0; });
  assert.equal(writes, 2, 'the text goes in at once, also under a finger');
  assert.equal(box.scrollTop, 0, 'and the app does not move the box while it is held');
  assert.notEqual(held, undefined);
});

test('a box that follows its end never rests exactly on it, so an iPhone swipe goes to the box', () => {
  const box = { scrollHeight: 500, scrollTop: 300, clientHeight: 200 };
  keepEndInView(box, () => { box.scrollHeight = 900; });
  assert.equal(box.scrollTop, 698);
  assert.notEqual(box.scrollTop, box.scrollHeight - box.clientHeight);
});

test('streamed thinking only extends the last text node, nothing is replaced', async () => {
  const { Window } = await import('happy-dom');
  const { fillThinkingText } = await import('../src/app/ui/thinking/thinking-text.js');
  const window = new Window();
  const node = window.document.createElement('div');
  fillThinkingText(window.document, node, '**標題** 想一');
  const [strong, text] = node.childNodes;
  fillThinkingText(window.document, node, '**標題** 想一想');
  assert.equal(node.childNodes[0], strong);
  assert.equal(node.childNodes[1], text);
  assert.equal(node.innerHTML, '<strong>標題</strong> 想一想');
  window.happyDOM.abort();
});
