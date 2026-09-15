import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createTemporaryChatLifecycle } from '../src/app/runtime/features/temporary-chat-lifecycle.js';

const flushMutations = () => new Promise(resolve => setTimeout(resolve, 0));

test('temporary chat controls follow the empty, started, and permanently saved states', async () => {
  const window = new Window();
  const { document } = window;
  let responsiveLayoutHandler;
  const responsiveLayoutQuery = {
    matches: true,
    addEventListener: (_type, handler) => { responsiveLayoutHandler = handler; }
  };
  window.matchMedia = () => responsiveLayoutQuery;
  document.body.innerHTML = `
    <div id="header-actions"><button id="new-chat"></button></div>
    <main id="workspace">
      <section id="chat-container"><div id="message-list"><div class="chat-greeting-message"></div></div></section>
    </main>`;
  const conversation = {
    id: 'chat-1',
    title: 'New chat',
    isTemporary: true,
    messages: []
  };
  const calls = [];
  let lifecycle;
  lifecycle = createTemporaryChatLifecycle({
    document,
    elements: {
      chatWorkspace: document.querySelector('#workspace'),
      chatContainer: document.querySelector('#chat-container'),
      messageList: document.querySelector('#message-list'),
      newChatBtnHeader: document.querySelector('#new-chat')
    },
    getActiveConversation: () => conversation,
    getText: (_key, fallback) => fallback,
    saveAppData: async options => calls.push(['save', options]),
    renderAll: () => lifecycle.render(),
    showNotification: (...args) => calls.push(['notice', ...args]),
    persistGeneratedImageAssets: async value => calls.push(['images', value.id])
  });

  lifecycle.render();
  const entry = document.querySelector('#temporary-chat-entry-button');
  const controls = entry.closest('#temporary-chat-controls');
  assert.equal(entry.closest('#temporary-chat-controls').classList.contains('hidden'), false);
  assert.equal(controls.parentElement.id, 'header-actions');
  assert.equal(controls.style.position, 'static');
  assert.equal(controls.style.flexDirection, 'row-reverse');
  assert.equal(entry.style.width, '2.75rem');
  assert.equal(document.querySelector('#temporary-memory-menu').style.padding, '0.3rem');
  assert.equal(document.querySelector('[data-memory-enabled="true"]').style.minHeight, '3rem');
  assert.equal(document.querySelector('#temporary-chat-hero'), null);
  assert.equal(entry.classList.contains('is-active'), false);
  assert.equal(entry.querySelector('.temporary-chat-icon-inactive [data-temporary-chat-slash]'), null);

  entry.click();
  assert.equal(conversation.retentionMode, 'ephemeral');
  assert.equal(conversation.memoryAccessEnabled, true);
  assert.equal(document.querySelector('#temporary-chat-hero h2').textContent, '臨時對話');
  assert.equal(document.querySelector('#temporary-chat-hero').closest('.chat-greeting-message') !== null, true);
  assert.equal(document.querySelector('#temporary-chat-personalization').classList.contains('hidden'), false);
  assert.equal(document.querySelector('#temporary-chat-controls').firstElementChild, entry);
  assert.equal(document.querySelector('#temporary-memory-menu').style.top, 'calc(100% + .35rem)');
  assert.equal(document.querySelector('#temporary-chat-header-status').style.display, 'none');
  assert.equal(entry.classList.contains('is-active'), true);
  assert.equal(entry.querySelectorAll('.temporary-chat-icon-active [data-temporary-chat-slash]').length, 1);
  assert.equal(entry.querySelector('.sr-only').textContent, '退出臨時對話');
  assert.equal(document.querySelector('#temporary-chat-header-status').textContent, '臨時對話');
  assert.equal(document.querySelector('#temporary-chat-header-status').tagName, 'SPAN');

  document.querySelector('#temporary-memory-button').click();
  document.querySelector('[data-memory-enabled="false"]').click();
  assert.equal(conversation.memoryAccessEnabled, false);
  assert.equal(document.querySelector('#temporary-memory-label').textContent, '非個人化');
  assert.equal(document.querySelector('#temporary-chat-hero h2').textContent, '臨時對話');
  assert.equal(
    document.querySelector('#temporary-chat-hero p').textContent,
    '此對話會忽略記憶、外掛程式和自訂指示，也不會顯示在你的對話記錄中。'
  );

  conversation.isTemporary = false;
  conversation.messages.push({ role: 'user', parts: [{ text: 'private question' }] });
  document.querySelector('#message-list').append(document.createElement('div'));
  await flushMutations();
  assert.equal(document.querySelector('#temporary-chat-controls').classList.contains('hidden'), false);
  assert.equal(entry.classList.contains('hidden'), true);
  const saveButton = document.querySelector('#save-temporary-chat-button');
  assert.equal(saveButton.classList.contains('hidden'), false);
  assert.equal(saveButton.querySelectorAll('[data-temporary-chat-save-bookmark]').length, 1);
  assert.equal(saveButton.querySelector('span').classList.contains('sr-only'), true);
  assert.equal(document.querySelector('#temporary-chat-header-status').classList.contains('hidden'), false);
  assert.equal(controls.parentElement.id, 'header-actions');
  assert.equal(controls.style.position, 'static');
  assert.equal(controls.style.flexDirection, 'row-reverse');

  responsiveLayoutQuery.matches = false;
  responsiveLayoutHandler({ matches: false });
  assert.equal(controls.parentElement.id, 'header-actions');
  assert.equal(controls.style.position, 'static');
  assert.equal(controls.style.flexDirection, '');
  assert.equal(document.querySelector('#temporary-chat-header-status').style.display, '');

  saveButton.click();
  await flushMutations();
  assert.equal(conversation.retentionMode, 'persistent');
  assert.equal(conversation.memoryCaptureStartIndex, 1);
  assert.equal('memoryAccessEnabled' in conversation, false);
  assert.deepEqual(calls[0], ['images', 'chat-1']);
  assert.deepEqual(calls[1], ['save', { immediateCloudSync: true }]);
  assert.equal(calls[2][0], 'notice');
  assert.equal(document.querySelector('#save-temporary-chat-button').classList.contains('hidden'), true);
  assert.equal(document.querySelector('#temporary-chat-header-status').classList.contains('hidden'), true);

  assert.equal(controls.parentElement.id, 'workspace');
  assert.equal(controls.style.position, '');
  assert.equal(controls.style.left, '');
  assert.equal(document.querySelector('#temporary-memory-menu').style.padding, '');
  assert.equal(document.querySelector('#temporary-chat-header-status').style.display, '');

  window.close();
});
