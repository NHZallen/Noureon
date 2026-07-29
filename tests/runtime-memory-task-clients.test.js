import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTaskClients } from '../src/app/runtime/memory/memory-task-clients.js';

test('memory task clients use the selected memory-model client for every task', () => {
  const selectedClient = {
    capture: async () => ({}),
    describe: async () => ({}),
    summarize: async () => ({}),
    resolve: async () => ({})
  };
  const clients = createMemoryTaskClients({ memoryModelClient: selectedClient });

  assert.equal(clients.captureClient, selectedClient);
  assert.equal(clients.mediaClient, selectedClient);
  assert.equal(clients.topicClient, selectedClient);
  assert.equal(clients.queryResolver, selectedClient);
});

test('memory task clients fail explicitly instead of falling back to Gemini', async () => {
  const clients = createMemoryTaskClients();

  await assert.rejects(clients.captureClient.capture(), /configured memory model runner/i);
  await assert.rejects(clients.mediaClient.describe(), /configured memory model runner/i);
  await assert.rejects(clients.topicClient.summarize(), /configured memory model runner/i);
  await assert.rejects(clients.queryResolver.resolve(), /configured memory model runner/i);
});
