import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMessageRenderView } from '../src/app/runtime/messages/message-markup-renderer.js';
import { visionRetryOffered } from '../src/app/runtime/features/vision-retry-state.js';
import { retryVisionCheck, visionNoteSource } from '../src/app/runtime/features/vision-retry.js';
import { chatsUnderVisionCheck } from '../src/app/runtime/features/vision-check-lock.js';
import { startVisionRun } from '../src/app/runtime/server-reply/server-vision-start.js';
import { createVisionCheckScheduler } from '../src/app/runtime/features/vision-check-scheduler.js';
import { freeDecks } from '../src/app/ui/files/vision/free-decks.js';

const deckPart = (id) => ({ sandboxFile: { id, name: `${id}.pptx`, data: 'UEsDBA==' } });
const reply = { id: 'reply-1', role: 'model', parts: [{ text: 'Here are the decks.' }, deckPart('deck-a'), deckPart('deck-b')] };
const asked = { id: 'ask-1', role: 'user', parts: [{ text: 'Make two decks.' }] };
const note = (outcome, extra = {}) => ({ id: `note-${outcome}`, role: 'model', parts: [{ text: 'The visual check did not finish.' }], metadata: { visionCheck: { note: outcome, sourceMessageId: 'reply-1', fileIds: ['deck-a', 'deck-b'], ...extra } } });

test('the note of a check that failed or was stopped offers to check its files again, until a later check covers all of them', () => {
  const failed = note('failed');
  assert.equal(visionRetryOffered({ messages: [asked, reply, failed] }, failed), true);
  assert.equal(visionRetryOffered({ messages: [asked, reply, note('stopped')] }, note('stopped')), true);
  for (const outcome of ['clean', 'left']) assert.equal(visionRetryOffered({ messages: [asked, reply, note(outcome)] }, note(outcome)), false, outcome);
  assert.equal(visionRetryOffered({ messages: [asked, reply, { role: 'model', parts: [] }] }, { role: 'model', parts: [] }), false, 'not a note');
  const fixedA = { id: 'fixed-a', role: 'model', parts: [], metadata: { visionCheck: { sourceFileId: 'deck-a', sourceMessageId: 'reply-1' } } };
  assert.equal(visionRetryOffered({ messages: [asked, reply, failed, fixedA] }, failed), true, 'one of two files checked again: still offered');
  const cleanB = { id: 'clean-b', role: 'model', parts: [], metadata: { visionCheck: { note: 'clean', sourceMessageId: 'reply-1', fileIds: ['deck-b'] } } };
  assert.equal(visionRetryOffered({ messages: [asked, reply, failed, fixedA, cleanB] }, failed), false, 'both checked again');
  const otherReply = { ...cleanB, metadata: { visionCheck: { note: 'clean', sourceMessageId: 'reply-2', fileIds: ['deck-a', 'deck-b'] } } };
  assert.equal(visionRetryOffered({ messages: [asked, reply, failed, otherReply] }, failed), true, 'the same files of another reply do not count');
  const checkedHere = { ...reply, metadata: { visionChecked: ['deck-a', 'deck-b'] } };
  assert.equal(visionRetryOffered({ messages: [asked, checkedHere, failed] }, failed), false, 'checked on this page since');
  const old = { id: 'old', role: 'model', parts: [], metadata: { visionCheck: { note: 'failed' } } };
  assert.equal(visionRetryOffered({ messages: [asked, reply, old] }, old), true, 'a note written before notes named their files');
  assert.equal(visionRetryOffered({ messages: [asked, reply, old, fixedA] }, old), false, 'any later check was its retry');
  assert.equal(visionRetryOffered({ messages: [asked, reply] }, failed), false, 'a note that is not in the conversation');
});

test('the note carries the 重試 button when asked to, and no mark that a reply was redone', () => {
  const dependencies = { renderUserText: (text) => text, renderMarkdownWithFormulas: (text) => text, buildMediaAttachmentView: () => ({ html: '', previewMediaParts: [] }), formatTimestamp: () => '', copyTitle: 'Copy' };
  const texts = { autoCheckLabel: 'Redone after an automatic visual check', retryLabel: 'Retry' };
  const offered = buildMessageRenderView({ message: note('failed'), historySourceTexts: texts, visionRetry: true, ...dependencies });
  assert.match(offered.messageHTML, /<button type="button" class="vision-retry" data-vision-retry="note-failed">[\s\S]*Retry<\/button>/);
  assert.doesNotMatch(offered.messageHTML, /auto-check-note/, 'a note is not a redone reply');
  const plain = buildMessageRenderView({ message: note('failed'), historySourceTexts: texts, ...dependencies });
  assert.doesNotMatch(plain.messageHTML, /vision-retry/);
});

