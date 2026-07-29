import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceHistorySourceMessage } from '../src/app/legacy-runtime/features/history-source-message-refresh.js';

test('replaces only the completed streamed message with its source-aware view', () => {
  const finalMessageElement = {};
  let received = null;
  const loadingMessageDiv = {
    isConnected: true,
    replaceWith: element => { received = element; }
  };
  const conversation = { messages: [{ role: 'user' }, { role: 'model' }] };
  const message = { role: 'model', metadata: { historySourceConversationIds: ['source'] } };

  const result = replaceHistorySourceMessage({
    finalAiMessage: message,
    conversation,
    loadingMessageDiv,
    addMessageToUI: (...args) => {
      assert.deepEqual(args, [message, 1, false, false]);
      return finalMessageElement;
    }
  });

  assert.equal(result, finalMessageElement);
  assert.equal(received, finalMessageElement);
});
