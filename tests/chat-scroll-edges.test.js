import assert from 'node:assert/strict';
import test from 'node:test';
import { setEndRoomEnabled } from '../src/app/ui/motion/reader-scroll-guard.js';
import { keepChatOffItsEdges } from '../src/app/runtime/features/chat-scroll-edges.js';

const createScroller = ({ scrollTop, scrollHeight = 2000, clientHeight = 600 }) => {
  const listeners = {};
  const values = new Map();
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    style: {
      getPropertyValue: (name) => values.get(name) || '',
      setProperty: (name, value) => { values.set(name, value); },
      removeProperty: (name) => { values.delete(name); }
    },
    addEventListener: (type, listener) => { listeners[type] = listener; },
    removeEventListener: (type) => { delete listeners[type]; },
    touch: () => listeners.touchstart?.()
  };
};
setEndRoomEnabled(true);

const room = (scroller) => scroller.style.getPropertyValue('--end-room');

test('a finger landing on a chat resting on its end gives it more range there and moves nothing', () => {
  const atBottom = createScroller({ scrollTop: 1400 });
  keepChatOffItsEdges(atBottom);
  atBottom.touch();
  assert.equal(room(atBottom), '2px');
  assert.equal(atBottom.scrollTop, 1400, 'the chat is not moved: a write as the finger lands stops the swipe');
});

test('a chat within a pixel of its end, as a phone reports fractions, counts as on it', () => {
  for (const scrollTop of [1399.4, 1399.05, 1400]) {
    const nearBottom = createScroller({ scrollTop });
    keepChatOffItsEdges(nearBottom);
    nearBottom.touch();
    assert.equal(room(nearBottom), '2px', String(scrollTop));
    assert.equal(nearBottom.scrollTop, scrollTop);
  }
  const clear = createScroller({ scrollTop: 1398.5 });
  keepChatOffItsEdges(clear);
  clear.touch();
  assert.equal(room(clear), '', 'a pixel and a half away is already off the end');
});

test('a finger landing mid-chat, at the top, or on a chat that cannot scroll changes nothing', () => {
  for (const options of [{ scrollTop: 700 }, { scrollTop: 0 }, { scrollTop: 0, scrollHeight: 603 }]) {
    const scroller = createScroller(options);
    keepChatOffItsEdges(scroller);
    scroller.touch();
    assert.equal(room(scroller), '');
    assert.equal(scroller.scrollTop, options.scrollTop);
  }
});

test('a chat still bouncing past its end is left to finish the bounce', () => {
  const pastBottom = createScroller({ scrollTop: 1465 });
  keepChatOffItsEdges(pastBottom);
  pastBottom.touch();
  assert.equal(room(pastBottom), '');
  assert.equal(pastBottom.scrollTop, 1465);
});

test('the room stays at most a few pixels however often the chat comes to rest on its end', () => {
  const chat = createScroller({ scrollTop: 1400 });
  keepChatOffItsEdges(chat);
  for (let index = 0; index < 8; index += 1) {
    chat.touch();
    chat.scrollHeight += 2;
    chat.scrollTop = chat.scrollHeight - chat.clientHeight;
  }
  assert.equal(room(chat), '12px');
});
