import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { streamInMessage } from '../src/app/ui/motion/stream-in.js';

const draw = () => {
  const window = new Window();
  const { document } = window;
  const element = document.createElement('div');
  element.innerHTML = '<div class="message-content"><details class="sandbox-run"><summary>Ran 1 program</summary></details><p>Visual check done: 2 issues.</p><ul><li>Slide 1: small text</li><li>Slide 2: low contrast</li></ul></div><div class="ac-file-card"><span>deck.pptx</span></div>';
  document.body.append(element);
  return { document, element };
};

test('the words come in order, a block shows from its first letter, the files wait and then rise in', async () => {
  const { element } = draw();
  const frames = [];
  const running = streamInMessage(element, { requestFrame: (callback) => frames.push(callback), follow: () => {} });
  const content = element.querySelector('.message-content');
  assert.equal(element.classList.contains('is-awaiting-files'), true, 'the file waits as a placeholder');
  assert.equal(content.querySelector('summary').textContent, 'Ran 1 program', 'the panel of the run is shown at once');
  assert.equal(element.querySelector('.ac-file-card').textContent, 'deck.pptx', 'the card is kept, only hidden by the page styles');
  assert.equal(content.querySelector('p').textContent, '', 'nothing typed yet');
  assert.equal(content.querySelectorAll('.stream-pending').length, 3, 'no empty bullets');

  let steps = 0;
  const seen = [];
  while (frames.length && steps < 1000) {
    steps += 1;
    frames.shift()();
    seen.push(content.querySelector('p').textContent.length + content.querySelectorAll('li:not(.stream-pending)').length);
  }
  assert.equal(await running, true);
  assert.equal(content.querySelector('p').textContent, 'Visual check done: 2 issues.');
  assert.deepEqual([...content.querySelectorAll('li')].map((item) => item.textContent), ['Slide 1: small text', 'Slide 2: low contrast']);
  assert.equal(content.querySelectorAll('.stream-pending').length, 0);
  assert.equal(element.classList.contains('is-awaiting-files'), false);
  assert.equal(element.classList.contains('is-arriving-files'), true, 'the files rise in when the words are done');
  assert.deepEqual([...seen].sort((a, b) => a - b), seen, 'it only ever grows');
  assert.ok(steps > 3, 'in several steps, not at once');
});

test('nothing is typed with reduced motion, and a message that left the page stops being typed', async () => {
  const { element } = draw();
  assert.equal(await streamInMessage(element, { reducedMotion: true }), false);
  assert.equal(element.querySelector('p').textContent, 'Visual check done: 2 issues.');

  const second = draw();
  const frames = [];
  const running = streamInMessage(second.element, { requestFrame: (callback) => frames.push(callback) });
  second.element.remove();
  frames.shift()();
  assert.equal(await running, false);
});

test('the words are not made to wait: a few letters a frame, and about forty frames at most however long they are', async () => {
  const frames = [];
  const make = (text) => {
    const { element } = draw();
    element.querySelector('.message-content').innerHTML = `<p>${text}</p>`;
    return element;
  };
  const count = async (element) => {
    const queue = [];
    const running = streamInMessage(element, { requestFrame: (callback) => queue.push(callback) });
    let steps = 0;
    while (queue.length) { steps += 1; queue.shift()(); }
    await running;
    return steps;
  };
  assert.ok(await count(make('x'.repeat(80))) <= 10, 'a short reply takes a handful of frames');
  assert.ok(await count(make('x'.repeat(4000))) <= 41, 'a long one is not slower than forty frames');
  assert.equal(frames.length, 0);
});
