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
  assert.equal(box.scrollTop, 600, 'reading the newest line: it keeps up');
  const reading = { scrollHeight: 500, scrollTop: 40, clientHeight: 200 };
  keepEndInView(reading, () => { reading.scrollHeight = 700; });
  assert.equal(reading.scrollTop, 40, 'reading further up: not pulled down');
  const reset = { scrollHeight: 500, scrollTop: 40, clientHeight: 200 };
  keepEndInView(reset, () => { reset.scrollHeight = 700; reset.scrollTop = 0; });
  assert.equal(reset.scrollTop, 40, 'and where they were is kept if rewriting the text moved it');
});