test('the reply a note is about: the one it names, else the last reply with a presentation before it', () => {
  const conversation = { messages: [asked, reply, note('failed')] };
  assert.equal(visionNoteSource(conversation, conversation.messages[2]), reply);
  const old = { id: 'old', role: 'model', parts: [{ text: 'x' }], metadata: { visionCheck: { note: 'failed' } } };
  assert.equal(visionNoteSource({ messages: [asked, reply, old] }, old), reply);
  assert.equal(visionNoteSource({ messages: [asked, old] }, old), null);
});

const button = (noteId) => {
  const row = { removed: false, remove() { this.removed = true; } };
  const stack = { stack: true };
  return { row, dataset: { visionRetry: noteId }, disabled: false, closest: (selector) => (selector === '.vision-retry-row' ? row : selector === '.message-stack' ? stack : null) };
};

const retryHarness = ({ plan = { ok: true }, started = { ok: true, run: { runId: 'run-7' } }, model = { id: 'seeing', provider: 'gemini' }, sees = true, replying = false, localBegins = true } = {}) => {
  const calls = { start: [], follow: [], local: [], notices: [] };
  const deps = {
    getConfig: () => ({ uiLanguage: 'en', fileModeDefault: 'standard' }),
    scheduler: { modelFor: () => model, retry: (args) => { calls.local.push(args); return localBegins; } },
    serverReply: {
      planVision: () => plan,
      startVision: async (args) => { calls.start.push(args); return started; },
      followVision: async (args) => { calls.follow.push(args); }
    },
    supportsToolCalling: () => true,
    modelSupportsVision: () => sees,
    isReplying: () => replying,
    showNotification: (text, kind) => calls.notices.push([text, kind]),
    language: 'en'
  };
  return { calls, deps };
};

test('重試 hands the files of the note to the server, which goes on when the page is closed, and follows it under the note', async () => {
  const conversation = { id: 'c1', deckDesign: 'Slate', messages: [asked, reply, note('stopped', { fileIds: ['deck-b'] })] };
  const { calls, deps } = retryHarness();
  const pressed = button('note-stopped');
  await retryVisionCheck({ button: pressed, conversation, ...deps });
  assert.equal(calls.start.length, 1);
  assert.equal(calls.start[0].source, reply);
  assert.deepEqual(calls.start[0].fileIds, ['deck-b'], 'only the files of the note');
  assert.deepEqual(calls.start[0].visionCheck, { deckDesign: 'Slate', advanced: false });
  assert.deepEqual(calls.follow[0].runId, 'run-7');
  assert.deepEqual(calls.follow[0].host, { stack: true });
  assert.equal(pressed.row.removed, true, 'the button goes once the check began');
  assert.equal(calls.local.length, 0);
});

test('重試 makes the check on this page when the server cannot (or may not), and says why when it cannot be made at all', async () => {
  const conversation = { id: 'c2', messages: [asked, reply, note('failed')] };
  const refused = retryHarness({ started: { ok: false, reason: 'unsupported_mode' } });
  await retryVisionCheck({ button: button('note-failed'), conversation, ...refused.deps });
  assert.equal(refused.calls.local.length, 1);
  assert.deepEqual(refused.calls.local[0].fileIds, ['deck-a', 'deck-b']);
  assert.equal(refused.calls.local[0].message, reply);

  const local = retryHarness({ plan: { ok: false } });
  await retryVisionCheck({ button: button('note-failed'), conversation, ...local.deps });
  assert.equal(local.calls.start.length, 0, 'a chat that is not in the cloud, or the setting says here');
  assert.equal(local.calls.local.length, 1);

  const blind = retryHarness({ sees: false });
  await retryVisionCheck({ button: button('note-failed'), conversation, ...blind.deps });
  assert.match(blind.calls.notices[0][0], /cannot see images/);
  assert.equal(blind.calls.start.length + blind.calls.local.length, 0);

  const busy = retryHarness({ replying: true });
  await retryVisionCheck({ button: button('note-failed'), conversation, ...busy.deps });
  assert.match(busy.calls.notices[0][0], /busy/);
  chatsUnderVisionCheck.add('c2');
  const checking = retryHarness();
  await retryVisionCheck({ button: button('note-failed'), conversation, ...checking.deps });
  chatsUnderVisionCheck.delete('c2');
  assert.match(checking.calls.notices[0][0], /busy/, 'a check already running in the chat');

  const gone = retryHarness();
  await retryVisionCheck({ button: button('note-failed'), conversation: { id: 'c3', messages: [asked, note('failed')] }, ...gone.deps });
  assert.match(gone.calls.notices[0][0], /could not be found/);

  const pressed = button('note-failed');
  const stuck = retryHarness({ plan: { ok: false }, localBegins: false });
  await retryVisionCheck({ button: pressed, conversation, ...stuck.deps });
  assert.equal(pressed.disabled, false, 'it can be pressed again');
  assert.equal(pressed.row.removed, false);
});

