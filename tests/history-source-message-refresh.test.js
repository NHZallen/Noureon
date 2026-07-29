import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceHistorySourceMessage } from '../src/app/legacy-runtime/features/history-source-message-refresh.js';

test('adds source disclosure to the completed streamed message without replacing it', () => {
  const loadingMessageDiv = { isConnected: true };
  let received = null;
  const message = { role: 'model', metadata: { historySourceConversationIds: ['source'] } };

  const result = replaceHistorySourceMessage({
    finalAiMessage: message,
    loadingMessageDiv,
    refreshMessageHistorySources: (element, receivedMessage) => {
      received = [element, receivedMessage];
      return element;
    }
  });

  assert.equal(result, loadingMessageDiv);
  assert.deepEqual(received, [loadingMessageDiv, message]);
});
