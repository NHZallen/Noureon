import assert from 'node:assert/strict';
import test from 'node:test';

import { createMediaMemoryService } from '../src/app/runtime/memory/media-memory-service.js';

test('describes fresh media once and appends only its text description to a capture turn', async () => {
  const calls = [];
  const service = createMediaMemoryService({
    mediaClient: { describe: async input => {
      calls.push(input);
      return { kind: 'video', summary: 'A cat jumps over a box.', keyFacts: ['cat', 'box'] };
    } },
    hashString: async () => 'media-hash',
    createId: () => 'media-1',
    now: () => '2026-07-11T00:00:00.000Z'
  });

  const result = await service.enrichTurns({
    conversationId: 'chat-1',
    turns: [{
      id: 'message-1', role: 'user', text: 'What is this?',
      attachments: [{ partIndex: 0, name: 'clip.mp4', mimeType: 'video/mp4', data: 'YQ==' }]
    }],
    memoryState: { mediaMemories: [] }
  });

  assert.equal(calls.length, 1);
  assert.match(result.turns[0].text, /A cat jumps over a box/);
  assert.deepEqual(result.mediaMemories, [{
    id: 'media-1', conversationId: 'chat-1', messageId: 'message-1', partIndex: 0,
    sourceHash: 'media-hash', name: 'clip.mp4', mimeType: 'video/mp4', kind: 'video',
    summary: 'A cat jumps over a box.', keyFacts: ['cat', 'box'], createdAt: '2026-07-11T00:00:00.000Z'
  }]);
});

test('reuses a cached media description without sending the original file again', async () => {
  const service = createMediaMemoryService({
    mediaClient: { describe: async () => { throw new Error('should not describe cached media'); } },
    hashString: async () => 'media-hash'
  });
  const result = await service.enrichTurns({
    conversationId: 'chat-1',
    turns: [{ id: 'message-1', text: '', attachments: [{ partIndex: 0, name: 'note.pdf', mimeType: 'application/pdf', data: 'YQ==' }] }],
    memoryState: { mediaMemories: [{ sourceHash: 'media-hash', kind: 'document', name: 'note.pdf', summary: 'A project plan.' }] }
  });

  assert.match(result.turns[0].text, /A project plan/);
  assert.deepEqual(result.mediaMemories, []);
});