test('the server is asked with the conversation as it stood when the reply was asked for, and the files kept in the cloud', async () => {
  const begun = [];
  const conversation = { id: 'c1', messages: [{ id: 'u0', role: 'user', parts: [{ text: 'first' }] }, { id: 'm0', role: 'model', parts: [{ text: 'ok' }] }, asked, reply, note('failed')] };
  const result = await startVisionRun({
    begin: async (path, args) => { begun.push([path, args]); return { ok: true }; },
    withCloudFiles: async (messages) => messages.map((message) => ({ ...message, parts: message.parts.map((part) => ({ sandboxFile: { ...part.sandboxFile, data: { __astraCloudAsset: { path: `u/${part.sandboxFile.id}` } } } })) }))
  }, { conversation, source: reply, fileIds: ['deck-a'], modelInfo: { id: 'm' }, visionCheck: { deckDesign: 'auto', advanced: false }, uiLanguage: 'en' });
  assert.deepEqual(result, { ok: true });
  const [path, args] = begun[0];
  assert.equal(path, '/v1/runs');
  assert.deepEqual(args.conversation.messages.map((message) => message.id), ['u0', 'm0', 'ask-1'], 'up to the message the reply answered');
  assert.equal(args.requestParts, asked.parts);
  assert.equal(args.vision.source.messageId, 'reply-1');
  assert.equal(args.vision.source.text, 'Here are the decks.');
  assert.deepEqual(args.vision.source.parts.map((part) => part.sandboxFile.data), [{ __astraCloudAsset: { path: 'u/deck-a' } }, { __astraCloudAsset: { path: 'u/deck-b' } }]);
  assert.deepEqual(args.vision.source.fileIds, ['deck-a']);
  assert.match(args.assistantMessageId, /^[0-9a-f-]{36}$/);
});

test('the page\'s check asked for again looks only at the files named, and a check called off by the page leaves no note', () => {
  assert.equal(freeDecks(reply).length, 2);
  const scheduler = createVisionCheckScheduler({
    getConfig: () => ({ visionCheckEnabled: true }),
    getActiveConversation: () => null,
    normalizeConversationModel: () => ({ id: 'vision-model' }),
    isCouncilEnabled: () => false,
    modelSupportsVision: () => true,
    document: { querySelectorAll: () => [] },
    logger: { error: () => {} }
  });
  const conversation = { id: 'c9', messages: [asked, reply] };
  assert.equal(scheduler.retry({ conversation, message: reply, fileIds: ['deck-a'] }), true);
  assert.equal(scheduler.retry({ conversation, message: reply, fileIds: ['deck-a'] }), false, 'not twice at once');
  scheduler.cancel('c9');
  assert.equal(scheduler.isRunning('c9'), false);
});

test('the page\'s own check leaves the same notes as the server\'s: for a failure and for a stop by the person, not for one the page called off', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/app/ui/files/vision/vision-check.js', import.meta.url), 'utf8');
  assert.match(source, /metadata: \{ visionCheck: \{ note: outcome, sourceMessageId: message\.id, fileIds: ids \} \}/);
  assert.match(source, /await leaveNote\(visionText\(language, 'failed', \{ reason \}\), 'failed', \[file\.id\]\)/);
  assert.match(source, /else if \(controller\.signal\.reason !== 'cancelled'\) \{[\s\S]*?leaveNote\(visionText\(language, 'stopped'\), 'stopped', files\.slice\(index\)/);
  assert.match(source, /\.filter\(file => !fileIds \|\| fileIds\.includes\(file\.id\)\)/, 'a check asked for again looks only at its files');
  const scheduler = readFileSync(new URL('../src/app/runtime/features/vision-check-scheduler.js', import.meta.url), 'utf8');
  assert.match(scheduler, /jobs\.get\(conversationId\)\?\.abort\('cancelled'\)/, 'an edit calls the check off without a note');
});
