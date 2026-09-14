import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import { createTemporaryChatLifecycle } from '../src/app/runtime/features/temporary-chat-lifecycle.js';

const flushMutations = () => new Promise(resolve => setTimeout(resolve, 0));

test('temporary chat controls follow the empty, started, and permanently saved states', async () => {
  const window = new Window();
  const { document } = window;
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
  assert.equal(entry.closest('#temporary-chat-controls').classList.contains('hidden'), false);
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
  assert.equal(entry.classList.contains('is-active'), true);
  assert.equal(entry.querySelectorAll('.temporary-chat-icon-active [data-temporary-chat-slash]').length, 1);
  assert.equal(entry.querySelector('.sr-only').textContent, '退出臨時對話');

  document.querySelector('#temporary-memory-button').click();
  document.querySelector('[data-memory-enabled="false"]').click();
  assert.equal(conversation.memoryAccessEnabled, false);
  assert.equal(document.querySelector('#temporary-memory-label').textContent, '非個人化');

  conversation.isTemporary = false;
  conversation.messages.push({ role: 'user', parts: [{ text: 'private question' }] });
  document.querySelector('#message-list').append(document.createElement('div'));
  await flushMutations();
  assert.equal(document.querySelector('#temporary-chat-controls').classList.contains('hidden'), true);
  assert.equal(document.querySelector('#save-temporary-chat-button').classList.contains('hidden'), false);

  document.querySelector('#save-temporary-chat-button').click();
  await flushMutations();
  assert.equal(conversation.retentionMode, 'persistent');
  assert.equal(conversation.memoryCaptureStartIndex, 1);
  assert.equal('memoryAccessEnabled' in conversation, false);
  assert.deepEqual(calls[0], ['images', 'chat-1']);
  assert.deepEqual(calls[1], ['save', { immediateCloudSync: true }]);
  assert.equal(calls[2][0], 'notice');
  assert.equal(document.querySelector('#save-temporary-chat-button').classList.contains('hidden'), true);

  window.close();
});
