import assert from 'node:assert/strict';
import test from 'node:test';
import { keepChatOffItsEdges } from '../src/app/runtime/features/chat-scroll-edges.js';

const createScroller = ({ scrollTop, scrollHeight = 2000, clientHeight = 600 }) => {
  const listeners = {};
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    addEventListener: (type, listener) => { listeners[type] = listener; },
    removeEventListener: (type) => { delete listeners[type]; },
    touch: () => listeners.touchstart?.()
  };
};

test('a finger landing at the end of the chat moves it one pixel back from each end', () => {
  const atBottom = createScroller({ scrollTop: 1400 });
  keepChatOffItsEdges(atBottom);
  atBottom.touch();
  assert.equal(atBottom.scrollTop, 1399);

  const atTop = createScroller({ scrollTop: 0 });
  keepChatOffItsEdges(atTop);
  atTop.touch();
  assert.equal(atTop.scrollTop, 1);
});

test('a finger landing mid-chat or on a chat that cannot scroll changes nothing', () => {
  const middle = createScroller({ scrollTop: 700 });
  keepChatOffItsEdges(middle);
  middle.touch();
  assert.equal(middle.scrollTop, 700);

  const short = createScroller({ scrollTop: 0, scrollHeight: 601 });
  keepChatOffItsEdges(short);
  short.touch();
  assert.equal(short.scrollTop, 0);
});

test('a chat still bouncing past an end is left to finish the bounce', () => {
  const pastTop = createScroller({ scrollTop: -62 });
  keepChatOffItsEdges(pastTop);
  pastTop.touch();
  assert.equal(pastTop.scrollTop, -62);

  const pastBottom = createScroller({ scrollTop: 1465 });
  keepChatOffItsEdges(pastBottom);
  pastBottom.touch();
  assert.equal(pastBottom.scrollTop, 1465);
});
