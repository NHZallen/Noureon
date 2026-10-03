import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { installScrollDebug } from '../../src/app/ui/motion/scroll-debug.js';

test('the scroll debug tool says what moved the chat, and gives everything back when it is stopped', () => {
  const window = new Window();
  const { document } = window;
  const chat = document.createElement('div');
  chat.id = 'chat-container';
  document.body.append(chat);
  const original = window.Element.prototype.scrollTo;
  const lines = [];
  const stop = installScrollDebug(document, { write: (...args) => lines.push(args.join(' ')) });
  try {
    assert.match(lines[0], /scroll-debug\] on/);
    document.dispatchEvent(new window.Event('wheel'));
    chat.scrollTop = 120;
    assert.match(lines.at(-1), /scrollTop 0 -> 120 \(\d+ms, \d+ms after the person last touched\)/);
    const written = lines.length;
    const other = document.createElement('div');
    other.scrollTop = 5;
    assert.equal(lines.length, written, 'only the chat is told of');
    chat.scrollTo({ top: 300 });
    assert.ok(lines.some((line) => /scrollTo \{"top":300\}/.test(line)));
  } finally {
    stop();
  }
  const after = lines.length;
  chat.scrollTop = 50;
  assert.equal(lines.length, after, 'nothing is written after it is stopped');
  assert.equal(window.Element.prototype.scrollTo, original);
  window.happyDOM.abort();
});
