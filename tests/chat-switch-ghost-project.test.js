import assert from 'node:assert/strict';
import test from 'node:test';

import { Window } from 'happy-dom';

import { fadeOutPreviousChat } from '../src/app/ui/motion/chat-switch-ghost.js';

// A page of the projects lies over the chat: the copy of the old chat that fades out when the chat changes must not be drawn over it (it showed the greeting on top of the page).

const setup = (page) => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = `<div id="app-container"><div id="chat-container"><div id="message-list"><div class="chat-greeting-message">Hi</div></div></div>${page}</div>`;
  const messageList = document.getElementById('message-list');
  const chatContainer = document.getElementById('chat-container');
  messageList.animate = () => ({});
  const rect = { left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400 };
  chatContainer.getBoundingClientRect = () => rect;
  messageList.firstElementChild.getBoundingClientRect = () => rect;
  window.matchMedia = () => ({ matches: false });
  window.HTMLElement.prototype.animate = () => ({});
  return { window, document, messageList, chatContainer };
};

test('the old chat fades out over the chat, but not over a page of the projects (a sheet alone does not cover it)', async () => {
  const plain = setup('');
  assert.equal(fadeOutPreviousChat(plain), true);
  assert.equal(plain.document.body.querySelectorAll('[inert]').length, 1);
  await plain.window.happyDOM.abort();
  const covered = setup('<div class="pj"></div>');
  assert.equal(fadeOutPreviousChat(covered), false);
  assert.equal(covered.document.body.querySelectorAll('[inert]').length, 0);
  await covered.window.happyDOM.abort();
  const sheetOnly = setup('<div class="pj pj-dialog-only"></div>');
  assert.equal(fadeOutPreviousChat(sheetOnly), true);
  await sheetOnly.window.happyDOM.abort();
});
