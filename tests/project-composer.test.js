import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';
import { createProjectComposer } from '../src/app/runtime/projects/project-composer.js';

// The box of the chat moved onto the page of a project: it goes in a place of the page, the chat of the project is made once it is on the page, a send closes the page,
// and leaving without sending puts back the chat that was open.

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

const setup = ({ previous = 'old', previousExists = true, previousInProject = false } = {}) => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<main id="chat-workspace"><div id="input-bar-container"><form id="chat-form"><textarea></textarea></form></div><footer id="after"></footer></main><div id="page"></div>';
  const state = { current: previous, conversations: new Map(previous ? [[previous, { id: previous, messages: [{ role: 'user' }] }]] : []), prepared: [], abandoned: [], sent: [], loaded: [], rendersSeenWithBoxOutOfDocument: 0 };
  const actions = {
    prepareChat: async (projectId) => {
      // A render of the chat made while the box is out of the document would make its parts again.
      if (!document.getElementById('input-bar-container')) state.rendersSeenWithBoxOutOfDocument += 1;
      const id = `made-${state.prepared.length + 1}`;
      state.prepared.push(projectId);
      state.conversations.set(id, { id, messages: [], folderId: projectId });
      state.current = id;
      return { ok: true, conversationId: id };
    },
    abandonChat: (id) => { state.abandoned.push(id); return true; },
    sentChat: (id) => state.sent.push(id)
  };
  const composer = createProjectComposer({
    document, actions,
    getActiveConversation: () => state.conversations.get(state.current) || null,
    getCurrentConversationId: () => state.current,
    conversationExists: (id) => previousExists && state.conversations.has(id),
    isInProject: (id) => previousInProject && id === 'old',
    loadChat: (id) => { state.loaded.push(id); state.current = id; }
  });
  const slotOnPage = () => { const slot = document.createElement('div'); document.getElementById('page').appendChild(slot); return slot; };
  return { window, document, state, composer, slotOnPage, box: () => document.getElementById('input-bar-container') };
};

test('the box goes into the place of the page, the chat of the project is made after the page is drawn (not twice for a page drawn again), and the box goes home', async () => {
  const { window, state, composer, slotOnPage, box, document } = setup();
  const detached = document.createElement('div'); // a place that is not on the page yet, as while the page draws itself
  assert.equal(composer.attach(detached, 'p1'), true);
  assert.equal(detached.firstElementChild.id, 'input-bar-container');
  document.getElementById('page').appendChild(detached);
  await flush();
  assert.deepEqual(state.prepared, ['p1']);
  assert.equal(state.rendersSeenWithBoxOutOfDocument, 0, 'the chat is made while the box is in the document');
  // Drawn again: the box moves to the new place, nothing is made again.
  const second = slotOnPage();
  composer.attach(second, 'p1');
  await flush();
  assert.equal(box().parentNode, second);
  assert.deepEqual(state.prepared, ['p1']);
  composer.park();
  assert.equal(box().parentNode.id, 'chat-workspace');
  assert.equal(box().nextSibling.id, 'after', 'it is back where it was');
  await window.happyDOM.abort();
});

test('leaving without sending gives the chat of the project up and puts back the chat that was open; another project gets a chat of its own', async () => {
  const { window, state, composer, slotOnPage, box } = setup();
  composer.attach(slotOnPage(), 'p1');
  await flush();
  composer.attach(slotOnPage(), 'p2');
  await flush();
  assert.deepEqual(state.prepared, ['p1', 'p2']);
  assert.deepEqual(state.abandoned, ['made-1'], 'the unused chat of the first project is given up');
  await composer.release();
  assert.deepEqual(state.abandoned, ['made-1', 'made-2']);
  assert.deepEqual(state.loaded, ['old'], 'the chat that was open comes back');
  assert.equal(box().parentNode.id, 'chat-workspace');
  await window.happyDOM.abort();
});

test('when the chat that was open is gone (it was an empty one) the empty chat is left open, without the project', async () => {
  const { window, state, composer, slotOnPage } = setup({ previousExists: false });
  composer.attach(slotOnPage(), 'p1');
  await flush();
  await composer.release();
  assert.deepEqual(state.abandoned, ['made-1']);
  assert.deepEqual(state.loaded, []);
  await window.happyDOM.abort();
});

test('a send in the box tells the cloud, closes the page and keeps the chat in the project; a send that did nothing keeps the page', async () => {
  const { window, state, composer, slotOnPage, box } = setup();
  let closed = 0;
  composer.attach(slotOnPage(), 'p1', { done: () => { closed += 1; } });
  await flush();
  const form = box().querySelector('#chat-form');
  form.dispatchEvent(new window.Event('submit', { bubbles: true }));
  await flush();
  assert.equal(closed, 0, 'nothing was added to the chat (a key is missing, say)');
  state.conversations.get('made-1').messages.push({ role: 'user' });
  form.dispatchEvent(new window.Event('submit', { bubbles: true }));
  await flush();
  assert.equal(closed, 1);
  assert.deepEqual(state.sent, ['made-1']);
  assert.equal(box().parentNode.id, 'chat-workspace');
  await composer.release();
  assert.deepEqual(state.abandoned, [], 'a chat that was sent is not given up');
  assert.deepEqual(state.loaded, []);
  await window.happyDOM.abort();
});

test('going back out of the overview does not bring back the chat of a project that was open (the way out would be a circle); a chat outside the projects does come back', async () => {
  const inside = setup({ previousInProject: true });
  inside.composer.attach(inside.slotOnPage(), 'p1');
  await flush();
  let changed = 0;
  inside.document.addEventListener('noureon:chat-changed', () => { changed += 1; });
  await inside.composer.release({ leaveProject: true });
  assert.deepEqual(inside.state.loaded, [], 'the chat of the project stays closed');
  assert.equal(changed, 1, 'the header is told the chat changed');
  await inside.window.happyDOM.abort();
  const outside = setup({ previousInProject: false });
  outside.composer.attach(outside.slotOnPage(), 'p1');
  await flush();
  await outside.composer.release({ leaveProject: true });
  assert.deepEqual(outside.state.loaded, ['old']);
  await outside.window.happyDOM.abort();
});
